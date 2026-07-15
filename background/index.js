import { API_BASE, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

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

// tabId -> 'pdf'. Tracks which tabs are standalone PDF Reader pages so Side Panel
// actions and Reader status can be routed to them (they are extension pages and
// do not receive chrome.tabs.sendMessage the way content scripts do).
const readerTabs = new Map();

// ── Account authentication & cloud state sync ─────────────────────────

const AUTH_SESSION_KEY = 'argusAuthSession';
const MAGIC_LINK_PENDING_KEY = 'argusMagicLinkPending';
const SYNC_META_KEY = 'argusSyncMeta';
const SYNC_KEYS = new Set(['draSettings', 'draWordLists', 'draPresets']);
const CLIENT_VERSION = '0.4.0';
let applyingCloudState = false;
let expectedCloudStorage = null;
let syncTimer = null;
let localChangeSequence = Date.now();
let syncMetaWriteQueue = Promise.resolve();
let sessionRefreshPromise = null;

function accountConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function magicLinkCallbackUrl(state) {
  const callback = new URL('/auth/callback', API_BASE);
  callback.searchParams.set('extension_id', chrome.runtime.id);
  callback.searchParams.set('state', state);
  return callback.href;
}

function storageGet(area, keys) {
  return new Promise(resolve => chrome.storage[area].get(keys, resolve));
}

function storageSet(area, value) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(value, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(error);
      else resolve();
    });
  });
}

function storageRemove(area, keys) {
  return new Promise(resolve => chrome.storage[area].remove(keys, resolve));
}

async function readSession() {
  return (await storageGet('local', AUTH_SESSION_KEY))[AUTH_SESSION_KEY] || null;
}

async function saveSession(session) {
  await storageSet('local', { [AUTH_SESSION_KEY]: session });
}

async function supabaseAuth(path, { token, ...options } = {}) {
  if (!accountConfigured()) throw new Error('Account service is not configured.');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.msg || data?.error_description || data?.error || 'Account request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function sessionFromAuth(data, previous = null) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 3600) - 30) * 1000,
    user: data.user || previous?.user,
  };
}

async function validSession() {
  const session = await readSession();
  if (!session?.accessToken) return null;
  if (session.expiresAt > Date.now() + 30_000) return session;
  if (!session.refreshToken) {
    await storageRemove('local', [AUTH_SESSION_KEY, SYNC_META_KEY]);
    return null;
  }
  try {
    if (!sessionRefreshPromise) {
      sessionRefreshPromise = (async () => {
        const data = await supabaseAuth('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: session.refreshToken }),
        });
        const refreshed = sessionFromAuth(data, session);
        await saveSession(refreshed);
        return refreshed;
      })().finally(() => { sessionRefreshPromise = null; });
    }
    return await sessionRefreshPromise;
  } catch (error) {
    if (error.status === 400 || error.status === 401 || error.status === 403) {
      await storageRemove('local', [AUTH_SESSION_KEY, SYNC_META_KEY]);
      return null;
    }
    // Keep the session while offline so pending local changes can be retried.
    return session;
  }
}

async function accountApi(path, options = {}, allowRefresh = true) {
  const session = await validSession();
  if (!session) throw new Error('You are signed out.');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'x-argus-version': CLIENT_VERSION,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 401 && allowRefresh) {
    const old = await readSession();
    if (old) await saveSession({ ...old, expiresAt: 0 });
    return accountApi(path, options, false);
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Cloud request failed.');
  return { data, empty: response.status === 204 };
}

async function localState() {
  const data = await storageGet('sync', ['draSettings', 'draWordLists', 'draPresets']);
  return {
    settings: data.draSettings || {},
    wordLists: data.draWordLists || {},
    presets: data.draPresets || {},
  };
}

