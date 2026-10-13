import yaml from 'js-yaml';
import './style.css';
import { Deck } from './deck.js';
import { attachGestures } from './gestures.js';

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

function normalize(list) {
  if (!Array.isArray(list)) throw new Error('vocab.yml phải là danh sách (mỗi dòng bắt đầu bằng "- ")');
  return list
    .map((r) => ({
      kanji: String(r?.kanji ?? '').trim(),
      spelling: String(r?.spelling ?? '').trim(),
      meaning: String(r?.meaning ?? '').trim(),
    }))
    .filter((w) => w.kanji || w.spelling);
}

async function load() {
  app.dataset.state = 'loading';
  $('status').textContent = 'Đang tải từ vựng…';
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}vocab.yml`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    words = normalize(yaml.load(text));
    if (!words.length) throw new Error('vocab.yml đang trống');

    storageKey = `jpfc:v1:${hash(text)}`;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey));
    } catch {}
    deck = new Deck(words.length, saved);
    app.dataset.state = 'ready';
    render();
  } catch (err) {
    app.dataset.state = 'error';
    $('status').innerHTML = '';
    const msg = document.createElement('span');
    msg.textContent = `Không tải được từ vựng 😢 (${err.message}) `;
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
  $('btnYes').disabled = $('btnNo').disabled = deck.done;
  $('undo').disabled = !deck.canUndo;

  if (deck.done) {
    $('doneText').textContent = `Bạn đã thuộc ${total}/${total} từ sau ${deck.round} vòng.`;
    confetti();
    return;
  }

  const w = words[deck.current];
  const front = w.kanji || w.spelling;
  $('front').textContent = front;
  card.dataset.len = front.length > 7 ? 'xl' : front.length > 3 ? 'l' : 'm';
  $('spelling').textContent = w.kanji ? w.spelling : '';
  $('spelling').hidden = !w.kanji;
  $('meaning').textContent = w.meaning;
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
  if (busy || !deck || deck.done) return;
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
    if (deck.round !== prevRound) toast(`Vòng ${deck.round} · còn ${deck.queue.length} từ chưa thuộc 💪`);
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
  canInteract: () => !busy && deck && !deck.done,
});
$('btnYes').onclick = () => swipe(true);
$('btnNo').onclick = () => swipe(false);
$('undo').onclick = undo;
$('reset').onclick = restart;
$('again').onclick = restart;

window.addEventListener('keydown', (e) => {
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
