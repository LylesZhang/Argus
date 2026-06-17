import { state } from './state.js';
import { findContentArea } from './detect.js';
import { injectOpenDyslexicFont } from './features/typography.js';
import { applyBionicToText } from './features/bionic.js';
import { generateEmotionHighlights, requestEmotionAnalysis } from './features/emotions.js';
import { generateTransitionHighlights } from './features/transitions.js';
import { extractAllSentences, generateSentenceLabels, requestSentenceLabels } from './features/labels.js';
import { setupRuler, teardownRuler } from './features/ruler.js';
import { applyFocusMask, applyFocusMaskByPrefixes } from './features/topicFocus.js';

// ── Sentence rendering ─────────────────────────────────────────────────

// Returns true if the element contains non-text nodes that innerText can't
// capture, making it unsafe to replace innerHTML with buildParagraphHTML output.
function hasEmbeddedContent(el) {
  if (el.querySelector('img, svg, picture, video, audio, canvas, iframe, input, button, select')) return true;
  for (const child of el.querySelectorAll('i, span, a, em')) {
    if (!child.textContent.trim()) return true;
  }
  return false;
}

function renderSentence(s) {
  const matches = [];
  for (const h of state.articleHighlights) {
    if (h.context) {
      const normS   = s.replace(/\s+/g, ' ').toLowerCase();
      const normCtx = h.context.replace(/\*+/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
      if (normCtx && !normS.includes(normCtx)) continue;
    }
    const escaped = h.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![a-zA-Z-])${escaped}(?![a-zA-Z-])`, 'i');
    const m = regex.exec(s);
    if (m) matches.push({ start: m.index, end: m.index + m[0].length, h });
  }

  matches.sort((a, b) => a.start - b.start);
  const deduped = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) { deduped.push(m); lastEnd = m.end; }
  }

  const bionic = (t) => state.settings.boldBeginning ? applyBionicToText(t) : t;

  if (deduped.length === 0) return bionic(s);

  let result = '';
  let pos = 0;
  for (const { start, end, h } of deduped) {
    if (pos < start) result += bionic(s.slice(pos, start));
    const inner = bionic(s.slice(start, end));
    if (state.settings.transitionAnimation && h.category === 'transition') {
      result += `<span class="dra-transition-word">${inner}</span>`;
    } else if (state.settings.emotionColor && h.category.startsWith('emotion')) {
      result += `<span class="dra-${h.category}">${inner}</span>`;
    } else {
      result += inner;
    }
    pos = end;
  }
  if (pos < s.length) result += bionic(s.slice(pos));
  return result;
}

function buildParagraphHTML(plainText) {
  const sentences = plainText.trim().split(/(?<=[.!?])\s+(?=[A-Z"'\[])/) ;

  const badge = (s) => {
    if (!state.settings.sentenceLabels) return '';
    const trimmed = s.trim();
    const idx   = state.allSentences.findIndex(as => as.slice(0, 25) === trimmed.slice(0, 25));
    const label = state.sentenceLabels.find(l => l.index === idx);
    return label
      ? `<span class="dra-label dra-label-${label.type}">${label.type.toUpperCase()}</span>`
      : '';
  };

  if (state.settings.gradientRows) {
    return sentences.map((s, i) => {
      const cls = i % 2 === 0 ? 'dra-row-even' : 'dra-row-odd';
      return `<div class="dra-sentence ${cls}">${renderSentence(s)}${badge(s)}</div>`;
    }).join('');
  }

  return sentences.map(s =>
    `<span class="dra-sentence">${renderSentence(s)}${badge(s)}</span>`
  ).join(' ');
}

// ── DOM transformations ────────────────────────────────────────────────

function applyTransformations() {
  state.contentArea = findContentArea();

  // Expose emotion colors as CSS variables so content.css can use them
  document.documentElement.style.setProperty('--dra-positive', state.settings.emotionPositiveColor);
  document.documentElement.style.setProperty('--dra-negative', state.settings.emotionNegativeColor);
  document.documentElement.style.setProperty('--dra-complex',  state.settings.emotionComplexColor);

  // Apply per-element styles (child elements often override contentArea-level styles)
  state.contentArea.querySelectorAll('p, li, blockquote').forEach(para => {
    if (para.innerText.trim().length < 20) return;

    if (state.settings.typographyEnabled) {
      injectOpenDyslexicFont();
      if (state.settings.fontSize)      para.style.fontSize     = state.settings.fontSize + 'px';
      if (state.settings.lineHeight)    para.style.lineHeight   = String(state.settings.lineHeight);
      if (state.settings.fontFamily)    para.style.fontFamily   = state.settings.fontFamily;
      if (state.settings.wordSpacing)   para.style.wordSpacing   = state.settings.wordSpacing + 'em';
      if (state.settings.letterSpacing) para.style.letterSpacing = state.settings.letterSpacing + 'em';
      if (state.settings.fontColor)     para.style.color         = state.settings.fontColor;
    }

    const needsSentenceWrap = state.settings.boldBeginning || state.settings.emotionColor ||
                              state.settings.gradientRows  || state.settings.transitionAnimation ||
                              state.settings.sentenceLabels;
    const shouldWrap = (state.settings.readingAidsEnabled && needsSentenceWrap) ||
                       state.topicFocusKeywords !== null ||
                       state.topicFocusAIPrefixes !== null;
    if (shouldWrap && !hasEmbeddedContent(para)) {
      if (!state.originalHTML.has(para)) state.originalHTML.set(para, para.innerHTML);
      para.innerHTML = buildParagraphHTML(para.innerText);
    }
  });

  if (state.settings.typographyEnabled && state.settings.bgColor) {
    state.contentArea.style.background = state.settings.bgColor;
  }

  if (state.settings.readingAidsEnabled && state.settings.rulerActive) setupRuler();
  else teardownRuler();
}

function removeTransformations() {
  if (!state.contentArea) return;

  state.contentArea.querySelectorAll('p, li, blockquote').forEach(para => {
    if (state.originalHTML.has(para)) para.innerHTML = state.originalHTML.get(para);
    ['fontSize', 'lineHeight', 'fontFamily', 'wordSpacing', 'letterSpacing', 'color'].forEach(prop => {
      para.style[prop] = '';
    });
  });

  state.contentArea.style.background = '';
  teardownRuler();
}

// ── Render coordinator ─────────────────────────────────────────────────

export function render() {
  removeTransformations();

  if (state.settings.readingAidsEnabled) {
    const transitionHL = state.settings.transitionAnimation ? generateTransitionHighlights() : [];
    const emotionHL    = !state.settings.emotionColor ? [] :
      state.settings.emotionMode === 'local' ? generateEmotionHighlights() : state.aiEmotionHighlights;
    state.articleHighlights = [...emotionHL, ...transitionHL];

    if (state.settings.sentenceLabels) {
      state.allSentences = extractAllSentences();
      if (state.settings.sentenceLabelsMode === 'local') {
        state.sentenceLabels = generateSentenceLabels();
      } else {
        state.sentenceLabels = state.aiSentenceLabels;
      }
    }

    const needsEmotionAI = state.settings.emotionColor  && state.settings.emotionMode       === 'ai';
    const needsLabelsAI  = state.settings.sentenceLabels && state.settings.sentenceLabelsMode === 'ai';
    if (needsEmotionAI) requestEmotionAnalysis();
    if (needsLabelsAI)  requestSentenceLabels();
  }

  if (state.settings.typographyEnabled || state.settings.readingAidsEnabled ||
      state.topicFocusKeywords || state.topicFocusAIPrefixes) {
    applyTransformations();
  }
  if (state.topicFocusKeywords) {
    applyFocusMask(state.topicFocusKeywords);
  } else if (state.topicFocusAIPrefixes) {
    applyFocusMaskByPrefixes(state.topicFocusAIPrefixes);
  }
}
