// Entry point: bootstrap + message router
// All feature logic lives in features/*.js and render.js

import { DEFAULT_SETTINGS } from './settings.js';
import { state } from './state.js';
import { render } from './render.js';
import { findContentArea } from './detect.js';
import { clearFocusMask } from './features/topicFocus.js';

// ── Bootstrap ──────────────────────────────────────────────────────────

chrome.storage.sync.get(['draSettings', 'draWordLists'], (data) => {
  if (data.draSettings) {
    state.settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
    // Migrate legacy setting name
    if (state.settings.transitionAnimation === undefined && data.draSettings.logicAnimation !== undefined) {
      state.settings.transitionAnimation = data.draSettings.logicAnimation;
    }
  }
  if (data.draWordLists) state.wordLists = { ...state.wordLists, ...data.draWordLists };
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
    state.topicFocusAIPrefixes = null;
    state.topicFocusKeywords   = msg.keywords;
    render();
  }

  if (msg.type === 'FOCUS_CLEAR') {
    state.topicFocusKeywords  = null;
    state.topicFocusAIPrefixes = null;
    clearFocusMask();
    render();
  }

  if (msg.type === 'LABEL_RESULT') {
    state.sentenceLabelsInProgress = false;
    state.aiSentenceLabels         = msg.labels || [];
    state.sentenceLabels           = state.aiSentenceLabels;
    render();
  }

  if (msg.type === 'LABEL_ERROR') {
    state.sentenceLabelsInProgress = false;
  }

  if (msg.type === 'FOCUS_AI_REQUEST') {
    state.topicFocusKeywords = null;
    const area = findContentArea();
    chrome.runtime.sendMessage({
      type:  'FOCUS_ANALYZE',
      topic: msg.topic,
      text:  area.innerText.trim(),
    });
  }

  if (msg.type === 'FOCUS_RESULT') {
    state.topicFocusAIPrefixes = msg.relevant || [];
    render();
  }

  if (msg.type === 'FOCUS_ERROR') {
    state.topicFocusAIPrefixes = null;
    clearFocusMask();
  }

  if (msg.type === 'EMOTION_RESULT') {
    state.emotionAIInProgress = false;
    state.aiEmotionHighlights = msg.highlights || [];
    render();
  }

  if (msg.type === 'EMOTION_ERROR') {
    state.emotionAIInProgress = false;
  }

  if (msg.type === 'WORDLISTS_CHANGED') {
    state.wordLists = { ...state.wordLists, ...msg.wordLists };
    render();
  }
});
