// Entry point: bootstrap + message router
// All feature logic lives in features/*.js and render.js

import { DEFAULT_SETTINGS } from './settings.js';
import { state } from './state.js';
import { render } from './render.js';
import { findContentArea } from './detect.js';
import { applyFocusMask, applyFocusMaskByPrefixes, clearFocusMask } from './features/topicFocus.js';

// ── Bootstrap ──────────────────────────────────────────────────────────

chrome.storage.sync.get('draSettings', (data) => {
  if (data.draSettings) {
    state.settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
    // Migrate legacy setting name
    if (state.settings.transitionAnimation === undefined && data.draSettings.logicAnimation !== undefined) {
      state.settings.transitionAnimation = data.draSettings.logicAnimation;
    }
  }
  render();
});

// ── Message router ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SETTINGS_CHANGED') {
    if (msg.payload.rulerActive === false) state.lastRulerY = null;
    state.settings = { ...state.settings, ...msg.payload };
    render();
  }

  if (msg.type === 'FOCUS_APPLY' && msg.keywords?.length) {
    state.topicFocusKeywords = msg.keywords;
    render();
  }

  if (msg.type === 'FOCUS_CLEAR') {
    state.topicFocusKeywords = null;
    clearFocusMask();
    render();
  }

  if (msg.type === 'LABEL_RESULT') {
    state.sentenceLabels = msg.labels || [];
    render();
  }

  if (msg.type === 'FOCUS_AI_REQUEST') {
    const area = findContentArea();
    chrome.runtime.sendMessage({
      type:  'FOCUS_ANALYZE',
      topic: msg.topic,
      text:  area.innerText.trim(),
    });
  }

  if (msg.type === 'FOCUS_RESULT') {
    applyFocusMaskByPrefixes(msg.relevant || []);
  }

  if (msg.type === 'EMOTION_RESULT') {
    if (state.settings.emotionMode === 'ai') {
      state.aiEmotionHighlights = (msg.highlights || []).filter(h => h.category !== 'transition');
      render();
    }
  }
});
