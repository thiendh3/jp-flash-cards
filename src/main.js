import yaml from 'js-yaml';
import './style.css';
import { Deck } from './deck.js';
import { attachGestures } from './gestures.js';
import { normalizeVocab, normalizeGrammar } from './modes.js';
import { toKana, keepTypable, isSpellingCorrect } from './kana.js';
import { today, nextEntry, dueKeys, cleanProgress } from './srs.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const card = $('card');
const inner = $('inner');

let words = []; // thẻ của buổi học hôm nay (từ mới + từ đến hạn)
let sessionKeys = []; // khoá ổn định của từng thẻ trong words (cùng thứ tự)
let bank = new Map(); // khoá → toàn bộ từ trong file yml
let progress = {}; // khoá → { box, due } (xem srs.js)
let day = 0;
let deck = null;
let storageKey = '';
let busy = false;
let toastTimer = 0;

// ---------- load ----------
// Khoá ổn định cho mỗi từ: không phụ thuộc vị trí trong file nên thêm/sửa yml không làm mất tiến độ.
const MODES = {
  vocab: { file: 'vocab.yml', label: 'từ vựng', unit: 'từ', normalize: normalizeVocab, key: (w) => `${w.kanji}|${w.spelling}` },
  grammar: { file: 'grammar.yml', label: 'ngữ pháp', unit: 'mẫu', normalize: normalizeGrammar, key: (w) => w.formula },
};
const MODE_KEY = 'jpfc:mode';

function savedMode() {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m in MODES) return m;
  } catch {}
  return 'vocab';
}

const STUDY_KEY = 'jpfc:study';

function savedStudy() {
  try {
    const m = localStorage.getItem(STUDY_KEY);
    if (m === 'flash' || m === 'test') return m;
  } catch {}
  return 'flash';
}

let mode = savedMode();
let study = savedStudy(); // 'flash' = thẻ lật, 'test' = gõ đáp án để qua thẻ
// Ngữ pháp chỉ có thẻ lật; chế độ kiểm tra chỉ dành cho từ vựng.
const curStudy = () => (mode === 'grammar' ? 'flash' : study);
let revealed = false; // chế độ kiểm tra: đã xem đáp án, Enter để sang thẻ kế
let loadSeq = 0; // bỏ qua kết quả fetch cũ khi người dùng đổi tab nhanh

async function load() {
  const cfg = MODES[mode];
  const seq = ++loadSeq;
  app.dataset.state = 'loading';
  app.dataset.mode = mode;
  app.dataset.study = curStudy();
  $('studySeg').hidden = mode === 'grammar';
  document.querySelectorAll('.seg__btn').forEach((b) => {
    const on = b.dataset.mode ? b.dataset.mode === mode : b.dataset.study === curStudy();
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('status').textContent = `Đang tải ${cfg.label}…`;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${cfg.file}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const list = cfg.normalize(yaml.load(text));
    if (!list.length) throw new Error(`${cfg.file} đang trống`);
    if (seq !== loadSeq) return;
    bank = new Map();
    for (const w of list) {
      const k = cfg.key(w);
      if (!bank.has(k)) bank.set(k, w);
    }

    storageKey = `jpfc:srs:${mode}${curStudy() === 'test' ? ':test' : ''}`; // tiến độ thẻ và kiểm tra tách riêng
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey));
    } catch {}
    progress = cleanProgress(saved?.progress);
    day = today();
    startSession(saved?.session);
    app.dataset.state = 'ready';
    render();
  } catch (err) {
    if (seq !== loadSeq) return;
    app.dataset.state = 'error';
    $('status').innerHTML = '';
    const msg = document.createElement('span');
    msg.textContent = `Không tải được ${cfg.label} 😢 (${err.message}) `;
    const retry = document.createElement('button');
    retry.className = 'btn btn--small';
    retry.textContent = 'Thử lại';
    retry.onclick = load;
    $('status').append(msg, retry);
  }
}

// Khôi phục buổi học dở dang trong cùng ngày; nếu không thì dựng buổi mới từ từ mới + từ đến hạn.
function startSession(savedSession) {
  if (savedSession?.day === day && Array.isArray(savedSession.keys) && savedSession.keys.every((k) => bank.has(k))) {
    sessionKeys = savedSession.keys;
    deck = new Deck(sessionKeys.length, savedSession.deck);
  } else {
    sessionKeys = dueKeys([...bank.keys()], progress, day);
    deck = new Deck(sessionKeys.length);
  }
  words = sessionKeys.map((k) => bank.get(k));
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ progress, session: { day, keys: sessionKeys, deck } }));
  } catch {}
}

