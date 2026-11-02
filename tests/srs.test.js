import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERVALS, today, nextEntry, dueKeys, cleanProgress } from '../src/srs.js';

test('từ mới nhớ → hộp 1, ôn lại sau 1 ngày', () => {
  assert.deepEqual(nextEntry(undefined, true, 100), { box: 1, due: 101 });
});

test('nhớ liên tiếp lên hộp theo INTERVALS, hộp 5 giữ nguyên', () => {
  let e;
  const dues = [];
  for (let i = 0; i < 7; i++) {
    e = nextEntry(e, true, 0);
    dues.push(e.due);
  }
  assert.deepEqual(dues, [1, 3, 7, 14, 30, 30, 30]);
  assert.equal(e.box, INTERVALS.length);
});

test('quên → về hộp 1, ôn lại sau 1 ngày', () => {
  assert.deepEqual(nextEntry({ box: 4, due: 50 }, false, 60), { box: 1, due: 61 });
  assert.deepEqual(nextEntry(undefined, false, 60), { box: 1, due: 61 });
});

test('dueKeys: từ mới + từ đến hạn, bỏ từ chưa đến hạn', () => {
  const progress = { a: { box: 2, due: 10 }, b: { box: 2, due: 11 }, c: { box: 1, due: 9 } };
  assert.deepEqual(dueKeys(['a', 'b', 'c', 'd'], progress, 10), ['a', 'c', 'd']);
});

test('today theo giờ địa phương: 23:30 và 00:30 địa phương khác ngày', () => {
  const tz = -420; // UTC+7
  const a = today(Date.UTC(2026, 10, 2, 16, 30), tz); // 23:30 ngày 2/11 địa phương
  const b = today(Date.UTC(2026, 10, 2, 17, 30), tz); // 00:30 ngày 3/11 địa phương
  assert.equal(b, a + 1);
});

test('cleanProgress bỏ entry sai định dạng', () => {
  const out = cleanProgress({ ok: { box: 3, due: 5 }, badBox: { box: 9, due: 5 }, badDue: { box: 1, due: 'x' }, n: null });
  assert.deepEqual(out, { ok: { box: 3, due: 5 } });
  assert.deepEqual(cleanProgress('oops'), {});
});
