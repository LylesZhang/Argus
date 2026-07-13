import { findContentArea } from '../detect.js';
import { state } from '../state.js';
import { splitSentences } from '../utils.js';
import { DEFAULT_EMOTION_POSITIVE, DEFAULT_EMOTION_NEGATIVE, DEFAULT_EMOTION_COMPLEX } from './emotions.js';
import { DEFAULT_TRANSITION_WORDS } from './transitions.js';

const READER_ID = 'dra-immersive-reader';
const MIN_BLOCK_LENGTH = 40;

const LABEL_TYPES = new Set([
  'key-point', 'core-detail',
  'concept', 'reasoning', 'takeaway',
  'claim', 'evidence', 'counterpoint',
]);

let readerState = { theme: 'warm' };
let readerContent = { title: '', blocks: [] };
let scrollFrameId = null;
let scrollLastTime = null;
let suppressStatusMessage = false;

// Typewriter mode: tw === null means inactive.
// tw.phase: 'picking-start' | 'typing' | 'paused' | 'finished'
let tw = null;
let typeIntervalMs = speedLevelToTypeInterval(5);

function speedLevelToTypeInterval(level) {
  const safeLevel = Math.min(10, Math.max(1, Math.round(Number(level) || 5)));
  // level 1 = slow (~70ms/char), level 10 = fast (~10ms/char)
  return 70 - ((safeLevel - 1) * (60 / 9));
}

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

// ── Typewriter mode ────────────────────────────────────────────────────

function buildFlatSentences() {
  const flat = [];
  readerContent.blocks.forEach((block, blockIndex) => {
    const sentences = splitSentences(block.trim()).filter(Boolean);
    sentences.forEach((text, i) => flat.push({ text, blockIndex, isBlockStart: i === 0 }));
  });
  return flat;
}

function renderCompletedSentence(text) {
  const cls = labelClassForSentence(text);
  const muted = isFocusedSentence(text) ? '' : ' dra-reader-muted';
  return `<span class="dra-sentence${cls}${muted}">${renderInlineHighlights(text)}</span>`;
}

function renderPickStartArticle() {
  let html = '<div class="dra-tw-banner">'
    + '<div class="dra-tw-banner-main">Click any sentence to start reading from there, or '
    + '<button data-tw-action="start-beginning">Start from Beginning</button></div>'
    + '<div class="dra-tw-banner-hint">Press Space to continue, or press Space while typing to reveal the full paragraph.</div>'
    + '</div>';
  let openP = false;
  tw.flatSentences.forEach((s, i) => {
    if (s.isBlockStart) {
      if (openP) html += '</p>';
      html += '<p>';
      openP = true;
    }
    html += `<span class="dra-sentence dra-tw-pickable" data-tw-index="${i}">${escapeHTML(s.text)}</span> `;
  });
  if (openP) html += '</p>';
  return html;
}

function renderTypewriterArticle() {
  let html = '';
  let openP = false;
  for (let i = 0; i < tw.flatSentences.length && i <= tw.currentIndex; i++) {
    const s = tw.flatSentences[i];
    if (s.isBlockStart) {
      if (openP) html += '</p>';
      html += '<p>';
      openP = true;
    }
    const isCurrent = i === tw.currentIndex;
    if (!isCurrent) {
      html += renderCompletedSentence(s.text) + ' ';
    } else if (tw.phase === 'typing') {
      const partial = escapeHTML(s.text.slice(0, tw.revealedChars));
      html += `<span class="dra-sentence dra-tw-current dra-tw-typing">${partial}</span> `;
    } else {
      const cls = labelClassForSentence(s.text);
      const muted = isFocusedSentence(s.text) ? '' : ' dra-reader-muted';
      html += `<span class="dra-sentence dra-tw-current${cls}${muted}">${renderInlineHighlights(s.text)}</span> `;
    }
  }
  if (openP) html += '</p>';
  if (tw.phase === 'paused' && tw.showContinueHint) {
    html += '<div class="dra-tw-continue-hint">Space to continue</div>';
  }
  return html;
}

