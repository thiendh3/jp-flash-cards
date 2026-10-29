import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toKana, finalizeKana, isSpellingCorrect, keepTypable } from '../src/kana.js';
import { isMeaningCorrect, checkAnswer } from '../src/quiz.js';

test('toKana converts common romaji', () => {
  assert.equal(toKana('keshiki'), 'けしき');
  assert.equal(toKana('shougakkou'), 'しょうがっこう');
  assert.equal(toKana('kyouto'), 'きょうと');
  assert.equal(toKana('gakkou'), 'がっこう');
  assert.equal(toKana('seinengappi'), 'せいねんがっぴ');
  assert.equal(toKana('konnichiha'), 'こんにちは');
  assert.equal(toKana('ra-men'), 'らーめn');
  assert.equal(toKana('xtu'), 'っ');
  assert.equal(toKana('jisho'), 'じしょ');
});

test('toKana keeps incomplete romaji and handles trailing n', () => {
  assert.equal(toKana('k'), 'k');
  assert.equal(toKana('kansh'), 'かんsh');
  assert.equal(toKana('han'), 'はn');
  assert.equal(finalizeKana('han'), 'はん');
  assert.equal(toKana('hanna'), 'はんな');
  assert.equal(toKana('kinyuu'), 'きにゅう');
});

test('keepTypable strips kanji', () => {
  assert.equal(keepTypable('景色けしきabc!'), 'けしきabc');
});

test('isSpellingCorrect: hiragana vs katakana, alternatives, 〜', () => {
  assert.ok(isSpellingCorrect('keshiki', 'けしき'));
  assert.ok(isSpellingCorrect('けしき', 'けしき'));
  assert.ok(!isSpellingCorrect('keshik', 'けしき'));
  assert.ok(isSpellingCorrect('shoppu', 'ショップ'));
  assert.ok(isSpellingCorrect('ra-men', 'ラーメン'));
  assert.ok(isSpellingCorrect('tokeru', 'とける・ほどける'));
  assert.ok(isSpellingCorrect('hodokeru', 'とける・ほどける'));
  assert.ok(isSpellingCorrect('kinshi', '〜きんし'));
  assert.ok(isSpellingCorrect('han', 'はん'));
  assert.ok(!isSpellingCorrect('', 'はん'));
});

test('isMeaningCorrect: include, no diacritics needed, min length', () => {
  const m = 'Nói đến N thì…, nhắc tới N là nghĩ ngay đến…';
  assert.ok(isMeaningCorrect('nhắc tới', m));
  assert.ok(isMeaningCorrect('nhac toi', m));
  assert.ok(isMeaningCorrect('NGHĨ NGAY', m));
  assert.ok(!isMeaningCorrect('xin chào', m));
  assert.ok(!isMeaningCorrect('n', m));
  assert.ok(!isMeaningCorrect('', m));
});

test('checkAnswer dispatches by kind', () => {
  assert.ok(checkAnswer('vocab', 'keshiki', { spelling: 'けしき', meaning: 'x' }));
  assert.ok(checkAnswer('grammar', 'để làm', { meaning: 'để làm gì' }));
});