// ---------- render ----------
function render() {
  const total = words.length;
  const known = deck.known.size;
  $('left').textContent = deck.queue.length + deck.retry.length;
  $('known').textContent = known;
  $('round').textContent = deck.round;
  const pct = total ? Math.round((known / total) * 100) : 100;
  $('barFill').style.width = `${pct}%`;
  $('bar').setAttribute('aria-valuenow', pct);

  app.classList.toggle('is-done', deck.done);
  $('done').hidden = !deck.done;
  $('row').hidden = deck.done;
  $('quiz').hidden = deck.done || curStudy() !== 'test';
  $('btnYes').disabled = $('btnNo').disabled = deck.done;
  $('undo').disabled = !deck.canUndo;

  if (deck.done) {
    $('doneText').textContent = total
      ? `Xong buổi hôm nay: ${total} ${MODES[mode].unit} sau ${deck.round} vòng.`
      : `Hôm nay chưa có ${MODES[mode].unit} nào đến hạn ôn.`;
    confetti();
    return;
  }

  const w = words[deck.current];
  const word = w.kanji || w.spelling;
  // Kiểm tra: từ không có kanji (katakana, ぼろぼろ…) mà hiện nguyên chữ thì chỉ là chép lại → hiện nghĩa thay.
  const kanaOnly = curStudy() === 'test' && !/[一-鿿々]/.test(word);
  const front = mode === 'grammar' ? w.formula : kanaOnly ? w.meaning : word;
  $('front').textContent = front;
  card.dataset.len = front.length > 7 ? 'xl' : front.length > 3 ? 'l' : 'm';
  if (mode === 'grammar') {
    $('structure').textContent = w.structure;
    $('gMeaning').textContent = w.meaning;
    $('example').replaceChildren(
      ...w.example.map((line) => Object.assign(document.createElement('p'), { textContent: line })),
    );
  } else {
    $('spelling').textContent = w.kanji ? w.spelling : '';
    $('spelling').hidden = !w.kanji;
    $('meaning').textContent = w.meaning;
  }
  if (curStudy() === 'test') resetQuiz(w);
  $('ghost1').hidden = deck.queue.length < 2;
  $('ghost2').hidden = deck.queue.length < 3;
}

