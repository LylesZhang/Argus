import { DEFAULT_SETTINGS } from './settings.js';

export const state = {
  settings:                { ...DEFAULT_SETTINGS },
  originalHTML:            new WeakMap(),
  contentArea:             null,
  lastRulerY:              null,
  emotionAIRequested:      false,
  aiEmotionHighlights:     [],
  articleHighlights:       [],
  topicFocusKeywords:      null,
  sentenceLabels:          [],
  allSentences:            [],
  sentenceLabelsRequested: false,
};
