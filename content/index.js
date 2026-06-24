// Entry point: bootstrap + message router
// All feature logic lives in features/*.js and render.js

import { DEFAULT_SETTINGS } from './settings.js';
import { state } from './state.js';
import { render } from './render.js';
import { findContentArea } from './detect.js';
import { clearFocusMask } from './features/topicFocus.js';
import { DEFAULT_EMOTION_POSITIVE, DEFAULT_EMOTION_NEGATIVE, DEFAULT_EMOTION_COMPLEX } from './features/emotions.js';
import { DEFAULT_TRANSITION_WORDS } from './features/transitions.js';
import { openImmersiveReader, closeImmersiveReader, refreshImmersiveReader } from './features/immersiveReader.js';

const DEFAULT_WORD_LISTS = {
  emotionPositive: [...DEFAULT_EMOTION_POSITIVE],
  emotionNegative: [...DEFAULT_EMOTION_NEGATIVE],
  emotionComplex:  [...DEFAULT_EMOTION_COMPLEX],
  transition:      [...DEFAULT_TRANSITION_WORDS],
};

// ── Bootstrap ──────────────────────────────────────────────────────────

chrome.storage.sync.get(['draSettings', 'draWordLists'], (data) => {
  if (data.draSettings) {
    state.settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
    // Migrate legacy setting name
    if (state.settings.transitionAnimation === undefined && data.draSettings.logicAnimation !== undefined) {
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

// ── Message router ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SETTINGS_CHANGED') {
    if (msg.payload.rulerActive === false) state.lastRulerY = null;
    const prevLens = state.settings.sentenceLabelsLens;
    state.settings = { ...state.settings, ...msg.payload };
    if (msg.payload.sentenceLabelsLens && msg.payload.sentenceLabelsLens !== prevLens) {
      state.aiSentenceLabels         = [];
      state.sentenceLabels           = [];
      state.sentenceLabelsInProgress = false;
    }
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'FOCUS_APPLY' && msg.keywords?.length) {
    state.topicFocusAIPrefixes = null;
    state.topicFocusKeywords   = msg.keywords;
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'FOCUS_CLEAR') {
    state.topicFocusKeywords  = null;
    state.topicFocusAIPrefixes = null;
    clearFocusMask();
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'LABEL_RESULT') {
    state.sentenceLabelsInProgress = false;
    if (msg.labels?.length > 0) {
      state.aiSentenceLabels = msg.labels;
      state.sentenceLabels   = state.aiSentenceLabels;
    }
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'LABEL_ERROR') {
    if (state.settings.sentenceLabels && state.settings.sentenceLabelsMode === 'ai') {
      setTimeout(() => {
        state.sentenceLabelsInProgress = false;
        render();
        refreshImmersiveReader();
      }, 8000);
    } else {
      state.sentenceLabelsInProgress = false;
    }
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
    refreshImmersiveReader();
  }

  if (msg.type === 'FOCUS_ERROR') {
    state.topicFocusAIPrefixes = null;
    clearFocusMask();
  }

  if (msg.type === 'EMOTION_RESULT') {
    console.log('[EMO] result received | highlights:', msg.highlights?.length ?? 'null');
    state.emotionAIInProgress = false;
    if (msg.highlights?.length > 0) {
      state.aiEmotionHighlights = msg.highlights;
    }
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'EMOTION_ERROR') {
    state.emotionAIInProgress = false;
  }

  if (msg.type === 'WORDLISTS_CHANGED') {
    state.wordLists = { ...state.wordLists, ...msg.wordLists };
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'OPEN_IMMERSIVE_READER') {
    openImmersiveReader();
  }

  if (msg.type === 'CLOSE_IMMERSIVE_READER') {
    closeImmersiveReader();
  }
});
