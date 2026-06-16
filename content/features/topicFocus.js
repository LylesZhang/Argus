const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','up','about','into','is','are','was','were','be','been','being','have',
  'has','had','do','does','did','will','would','could','should','may','might',
  'can','that','this','these','those','it','its','they','them','their','we',
  'our','you','your','he','she','his','her','not','no','nor','so','yet','both',
  'if','then','than','as','also','just','only','any','all','each','every','some',
  'such','even','more','most','other','same','very','i','me','my','who','which',
  'what','how','when','where','why','one','two','said','says','now','still'
]);

function extractKeywords(text) {
  return text.toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function scoreSentence(text, keywords) {
  const words   = extractKeywords(text);
  const wordSet = new Set(words);
  let score = 0;
  for (const kw of keywords) {
    if (wordSet.has(kw)) { score += 3; continue; }
    if (kw.length >= 5) {
      const stem = kw.slice(0, Math.ceil(kw.length * 0.75));
      if (words.some(w => w.startsWith(stem))) score += 1;
    }
  }
  return score;
}

export function applyFocusMask(keywords) {
  document.querySelectorAll('.dra-sentence').forEach(el => {
    const focused = scoreSentence(el.textContent, keywords) > 0;
    el.style.fontWeight = focused ? '700' : '';
    el.style.color      = focused ? '' : '#aaa';
    el.style.opacity    = '';
  });
}

export function applyFocusMaskByPrefixes(prefixes) {
  document.querySelectorAll('.dra-sentence').forEach(el => {
    const text    = el.textContent.trim().slice(0, 30);
    const focused = prefixes.some(p => text.startsWith(p.slice(0, 25)));
    el.style.fontWeight = focused ? '700' : '';
    el.style.color      = focused ? '' : '#aaa';
    el.style.opacity    = '';
  });
}

export function clearFocusMask() {
  document.querySelectorAll('.dra-sentence').forEach(el => {
    el.style.fontWeight = '';
    el.style.color      = '';
    el.style.opacity    = '';
  });
}
