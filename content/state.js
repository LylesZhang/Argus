import { DEFAULT_SETTINGS } from './settings.js';

export const state = {
  settings:                { ...DEFAULT_SETTINGS },
  originalHTML:            new WeakMap(),
  contentArea:             null,
  lastRulerY:              null,
  emotionAIInProgress:      false,
  sentenceLabelsInProgress: false,
  aiEmotionHighlights:      [],
  aiSentenceLabels:         [],
  articleHighlights:        [],
  topicFocusKeywords:       null,
  sentenceLabels:           [],
  allSentences:             [],
};
