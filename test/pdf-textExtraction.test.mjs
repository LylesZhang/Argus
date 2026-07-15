import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLines, blocksFromPages } from '../pdf/textExtraction.mjs';

test('normalizeLines groups PDF text items by their vertical position', () => {
  const lines = normalizeLines([
    { str: 'First', transform: [1, 0, 0, 1, 0, 700] },
    { str: 'line', transform: [1, 0, 0, 1, 50, 700] },
    { str: 'Second line', transform: [1, 0, 0, 1, 0, 680] },
  ]);
  assert.deepEqual(lines, ['First line', 'Second line']);
});

test('blocksFromPages removes repeated header/footer lines and retains page mapping', () => {
  const blocks = blocksFromPages([
    { number: 1, lines: ['Example publication header', 'This is enough article text to become a reader block on page one.'] },
    { number: 2, lines: ['Example publication header', 'This is enough article text to become a reader block on page two.'] },
    { number: 3, lines: ['Example publication header', 'This is enough article text to become a reader block on page three.'] },
  ]);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map(block => block.pageStart), [1, 2, 3]);
  assert.ok(blocks.every(block => !block.text.includes('publication header')));
});