function renderTW() {
  const root = document.getElementById(READER_ID);
  if (!root || !tw) return;
  const body = tw.phase === 'picking-start' ? renderPickStartArticle() : renderTypewriterArticle();
  root.querySelector('.dra-reader-article').innerHTML = `
    <h1>${escapeHTML(readerContent.title)}</h1>
    ${body}
  `;
  updateProgress(root);
}

function centerCurrentLine() {
  const root = document.getElementById(READER_ID);
  if (!root) return;
  const scrollEl = root.querySelector('.dra-reader-scroll');
  const cur = root.querySelector('.dra-tw-current');
  if (!scrollEl || !cur) return;
  const containerRect = scrollEl.getBoundingClientRect();
  const curRect = cur.getBoundingClientRect();
  const delta = (curRect.top + curRect.height / 2) - (containerRect.top + containerRect.height / 2);
  scrollEl.scrollTop += delta;
}

function startTyping(index) {
  clearContinueHintTimer();
  clearInterval(tw.tickTimer);
  tw.currentIndex = index;
  tw.revealedChars = 0;
  tw.phase = 'typing';
  tw.showContinueHint = false;
  const text = tw.flatSentences[index].text;
  renderTW();
  centerCurrentLine();
  tw.tickTimer = setInterval(() => {
    tw.revealedChars++;
    if (tw.revealedChars >= text.length) {
      clearInterval(tw.tickTimer);
      tw.phase = 'paused';
      scheduleContinueHint();
    }
    renderTW();
    centerCurrentLine();
  }, typeIntervalMs);
}

function chooseStart(index) {
  const root = document.getElementById(READER_ID);
  if (root) root.querySelector('.dra-reader-scroll').classList.add('dra-tw-scroll-pad');
  tw.startIndex = index;
  startTyping(index);
}

function revealCurrentParagraph() {
  clearContinueHintTimer();
  clearInterval(tw.tickTimer);
  const current = tw.flatSentences[tw.currentIndex];
  while (
    tw.currentIndex + 1 < tw.flatSentences.length &&
    tw.flatSentences[tw.currentIndex + 1].blockIndex === current.blockIndex
  ) {
    tw.currentIndex++;
  }
  tw.revealedChars = tw.flatSentences[tw.currentIndex].text.length;
  tw.phase = 'paused';
  tw.showContinueHint = false;
  scheduleContinueHint();
  renderTW();
  centerCurrentLine();
}

function clearContinueHintTimer() {
  if (tw?.continueHintTimer) clearTimeout(tw.continueHintTimer);
  if (tw) tw.continueHintTimer = null;
}

function scheduleContinueHint() {
  clearContinueHintTimer();
  if (!tw || tw.currentIndex + 1 >= tw.flatSentences.length) return;
  tw.continueHintTimer = setTimeout(() => {
    if (!tw || tw.phase !== 'paused') return;
    tw.showContinueHint = true;
    renderTW();
  }, 2000);
}

function handleSpace() {
  if (!tw) return;
  if (tw.phase === 'picking-start') { chooseStart(0); return; }
  if (tw.phase === 'typing') { revealCurrentParagraph(); return; }
  if (tw.phase === 'paused') {
    clearContinueHintTimer();
    tw.showContinueHint = false;
    if (tw.currentIndex + 1 < tw.flatSentences.length) {
      startTyping(tw.currentIndex + 1);
    } else {
      tw.phase = 'finished';
      renderTW();
    }
  }
}

