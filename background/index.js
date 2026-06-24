const API_BASE = 'https://argus-1ygn.onrender.com';

// Background Service Worker
// Runs in the browser background (not inside any webpage).
// Phase 1 role: relay messages between the Side Panel and content/index.js.
// Phase 2 role: call proxy server, manage cache, return semantic annotations.

// ── Analysis cache ─────────────────────────────────────────────────────
// Keyed by page URL. Cleared when the service worker restarts.

const emotionCache   = new Map();
const emotionPending = new Map(); // in-flight emotion promises, prevents concurrent duplicate fetches
const labelCache     = new Map();
const labelPending   = new Map(); // in-flight label promises, prevents concurrent duplicate fetches
const CACHE_TTL_MS   = 30 * 60 * 1000; // 30 minutes
const FETCH_TIMEOUT_MS = 90_000;

async function fetchWithAbortTimeout(url, options) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(tid);
    return res;
  } catch (err) {
    clearTimeout(tid);
    throw err;
  }
}

async function fetchEmotionAnalysis(text, url) {
  const cached = emotionCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.result;
  if (emotionPending.has(url)) return emotionPending.get(url);

  const promise = (async () => {
    try {
      const response = await fetchWithAbortTimeout(`${API_BASE}/api/analyze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (!result.success) return null;
      emotionCache.set(url, { result, timestamp: Date.now() });
      return result;
    } catch {
      return null;
    } finally {
      emotionPending.delete(url);
    }
  })();

  emotionPending.set(url, promise);
  return promise;
}

async function fetchSentenceLabels(sentences, url, articleLens = 'news') {
  const cacheKey = `${url}|${articleLens}`;
  const cached = labelCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.result;
  if (labelPending.has(cacheKey)) return labelPending.get(cacheKey);

  const promise = (async () => {
    try {
      const response = await fetchWithAbortTimeout(`${API_BASE}/api/label`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sentences, articleLens }),
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (!result.success) return null;
      if (result.labels) labelCache.set(cacheKey, { result: result.labels, timestamp: Date.now() });
      return result.labels ?? null;
    } catch {
      return null;
    } finally {
      labelPending.delete(cacheKey);
    }
  })();

  labelPending.set(cacheKey, promise);
  return promise;
}

// ── Message relay & analysis handler ──────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Messages from content scripts (sender.tab exists)
  if (sender.tab) {
    if (msg.type === 'EMOTION_REQUEST') {
      fetchEmotionAnalysis(msg.text, msg.url).then(result => {
        const type = result ? 'EMOTION_RESULT' : 'EMOTION_ERROR';
        chrome.tabs.sendMessage(sender.tab.id, result ? { type, ...result } : { type });
      });
    }

    if (msg.type === 'LABEL_REQUEST') {
      fetchSentenceLabels(msg.sentences, sender.tab.url, msg.articleLens).then(labels => {
        const type = labels ? 'LABEL_RESULT' : 'LABEL_ERROR';
        chrome.tabs.sendMessage(sender.tab.id, labels ? { type, labels } : { type });
      });
    }

    if (msg.type === 'FOCUS_ANALYZE') {
      fetchWithAbortTimeout(`${API_BASE}/api/focus`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: msg.text, topic: msg.topic }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(result => {
          const type = result?.relevant ? 'FOCUS_RESULT' : 'FOCUS_ERROR';
          chrome.tabs.sendMessage(sender.tab.id,
            result?.relevant ? { type, relevant: result.relevant } : { type }
          );
        });
    }

    if (msg.type === 'WORDLISTS_CHANGED') {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }

    if (msg.type === 'AI_STATUS') {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }

    return;
  }

  // Messages from Side Panel / Popup — forward to active tab
  const forwardToActiveTab = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, msg);
    });
  };

  if (msg.type === 'SETTINGS_CHANGED')   forwardToActiveTab();
  if (msg.type === 'FOCUS_APPLY')        forwardToActiveTab();
  if (msg.type === 'FOCUS_CLEAR')        forwardToActiveTab();
  if (msg.type === 'FOCUS_AI_REQUEST')   forwardToActiveTab();
  if (msg.type === 'WORDLISTS_CHANGED')  forwardToActiveTab();
  if (msg.type === 'AI_RETRY')           forwardToActiveTab();
});

// ── Side Panel opener ──────────────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
