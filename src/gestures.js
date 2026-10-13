// Pointer Events cho cả chuột lẫn cảm ứng: kéo/vuốt, tap giữa = lật, tap rìa (chỉ cảm ứng) = chọn.

const TAP_MOVE = 10; // px: di chuyển quá ngưỡng này thì không bao giờ là tap
const TAP_TIME = 500; // ms
const EDGE = 0.25; // 25% mỗi bên là vùng rìa trên cảm ứng
const FLING_V = 0.5; // px/ms

const threshold = (w) => Math.max(70, w * 0.3);

export function attachGestures(card, { onSwipe, onFlip, canInteract }) {
  let st = null;

  const setVars = (dx, dy) => {
    const w = card.offsetWidth || 300;
    card.style.setProperty('--dx', `${dx}px`);
    card.style.setProperty('--dy', `${dy * 0.25}px`);
    card.style.setProperty('--rot', `${(dx / w) * 14}deg`);
    card.style.setProperty('--p', String(Math.max(-1, Math.min(1, dx / threshold(w)))));
  };

  const snapBack = () => {
    card.classList.remove('is-dragging');
    for (const v of ['--dx', '--dy', '--rot', '--p']) card.style.removeProperty(v);
  };

  card.addEventListener('pointerdown', (e) => {
    if (st || !canInteract()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    st = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
      dx: 0,
      moved: false,
    };
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.moved && Math.hypot(dx, dy) > TAP_MOVE) {
      st.moved = true;
      card.classList.add('is-dragging');
    }
    const now = performance.now();
    if (now > st.lastT) {
      // làm mượt vận tốc để một nhịp giật không gây fling nhầm
      st.v = 0.6 * st.v + 0.4 * ((e.clientX - st.lastX) / (now - st.lastT));
      st.lastX = e.clientX;
      st.lastT = now;
    }
    st.dx = dx;
    if (st.moved) setVars(dx, dy);
  });

  const finish = (e, cancelled) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    if (card.hasPointerCapture(e.pointerId)) card.releasePointerCapture(e.pointerId);

    if (cancelled) return snapBack();

    if (s.moved) {
      const w = card.offsetWidth || 300;
      const fling = Math.abs(s.v) > FLING_V && Math.abs(s.dx) > 30 && Math.sign(s.v) === Math.sign(s.dx);
      if (Math.abs(s.dx) > threshold(w) || fling) {
        card.classList.remove('is-dragging');
        onSwipe(s.dx > 0);
      } else {
        snapBack();
      }
      return;
    }

    // Tap
    if (performance.now() - s.t > TAP_TIME) return;
    if (e.pointerType === 'mouse') return onFlip();
    const rect = card.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    if (rel < EDGE) onSwipe(false);
    else if (rel > 1 - EDGE) onSwipe(true);
    else onFlip();
  };

  card.addEventListener('pointerup', (e) => finish(e, false));
  card.addEventListener('pointercancel', (e) => finish(e, true));
  card.addEventListener('contextmenu', (e) => e.preventDefault());
}