async function uploadLocalState() {
  await syncMetaWriteQueue;
  const startingMeta = (await storageGet('local', SYNC_META_KEY))[SYNC_META_KEY] || {};
  const pendingVersion = startingMeta.pendingVersion ?? null;
  const state = await localState();
  const { data } = await accountApi('/api/v1/me/state', {
    method: 'PUT',
    body: JSON.stringify(state),
  });
  const latestMeta = (await storageGet('local', SYNC_META_KEY))[SYNC_META_KEY] || {};
  const newerChangeExists = latestMeta.pending && latestMeta.pendingVersion !== pendingVersion;
  const {
    pendingVersion: _oldPendingVersion,
    syncError: _oldSyncError,
    ...metaWithoutPendingVersion
  } = latestMeta;
  await storageSet('local', {
    [SYNC_META_KEY]: {
      ...metaWithoutPendingVersion,
      ...(newerChangeExists ? { pendingVersion: latestMeta.pendingVersion } : {}),
      revision: data.revision,
      updatedAt: data.updatedAt,
      pending: newerChangeExists,
    },
  });
  return data;
}

async function applyCloudState(state) {
  applyingCloudState = true;
  expectedCloudStorage = {
    draSettings: state.settings || {},
    draWordLists: state.wordLists || {},
    draPresets: state.presets || {},
  };
  try {
    await storageSet('sync', expectedCloudStorage);
    await storageSet('local', {
      [SYNC_META_KEY]: { revision: state.revision, updatedAt: state.updatedAt, pending: false },
    });
  } finally {
    applyingCloudState = false;
  }
  chrome.runtime.sendMessage({ type: 'ARGUS_CLOUD_STATE_APPLIED' }).catch(() => {});
}

async function reconcileCloudState() {
  if (!await validSession()) return null;
  const result = await accountApi('/api/v1/me/state');
  if (result.empty) return uploadLocalState();
  await applyCloudState(result.data);
  return result.data;
}

function scheduleStateUpload() {
  clearTimeout(syncTimer);
  localChangeSequence = Math.max(Date.now(), localChangeSequence + 1);
  const pendingVersion = localChangeSequence;
  syncMetaWriteQueue = syncMetaWriteQueue.then(async () => {
    const data = await storageGet('local', SYNC_META_KEY);
    const current = data[SYNC_META_KEY] || {};
    if (Number(current.pendingVersion || 0) > pendingVersion) return;
    await storageSet('local', {
      [SYNC_META_KEY]: { ...current, pending: true, pendingVersion },
    });
  }).catch(() => {});
  syncTimer = setTimeout(() => {
    uploadLocalState()
      .then(() => chrome.runtime.sendMessage({ type: 'ARGUS_SYNC_STATUS', status: 'synced' }).catch(() => {}))
      .catch(async error => {
        await rememberSyncError(error.message).catch(() => {});
        chrome.runtime.sendMessage({ type: 'ARGUS_SYNC_STATUS', status: 'error', error: error.message }).catch(() => {});
      });
  }, 800);
}

async function resumeSync() {
  const session = await validSession();
  if (!session) return;
  const meta = (await storageGet('local', SYNC_META_KEY))[SYNC_META_KEY] || {};
  if (meta.pending) await uploadLocalState();
  else await reconcileCloudState();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (!Object.keys(changes).some(key => SYNC_KEYS.has(key))) return;
  if (applyingCloudState) return;
  if (expectedCloudStorage) {
    const changedSyncEntries = Object.entries(changes).filter(([key]) => SYNC_KEYS.has(key));
    const isExpectedCloudWrite = changedSyncEntries.every(([key, change]) =>
      JSON.stringify(change.newValue) === JSON.stringify(expectedCloudStorage[key])
    );
    expectedCloudStorage = null;
    if (isExpectedCloudWrite) return;
  }
  readSession().then(session => {
    if (session) scheduleStateUpload();
  });
});

