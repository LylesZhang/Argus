import { findContentArea } from '../detect.js';
import { state } from '../state.js';

export const DEFAULT_TRANSITION_WORDS = [
  // Contrast / Opposition
  'however','nevertheless','nonetheless','notwithstanding','conversely',
  'on the other hand','on the contrary','in contrast','by contrast',
  'that said','even so','be that as it may','then again','rather',
  // Addition
  'furthermore','moreover','additionally','likewise','in addition',
  'by the same token','in like manner','in the same way','in the same fashion',
  'coupled with','not to mention',
  // Cause / Result
  'therefore','thus','hence','consequently','accordingly','henceforth',
  'as a result','for this reason','thereupon','in effect','owing to',
  'as a consequence','due to','inasmuch as',
  // Concession
  'although','albeit','whereas','regardless','despite','in spite of',
  'even though','even if','granted that',
  // Conclusion / Summary
  'in conclusion','in summary','in short','in brief','to summarize',
  'overall','all in all','on balance','on the whole','by and large',
  'in essence','to sum up','in the final analysis','given these points',
  'all things considered','in a word','for the most part',
  // Emphasis / Clarification
  'in fact','indeed','notably','in other words','that is to say',
  'to put it differently','to put it another way','namely','specifically',
  'in particular','markedly','above all','most importantly',
  // Example
  'for example','for instance','to illustrate','as an illustration',
  // Sequence / Time
  'meanwhile','subsequently','eventually','formerly','in the meantime',
  'sooner or later','in due time',
  // Condition
  'provided that','given that','in the event that','as long as',
  'on the condition that',
];

export function generateTransitionHighlights() {
  const words = state.wordLists.transition ?? DEFAULT_TRANSITION_WORDS;
  const area = findContentArea();
  const text = area.innerText.toLowerCase();
  const highlights = [];
  for (const phrase of words) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![a-zA-Z-])${escaped}(?![a-zA-Z-])`);
    if (regex.test(text)) {
      highlights.push({ word: phrase, category: 'transition' });
    }
  }
  return highlights;
}
