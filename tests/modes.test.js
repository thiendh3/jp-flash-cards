import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVocab, normalizeGrammar } from '../src/modes.js';

test('normalizeVocab drops rows without kanji and spelling', () => {
  const out = normalizeVocab([{ kanji: ' 景色 ', spelling: 'けしき', meaning: 'phong cảnh' }, { meaning: 'x' }]);
  assert.deepEqual(out, [{ kanji: '景色', spelling: 'けしき', meaning: 'phong cảnh' }]);
});

test('normalizeGrammar drops rows without formula and coerces example to list', () => {
  const out = normalizeGrammar([
    { formula: '～ために', structure: 'V + ために', meaning: 'để', example: 'a' },
    { formula: '～ばかり', example: ['a', '', 'b'] },
    { meaning: 'no formula' },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].example, ['a']);
  assert.deepEqual(out[1].example, ['a', 'b']);
});

test('normalizers reject non-list input', () => {
  assert.throws(() => normalizeVocab({}));
  assert.throws(() => normalizeGrammar('x'));
});