async function authStatus() {
  const session = await validSession();
  const local = await storageGet('local', [SYNC_META_KEY, MAGIC_LINK_PENDING_KEY]);
  const meta = local[SYNC_META_KEY] || {};
  const pendingLogin = local[MAGIC_LINK_PENDING_KEY];
  const pendingLoginIsCurrent = Boolean(
    pendingLogin && Date.now() - pendingLogin.requestedAt < 60 * 60 * 1000
  );
  if (pendingLogin && !pendingLoginIsCurrent) await storageRemove('local', MAGIC_LINK_PENDING_KEY);
  const waitingForMagicLink = Boolean(!session && pendingLoginIsCurrent);
  return {
    configured: accountConfigured(),
    signedIn: Boolean(session),
    email: session?.user?.email || '',
    waitingForMagicLink,
    pendingEmail: waitingForMagicLink ? pendingLogin.email : '',
    revision: meta.revision ?? null,
    pending: Boolean(meta.pending),
    syncError: meta.syncError || '',
  };
}

async function rememberSyncError(message) {
  const local = await storageGet('local', SYNC_META_KEY);
  await storageSet('local', {
    [SYNC_META_KEY]: { ...(local[SYNC_META_KEY] || {}), syncError: message },
  });
}

async function handleAccountMessage(msg) {
  if (msg.type === 'AUTH_GET_STATUS') return authStatus();
  if (msg.type === 'AUTH_REQUEST_MAGIC_LINK') {
    const email = String(msg.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    const state = randomState();
    const previousPending = (await storageGet('local', MAGIC_LINK_PENDING_KEY))[MAGIC_LINK_PENDING_KEY];
    await storageSet('local', {
      [MAGIC_LINK_PENDING_KEY]: { email, state, requestedAt: Date.now() },
    });
    try {
      const redirectTo = magicLinkCallbackUrl(state);
      await supabaseAuth(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        body: JSON.stringify({ email, create_user: true }),
      });
    } catch (error) {
      if (previousPending) await storageSet('local', { [MAGIC_LINK_PENDING_KEY]: previousPending });
      else await storageRemove('local', MAGIC_LINK_PENDING_KEY);
      throw error;
    }
    return { sent: true, email };
  }
  if (msg.type === 'AUTH_SIGN_OUT') {
    const session = await readSession();
    if (session?.accessToken) {
      await supabaseAuth('/auth/v1/logout', { method: 'POST', token: session.accessToken }).catch(() => {});
    }
    await storageRemove('local', [AUTH_SESSION_KEY, MAGIC_LINK_PENDING_KEY, SYNC_META_KEY]);
    chrome.runtime.sendMessage({ type: 'ARGUS_AUTH_CHANGED' }).catch(() => {});
    return { signedIn: false };
  }
  if (msg.type === 'AUTH_DELETE_ACCOUNT') {
    await accountApi('/api/v1/me', { method: 'DELETE' });
    await storageRemove('local', [AUTH_SESSION_KEY, MAGIC_LINK_PENDING_KEY, SYNC_META_KEY]);
    await storageRemove('sync', ['draSettings', 'draWordLists', 'draPresets']);
    chrome.runtime.sendMessage({ type: 'ARGUS_AUTH_CHANGED' }).catch(() => {});
    return { deleted: true };
  }
  if (msg.type === 'AUTH_SYNC_NOW') {
    await resumeSync();
    return authStatus();
  }
  return null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!String(msg?.type || '').startsWith('AUTH_')) return false;
  handleAccountMessage(msg)
    .then(data => sendResponse({ ok: true, ...data }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function completeMagicLinkSignIn(msg, sender) {
  let senderUrl;
  try { senderUrl = new URL(sender.url); }
  catch { throw new Error('Invalid callback origin.'); }
  const expectedOrigin = new URL(API_BASE).origin;
  if (senderUrl.origin !== expectedOrigin || senderUrl.pathname !== '/auth/callback') {
    throw new Error('Untrusted callback origin.');
  }

  const pending = (await storageGet('local', MAGIC_LINK_PENDING_KEY))[MAGIC_LINK_PENDING_KEY];
  if (!pending || pending.state !== msg.state) throw new Error('This login link was not requested by this Argus installation.');
  if (Date.now() - pending.requestedAt > 60 * 60 * 1000) throw new Error('This login request has expired. Send a new email from Argus.');
  if (!msg.accessToken || !msg.refreshToken) throw new Error('The login link did not contain a valid session.');

  const user = await supabaseAuth('/auth/v1/user', { token: msg.accessToken });
  if (!user?.id || user.email?.toLowerCase() !== pending.email) throw new Error('The login session does not match the requested email.');
  const requestedExpiresIn = Number(msg.expiresIn);
  const expiresIn = Number.isFinite(requestedExpiresIn)
    ? Math.min(86_400, Math.max(60, requestedExpiresIn))
    : 3600;
  const session = sessionFromAuth({
    access_token: msg.accessToken,
    refresh_token: msg.refreshToken,
    expires_in: expiresIn,
    user,
  });
  await saveSession(session);
  await storageRemove('local', MAGIC_LINK_PENDING_KEY);

  let syncError = '';
  try { await reconcileCloudState(); }
  catch (error) {
    syncError = error.message;
    await rememberSyncError(syncError);
  }
  chrome.runtime.sendMessage({ type: 'ARGUS_AUTH_CHANGED', signedIn: true, syncError }).catch(() => {});
  return { email: user.email, syncError };
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'ARGUS_MAGIC_LINK_CALLBACK') return false;
  completeMagicLinkSignIn(msg, sender)
    .then(data => sendResponse({ ok: true, ...data }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});

// Reconcile on service-worker startup. Anonymous use remains untouched when
// Supabase has not been configured or no session exists.
validSession().then(session => {
  if (session) resumeSync().catch(() => {});
}).catch(() => {});

self.addEventListener?.('online', () => {
  validSession().then(session => {
    if (session) resumeSync().catch(() => {});
  });
});

// PDF Reader pages receive messages via runtime broadcast + a targetPdfTabId filter.
function broadcastToPdfTab(tabId, msg) {
  chrome.runtime.sendMessage({ ...msg, targetPdfTabId: tabId }).catch(() => {});
}

// Tell the Side Panel whether the active tab is a Reader (web or PDF) so it can
// enable/disable the Reader Mode + Typewriter controls.
function publishActiveReaderStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const kind = tab ? readerTabs.get(tab.id) ?? null : null;
    chrome.runtime.sendMessage({
      type: 'IMMERSIVE_READER_STATUS',
      active: Boolean(kind),
      readerKind: kind,
      tabId: tab?.id ?? null,
      source: 'background',
    }).catch(() => {});
  });
}

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
        headers: { 'Content-Type': 'application/json', 'x-argus-version': '0.4.0' },
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

