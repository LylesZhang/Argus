// Layer 1: platform-specific selectors matched by hostname suffix.
// Layer 2: [itemprop="articleBody"] covers CSS-in-JS news sites (NYT, BBC, Guardian…).
// Layer 3: generic semantic selectors.
// Fallback: <body>.

const PLATFORM_SELECTORS = {
  'apnews.com':           ['.RichTextStoryBody'],
  'wikipedia.org':        ['#mw-content-text .mw-parser-output', '#mw-content-text'],
  'github.com':           ['.markdown-body'],
  'news.ycombinator.com': ['.fatitem'],
  'substack.com':         ['.reader2-post-body', '.available-content'],
  'dev.to':               ['#article-body'],
};

export function findContentArea() {
  const host = window.location.hostname.replace(/^www\./, '');
  const matchedDomain = Object.keys(PLATFORM_SELECTORS)
    .find(domain => host === domain || host.endsWith('.' + domain));
  if (matchedDomain) {
    for (const sel of PLATFORM_SELECTORS[matchedDomain]) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 300) return el;
    }
  }

  const candidates = [
    '[itemprop="articleBody"]',
    'article',
    '[role="main"]',
    'main',
    '.article-body', '.article-content', '.post-content',
    '.entry-content', '.story-body', '#article-body', '#main-content',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (!el || el.innerText.trim().length <= 300) continue;
    const idClass = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
    if (idClass.includes('comment') || idClass.includes('replies') || idClass.includes('discussion')) continue;
    return el;
  }
  return document.body;
}
