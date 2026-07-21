import { splitSentences } from '../utils.js';
import { matchEmotionWords } from './emotions.js';
import { DEFAULT_TRANSITION_WORDS } from './transitions.js';
import { applyBionicToText } from './bionic.js';
import { injectOpenDyslexicFont } from './typography.js';
import { toEmSpacing } from '../styleValues.mjs';

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSentenceText(sentence, settings, emotionHighlights, transitionWords) {
  const lower = sentence.toLowerCase();
  const spans = [];

  if (settings.emotionColor) {
    for (const { word, category } of emotionHighlights) {
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`(?<![a-zA-Z-])${esc}(?![a-zA-Z-])`, 'gi');
      for (const m of lower.matchAll(rx)) {
        spans.push({ start: m.index, end: m.index + m[0].length, cls: `dra-pe-${category}` });
      }
    }
  }
  if (settings.transitionAnimation) {
    for (const word of transitionWords) {
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`(?<![a-zA-Z-])${esc}(?![a-zA-Z-])`, 'gi');
      for (const m of lower.matchAll(rx)) {
        spans.push({ start: m.index, end: m.index + m[0].length, cls: 'dra-transition-word' });
      }
    }
  }

  if (!spans.length) {
    return settings.boldBeginning ? applyBionicToText(sentence) : escapeHTML(sentence);
  }

  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const deduped = [];
  let last = 0;
  for (const sp of spans) {
    if (sp.start >= last) { deduped.push(sp); last = sp.end; }
  }

  const inline = s => settings.boldBeginning ? applyBionicToText(s) : escapeHTML(s);
  let result = '';
  let pos = 0;
  for (const { start, end, cls } of deduped) {
    if (pos < start) result += inline(sentence.slice(pos, start));
    result += `<span class="${cls}">${inline(sentence.slice(start, end))}</span>`;
    pos = end;
  }
  if (pos < sentence.length) result += inline(sentence.slice(pos));
  return result;
}

// Render all blocks of a sample article into HTML, applying draft settings.
// externalLabels/externalEmotions: pass AI-generated results to override local matching.
export function renderPreviewArticle(article, settings, wordLists, { externalEmotions, externalLabels } = {}) {
  const { blocks } = article;

  // Lens is AI-only: preview uses the article's pre-computed static labels.
  const finalLabels = (settings.sentenceLabels && externalLabels) ? externalLabels : [];

  const useAIEmotion = settings.emotionColor && settings.emotionMode === 'ai' && externalEmotions;
  const emotionHighlights = useAIEmotion
    ? externalEmotions
    : settings.emotionColor
      ? matchEmotionWords(blocks.join(' '), wordLists)
      : [];

  const transitionWords = settings.transitionAnimation
    ? (wordLists.transition ?? DEFAULT_TRANSITION_WORDS)
    : [];

  const LABEL_TYPES = new Set([
    'key-point','core-detail','concept','reasoning','takeaway',
    'claim','evidence','counterpoint',
  ]);

  let sIdx = 0;
  const paragraphs = blocks.map((block, blockIdx) => {
    const sentences = splitSentences(block.trim()).filter(Boolean);
    const html = sentences.map(sentence => {
      const labelEntry = finalLabels.find(l => l.index === sIdx);
      const labelCls = (labelEntry && LABEL_TYPES.has(labelEntry.type))
        ? ` dra-label-${labelEntry.type}`
        : '';
      sIdx++;
      const inner = renderSentenceText(sentence, settings, emotionHighlights, transitionWords);
      return `<span class="dra-sentence${labelCls}">${inner}</span>`;
    }).join(' ');

    // Insert image placeholder after first paragraph for Reader Mode demo
    const imgPlaceholder = (article.imagePlaceholders ?? []).find(p => p.position === blockIdx);
    const imgHtml = imgPlaceholder
      ? `<div class="dra-pe-img-placeholder">📷 <em>${escapeHTML(imgPlaceholder.caption)}</em></div>`
      : '';
    return `<p>${html}</p>${imgHtml}`;
  });

  return paragraphs.join('');
}

// Manage ruler wrap visibility only — position is set separately via updateRulerPosition.
function updateRulerOverlay(container, show) {
  let wrap = container.querySelector('.dra-pe-ruler-wrap');
  if (!show) { wrap?.remove(); return; }
  if (wrap) return;
  wrap = document.createElement('div');
  wrap.className = 'dra-pe-ruler-wrap';
  wrap.innerHTML = `
    <div class="dra-pe-ruler-top"></div>
    <div class="dra-pe-ruler-window"></div>
    <div class="dra-pe-ruler-bottom"></div>`;
  container.appendChild(wrap);
}

