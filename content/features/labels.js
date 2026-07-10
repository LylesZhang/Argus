import { findContentArea } from '../detect.js';
import { state } from '../state.js';
import { splitSentences } from '../utils.js';

// Rule order within each lens follows importance ranking (essence → support → background),
// so the highest-priority label wins when a sentence matches multiple.
export const LENS_RULES = {
  news: {
    'core-fact': [
      /\b(announced|confirmed|declared|signed|approved|passed|killed|arrested|elected|won|lost)\b/i,
      /\b(breaking|just in|update|developing)\b/i,
    ],
    impact: [
      /\b(as a result|could|would|may|threatens?|at stake|consequences?|significant(ly)?|impacts?|affects?|means (for|that)|benefits?|at risk)\b/i,
      /\b(warned|fear|hope|promises?|jeopardi[sz]e)\b/i,
    ],
    context: [
      /\b(in the wake of|following years of|historically|since \d{4}|long.standing|decades.long)\b/i,
      /\b(background|context|previously|at the time)\b/i,
    ],
  },
  stem: {
    mechanism: [
      /\b(first|then|next|subsequently|as a result|this causes|leading to|which triggers|therefore|thus|consequently)\b/i,
    ],
    concept: [
      /\bis defined as\b/i,
      /\b(known as|referred to as|termed|called)\b/i,
      /\bthe (process|phenomenon|principle|law|theory|property) of\b/i,
    ],
    finding: [
      /\b(we (found|show|demonstrate|conclude)|results? show|the results?|in conclusion|our findings?)\b/i,
      /\b(achieved|outperforms?|reduced by|increased by|improv(es|ed)|represents? a (significant )?breakthrough)\b/i,
      /\b\d+(\.\d+)?%/,
    ],
  },
  humanities: {
    thesis: [
      /\b(this (paper|essay|article|study) (argues?|contends?|proposes?|demonstrates?))\b/i,
      /\b(I argue|I contend|my (claim|argument|thesis) is)\b/i,
    ],
    evidence: [
      /\b(according to|cited in|as [A-Z][a-z]+ (\(\d{4}\))? (noted?|argues?|writes?))\b/i,
      /\b(historical records?|archival|census data|survey(s)?|statistics show)\b/i,
      /\(\d{4}[,)]/,
    ],
    explanation: [
      /\b(this (means?|suggests?|indicates?|demonstrates?|reveals?|implies?))\b/i,
      /\b(in other words|that is to say|put differently|this is because)\b/i,
      /\b(explains? (why|how)|the reason (is|why|for))\b/i,
    ],
  },
  fiction: {
    'plot-turn': [
      /\b(suddenly|at that moment|without warning|for the first time|everything changed|realized|discovered|revealed)\b/i,
      /\b(shot|killed|ran|burst|collapsed|vanished|appeared|attacked|escaped)\b/i,
    ],
    setting: [
      /\b(the (room|air|sky|street|forest|castle|ocean|light|darkness|silence))\b/i,
      /\b(smelled?|felt|looked|seemed|appeared|stretched|loomed|glittered|faded)\b/i,
    ],
  },
};

// Importance ranking for local mode (AI mode gets ranking from the server response).
// STEM defaults to the "explanatory" ordering since local rules can't detect sub-type.
export const LOCAL_LENS_RANKING = {
  news:       ['core-fact', 'impact', 'context'],
  stem:       ['mechanism', 'concept', 'finding'],
  humanities: ['thesis', 'evidence', 'explanation'],
  fiction:    ['plot-turn', 'setting'],
};

// A label type is visible only if it falls within the top-`colorCount` of the
// importance ranking. Types outside the ranking are hidden.
export function isLabelVisible(type, ranking, colorCount) {
  if (!ranking || ranking.length === 0) return true;
  const idx = ranking.indexOf(type);
  if (idx === -1) return false;
  return idx < (colorCount ?? ranking.length);
}

export function extractAllSentences() {
  const area = findContentArea();
  return area.innerText
    .split(/\n+/).filter(p => p.trim().length > 20)
    .flatMap(p => splitSentences(p.trim()).filter(s => s.trim()));
}

export function generateSentenceLabels() {
  const lens      = state.settings.sentenceLabelsLens ?? 'news';
  const rules     = LENS_RULES[lens];
  const sentences = extractAllSentences();
  const labels    = [];
  sentences.forEach((s, i) => {
    for (const [type, patterns] of Object.entries(rules)) {
      if (patterns.some(rx => rx.test(s))) {
        labels.push({ index: i, type });
        break;
      }
    }
  });
  return labels;
}

export function requestSentenceLabels() {
  if (state.sentenceLabelsInProgress) {
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'labels', status: 'loading' });
    return;
  }
  if (state.aiSentenceLabels.length > 0) {
    chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'labels', status: 'success' });
    return;
  }
  state.sentenceLabelsInProgress = true;
  state.allSentences = extractAllSentences();
  chrome.runtime.sendMessage({ type: 'AI_STATUS', feature: 'labels', status: 'loading' });
  chrome.runtime.sendMessage({
    type:        'LABEL_REQUEST',
    sentences:   state.allSentences,
    articleLens: state.settings.sentenceLabelsLens ?? 'news',
  });
}
