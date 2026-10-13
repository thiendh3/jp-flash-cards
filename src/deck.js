// Logic thuần (không DOM) của bộ thẻ: queue / retry / known / history / vòng lặp / undo.

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Deck {
  constructor(size, saved = null, rand = Math.random) {
    this.size = size;
    this.rand = rand;
    if (!this._restore(saved)) this.reset();
  }

  reset() {
    this.queue = shuffle([...Array(this.size).keys()], this.rand);
    this.retry = [];
    this.known = new Set();
    this.history = [];
    this.round = 1;
  }

  get current() {
    return this.queue.length ? this.queue[0] : null;
  }

  get done() {
    return this.queue.length === 0 && this.retry.length === 0;
  }

  get canUndo() {
    return this.history.length > 0;
  }

  // Vuốt thẻ hiện tại. Trả về entry (để UI biết hướng) hoặc null nếu đã xong.
  swipe(isKnown) {
    if (this.done) return null;
    const id = this.queue.shift();
    const entry = { id, known: isKnown };
    if (isKnown) this.known.add(id);
    else this.retry.push(id);

    // Hết vòng mà còn từ chưa thuộc → xáo lại và sang vòng mới.
    if (this.queue.length === 0 && this.retry.length > 0) {
      entry.rollover = [...this.retry];
      this.queue = shuffle(this.retry, this.rand);
      this.retry = [];
      this.round += 1;
    }
    this.history.push(entry);
    return entry;
  }

  undo() {
    const entry = this.history.pop();
    if (!entry) return null;
    if (entry.rollover) {
      this.queue = [];
      this.retry = [...entry.rollover];
      this.round -= 1;
    }
    if (entry.known) this.known.delete(entry.id);
    else this.retry.pop(); // id vừa bị đẩy vào cuối retry
    this.queue.unshift(entry.id);
    return entry;
  }

  toJSON() {
    return {
      queue: this.queue,
      retry: this.retry,
      known: [...this.known],
      history: this.history,
      round: this.round,
    };
  }

  _restore(saved) {
    if (!saved || typeof saved !== 'object') return false;
    const { queue, retry, known, history, round } = saved;
    if (![queue, retry, known, history].every(Array.isArray)) return false;
    const all = [...queue, ...retry, ...known];
    const valid =
      all.length === this.size &&
      new Set(all).size === this.size &&
      all.every((n) => Number.isInteger(n) && n >= 0 && n < this.size);
    if (!valid || !Number.isInteger(round) || round < 1) return false;
    this.queue = [...queue];
    this.retry = [...retry];
    this.known = new Set(known);
    this.history = history.filter((h) => h && Number.isInteger(h.id));
    this.round = round;
    return true;
  }
}
