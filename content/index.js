// Injected into every webpage by Chrome (configured in manifest.json → content_scripts)

(function () {
  'use strict';

  // ── Static word lists ──────────────────────────────────────────────────

  const TRANSITION_WORDS = new Set([
    // Contrast / Opposition
    'however','nevertheless','nonetheless','notwithstanding','conversely',
    'on the other hand','on the contrary','in contrast','by contrast',
    'that said','even so','be that as it may','then again','rather',
    // Addition
    'furthermore','moreover','additionally','likewise','in addition',
    'by the same token','in like manner','in the same way','in the same fashion',
    'coupled with','not to mention',
    // Cause / Result
    'therefore','thus','hence','consequently','accordingly','henceforth',
    'as a result','for this reason','thereupon','in effect','owing to',
    'as a consequence','due to','inasmuch as',
    // Concession
    'although','albeit','whereas','regardless','despite','in spite of',
    'even though','even if','granted that',
    // Conclusion / Summary
    'in conclusion','in summary','in short','in brief','to summarize',
    'overall','all in all','on balance','on the whole','by and large',
    'in essence','to sum up','in the final analysis','given these points',
    'all things considered','in a word','for the most part',
    // Emphasis / Clarification
    'in fact','indeed','notably','in other words','that is to say',
    'to put it differently','to put it another way','namely','specifically',
    'in particular','markedly','above all','most importantly',
    // Example
    'for example','for instance','to illustrate','as an illustration',
    // Sequence / Time
    'meanwhile','subsequently','eventually','formerly','in the meantime',
    'sooner or later','in due time',
    // Condition
    'provided that','given that','in the event that','as long as',
    'on the condition that',
  ]);

  const STOP_WORDS = new Set([
    'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
    'from','up','about','into','is','are','was','were','be','been','being','have',
    'has','had','do','does','did','will','would','could','should','may','might',
    'can','that','this','these','those','it','its','they','them','their','we',
    'our','you','your','he','she','his','her','not','no','nor','so','yet','both',
    'if','then','than','as','also','just','only','any','all','each','every','some',
    'such','even','more','most','other','same','very','i','me','my','who','which',
    'what','how','when','where','why','one','two','said','says','now','still'
  ]);


  // ── Default settings & runtime state ──────────────────────────────────
  // These match the keys saved by the Side Panel (panel/panel.js).
  // chrome.storage.sync overwrites these on load.

  const DEFAULT_SETTINGS = {
    typographyEnabled:    false,
    readingAidsEnabled:   false,
    boldBeginning:        false,
    emotionColor:         false,
    gradientRows:         false,
    transitionAnimation:  false,
    fontSize:             null,   // null = don't override the page's font size
    lineHeight:           null,
    fontFamily:           null,
    wordSpacing:          0,      // em units
    letterSpacing:        0,      // em units
    emotionPositiveColor: '#27ae60',
    emotionNegativeColor: '#e74c3c',
    emotionComplexColor:  '#8e44ad',
    rulerActive:          false,
    rulerWindowLines:     1.5,
  };

  let settings = { ...DEFAULT_SETTINGS };

  // Stores each paragraph's original innerHTML so we can restore it cleanly
  const originalHTML = new WeakMap();

  let contentArea         = null;
  let lastRulerY          = null;
  let aiAnalysisRequested = false;
  let articleHighlights   = []; // per-occurrence annotations from AI

  // ── Content area detection ─────────────────────────────────────────────
  // Only includes platforms with verified stable selectors (non-hashed class names).
  // Sites using CSS-in-JS (NYT, BBC, Guardian) are covered by [itemprop="articleBody"] below.

  const PLATFORM_SELECTORS = {
    'wikipedia.org':        ['#mw-content-text .mw-parser-output', '#mw-content-text'],
    'github.com':           ['.markdown-body'],
    'news.ycombinator.com': ['.fatitem'],
    'substack.com':         ['.reader2-post-body', '.available-content'],
    'dev.to':               ['#article-body'],
  };

  // Layer 1: platform-specific selectors matched by hostname suffix.
  // Layer 2: [itemprop="articleBody"] covers CSS-in-JS news sites (NYT, BBC, Guardian…).
  // Layer 3: generic semantic selectors.
  // Fallback: <body>.

  function findContentArea() {
    const host = window.location.hostname.replace(/^www\./, '');
    const matchedDomain = Object.keys(PLATFORM_SELECTORS)
      .find(domain => host === domain || host.endsWith('.' + domain));
    if (matchedDomain) {
      for (const sel of PLATFORM_SELECTORS[matchedDomain]) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 300) return el;
      }
    }

    const candidates = [
      '[itemprop="articleBody"]',
      'article',
      '[role="main"]',
      'main',
      '.article-body', '.article-content', '.post-content',
      '.entry-content', '.story-body', '#article-body', '#main-content',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 300) return el;
    }
    return document.body;
  }

  // ── Word rendering pipeline ────────────────────────────────────────────

  function bionicN(len) {
    if (len <= 3) return 1;
    if (len <= 6) return 2;
    if (len <= 9) return 3;
    return 4;
  }

  function applyBionicToText(text) {
    return text.split(/(\s+)/).map(tok => {
      if (/^\s+$/.test(tok)) return tok;
      const leading  = tok.match(/^[^a-zA-Z]*/)[0];
      const trailing = tok.match(/[^a-zA-Z]*$/)[0];
      const body     = tok.slice(leading.length, tok.length - trailing.length);
      if (!body) return tok;
      const N      = bionicN(body.length);
      const anchor = body.slice(0, N);
      const rest   = body.slice(N);
      const inner  = rest.length <= 1
        ? `<b>${anchor}</b>${rest}`
        : `<b>${anchor}</b><span class="dra-bionic-fade">${rest[0]}</span>${rest.slice(1)}`;
      return `${leading}${inner}${trailing}`;
    }).join('');
  }

  function renderSentence(s) {
    const matches = [];
    for (const h of articleHighlights) {
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

    const bionic = (t) => settings.boldBeginning ? applyBionicToText(t) : t;

    if (deduped.length === 0) return bionic(s);

    let result = '';
    let pos = 0;
    for (const { start, end, h } of deduped) {
      if (pos < start) result += bionic(s.slice(pos, start));
      const inner = bionic(s.slice(start, end));
      if (settings.transitionAnimation && h.category === 'transition') {
        result += `<span class="dra-transition-word">${inner}</span>`;
      } else if (settings.emotionColor && h.category.startsWith('emotion')) {
        result += `<span class="dra-${h.category}">${inner}</span>`;
      } else {
        result += inner;
      }
      pos = end;
    }
    if (pos < s.length) result += bionic(s.slice(pos));
    return result;
  }

  // Turns a paragraph's plain text into annotated HTML.
  function buildParagraphHTML(plainText) {
    const sentences = plainText.trim().split(/(?<=[.!?])\s+(?=[A-Z"'\[])/);

    if (settings.gradientRows) {
      return sentences.map((s, i) => {
        const cls = i % 2 === 0 ? 'dra-row-even' : 'dra-row-odd';
        return `<div class="dra-sentence ${cls}">${renderSentence(s)}</div>`;
      }).join('');
    }

    return sentences.map(s =>
      `<span class="dra-sentence">${renderSentence(s)}</span>`
    ).join(' ');
  }

  // ── Reading Ruler ──────────────────────────────────────────────────────

  function updateRuler(e) {
    lastRulerY = e.clientY;
    const halfH = Math.round(16 * 1.8 * settings.rulerWindowLines / 2);
    const topEl = document.getElementById('dra-ruler-top');
    const botEl = document.getElementById('dra-ruler-bottom');
    const winEl = document.getElementById('dra-ruler-window');
    if (!topEl) return;

    topEl.style.height = Math.max(0, e.clientY - halfH) + 'px';
    botEl.style.top    = (e.clientY + halfH) + 'px';
    winEl.style.top    = Math.max(0, e.clientY - halfH) + 'px';
    winEl.style.height = (halfH * 2) + 'px';
  }

  function setupRuler() {
    if (document.getElementById('dra-ruler-top')) return;
    const ids = ['dra-ruler-top', 'dra-ruler-bottom', 'dra-ruler-window'];
    ids.forEach(id => {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    });
    document.addEventListener('mousemove', updateRuler);
    updateRuler({ clientY: lastRulerY ?? window.innerHeight / 2 });
  }

  function teardownRuler() {
    ['dra-ruler-top', 'dra-ruler-bottom', 'dra-ruler-window'].forEach(id => {
      document.getElementById(id)?.remove();
    });
    document.removeEventListener('mousemove', updateRuler);
  }

  // ── Focus Mask ─────────────────────────────────────────────────────────

  function extractKeywords(text) {
    return text.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  function scoreSentence(text, keywords) {
    const words   = extractKeywords(text);
    const wordSet = new Set(words);
    let score = 0;
    for (const kw of keywords) {
      if (wordSet.has(kw)) { score += 3; continue; }
      if (kw.length >= 5) {
        const stem = kw.slice(0, Math.ceil(kw.length * 0.75));
        if (words.some(w => w.startsWith(stem))) score += 1;
      }
    }
    return score;
  }

  function applyFocusMask(keywords) {
    document.querySelectorAll('.dra-sentence').forEach(el => {
      el.style.opacity = scoreSentence(el.textContent, keywords) > 0 ? '1' : '0.2';
    });
  }

  function clearFocusMask() {
    document.querySelectorAll('.dra-sentence').forEach(el => {
      el.style.opacity = '';
    });
  }

  // ── Transition word scanning (rule-based, no AI) ──────────────────────

  function generateTransitionHighlights() {
    const area = findContentArea();
    const text = area.innerText.toLowerCase();
    const highlights = [];
    for (const phrase of TRANSITION_WORDS) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<![a-zA-Z-])${escaped}(?![a-zA-Z-])`);
      if (regex.test(text)) {
        highlights.push({ word: phrase, category: 'transition' });
      }
    }
    return highlights;
  }

  // ── AI analysis ───────────────────────────────────────────────────────

  function requestAIAnalysis() {
    if (aiAnalysisRequested) return;
    aiAnalysisRequested = true;
    const area = findContentArea();
    const text = area.innerText.trim();
    chrome.runtime.sendMessage({ type: 'ANALYZE_REQUEST', url: window.location.href, text });
  }


  // ── Transformations ────────────────────────────────────────────────────

  function applyTransformations() {
    contentArea = findContentArea();

    // Expose emotion colors as CSS variables so content.css can use them
    document.documentElement.style.setProperty('--dra-positive', settings.emotionPositiveColor);
    document.documentElement.style.setProperty('--dra-negative', settings.emotionNegativeColor);
    document.documentElement.style.setProperty('--dra-complex',  settings.emotionComplexColor);

    // Process each paragraph — apply typography directly on each element
    // (setting on contentArea alone doesn't work because child elements
    // often have their own font-size/line-height rules that take precedence)
    contentArea.querySelectorAll('p, li, blockquote').forEach(para => {
      if (para.innerText.trim().length < 20) return;

      if (settings.typographyEnabled) {
        if (settings.fontSize)      para.style.fontSize     = settings.fontSize + 'px';
        if (settings.lineHeight)    para.style.lineHeight   = String(settings.lineHeight);
        if (settings.fontFamily)    para.style.fontFamily   = settings.fontFamily;
        if (settings.wordSpacing)   para.style.wordSpacing   = settings.wordSpacing + 'em';
        if (settings.letterSpacing) para.style.letterSpacing = settings.letterSpacing + 'em';
        if (settings.fontColor)     para.style.color         = settings.fontColor;
      }

      if (settings.readingAidsEnabled) {
        if (!originalHTML.has(para)) originalHTML.set(para, para.innerHTML);
        para.innerHTML = buildParagraphHTML(para.innerText);
      }
    });

    if (settings.typographyEnabled && settings.bgColor) {
      contentArea.style.background = settings.bgColor;
    }

    if (settings.readingAidsEnabled && settings.rulerActive) setupRuler();
    else teardownRuler();
  }

  function removeTransformations() {
    if (!contentArea) return;

    contentArea.querySelectorAll('p, li, blockquote').forEach(para => {
      if (originalHTML.has(para)) para.innerHTML = originalHTML.get(para);
      ['fontSize', 'lineHeight', 'fontFamily', 'wordSpacing', 'letterSpacing', 'color'].forEach(prop => {
        para.style[prop] = '';
      });
    });

    contentArea.style.background = '';
    teardownRuler();
  }

  // ── Render coordinator ─────────────────────────────────────────────────

  function render() {
    removeTransformations();

    if (settings.typographyEnabled || settings.readingAidsEnabled) {
      applyTransformations();
    }

    if (settings.readingAidsEnabled) requestAIAnalysis();
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────

  chrome.storage.sync.get('draSettings', (data) => {
    if (data.draSettings) {
      settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
      if (settings.transitionAnimation === undefined && data.draSettings.logicAnimation !== undefined) {
        settings.transitionAnimation = data.draSettings.logicAnimation;
      }
    }
    render();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SETTINGS_CHANGED') {
      if (msg.payload.rulerActive === false) lastRulerY = null;
      settings = { ...settings, ...msg.payload };
      render();
    }

    if (msg.type === 'FOCUS_APPLY' && msg.keywords?.length) {
      applyFocusMask(msg.keywords);
    }

    if (msg.type === 'FOCUS_CLEAR') {
      clearFocusMask();
    }

    if (msg.type === 'ANALYSIS_RESULT') {
      const emotionHighlights    = (msg.highlights || []).filter(h => h.category !== 'transition');
      const transitionHighlights = generateTransitionHighlights();
      articleHighlights = [...emotionHighlights, ...transitionHighlights];
      render();
    }
  });

})();
