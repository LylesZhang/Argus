// First-run feature tour — three static pages shown between the welcome card
// and the preset editor. Each page covers one section (Readability, Focus &
// Navigation, Comprehension) and lays out its features as horizontal cards:
// effect demo on top, then name, then description.
//
// This module is pure content/HTML only — all state and navigation live in
// presetEditor.js. The "effect demos" are frozen static snippets that reuse the
// same CSS classes as the live preview (bionic, emotion, label, transition,
// row-shading), so they look identical to the real thing.

import { applyBionicToText } from './bionic.js';

// Text-based demo wrapper.
const text = html => `<div class="dra-ob-demo-text">${html}</div>`;

const TOUR_PAGES = [
  {
    section: 'Readability',
    blurb: 'Shape how the text itself looks — type, spacing, and color.',
    features: [
      {
        name: 'Font & Size',
        desc: 'Adjust the typeface and text size for comfortable reading.',
        demo: text('<span style="font-size:12px;color:#9899ab;">Aa</span> <span style="font-size:17px;">Aa</span> <span style="font-size:23px;font-weight:600;">Aa</span>'),
      },
      {
        name: 'Spacing',
        desc: 'Fine-tune line height plus letter and word spacing.',
        demo: text('<span style="word-spacing:0.32em;letter-spacing:0.07em;">Room to breathe</span>'),
      },
      {
        name: 'Bionic Reading',
        desc: 'Bolds the first half of each word so your eyes glide faster.',
        demo: text(applyBionicToText('The quick brown fox jumps')),
      },
      {
        name: 'Text Colors',
        desc: 'Set custom text and background colors that suit your eyes.',
        demo: '<div class="dra-ob-demo-text dra-ob-mock-colors">Colors that suit you</div>',
      },
      {
        name: 'Row Shading',
        desc: 'Adds alternating stripes to help you track each line.',
        demo: '<div class="dra-ob-mock-shade"><span></span><span></span><span></span><span></span><span></span></div>',
      },
    ],
  },
  {
    section: 'Focus & Navigation',
    blurb: 'Cut distractions and keep your place as you move through a page.',
    // Six features — lay them out as two rows so the row never feels cramped.
    twoRows: true,
    features: [
      {
        name: 'Open PDF',
        desc: 'Load and read a PDF alongside the current page.',
        demo: '<div class="dra-ob-mock-pdf"><span class="dra-ob-pdf-doc">PDF</span></div>',
      },
      {
        name: 'Reader Mode',
        desc: 'Removes ads and distractions, leaving only the article text.',
        demo: '<div class="dra-ob-mock-reader"><span class="messy"></span><span class="arrow">→</span><span class="clean"></span></div>',
      },
      {
        name: 'Typewriter',
        desc: 'Spotlights the line you are on and dims the rest.',
        demo: '<div class="dra-ob-demo-text dra-ob-mock-tw"><p class="dim">an earlier line</p><p class="lit">your current line</p><p class="dim">a later line</p></div>',
      },
      {
        name: 'Reading Ruler',
        desc: 'A focus band that follows your cursor to hold your place.',
        demo: '<div class="dra-ob-mock-ruler"><p>line above</p><p class="band">the focus band</p><p>line below</p></div>',
      },
      {
        name: 'Auto Scroll',
        desc: 'Slowly advances the page — read completely hands-free.',
        demo: '<div class="dra-ob-mock-scroll"><span class="ln"></span><span class="ln"></span><span class="ln short"></span><span class="arrow">↓</span></div>',
      },
      {
        name: 'Topic Focus',
        desc: 'Highlights sentences that match a topic or keyword you enter.',
        demo: '<div class="dra-ob-demo-text dra-ob-mock-topic"><span class="dim">Policy shifted, and </span><span class="hit">emissions fell 12%</span><span class="dim"> that year.</span></div>',
      },
    ],
  },
  {
    section: 'Comprehension',
    blurb: 'Surface meaning and structure so dense text is easier to follow.',
    features: [
      {
        name: 'Emotion Colors',
        desc: 'Colors words by sentiment — positive, negative, or nuanced.',
        demo: text('A <span class="dra-pe-emotion-positive">triumph</span> tinged with <span class="dra-pe-emotion-complex">bittersweet</span> <span class="dra-pe-emotion-negative">loss</span>.'),
      },
      {
        name: 'Reading Lens',
        desc: 'Highlights each sentence by the role it plays in the text.',
        demo: text('<span class="dra-label-concept">Protein folding shapes function.</span> <span class="dra-label-reasoning">So misfolds cause disease.</span>'),
      },
      {
        name: 'Transition Phrases',
        desc: 'Highlights connective words to trace argument structure.',
        demo: text('It works; <span class="dra-transition-word">however</span>, costs rise, <span class="dra-transition-word">therefore</span> we adapt.'),
      },
      {
        name: 'Simplify Text',
        desc: 'Rewrites selected complex sentences in plain language.',
        demo: '<div class="dra-ob-mock-simplify"><p class="before">Utilize disparate methodologies</p><p class="sep">↓</p><p class="after">Use different methods</p></div>',
      },
    ],
  },
];

export const TOUR_PAGE_COUNT = TOUR_PAGES.length;

function featureCard({ name, desc, demo }) {
  return `<div class="dra-ob-card">
      <div class="dra-ob-demo">${demo}</div>
      <div class="dra-ob-name">${name}</div>
      <div class="dra-ob-desc">${desc}</div>
    </div>`;
}

// Returns the full HTML for a single tour page (0-based index).
export function buildTourPageHTML(pageIndex) {
  const page = TOUR_PAGES[pageIndex];
  const isLast = pageIndex === TOUR_PAGES.length - 1;
  const dots = TOUR_PAGES
    .map((_, i) => `<span class="dot${i === pageIndex ? ' active' : ''}"></span>`)
    .join('');

  return `
    <div class="dra-ob-tour">
      <div class="dra-ob-tour-head">
        <h2 class="dra-ob-section">${page.section}</h2>
        <p class="dra-ob-blurb">${page.blurb}</p>
      </div>
      <div class="dra-ob-cards${page.twoRows ? ' dra-ob-cards--grid' : ''}">
        ${page.features.map(featureCard).join('')}
      </div>
      <div class="dra-ob-nav">
        <button class="dra-ob-skip" type="button">Skip</button>
        <div class="dra-ob-dots">${dots}</div>
        <div class="dra-ob-nav-btns">
          ${pageIndex > 0 ? '<button class="dra-ob-back" type="button">Back</button>' : ''}
          <button class="dra-ob-next" type="button">${isLast ? 'Continue' : 'Next'}</button>
        </div>
      </div>
    </div>`;
}
