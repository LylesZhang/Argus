import { findContentArea } from '../detect.js';
import { state } from '../state.js';

export const DEFAULT_EMOTION_POSITIVE = [
  // Joy / Happiness
  'joy','delight','elation','bliss','euphoria','jubilation','glee','cheerful','merry','ecstatic',
  // Love / Connection
  'love','adore','cherish','embrace','compassion','empathy','kindness','warmth','tender','affection',
  // Hope / Optimism
  'hope','optimism','inspiration','aspire','dream','vision','faith','belief','confidence','promise',
  // Admiration / Pride
  'proud','admire','celebrate','triumph','honor','remarkable','extraordinary','magnificent','outstanding','brilliant',
  // Growth / Success
  'thrive','flourish','breakthrough','achieve','progress','succeed','innovate','discover','heal','unite',
  // General positive
  'wonderful','amazing','incredible','fantastic','excellent','beautiful','glorious','grateful','courage','strength',
];

export const DEFAULT_EMOTION_NEGATIVE = [
  // Fear / Dread
  'fear','dread','terror','horror','panic','fright','anxiety','nightmare','terrifying','horrific',
  // Grief / Loss
  'grief','sorrow','mourning','heartbreak','anguish','despair','desolate','tragic','tragedy','devastate',
  // Anger / Hatred
  'anger','rage','fury','hatred','hate','wrath','outrage','indignation','resentment','hostility',
  // Pain / Suffering
  'suffer','agony','torment','misery','pain','trauma','brutal','cruel','ruthless','savage',
  // Violence / Destruction
  'violence','destroy','collapse','ruin','catastrophe','disaster','crisis','devastation','atrocity','massacre',
  // Injustice / Oppression
  'abuse','betray','corrupt','injustice','oppression','discrimination','poverty','inequality','exploitation','shame',
  // Loss / Failure
  'loss','failure','defeat','hopeless','helpless','powerless','victim','casualty','threat','danger',
];

export const DEFAULT_EMOTION_COMPLEX = [
  // Ambivalence
  'bittersweet','ambivalent','conflicted','mixed','paradox','ironic','contradictory','ambiguous',
  // Uncertainty / Anxiety
  'uncertain','uneasy','anxious','apprehensive','troubled','unsettled','precarious','fragile','vulnerable',
  // Nostalgia / Longing
  'nostalgia','wistful','longing','melancholy','wistfulness','yearning','reminisce','haunted',
  // Complexity
  'nuanced','complicated','dilemma','tension','controversial','fraught','delicate','sensitive','paradoxical',
  // Resignation / Cynicism
  'resigned','cynical','skeptical','disillusioned','weary','exhausted','sacrifice','compromise',
  // Disturbing / Unsettling
  'disturbing','troubling','perplexing','unsettling','disconcerting','harrowing','sobering','chilling',
];

export function matchEmotionWords(text, wordLists) {
  const pos = wordLists.emotionPositive ?? DEFAULT_EMOTION_POSITIVE;
  const neg = wordLists.emotionNegative ?? DEFAULT_EMOTION_NEGATIVE;
  const cmp = wordLists.emotionComplex  ?? DEFAULT_EMOTION_COMPLEX;

  const lower = text.toLowerCase();
  const highlights = [];
  for (const [words, category] of [
    [pos, 'emotion-positive'],
    [neg, 'emotion-negative'],
    [cmp, 'emotion-complex'],
  ]) {
    for (const word of words) {
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx  = new RegExp(`(?<![a-zA-Z-])${esc}(?![a-zA-Z-])`);
      if (rx.test(lower)) highlights.push({ word, category });
    }
  }
  return highlights;
}

export function generateEmotionHighlights() {
  const area = findContentArea();
  return matchEmotionWords(area.innerText, state.wordLists);
}

export function requestEmotionAnalysis() {
  if (state.emotionAIInProgress) {
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'emotion', status: 'loading' });
    return;
  }
  if (state.aiEmotionHighlights.length > 0) {
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'emotion', status: 'success' });
    return;
  }
  state.emotionAIInProgress = true;
  chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'emotion', status: 'loading' });
  const area = findContentArea();
  chrome.runtime.sendMessage({
    type: 'EMOTION_REQUEST',
    url:  window.location.href,
    text: area.innerText.trim(),
  });
}
