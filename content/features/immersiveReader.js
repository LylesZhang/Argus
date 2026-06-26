import { findContentArea } from '../detect.js';
import { state } from '../state.js';
import { splitSentences } from '../utils.js';
import { DEFAULT_EMOTION_POSITIVE, DEFAULT_EMOTION_NEGATIVE, DEFAULT_EMOTION_COMPLEX } from './emotions.js';
import { DEFAULT_TRANSITION_WORDS } from './transitions.js';

const READER_ID = 'dra-immersive-reader';
const MIN_BLOCK_LENGTH = 40;

const LABEL_TYPES = new Set([
  'core-fact', 'context', 'quote',
  'concept', 'mechanism', 'constraint',
  'thesis', 'evidence', 'explanation',
  'dialogue', 'plot-turn', 'setting',
]);

let readerState = { theme: 'warm' };
let readerContent = { title: '', blocks: [] };
let scrollFrameId = null;
let scrollLastTime = null;
let suppressStatusMessage = false;

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function bionicN(len) {
  if (len <= 3) return 1;
  if (len <= 6) return 2;
  if (len <= 9) return 3;
  return 4;
}

function bionicReaderText(text) {
  return text.split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok)) return tok;
    const leading  = tok.match(/^[^a-zA-Z]*/)[0];
    const trailing = tok.match(/[^a-zA-Z]*$/)[0];
    const body     = tok.slice(leading.length, tok.length - trailing.length);
    if (!body) return escapeHTML(tok);
    const n = bionicN(body.length);
    const anchor = body.slice(0, n);
    const rest = body.slice(n);
    const inner = rest.length <= 1
      ? `<b>${escapeHTML(anchor)}</b>${escapeHTML(rest)}`
      : `<b>${escapeHTML(anchor)}</b><span class="dra-bionic-fade">${escapeHTML(rest[0])}</span>${escapeHTML(rest.slice(1))}`;
    return `${escapeHTML(leading)}${inner}${escapeHTML(trailing)}`;
  }).join('');
}

