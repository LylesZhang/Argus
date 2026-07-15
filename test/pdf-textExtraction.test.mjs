import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLines, blocksFromPages } from '../pdf/textExtraction.mjs';

// Build a PDF.js-like text item at a given Y position.
const item = (str, y) => ({ str, transform: [1, 0, 0, 1, 0, y] });

test('items on the same Y position join into one line', () => {
  const lines = normalizeLines([
    item('The quick', 500),
    item('brown fox', 500),
  ]);
  assert.deepEqual(lines, ['The quick brown fox']);
});

test('a vertical position change starts a new line', () => {
  const lines = normalizeLines([
    item('First line here', 500),
    item('Second line here', 480),
  ]);
  assert.deepEqual(lines, ['First line here', 'Second line here']);
});

test('a small (<=4px) Y jitter does not break a line', () => {
  const lines = normalizeLines([
    item('Same', 500),
    item('line', 497),
  ]);
  assert.deepEqual(lines, ['Same line']);
});

test('headers/footers repeated on 3+ pages are removed', () => {
  const header = 'Chapter 1 — Introduction to the Topic';
  const bodyA = 'This is a sufficiently long paragraph line on page one about things.';
  const bodyB = 'This is a sufficiently long paragraph line on page two about matters.';
  const bodyC = 'This is a sufficiently long paragraph line on page three about stuff.';
  const blocks = blocksFromPages([
    { number: 1, lines: [header, bodyA] },
    { number: 2, lines: [header, bodyB] },
    { number: 3, lines: [header, bodyC] },
  ]);
  const texts = blocks.map(b => b.text);
  assert.ok(!texts.includes(header), 'repeated header should be dropped');
  assert.deepEqual(texts, [bodyA, bodyB, bodyC]);
});

test('retained blocks preserve their source-page mapping', () => {
  const bodyA = 'A long enough line of body text living on the very first page here.';
  const bodyB = 'A long enough line of body text living on the second page over here.';
  const blocks = blocksFromPages([
    { number: 4, lines: [bodyA] },
    { number: 7, lines: [bodyB] },
  ]);
  assert.deepEqual(blocks, [
    { text: bodyA, pageStart: 4, pageEnd: 4 },
    { text: bodyB, pageStart: 7, pageEnd: 7 },
  ]);
});

test('short lines are filtered out', () => {
  const blocks = blocksFromPages([
    { number: 1, lines: ['Too short', 'This line is definitely long enough to be kept as a block.'] },
  ]);
  assert.deepEqual(blocks.map(b => b.text), [
    'This line is definitely long enough to be kept as a block.',
  ]);
});
