// Background Service Worker
// Runs in the browser background (not inside any webpage).
// Phase 1 role: relay messages between the Side Panel and content/index.js.
// Phase 2 role: call proxy server, manage cache, return semantic annotations.

// ── Analysis cache ─────────────────────────────────────────────────────
// Keyed by page URL. Cleared when the service worker restarts.

const analysisCache = new Map();
const CACHE_TTL_MS  = 30 * 60 * 1000; // 30 minutes

async function analyzeText(text, url) {
  const cached = analysisCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  let result;
  try {
    const response = await fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, url }),
    });
    if (!response.ok) return null;
    result = await response.json();
  } catch {
    // Server not running or network error — degrade silently
    return null;
  }

  analysisCache.set(url, { result, timestamp: Date.now() });
  return result;
}

// ── Message relay & analysis handler ──────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Messages from content scripts (sender.tab exists)
  if (sender.tab) {
    if (msg.type === 'EMOTION_REQUEST') {
      analyzeText(msg.text, msg.url).then(result => {
        if (result) {
          chrome.tabs.sendMessage(sender.tab.id, { type: 'EMOTION_RESULT', ...result });
        }
      });
    }

    if (msg.type === 'LABEL_REQUEST') {
      fetch('http://localhost:3000/api/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentences: msg.sentences }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(result => {
          if (result?.labels) {
            chrome.tabs.sendMessage(sender.tab.id, { type: 'LABEL_RESULT', labels: result.labels });
          }
        });
    }

    if (msg.type === 'FOCUS_ANALYZE') {
      fetch('http://localhost:3000/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text, topic: msg.topic }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(result => {
          if (result?.relevant) {
            chrome.tabs.sendMessage(sender.tab.id, { type: 'FOCUS_RESULT', relevant: result.relevant });
          }
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
