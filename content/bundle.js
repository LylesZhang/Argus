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
    autoScrollSpeed: 2,
    typewriterActive: false,
    typewriterSpeed: 5
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
    "apnews.com": [".RichTextStoryBody"],
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
      if (!el || el.innerText.trim().length <= 300) continue;
      const idClass = ((el.id || "") + " " + (el.className || "")).toLowerCase();
      if (idClass.includes("comment") || idClass.includes("replies") || idClass.includes("discussion")) continue;
      return el;
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
  function matchEmotionWords(text, wordLists) {
    const pos = wordLists.emotionPositive ?? DEFAULT_EMOTION_POSITIVE;
    const neg = wordLists.emotionNegative ?? DEFAULT_EMOTION_NEGATIVE;
    const cmp = wordLists.emotionComplex ?? DEFAULT_EMOTION_COMPLEX;
    const lower = text.toLowerCase();
    const highlights = [];
    for (const [words, category] of [
      [pos, "emotion-positive"],
      [neg, "emotion-negative"],
      [cmp, "emotion-complex"]
    ]) {
      for (const word of words) {
        const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`(?<![a-zA-Z-])${esc}(?![a-zA-Z-])`);
        if (rx.test(lower)) highlights.push({ word, category });
      }
    }
    return highlights;
  }
  function generateEmotionHighlights() {
    const area = findContentArea();
    return matchEmotionWords(area.innerText, state.wordLists);
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
  var tw = null;
  var typeIntervalMs = speedLevelToTypeInterval(5);
  function speedLevelToTypeInterval(level) {
    const safeLevel = Math.min(10, Math.max(1, Math.round(Number(level) || 5)));
    return 70 - (safeLevel - 1) * (60 / 9);
  }
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
    const muted = isFocusedSentence(text) ? "" : " dra-reader-muted";
    return `<span class="dra-sentence${cls}${muted}">${renderInlineHighlights(text)}</span>`;
  }
  function renderPickStartArticle() {
    let html = '<div class="dra-tw-banner"><div class="dra-tw-banner-main">Click any sentence to start reading from there, or <button data-tw-action="start-beginning">Start from Beginning</button></div><div class="dra-tw-banner-hint">Press Space to continue, or press Space while typing to reveal the full paragraph.</div></div>';
    let openP = false;
    tw.flatSentences.forEach((s, i) => {
      if (s.isBlockStart) {
        if (openP) html += "</p>";
        html += "<p>";
        openP = true;
      }
      html += `<span class="dra-sentence dra-tw-pickable" data-tw-index="${i}">${escapeHTML(s.text)}</span> `;
    });
    if (openP) html += "</p>";
    return html;
  }
  function renderTypewriterArticle() {
    let html = "";
    let openP = false;
    for (let i = 0; i < tw.flatSentences.length && i <= tw.currentIndex; i++) {
      const s = tw.flatSentences[i];
      if (s.isBlockStart) {
        if (openP) html += "</p>";
        html += "<p>";
        openP = true;
      }
      const isCurrent = i === tw.currentIndex;
      if (!isCurrent) {
        html += renderCompletedSentence(s.text) + " ";
      } else if (tw.phase === "typing") {
        const partial = escapeHTML(s.text.slice(0, tw.revealedChars));
        html += `<span class="dra-sentence dra-tw-current dra-tw-typing">${partial}</span> `;
      } else {
        const cls = labelClassForSentence(s.text);
        const muted = isFocusedSentence(s.text) ? "" : " dra-reader-muted";
        html += `<span class="dra-sentence dra-tw-current${cls}${muted}">${renderInlineHighlights(s.text)}</span> `;
      }
    }
    if (openP) html += "</p>";
    if (tw.phase === "paused" && tw.showContinueHint) {
      html += '<div class="dra-tw-continue-hint">Space to continue</div>';
    }
    return html;
  }
  function renderTW() {
    const root = document.getElementById(READER_ID);
    if (!root || !tw) return;
    const body = tw.phase === "picking-start" ? renderPickStartArticle() : renderTypewriterArticle();
    root.querySelector(".dra-reader-article").innerHTML = `
    <h1>${escapeHTML(readerContent.title)}</h1>
    ${body}
  `;
    updateProgress(root);
  }
  function centerCurrentLine() {
    const root = document.getElementById(READER_ID);
    if (!root) return;
    const scrollEl = root.querySelector(".dra-reader-scroll");
    const cur = root.querySelector(".dra-tw-current");
    if (!scrollEl || !cur) return;
    const containerRect = scrollEl.getBoundingClientRect();
    const curRect = cur.getBoundingClientRect();
    const delta = curRect.top + curRect.height / 2 - (containerRect.top + containerRect.height / 2);
    scrollEl.scrollTop += delta;
  }
  function startTyping(index) {
    clearContinueHintTimer();
    clearInterval(tw.tickTimer);
    tw.currentIndex = index;
    tw.revealedChars = 0;
    tw.phase = "typing";
    tw.showContinueHint = false;
    const text = tw.flatSentences[index].text;
    renderTW();
    centerCurrentLine();
    tw.tickTimer = setInterval(() => {
      tw.revealedChars++;
      if (tw.revealedChars >= text.length) {
        clearInterval(tw.tickTimer);
        tw.phase = "paused";
        scheduleContinueHint();
      }
      renderTW();
      centerCurrentLine();
    }, typeIntervalMs);
  }
  function chooseStart(index) {
    const root = document.getElementById(READER_ID);
    if (root) root.querySelector(".dra-reader-scroll").classList.add("dra-tw-scroll-pad");
    tw.startIndex = index;
    startTyping(index);
  }
  function revealCurrentParagraph() {
    clearContinueHintTimer();
    clearInterval(tw.tickTimer);
    const current = tw.flatSentences[tw.currentIndex];
    while (tw.currentIndex + 1 < tw.flatSentences.length && tw.flatSentences[tw.currentIndex + 1].blockIndex === current.blockIndex) {
      tw.currentIndex++;
    }
    tw.revealedChars = tw.flatSentences[tw.currentIndex].text.length;
    tw.phase = "paused";
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
      if (!tw || tw.phase !== "paused") return;
      tw.showContinueHint = true;
      renderTW();
    }, 2e3);
  }
  function handleSpace() {
    if (!tw) return;
    if (tw.phase === "picking-start") {
      chooseStart(0);
      return;
    }
    if (tw.phase === "typing") {
      revealCurrentParagraph();
      return;
    }
    if (tw.phase === "paused") {
      clearContinueHintTimer();
      tw.showContinueHint = false;
      if (tw.currentIndex + 1 < tw.flatSentences.length) {
        startTyping(tw.currentIndex + 1);
      } else {
        tw.phase = "finished";
        renderTW();
      }
    }
  }
  function setTypewriterActive(active) {
    const root = document.getElementById(READER_ID);
    if (!root) return;
    const scrollEl = root.querySelector(".dra-reader-scroll");
    if (active && !tw) {
      tw = {
        phase: "picking-start",
        flatSentences: buildFlatSentences(),
        startIndex: null,
        currentIndex: -1,
        revealedChars: 0,
        tickTimer: null,
        continueHintTimer: null,
        showContinueHint: false
      };
      renderTW();
      updateReaderAutoScroll(root);
    } else if (!active && tw) {
      clearInterval(tw.tickTimer);
      clearContinueHintTimer();
      tw = null;
      scrollEl.classList.remove("dra-tw-scroll-pad");
      root.querySelector(".dra-reader-article").innerHTML = `
      <h1>${escapeHTML(readerContent.title)}</h1>
      ${renderArticleHTML()}
    `;
      updateProgress(root);
      updateReaderAutoScroll(root);
    }
  }
  function setTypewriterSpeed(level) {
    typeIntervalMs = speedLevelToTypeInterval(level);
  }
  function startTypewriterFromBeginning() {
    const root = document.getElementById(READER_ID);
    if (!root) return;
    const scrollEl = root.querySelector(".dra-reader-scroll");
    if (!tw) {
      tw = {
        phase: "picking-start",
        flatSentences: buildFlatSentences(),
        startIndex: null,
        currentIndex: -1,
        revealedChars: 0,
        tickTimer: null,
        continueHintTimer: null,
        showContinueHint: false
      };
      scrollEl?.classList.add("dra-tw-scroll-pad");
    }
    root.querySelector('[data-reader-action="typewriter"]')?.classList.add("active");
    updateReaderAutoScroll(root);
    chooseStart(0);
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
    article.style.color = "";
    article.style.background = "";
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
    if (e.key === "Escape") {
      closeImmersiveReader();
      return;
    }
    if (e.key === " " && tw) {
      e.preventDefault();
      handleSpace();
    }
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
    if (tw) return;
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
    if (tw) {
      const total = tw.flatSentences.length;
      let progress2 = 0;
      if (tw.phase === "finished") {
        progress2 = 1;
      } else if (total > 0 && tw.currentIndex >= 0) {
        progress2 = (tw.currentIndex + 1) / total;
      }
      root.style.setProperty("--dra-reader-progress", `${Math.min(1, Math.max(0, progress2)) * 100}%`);
      return;
    }
    const scrollEl = root.querySelector(".dra-reader-scroll");
    if (!scrollEl) return;
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
    root.querySelector(".dra-reader-article").addEventListener("click", (e) => {
      if (!tw) return;
      if (e.target.closest('[data-tw-action="start-beginning"]')) {
        chooseStart(0);
        return;
      }
      if (tw.phase === "picking-start") {
        const el = e.target.closest("[data-tw-index]");
        if (el) chooseStart(Number(el.dataset.twIndex));
      }
    });
    scrollEl.addEventListener("scroll", () => updateProgress(root));
    root.addEventListener("mousemove", updateReaderRuler);
  }
  function refreshImmersiveReader() {
    const root = document.getElementById(READER_ID);
    if (!root) return;
    if (tw) {
      renderTW();
      applyReaderStyle(root);
      return;
    }
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
    tw = null;
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
    if (tw) {
      clearInterval(tw.tickTimer);
      clearContinueHintTimer();
      tw = null;
    }
    stopReaderAutoScroll();
    const hadReader = Boolean(document.getElementById(READER_ID));
    document.getElementById(READER_ID)?.remove();
    document.documentElement.classList.remove("dra-reader-open");
    document.removeEventListener("keydown", onKeydown);
    if (hadReader && !suppressStatusMessage) notifyReaderStatus(false);
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
    refreshImmersiveReader();
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
    if (!state.contentArea || !document.contains(state.contentArea)) {
      state.contentArea = findContentArea();
    }
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

  // content/features/sampleArticles.js
  var SAMPLE_ARTICLES = {
    news: {
      title: "City Council Approves New Climate Action Plan",
      imagePlaceholders: [{ caption: "City Council Meeting", position: 1 }],
      blocks: [
        "The city council unanimously approved a landmark climate action plan on Tuesday, declaring a full transition to renewable energy by 2035. Officials confirmed the measure passed after months of tense deliberation, marking a triumph for environmental advocates who celebrated the victory outside city hall.",
        'However, critics argue the timeline is too ambitious and may devastate local industries. "This decision will destroy thousands of jobs," warned opposition leader Sarah Kim. "We admire the hope behind it, but fear the grief it could bring to working families."',
        "In contrast, supporters expressed joy and optimism. The mayor announced that federal funding will help ease the transition, and community leaders praised the plan as a brilliant breakthrough for a more sustainable future.",
        "Nevertheless, the road ahead remains uncertain. Analysts confirmed that similar policies in other cities have faced fierce resistance. Despite this, advocates remain confident and united in their pursuit of progress."
      ],
      aiEmotionHighlights: [
        // paragraphs 1–2
        { word: "tense", context: " of tense ", category: "emotion-negative" },
        { word: "triumph", context: "g a triumph", category: "emotion-positive" },
        { word: "celebrated", context: "ebrated the", category: "emotion-positive" },
        { word: "ambitious", context: "is too ambi", category: "emotion-complex" },
        { word: "devastate", context: "y devastate", category: "emotion-negative" },
        { word: "destroy", context: "will destroy", category: "emotion-negative" },
        // paragraphs 3–4 (API results from per-paragraph calls)
        { word: "joy", context: "essed joy", category: "emotion-positive" },
        { word: "optimism", context: "and optim", category: "emotion-positive" },
        { word: "praised", context: "rs praised", category: "emotion-positive" },
        { word: "brilliant breakthrough", context: "a brilliant breakth", category: "emotion-positive" },
        { word: "uncertain", context: "remains un", category: "emotion-negative" },
        { word: "fierce", context: "faced fier", category: "emotion-negative" },
        { word: "resistance", context: "ce resistance", category: "emotion-negative" },
        { word: "confident", context: "remain con", category: "emotion-positive" }
      ],
      aiSentenceLabels: [
        { index: 0, type: "core-fact" },
        { index: 1, type: "context" },
        { index: 2, type: "context" },
        { index: 3, type: "quote" },
        { index: 4, type: "quote" },
        { index: 5, type: "context" },
        { index: 6, type: "context" },
        { index: 7, type: "context" },
        { index: 8, type: "context" },
        { index: 9, type: "context" }
      ]
    },
    stem: {
      title: "Neural Networks Learn to Predict Protein Folding",
      imagePlaceholders: [{ caption: "Protein Structure Diagram", position: 1 }],
      blocks: [
        "Protein folding is defined as the process by which a polypeptide chain assumes its functional three-dimensional structure. Understanding this mechanism has been a central challenge in structural biology for decades.",
        "The algorithm then applies a multi-layer attention mechanism to iteratively refine spatial coordinates. Subsequently, predicted distances between amino acid residues are used to constrain the final structure. This mechanism explains why the model outperforms classical approaches.",
        "However, the model struggles with intrinsically disordered proteins, which lack a stable fold. Unless the training dataset is expanded, performance on novel protein families may remain limited. Despite this constraint, the results represent a significant breakthrough.",
        "In conclusion, neural network-based protein structure prediction is defined as a transformative approach that subsequently enables rapid drug discovery pipelines. This concept opens new avenues for treating diseases that were previously considered untreatable."
      ],
      aiEmotionHighlights: [
        { word: "challenge", context: "ral challenge", category: "emotion-negative" },
        { word: "struggles", context: "model struggles", category: "emotion-negative" },
        { word: "limited", context: "may remain limited", category: "emotion-negative" },
        { word: "breakthrough", context: "nt breakthrough", category: "emotion-positive" },
        { word: "transformative", context: "a transformative", category: "emotion-positive" },
        { word: "untreatable", context: "sidered untreatable", category: "emotion-negative" }
      ],
      aiSentenceLabels: [
        { index: 0, type: "concept" },
        { index: 2, type: "mechanism" },
        { index: 3, type: "mechanism" },
        { index: 4, type: "mechanism" },
        { index: 5, type: "constraint" },
        { index: 6, type: "constraint" },
        { index: 8, type: "concept" }
      ]
    },
    humanities: {
      title: "The Role of Silence in Modernist Literature",
      imagePlaceholders: [{ caption: "Virginia Woolf, 1902", position: 0 }],
      blocks: [
        "This paper argues that modernist writers strategically deployed silence as a rhetorical device to challenge the expressive limits of language itself. Rather than treating silence as absence, authors such as Woolf and Beckett reimagined it as a form of meaning-making.",
        "Historical records show that the modernist movement emerged in direct response to the trauma of World War I, as cited in several contemporary literary journals. The unprecedented scale of destruction left writers searching for new forms of expression.",
        "This means that the fragmented syntax characteristic of modernist prose is not merely an aesthetic choice but a deliberate enactment of linguistic crisis. In other words, the breakdown of narrative coherence mirrors the breakdown of social and moral certainty.",
        "The evidence gathered from close readings of three canonical texts suggests a consistent pattern of strategic omission. In sum, silence in modernist literature functions as a powerful counter-discourse, resisting the totalizing claims of both realism and romanticism."
      ],
      aiEmotionHighlights: [
        { word: "trauma", context: "of World ", category: "emotion-negative" },
        { word: "unprecedented", context: "The unpre", category: "emotion-complex" },
        { word: "destruction", context: "e of dest", category: "emotion-negative" },
        { word: "crisis", context: "linguisti", category: "emotion-negative" },
        { word: "breakdown", context: "s, the bre", category: "emotion-negative" },
        { word: "resisting", context: "course, r", category: "emotion-complex" }
      ],
      aiSentenceLabels: [
        { index: 0, type: "thesis" },
        { index: 1, type: "explanation" },
        { index: 2, type: "evidence" },
        { index: 3, type: "explanation" },
        { index: 4, type: "explanation" },
        { index: 5, type: "explanation" },
        { index: 6, type: "evidence" },
        { index: 7, type: "thesis" }
      ]
    },
    fiction: {
      title: "The Last Garden",
      imagePlaceholders: [{ caption: "The overgrown garden at dusk", position: 2 }],
      blocks: [
        `"You shouldn't have come back," she said quietly, her voice barely audible above the rain. He stood in the doorway, water dripping from his coat, saying nothing for a long moment.`,
        "The room smelled of old books and dried lavender. A single candle flickered on the windowsill, casting long shadows across the faded wallpaper. Outside, the storm had settled into a steady, mournful rhythm.",
        `Suddenly he realized she was trembling \u2014 not from cold, but from something deeper, something he had carried into the room with him like a ghost. "I'm sorry," he said at last. "I didn't know where else to go."`,
        "She turned slowly toward the window. The garden beyond was dark and overgrown, but she could still see the outline of the old oak tree where they had carved their names as children. It felt like another life, another world entirely."
      ],
      aiEmotionHighlights: [
        { word: "quietly", context: "said quie", category: "emotion-negative" },
        { word: "barely audible", context: "e barely ", category: "emotion-negative" },
        { word: "mournful", context: "a mournfu", category: "emotion-negative" },
        { word: "trembling", context: "was trem", category: "emotion-negative" },
        { word: "ghost", context: "like a g", category: "emotion-complex" },
        { word: "sorry", context: "I'm sorr", category: "emotion-negative" }
      ],
      aiSentenceLabels: [
        { index: 0, type: "dialogue" },
        { index: 1, type: "setting" },
        { index: 2, type: "setting" },
        { index: 3, type: "setting" },
        { index: 4, type: "setting" },
        { index: 5, type: "plot-turn" },
        { index: 6, type: "dialogue" },
        { index: 7, type: "dialogue" },
        { index: 8, type: "setting" },
        { index: 9, type: "setting" },
        { index: 10, type: "setting" }
      ]
    }
  };

  // content/features/presetPreviewRender.js
  function escapeHTML2(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function getSentenceLabels(blocks, lens) {
    const rules = LENS_RULES[lens] ?? LENS_RULES.news;
    const allSentences = blocks.flatMap((b) => splitSentences(b.trim()).filter(Boolean));
    const labels = [];
    allSentences.forEach((s, i) => {
      for (const [type, patterns] of Object.entries(rules)) {
        if (patterns.some((rx) => rx.test(s))) {
          labels.push({ index: i, type });
          break;
        }
      }
    });
    return { allSentences, labels };
  }
  function renderSentenceText(sentence, settings, emotionHighlights, transitionWords) {
    if (!settings.readingAidsEnabled) {
      return settings.boldBeginning ? applyBionicToText(sentence) : escapeHTML2(sentence);
    }
    const lower = sentence.toLowerCase();
    const spans = [];
    if (settings.emotionColor) {
      for (const { word, category } of emotionHighlights) {
        const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`(?<![a-zA-Z-])${esc}(?![a-zA-Z-])`, "gi");
        for (const m of lower.matchAll(rx)) {
          spans.push({ start: m.index, end: m.index + m[0].length, cls: `dra-pe-${category}` });
        }
      }
    }
    if (settings.transitionAnimation) {
      for (const word of transitionWords) {
        const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`(?<![a-zA-Z-])${esc}(?![a-zA-Z-])`, "gi");
        for (const m of lower.matchAll(rx)) {
          spans.push({ start: m.index, end: m.index + m[0].length, cls: "dra-transition-word" });
        }
      }
    }
    if (!spans.length) {
      return settings.boldBeginning ? applyBionicToText(sentence) : escapeHTML2(sentence);
    }
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const deduped = [];
    let last = 0;
    for (const sp of spans) {
      if (sp.start >= last) {
        deduped.push(sp);
        last = sp.end;
      }
    }
    const inline = (s) => settings.boldBeginning ? applyBionicToText(s) : escapeHTML2(s);
    let result = "";
    let pos = 0;
    for (const { start, end, cls } of deduped) {
      if (pos < start) result += inline(sentence.slice(pos, start));
      result += `<span class="${cls}">${inline(sentence.slice(start, end))}</span>`;
      pos = end;
    }
    if (pos < sentence.length) result += inline(sentence.slice(pos));
    return result;
  }
  function renderPreviewArticle(article, settings, wordLists, { externalEmotions, externalLabels } = {}) {
    const { blocks } = article;
    const lens = settings.sentenceLabelsLens ?? "news";
    const useAILabels = settings.readingAidsEnabled && settings.sentenceLabels && settings.sentenceLabelsMode === "ai" && externalLabels;
    const useLocalLabels = settings.readingAidsEnabled && settings.sentenceLabels && settings.sentenceLabelsMode !== "ai";
    const { allSentences, labels } = useAILabels || useLocalLabels ? getSentenceLabels(blocks, lens) : { allSentences: [], labels: [] };
    const finalLabels = useAILabels ? externalLabels : labels;
    const useAIEmotion = settings.readingAidsEnabled && settings.emotionColor && settings.emotionMode === "ai" && externalEmotions;
    const emotionHighlights = useAIEmotion ? externalEmotions : settings.readingAidsEnabled && settings.emotionColor ? matchEmotionWords(blocks.join(" "), wordLists) : [];
    const transitionWords = settings.readingAidsEnabled && settings.transitionAnimation ? wordLists.transition ?? DEFAULT_TRANSITION_WORDS : [];
    const LABEL_TYPES2 = /* @__PURE__ */ new Set([
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
    let sIdx = 0;
    const paragraphs = blocks.map((block, blockIdx) => {
      const sentences = splitSentences(block.trim()).filter(Boolean);
      const html = sentences.map((sentence) => {
        const labelEntry = finalLabels.find((l) => l.index === sIdx);
        const labelCls = labelEntry && LABEL_TYPES2.has(labelEntry.type) ? ` dra-label-${labelEntry.type}` : "";
        sIdx++;
        const inner = renderSentenceText(sentence, settings, emotionHighlights, transitionWords);
        return `<span class="dra-sentence${labelCls}">${inner}</span>`;
      }).join(" ");
      const imgPlaceholder = (article.imagePlaceholders ?? []).find((p) => p.position === blockIdx);
      const imgHtml = imgPlaceholder ? `<div class="dra-pe-img-placeholder">\u{1F4F7} <em>${escapeHTML2(imgPlaceholder.caption)}</em></div>` : "";
      return `<p>${html}</p>${imgHtml}`;
    });
    return paragraphs.join("");
  }
  function updateRulerOverlay(container, show) {
    let wrap = container.querySelector(".dra-pe-ruler-wrap");
    if (!show) {
      wrap?.remove();
      return;
    }
    if (wrap) return;
    wrap = document.createElement("div");
    wrap.className = "dra-pe-ruler-wrap";
    wrap.innerHTML = `
    <div class="dra-pe-ruler-top"></div>
    <div class="dra-pe-ruler-window"></div>
    <div class="dra-pe-ruler-bottom"></div>`;
    container.appendChild(wrap);
  }
  function updateRulerPosition(container, localY, halfWin) {
    const wrap = container.querySelector(".dra-pe-ruler-wrap");
    if (!wrap) return;
    wrap.style.transform = `translateY(${container.scrollTop || 0}px)`;
    const totalH = container.clientHeight || 400;
    const topH = Math.max(0, Math.min(localY - halfWin, totalH));
    const winH = Math.min(halfWin * 2, totalH - topH);
    const botT = topH + winH;
    const botH = Math.max(0, totalH - botT);
    wrap.querySelector(".dra-pe-ruler-top").style.cssText = `position:absolute;left:0;right:0;top:0;height:${topH}px;background:rgba(0,0,0,0.38)`;
    wrap.querySelector(".dra-pe-ruler-window").style.cssText = `position:absolute;left:0;right:0;top:${topH}px;height:${winH}px;background:rgba(255,243,180,0.18);border-top:1px solid rgba(200,170,0,0.3);border-bottom:1px solid rgba(200,170,0,0.3)`;
    wrap.querySelector(".dra-pe-ruler-bottom").style.cssText = `position:absolute;left:0;right:0;top:${botT}px;height:${botH}px;background:rgba(0,0,0,0.38)`;
  }
  function applyPreviewStyles(container, settings, actions = {}) {
    const s = settings;
    container.style.setProperty("--dra-positive", s.emotionPositiveColor ?? "#27ae60");
    container.style.setProperty("--dra-negative", s.emotionNegativeColor ?? "#e74c3c");
    container.style.setProperty("--dra-complex", s.emotionComplexColor ?? "#8e44ad");
    container.style.setProperty("--dra-row-shading", s.rowShadingColor ?? "#bfb3d0");
    const labelColors = {
      "core-fact": s.labelCoreFactColor ?? "#eab308",
      "context": s.labelContextColor ?? "#3b82f6",
      "quote": s.labelQuoteColor ?? "#ea580c",
      "concept": s.labelConceptColor ?? "#9333ea",
      "mechanism": s.labelMechanismColor ?? "#f97316",
      "constraint": s.labelConstraintColor ?? "#ef4444",
      "thesis": s.labelThesisColor ?? "#ca8a04",
      "evidence": s.labelEvidenceColor ?? "#22c55e",
      "explanation": s.labelExplanationColor ?? "#6b7280",
      "dialogue": s.labelDialogueColor ?? "#ec4899",
      "plot-turn": s.labelPlotTurnColor ?? "#eab308",
      "setting": s.labelSettingColor ?? "#9ca3af"
    };
    for (const [key, val] of Object.entries(labelColors)) {
      container.style.setProperty(`--dra-label-${key}`, val);
    }
    const article = container.querySelector(".dra-pe-article");
    if (!article) return;
    if (s.typographyEnabled && s.fontFamily?.includes("OpenDyslexic")) {
      injectOpenDyslexicFont();
    }
    article.style.fontFamily = s.typographyEnabled && s.fontFamily ? s.fontFamily : "";
    article.style.fontSize = s.typographyEnabled && s.fontSize ? `${s.fontSize}px` : "";
    article.style.lineHeight = s.typographyEnabled && s.lineHeight ? String(s.lineHeight) : "";
    article.style.wordSpacing = s.typographyEnabled && s.wordSpacing ? `${s.wordSpacing}em` : "";
    article.style.letterSpacing = s.typographyEnabled && s.letterSpacing ? `${s.letterSpacing}em` : "";
    const isReaderMode = Boolean(actions?.autoOpenReaderMode);
    article.style.color = s.typographyEnabled && s.fontColor && !isReaderMode ? s.fontColor : "";
    article.style.background = s.typographyEnabled && s.bgColor && !isReaderMode ? s.bgColor : "";
    container.classList.toggle("dra-pe-row-shading", Boolean(s.readingAidsEnabled && s.gradientRows));
    updateRulerOverlay(container, Boolean(s.readingAidsEnabled && s.rulerActive));
    container.classList.toggle("dra-pe-reader-mode-on", isReaderMode);
    container.style.background = isReaderMode ? "#f4f0e7" : "";
  }

  // content/features/presetEditor.js
  var EDITOR_ID = "dra-preset-editor";
  function genPresetId() {
    return "preset_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }
  async function loadPresets() {
    return new Promise((resolve) => {
      chrome.storage.sync.get("draPresets", (d) => resolve(d.draPresets ?? { byId: {}, order: [], activeId: null }));
    });
  }
  async function savePresets(presets) {
    return new Promise((resolve) => chrome.storage.sync.set({ draPresets: presets }, resolve));
  }
  function normalizePresetName(name) {
    return name.trim().toLowerCase();
  }
  function hasPresetName(presets, name, exceptId = null) {
    const normalized = normalizePresetName(name);
    return Object.values(presets.byId ?? {}).some(
      (p) => p?.id !== exceptId && normalizePresetName(p?.name ?? "") === normalized
    );
  }
  function applySettingsLocally(settings, actions) {
    state.settings = { ...state.settings, ...settings };
    chrome.storage.sync.set({ draSettings: state.settings });
    render();
    refreshImmersiveReader();
    if (actions?.autoOpenReaderMode === true) openImmersiveReader();
    if (actions?.autoOpenReaderMode === false) closeImmersiveReader();
  }
  var draft = null;
  function initDraft(mode, { currentSettings, preset } = {}) {
    const baseSettings = mode === "modify" ? { ...preset.settings } : { ...DEFAULT_SETTINGS, ...state.settings, ...currentSettings ?? {} };
    const s = {};
    for (const k of PRESET_KEYS) s[k] = baseSettings[k] ?? DEFAULT_SETTINGS[k];
    draft = {
      mode,
      presetId: mode === "modify" ? preset.id : null,
      name: mode === "modify" ? preset.name : "",
      settings: s,
      actions: mode === "modify" ? { autoOpenReaderMode: preset.actions?.autoOpenReaderMode ?? false } : { autoOpenReaderMode: false }
    };
  }
  var PRESET_KEYS = [
    "typographyEnabled",
    "fontFamily",
    "boldBeginning",
    "fontSize",
    "lineHeight",
    "wordSpacing",
    "letterSpacing",
    "fontColor",
    "bgColor",
    "typewriterSpeed",
    "readingAidsEnabled",
    "gradientRows",
    "rowShadingColor",
    "transitionAnimation",
    "rulerActive",
    "rulerWindowLines",
    "autoScrollSpeed",
    "emotionColor",
    "emotionMode",
    "emotionPositiveColor",
    "emotionNegativeColor",
    "emotionComplexColor",
    "sentenceLabels",
    "sentenceLabelsMode",
    "sentenceLabelsLens",
    "labelCoreFactColor",
    "labelContextColor",
    "labelQuoteColor",
    "labelConceptColor",
    "labelMechanismColor",
    "labelConstraintColor",
    "labelThesisColor",
    "labelEvidenceColor",
    "labelExplanationColor",
    "labelDialogueColor",
    "labelPlotTurnColor",
    "labelSettingColor",
    "panelSize"
  ];
  function refreshPreview() {
    const root = document.getElementById(EDITOR_ID);
    if (!root || !draft) return;
    const s = draft.settings;
    const lens = s.sentenceLabelsLens ?? "news";
    const article = SAMPLE_ARTICLES[lens] ?? SAMPLE_ARTICLES.news;
    const previewBody = root.querySelector(".dra-pe-preview-body");
    if (!previewBody) return;
    const html = renderPreviewArticle(article, s, state.wordLists, {
      externalEmotions: s.emotionMode === "ai" ? article.aiEmotionHighlights ?? null : null,
      externalLabels: s.sentenceLabelsMode === "ai" ? article.aiSentenceLabels ?? null : null
    });
    previewBody.innerHTML = `
    <div class="dra-pe-preview-meta">Previewing: ${lens.charAt(0).toUpperCase() + lens.slice(1)} article</div>
    <h3 class="dra-pe-preview-title">${escHTML(article.title)}</h3>
    <div class="dra-pe-article" style="position:relative">${html}</div>`;
    applyPreviewStyles(previewBody, s, draft.actions);
    filterLabelColors(root, lens);
    if (s.readingAidsEnabled && s.rulerActive) {
      const fontPx = Number(s.fontSize) || 15;
      const lineH = Number(s.lineHeight) || 1.7;
      const halfWin = Math.round(fontPx * lineH * (s.rulerWindowLines ?? 1.5) / 2);
      const localY = _lastRulerLocalY ?? previewBody.clientHeight / 2;
      updateRulerPosition(previewBody, localY, halfWin);
    }
  }
  function escHTML(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toggle(id, key, label) {
    const checked = draft.settings[key] ? "checked" : "";
    return `<label class="dra-pe-toggle-row">
    <label class="toggle-switch"><input type="checkbox" id="${id}" ${checked}><span class="track"></span></label>
    <span class="dra-pe-toggle-label">${label}</span>
  </label>`;
  }
  function slider(id, key, label, min, max, step, unit = "") {
    const val = draft.settings[key] ?? DEFAULT_SETTINGS[key] ?? min;
    return `<div class="dra-pe-row">
    <span class="dra-pe-label">${label}</span>
    <div class="dra-pe-slider-group">
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" class="slider">
      <span id="${id}-val" class="slider-value">${Number(val).toFixed(step < 1 ? step < 0.05 ? 2 : 1 : 0)}${unit}</span>
    </div>
  </div>`;
  }
  function colorInput(id, key, label) {
    const val = draft.settings[key] ?? DEFAULT_SETTINGS[key];
    return `<div class="dra-pe-row dra-pe-color-row">
    <span class="dra-pe-label">${label}</span>
    <input type="color" id="${id}" value="${val}" class="dra-pe-color">
  </div>`;
  }
  function selectInput(id, key, label, options) {
    const val = draft.settings[key] ?? DEFAULT_SETTINGS[key];
    const opts = options.map(([v, l]) => `<option value="${v}"${val === v ? " selected" : ""}>${l}</option>`).join("");
    return `<div class="dra-pe-row">
    <span class="dra-pe-label">${label}</span>
    <select id="${id}" class="dra-pe-select">${opts}</select>
  </div>`;
  }
  function modePill(id, feature, key) {
    const cur = draft.settings[key] ?? "local";
    return `<div class="mode-pill dra-pe-mode-pill" id="${id}">
    <button class="mode-btn${cur === "local" ? " active" : ""}" data-pe-feature="${feature}" data-pe-mode="local">Local</button>
    <button class="mode-btn${cur === "ai" ? " active" : ""}" data-pe-feature="${feature}" data-pe-mode="ai">AI</button>
  </div>`;
  }
  function section(title, content) {
    return `<div class="dra-pe-section">
    <div class="dra-pe-section-title">${title}</div>
    <div class="dra-pe-section-body">${content}</div>
  </div>`;
  }
  function buildFormHTML() {
    const s = draft.settings;
    const typographySub = [
      selectInput("pe-font-family", "fontFamily", "Font Family", [
        ["", "System Default"],
        ["Georgia", "Georgia"],
        ["Arial", "Arial"],
        ["Verdana", "Verdana"],
        ["OpenDyslexic, sans-serif", "OpenDyslexic"]
      ]),
      toggle("pe-toggle-bold", "boldBeginning", "Bionic Effect"),
      slider("pe-font-size", "fontSize", "Font Size", 14, 28, 1, "px"),
      slider("pe-line-height", "lineHeight", "Line Height", 1.4, 2.4, 0.1),
      slider("pe-word-spacing", "wordSpacing", "Word Space", 0, 0.5, 0.05, "em"),
      slider("pe-letter-spacing", "letterSpacing", "Letter Space", 0, 0.1, 0.01, "em"),
      colorInput("pe-font-color", "fontColor", "Text Color"),
      colorInput("pe-bg-color", "bgColor", "Background")
    ].join("");
    const typography = toggle("pe-toggle-typography", "typographyEnabled", "Enable Typography") + `<div class="pe-sub-items" id="pe-typo-sub">${typographySub}</div>`;
    const openReaderChecked = draft.actions?.autoOpenReaderMode ? "checked" : "";
    const readerMode = [
      `<label class="dra-pe-toggle-row">
      <label class="toggle-switch"><input type="checkbox" id="pe-action-open-reader" ${openReaderChecked}><span class="track"></span></label>
      <span class="dra-pe-toggle-label">Auto-open Reader Mode when applied</span>
    </label>`,
      slider("pe-typewriter-speed", "typewriterSpeed", "Typewriter Speed", 1, 10, 1)
    ].join("");
    const aidsSub = [
      toggle("pe-toggle-gradient", "gradientRows", "Row Shading"),
      colorInput("pe-row-shading-color", "rowShadingColor", "Row Shading Color"),
      toggle("pe-toggle-transition", "transitionAnimation", "Transition Words"),
      toggle("pe-toggle-ruler", "rulerActive", "Reading Ruler"),
      slider("pe-ruler-size", "rulerWindowLines", "Ruler Width", 1, 10, 0.5, " lines"),
      slider("pe-auto-scroll-speed", "autoScrollSpeed", "Auto Scroll Speed", 1, 10, 1),
      // Emotion Colors
      `<div class="dra-pe-row dra-pe-ai-row">
      ${toggle("pe-toggle-emotion", "emotionColor", "Emotion Colors")}
      ${modePill("pe-emotion-mode-pill", "emotion", "emotionMode")}
    </div>`,
      colorInput("pe-emotion-positive", "emotionPositiveColor", "Positive Color"),
      colorInput("pe-emotion-negative", "emotionNegativeColor", "Negative Color"),
      colorInput("pe-emotion-complex", "emotionComplexColor", "Complex Color"),
      // Sentence Labels
      `<div class="dra-pe-row dra-pe-ai-row">
      ${toggle("pe-toggle-labels", "sentenceLabels", "Sentence Labels")}
      ${modePill("pe-labels-mode-pill", "sentenceLabels", "sentenceLabelsMode")}
    </div>`,
      selectInput("pe-label-lens", "sentenceLabelsLens", "Article Type (sets preview article)", [
        ["news", "News"],
        ["stem", "Academic \u2013 STEM"],
        ["humanities", "Academic \u2013 Humanities"],
        ["fiction", "Fiction"]
      ]),
      // Label colors grouped by lens; only the active lens group is shown
      `<div id="pe-label-colors" class="dra-pe-label-colors">
      <div data-pe-lens="news">
        ${colorInput("pe-lc-core-fact", "labelCoreFactColor", "Core Fact")}
        ${colorInput("pe-lc-context", "labelContextColor", "Context")}
        ${colorInput("pe-lc-quote", "labelQuoteColor", "Quote")}
      </div>
      <div data-pe-lens="stem">
        ${colorInput("pe-lc-concept", "labelConceptColor", "Concept")}
        ${colorInput("pe-lc-mechanism", "labelMechanismColor", "Mechanism")}
        ${colorInput("pe-lc-constraint", "labelConstraintColor", "Constraint")}
      </div>
      <div data-pe-lens="humanities">
        ${colorInput("pe-lc-thesis", "labelThesisColor", "Thesis")}
        ${colorInput("pe-lc-evidence", "labelEvidenceColor", "Evidence")}
        ${colorInput("pe-lc-explanation", "labelExplanationColor", "Explanation")}
      </div>
      <div data-pe-lens="fiction">
        ${colorInput("pe-lc-dialogue", "labelDialogueColor", "Dialogue")}
        ${colorInput("pe-lc-plot-turn", "labelPlotTurnColor", "Plot Turn")}
        ${colorInput("pe-lc-setting", "labelSettingColor", "Setting")}
      </div>
    </div>`
    ].join("");
    const aids = toggle("pe-toggle-reading-aids", "readingAidsEnabled", "Enable Reading Aids") + `<div class="pe-sub-items" id="pe-aids-sub">${aidsSub}</div>`;
    const panelSz = draft.settings.panelSize ?? "comfortable";
    const panelDisplay = `<div class="dra-pe-row">
    <span class="dra-pe-label">Panel Size</span>
    <div class="panel-size-pill dra-pe-panel-size">
      ${["compact", "comfortable", "large"].map(
      (sz) => `<button class="panel-size-btn${panelSz === sz ? " active" : ""}" data-pe-panel-size="${sz}">${{ compact: "S", comfortable: "M", large: "L" }[sz]}</button>`
    ).join("")}
    </div>
  </div>`;
    return [
      section("Typography", typography),
      section("Reader Mode", readerMode),
      section("Reading Aids", aids),
      section("Panel Display", panelDisplay)
    ].join("");
  }
  function filterLabelColors(root, lens) {
    root.querySelectorAll("[data-pe-lens]").forEach((el) => {
      el.style.display = el.dataset.peLens === lens ? "" : "none";
    });
  }
  function syncColorInputsDisabled(root, disabled) {
    ["#pe-font-color", "#pe-bg-color"].forEach((sel) => {
      const el = root.querySelector(sel);
      if (!el) return;
      el.disabled = disabled;
      el.closest(".dra-pe-color-row")?.classList.toggle("pe-disabled", disabled);
    });
  }
  function wireForm(root) {
    const container = root.querySelector(".dra-pe-form");
    const update = (key, val) => {
      draft.settings[key] = val;
      refreshPreview();
    };
    container.addEventListener("change", (e) => {
      const el = e.target;
      if (!el.id?.startsWith("pe-")) return;
      switch (el.id) {
        case "pe-toggle-typography": {
          update("typographyEnabled", el.checked);
          root.querySelector("#pe-typo-sub").style.display = el.checked ? "" : "none";
          break;
        }
        case "pe-toggle-bold":
          update("boldBeginning", el.checked);
          break;
        case "pe-font-family":
          update("fontFamily", el.value);
          break;
        case "pe-toggle-reading-aids": {
          update("readingAidsEnabled", el.checked);
          root.querySelector("#pe-aids-sub").style.display = el.checked ? "" : "none";
          break;
        }
        case "pe-toggle-gradient":
          update("gradientRows", el.checked);
          break;
        case "pe-toggle-transition":
          update("transitionAnimation", el.checked);
          break;
        case "pe-toggle-ruler":
          update("rulerActive", el.checked);
          break;
        case "pe-toggle-emotion":
          update("emotionColor", el.checked);
          break;
        case "pe-toggle-labels":
          update("sentenceLabels", el.checked);
          break;
        case "pe-label-lens":
          update("sentenceLabelsLens", el.value);
          break;
        case "pe-action-open-reader":
          if (!draft.actions) draft.actions = {};
          draft.actions.autoOpenReaderMode = el.checked;
          syncColorInputsDisabled(root, el.checked);
          refreshPreview();
          break;
      }
    });
    container.addEventListener("input", (e) => {
      const el = e.target;
      if (!el.id?.startsWith("pe-")) return;
      const numKeys = {
        "pe-font-size": "fontSize",
        "pe-line-height": "lineHeight",
        "pe-word-spacing": "wordSpacing",
        "pe-letter-spacing": "letterSpacing",
        "pe-ruler-size": "rulerWindowLines",
        "pe-auto-scroll-speed": "autoScrollSpeed",
        "pe-typewriter-speed": "typewriterSpeed"
      };
      const colorKeys = {
        "pe-font-color": "fontColor",
        "pe-bg-color": "bgColor",
        "pe-row-shading-color": "rowShadingColor",
        "pe-emotion-positive": "emotionPositiveColor",
        "pe-emotion-negative": "emotionNegativeColor",
        "pe-emotion-complex": "emotionComplexColor",
        "pe-lc-core-fact": "labelCoreFactColor",
        "pe-lc-context": "labelContextColor",
        "pe-lc-quote": "labelQuoteColor",
        "pe-lc-concept": "labelConceptColor",
        "pe-lc-mechanism": "labelMechanismColor",
        "pe-lc-constraint": "labelConstraintColor",
        "pe-lc-thesis": "labelThesisColor",
        "pe-lc-evidence": "labelEvidenceColor",
        "pe-lc-explanation": "labelExplanationColor",
        "pe-lc-dialogue": "labelDialogueColor",
        "pe-lc-plot-turn": "labelPlotTurnColor",
        "pe-lc-setting": "labelSettingColor"
      };
      if (numKeys[el.id]) {
        const v = parseFloat(el.value);
        update(numKeys[el.id], v);
        const display = root.querySelector(`#${el.id}-val`);
        if (display) display.textContent = el.value;
      } else if (colorKeys[el.id]) {
        update(colorKeys[el.id], el.value);
      }
    });
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-pe-mode]");
      if (btn) {
        const feature = btn.dataset.peFeature;
        const mode = btn.dataset.peMode;
        const keyMap = { emotion: "emotionMode", sentenceLabels: "sentenceLabelsMode" };
        const key = keyMap[feature];
        if (key) {
          update(key, mode);
          btn.closest(".dra-pe-mode-pill").querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.peMode === mode));
        }
      }
      const szBtn = e.target.closest("[data-pe-panel-size]");
      if (szBtn) {
        const sz = szBtn.dataset.pePanelSize;
        update("panelSize", sz);
        szBtn.closest(".dra-pe-panel-size").querySelectorAll(".panel-size-btn").forEach((b) => b.classList.toggle("active", b.dataset.pePanelSize === sz));
      }
    });
  }
  async function handleSave(root) {
    const nameEl = root.querySelector(".dra-pe-name-input");
    const errorEl = root.querySelector(".dra-pe-name-error");
    const name = nameEl?.value.trim();
    nameEl?.classList.remove("dra-pe-error");
    errorEl?.classList.add("hidden");
    if (!name) {
      nameEl?.classList.add("dra-pe-error");
      nameEl?.focus();
      return;
    }
    const presets = await loadPresets();
    const currentId = draft.mode === "modify" ? draft.presetId : null;
    if (hasPresetName(presets, name, currentId)) {
      nameEl?.classList.add("dra-pe-error");
      errorEl?.classList.remove("hidden");
      nameEl?.focus();
      return;
    }
    let id;
    if (draft.mode === "modify" && draft.presetId) {
      id = draft.presetId;
      presets.byId[id] = { ...presets.byId[id], name, settings: draft.settings, actions: draft.actions, updatedAt: Date.now() };
    } else {
      id = genPresetId();
      presets.byId[id] = { id, name, settings: draft.settings, actions: draft.actions, createdAt: Date.now(), updatedAt: Date.now() };
      presets.order.push(id);
    }
    const wasActive = presets.activeId === id;
    const shouldApply = draft.mode !== "modify" || wasActive;
    if (shouldApply) {
      presets.activeId = id;
    }
    await savePresets(presets);
    if (shouldApply) {
      applySettingsLocally(draft.settings, draft.actions);
    }
    chrome.runtime.sendMessage({ type: "PRESETS_CHANGED" }).catch(() => {
    });
    closePresetEditor();
  }
  var _rulerTrackingCleanup = null;
  var _lastRulerLocalY = null;
  function setupRulerTracking(root) {
    if (_rulerTrackingCleanup) {
      _rulerTrackingCleanup();
      _rulerTrackingCleanup = null;
    }
    const body = root.querySelector(".dra-pe-preview-body");
    if (!body) return;
    const isRulerActive = () => {
      const s = draft?.settings;
      return s?.readingAidsEnabled && s?.rulerActive;
    };
    const syncTransform = () => {
      if (!isRulerActive()) return;
      const wrap = body.querySelector(".dra-pe-ruler-wrap");
      if (wrap) wrap.style.transform = `translateY(${body.scrollTop}px)`;
    };
    const onMouseMove = (e) => {
      if (!isRulerActive()) return;
      const s = draft.settings;
      const rect = body.getBoundingClientRect();
      const localY = e.clientY - rect.top;
      _lastRulerLocalY = localY;
      const fontPx = Number(s.fontSize) || 15;
      const lineH = Number(s.lineHeight) || 1.7;
      const halfWin = Math.round(fontPx * lineH * (s.rulerWindowLines ?? 1.5) / 2);
      updateRulerPosition(body, localY, halfWin);
    };
    body.addEventListener("mousemove", onMouseMove);
    body.addEventListener("scroll", syncTransform);
    _rulerTrackingCleanup = () => {
      body.removeEventListener("mousemove", onMouseMove);
      body.removeEventListener("scroll", syncTransform);
    };
  }
  function closePresetEditor() {
    if (_rulerTrackingCleanup) {
      _rulerTrackingCleanup();
      _rulerTrackingCleanup = null;
    }
    document.getElementById(EDITOR_ID)?.remove();
    document.documentElement.classList.remove("dra-preset-editor-open");
    document.removeEventListener("keydown", onEditorKeydown);
    _lastRulerLocalY = null;
    draft = null;
  }
  function onEditorKeydown(e) {
    if (e.key === "Escape") closePresetEditor();
  }
  function buildEditorHTML(title) {
    return `
  <div class="dra-pe-overlay">
    <div class="dra-pe-card">
      <header class="dra-pe-header">
        <span class="dra-pe-header-title">${title}</span>
        <button class="dra-pe-close" aria-label="Close">\xD7</button>
      </header>
      <div class="dra-pe-body">
        <div class="dra-pe-form dra-pe-left"></div>
        <div class="dra-pe-right">
          <div class="dra-pe-preview-label">Live Preview</div>
          <div class="dra-pe-preview-body"></div>
        </div>
      </div>
      <footer class="dra-pe-footer">
        <div class="dra-pe-name-group">
          <label class="dra-pe-name-label" for="dra-pe-name">Preset name</label>
          <input id="dra-pe-name" class="dra-pe-name-input" type="text" placeholder="My Preset" maxlength="60">
          <span class="dra-pe-name-error hidden">Preset name already exists</span>
        </div>
        <div class="dra-pe-footer-btns">
          <button class="dra-pe-btn-cancel">Cancel</button>
          <button class="dra-pe-btn-save">Save</button>
        </div>
      </footer>
    </div>
  </div>`;
  }
  function mountEditor(root, title) {
    root.innerHTML = buildEditorHTML(title);
    root.querySelector(".dra-pe-form").innerHTML = buildFormHTML();
    wireForm(root);
    root.querySelector("#pe-typo-sub").style.display = draft.settings.typographyEnabled ? "" : "none";
    root.querySelector("#pe-aids-sub").style.display = draft.settings.readingAidsEnabled ? "" : "none";
    syncColorInputsDisabled(root, draft.actions?.autoOpenReaderMode ?? false);
    refreshPreview();
    setupRulerTracking(root);
    root.querySelector(".dra-pe-close").addEventListener("click", closePresetEditor);
    root.querySelector(".dra-pe-btn-cancel").addEventListener("click", closePresetEditor);
    root.querySelector(".dra-pe-btn-save").addEventListener("click", () => handleSave(root));
    root.querySelector(".dra-pe-name-input").addEventListener("input", (e) => {
      e.currentTarget.classList.remove("dra-pe-error");
      root.querySelector(".dra-pe-name-error")?.classList.add("hidden");
    });
    if (draft.name) root.querySelector(".dra-pe-name-input").value = draft.name;
    root.querySelector(".dra-pe-overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closePresetEditor();
    });
  }
  function openPresetEditor({ mode, preset, currentSettings } = {}) {
    closePresetEditor();
    initDraft(mode, { currentSettings, preset });
    const root = document.createElement("div");
    root.id = EDITOR_ID;
    document.body.appendChild(root);
    document.documentElement.classList.add("dra-preset-editor-open");
    document.addEventListener("keydown", onEditorKeydown);
    if (mode === "onboarding") {
      root.innerHTML = `
      <div class="dra-pe-overlay">
        <div class="dra-pe-card dra-pe-card--onboarding">
          <div class="dra-pe-ob-logo">Argus</div>
          <h2 class="dra-pe-ob-title">Welcome to Argus</h2>
          <p class="dra-pe-ob-body">Would you like to set up your reading preferences now? You can create a custom preset that controls typography, highlights, and more.</p>
          <div class="dra-pe-ob-btns">
            <button class="dra-pe-btn-yes">Set Up Preferences</button>
            <button class="dra-pe-btn-no">Skip for Now</button>
          </div>
        </div>
      </div>`;
      root.querySelector(".dra-pe-btn-yes").addEventListener("click", () => {
        mountEditor(root, "Create Your First Preset");
      });
      root.querySelector(".dra-pe-btn-no").addEventListener("click", () => {
        chrome.storage.sync.set({ draPresets: { byId: {}, order: [], activeId: null } });
        closePresetEditor();
      });
      root.querySelector(".dra-pe-overlay").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) closePresetEditor();
      });
      return;
    }
    const titles = { create: "Create New Preset", modify: "Edit Preset" };
    mountEditor(root, titles[mode] ?? "Edit Preset");
  }
  function maybeShowOnboarding() {
    chrome.storage.sync.get("draPresets", (d) => {
      if (!d.draPresets) {
        openPresetEditor({ mode: "onboarding" });
      }
    });
  }

  // content/index.js
  var DEFAULT_WORD_LISTS = {
    emotionPositive: [...DEFAULT_EMOTION_POSITIVE],
    emotionNegative: [...DEFAULT_EMOTION_NEGATIVE],
    emotionComplex: [...DEFAULT_EMOTION_COMPLEX],
    transition: [...DEFAULT_TRANSITION_WORDS]
  };
  function applyPresetActions(actions) {
    if (actions?.autoOpenReaderMode === true) {
      openImmersiveReader();
    }
    if (actions?.autoOpenReaderMode === false) {
      closeImmersiveReader();
    }
    if (actions?.autoOpenReaderMode === true && actions?.autoStartTypewriterFromBeginning) {
      startTypewriterFromBeginning();
    }
  }
  chrome.storage.sync.get(["draSettings", "draWordLists", "draPresets"], (data) => {
    if (data.draSettings) {
      state.settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
      if (state.settings.transitionAnimation === void 0 && data.draSettings.logicAnimation !== void 0) {
        state.settings.transitionAnimation = data.draSettings.logicAnimation;
      }
    }
    const activePreset = data.draPresets?.byId?.[data.draPresets.activeId];
    if (activePreset?.settings) {
      state.settings = { ...state.settings, ...activePreset.settings };
    }
    if (data.draWordLists) {
      state.wordLists = { ...state.wordLists, ...data.draWordLists };
    } else {
      state.wordLists = { ...DEFAULT_WORD_LISTS };
      chrome.storage.sync.set({ draWordLists: state.wordLists });
    }
    setTypewriterSpeed(state.settings.typewriterSpeed);
    render();
    applyPresetActions(activePreset?.actions);
    maybeShowOnboarding();
    let _lastUrl = location.href;
    let _renderTimer;
    new MutationObserver(() => {
      if (location.href === _lastUrl) return;
      _lastUrl = location.href;
      state.contentArea = null;
      state.aiEmotionHighlights = [];
      state.aiSentenceLabels = [];
      state.sentenceLabels = [];
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(() => render(), 500);
    }).observe(document.body, { childList: true, subtree: true });
  });
  function applySettingsPayload(payload) {
    if (payload.rulerActive === false) state.lastRulerY = null;
    const prevLens = state.settings.sentenceLabelsLens;
    state.settings = { ...state.settings, ...payload };
    if (payload.sentenceLabelsLens && payload.sentenceLabelsLens !== prevLens) {
      state.aiSentenceLabels = [];
      state.sentenceLabels = [];
      state.sentenceLabelsInProgress = false;
    }
    if ("typewriterSpeed" in payload) setTypewriterSpeed(payload.typewriterSpeed);
    if ("typewriterActive" in payload) setTypewriterActive(payload.typewriterActive);
    render();
    refreshImmersiveReader();
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SETTINGS_CHANGED") {
      applySettingsPayload(msg.payload);
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
    if (msg.type === "OPEN_PRESET_EDITOR") {
      openPresetEditor({ mode: msg.mode, preset: msg.preset, currentSettings: msg.currentSettings });
    }
    if (msg.type === "APPLY_PRESET") {
      applySettingsPayload(msg.settings);
      applyPresetActions(msg.actions);
    }
  });
})();
