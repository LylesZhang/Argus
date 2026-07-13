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

const LENS_DENSITY_THRESHOLDS = { low: 85, medium: 75, high: 65 };

function currentLensThreshold() {
  return LENS_DENSITY_THRESHOLDS[state.settings.sentenceLabelsDensity] ?? 75;
}

function filterScoredLabels(scoredLabels, threshold) {
  return scoredLabels
    .filter(label => Number(label.importance) >= threshold)
    .map(({ index, type }) => ({ index, type }));
}

// ── Bootstrap ──────────────────────────────────────────────────────────

// Migrate old genre-based lens values to reading-purpose lens ids.
const OLD_LENS_TO_PURPOSE = { news: 'inform', stem: 'understand', humanities: 'understand', fiction: 'inform', immerse: 'inform' };
function migrateLensSettings(settings) {
  if (OLD_LENS_TO_PURPOSE[settings.sentenceLabelsLens]) {
    settings.sentenceLabelsLens = OLD_LENS_TO_PURPOSE[settings.sentenceLabelsLens];
  }
  const VALID = new Set(['inform', 'understand', 'evaluate']);
  if (!VALID.has(settings.sentenceLabelsLens)) settings.sentenceLabelsLens = 'inform';
  const VALID_DENSITIES = new Set(['low', 'medium', 'high']);
  if (!VALID_DENSITIES.has(settings.sentenceLabelsDensity)) settings.sentenceLabelsDensity = 'medium';
}

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
  migrateLensSettings(state.settings);
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
    state.aiScoredSentenceLabels = [];
    state.sentenceLabels     = [];
    state.sentenceLabelsLoaded = false;
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => render(), 500);
  }).observe(document.body, { childList: true, subtree: true });
});

// ── Message router ─────────────────────────────────────────────────────

function applySettingsPayload(payload) {
  if (payload.rulerActive === false) state.lastRulerY = null;
  const prevLens = state.settings.sentenceLabelsLens;
  const prevDensity = state.settings.sentenceLabelsDensity;
  state.settings = { ...state.settings, ...payload };
  const lensChanged = payload.sentenceLabelsLens && payload.sentenceLabelsLens !== prevLens;
  const densityChanged = payload.sentenceLabelsDensity && payload.sentenceLabelsDensity !== prevDensity;
  if (lensChanged) {
    state.aiSentenceLabels         = [];
    state.aiScoredSentenceLabels   = [];
    state.sentenceLabels           = [];
    state.sentenceLabelsInProgress = false;
    state.sentenceLabelsLoaded     = false;
  } else if (densityChanged && state.sentenceLabelsLoaded) {
    state.aiSentenceLabels = filterScoredLabels(state.aiScoredSentenceLabels, currentLensThreshold());
    state.sentenceLabels = state.aiSentenceLabels;
    state.sentenceLabelsInProgress = false;
    state.sentenceLabelsLoaded = true;
  } else if (densityChanged) {
    state.aiSentenceLabels         = [];
    state.sentenceLabels           = [];
    state.sentenceLabelsInProgress = false;
    state.sentenceLabelsLoaded     = false;
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
    if (msg.lensPurpose !== (state.settings.sentenceLabelsLens ?? 'inform') ||
        msg.minImportance !== currentLensThreshold()) return;
    state.sentenceLabelsInProgress = false;
    state.sentenceLabelsLoaded = Array.isArray(msg.labels);
    state.aiScoredSentenceLabels = Array.isArray(msg.scoredLabels) ? msg.scoredLabels : [];
    state.aiSentenceLabels = Array.isArray(msg.labels) ? msg.labels : [];
    state.sentenceLabels   = state.aiSentenceLabels;
    chrome.runtime.sendMessage({
      type: 'AI_STATUS', feature: 'labels',
      status: Array.isArray(msg.labels) ? 'success' : 'error',
    });
    render();
    refreshImmersiveReader();
  }

  if (msg.type === 'LABEL_ERROR') {
    if (msg.lensPurpose !== (state.settings.sentenceLabelsLens ?? 'inform') ||
        msg.minImportance !== currentLensThreshold()) return;
    state.sentenceLabelsInProgress = false;
    state.sentenceLabelsLoaded = false;
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
      state.aiScoredSentenceLabels   = [];
      state.sentenceLabels           = [];
      state.sentenceLabelsInProgress = false;
      state.sentenceLabelsLoaded     = false;
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
