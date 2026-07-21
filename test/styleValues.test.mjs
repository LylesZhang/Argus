import assert from 'node:assert/strict';
import test from 'node:test';
import { toEmSpacing } from '../content/styleValues.mjs';

test('spacing values preserve an explicit zero and increase monotonically', () => {
  assert.equal(toEmSpacing(0), '0em');
  assert.equal(toEmSpacing(0.01), '0.01em');
  assert.equal(toEmSpacing(0.02), '0.02em');
});

test('invalid spacing values safely reset to zero', () => {
  assert.equal(toEmSpacing(undefined), '0em');
  assert.equal(toEmSpacing('invalid'), '0em');
});
