// Romaji → hiragana (gõ latin, ra kana; không bao giờ ra kanji).

const BASE = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
  cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ',
  sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ',
  tsa: 'つぁ', tsi: 'つぃ', tse: 'つぇ', tso: 'つぉ',
  tha: 'てゃ', thi: 'てぃ', thu: 'てゅ', the: 'てぇ', tho: 'てょ',
  dha: 'でゃ', dhi: 'でぃ', dhu: 'でゅ', dhe: 'でぇ', dho: 'でょ',
  twu: 'とぅ', dwu: 'どぅ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', xwa: 'ゎ',
  '-': 'ー',
};
BASE['n\''] = 'ん';
BASE.nn = 'ん';
BASE.xn = 'ん';
for (const k of Object.keys(BASE)) if (k.startsWith('x')) BASE['l' + k.slice(1)] = BASE[k];

// Hàng + ya/yu/yo (kya, gya, nya, ...). Riêng j/ch/sh đã khai báo ở trên.
const YOON = { k: 'き', g: 'ぎ', s: 'し', z: 'じ', t: 'ち', d: 'ぢ', n: 'に', h: 'ひ', b: 'び', p: 'ぴ', m: 'み', r: 'り', f: 'ふ', v: 'ゔ' };
const SMALL = { a: 'ゃ', u: 'ゅ', o: 'ょ', e: 'ぇ' };
for (const [c, kana] of Object.entries(YOON)) {
  for (const [v, small] of Object.entries(SMALL)) {
    if (c === 'f' && v !== 'u') continue;
    BASE[`${c}y${v}`] ??= kana + small;
  }
}
BASE.jya = 'じゃ'; BASE.jyu = 'じゅ'; BASE.jyo = 'じょ';
BASE.tya = 'ちゃ'; BASE.tyu = 'ちゅ'; BASE.tyo = 'ちょ';
BASE.sya = 'しゃ'; BASE.syu = 'しゅ'; BASE.syo = 'しょ';
BASE.cya = 'ちゃ'; BASE.cyu = 'ちゅ'; BASE.cyo = 'ちょ';

const MAX = Math.max(...Object.keys(BASE).map((k) => k.length));
const VOWEL = /[aiueo]/;
const DOUBLE = /[bcdfghjklmpqrstvwxyz]/;

// Chuyển chuỗi nhập thành kana. Phần romaji chưa đủ để thành kana (vd "k", "sh") giữ nguyên
// để người dùng gõ tiếp; "n" đứng cuối cũng được giữ lại (có thể là "na", "ni"…).
export function toKana(input) {
  const s = input.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    // っ: hai phụ âm giống nhau (trừ n)
    if (rest.length > 1 && rest[0] === rest[1] && DOUBLE.test(rest[0]) && rest[0] !== 'n') {
      out += 'っ';
      i += 1;
      continue;
    }
    // ん: n + phụ âm (không phải y, n) hoặc n + ký tự không phải chữ cái
    if (rest[0] === 'n' && rest.length > 1 && !VOWEL.test(rest[1]) && rest[1] !== 'y' && rest[1] !== 'n' && rest[1] !== '\'') {
      out += 'ん';
      i += 1;
      continue;
    }
    // "konnichi" → こんにち: nn + nguyên âm/y thì n đầu là ん, n sau mở đầu na/ni/…
    if (rest.length > 2 && rest[0] === 'n' && rest[1] === 'n' && /[aiueoy]/.test(rest[2])) {
      out += 'ん';
      i += 1;
      continue;
    }
    let hit = null;
    for (let len = Math.min(MAX, rest.length); len > 0; len--) {
      const k = rest.slice(0, len);
      if (BASE[k]) {
        hit = k;
        break;
      }
    }
    if (hit) {
      out += BASE[hit];
      i += hit.length;
    } else {
      out += rest[0]; // chưa thành kana / ký tự khác: giữ nguyên
      i += 1;
    }
  }
  return out;
}

// Khi chấm bài: "n" còn dư ở cuối là ん.
export function finalizeKana(input) {
  return toKana(input).replace(/n$/, 'ん');
}

const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// Chỉ giữ hiragana/katakana/ー và chữ latin đang gõ dở; kanji và ký tự khác bị bỏ.
export function keepTypable(s) {
  return s.replace(/[^぀-ヿーa-zA-Z'\-]/g, '');
}

export function normalizeKana(s) {
  return toHira(String(s ?? '').normalize('NFKC'))
    .replace(/[\s〜～~・、,]/g, '');
}

// Đáp án đúng nếu khớp với toàn bộ spelling, hoặc với một trong các phần tách bởi "・" (vd "とける・ほどける").
export function isSpellingCorrect(input, spelling) {
  const typed = normalizeKana(finalizeKana(input));
  if (!typed) return false;
  const parts = String(spelling).split('・');
  return [spelling, ...parts].some((p) => normalizeKana(p) === typed);
}