function normalizeMinImportance(value) {
  if (value === null || value === '' || typeof value === 'boolean') return 75;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 75;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

function visibleLabels(scoredLabels, threshold) {
  return scoredLabels
    .filter(label => label.importance >= threshold)
    .map(({ index, type }) => ({ index, type }));
}

function labelResult(scoredLabels, threshold) {
  return { labels: visibleLabels(scoredLabels, threshold), scoredLabels };
}

async function fetchSentenceLabels(sentences, url, lensPurpose = 'inform', minImportance = 75) {
  // Scored candidates are independent of display density, so one cache entry can
  // serve all density choices for the same page and reading purpose.
  const cacheKey = `${url}|${lensPurpose}`;
  const threshold = normalizeMinImportance(minImportance);
  const cached = labelCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return labelResult(cached.result, threshold);
  }

  let promise = labelPending.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      try {
        const response = await fetchWithAbortTimeout(`${API_BASE}/api/label`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'x-argus-version': '0.4.0' },
          body:    JSON.stringify({ sentences, lensPurpose, minImportance: threshold }),
        });
        if (!response.ok) return null;
        const result = await response.json();
        if (!result.success || !Array.isArray(result.scoredLabels)) return null;
        labelCache.set(cacheKey, { result: result.scoredLabels, timestamp: Date.now() });
        return result.scoredLabels;
      } catch {
        return null;
      } finally {
        labelPending.delete(cacheKey);
      }
    })();

    labelPending.set(cacheKey, promise);
  }

  const scoredLabels = await promise;
  return scoredLabels ? labelResult(scoredLabels, threshold) : null;
}

