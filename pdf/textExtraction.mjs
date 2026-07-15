// Pure helpers for turning PDF.js text items into reflowed document blocks.
// Kept dependency-free so they can be unit-tested under Node.

// Group text items into lines by their vertical (Y) position. Items whose Y
// differs by more than 4px from the previous item start a new line.
export function normalizeLines(items) {
  const lines = [];
  let line = [];
  let lastY = null;
  for (const item of items) {
    const y = Math.round(item.transform[5]);
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      if (line.length) lines.push(line.join(' ').replace(/\s+/g, ' ').trim());
      line = [];
    }
    line.push(item.str);
    lastY = y;
  }
  if (line.length) lines.push(line.join(' ').replace(/\s+/g, ' ').trim());
  return lines;
}

// Flatten pages into readable blocks. Drops repeated headers/footers (a line
// appearing on 3+ pages) and very short lines; retains source-page mapping.
export function blocksFromPages(pages) {
  const repeated = new Map();
  pages.forEach(page => page.lines.forEach(line => {
    if (line.length > 3) repeated.set(line, (repeated.get(line) || 0) + 1);
  }));
  return pages.flatMap(page => page.lines
    .filter(line => line.length >= 25 && (repeated.get(line) || 0) < 3)
    .map(text => ({ text, pageStart: page.number, pageEnd: page.number })));
}
