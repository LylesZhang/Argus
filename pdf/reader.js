// Standalone PDF Reader page.
// Parses a PDF with PDF.js, reflows it into a readable document, and reproduces
// the in-page Immersive Reader experience (typography, themes, ruler, auto-scroll,
// Bionic, Emotion, Lens, Transition, Topic Focus, Typewriter). Reading settings
// live-sync from chrome.storage; AI (Emotion/Lens/Focus) relays through the
// background worker with PDF_* messages filtered by this tab's id.

import * as pdfjsLib from 'pdfjs-dist';
import { normalizeLines, blocksFromPages } from './textExtraction.mjs';
import { splitSentences } from '../content/utils.js';
import { DEFAULT_EMOTION_POSITIVE, DEFAULT_EMOTION_NEGATIVE, DEFAULT_EMOTION_COMPLEX } from '../content/features/emotions.js';
import { DEFAULT_TRANSITION_WORDS } from '../content/features/transitions.js';
import { DEFAULT_SETTINGS } from '../content/settings.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf/pdf.worker.mjs');

const LABEL_TYPES = new Set([
  'key-point', 'core-detail',
  'concept', 'reasoning', 'takeaway',
  'claim', 'evidence', 'counterpoint',
]);
const DENSITY_THRESHOLDS = { low: 85, medium: 75, high: 65 };

// ── Module state (local; no shared content-script `state`) ─────────────

let settings   = { ...DEFAULT_SETTINGS };
let wordLists   = {};
let readerContent = { title: '', blocks: [] };
let allSentences  = [];
let fingerprint   = '';
let myTabId       = null;

let aiEmotionHighlights = [];
let emotionRequestId = null;
let sentenceLabels   = [];
let labelsRequestId  = null;

let topicFocusKeywords  = null;
let topicFocusAIPrefixes = null;
let focusRequestId = null;

let readerState = { theme: 'warm' };
let scrollFrameId = null;
let scrollLastTime = null;

// Typewriter: tw === null means inactive.
let tw = null;
let typeIntervalMs = speedLevelToTypeInterval(5);

const getRoot = () => document.getElementById('app');

// ── Pure text helpers (ported from immersiveReader.js) ─────────────────

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function escapeRegex(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

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

function wordsForCategory(category) {
  if (category === 'emotion-positive') return wordLists.emotionPositive ?? DEFAULT_EMOTION_POSITIVE;
  if (category === 'emotion-negative') return wordLists.emotionNegative ?? DEFAULT_EMOTION_NEGATIVE;
  if (category === 'emotion-complex')  return wordLists.emotionComplex  ?? DEFAULT_EMOTION_COMPLEX;
  if (category === 'transition')       return wordLists.transition      ?? DEFAULT_TRANSITION_WORDS;
  return [];
}

function collectMatches(text) {
  const matches = [];
  const featureSets = [];
  if (settings.emotionColor) {
    if (settings.emotionMode === 'local') {
      featureSets.push(['emotion-positive', wordsForCategory('emotion-positive')]);
      featureSets.push(['emotion-negative', wordsForCategory('emotion-negative')]);
      featureSets.push(['emotion-complex',  wordsForCategory('emotion-complex')]);
    } else {
      const grouped = new Map();
      aiEmotionHighlights.forEach(h => {
        if (!grouped.has(h.category)) grouped.set(h.category, []);
        grouped.get(h.category).push(h.word);
      });
      grouped.forEach((words, category) => featureSets.push([category, words]));
    }
  }
  if (settings.transitionAnimation) {
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
    if (m.start >= lastEnd) { result.push(m); lastEnd = m.end; }
  });
  return result;
}

function inlineText(text) {
  return settings.boldBeginning ? bionicReaderText(text) : escapeHTML(text);
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
  if (!settings.sentenceLabels) return '';
  const trimmed = sentence.trim();
  const idx = allSentences.findIndex(as => as.slice(0, 25) === trimmed.slice(0, 25));
  const label = sentenceLabels.find(l => l.index === idx);
  return LABEL_TYPES.has(label?.type) ? ` dra-label-${label.type}` : '';
}