// ── Message relay & analysis handler ──────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Messages from content scripts (sender.tab exists)
  if (sender.tab) {
    if (msg.type === 'EMOTION_REQUEST') {
      fetchEmotionAnalysis(msg.text, msg.url).then(result => {
        const type = result ? 'EMOTION_RESULT' : 'EMOTION_ERROR';
        chrome.tabs.sendMessage(sender.tab.id, result
          ? { type, ...result, requestId: msg.requestId }
          : { type, requestId: msg.requestId });
      });
    }

    if (msg.type === 'LABEL_REQUEST') {
      fetchSentenceLabels(
        msg.sentences,
        sender.tab.url,
        msg.lensPurpose ?? msg.articleLens,
        msg.minImportance,
      ).then(result => {
        const ok = Array.isArray(result?.labels) && Array.isArray(result?.scoredLabels);
        const type = ok ? 'LABEL_RESULT' : 'LABEL_ERROR';
        const responseContext = {
          lensPurpose: msg.lensPurpose ?? msg.articleLens ?? 'inform',
          minImportance: normalizeMinImportance(msg.minImportance),
          requestId: msg.requestId,
        };
        chrome.tabs.sendMessage(sender.tab.id, ok ? {
          type,
          labels: result.labels,
          scoredLabels: result.scoredLabels,
          ...responseContext,
        } : { type, ...responseContext });
      });
    }

    if (msg.type === 'SIMPLIFY_REQUEST') {
      fetchWithAbortTimeout(`${API_BASE}/api/simplify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-argus-version': '0.4.0' },
        body:    JSON.stringify({ text: msg.text }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(result => {
          const type = result?.simplified ? 'SIMPLIFY_RESULT' : 'SIMPLIFY_ERROR';
          chrome.tabs.sendMessage(sender.tab.id,
            result?.simplified
              ? { type, simplified: result.simplified, requestId: msg.requestId }
              : { type, requestId: msg.requestId }
          );
        });
    }

    if (msg.type === 'FOCUS_ANALYZE') {
      fetchWithAbortTimeout(`${API_BASE}/api/focus`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-argus-version': '0.4.0' },
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

    // ── PDF Reader page requests (extension page in a tab) ──────────────
    if (msg.type === 'PDF_READER_STATUS') {
      if (msg.active) readerTabs.set(sender.tab.id, 'pdf');
      else readerTabs.delete(sender.tab.id);
      publishActiveReaderStatus();
    }

    if (msg.type === 'PDF_EMOTION_REQUEST') {
      fetchEmotionAnalysis(msg.text, `pdf:${msg.fingerprint}`).then(result => {
        const type = result ? 'PDF_EMOTION_RESULT' : 'PDF_EMOTION_ERROR';
        broadcastToPdfTab(sender.tab.id, result
          ? { type, ...result, requestId: msg.requestId }
          : { type, requestId: msg.requestId });
      });
    }

    if (msg.type === 'PDF_LABEL_REQUEST') {
      fetchSentenceLabels(
        msg.sentences,
        `pdf:${msg.fingerprint}`,
        msg.lensPurpose,
        msg.minImportance,
      ).then(result => {
        const ok = Array.isArray(result?.labels) && Array.isArray(result?.scoredLabels);
        const type = ok ? 'PDF_LABEL_RESULT' : 'PDF_LABEL_ERROR';
        const ctx = {
          lensPurpose: msg.lensPurpose ?? 'inform',
          minImportance: normalizeMinImportance(msg.minImportance),
          requestId: msg.requestId,
        };
        broadcastToPdfTab(sender.tab.id, ok
          ? { type, labels: result.labels, scoredLabels: result.scoredLabels, ...ctx }
          : { type, ...ctx });
      });
    }

    if (msg.type === 'PDF_FOCUS_ANALYZE') {
      fetchWithAbortTimeout(`${API_BASE}/api/focus`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-argus-version': '0.4.0' },
        body:    JSON.stringify({ text: msg.text, topic: msg.topic }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(result => {
          const type = result?.relevant ? 'PDF_FOCUS_RESULT' : 'PDF_FOCUS_ERROR';
          broadcastToPdfTab(sender.tab.id, result?.relevant
            ? { type, relevant: result.relevant, requestId: msg.requestId }
            : { type, requestId: msg.requestId });
        });
    }

    if (msg.type === 'WORDLISTS_CHANGED') {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }

    if (msg.type === 'AI_STATUS') {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }

    if (msg.type === 'IMMERSIVE_READER_STATUS') {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }

    if (msg.type === 'PRESETS_CHANGED') {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }

    return;
  }

  // Messages from Side Panel / Popup — forward to active tab.
  // When the active tab is a standalone PDF Reader page, route via runtime
  // broadcast (+ targetPdfTabId) because it is an extension page, not a content
  // script; Topic Focus commands are converted to their PDF_* equivalents.
  const PDF_FOCUS_TYPE = {
    FOCUS_APPLY: 'PDF_FOCUS_APPLY',
    FOCUS_CLEAR: 'PDF_FOCUS_CLEAR',
    FOCUS_AI_REQUEST: 'PDF_FOCUS_REQUEST',
  };
  const forwardToActiveTab = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      if (readerTabs.get(tab.id) === 'pdf') {
        const type = PDF_FOCUS_TYPE[msg.type] ?? msg.type;
        broadcastToPdfTab(tab.id, { ...msg, type });
      } else {
        chrome.tabs.sendMessage(tab.id, msg);
      }
    });
  };

  if (msg.type === 'SETTINGS_CHANGED')   forwardToActiveTab();
  if (msg.type === 'FOCUS_APPLY')        forwardToActiveTab();
  if (msg.type === 'FOCUS_CLEAR')        forwardToActiveTab();
  if (msg.type === 'FOCUS_AI_REQUEST')   forwardToActiveTab();
  if (msg.type === 'WORDLISTS_CHANGED')  forwardToActiveTab();
  if (msg.type === 'AI_RETRY') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      if (readerTabs.get(tab.id) === 'pdf') {
        // PDF caches are keyed by fingerprint; successes are stable and errors
        // are never cached, so a retry safely re-fetches without cache busting.
        broadcastToPdfTab(tab.id, msg);
        return;
      }
      const url = tab.url;
      if (msg.feature === 'emotion') {
        emotionCache.delete(url);
        emotionPending.delete(url);
      } else if (msg.feature === 'labels') {
        for (const key of [...labelCache.keys()])   if (key.startsWith(url + '|')) labelCache.delete(key);
        for (const key of [...labelPending.keys()]) if (key.startsWith(url + '|')) labelPending.delete(key);
      }
      chrome.tabs.sendMessage(tab.id, msg);
    });
  }
  if (msg.type === 'OPEN_IMMERSIVE_READER')  forwardToActiveTab();
  if (msg.type === 'CLOSE_IMMERSIVE_READER') forwardToActiveTab();
  if (msg.type === 'OPEN_PRESET_EDITOR')     forwardToActiveTab();
  if (msg.type === 'APPLY_PRESET')           forwardToActiveTab();

  if (msg.type === 'GET_ACTIVE_READER_STATUS') publishActiveReaderStatus();

  if (msg.type === 'OPEN_PDF_READER') {
    const params = new URLSearchParams();
    if (msg.sessionId) params.set('session', msg.sessionId);
    if (msg.sourceUrl) params.set('url', msg.sourceUrl);
    if (msg.title)     params.set('title', msg.title);
    chrome.tabs.create({ url: chrome.runtime.getURL(`pdf/reader.html?${params}`) })
      .then(() => chrome.runtime.sendMessage({ type: 'PDF_READER_OPENED' }).catch(() => {}))
      .catch(() => chrome.runtime.sendMessage({ type: 'PDF_READER_OPEN_FAILED' }).catch(() => {}));
  }
});

// Keep Reader status in sync as the user switches or closes tabs.
chrome.tabs.onActivated.addListener(publishActiveReaderStatus);
chrome.tabs.onRemoved.addListener(tabId => {
  readerTabs.delete(tabId);
  publishActiveReaderStatus();
});


// ── Side Panel opener ──────────────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
