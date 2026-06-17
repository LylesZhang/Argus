// Background Service Worker
// Runs in the browser background (not inside any webpage).
// Phase 1 role: relay messages between the Side Panel and content/index.js.
// Phase 2 role: call proxy server, manage cache, return semantic annotations.

// ── Analysis cache ─────────────────────────────────────────────────────
// Keyed by page URL. Cleared when the service worker restarts.

const emotionCache    = new Map();
const labelCache      = new Map();
const CACHE_TTL_MS    = 30 * 60 * 1000; // 30 minutes
const FETCH_TIMEOUT_MS = 10_000;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS)),
  ]);
}

async function fetchEmotionAnalysis(text, url) {
  const cached = emotionCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  let result;
  try {
    const response = await withTimeout(fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, url }),
    }));
    if (!response.ok) return null;
    result = await response.json();
  } catch {
    return null;
  }

  emotionCache.set(url, { result, timestamp: Date.now() });
  return result;
}

async function fetchSentenceLabels(sentences, url) {
  const cached = labelCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  let result;
  try {
    const response = await withTimeout(fetch('http://localhost:3000/api/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentences }),
    }));
    if (!response.ok) return null;
    result = await response.json();
  } catch {
    return null;
  }

  if (result?.labels) labelCache.set(url, { result: result.labels, timestamp: Date.now() });
  return result?.labels ?? null;
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
      fetchSentenceLabels(msg.sentences, sender.tab.url).then(labels => {
        const type = labels ? 'LABEL_RESULT' : 'LABEL_ERROR';
        chrome.tabs.sendMessage(sender.tab.id, labels ? { type, labels } : { type });
      });
    }

    if (msg.type === 'FOCUS_ANALYZE') {
      withTimeout(fetch('http://localhost:3000/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text, topic: msg.topic }),
      }))
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(result => {
          const type = result?.relevant ? 'FOCUS_RESULT' : 'FOCUS_ERROR';
          chrome.tabs.sendMessage(sender.tab.id,
            result?.relevant ? { type, relevant: result.relevant } : { type }
          );
        });
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

  if (msg.type === 'SETTINGS_CHANGED')  forwardToActiveTab();
  if (msg.type === 'FOCUS_APPLY')       forwardToActiveTab();
  if (msg.type === 'FOCUS_CLEAR')       forwardToActiveTab();
  if (msg.type === 'FOCUS_AI_REQUEST')  forwardToActiveTab();
});

// ── Side Panel opener ──────────────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
