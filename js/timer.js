export class Timer {
  constructor() {
    this._startedAt = 0;
    this._elapsedMs = 0;
    this._running = false;
  }

  start() {
    this._startedAt = performance.now();
    this._elapsedMs = 0;
    this._running = true;
  }

  stop() {
    if (this._running) {
      this._elapsedMs = performance.now() - this._startedAt;
      this._running = false;
    }
  }

  getElapsedMs() {
    return this._running ? performance.now() - this._startedAt : this._elapsedMs;
  }

  isRunning() {
    return this._running;
  }
}

export function formatMs(ms) {
  const totalCentis = Math.floor(ms / 10);
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}
