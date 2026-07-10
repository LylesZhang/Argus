import { state } from './state.js';
import { findContentArea } from './detect.js';
import { splitSentences } from './utils.js';
import { injectOpenDyslexicFont } from './features/typography.js';
import { applyBionicToText } from './features/bionic.js';
import { generateEmotionHighlights, requestEmotionAnalysis } from './features/emotions.js';
import { generateTransitionHighlights } from './features/transitions.js';
import { extractAllSentences, generateSentenceLabels, requestSentenceLabels, LOCAL_LENS_RANKING, isLabelVisible } from './features/labels.js';
import { setupRuler, teardownRuler } from './features/ruler.js';
import { setupAutoScroll, teardownAutoScroll } from './features/autoScroll.js';
import { applyFocusMask, applyFocusMaskByPrefixes } from './features/topicFocus.js';
import { setupSelectionMenu, teardownSelectionMenu } from './features/selectionMenu.js';

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
  const sentences = splitSentences(plainText.trim());

  const VALID_LABEL_TYPES = new Set([
    'core-fact', 'impact', 'context',
    'concept', 'mechanism', 'finding',
    'thesis', 'evidence', 'explanation',
    'plot-turn', 'setting',
  ]);

  const sentenceLabelClass = (s) => {
    if (!state.settings.sentenceLabels) return '';
    const trimmed = s.trim();
    const idx   = state.allSentences.findIndex(as => as.slice(0, 25) === trimmed.slice(0, 25));
    const label = state.sentenceLabels.find(l => l.index === idx);
    if (!VALID_LABEL_TYPES.has(label?.type)) return '';
    if (!isLabelVisible(label.type, state.sentenceLabelRanking, state.settings.sentenceLabelColorCount)) return '';
    return ` dra-label-${label.type}`;
  };

  return sentences.map(s =>
    `<span class="dra-sentence${sentenceLabelClass(s)}">${renderSentence(s)}</span>`
  ).join(' ');
}

// ── Inline HTML preservation ───────────────────────────────────────────

const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'cite', 'code', 'data', 'del', 'dfn', 'em',
  'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong',
  'sub', 'sup', 'time', 'u', 'var',
]);

// Scan original innerHTML and record each inline tag's position in plain text.
// Uses DOM tree traversal so <br> and whitespace normalization match innerText.
function extractInlineAnnotations(innerHTML) {
  const container = document.createElement('div');
  container.innerHTML = innerHTML;

  const annotations = [];
  let textPos = 0;

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      textPos += node.textContent.replace(/[ \t\r\n]+/g, ' ').length;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const name = node.tagName.toLowerCase();
    if (name === 'br') { textPos++; return; }
    if (INLINE_TAGS.has(name)) {
      const openTag = node.outerHTML.match(/^<[^>]+>/)?.[0] ?? `<${name}>`;
      annotations.push({ textPos, tag: openTag });
      for (const child of node.childNodes) walk(child);
      annotations.push({ textPos, tag: `</${name}>` });
    } else {
      for (const child of node.childNodes) walk(child);
    }
  }

  for (const child of container.childNodes) walk(child);
  return annotations;
}

// Re-inject extracted inline tags into the rendered HTML at the matching
// plain-text positions. Processes tags from end to start so earlier positions
// stay valid after each insertion.
function reInjectAnnotations(renderedHTML, annotations) {
  if (!annotations.length) return renderedHTML;

  // Map plain-text char index → byte offset in renderedHTML (skips tag markup).
  const textToHtmlPos = [];
  let inTag = false;
  for (let i = 0; i < renderedHTML.length; i++) {
    const c = renderedHTML[i];
    if (c === '<') { inTag = true; continue; }
    if (c === '>') { inTag = false; continue; }
    if (!inTag) textToHtmlPos.push(i);
  }

  // Sort: higher textPos first; ties broken by higher original index first
  // so that after back-to-front insertion the original left-to-right order
  // is restored (later-inserted tag ends up earlier in the string).
  const sorted = annotations
    .map((a, idx) => ({ ...a, idx }))
    .sort((a, b) => b.textPos - a.textPos || b.idx - a.idx);

  let result = renderedHTML;
  for (const { textPos, tag } of sorted) {
    const htmlPos = textPos < textToHtmlPos.length ? textToHtmlPos[textPos] : result.length;
    result = result.slice(0, htmlPos) + tag + result.slice(htmlPos);
  }
  return result;
}

// ── DOM transformations ────────────────────────────────────────────────

