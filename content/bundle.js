(() => {
  // content/settings.js
  var DEFAULT_SETTINGS = {
    panelSize: "comfortable",
    typographyEnabled: false,
    readingAidsEnabled: false,
    boldBeginning: false,
    emotionColor: false,
    emotionMode: "local",
    // 'ai' | 'local'
    gradientRows: false,
    rowShadingColor: "#bfb3d0",
    transitionAnimation: false,
    sentenceLabels: false,
    sentenceLabelsMode: "local",
    // 'ai' | 'local'
    sentenceLabelsLens: "news",
    // 'news' | 'stem' | 'humanities' | 'fiction'
    labelCoreFactColor: "#eab308",
    labelContextColor: "#3b82f6",
    labelQuoteColor: "#ea580c",
    labelConceptColor: "#9333ea",
    labelMechanismColor: "#f97316",
    labelConstraintColor: "#ef4444",
    labelThesisColor: "#ca8a04",
    labelEvidenceColor: "#22c55e",
    labelExplanationColor: "#6b7280",
    labelDialogueColor: "#ec4899",
    labelPlotTurnColor: "#eab308",
    labelSettingColor: "#9ca3af",
    topicFocusMode: "local",
    // 'ai' | 'local'
    fontSize: null,
    lineHeight: null,
    fontFamily: null,
    wordSpacing: 0,
    letterSpacing: 0,
    emotionPositiveColor: "#27ae60",
    emotionNegativeColor: "#e74c3c",
    emotionComplexColor: "#8e44ad",
    rulerActive: false,
    rulerWindowLines: 1.5,
    autoScrollActive: false,
    autoScrollSpeed: 2
  };

  // content/state.js
  var state = {
    settings: { ...DEFAULT_SETTINGS },
    originalHTML: /* @__PURE__ */ new WeakMap(),
    contentArea: null,
    lastRulerY: null,
    emotionAIInProgress: false,
    sentenceLabelsInProgress: false,
    aiEmotionHighlights: [],
    aiSentenceLabels: [],
    articleHighlights: [],
    topicFocusKeywords: null,
    topicFocusAIPrefixes: null,
    wordLists: {
      emotionPositive: null,
      emotionNegative: null,
      emotionComplex: null,
      transition: null
    },
    sentenceLabels: [],
    allSentences: []
  };

  // content/detect.js
  var PLATFORM_SELECTORS = {
    "wikipedia.org": ["#mw-content-text .mw-parser-output", "#mw-content-text"],
    "github.com": [".markdown-body"],
    "news.ycombinator.com": [".fatitem"],
    "substack.com": [".reader2-post-body", ".available-content"],
    "dev.to": ["#article-body"]
  };
  function findContentArea() {
    const host = window.location.hostname.replace(/^www\./, "");
    const matchedDomain = Object.keys(PLATFORM_SELECTORS).find((domain) => host === domain || host.endsWith("." + domain));
    if (matchedDomain) {
      for (const sel of PLATFORM_SELECTORS[matchedDomain]) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 300) return el;
      }
    }
    const candidates = [
      '[itemprop="articleBody"]',
      "article",
      '[role="main"]',
      "main",
      ".article-body",
      ".article-content",
      ".post-content",
      ".entry-content",
      ".story-body",
      "#article-body",
      "#main-content"
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 300) return el;
    }
    return document.body;
  }

  // content/utils.js
  var ABBR = /* @__PURE__ */ new Set([
    "mr",
    "mrs",
    "ms",
    "dr",
    "prof",
    "rev",
    "sen",
    "rep",
    "gov",
    "gen",
    "lt",
    "col",
    "sgt",
    "capt",
    "adm",
    "st",
    "mt",
    "ave",
    "blvd",
    "rd",
    "jan",
    "feb",
    "mar",
    "apr",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
    "vs",
    "etc",
    "approx",
    "no",
    "vol"
  ]);
  function splitSentences(text) {
    const result = [];
    let start = 0;
    for (const m of text.matchAll(/(?<=[.!?])(\s+)(?=[A-Z"'\[])/g)) {
      const word = text.slice(0, m.index).match(/([a-zA-Z]+)[.!?]$/)?.[1] ?? "";
      if (/^[A-Z]$/.test(word) || ABBR.has(word.toLowerCase())) continue;
      result.push(text.slice(start, m.index));
      start = m.index + m[1].length;
    }
    result.push(text.slice(start));
    return result;
  }

  // content/features/typography.js
  function injectOpenDyslexicFont() {
    if (document.getElementById("dra-od-font")) return;
    const style = document.createElement("style");
    style.id = "dra-od-font";
    const base = chrome.runtime.getURL("fonts/");
    style.textContent = `
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('${base}OpenDyslexic-Regular.otf') format('opentype');
      font-weight: normal; font-style: normal;
    }
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('${base}OpenDyslexic-Bold.otf') format('opentype');
      font-weight: bold; font-style: normal;
    }
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('${base}OpenDyslexic-Italic.otf') format('opentype');
      font-weight: normal; font-style: italic;
    }
  `;
    document.head.appendChild(style);
  }

  // content/features/bionic.js
  function bionicN(len) {
    if (len <= 3) return 1;
    if (len <= 6) return 2;
    if (len <= 9) return 3;
    return 4;
  }
  function applyBionicToText(text) {
    return text.split(/(\s+)/).map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      const leading = tok.match(/^[^a-zA-Z]*/)[0];
      const trailing = tok.match(/[^a-zA-Z]*$/)[0];
      const body = tok.slice(leading.length, tok.length - trailing.length);
      if (!body) return tok;
      const N = bionicN(body.length);
      const anchor = body.slice(0, N);
      const rest = body.slice(N);
      const inner = rest.length <= 1 ? `<b>${anchor}</b>${rest}` : `<b>${anchor}</b><span class="dra-bionic-fade">${rest[0]}</span>${rest.slice(1)}`;
      return `${leading}${inner}${trailing}`;
    }).join("");
  }

  // content/features/emotions.js
  var DEFAULT_EMOTION_POSITIVE = [
    // Joy / Happiness
    "joy",
    "delight",
    "elation",
    "bliss",
    "euphoria",
    "jubilation",
    "glee",
    "cheerful",
    "merry",
    "ecstatic",
    // Love / Connection
    "love",
    "adore",
    "cherish",
    "embrace",
    "compassion",
    "empathy",
    "kindness",
    "warmth",
    "tender",
    "affection",
    // Hope / Optimism
    "hope",
    "optimism",
    "inspiration",
    "aspire",
    "dream",
    "vision",
    "faith",
    "belief",
    "confidence",
    "promise",
    // Admiration / Pride
    "proud",
    "admire",
    "celebrate",
    "triumph",
    "honor",
    "remarkable",
    "extraordinary",
    "magnificent",
    "outstanding",
    "brilliant",
    // Growth / Success
    "thrive",
    "flourish",
    "breakthrough",
    "achieve",
    "progress",
    "succeed",
    "innovate",
    "discover",
    "heal",
    "unite",
    // General positive
    "wonderful",
    "amazing",
    "incredible",
    "fantastic",
    "excellent",
    "beautiful",
    "glorious",
    "grateful",
    "courage",
    "strength"
  ];
  var DEFAULT_EMOTION_NEGATIVE = [
    // Fear / Dread
    "fear",
    "dread",
    "terror",
    "horror",
    "panic",
    "fright",
    "anxiety",
    "nightmare",
    "terrifying",
    "horrific",
    // Grief / Loss
    "grief",
    "sorrow",
    "mourning",
    "heartbreak",
    "anguish",
    "despair",
    "desolate",
    "tragic",
    "tragedy",
    "devastate",
    // Anger / Hatred
    "anger",
    "rage",
    "fury",
    "hatred",
    "hate",
    "wrath",
    "outrage",
    "indignation",
    "resentment",
    "hostility",
    // Pain / Suffering
    "suffer",
    "agony",
    "torment",
    "misery",
    "pain",
    "trauma",
    "brutal",
    "cruel",
    "ruthless",
    "savage",
    // Violence / Destruction
    "violence",
    "destroy",
    "collapse",
    "ruin",
    "catastrophe",
    "disaster",
    "crisis",
    "devastation",
    "atrocity",
    "massacre",
    // Injustice / Oppression
    "abuse",
    "betray",
    "corrupt",
    "injustice",
    "oppression",
    "discrimination",
    "poverty",
    "inequality",
    "exploitation",
    "shame",
    // Loss / Failure
    "loss",
    "failure",
    "defeat",
    "hopeless",
    "helpless",
    "powerless",
    "victim",
    "casualty",
    "threat",
    "danger"
  ];
  var DEFAULT_EMOTION_COMPLEX = [
    // Ambivalence
    "bittersweet",
    "ambivalent",
    "conflicted",
    "mixed",
    "paradox",
    "ironic",
    "contradictory",
    "ambiguous",
    // Uncertainty / Anxiety
    "uncertain",
    "uneasy",
    "anxious",
    "apprehensive",
    "troubled",
    "unsettled",
    "precarious",
    "fragile",
    "vulnerable",
    // Nostalgia / Longing
    "nostalgia",
    "wistful",
    "longing",
    "melancholy",
    "wistfulness",
    "yearning",
    "reminisce",
    "haunted",
    // Complexity
    "nuanced",
    "complicated",
    "dilemma",
    "tension",
    "controversial",
    "fraught",
    "delicate",
    "sensitive",
    "paradoxical",
    // Resignation / Cynicism
    "resigned",
    "cynical",
    "skeptical",
    "disillusioned",
    "weary",
    "exhausted",
    "sacrifice",
    "compromise",
    // Disturbing / Unsettling
    "disturbing",
    "troubling",
    "perplexing",
    "unsettling",
    "disconcerting",
    "harrowing",
    "sobering",
    "chilling"
  ];
  function generateEmotionHighlights() {
    const pos = state.wordLists.emotionPositive ?? DEFAULT_EMOTION_POSITIVE;
    const neg = state.wordLists.emotionNegative ?? DEFAULT_EMOTION_NEGATIVE;
    const cmp = state.wordLists.emotionComplex ?? DEFAULT_EMOTION_COMPLEX;
    const area = findContentArea();
    const text = area.innerText.toLowerCase();
    const highlights = [];
    for (const [words, category] of [
      [pos, "emotion-positive"],
      [neg, "emotion-negative"],
      [cmp, "emotion-complex"]
    ]) {
      for (const word of words) {
        const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`(?<![a-zA-Z-])${esc}(?![a-zA-Z-])`);
        if (rx.test(text)) highlights.push({ word, category });
      }
    }
    return highlights;
  }
  function requestEmotionAnalysis() {
    if (state.emotionAIInProgress) {
      chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "emotion", status: "loading" });
      return;
    }
    if (state.aiEmotionHighlights.length > 0) {
      chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "emotion", status: "success" });
      return;
    }
    state.emotionAIInProgress = true;
    chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "emotion", status: "loading" });
    const area = findContentArea();
    chrome.runtime.sendMessage({
      type: "EMOTION_REQUEST",
      url: window.location.href,
      text: area.innerText.trim()
    });
  }

  // content/features/transitions.js
  var DEFAULT_TRANSITION_WORDS = [
    // Contrast / Opposition
    "however",
    "nevertheless",
    "nonetheless",
    "notwithstanding",
    "conversely",
    "on the other hand",
    "on the contrary",
    "in contrast",
    "by contrast",
    "that said",
    "even so",
    "be that as it may",
    "then again",
    "rather",
    // Addition
    "furthermore",
    "moreover",
    "additionally",
    "likewise",
    "in addition",
    "by the same token",
    "in like manner",
    "in the same way",
    "in the same fashion",
    "coupled with",
    "not to mention",
    // Cause / Result
    "therefore",
    "thus",
    "hence",
    "consequently",
    "accordingly",
    "henceforth",
    "as a result",
    "for this reason",
    "thereupon",
    "in effect",
    "owing to",
    "as a consequence",
    "due to",
    "inasmuch as",
    // Concession
    "although",
    "albeit",
    "whereas",
    "regardless",
    "despite",
    "in spite of",
    "even though",
    "even if",
    "granted that",
    // Conclusion / Summary
    "in conclusion",
    "in summary",
    "in short",
    "in brief",
    "to summarize",
    "overall",
    "all in all",
    "on balance",
    "on the whole",
    "by and large",
    "in essence",
    "to sum up",
    "in the final analysis",
    "given these points",
    "all things considered",
    "in a word",
    "for the most part",
    // Emphasis / Clarification
    "in fact",
    "indeed",
    "notably",
    "in other words",
    "that is to say",
    "to put it differently",
    "to put it another way",
    "namely",
    "specifically",
    "in particular",
    "markedly",
    "above all",
    "most importantly",
    // Example
    "for example",
    "for instance",
    "to illustrate",
    "as an illustration",
    // Sequence / Time
    "meanwhile",
    "subsequently",
    "eventually",
    "formerly",
    "in the meantime",
    "sooner or later",
    "in due time",
    // Condition
    "provided that",
    "given that",
    "in the event that",
    "as long as",
    "on the condition that"
  ];
  function generateTransitionHighlights() {
    const words = state.wordLists.transition ?? DEFAULT_TRANSITION_WORDS;
    const area = findContentArea();
    const text = area.innerText.toLowerCase();
    const highlights = [];
    for (const phrase of words) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<![a-zA-Z-])${escaped}(?![a-zA-Z-])`);
      if (regex.test(text)) {
        highlights.push({ word: phrase, category: "transition" });
      }
    }
    return highlights;
  }

  // content/features/labels.js
  var LENS_RULES = {
    news: {
      "core-fact": [
        /\b(announced|confirmed|declared|signed|approved|passed|killed|arrested|elected|won|lost)\b/i,
        /\b(breaking|just in|update|developing)\b/i
      ],
      context: [
        /\b(in the wake of|following years of|historically|since \d{4}|long.standing|decades.long)\b/i,
        /\b(background|context|previously|at the time)\b/i
      ],
      quote: [
        /[""][^""]{8,}[""].*\b(said|told|stated|added|wrote)\b/i,
        /\b(said|according to|told reporters?|spokesperson)\b.*[""][^""]{5,}[""]/i
      ]
    },
    stem: {
      concept: [
        /\bis defined as\b/i,
        /\b(known as|referred to as|termed|called)\b/i,
        /\bthe (process|phenomenon|principle|law|theory|property) of\b/i
      ],
      mechanism: [
        /\b(first|then|next|subsequently|as a result|this causes|leading to|which triggers|therefore|thus|consequently)\b/i
      ],
      constraint: [
        /\b(however|but|except when|unless|only (when|if)|provided that|in the absence of)\b/i,
        /\b(limitation|caveat|assumption|cannot|does not apply|fails when)\b/i
      ]
    },
    humanities: {
      thesis: [
        /\b(this (paper|essay|article|study) (argues?|contends?|proposes?|demonstrates?))\b/i,
        /\b(I argue|I contend|my (claim|argument|thesis) is)\b/i
      ],
      evidence: [
        /\b(according to|cited in|as [A-Z][a-z]+ (\(\d{4}\))? (noted?|argues?|writes?))\b/i,
        /\b(historical records?|archival|census data|survey(s)?|statistics show)\b/i,
        /\(\d{4}[,)]/
      ],
      explanation: [
        /\b(this (means?|suggests?|indicates?|demonstrates?|reveals?|implies?))\b/i,
        /\b(in other words|that is to say|put differently|this is because)\b/i,
        /\b(explains? (why|how)|the reason (is|why|for))\b/i
      ]
    },
    fiction: {
      dialogue: [
        /^["""«].{5,}["""»]/,
        /\b(said|whispered|shouted|replied|asked|muttered|exclaimed|cried)\b/i
      ],
      "plot-turn": [
        /\b(suddenly|at that moment|without warning|for the first time|everything changed|realized|discovered|revealed)\b/i,
        /\b(shot|killed|ran|burst|collapsed|vanished|appeared|attacked|escaped)\b/i
      ],
      setting: [
        /\b(the (room|air|sky|street|forest|castle|ocean|light|darkness|silence))\b/i,
        /\b(smelled?|felt|looked|seemed|appeared|stretched|loomed|glittered|faded)\b/i
      ]
    }
  };
  function extractAllSentences() {
    const area = findContentArea();
    return area.innerText.split(/\n+/).filter((p) => p.trim().length > 20).flatMap((p) => splitSentences(p.trim()).filter((s) => s.trim()));
  }
  function generateSentenceLabels() {
    const lens = state.settings.sentenceLabelsLens ?? "news";
    const rules = LENS_RULES[lens];
    const sentences = extractAllSentences();
    const labels = [];
    sentences.forEach((s, i) => {
      for (const [type, patterns] of Object.entries(rules)) {
        if (patterns.some((rx) => rx.test(s))) {
          labels.push({ index: i, type });
          break;
        }
      }
    });
    return labels;
  }
  function requestSentenceLabels() {
    if (state.sentenceLabelsInProgress) {
      chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "labels", status: "loading" });
      return;
    }
    if (state.aiSentenceLabels.length > 0) {
      chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "labels", status: "success" });
      return;
    }
    state.sentenceLabelsInProgress = true;
    state.allSentences = extractAllSentences();
    chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "labels", status: "loading" });
    chrome.runtime.sendMessage({
      type: "LABEL_REQUEST",
      sentences: state.allSentences,
      articleLens: state.settings.sentenceLabelsLens ?? "news"
    });
  }

  // content/features/ruler.js
  function updateRuler(e) {
    state.lastRulerY = e.clientY;
    const halfH = Math.round(16 * 1.8 * state.settings.rulerWindowLines / 2);
    const topEl = document.getElementById("dra-ruler-top");
    const botEl = document.getElementById("dra-ruler-bottom");
    const winEl = document.getElementById("dra-ruler-window");
    if (!topEl) return;
    topEl.style.height = Math.max(0, e.clientY - halfH) + "px";
    botEl.style.top = e.clientY + halfH + "px";
    winEl.style.top = Math.max(0, e.clientY - halfH) + "px";
    winEl.style.height = halfH * 2 + "px";
  }
  function setupRuler() {
    if (document.getElementById("dra-ruler-top")) return;
    ["dra-ruler-top", "dra-ruler-bottom", "dra-ruler-window"].forEach((id) => {
      const el = document.createElement("div");
      el.id = id;
      document.body.appendChild(el);
    });
    document.addEventListener("mousemove", updateRuler);
    updateRuler({ clientY: state.lastRulerY ?? window.innerHeight / 2 });
  }
  function teardownRuler() {
    ["dra-ruler-top", "dra-ruler-bottom", "dra-ruler-window"].forEach((id) => {
      document.getElementById(id)?.remove();
    });
    document.removeEventListener("mousemove", updateRuler);
  }

  // content/features/autoScroll.js
  var frameId = null;
  var lastTime = null;
  var speedPxPerSecond = 30;
  function speedLevelToPixelsPerSecond(level) {
    const raw = Number(level);
    const safeLevel = raw > 10 ? Math.min(10, Math.max(1, Math.round(1 + (raw - 15) * 9 / 165))) : Math.min(10, Math.max(1, Math.round(raw || 2)));
    return 15 + (safeLevel - 1) * (165 / 9);
  }
  function tick(timestamp) {
    if (lastTime === null) lastTime = timestamp;
    const elapsedSeconds = (timestamp - lastTime) / 1e3;
    lastTime = timestamp;
    window.scrollBy({ top: speedPxPerSecond * elapsedSeconds, left: 0, behavior: "auto" });
    frameId = requestAnimationFrame(tick);
  }
  function setupAutoScroll(speed) {
    speedPxPerSecond = speedLevelToPixelsPerSecond(speed);
    if (frameId !== null) return;
    lastTime = null;
    frameId = requestAnimationFrame(tick);
  }
  function teardownAutoScroll() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    lastTime = null;
  }

  // content/features/topicFocus.js
  var STOP_WORDS = /* @__PURE__ */ new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "up",
    "about",
    "into",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "that",
    "this",
    "these",
    "those",
    "it",
    "its",
    "they",
    "them",
    "their",
    "we",
    "our",
    "you",
    "your",
    "he",
    "she",
    "his",
    "her",
    "not",
    "no",
    "nor",
    "so",
    "yet",
    "both",
    "if",
    "then",
    "than",
    "as",
    "also",
    "just",
    "only",
    "any",
    "all",
    "each",
    "every",
    "some",
    "such",
    "even",
    "more",
    "most",
    "other",
    "same",
    "very",
    "i",
    "me",
    "my",
    "who",
    "which",
    "what",
    "how",
    "when",
    "where",
    "why",
    "one",
    "two",
    "said",
    "says",
    "now",
    "still"
  ]);
  function extractKeywords(text) {
    return text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  }
  function scoreSentence(text, keywords) {
    const words = extractKeywords(text);
    const wordSet = new Set(words);
    let score = 0;
    for (const kw of keywords) {
      if (wordSet.has(kw)) {
        score += 3;
        continue;
      }
      if (kw.length >= 5) {
        const stem = kw.slice(0, Math.ceil(kw.length * 0.75));
        if (words.some((w) => w.startsWith(stem))) score += 1;
      }
    }
    return score;
  }
  function applyFocusMask(keywords) {
    document.querySelectorAll(".dra-sentence").forEach((el) => {
      const focused = scoreSentence(el.textContent, keywords) > 0;
      el.style.fontWeight = focused ? "700" : "";
      el.style.color = focused ? "" : "#aaa";
      el.style.opacity = "";
    });
  }
  function applyFocusMaskByPrefixes(prefixes) {
    document.querySelectorAll(".dra-sentence").forEach((el) => {
      const text = el.textContent.trim().slice(0, 30);
      const focused = prefixes.some((p) => text.startsWith(p.slice(0, 25)));
      el.style.fontWeight = focused ? "700" : "";
      el.style.color = focused ? "" : "#aaa";
      el.style.opacity = "";
    });
  }
  function clearFocusMask() {
    document.querySelectorAll(".dra-sentence").forEach((el) => {
      el.style.fontWeight = "";
      el.style.color = "";
      el.style.opacity = "";
    });
  }

  // content/features/selectionMenu.js
  var MENU_ID = "dra-word-menu";
  var listening = false;
  var _render = null;
  var KEY_MAP = {
    positive: "emotionPositive",
    negative: "emotionNegative",
    complex: "emotionComplex",
    transition: "transition"
  };
  var DEFAULT_MAP = {
    emotionPositive: DEFAULT_EMOTION_POSITIVE,
    emotionNegative: DEFAULT_EMOTION_NEGATIVE,
    emotionComplex: DEFAULT_EMOTION_COMPLEX,
    transition: DEFAULT_TRANSITION_WORDS
  };
  function getCurrentList(key) {
    return state.wordLists[key] ?? DEFAULT_MAP[key];
  }
  function getMenu() {
    return document.getElementById(MENU_ID);
  }
  function hideMenu() {
    const menu = getMenu();
    if (menu) menu.remove();
  }
  function showMenu(word, rect) {
    hideMenu();
    const menu = document.createElement("div");
    menu.id = MENU_ID;
    const label = document.createElement("span");
    label.id = "dra-word-menu-text";
    label.textContent = `"${word}"`;
    menu.appendChild(label);
    const actions = document.createElement("div");
    actions.id = "dra-word-menu-actions";
    const buttons = [
      { id: "positive", label: "Positive" },
      { id: "negative", label: "Negative" },
      { id: "complex", label: "Complex" },
      { id: "transition", label: "Transition" }
    ];
    buttons.forEach(({ id, label: btnLabel }) => {
      const key = KEY_MAP[id];
      const inList = getCurrentList(key).includes(word);
      const btn = document.createElement("button");
      btn.textContent = (inList ? "\u2713 " : "\uFF0B ") + btnLabel;
      if (inList) btn.classList.add("active");
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWord(word, key, inList);
        hideMenu();
      });
      actions.appendChild(btn);
    });
    menu.appendChild(actions);
    document.body.appendChild(menu);
    const menuH = menu.offsetHeight || 44;
    let top = rect.top + window.scrollY - menuH - 8;
    let left = rect.left + window.scrollX;
    if (left + menu.offsetWidth > window.innerWidth - 8) {
      left = window.innerWidth - menu.offsetWidth - 8;
    }
    if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + 8;
    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }
  function toggleWord(word, key, currentlyInList) {
    const current = getCurrentList(key);
    const updated = currentlyInList ? current.filter((w) => w !== word) : [.../* @__PURE__ */ new Set([...current, word])];
    state.wordLists = { ...state.wordLists, [key]: updated };
    chrome.storage.sync.set({ draWordLists: state.wordLists });
    chrome.runtime.sendMessage({ type: "WORDLISTS_CHANGED", wordLists: state.wordLists });
    if (_render) _render();
  }
  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      hideMenu();
      return;
    }
    const word = sel.toString().trim().toLowerCase();
    if (!word || word.length > 60 || /\s{2,}/.test(word)) {
      hideMenu();
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    showMenu(word, rect);
  }
  function onSelectionChange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hideMenu();
  }
  function setupSelectionMenu(renderFn) {
    _render = renderFn;
    if (listening) return;
    listening = true;
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);
  }
  function teardownSelectionMenu() {
    if (!listening) return;
    listening = false;
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("selectionchange", onSelectionChange);
    hideMenu();
  }

  // content/render.js
  function hasEmbeddedContent(el) {
    if (el.querySelector("img, svg, picture, video, audio, canvas, iframe, input, button, select")) return true;
    for (const child of el.querySelectorAll("i, span, a, em")) {
      if (!child.textContent.trim()) return true;
    }
    return false;
  }
  function renderSentence(s) {
    const matches = [];
    for (const h of state.articleHighlights) {
      if (h.context) {
        const normS = s.replace(/\s+/g, " ").toLowerCase();
        const normCtx = h.context.replace(/\*+/g, "").replace(/\s+/g, " ").toLowerCase().trim();
        if (normCtx && !normS.includes(normCtx)) continue;
      }
      const escaped = h.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<![a-zA-Z-])${escaped}(?![a-zA-Z-])`, "i");
      const m = regex.exec(s);
      if (m) matches.push({ start: m.index, end: m.index + m[0].length, h });
    }
    matches.sort((a, b) => a.start - b.start);
    const deduped = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        deduped.push(m);
        lastEnd = m.end;
      }
    }
    const bionic = (t) => state.settings.boldBeginning ? applyBionicToText(t) : t;
    if (deduped.length === 0) return bionic(s);
    let result = "";
    let pos = 0;
    for (const { start, end, h } of deduped) {
      if (pos < start) result += bionic(s.slice(pos, start));
      const inner = bionic(s.slice(start, end));
      if (state.settings.transitionAnimation && h.category === "transition") {
        result += `<span class="dra-transition-word">${inner}</span>`;
      } else if (state.settings.emotionColor && h.category.startsWith("emotion")) {
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
    const VALID_LABEL_TYPES = /* @__PURE__ */ new Set([
      "core-fact",
      "context",
      "quote",
      "concept",
      "mechanism",
      "constraint",
      "thesis",
      "evidence",
      "explanation",
      "dialogue",
      "plot-turn",
      "setting"
    ]);
    const sentenceLabelClass = (s) => {
      if (!state.settings.sentenceLabels) return "";
      const trimmed = s.trim();
      const idx = state.allSentences.findIndex((as) => as.slice(0, 25) === trimmed.slice(0, 25));
      const label = state.sentenceLabels.find((l) => l.index === idx);
      return VALID_LABEL_TYPES.has(label?.type) ? ` dra-label-${label.type}` : "";
    };
    return sentences.map(
      (s) => `<span class="dra-sentence${sentenceLabelClass(s)}">${renderSentence(s)}</span>`
    ).join(" ");
  }
  var INLINE_TAGS = /* @__PURE__ */ new Set([
    "a",
    "abbr",
    "b",
    "bdi",
    "cite",
    "code",
    "data",
    "del",
    "dfn",
    "em",
    "i",
    "ins",
    "kbd",
    "mark",
    "q",
    "s",
    "samp",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "time",
    "u",
    "var"
  ]);
  function extractInlineAnnotations(innerHTML) {
    const container = document.createElement("div");
    container.innerHTML = innerHTML;
    const annotations = [];
    let textPos = 0;
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        textPos += node.textContent.replace(/[ \t\r\n]+/g, " ").length;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const name = node.tagName.toLowerCase();
      if (name === "br") {
        textPos++;
        return;
      }
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
  function reInjectAnnotations(renderedHTML, annotations) {
    if (!annotations.length) return renderedHTML;
    const textToHtmlPos = [];
    let inTag = false;
    for (let i = 0; i < renderedHTML.length; i++) {
      const c = renderedHTML[i];
      if (c === "<") {
        inTag = true;
        continue;
      }
      if (c === ">") {
        inTag = false;
        continue;
      }
      if (!inTag) textToHtmlPos.push(i);
    }
    const sorted = annotations.map((a, idx) => ({ ...a, idx })).sort((a, b) => b.textPos - a.textPos || b.idx - a.idx);
    let result = renderedHTML;
    for (const { textPos, tag } of sorted) {
      const htmlPos = textPos < textToHtmlPos.length ? textToHtmlPos[textPos] : result.length;
      result = result.slice(0, htmlPos) + tag + result.slice(htmlPos);
    }
    return result;
  }
  function applyTransformations() {
    state.contentArea = findContentArea();
    document.documentElement.style.setProperty("--dra-positive", state.settings.emotionPositiveColor);
    document.documentElement.style.setProperty("--dra-negative", state.settings.emotionNegativeColor);
    document.documentElement.style.setProperty("--dra-complex", state.settings.emotionComplexColor);
    document.documentElement.style.setProperty("--dra-row-shading", state.settings.rowShadingColor);
    document.documentElement.style.setProperty("--dra-label-core-fact", state.settings.labelCoreFactColor);
    document.documentElement.style.setProperty("--dra-label-context", state.settings.labelContextColor);
    document.documentElement.style.setProperty("--dra-label-quote", state.settings.labelQuoteColor);
    document.documentElement.style.setProperty("--dra-label-concept", state.settings.labelConceptColor);
    document.documentElement.style.setProperty("--dra-label-mechanism", state.settings.labelMechanismColor);
    document.documentElement.style.setProperty("--dra-label-constraint", state.settings.labelConstraintColor);
    document.documentElement.style.setProperty("--dra-label-thesis", state.settings.labelThesisColor);
    document.documentElement.style.setProperty("--dra-label-evidence", state.settings.labelEvidenceColor);
    document.documentElement.style.setProperty("--dra-label-explanation", state.settings.labelExplanationColor);
    document.documentElement.style.setProperty("--dra-label-dialogue", state.settings.labelDialogueColor);
    document.documentElement.style.setProperty("--dra-label-plot-turn", state.settings.labelPlotTurnColor);
    document.documentElement.style.setProperty("--dra-label-setting", state.settings.labelSettingColor);
    state.contentArea.querySelectorAll("p, li, blockquote").forEach((para) => {
      if (para.innerText.trim().length < 20) return;
      if (state.settings.typographyEnabled) {
        injectOpenDyslexicFont();
        if (state.settings.fontSize) para.style.fontSize = state.settings.fontSize + "px";
        if (state.settings.lineHeight) para.style.lineHeight = String(state.settings.lineHeight);
        if (state.settings.fontFamily) para.style.fontFamily = state.settings.fontFamily;
        if (state.settings.wordSpacing) para.style.wordSpacing = state.settings.wordSpacing + "em";
        if (state.settings.letterSpacing) para.style.letterSpacing = state.settings.letterSpacing + "em";
        if (state.settings.fontColor) para.style.color = state.settings.fontColor;
      }
      const needsSentenceWrap = state.settings.emotionColor || state.settings.transitionAnimation || state.settings.sentenceLabels;
      const shouldWrap = state.settings.readingAidsEnabled && needsSentenceWrap || state.settings.typographyEnabled && state.settings.boldBeginning || state.topicFocusKeywords !== null || state.topicFocusAIPrefixes !== null;
      if (shouldWrap && !hasEmbeddedContent(para)) {
        const originalHTML = para.innerHTML;
        if (!state.originalHTML.has(para)) state.originalHTML.set(para, originalHTML);
        const annotations = extractInlineAnnotations(originalHTML);
        const rendered = buildParagraphHTML(para.innerText);
        para.innerHTML = reInjectAnnotations(rendered, annotations);
      }
      if (state.settings.readingAidsEnabled && state.settings.gradientRows) {
        const lh = parseFloat(getComputedStyle(para).lineHeight);
        para.style.backgroundImage = `repeating-linear-gradient(to bottom, color-mix(in srgb, var(--dra-row-shading) 18%, transparent) 0px, color-mix(in srgb, var(--dra-row-shading) 18%, transparent) ${lh}px, transparent ${lh}px, transparent ${lh * 2}px)`;
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
    state.contentArea.querySelectorAll("p, li, blockquote").forEach((para) => {
      if (state.originalHTML.has(para)) para.innerHTML = state.originalHTML.get(para);
      ["fontSize", "lineHeight", "fontFamily", "wordSpacing", "letterSpacing", "color", "backgroundImage"].forEach((prop) => {
        para.style[prop] = "";
      });
    });
    state.contentArea.style.background = "";
    teardownRuler();
  }
  function render() {
    removeTransformations();
    if (state.settings.readingAidsEnabled) {
      const transitionHL = state.settings.transitionAnimation ? generateTransitionHighlights() : [];
      const emotionHL = !state.settings.emotionColor ? [] : state.settings.emotionMode === "local" ? generateEmotionHighlights() : state.aiEmotionHighlights;
      state.articleHighlights = [...emotionHL, ...transitionHL];
      if (state.settings.sentenceLabels) {
        state.allSentences = extractAllSentences();
        if (state.settings.sentenceLabelsMode === "local") {
          state.sentenceLabels = generateSentenceLabels();
        } else {
          state.sentenceLabels = state.aiSentenceLabels;
        }
      }
      const needsEmotionAI = state.settings.emotionColor && state.settings.emotionMode === "ai";
      const needsLabelsAI = state.settings.sentenceLabels && state.settings.sentenceLabelsMode === "ai";
      if (needsEmotionAI) requestEmotionAnalysis();
      if (needsLabelsAI) requestSentenceLabels();
    }
    if (state.settings.typographyEnabled || state.settings.readingAidsEnabled || state.topicFocusKeywords || state.topicFocusAIPrefixes) {
      applyTransformations();
    } else {
      teardownAutoScroll();
    }
    if (state.topicFocusKeywords) {
      applyFocusMask(state.topicFocusKeywords);
    } else if (state.topicFocusAIPrefixes) {
      applyFocusMaskByPrefixes(state.topicFocusAIPrefixes);
    }
    const needsSelectionMenu = state.settings.readingAidsEnabled && (state.settings.emotionColor || state.settings.transitionAnimation);
    if (needsSelectionMenu) setupSelectionMenu(render);
    else teardownSelectionMenu();
  }

  // content/features/immersiveReader.js
  var READER_ID = "dra-immersive-reader";
  var MIN_BLOCK_LENGTH = 40;
  var LABEL_TYPES = /* @__PURE__ */ new Set([
    "core-fact",
    "context",
    "quote",
    "concept",
    "mechanism",
    "constraint",
    "thesis",
    "evidence",
    "explanation",
    "dialogue",
    "plot-turn",
    "setting"
  ]);
  var readerState = { theme: "warm" };
  var readerContent = { title: "", blocks: [] };
  var scrollFrameId = null;
  var scrollLastTime = null;
  var suppressStatusMessage = false;
  function escapeHTML(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function bionicN2(len) {
    if (len <= 3) return 1;
    if (len <= 6) return 2;
    if (len <= 9) return 3;
    return 4;
  }
  function bionicReaderText(text) {
    return text.split(/(\s+)/).map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      const leading = tok.match(/^[^a-zA-Z]*/)[0];
      const trailing = tok.match(/[^a-zA-Z]*$/)[0];
      const body = tok.slice(leading.length, tok.length - trailing.length);
      if (!body) return escapeHTML(tok);
      const n = bionicN2(body.length);
      const anchor = body.slice(0, n);
      const rest = body.slice(n);
      const inner = rest.length <= 1 ? `<b>${escapeHTML(anchor)}</b>${escapeHTML(rest)}` : `<b>${escapeHTML(anchor)}</b><span class="dra-bionic-fade">${escapeHTML(rest[0])}</span>${escapeHTML(rest.slice(1))}`;
      return `${escapeHTML(leading)}${inner}${escapeHTML(trailing)}`;
    }).join("");
  }
  function extractReaderContent() {
    const area = findContentArea();
    const title = document.querySelector("h1")?.innerText?.trim() || document.title || "Untitled";
    const seen = /* @__PURE__ */ new Set();
    const blocks = [...area.querySelectorAll("p, li, blockquote")].map((el) => el.innerText.replace(/\s+/g, " ").trim()).filter((text) => text.length >= MIN_BLOCK_LENGTH).filter((text) => {
      const key = text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (blocks.length === 0) {
      const fallback = area.innerText.split(/\n{2,}/).map((text) => text.replace(/\s+/g, " ").trim()).filter((text) => text.length >= MIN_BLOCK_LENGTH);
      return { title, blocks: fallback };
    }
    return { title, blocks };
  }
  function wordsForCategory(category) {
    if (category === "emotion-positive") return state.wordLists.emotionPositive ?? DEFAULT_EMOTION_POSITIVE;
    if (category === "emotion-negative") return state.wordLists.emotionNegative ?? DEFAULT_EMOTION_NEGATIVE;
    if (category === "emotion-complex") return state.wordLists.emotionComplex ?? DEFAULT_EMOTION_COMPLEX;
    if (category === "transition") return state.wordLists.transition ?? DEFAULT_TRANSITION_WORDS;
    return [];
  }
  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function collectMatches(text) {
    if (!state.settings.readingAidsEnabled) return [];
    const matches = [];
    const featureSets = [];
    if (state.settings.emotionColor) {
      if (state.settings.emotionMode === "local") {
        featureSets.push(["emotion-positive", wordsForCategory("emotion-positive")]);
        featureSets.push(["emotion-negative", wordsForCategory("emotion-negative")]);
        featureSets.push(["emotion-complex", wordsForCategory("emotion-complex")]);
      } else {
        const grouped = /* @__PURE__ */ new Map();
        state.aiEmotionHighlights.forEach((h) => {
          if (!grouped.has(h.category)) grouped.set(h.category, []);
          grouped.get(h.category).push(h.word);
        });
        grouped.forEach((words, category) => featureSets.push([category, words]));
      }
    }
    if (state.settings.transitionAnimation) {
      featureSets.push(["transition", wordsForCategory("transition")]);
    }
    featureSets.forEach(([category, words]) => {
      words.forEach((word) => {
        if (!word) return;
        const regex = new RegExp(`(?<![a-zA-Z-])${escapeRegex(word)}(?![a-zA-Z-])`, "gi");
        for (const m of text.matchAll(regex)) {
          matches.push({ start: m.index, end: m.index + m[0].length, category });
        }
      });
    });
    matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const result = [];
    let lastEnd = 0;
    matches.forEach((m) => {
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
    let result = "";
    let pos = 0;
    matches.forEach(({ start, end, category }) => {
      if (pos < start) result += inlineText(text.slice(pos, start));
      const inner = inlineText(text.slice(start, end));
      if (category === "transition") {
        result += `<span class="dra-transition-word">${inner}</span>`;
      } else if (category.startsWith("emotion")) {
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
    if (!state.settings.readingAidsEnabled || !state.settings.sentenceLabels) return "";
    const trimmed = sentence.trim();
    const sentenceIndex = state.allSentences.findIndex((as) => as.slice(0, 25) === trimmed.slice(0, 25));
    const label = state.sentenceLabels.find((l) => l.index === sentenceIndex);
    return LABEL_TYPES.has(label?.type) ? ` dra-label-${label.type}` : "";
  }
  function isFocusedSentence(sentence) {
    if (state.topicFocusKeywords) {
      const text = sentence.toLowerCase();
      return state.topicFocusKeywords.some((keyword) => text.includes(keyword));
    }
    if (state.topicFocusAIPrefixes) {
      const prefix = sentence.trim().slice(0, 30);
      return state.topicFocusAIPrefixes.some((p) => prefix.startsWith(p.slice(0, 25)));
    }
    return true;
  }
  function renderArticleHTML() {
    if (!readerContent.blocks.length) {
      return "<p>Argus could not find enough readable text on this page.</p>";
    }
    return readerContent.blocks.map((block) => {
      const sentences = splitSentences(block.trim()).filter(Boolean);
      const html = sentences.map((sentence) => {
        const cls = labelClassForSentence(sentence);
        const muted = isFocusedSentence(sentence) ? "" : " dra-reader-muted";
        return `<span class="dra-sentence${cls}${muted}">${renderInlineHighlights(sentence)}</span>`;
      }).join(" ");
      return `<p>${html}</p>`;
    }).join("");
  }
  function applyReaderStyle(root) {
    if (!root) return;
    const article = root.querySelector(".dra-reader-article");
    root.dataset.theme = readerState.theme;
    root.style.setProperty("--dra-positive", state.settings.emotionPositiveColor);
    root.style.setProperty("--dra-negative", state.settings.emotionNegativeColor);
    root.style.setProperty("--dra-complex", state.settings.emotionComplexColor);
    root.style.setProperty("--dra-row-shading", state.settings.rowShadingColor);
    root.style.setProperty("--dra-label-core-fact", state.settings.labelCoreFactColor);
    root.style.setProperty("--dra-label-context", state.settings.labelContextColor);
    root.style.setProperty("--dra-label-quote", state.settings.labelQuoteColor);
    root.style.setProperty("--dra-label-concept", state.settings.labelConceptColor);
    root.style.setProperty("--dra-label-mechanism", state.settings.labelMechanismColor);
    root.style.setProperty("--dra-label-constraint", state.settings.labelConstraintColor);
    root.style.setProperty("--dra-label-thesis", state.settings.labelThesisColor);
    root.style.setProperty("--dra-label-evidence", state.settings.labelEvidenceColor);
    root.style.setProperty("--dra-label-explanation", state.settings.labelExplanationColor);
    root.style.setProperty("--dra-label-dialogue", state.settings.labelDialogueColor);
    root.style.setProperty("--dra-label-plot-turn", state.settings.labelPlotTurnColor);
    root.style.setProperty("--dra-label-setting", state.settings.labelSettingColor);
    article.style.fontSize = state.settings.typographyEnabled && state.settings.fontSize ? `${state.settings.fontSize}px` : "";
    article.style.lineHeight = state.settings.typographyEnabled && state.settings.lineHeight ? String(state.settings.lineHeight) : "";
    article.style.fontFamily = state.settings.typographyEnabled && state.settings.fontFamily ? state.settings.fontFamily : "";
    article.style.wordSpacing = state.settings.typographyEnabled && state.settings.wordSpacing ? `${state.settings.wordSpacing}em` : "";
    article.style.letterSpacing = state.settings.typographyEnabled && state.settings.letterSpacing ? `${state.settings.letterSpacing}em` : "";
    article.style.color = state.settings.typographyEnabled && state.settings.fontColor ? state.settings.fontColor : "";
    article.style.background = state.settings.typographyEnabled && state.settings.bgColor ? state.settings.bgColor : "";
    root.classList.toggle("dra-reader-row-shading", Boolean(state.settings.readingAidsEnabled && state.settings.gradientRows));
    root.classList.toggle("dra-reader-ruler-active", Boolean(state.settings.readingAidsEnabled && state.settings.rulerActive));
    root.querySelectorAll("[data-reader-theme]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.readerTheme === readerState.theme);
    });
    updateReaderRuler({ clientY: state.lastRulerY ?? window.innerHeight / 2 });
    updateProgress(root);
    updateReaderAutoScroll(root);
  }
  function onKeydown(e) {
    if (e.key === "Escape") closeImmersiveReader();
  }
  function notifyReaderStatus(active) {
    chrome.runtime.sendMessage({ type: "IMMERSIVE_READER_STATUS", active });
  }
  function speedLevelToPixelsPerSecond2(level) {
    const safeLevel = Math.min(10, Math.max(1, Math.round(Number(level) || 2)));
    return 15 + (safeLevel - 1) * (165 / 9);
  }
  function stopReaderAutoScroll() {
    if (scrollFrameId !== null) cancelAnimationFrame(scrollFrameId);
    scrollFrameId = null;
    scrollLastTime = null;
  }
  function updateReaderAutoScroll(root) {
    stopReaderAutoScroll();
    if (!state.settings.readingAidsEnabled || !state.settings.autoScrollActive) return;
    const scrollEl = root.querySelector(".dra-reader-scroll");
    const speed = speedLevelToPixelsPerSecond2(state.settings.autoScrollSpeed);
    const tick2 = (timestamp) => {
      if (scrollLastTime === null) scrollLastTime = timestamp;
      const elapsedSeconds = (timestamp - scrollLastTime) / 1e3;
      scrollLastTime = timestamp;
      scrollEl.scrollTop += speed * elapsedSeconds;
      scrollFrameId = requestAnimationFrame(tick2);
    };
    scrollFrameId = requestAnimationFrame(tick2);
  }
  function updateProgress(root = document.getElementById(READER_ID)) {
    if (!root) return;
    const scrollEl = root.querySelector(".dra-reader-scroll");
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    const progress = max <= 0 ? 1 : scrollEl.scrollTop / max;
    root.style.setProperty("--dra-reader-progress", `${Math.min(1, Math.max(0, progress)) * 100}%`);
  }
  function updateReaderRuler(e) {
    const root = document.getElementById(READER_ID);
    if (!root) return;
    state.lastRulerY = e.clientY;
    const halfH = Math.round(16 * 1.8 * state.settings.rulerWindowLines / 2);
    root.querySelector(".dra-reader-ruler-top").style.height = Math.max(0, e.clientY - halfH) + "px";
    root.querySelector(".dra-reader-ruler-bottom").style.top = e.clientY + halfH + "px";
    root.querySelector(".dra-reader-ruler-window").style.top = Math.max(0, e.clientY - halfH) + "px";
    root.querySelector(".dra-reader-ruler-window").style.height = halfH * 2 + "px";
  }
  function wireReader(root) {
    const scrollEl = root.querySelector(".dra-reader-scroll");
    root.querySelector('[data-reader-action="close"]').addEventListener("click", closeImmersiveReader);
    root.querySelectorAll("[data-reader-theme]").forEach((btn) => {
      btn.addEventListener("click", () => {
        readerState.theme = btn.dataset.readerTheme;
        applyReaderStyle(root);
      });
    });
    scrollEl.addEventListener("scroll", () => updateProgress(root));
    root.addEventListener("mousemove", updateReaderRuler);
  }
  function refreshImmersiveReader() {
    const root = document.getElementById(READER_ID);
    if (!root) return;
    root.querySelector(".dra-reader-article").innerHTML = `
    <h1>${escapeHTML(readerContent.title)}</h1>
    ${renderArticleHTML()}
  `;
    applyReaderStyle(root);
  }
  function openImmersiveReader() {
    suppressStatusMessage = true;
    closeImmersiveReader();
    suppressStatusMessage = false;
    readerContent = extractReaderContent();
    readerState = { theme: "warm" };
    const root = document.createElement("div");
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
          <button class="dra-reader-close" data-reader-action="close" aria-label="Close">\xD7</button>
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
    document.documentElement.classList.add("dra-reader-open");
    wireReader(root);
    applyReaderStyle(root);
    document.addEventListener("keydown", onKeydown);
    notifyReaderStatus(true);
  }
  function closeImmersiveReader() {
    stopReaderAutoScroll();
    const hadReader = Boolean(document.getElementById(READER_ID));
    document.getElementById(READER_ID)?.remove();
    document.documentElement.classList.remove("dra-reader-open");
    document.removeEventListener("keydown", onKeydown);
    if (hadReader && !suppressStatusMessage) notifyReaderStatus(false);
  }

  // content/index.js
  var DEFAULT_WORD_LISTS = {
    emotionPositive: [...DEFAULT_EMOTION_POSITIVE],
    emotionNegative: [...DEFAULT_EMOTION_NEGATIVE],
    emotionComplex: [...DEFAULT_EMOTION_COMPLEX],
    transition: [...DEFAULT_TRANSITION_WORDS]
  };
  chrome.storage.sync.get(["draSettings", "draWordLists"], (data) => {
    if (data.draSettings) {
      state.settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
      if (state.settings.transitionAnimation === void 0 && data.draSettings.logicAnimation !== void 0) {
        state.settings.transitionAnimation = data.draSettings.logicAnimation;
      }
    }
    if (data.draWordLists) {
      state.wordLists = { ...state.wordLists, ...data.draWordLists };
    } else {
      state.wordLists = { ...DEFAULT_WORD_LISTS };
      chrome.storage.sync.set({ draWordLists: state.wordLists });
    }
    render();
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SETTINGS_CHANGED") {
      if (msg.payload.rulerActive === false) state.lastRulerY = null;
      const prevLens = state.settings.sentenceLabelsLens;
      state.settings = { ...state.settings, ...msg.payload };
      if (msg.payload.sentenceLabelsLens && msg.payload.sentenceLabelsLens !== prevLens) {
        state.aiSentenceLabels = [];
        state.sentenceLabels = [];
        state.sentenceLabelsInProgress = false;
      }
      render();
      refreshImmersiveReader();
    }
    if (msg.type === "FOCUS_APPLY" && msg.keywords?.length) {
      state.topicFocusAIPrefixes = null;
      state.topicFocusKeywords = msg.keywords;
      render();
      refreshImmersiveReader();
    }
    if (msg.type === "FOCUS_CLEAR") {
      state.topicFocusKeywords = null;
      state.topicFocusAIPrefixes = null;
      clearFocusMask();
      render();
      refreshImmersiveReader();
    }
    if (msg.type === "LABEL_RESULT") {
      state.sentenceLabelsInProgress = false;
      if (msg.labels?.length > 0) {
        state.aiSentenceLabels = msg.labels;
        state.sentenceLabels = state.aiSentenceLabels;
      }
      chrome.runtime.sendMessage({
        type: "AI_STATUS",
        feature: "labels",
        status: msg.labels?.length > 0 ? "success" : "error"
      });
      render();
      refreshImmersiveReader();
    }
    if (msg.type === "LABEL_ERROR") {
      state.sentenceLabelsInProgress = false;
      chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "labels", status: "error" });
    }
    if (msg.type === "FOCUS_AI_REQUEST") {
      state.topicFocusKeywords = null;
      const area = findContentArea();
      chrome.runtime.sendMessage({
        type: "FOCUS_ANALYZE",
        topic: msg.topic,
        text: area.innerText.trim()
      });
    }
    if (msg.type === "FOCUS_RESULT") {
      state.topicFocusAIPrefixes = msg.relevant || [];
      chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "focus", status: "success" });
      render();
      refreshImmersiveReader();
    }
    if (msg.type === "FOCUS_ERROR") {
      state.topicFocusAIPrefixes = null;
      chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "focus", status: "error" });
      clearFocusMask();
    }
    if (msg.type === "EMOTION_RESULT") {
      console.log("[EMO] result received | highlights:", msg.highlights?.length ?? "null");
      state.emotionAIInProgress = false;
      if (msg.highlights?.length > 0) {
        state.aiEmotionHighlights = msg.highlights;
      }
      chrome.runtime.sendMessage({
        type: "AI_STATUS",
        feature: "emotion",
        status: msg.highlights?.length > 0 ? "success" : "error"
      });
      render();
      refreshImmersiveReader();
    }
    if (msg.type === "EMOTION_ERROR") {
      state.emotionAIInProgress = false;
      chrome.runtime.sendMessage({ type: "AI_STATUS", feature: "emotion", status: "error" });
    }
    if (msg.type === "AI_RETRY") {
      if (msg.feature === "emotion") {
        state.aiEmotionHighlights = [];
        state.emotionAIInProgress = false;
      }
      if (msg.feature === "labels") {
        state.aiSentenceLabels = [];
        state.sentenceLabels = [];
        state.sentenceLabelsInProgress = false;
      }
      render();
    }
    if (msg.type === "WORDLISTS_CHANGED") {
      state.wordLists = { ...state.wordLists, ...msg.wordLists };
      render();
      refreshImmersiveReader();
    }
    if (msg.type === "OPEN_IMMERSIVE_READER") {
      openImmersiveReader();
    }
    if (msg.type === "CLOSE_IMMERSIVE_READER") {
      closeImmersiveReader();
    }
  });
})();
