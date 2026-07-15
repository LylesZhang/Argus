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

// Page headers and footers that repeat on three or more pages are usually
// navigation noise, not article text. Keep short one-off labels out as well.
export function blocksFromPages(pages) {
  const repeated = new Map();
  pages.forEach(page => page.lines.forEach(line => {
    if (line.length > 3) repeated.set(line, (repeated.get(line) || 0) + 1);
  }));
  return pages.flatMap(page => page.lines
    .filter(line => line.length >= 25 && (repeated.get(line) || 0) < 3)
    .map(text => ({ text, pageStart: page.number, pageEnd: page.number })));
}