function applyTransformations() {
  if (!state.contentArea || !document.contains(state.contentArea)) {
    state.contentArea = findContentArea();
  }

  // Expose emotion colors as CSS variables so content.css can use them
  document.documentElement.style.setProperty('--dra-positive', state.settings.emotionPositiveColor);
  document.documentElement.style.setProperty('--dra-negative', state.settings.emotionNegativeColor);
  document.documentElement.style.setProperty('--dra-complex',  state.settings.emotionComplexColor);
  document.documentElement.style.setProperty('--dra-row-shading', state.settings.rowShadingColor);
  document.documentElement.style.setProperty('--dra-label-core-fact',   state.settings.labelCoreFactColor);
  document.documentElement.style.setProperty('--dra-label-impact',      state.settings.labelImpactColor);
  document.documentElement.style.setProperty('--dra-label-context',     state.settings.labelContextColor);
  document.documentElement.style.setProperty('--dra-label-concept',     state.settings.labelConceptColor);
  document.documentElement.style.setProperty('--dra-label-mechanism',   state.settings.labelMechanismColor);
  document.documentElement.style.setProperty('--dra-label-finding',     state.settings.labelFindingColor);
  document.documentElement.style.setProperty('--dra-label-thesis',      state.settings.labelThesisColor);
  document.documentElement.style.setProperty('--dra-label-evidence',     state.settings.labelEvidenceColor);
  document.documentElement.style.setProperty('--dra-label-explanation',  state.settings.labelExplanationColor);
  document.documentElement.style.setProperty('--dra-label-plot-turn',    state.settings.labelPlotTurnColor);
  document.documentElement.style.setProperty('--dra-label-setting',      state.settings.labelSettingColor);

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

    const needsSentenceWrap = state.settings.emotionColor ||
                              state.settings.transitionAnimation ||
                              state.settings.sentenceLabels;
    const shouldWrap = (state.settings.readingAidsEnabled && needsSentenceWrap) ||
                       (state.settings.typographyEnabled && state.settings.boldBeginning) ||
                       state.topicFocusKeywords !== null ||
                       state.topicFocusAIPrefixes !== null;
    if (shouldWrap && !hasEmbeddedContent(para)) {
      const originalHTML = para.innerHTML;
      if (!state.originalHTML.has(para)) state.originalHTML.set(para, originalHTML);
      const annotations = extractInlineAnnotations(originalHTML);
      const rendered    = buildParagraphHTML(para.innerText);
      para.innerHTML    = reInjectAnnotations(rendered, annotations);
    }

    if (state.settings.readingAidsEnabled && state.settings.gradientRows) {
      const lh = parseFloat(getComputedStyle(para).lineHeight);
      para.style.backgroundImage = `repeating-linear-gradient(to bottom,`
        + ` color-mix(in srgb, var(--dra-row-shading) 18%, transparent) 0px,`
        + ` color-mix(in srgb, var(--dra-row-shading) 18%, transparent) ${lh}px,`
        + ` transparent ${lh}px, transparent ${lh * 2}px)`;
    }
  });

  if (state.settings.typographyEnabled && state.settings.bgColor) {
    state.contentArea.style.background = state.settings.bgColor;
  }

  if (state.settings.readingAidsEnabled && state.settings.rulerActive) setupRuler();
  else teardownRuler();

  if (state.settings.readingAidsEnabled && state.settings.autoScrollActive) {
    setupAutoScroll(state.settings.autoScrollSpeed);
  } else {
    teardownAutoScroll();
  }
}

function removeTransformations() {
  if (!state.contentArea) return;

  state.contentArea.querySelectorAll('p, li, blockquote').forEach(para => {
    if (state.originalHTML.has(para)) para.innerHTML = state.originalHTML.get(para);
    ['fontSize', 'lineHeight', 'fontFamily', 'wordSpacing', 'letterSpacing', 'color', 'backgroundImage'].forEach(prop => {
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
        state.sentenceLabelRanking = LOCAL_LENS_RANKING[state.settings.sentenceLabelsLens ?? 'news'] ?? [];
      } else {
        state.sentenceLabels = state.aiSentenceLabels;
        // ranking for AI mode is set from LABEL_RESULT; keep whatever was stored
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
  } else {
    teardownAutoScroll();
  }
  if (state.topicFocusKeywords) {
    applyFocusMask(state.topicFocusKeywords);
  } else if (state.topicFocusAIPrefixes) {
    applyFocusMaskByPrefixes(state.topicFocusAIPrefixes);
  }

  const needsSelectionMenu = state.settings.readingAidsEnabled &&
    (state.settings.emotionColor || state.settings.transitionAnimation);
  if (needsSelectionMenu) setupSelectionMenu(render);
  else teardownSelectionMenu();
}
