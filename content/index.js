// Injected into every webpage by Chrome (configured in manifest.json → content_scripts)

(function () {
  'use strict';

  // ── Static word lists ──────────────────────────────────────────────────

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

  const LOGIC_WORDS = new Set([
    'although', 'because', 'since', 'however', 'consequently', 'therefore', 'unless'
  ]);

  const EMOTION_WORDS = {
    positive: new Set([
      'Faculty', 'glowing', 'successful', 'bravely', 'determined', 'sincerely',
      'warm', 'comforting', 'proud', 'relief', 'smile', 'stronger'
    ]),
    negative: new Set([
      'suffocating', 'guilt', 'nervous', 'tense', 'confused',
      'terrifying', 'anxiety', 'pressure', 'hide'
    ]),
    surprise: new Set([
      'incredulous', 'astonishment', 'overwhelming', 'absolute'
    ])
  };

  // ── Default settings & runtime state ──────────────────────────────────
  // These match the keys saved by the Side Panel (panel/panel.js).
  // chrome.storage.sync overwrites these on load.

  const DEFAULT_SETTINGS = {
    typographyEnabled:    false,
    readingAidsEnabled:   false,
    boldBeginning:        false,
    emotionColor:         false,
    gradientRows:         false,
    logicAnimation:       false,
    fontSize:             null,   // null = don't override the page's font size
    lineHeight:           null,
    fontFamily:           null,
    wordSpacing:          0,      // em units
    letterSpacing:        0,      // em units
    emotionPositiveColor: '#27ae60',
    emotionNegativeColor: '#e74c3c',
    emotionSurpriseColor: '#8e44ad',
    rulerActive:          false,
    rulerWindowLines:     1.5,
  };

  let settings = { ...DEFAULT_SETTINGS };

  // Stores each paragraph's original innerHTML so we can restore it cleanly
  const originalHTML = new WeakMap();

  let contentArea = null;
  let lastRulerY  = null;

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

  function cleanWord(raw) {
    return raw.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
  }

  function getEmotionClass(word) {
    if (EMOTION_WORDS.positive.has(word)) return 'dra-emotion-positive';
    if (EMOTION_WORDS.negative.has(word)) return 'dra-emotion-negative';
    if (EMOTION_WORDS.surprise.has(word)) return 'dra-emotion-surprise';
    return null;
  }

  // Wraps a single token (word + surrounding punctuation) in the appropriate spans.
  function processWord(rawToken) {
    const clean = cleanWord(rawToken);
    if (!clean) return rawToken;

    const leading  = rawToken.match(/^[^a-zA-Z]*/)[0];
    const trailing = rawToken.match(/[^a-zA-Z]*$/)[0];
    const body     = rawToken.slice(leading.length, rawToken.length - trailing.length);

    let inner = body;

    if (settings.boldBeginning) {
      const N      = bionicN(body.length);
      const anchor = body.slice(0, N);
      const rest   = body.slice(N);
      inner = rest.length <= 1
        ? `<b>${anchor}</b>${rest}`
        : `<b>${anchor}</b><span class="dra-bionic-fade">${rest[0]}</span>${rest.slice(1)}`;
    }

    if (settings.logicAnimation && LOGIC_WORDS.has(clean)) {
      return `${leading}<span class="dra-logic-word">${inner}</span>${trailing}`;
    }

    if (settings.emotionColor) {
      const cls = getEmotionClass(clean);
      if (cls) return `${leading}<span class="${cls}">${inner}</span>${trailing}`;
    }

    return `${leading}${inner}${trailing}`;
  }

  function renderSentence(s) {
    return s.split(/(\s+)/).map(tok => /^\s+$/.test(tok) ? tok : processWord(tok)).join('');
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

  // ── Transformations ────────────────────────────────────────────────────

  function applyTransformations() {
    contentArea = findContentArea();

    // Expose emotion colors as CSS variables so content.css can use them
    document.documentElement.style.setProperty('--dra-positive', settings.emotionPositiveColor);
    document.documentElement.style.setProperty('--dra-negative', settings.emotionNegativeColor);
    document.documentElement.style.setProperty('--dra-surprise', settings.emotionSurpriseColor);

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
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────

  chrome.storage.sync.get('draSettings', (data) => {
    if (data.draSettings) settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
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
  });

})();
