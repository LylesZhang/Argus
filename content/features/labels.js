import { findContentArea } from '../detect.js';
import { state } from '../state.js';

export const LABEL_RULES = {
  evidence: [
    /for (example|instance)/i,
    /according to/i,
    /research (shows|suggests|finds|indicates)/i,
    /studies (show|suggest|indicate|found)/i,
    /data (shows|reveals|indicates|suggests)/i,
    /\d+(\.\d+)?(\s?%| million| billion| thousand)/,
    /evidence (shows|suggests|indicates)/i,
    /survey(s)? (show|found|reveal)/i,
    /report(s)? (show|found|reveal|indicate)/i,
    /statistics (show|reveal)/i,
  ],
  argument: [
    /\b(should|must|ought to|need to|have to)\b/i,
    /it is (clear|evident|obvious|crucial|essential|imperative) that/i,
    /\b(argue|contend|assert|claim|maintain|insist)\b/i,
    /we (must|need|should|cannot|can no longer)/i,
    /it is time to/i,
    /the (solution|answer|key) (is|lies)/i,
  ],
  explanation: [
    /\bbecause\b/i,
    /this (means|causes|results in|leads to|explains)/i,
    /as a result/i,
    /due to (the|this|a)/i,
    /explains (why|how)/i,
    /the reason (is|why|for)/i,
    /in other words/i,
    /that is (to say)?/i,
    /this (is because|occurs because|happens because)/i,
  ],
};

export function extractAllSentences() {
  const area = findContentArea();
  return area.innerText
    .split(/\n+/).filter(p => p.trim().length > 20)
    .flatMap(p => p.trim().split(/(?<=[.!?])\s+(?=[A-Z"'\[])/).filter(s => s.trim()));
}

export function generateSentenceLabels() {
  const sentences = extractAllSentences();
  const labels = [];
  sentences.forEach((s, i) => {
    for (const [type, patterns] of Object.entries(LABEL_RULES)) {
      if (patterns.some(rx => rx.test(s))) {
        labels.push({ index: i, type });
        break;
      }
    }
  });
  return labels;
}

export function requestSentenceLabels() {
  if (state.sentenceLabelsInProgress)      return;
  if (state.aiSentenceLabels.length > 0)   return;
  state.sentenceLabelsInProgress = true;
  state.allSentences = extractAllSentences();
  chrome.runtime.sendMessage({ type: 'LABEL_REQUEST', sentences: state.allSentences });
}
