import { splitSentences } from '../utils.js';
import { LENS_RULES } from './labels.js';
import { matchEmotionWords } from './emotions.js';
import { DEFAULT_TRANSITION_WORDS } from './transitions.js';
import { applyBionicToText } from './bionic.js';

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSentenceLabels(blocks, lens) {
  const rules = LENS_RULES[lens] ?? LENS_RULES.news;
  const allSentences = blocks.flatMap(b => splitSentences(b.trim()).filter(Boolean));
  const labels = [];
  allSentences.forEach((s, i) => {
    for (const [type, patterns] of Object.entries(rules)) {
      if (patterns.some(rx => rx.test(s))) { labels.push({ index: i, type }); break; }
    }
  });
  return { allSentences, labels };
}

function renderSentenceText(sentence, settings, emotionHighlights, transitionWords) {
  const text = settings.boldBeginning ? applyBionicToText(sentence) : escapeHTML(sentence);
  if (!settings.readingAidsEnabled) return text;

  // Apply emotion word highlighting using character-position approach
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
        spans.push({ start: m.index, end: m.index + m[0].length, cls: 'dra-pe-transition-word' });
      }
    }
  }

  if (!spans.length) return settings.boldBeginning ? applyBionicToText(sentence) : escapeHTML(sentence);

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
// Returns an HTML string to inject into the preview pane.
export function renderPreviewArticle(article, settings, wordLists) {
  const { blocks } = article;
  const lens = settings.sentenceLabelsLens ?? 'news';
  const { allSentences, labels } = (settings.readingAidsEnabled && settings.sentenceLabels)
    ? getSentenceLabels(blocks, lens)
    : { allSentences: [], labels: [] };

  const emotionHighlights = (settings.readingAidsEnabled && settings.emotionColor)
    ? matchEmotionWords(blocks.join(' '), wordLists)
    : [];

  const transitionWords = (settings.readingAidsEnabled && settings.transitionAnimation)
    ? (wordLists.transition ?? DEFAULT_TRANSITION_WORDS)
    : [];

  const LABEL_TYPES = new Set([
    'core-fact','context','quote','concept','mechanism','constraint',
    'thesis','evidence','explanation','dialogue','plot-turn','setting',
  ]);

  let sIdx = 0;
  const paragraphs = blocks.map(block => {
    const sentences = splitSentences(block.trim()).filter(Boolean);
    const html = sentences.map(sentence => {
      const labelEntry = labels.find(l => l.index === sIdx);
      const labelCls = (labelEntry && LABEL_TYPES.has(labelEntry.type))
        ? ` dra-label-${labelEntry.type}`
        : '';
      sIdx++;
      const inner = renderSentenceText(sentence, settings, emotionHighlights, transitionWords);
      return `<span class="dra-sentence${labelCls}">${inner}</span>`;
    }).join(' ');
    return `<p>${html}</p>`;
  });

  return paragraphs.join('');
}

// Apply CSS custom-property variables for colors to the given container element.
export function applyPreviewStyles(container, settings) {
  const s = settings;
  container.style.setProperty('--dra-positive',   s.emotionPositiveColor ?? '#27ae60');
  container.style.setProperty('--dra-negative',   s.emotionNegativeColor ?? '#e74c3c');
  container.style.setProperty('--dra-complex',    s.emotionComplexColor  ?? '#8e44ad');
  container.style.setProperty('--dra-row-shading', s.rowShadingColor ?? '#bfb3d0');

  const labelColors = {
    'core-fact':   s.labelCoreFactColor   ?? '#eab308',
    'context':     s.labelContextColor    ?? '#3b82f6',
    'quote':       s.labelQuoteColor      ?? '#ea580c',
    'concept':     s.labelConceptColor    ?? '#9333ea',
    'mechanism':   s.labelMechanismColor  ?? '#f97316',
    'constraint':  s.labelConstraintColor ?? '#ef4444',
    'thesis':      s.labelThesisColor     ?? '#ca8a04',
    'evidence':    s.labelEvidenceColor   ?? '#22c55e',
    'explanation': s.labelExplanationColor ?? '#6b7280',
    'dialogue':    s.labelDialogueColor   ?? '#ec4899',
    'plot-turn':   s.labelPlotTurnColor   ?? '#eab308',
    'setting':     s.labelSettingColor    ?? '#9ca3af',
  };
  for (const [key, val] of Object.entries(labelColors)) {
    container.style.setProperty(`--dra-label-${key}`, val);
  }

  const article = container.querySelector('.dra-pe-article');
  if (!article) return;
  article.style.fontFamily   = (s.typographyEnabled && s.fontFamily)    ? s.fontFamily            : '';
  article.style.fontSize     = (s.typographyEnabled && s.fontSize)      ? `${s.fontSize}px`       : '';
  article.style.lineHeight   = (s.typographyEnabled && s.lineHeight)    ? String(s.lineHeight)    : '';
  article.style.wordSpacing  = (s.typographyEnabled && s.wordSpacing)   ? `${s.wordSpacing}em`    : '';
  article.style.letterSpacing= (s.typographyEnabled && s.letterSpacing) ? `${s.letterSpacing}em`  : '';
  article.style.color        = '';
  article.style.background   = '';
}