export function setTypewriterActive(active) {
  const root = document.getElementById(READER_ID);
  if (!root) return;
  const scrollEl = root.querySelector('.dra-reader-scroll');
  if (active && !tw) {
    tw = {
      phase: 'picking-start',
      flatSentences: buildFlatSentences(),
      startIndex: null,
      currentIndex: -1,
      revealedChars: 0,
      tickTimer: null,
      continueHintTimer: null,
      showContinueHint: false,
    };
    renderTW();
    updateReaderAutoScroll(root);
  } else if (!active && tw) {
    clearInterval(tw.tickTimer);
    clearContinueHintTimer();
    tw = null;
    scrollEl.classList.remove('dra-tw-scroll-pad');
    root.querySelector('.dra-reader-article').innerHTML = `
      <h1>${escapeHTML(readerContent.title)}</h1>
      ${renderArticleHTML()}
    `;
    updateProgress(root);
    updateReaderAutoScroll(root);
  }
}

export function setTypewriterSpeed(level) {
  typeIntervalMs = speedLevelToTypeInterval(level);
}

export function startTypewriterFromBeginning() {
  const root = document.getElementById(READER_ID);
  if (!root) return;
  const scrollEl = root.querySelector('.dra-reader-scroll');
  if (!tw) {
    tw = {
      phase: 'picking-start',
      flatSentences: buildFlatSentences(),
      startIndex: null,
      currentIndex: -1,
      revealedChars: 0,
      tickTimer: null,
      continueHintTimer: null,
      showContinueHint: false,
    };
    scrollEl?.classList.add('dra-tw-scroll-pad');
  }
  root.querySelector('[data-reader-action="typewriter"]')?.classList.add('active');
  updateReaderAutoScroll(root);
  chooseStart(0);
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
  root.style.setProperty('--dra-label-key-point', state.settings.labelKeyPointColor);
  root.style.setProperty('--dra-label-core-detail', state.settings.labelCoreDetailColor);
  root.style.setProperty('--dra-label-concept', state.settings.labelConceptColor);
  root.style.setProperty('--dra-label-reasoning', state.settings.labelReasoningColor);
  root.style.setProperty('--dra-label-takeaway', state.settings.labelTakeawayColor);
  root.style.setProperty('--dra-label-claim', state.settings.labelClaimColor);
  root.style.setProperty('--dra-label-evidence', state.settings.labelEvidenceColor);
  root.style.setProperty('--dra-label-counterpoint', state.settings.labelCounterpointColor);

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
  if (e.key === 'Escape') { closeImmersiveReader(); return; }
  if (e.key === ' ' && tw) {
    e.preventDefault();
    handleSpace();
  }
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
  if (tw) return;
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
  if (tw) {
    const total = tw.flatSentences.length;
    let progress = 0;
    if (tw.phase === 'finished') {
      progress = 1;
    } else if (total > 0 && tw.currentIndex >= 0) {
      progress = (tw.currentIndex + 1) / total;
    }
    root.style.setProperty('--dra-reader-progress', `${Math.min(1, Math.max(0, progress)) * 100}%`);
    return;
  }
  const scrollEl = root.querySelector('.dra-reader-scroll');
  if (!scrollEl) return;
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
  root.querySelector('.dra-reader-article').addEventListener('click', (e) => {
    if (!tw) return;
    if (e.target.closest('[data-tw-action="start-beginning"]')) { chooseStart(0); return; }
    if (tw.phase === 'picking-start') {
      const el = e.target.closest('[data-tw-index]');
      if (el) chooseStart(Number(el.dataset.twIndex));
    }
  });
  scrollEl.addEventListener('scroll', () => updateProgress(root));
  root.addEventListener('mousemove', updateReaderRuler);
}

export function refreshImmersiveReader() {
  const root = document.getElementById(READER_ID);
  if (!root) return;
  if (tw) {
    renderTW();
    applyReaderStyle(root);
    return;
  }
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
  tw = null;

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
  if (tw) {
    clearInterval(tw.tickTimer);
    clearContinueHintTimer();
    tw = null;
  }
  stopReaderAutoScroll();
  const hadReader = Boolean(document.getElementById(READER_ID));
  document.getElementById(READER_ID)?.remove();
  document.documentElement.classList.remove('dra-reader-open');
  document.removeEventListener('keydown', onKeydown);
  if (hadReader && !suppressStatusMessage) notifyReaderStatus(false);
}
