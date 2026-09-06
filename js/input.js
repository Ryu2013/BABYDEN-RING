// ロールはSpaceを主キーにしている。Shiftは環境(IMEやアクセシビリティ機能)に
// 横取りされることがあり、実機で反応しない事例があったため補助扱い。
const KEY_MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',

  ArrowUp: 'jump',
  KeyW: 'jump',

  Space: 'roll',
  KeyZ: 'roll',
  KeyS: 'roll',
  ShiftLeft: 'roll',
  ShiftRight: 'roll',

  KeyJ: 'lightAttack',
  KeyX: 'lightAttack',

  KeyK: 'heavyAttack',
  KeyC: 'heavyAttack',

  KeyL: 'guard',
  KeyV: 'guard',
};

// 硬直中に押した入力をこのフレーム数だけ覚えておき、動ける瞬間に発動させる。
// 強攻撃の硬直(44F)の途中で押しても拾えるよう、長めに取る
const BUFFER_FRAMES = 30;

export function createInputManager() {
  const down = new Set();
  const buffered = new Map();

  function press(action) {
    if (!down.has(action)) buffered.set(action, BUFFER_FRAMES);
    down.add(action);
  }

  function release(action) {
    down.delete(action);
  }

  window.addEventListener('keydown', (e) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    press(action);
  });

  window.addEventListener('keyup', (e) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    release(action);
  });

  window.addEventListener('blur', () => {
    down.clear();
    buffered.clear();
  });

  function bindTouchButton(el, action) {
    if (!el) return;
    const onDown = (e) => { e.preventDefault(); press(action); };
    const onUp = (e) => { e.preventDefault(); release(action); };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
  }

  return {
    isDown: (action) => down.has(action),

    consumeBuffered(action) {
      if (!buffered.has(action)) return false;
      buffered.delete(action);
      return true;
    },

    tick() {
      for (const [action, frames] of buffered) {
        if (frames <= 1) buffered.delete(action);
        else buffered.set(action, frames - 1);
      }
    },

    bindTouchButton,
  };
}
