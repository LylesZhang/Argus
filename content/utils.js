export const ABBR = new Set([
  'mr','mrs','ms','dr','prof','rev','sen','rep','gov',
  'gen','lt','col','sgt','capt','adm',
  'st','mt','ave','blvd','rd',
  'jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec',
  'vs','etc','approx','no','vol',
]);

export function splitSentences(text) {
  const result = [];
  let start = 0;
  for (const m of text.matchAll(/(?<=[.!?])(\s+)(?=[A-Z"'\[])/g)) {
    const word = text.slice(0, m.index).match(/([a-zA-Z]+)[.!?]$/)?.[1] ?? '';
    if (/^[A-Z]$/.test(word) || ABBR.has(word.toLowerCase())) continue;
    result.push(text.slice(start, m.index));
    start = m.index + m[1].length;
  }
  result.push(text.slice(start));
  return result;
}
