import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deck } from '../src/deck.js';

const noShuffle = () => 0.999999; // Fisher-Yates với giá trị này giữ nguyên thứ tự

test('vuốt phải hết list → done', () => {
  const d = new Deck(3, null, noShuffle);
  assert.deepEqual(d.queue, [0, 1, 2]);
  d.swipe(true);
  d.swipe(true);
  assert.equal(d.done, false);
  d.swipe(true);
  assert.equal(d.done, true);
  assert.equal(d.known.size, 3);
});

test('vuốt trái → quay lại ở vòng sau cho đến khi thuộc hết', () => {
  const d = new Deck(3, null, noShuffle);
  d.swipe(false); // 0 chưa thuộc
  d.swipe(true); // 1
  assert.equal(d.round, 1);
  d.swipe(true); // 2 → hết vòng, rollover
  assert.equal(d.round, 2);
  assert.deepEqual(d.queue, [0]);
  assert.equal(d.done, false);
  d.swipe(false); // vẫn chưa thuộc → vòng 3
  assert.equal(d.round, 3);
  d.swipe(true);
  assert.equal(d.done, true);
});

test('undo trong cùng vòng', () => {
  const d = new Deck(3, null, noShuffle);
  d.swipe(true);
  d.swipe(false);
  d.undo();
  assert.deepEqual(d.queue, [1, 2]);
  assert.deepEqual(d.retry, []);
  assert.deepEqual([...d.known], [0]);
  d.undo();
  assert.deepEqual(d.queue, [0, 1, 2]);
  assert.equal(d.canUndo, false);
});

test('undo qua ranh giới vòng khôi phục đúng queue/retry/round', () => {
  const d = new Deck(3, null, noShuffle);
  d.swipe(false); // 0
  d.swipe(false); // 1
  d.swipe(true); // 2 → rollover, queue [0,1]
  assert.equal(d.round, 2);
  d.undo();
  assert.equal(d.round, 1);
  assert.deepEqual(d.queue, [2]);
  assert.deepEqual(d.retry, [0, 1]);
  assert.equal(d.known.size, 0);
  d.swipe(false); // 2 chưa thuộc → rollover lại
  assert.equal(d.round, 2);
  assert.equal(d.queue.length, 3);
});

test('undo thẻ cuối cùng (done) đưa thẻ trở lại', () => {
  const d = new Deck(1, null, noShuffle);
  d.swipe(true);
  assert.equal(d.done, true);
  d.undo();
  assert.equal(d.done, false);
  assert.deepEqual(d.queue, [0]);
});

test('restore từ saved hợp lệ / bỏ saved sai kích thước', () => {
  const d = new Deck(3, null, noShuffle);
  d.swipe(true);
  const saved = JSON.parse(JSON.stringify(d));
  const d2 = new Deck(3, saved, noShuffle);
  assert.deepEqual(d2.queue, [1, 2]);
  assert.deepEqual([...d2.known], [0]);
  const d3 = new Deck(5, saved, noShuffle); // yml đổi số từ → reset
  assert.equal(d3.queue.length, 5);
  assert.equal(d3.known.size, 0);
});