function extractReaderContent() {
  const area = findContentArea();
  const title = document.querySelector('h1')?.innerText?.trim() || document.title || 'Untitled';
  const seen = new Set();
  const blocks = [...area.querySelectorAll('p, li, blockquote')]
    .map(el => el.innerText.replace(/\s+/g, ' ').trim())
    .filter(text => text.length >= MIN_BLOCK_LENGTH)
    .filter(text => {
      const key = text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (blocks.length === 0) {
    const fallback = area.innerText
      .split(/\n{2,}/)
      .map(text => text.replace(/\s+/g, ' ').trim())
      .filter(text => text.length >= MIN_BLOCK_LENGTH);
    return { title, blocks: fallback };
  }

  return { title, blocks };
}

function wordsForCategory(category) {
  if (category === 'emotion-positive') return state.wordLists.emotionPositive ?? DEFAULT_EMOTION_POSITIVE;
  if (category === 'emotion-negative') return state.wordLists.emotionNegative ?? DEFAULT_EMOTION_NEGATIVE;
  if (category === 'emotion-complex') return state.wordLists.emotionComplex ?? DEFAULT_EMOTION_COMPLEX;
  if (category === 'transition') return state.wordLists.transition ?? DEFAULT_TRANSITION_WORDS;
  return [];
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectMatches(text) {
  if (!state.settings.readingAidsEnabled) return [];
  const matches = [];
  const featureSets = [];
  if (state.settings.emotionColor) {
    if (state.settings.emotionMode === 'local') {
      featureSets.push(['emotion-positive', wordsForCategory('emotion-positive')]);
      featureSets.push(['emotion-negative', wordsForCategory('emotion-negative')]);
      featureSets.push(['emotion-complex', wordsForCategory('emotion-complex')]);
    } else {
      const grouped = new Map();
      state.aiEmotionHighlights.forEach(h => {
        if (!grouped.has(h.category)) grouped.set(h.category, []);
        grouped.get(h.category).push(h.word);
      });
      grouped.forEach((words, category) => featureSets.push([category, words]));
    }
  }
  if (state.settings.transitionAnimation) {
    featureSets.push(['transition', wordsForCategory('transition')]);
  }

  featureSets.forEach(([category, words]) => {
    words.forEach(word => {
      if (!word) return;
      const regex = new RegExp(`(?<![a-zA-Z-])${escapeRegex(word)}(?![a-zA-Z-])`, 'gi');
      for (const m of text.matchAll(regex)) {
        matches.push({ start: m.index, end: m.index + m[0].length, category });
      }
    });
  });
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const result = [];
  let lastEnd = 0;
  matches.forEach(m => {
    if (m.start >= lastEnd) {
      result.push(m);
      lastEnd = m.end;
    }
  });
  return result;
}

function inlineText(text) {
  return state.settings.boldBeginning ? bionicReaderText(text) : escapeHTML(text);
}

function renderInlineHighlights(text) {
  const matches = collectMatches(text);
  if (matches.length === 0) return inlineText(text);

  let result = '';
  let pos = 0;
  matches.forEach(({ start, end, category }) => {
    if (pos < start) result += inlineText(text.slice(pos, start));
    const inner = inlineText(text.slice(start, end));
    if (category === 'transition') {
      result += `<span class="dra-transition-word">${inner}</span>`;
    } else if (category.startsWith('emotion')) {
      result += `<span class="dra-${category}">${inner}</span>`;
    } else {
      result += inner;
    }
    pos = end;
  });
  if (pos < text.length) result += inlineText(text.slice(pos));
  return result;
}

function labelClassForSentence(sentence) {
  if (!state.settings.readingAidsEnabled || !state.settings.sentenceLabels) return '';
  const trimmed = sentence.trim();
  const sentenceIndex = state.allSentences.findIndex(as => as.slice(0, 25) === trimmed.slice(0, 25));
  const label = state.sentenceLabels.find(l => l.index === sentenceIndex);
  return LABEL_TYPES.has(label?.type) ? ` dra-label-${label.type}` : '';
}

function isFocusedSentence(sentence) {
  if (state.topicFocusKeywords) {
    const text = sentence.toLowerCase();
    return state.topicFocusKeywords.some(keyword => text.includes(keyword));
  }
  if (state.topicFocusAIPrefixes) {
    const prefix = sentence.trim().slice(0, 30);
    return state.topicFocusAIPrefixes.some(p => prefix.startsWith(p.slice(0, 25)));
  }
  return true;
}

function renderArticleHTML() {
  if (!readerContent.blocks.length) {
    return '<p>Argus could not find enough readable text on this page.</p>';
  }
  return readerContent.blocks.map(block => {
    const sentences = splitSentences(block.trim()).filter(Boolean);
    const html = sentences.map(sentence => {
      const cls = labelClassForSentence(sentence);
      const muted = isFocusedSentence(sentence) ? '' : ' dra-reader-muted';
      return `<span class="dra-sentence${cls}${muted}">${renderInlineHighlights(sentence)}</span>`;
    }).join(' ');
    return `<p>${html}</p>`;
  }).join('');
}

function applyReaderStyle(root) {
  if (!root) return;
  const article = root.querySelector('.dra-reader-article');
  root.dataset.theme = readerState.theme;
  root.style.setProperty('--dra-positive', state.settings.emotionPositiveColor);
  root.style.setProperty('--dra-negative', state.settings.emotionNegativeColor);
  root.style.setProperty('--dra-complex', state.settings.emotionComplexColor);
  root.style.setProperty('--dra-row-shading', state.settings.rowShadingColor);
  root.style.setProperty('--dra-label-core-fact', state.settings.labelCoreFactColor);
  root.style.setProperty('--dra-label-context', state.settings.labelContextColor);
  root.style.setProperty('--dra-label-quote', state.settings.labelQuoteColor);
  root.style.setProperty('--dra-label-concept', state.settings.labelConceptColor);
  root.style.setProperty('--dra-label-mechanism', state.settings.labelMechanismColor);
  root.style.setProperty('--dra-label-constraint', state.settings.labelConstraintColor);
  root.style.setProperty('--dra-label-thesis', state.settings.labelThesisColor);
  root.style.setProperty('--dra-label-evidence', state.settings.labelEvidenceColor);
  root.style.setProperty('--dra-label-explanation', state.settings.labelExplanationColor);
  root.style.setProperty('--dra-label-dialogue', state.settings.labelDialogueColor);
  root.style.setProperty('--dra-label-plot-turn', state.settings.labelPlotTurnColor);
  root.style.setProperty('--dra-label-setting', state.settings.labelSettingColor);

  article.style.fontSize = state.settings.typographyEnabled && state.settings.fontSize ? `${state.settings.fontSize}px` : '';
  article.style.lineHeight = state.settings.typographyEnabled && state.settings.lineHeight ? String(state.settings.lineHeight) : '';
  article.style.fontFamily = state.settings.typographyEnabled && state.settings.fontFamily ? state.settings.fontFamily : '';
  article.style.wordSpacing = state.settings.typographyEnabled && state.settings.wordSpacing ? `${state.settings.wordSpacing}em` : '';
  article.style.letterSpacing = state.settings.typographyEnabled && state.settings.letterSpacing ? `${state.settings.letterSpacing}em` : '';
  article.style.color = '';
  article.style.background = '';
  root.classList.toggle('dra-reader-row-shading', Boolean(state.settings.readingAidsEnabled && state.settings.gradientRows));
  root.classList.toggle('dra-reader-ruler-active', Boolean(state.settings.readingAidsEnabled && state.settings.rulerActive));

  root.querySelectorAll('[data-reader-theme]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.readerTheme === readerState.theme);
  });
  updateReaderRuler({ clientY: state.lastRulerY ?? window.innerHeight / 2 });
  updateProgress(root);
  updateReaderAutoScroll(root);
}

function onKeydown(e) {
  if (e.key === 'Escape') closeImmersiveReader();
}

function notifyReaderStatus(active) {
  chrome.runtime.sendMessage({ type: 'IMMERSIVE_READER_STATUS', active });
}

function speedLevelToPixelsPerSecond(level) {
  const safeLevel = Math.min(10, Math.max(1, Math.round(Number(level) || 2)));
  return 15 + ((safeLevel - 1) * (165 / 9));
}

function stopReaderAutoScroll() {
  if (scrollFrameId !== null) cancelAnimationFrame(scrollFrameId);
  scrollFrameId = null;
  scrollLastTime = null;
}

function updateReaderAutoScroll(root) {
  stopReaderAutoScroll();
  if (!state.settings.readingAidsEnabled || !state.settings.autoScrollActive) return;
  const scrollEl = root.querySelector('.dra-reader-scroll');
  const speed = speedLevelToPixelsPerSecond(state.settings.autoScrollSpeed);
  const tick = timestamp => {
    if (scrollLastTime === null) scrollLastTime = timestamp;
    const elapsedSeconds = (timestamp - scrollLastTime) / 1000;
    scrollLastTime = timestamp;
    scrollEl.scrollTop += speed * elapsedSeconds;
    scrollFrameId = requestAnimationFrame(tick);
  };
  scrollFrameId = requestAnimationFrame(tick);
}

function updateProgress(root = document.getElementById(READER_ID)) {
  if (!root) return;
  const scrollEl = root.querySelector('.dra-reader-scroll');
  const max = scrollEl.scrollHeight - scrollEl.clientHeight;
  const progress = max <= 0 ? 1 : scrollEl.scrollTop / max;
  root.style.setProperty('--dra-reader-progress', `${Math.min(1, Math.max(0, progress)) * 100}%`);
}

function updateReaderRuler(e) {
  const root = document.getElementById(READER_ID);
  if (!root) return;
  state.lastRulerY = e.clientY;
  const halfH = Math.round(16 * 1.8 * state.settings.rulerWindowLines / 2);
  root.querySelector('.dra-reader-ruler-top').style.height = Math.max(0, e.clientY - halfH) + 'px';
  root.querySelector('.dra-reader-ruler-bottom').style.top = (e.clientY + halfH) + 'px';
  root.querySelector('.dra-reader-ruler-window').style.top = Math.max(0, e.clientY - halfH) + 'px';
  root.querySelector('.dra-reader-ruler-window').style.height = (halfH * 2) + 'px';
}

function wireReader(root) {
  const scrollEl = root.querySelector('.dra-reader-scroll');
  root.querySelector('[data-reader-action="close"]').addEventListener('click', closeImmersiveReader);
  root.querySelectorAll('[data-reader-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      readerState.theme = btn.dataset.readerTheme;
      applyReaderStyle(root);
    });
  });
  scrollEl.addEventListener('scroll', () => updateProgress(root));
  root.addEventListener('mousemove', updateReaderRuler);
}

