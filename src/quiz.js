// Chấm bài ở chế độ kiểm tra.
import { isSpellingCorrect } from './kana.js';

// Bỏ dấu + chữ thường + gọn khoảng trắng: gõ "nhac toi" vẫn khớp "nhắc tới".
export function foldVi(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const MIN_MEANING_LEN = 3; // tránh "a", "n" khớp mọi thứ

// Ngữ pháp: chỉ cần phần gõ vào nằm trong nghĩa (include), không cần đúng hết.
export function isMeaningCorrect(input, meaning) {
  const typed = foldVi(input);
  return typed.length >= MIN_MEANING_LEN && foldVi(meaning).includes(typed);
}

export function checkAnswer(kind, input, item) {
  return kind === 'grammar' ? isMeaningCorrect(input, item.meaning) : isSpellingCorrect(input, item.spelling);
}
