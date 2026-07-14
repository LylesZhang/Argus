import { findContentArea } from '../detect.js';
import { state } from '../state.js';
import { splitSentences } from '../utils.js';

// Lens is AI-only: sentence roles are classified by the server per reading purpose.
// Valid purposes: 'inform' | 'understand' | 'evaluate'.

const DENSITY_THRESHOLDS = { low: 85, medium: 75, high: 65 };

export function extractAllSentences() {
  const area = findContentArea();
  return area.innerText
    .split(/\n+/).filter(p => p.trim().length > 20)
    .flatMap(p => splitSentences(p.trim()).filter(s => s.trim()));
}

export function requestSentenceLabels() {
  if (state.sentenceLabelsInProgress) {
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'labels', status: 'loading' });
    return;
  }
  if (state.sentenceLabelsLoaded) {
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'labels', status: 'success' });
    return;
  }
  if (state.sentenceLabelsRequestFailed) {
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'labels', status: 'error' });
    return;
  }
  state.sentenceLabelsInProgress = true;
  const requestId = `${state.requestSessionId}:labels:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  state.sentenceLabelsRequestId = requestId;
  state.allSentences = extractAllSentences();
  chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'labels', status: 'loading' });
  chrome.runtime.sendMessage({
    type:        'LABEL_REQUEST',
    requestId,
    sentences:   state.allSentences,
    lensPurpose: state.settings.sentenceLabelsLens ?? 'inform',
    minImportance: DENSITY_THRESHOLDS[state.settings.sentenceLabelsDensity] ?? 75,
  });
}
