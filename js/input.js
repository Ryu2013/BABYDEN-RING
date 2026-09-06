// 操作は「移動・ジャンプ・攻撃・回復」の4系統だけに絞ってある。
//   ロール  … 左右をダブルタップ（Space等の専用キーも残す）
//   弱/強   … 攻撃ボタンを離すのが早ければ弱、押し続ければ強の溜め
//   パリィ  … 攻撃ボタンを相手の攻撃に合わせて押す（ガードボタンは無い）
const KEY_MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',

  ArrowUp: 'jump',
  KeyW: 'jump',

  Space: 'roll',
  KeyZ: 'roll',
  ShiftLeft: 'roll',
  ShiftRight: 'roll',

  KeyJ: 'attack',
  KeyK: 'attack',
  KeyX: 'attack',

  KeyF: 'heal',
  KeyR: 'heal',
};

// 硬直中に押した入力をこのフレーム数だけ覚えておき、動ける瞬間に発動させる。
// 強攻撃の硬直の途中で押しても拾えるよう、長めに取る
const BUFFER_FRAMES = 30;
// 左右のダブルタップをロールとみなす間隔
const DOUBLE_TAP_MS = 260;

export function createInputManager() {
  const down = new Set();
  const buffered = new Map();
  const lastTap = { left: 0, right: 0 };

  function press(action) {
    if (down.has(action)) return;
    down.add(action);
    buffered.set(action, BUFFER_FRAMES);

    // 同じ方向を続けて押したらロール。向きも合わせる
    if (action === 'left' || action === 'right') {
      const now = performance.now();
      if (now - lastTap[action] < DOUBLE_TAP_MS) {
        buffered.set('roll', BUFFER_FRAMES);
        lastTap[action] = 0;
      } else {
        lastTap[action] = now;
      }
    }
  }

  function release(action) {
    down.delete(action);
  }

  window.addEventListener('keydown', (e) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    press(action);
  });

  window.addEventListener('keyup', (e) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    release(action);
  });

  window.addEventListener('blur', () => {
    down.clear();
    buffered.clear();
  });

  function bindTouchButton(el, action) {
    if (!el) return;
    const onDown = (e) => { e.preventDefault(); el.classList.add('pressed'); press(action); };
    const onUp = (e) => { e.preventDefault(); el.classList.remove('pressed'); release(action); };
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