function confetti() {
  const box = $('confetti');
  box.textContent = '';
  const colors = ['#ff9db4', '#ffd36e', '#7fd8b0', '#9ec9ff', '#c8a8ff'];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('i');
    s.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 1.2}s;animation-duration:${2.2 + Math.random() * 1.8}s;--drift:${Math.random() * 80 - 40}px`;
    box.append(s);
  }
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 2200);
}

// ---------- quiz (chế độ kiểm tra) ----------
const answer = $('answer');

function resetQuiz(w) {
  revealed = false;
  answer.value = '';
  answer.readOnly = false;
  answer.classList.remove('is-wrong', 'is-right');
  $('quizMsg').textContent = '';
  $('submit').textContent = 'Kiểm tra ↵';
  $('skip').hidden = false;
  $('quizHint').textContent = '';
  answer.placeholder = 'gõ romaji → hiragana';
  answer.lang = 'ja';
  answer.focus({ preventScroll: true });
}

function submitAnswer() {
  if (busy || !deck || deck.done || curStudy() !== 'test') return;
  if (revealed) return swipe(false); // đã xem đáp án → thẻ quay lại vòng sau
  if (isSpellingCorrect(answer.value, words[deck.current].spelling)) {
    answer.classList.add('is-right');
    $('quizMsg').textContent = 'Đúng rồi! 🎉';
    return swipe(true);
  }
  answer.classList.remove('is-wrong');
  void answer.offsetWidth; // chạy lại animation lắc
  answer.classList.add('is-wrong');
  $('quizMsg').textContent = answer.value.trim() ? 'Chưa đúng, thử lại nhé 💦' : 'Hãy nhập đáp án trước nhé';
  answer.focus({ preventScroll: true }); // bấm nút Kiểm tra làm mất focus
}

function revealAnswer() {
  if (busy || !deck || deck.done || revealed) return;
  const w = words[deck.current];
  revealed = true;
  answer.readOnly = true;
  answer.classList.remove('is-wrong');
  $('quizMsg').textContent = `Đáp án: ${w.spelling}`;
  $('submit').textContent = 'Tiếp ↵';
  $('skip').hidden = true;
}

// Chỉ cho gõ hiragana: chặn IME của hệ điều hành (nguồn gốc của kanji) bằng cách tự đọc phím và đổi romaji → kana.
function typedChar(e) {
  if (e.key.length === 1) return /^[a-zA-Z'-]$/.test(e.key) ? e.key.toLowerCase() : '';
  if (e.key !== 'Process' && e.key !== 'Unidentified') return '';
  const m = /^Key([A-Z])$/.exec(e.code);
  return m ? m[1].toLowerCase() : e.code === 'Minus' ? '-' : '';
}

answer.addEventListener('keydown', (e) => {
  if (answer.readOnly || e.ctrlKey || e.metaKey || e.altKey) return;
  const ch = typedChar(e);
  if (!ch) return;
  e.preventDefault();
  answer.value = toKana(answer.value + ch);
});
answer.addEventListener('input', () => {
  const next = toKana(keepTypable(answer.value)); // dán / bàn phím ảo: bỏ kanji, đổi romaji còn sót
  if (next !== answer.value) answer.value = next;
});
$('quiz').addEventListener('submit', (e) => {
  e.preventDefault();
  submitAnswer();
});
$('skip').onclick = () => {
  revealAnswer();
  answer.focus({ preventScroll: true });
};

// ---------- card actions ----------
function resetCard() {
  card.getAnimations().forEach((a) => a.cancel());
  card.style.transition = inner.style.transition = 'none';
  card.classList.remove('is-leaving', 'is-dragging', 'is-flipped');
  for (const v of ['--dx', '--dy', '--rot', '--p']) card.style.removeProperty(v);
  void card.offsetWidth; // flush để transition:none có hiệu lực
  card.style.transition = inner.style.transition = '';
}

function flip() {
  if (curStudy() !== 'flash' || busy || !deck || deck.done) return;
  card.classList.toggle('is-flipped');
}

function popIn() {
  card.animate(
    [
      { transform: 'scale(0.88) translateY(14px)', opacity: 0.4 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' },
  );
}

async function swipe(known) {
  if (busy || !deck || deck.done) return;
  busy = true;
  const dir = known ? 1 : -1;
  card.classList.remove('is-dragging');
  card.classList.add('is-leaving');
  card.style.setProperty('--dx', `${dir * window.innerWidth}px`);
  card.style.setProperty('--rot', `${dir * 24}deg`);
  card.style.setProperty('--p', String(dir));
  await new Promise((r) => setTimeout(r, 280));

  const prevRound = deck.round;
  const id = deck.current;
  // Chỉ lần vuốt đầu tiên của thẻ trong buổi học mới tính vào hộp; các vòng retry thì không.
  const first = !deck.history.some((h) => h.id === id);
  const key = sessionKeys[id];
  const prev = progress[key] ?? null;
  const entry = deck.swipe(known);
  if (first) {
    entry.first = true;
    entry.prev = prev;
    progress[key] = nextEntry(prev, known, day);
  }
  save();
  resetCard();
  render();
  if (!deck.done) {
    popIn();
    if (deck.round !== prevRound) toast(`Vòng ${deck.round} · còn ${deck.queue.length} ${MODES[mode].unit} chưa thuộc 💪`);
  }
  busy = false;
}

function undo() {
  if (busy || !deck || !deck.canUndo) return;
  const entry = deck.undo();
  if (entry.first) {
    const key = sessionKeys[entry.id];
    if (entry.prev) progress[key] = entry.prev;
    else delete progress[key];
  }
  save();
  resetCard();
  render();
  const dir = entry.known ? 1 : -1;
  card.animate(
    [
      { transform: `translateX(${dir * window.innerWidth * 0.5}px) rotate(${dir * 18}deg)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 420, easing: 'cubic-bezier(.34,1.3,.64,1)' },
  );
}

function restart() {
  if (!deck) return;
  if (!window.confirm('Học lại từ đầu? Toàn bộ tiến độ (các hộp ôn tập) sẽ mất.')) return;
  progress = {};
  startSession(null);
  save();
  resetCard();
  render();
  popIn();
}

// ---------- wiring ----------
attachGestures(card, {
  onSwipe: swipe,
  onFlip: flip,
  canInteract: () => curStudy() === 'flash' && !busy && deck && !deck.done,
});
$('btnYes').onclick = () => swipe(true);
$('btnNo').onclick = () => swipe(false);
$('undo').onclick = undo;
$('reset').onclick = restart;
$('again').onclick = restart;
document.querySelectorAll('.seg__btn').forEach((b) => {
  b.onclick = () => {
    const { mode: nextMode = mode, study: nextStudy = study } = b.dataset;
    if ((nextMode === mode && nextStudy === study) || busy) return;
    mode = nextMode;
    study = nextStudy;
    try {
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(STUDY_KEY, study);
    } catch {}
    deck = null;
    resetCard();
    load();
  };
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // ô nhập đáp án tự xử lý phím
  if (curStudy() === 'test') return;
  if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return; // để nút tự xử lý
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if (e.key === 'ArrowRight') swipe(true);
  else if (e.key === 'ArrowLeft') swipe(false);
  else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    flip();
  }
});

load();
