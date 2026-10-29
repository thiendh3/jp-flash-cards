import yaml from 'js-yaml';
import './style.css';
import { Deck } from './deck.js';
import { attachGestures } from './gestures.js';
import { normalizeVocab, normalizeGrammar } from './modes.js';
import { toKana, keepTypable } from './kana.js';
import { checkAnswer } from './quiz.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const card = $('card');
const inner = $('inner');

let words = [];
let deck = null;
let storageKey = '';
let busy = false;
let toastTimer = 0;

// ---------- load ----------
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const MODES = {
  vocab: { file: 'vocab.yml', label: 'từ vựng', unit: 'từ', normalize: normalizeVocab },
  grammar: { file: 'grammar.yml', label: 'ngữ pháp', unit: 'mẫu', normalize: normalizeGrammar },
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
let revealed = false; // chế độ kiểm tra: đã xem đáp án, Enter để sang thẻ kế
let loadSeq = 0; // bỏ qua kết quả fetch cũ khi người dùng đổi tab nhanh

async function load() {
  const cfg = MODES[mode];
  const seq = ++loadSeq;
  app.dataset.state = 'loading';
  app.dataset.mode = mode;
  app.dataset.study = study;
  document.querySelectorAll('.seg__btn').forEach((b) => {
    const on = b.dataset.mode ? b.dataset.mode === mode : b.dataset.study === study;
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
    words = list;

    storageKey = `jpfc:v1:${hash(text)}${study === 'test' ? ':test' : ''}`; // tiến độ thẻ và kiểm tra tách riêng
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey));
    } catch {}
    deck = new Deck(words.length, saved);
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

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(deck));
  } catch {}
}

// ---------- render ----------
function render() {
  const total = words.length;
  const known = deck.known.size;
  $('left').textContent = deck.queue.length + deck.retry.length;
  $('known').textContent = known;
  $('round').textContent = deck.round;
  const pct = Math.round((known / total) * 100);
  $('barFill').style.width = `${pct}%`;
  $('bar').setAttribute('aria-valuenow', pct);

  app.classList.toggle('is-done', deck.done);
  $('done').hidden = !deck.done;
  $('row').hidden = deck.done;
  $('quiz').hidden = deck.done || study !== 'test';
  $('btnYes').disabled = $('btnNo').disabled = deck.done;
  $('undo').disabled = !deck.canUndo;

  if (deck.done) {
    $('doneText').textContent = `Bạn đã thuộc ${total}/${total} ${MODES[mode].unit} sau ${deck.round} vòng.`;
    confetti();
    return;
  }

  const w = words[deck.current];
  const word = w.kanji || w.spelling;
  // Kiểm tra: từ không có kanji (katakana, ぼろぼろ…) mà hiện nguyên chữ thì chỉ là chép lại → hiện nghĩa thay.
  const kanaOnly = study === 'test' && mode === 'vocab' && !/[一-鿿々]/.test(word);
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
  if (study === 'test') resetQuiz(w);
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
  if (mode === 'grammar') {
    $('quizHint').textContent = 'Nhập ý nghĩa (gõ một phần là được)';
    answer.placeholder = 'nghĩa…';
    answer.lang = 'vi';
  } else {
    $('quizHint').textContent = '';
    answer.placeholder = 'gõ romaji → hiragana';
    answer.lang = 'ja';
  }
  answer.focus({ preventScroll: true });
}

function submitAnswer() {
  if (busy || !deck || deck.done || study !== 'test') return;
  if (revealed) return swipe(false); // đã xem đáp án → thẻ quay lại vòng sau
  if (checkAnswer(mode, answer.value, words[deck.current])) {
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
  $('quizMsg').textContent = `Đáp án: ${mode === 'grammar' ? w.meaning : w.spelling}`;
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
  if (mode !== 'vocab' || answer.readOnly || e.ctrlKey || e.metaKey || e.altKey) return;
  const ch = typedChar(e);
  if (!ch) return;
  e.preventDefault();
  answer.value = toKana(answer.value + ch);
});
answer.addEventListener('input', () => {
  if (mode !== 'vocab') return;
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
  if (study !== 'flash' || busy || !deck || deck.done) return;
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
  deck.swipe(known);
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
  if (!deck.done && deck.known.size > 0 && !window.confirm('Học lại từ đầu? Tiến độ hiện tại sẽ mất.')) return;
  deck.reset();
  save();
  resetCard();
  render();
  popIn();
}

// ---------- wiring ----------
attachGestures(card, {
  onSwipe: swipe,
  onFlip: flip,
  canInteract: () => study === 'flash' && !busy && deck && !deck.done,
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
  if (study === 'test') return;
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
