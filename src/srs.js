// Logic thuần (không DOM) của lặp lại ngắt quãng kiểu Leitner.
// Mỗi từ có { box, due }: box 1..5, due = số ngày (theo giờ địa phương) từ đó từ được phép hiện lại.
// Từ chưa có entry là từ mới.

export const INTERVALS = [1, 3, 7, 14, 30]; // ngày ôn lại ứng với hộp 1..5

export function today(now = Date.now(), tzOffsetMin = new Date().getTimezoneOffset()) {
  return Math.floor((now - tzOffsetMin * 60000) / 86400000);
}

// Nhớ → lên 1 hộp (từ mới coi như hộp 0, nên lên hộp 1); quên → về hộp 1. Hộp 5 giữ nguyên.
export function nextEntry(entry, known, day) {
  const box = known ? Math.min((entry?.box ?? 0) + 1, INTERVALS.length) : 1;
  return { box, due: day + INTERVALS[box - 1] };
}

// Khoá của các từ cần học hôm nay: từ mới + từ đã đến hạn.
export function dueKeys(keys, progress, day) {
  return keys.filter((k) => !progress[k] || progress[k].due <= day);
}

export function cleanProgress(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, e] of Object.entries(raw)) {
    if (Number.isInteger(e?.box) && e.box >= 1 && e.box <= INTERVALS.length && Number.isInteger(e.due)) {
      out[k] = { box: e.box, due: e.due };
    }
  }
  return out;
}
