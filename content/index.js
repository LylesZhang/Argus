// Entry point: bootstrap + message router
// All feature logic lives in features/*.js and render.js

import { DEFAULT_SETTINGS } from './settings.js';
import { state } from './state.js';
import { render } from './render.js';
import { findContentArea } from './detect.js';
import { clearFocusMask } from './features/topicFocus.js';
import { DEFAULT_EMOTION_POSITIVE, DEFAULT_EMOTION_NEGATIVE, DEFAULT_EMOTION_COMPLEX } from './features/emotions.js';
import { DEFAULT_TRANSITION_WORDS } from './features/transitions.js';
import { openImmersiveReader, closeImmersiveReader, refreshImmersiveReader, setTypewriterActive, setTypewriterSpeed, startTypewriterFromBeginning } from './features/immersiveReader.js';
import { openPresetEditor, maybeShowOnboarding } from './features/presetEditor.js';

const DEFAULT_WORD_LISTS = {
  emotionPositive: [...DEFAULT_EMOTION_POSITIVE],
  emotionNegative: [...DEFAULT_EMOTION_NEGATIVE],
  emotionComplex:  [...DEFAULT_EMOTION_COMPLEX],
  transition:      [...DEFAULT_TRANSITION_WORDS],
};

// ── Bootstrap ──────────────────────────────────────────────────────────

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

chrome.storage.sync.get(['draSettings', 'draWordLists', 'draPresets'], (data) => {
  if (data.draSettings) {
    state.settings = { ...DEFAULT_SETTINGS, ...data.draSettings };
    // Migrate legacy setting name
    if (state.settings.transitionAnimation === undefined && data.draSettings.logicAnimation !== undefined) {
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

  // SPA navigation: reset cached contentArea and stale AI results on URL change
  let _lastUrl = location.href;
  let _renderTimer;
  new MutationObserver(() => {
    if (location.href === _lastUrl) return;
    _lastUrl = location.href;
    state.contentArea        = null;
    state.aiEmotionHighlights = [];
    state.aiSentenceLabels   = [];
    state.sentenceLabels     = [];
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => render(), 500);
  }).observe(document.body, { childList: true, subtree: true });
});

// ── Message router ─────────────────────────────────────────────────────

function applySettingsPayload(payload) {
  if (payload.rulerActive === false) state.lastRulerY = null;
  const prevLens = state.settings.sentenceLabelsLens;
  state.settings = { ...state.settings, ...payload };
  if (payload.sentenceLabelsLens && payload.sentenceLabelsLens !== prevLens) {
    state.aiSentenceLabels         = [];
    state.sentenceLabels           = [];
    state.sentenceLabelsInProgress = false;
  }
  if ('typewriterSpeed'  in payload) setTypewriterSpeed(payload.typewriterSpeed);
  if ('typewriterActive' in payload) setTypewriterActive(payload.typewriterActive);
  render();
  refreshImmersiveReader();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SETTINGS_CHANGED') {
    applySettingsPayload(msg.payload);
  }

  if (msg.type === 'FOCUS_APPLY' && msg.keywords?.length) {
    state.topicFocusAIPrefixes = null;
    state.topicFocusKeywords   = msg.keywords;
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'FOCUS_CLEAR') {
    state.topicFocusKeywords   = null;
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
    chrome.runtime.sendMessage({
      type: 'AI_STATUS', feature: 'labels',
      status: msg.labels?.length > 0 ? 'success' : 'error',
    });
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'LABEL_ERROR') {
    state.sentenceLabelsInProgress = false;
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'labels', status: 'error' });
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
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'focus', status: 'success' });
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'FOCUS_ERROR') {
    state.topicFocusAIPrefixes = null;
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'focus', status: 'error' });
    clearFocusMask();
  }

  if (msg.type === 'EMOTION_RESULT') {
    console.log('[EMO] result received | highlights:', msg.highlights?.length ?? 'null');
    state.emotionAIInProgress = false;
    if (msg.highlights?.length > 0) {
      state.aiEmotionHighlights = msg.highlights;
    }
    chrome.runtime.sendMessage({
      type: 'AI_STATUS', feature: 'emotion',
      status: msg.highlights?.length > 0 ? 'success' : 'error',
    });
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'EMOTION_ERROR') {
    state.emotionAIInProgress = false;
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'emotion', status: 'error' });
  }

  if (msg.type === 'AI_RETRY') {
    if (msg.feature === 'emotion') {
      state.aiEmotionHighlights = [];
      state.emotionAIInProgress = false;
    }
    if (msg.feature === 'labels') {
      state.aiSentenceLabels         = [];
      state.sentenceLabels           = [];
      state.sentenceLabelsInProgress = false;
    }
    render();
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

  if (msg.type === 'OPEN_PRESET_EDITOR') {
    openPresetEditor({ mode: msg.mode, preset: msg.preset, currentSettings: msg.currentSettings });
  }

  if (msg.type === 'APPLY_PRESET') {
    applySettingsPayload(msg.settings);
    applyPresetActions(msg.actions);
  }
});