export function refreshImmersiveReader() {
  const root = document.getElementById(READER_ID);
  if (!root) return;
  root.querySelector('.dra-reader-article').innerHTML = `
    <h1>${escapeHTML(readerContent.title)}</h1>
    ${renderArticleHTML()}
  `;
  applyReaderStyle(root);
}

export function openImmersiveReader() {
  suppressStatusMessage = true;
  closeImmersiveReader();
  suppressStatusMessage = false;
  readerContent = extractReaderContent();
  readerState = { theme: 'warm' };

  const root = document.createElement('div');
  root.id = READER_ID;
  root.innerHTML = `
    <div class="dra-reader-shell">
      <header class="dra-reader-topbar">
        <div>
          <div class="dra-reader-brand">Argus Reader</div>
          <div class="dra-reader-meta">${readerContent.blocks.length} paragraphs</div>
        </div>
        <div class="dra-reader-actions">
          <button class="dra-reader-theme-btn dra-reader-theme-light" data-reader-theme="light">Light</button>
          <button class="dra-reader-theme-btn dra-reader-theme-warm" data-reader-theme="warm">Warm</button>
          <button class="dra-reader-theme-btn dra-reader-theme-dark" data-reader-theme="dark">Dark</button>
          <button class="dra-reader-close" data-reader-action="close" aria-label="Close">×</button>
        </div>
        <div class="dra-reader-progress" aria-hidden="true"></div>
      </header>

      <main class="dra-reader-scroll">
        <article class="dra-reader-article">
          <h1>${escapeHTML(readerContent.title)}</h1>
          ${renderArticleHTML()}
        </article>
      </main>
      <div class="dra-reader-ruler-top" aria-hidden="true"></div>
      <div class="dra-reader-ruler-window" aria-hidden="true"></div>
      <div class="dra-reader-ruler-bottom" aria-hidden="true"></div>
    </div>
  `;

  document.body.appendChild(root);
  document.documentElement.classList.add('dra-reader-open');
  wireReader(root);
  applyReaderStyle(root);
  document.addEventListener('keydown', onKeydown);
  notifyReaderStatus(true);
}

export function closeImmersiveReader() {
  stopReaderAutoScroll();
  const hadReader = Boolean(document.getElementById(READER_ID));
  document.getElementById(READER_ID)?.remove();
  document.documentElement.classList.remove('dra-reader-open');
  document.removeEventListener('keydown', onKeydown);
  if (hadReader && !suppressStatusMessage) notifyReaderStatus(false);
}