// Update ruler position — called both from mousemove and for initial center placement.
// Uses absolute pixel heights from wrap.clientHeight to avoid any CSS class conflicts.
export function updateRulerPosition(container, localY, halfWin) {
  const wrap = container.querySelector('.dra-pe-ruler-wrap');
  if (!wrap) return;
  // translateY keeps the ruler anchored to the visible viewport even when content scrolls
  wrap.style.transform = `translateY(${container.scrollTop || 0}px)`;
  const totalH  = container.clientHeight || 400;
  const topH    = Math.max(0, Math.min(localY - halfWin, totalH));
  const winH    = Math.min(halfWin * 2, totalH - topH);
  const botT    = topH + winH;
  const botH    = Math.max(0, totalH - botT);

  wrap.querySelector('.dra-pe-ruler-top').style.cssText =
    `position:absolute;left:0;right:0;top:0;height:${topH}px;background:rgba(0,0,0,0.38)`;
  wrap.querySelector('.dra-pe-ruler-window').style.cssText =
    `position:absolute;left:0;right:0;top:${topH}px;height:${winH}px;`
    + `background:rgba(255,243,180,0.18);`
    + `border-top:1px solid rgba(200,170,0,0.3);border-bottom:1px solid rgba(200,170,0,0.3)`;
  wrap.querySelector('.dra-pe-ruler-bottom').style.cssText =
    `position:absolute;left:0;right:0;top:${botT}px;height:${botH}px;background:rgba(0,0,0,0.38)`;
}

// Apply CSS custom-property variables and visual state to the preview container.
export function applyPreviewStyles(container, settings, actions = {}) {
  const s = settings;

  // Emotion/transition/label colors as CSS custom properties
  container.style.setProperty('--dra-positive',   s.emotionPositiveColor ?? '#27ae60');
  container.style.setProperty('--dra-negative',   s.emotionNegativeColor ?? '#e74c3c');
  container.style.setProperty('--dra-complex',    s.emotionComplexColor  ?? '#8e44ad');
  container.style.setProperty('--dra-row-shading', s.rowShadingColor ?? '#bfb3d0');

  const labelColors = {
    'key-point':     s.labelKeyPointColor    ?? '#eab308',
    'core-detail':   s.labelCoreDetailColor  ?? '#3b82f6',
    'concept':       s.labelConceptColor     ?? '#9333ea',
    'reasoning':     s.labelReasoningColor   ?? '#f97316',
    'takeaway':      s.labelTakeawayColor    ?? '#0d9488',
    'claim':         s.labelClaimColor       ?? '#ca8a04',
    'evidence':      s.labelEvidenceColor    ?? '#22c55e',
    'counterpoint':  s.labelCounterpointColor ?? '#e11d48',
  };
  for (const [key, val] of Object.entries(labelColors)) {
    container.style.setProperty(`--dra-label-${key}`, val);
  }

  const article = container.querySelector('.dra-pe-article');
  if (!article) return;

  // Typography
  if (s.fontFamily?.includes('OpenDyslexic')) {
    injectOpenDyslexicFont();
  }
  article.style.fontFamily    = s.fontFamily    ? s.fontFamily         : '';
  article.style.fontSize      = s.fontSize      ? `${s.fontSize}px`    : '';
  article.style.lineHeight    = s.lineHeight    ? String(s.lineHeight) : '';
  article.style.wordSpacing   = toEmSpacing(s.wordSpacing);
  article.style.letterSpacing = toEmSpacing(s.letterSpacing);
  // Reader Mode overrides typography color and background
  const isReaderMode = Boolean(actions?.autoOpenReaderMode);
  article.style.color      = (s.fontColor && !isReaderMode) ? s.fontColor : '';
  article.style.background = (s.bgColor   && !isReaderMode) ? s.bgColor   : '';

  // Row shading
  container.classList.toggle('dra-pe-row-shading', Boolean(s.gradientRows));

  // Reading ruler: only manage visibility here; position is handled by presetEditor
  updateRulerOverlay(container, Boolean(s.rulerActive));

  // Reader Mode preview: hide image placeholders, change background
  container.classList.toggle('dra-pe-reader-mode-on', isReaderMode);
  container.style.background = isReaderMode ? '#f4f0e7' : '';
}