function isFocusedSentence(sentence) {
  if (topicFocusKeywords) {
    const text = sentence.toLowerCase();
    return topicFocusKeywords.some(keyword => text.includes(keyword));
  }
  if (topicFocusAIPrefixes) {
    const prefix = sentence.trim().slice(0, 30);
    return topicFocusAIPrefixes.some(p => prefix.startsWith(p.slice(0, 25)));
  }
  return true;
}

// ── Article rendering ──────────────────────────────────────────────────

function renderArticleHTML() {
  if (!readerContent.blocks.length) {
    return '<p class="dra-reader-status">Argus could not extract readable text from this PDF.</p>';
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

function renderArticle() {
  const root = getRoot();
  if (!root) return;
  root.querySelector('.dra-reader-article').innerHTML =
    `<h1>${escapeHTML(readerContent.title)}</h1>${renderArticleHTML()}`;
}

function applyReaderStyle() {
  const root = getRoot();
  if (!root) return;
  const article = root.querySelector('.dra-reader-article');
  root.dataset.theme = readerState.theme;
  root.style.setProperty('--dra-positive', settings.emotionPositiveColor);
  root.style.setProperty('--dra-negative', settings.emotionNegativeColor);
  root.style.setProperty('--dra-complex', settings.emotionComplexColor);
  root.style.setProperty('--dra-row-shading', settings.rowShadingColor);
  root.style.setProperty('--dra-label-key-point', settings.labelKeyPointColor);
  root.style.setProperty('--dra-label-core-detail', settings.labelCoreDetailColor);
  root.style.setProperty('--dra-label-concept', settings.labelConceptColor);
  root.style.setProperty('--dra-label-reasoning', settings.labelReasoningColor);
  root.style.setProperty('--dra-label-takeaway', settings.labelTakeawayColor);
  root.style.setProperty('--dra-label-claim', settings.labelClaimColor);
  root.style.setProperty('--dra-label-evidence', settings.labelEvidenceColor);
  root.style.setProperty('--dra-label-counterpoint', settings.labelCounterpointColor);

  article.style.fontSize     = settings.fontSize ? `${settings.fontSize}px` : '';
  article.style.lineHeight   = settings.lineHeight ? String(settings.lineHeight) : '';
  article.style.fontFamily   = settings.fontFamily ? settings.fontFamily : '';
  article.style.wordSpacing  = settings.wordSpacing ? `${settings.wordSpacing}em` : '';
  article.style.letterSpacing = settings.letterSpacing ? `${settings.letterSpacing}em` : '';

  root.classList.toggle('dra-reader-row-shading', Boolean(settings.gradientRows));
  root.classList.toggle('dra-reader-ruler-active', Boolean(settings.rulerActive));

  root.querySelectorAll('[data-reader-theme]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.readerTheme === readerState.theme);
  });
  updateProgress();
  updateReaderAutoScroll();
}

// Re-render everything for the current state (used after settings/AI changes).
function refresh() {
  if (tw) { renderTW(); applyReaderStyle(); return; }
  renderArticle();
  applyReaderStyle();
}

// ── Progress, auto-scroll, ruler ───────────────────────────────────────

function updateProgress() {
  const root = getRoot();
  if (!root) return;
  if (tw) {
    const total = tw.flatSentences.length;
    let progress = 0;
    if (tw.phase === 'finished') progress = 1;
    else if (total > 0 && tw.currentIndex >= 0) progress = (tw.currentIndex + 1) / total;
    root.style.setProperty('--dra-reader-progress', `${Math.min(1, Math.max(0, progress)) * 100}%`);
    return;
  }
  const scrollEl = root.querySelector('.dra-reader-scroll');
  if (!scrollEl) return;
  const max = scrollEl.scrollHeight - scrollEl.clientHeight;
  const progress = max <= 0 ? 1 : scrollEl.scrollTop / max;
  root.style.setProperty('--dra-reader-progress', `${Math.min(1, Math.max(0, progress)) * 100}%`);
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
function updateReaderAutoScroll() {
  stopReaderAutoScroll();
  if (tw) return;
  if (!settings.autoScrollActive) return;
  const root = getRoot();
  const scrollEl = root.querySelector('.dra-reader-scroll');
  const speed = speedLevelToPixelsPerSecond(settings.autoScrollSpeed);
  const tick = timestamp => {
    if (scrollLastTime === null) scrollLastTime = timestamp;
    const elapsed = (timestamp - scrollLastTime) / 1000;
    scrollLastTime = timestamp;
    scrollEl.scrollTop += speed * elapsed;
    scrollFrameId = requestAnimationFrame(tick);
  };
  scrollFrameId = requestAnimationFrame(tick);
}

function updateReaderRuler(e) {
  const root = getRoot();
  if (!root) return;
  const halfH = Math.round(16 * 1.8 * (settings.rulerWindowLines ?? 1.5) / 2);
  root.querySelector('.dra-reader-ruler-top').style.height = Math.max(0, e.clientY - halfH) + 'px';
  root.querySelector('.dra-reader-ruler-bottom').style.top = (e.clientY + halfH) + 'px';
  root.querySelector('.dra-reader-ruler-window').style.top = Math.max(0, e.clientY - halfH) + 'px';
  root.querySelector('.dra-reader-ruler-window').style.height = (halfH * 2) + 'px';
}

// ── Typewriter (ported) ────────────────────────────────────────────────

function speedLevelToTypeInterval(level) {
  const safeLevel = Math.min(10, Math.max(1, Math.round(Number(level) || 5)));
  return 70 - ((safeLevel - 1) * (60 / 9));
}

function buildFlatSentences() {
  const flat = [];
  readerContent.blocks.forEach((block, blockIndex) => {
    splitSentences(block.trim()).filter(Boolean)
      .forEach((text, i) => flat.push({ text, blockIndex, isBlockStart: i === 0 }));
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
    if (s.isBlockStart) { if (openP) html += '</p>'; html += '<p>'; openP = true; }
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
    if (s.isBlockStart) { if (openP) html += '</p>'; html += '<p>'; openP = true; }
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
  const root = getRoot();
  if (!root || !tw) return;
  const body = tw.phase === 'picking-start' ? renderPickStartArticle() : renderTypewriterArticle();
  root.querySelector('.dra-reader-article').innerHTML = `<h1>${escapeHTML(readerContent.title)}</h1>${body}`;
  updateProgress();
}

function centerCurrentLine() {
  const root = getRoot();
  if (!root) return;
  const scrollEl = root.querySelector('.dra-reader-scroll');
  const cur = root.querySelector('.dra-tw-current');
  if (!scrollEl || !cur) return;
  const containerRect = scrollEl.getBoundingClientRect();
  const curRect = cur.getBoundingClientRect();
  scrollEl.scrollTop += (curRect.top + curRect.height / 2) - (containerRect.top + containerRect.height / 2);
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
  const root = getRoot();
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
  ) { tw.currentIndex++; }
  tw.revealedChars = tw.flatSentences[tw.currentIndex].text.length;
  tw.phase = 'paused';
  tw.showContinueHint = false;
  scheduleContinueHint();
  renderTW();
  centerCurrentLine();
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

function setTypewriterActive(active) {
  const root = getRoot();
  if (!root) return;
  const scrollEl = root.querySelector('.dra-reader-scroll');
  if (active && !tw) {
    tw = {
      phase: 'picking-start', flatSentences: buildFlatSentences(),
      startIndex: null, currentIndex: -1, revealedChars: 0,
      tickTimer: null, continueHintTimer: null, showContinueHint: false,
    };
    renderTW();
    updateReaderAutoScroll();
  } else if (!active && tw) {
    clearInterval(tw.tickTimer);
    clearContinueHintTimer();
    tw = null;
    scrollEl.classList.remove('dra-tw-scroll-pad');
    renderArticle();
    updateProgress();
    updateReaderAutoScroll();
  }
}

function setTypewriterSpeed(level) { typeIntervalMs = speedLevelToTypeInterval(level); }

// ── AI relay (Emotion / Lens / Focus) ──────────────────────────────────

function aiStatus(feature, status) {
  chrome.runtime.sendMessage({ type: 'AI_STATUS', feature, status }).catch(() => {});
}

function requestPdfEmotion() {
  if (!settings.emotionColor || settings.emotionMode !== 'ai') return;
  const requestId = `pdf:emotion:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  emotionRequestId = requestId;
  aiStatus('emotion', 'loading');
  chrome.runtime.sendMessage({
    type: 'PDF_EMOTION_REQUEST',
    requestId, fingerprint,
    text: readerContent.blocks.join('\n\n'),
  }).catch(() => {});
}

function requestPdfLabels() {
  const requestId = `pdf:labels:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  labelsRequestId = requestId;
  aiStatus('labels', 'loading');
  chrome.runtime.sendMessage({
    type: 'PDF_LABEL_REQUEST',
    requestId, fingerprint,
    sentences: allSentences,
    lensPurpose: settings.sentenceLabelsLens ?? 'inform',
    minImportance: DENSITY_THRESHOLDS[settings.sentenceLabelsDensity] ?? 75,
  }).catch(() => {});
}

function requestPdfFocusAI(topic) {
  const requestId = `pdf:focus:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  focusRequestId = requestId;
  aiStatus('focus', 'loading');
  chrome.runtime.sendMessage({
    type: 'PDF_FOCUS_ANALYZE',
    requestId, fingerprint, topic,
    text: readerContent.blocks.join('\n\n'),
  }).catch(() => {});
}

// ── PDF loading ────────────────────────────────────────────────────────

function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function loadSessionFile(sessionId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('argus-pdf', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('sessions', 'readonly');
      const get = tx.objectStore('sessions').get(sessionId);
      get.onsuccess = () => { db.close(); resolve(get.result); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  });
}

async function getPdfBytes(params) {
  if (params.get('session')) {
    const record = await loadSessionFile(params.get('session'));
    if (!record?.file) throw new Error('session not found');
    return { bytes: new Uint8Array(await record.file.arrayBuffer()), title: record.title };
  }
  if (params.get('url')) {
    const res = await fetch(params.get('url'));
    if (!res.ok) throw new Error('fetch failed');
    return { bytes: new Uint8Array(await res.arrayBuffer()), title: null };
  }
  throw new Error('no source');
}

async function parsePdf(bytes) {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    pages.push({ number: n, lines: normalizeLines(content.items) });
  }
  return blocksFromPages(pages).map(b => b.text);
}

// ── Wiring ─────────────────────────────────────────────────────────────

function onKeydown(e) {
  if (e.key === 'Escape') { closeReader(); return; }
  if (e.key === ' ' && tw) { e.preventDefault(); handleSpace(); }
}

function closeReader() {
  chrome.runtime.sendMessage({ type: 'PDF_READER_STATUS', active: false }).catch(() => {});
  if (myTabId != null) chrome.tabs.remove(myTabId).catch(() => window.close());
  else window.close();
}

function wireReader() {
  const root = getRoot();
  const scrollEl = root.querySelector('.dra-reader-scroll');
  root.querySelector('#close-reader').addEventListener('click', closeReader);
  root.querySelectorAll('[data-reader-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      readerState.theme = btn.dataset.readerTheme;
      applyReaderStyle();
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
  scrollEl.addEventListener('scroll', updateProgress);
  root.addEventListener('mousemove', updateReaderRuler);
  document.addEventListener('keydown', onKeydown);
}

// React to settings changes stored by the side panel.
function applyStoredSettings(nextSettings, nextWordLists) {
  const prev = settings;
  if (nextSettings) settings = { ...DEFAULT_SETTINGS, ...nextSettings };
  if (nextWordLists) wordLists = nextWordLists;

  if (settings.typewriterSpeed !== prev.typewriterSpeed) setTypewriterSpeed(settings.typewriterSpeed);
  if (Boolean(settings.typewriterActive) !== Boolean(prev.typewriterActive)) {
    setTypewriterActive(Boolean(settings.typewriterActive));
    applyReaderStyle();
    return;
  }
  refresh();
}

function handleMessage(msg) {
  if (!msg || (msg.targetPdfTabId != null && msg.targetPdfTabId !== myTabId)) return;

  switch (msg.type) {
    case 'PDF_EMOTION_RESULT':
      if (msg.requestId !== emotionRequestId) return;
      aiEmotionHighlights = Array.isArray(msg.highlights) ? msg.highlights : [];
      aiStatus('emotion', Array.isArray(msg.highlights) ? 'success' : 'error');
      refresh();
      break;
    case 'PDF_EMOTION_ERROR':
      if (msg.requestId !== emotionRequestId) return;
      aiStatus('emotion', 'error');
      break;

    case 'PDF_LABEL_RESULT':
      if (msg.requestId !== labelsRequestId) return;
      sentenceLabels = Array.isArray(msg.labels) ? msg.labels : [];
      aiStatus('labels', Array.isArray(msg.labels) ? 'success' : 'error');
      refresh();
      break;
    case 'PDF_LABEL_ERROR':
      if (msg.requestId !== labelsRequestId) return;
      aiStatus('labels', 'error');
      break;

    case 'PDF_FOCUS_RESULT':
      if (msg.requestId !== focusRequestId) return;
      topicFocusKeywords = null;
      topicFocusAIPrefixes = Array.isArray(msg.relevant) ? msg.relevant : [];
      aiStatus('focus', 'success');
      refresh();
      break;
    case 'PDF_FOCUS_ERROR':
      if (msg.requestId !== focusRequestId) return;
      topicFocusAIPrefixes = null;
      aiStatus('focus', 'error');
      break;

    case 'PDF_FOCUS_APPLY':
      topicFocusAIPrefixes = null;
      topicFocusKeywords = Array.isArray(msg.keywords) ? msg.keywords : null;
      refresh();
      break;
    case 'PDF_FOCUS_CLEAR':
      topicFocusKeywords = null;
      topicFocusAIPrefixes = null;
      refresh();
      break;
    case 'PDF_FOCUS_REQUEST':
      requestPdfFocusAI(msg.topic);
      break;

    case 'AI_RETRY':
      if (msg.feature === 'emotion') { aiEmotionHighlights = []; emotionRequestId = null; requestPdfEmotion(); }
      if (msg.feature === 'labels')  { sentenceLabels = []; labelsRequestId = null; requestPdfLabels(); }
      break;
  }
}

// ── Boot ───────────────────────────────────────────────────────────────

async function init() {
  const currentTab = await chrome.tabs.getCurrent().catch(() => null);
  myTabId = currentTab?.id ?? null;

  const stored = await chrome.storage.sync.get(['draSettings', 'draWordLists']);
  settings  = { ...DEFAULT_SETTINGS, ...(stored.draSettings || {}) };
  wordLists = stored.draWordLists || {};
  typeIntervalMs = speedLevelToTypeInterval(settings.typewriterSpeed);

  const params = new URLSearchParams(location.search);
  const article = getRoot().querySelector('.dra-reader-article');

  try {
    const { bytes, title } = await getPdfBytes(params);
    const blocks = await parsePdf(bytes);
    readerContent = {
      title: params.get('title') || title || 'PDF document',
      blocks,
    };
  } catch (err) {
    readerContent = { title: 'PDF document', blocks: [] };
    article.innerHTML = `<p class="dra-reader-status">Could not open this PDF (${escapeHTML(String(err.message || err))}).</p>`;
  }

  allSentences = readerContent.blocks.flatMap(b => splitSentences(b.trim()).filter(s => s.trim()));
  fingerprint = hashText(readerContent.blocks.join('\n'));

  const meta = document.getElementById('reader-meta');
  if (meta) meta.textContent = readerContent.blocks.length
    ? `${readerContent.blocks.length} paragraphs` : '';

  wireReader();
  renderArticle();
  applyReaderStyle();
  if (settings.typewriterActive) setTypewriterActive(true);

  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.draSettings || changes.draWordLists) {
      applyStoredSettings(changes.draSettings?.newValue, changes.draWordLists?.newValue);
    }
  });

  chrome.runtime.sendMessage({ type: 'PDF_READER_STATUS', active: true }).catch(() => {});
  window.addEventListener('pagehide', () => {
    chrome.runtime.sendMessage({ type: 'PDF_READER_STATUS', active: false }).catch(() => {});
  });
}

init();
