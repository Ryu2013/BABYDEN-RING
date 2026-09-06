// 3人の主人公。操作の骨格(FSM)は共通で、数値とヒットボックスだけを差し替える。
// timings の各値は 60fps のフレーム数。startup=発生までの隙, active=判定, recovery=硬直。

const SWORD = {
  id: 'sword',
  name: 'つるぎベイビー',
  tagline: '素直な生まれ',
  detail: '剣を提げた、ごく当たり前の赤子。\n扱いに癖がなく、間合いを覚えるにはこの生まれがよい。',
  spritePrefix: 'sword',
  portrait: 'assets/player_idle.png',
  accent: '#7fd0ff',
  maxHp: 100,
  defense: 1.0,
  maxStamina: 100,
  staminaRegen: 0.42,
  staminaDelay: 46,
  maxPoise: 10,
  poiseRegen: 0.035,
  poiseDelay: 60,
  moveSpeed: 4.2,
  jumpVelocity: -10.5,
  flasks: 3,
  // 選択画面に出す性能バー(0-100)
  stats: { '攻撃力': 52, '防御力': 55, '素早さ': 62, 'スタミナ': 55, '体幹': 55, '間合い': 40 },
  timings: {
    roll: {
      startup: 2, active: 9, recovery: 8,
      iframeStart: 2, iframeEnd: 12,
      cancelFrom: 15, stamina: 25, speed: 8,
    },
    // 弱: 出が早く隙が小さいが威力は低い
    lightAttack: {
      startup: 3, active: 4, recovery: 9,
      cancelFrom: 11, damage: 8, stamina: 22, poise: 1,
      hitbox: { w: 62, h: 44, offsetX: 30, offsetY: -8 },
    },
    // 強: 出が遅く隙も大きいが、威力とリーチが段違い。溜められる
    heavyAttack: {
      startup: 16, active: 6, recovery: 22,
      cancelFrom: 30, damage: 34, stamina: 42, poise: 3,
      hitbox: { w: 96, h: 60, offsetX: 32, offsetY: -4 },
    },
  },
};

const HAMMER = {
  id: 'hammer',
  name: 'ハンマーベイビー',
  tagline: '重き生まれ',
  detail: '大槌を引きずる、重たい赤子。\n動きは鈍いが、当たれば一撃で相手の体勢を奪う。',
  spritePrefix: 'hammer',
  portrait: 'assets/hammer_idle.png',
  accent: '#ffb45a',
  maxHp: 132,
  defense: 0.7,          // 被ダメージ倍率。低いほど硬い
  maxStamina: 92,
  staminaRegen: 0.34,
  staminaDelay: 54,
  maxPoise: 14,
  poiseRegen: 0.032,
  poiseDelay: 64,
  moveSpeed: 3.5,
  jumpVelocity: -9.6,
  flasks: 3,
  stats: { '攻撃力': 88, '防御力': 90, '素早さ': 28, 'スタミナ': 44, '体幹': 82, '間合い': 52 },
  timings: {
    roll: {
      startup: 3, active: 11, recovery: 13,
      iframeStart: 3, iframeEnd: 15,
      cancelFrom: 22, stamina: 33, speed: 7.4,
    },
    lightAttack: {
      startup: 7, active: 5, recovery: 15,
      cancelFrom: 18, damage: 14, stamina: 27, poise: 2,
      hitbox: { w: 78, h: 54, offsetX: 32, offsetY: -6 },
    },
    heavyAttack: {
      startup: 25, active: 7, recovery: 31,
      cancelFrom: 42, damage: 40, stamina: 50, poise: 4,
      hitbox: { w: 124, h: 78, offsetX: 34, offsetY: 0 },
    },
  },
};

const BOW = {
  id: 'bow',
  name: 'ゆみベイビー',
  tagline: '遠き生まれ',
  detail: '弓を負う、痩せた赤子。\nひと当てが軽く打たれ弱いが、息が長く距離を選べる。',
  spritePrefix: 'bow',
  portrait: 'assets/bow_idle.png',
  accent: '#9dffb0',
  maxHp: 78,
  defense: 1.3,
  maxStamina: 145,
  staminaRegen: 0.62,
  staminaDelay: 34,
  maxPoise: 8,
  poiseRegen: 0.042,
  poiseDelay: 52,
  moveSpeed: 4.6,
  jumpVelocity: -11,
  flasks: 3,
  stats: { '攻撃力': 22, '防御力': 24, '素早さ': 78, 'スタミナ': 92, '体幹': 38, '間合い': 88 },
  timings: {
    roll: {
      startup: 2, active: 9, recovery: 6,
      iframeStart: 2, iframeEnd: 12,
      cancelFrom: 13, stamina: 20, speed: 8.4,
    },
    // 弓は近接判定を持たず、activeの頭で矢を撃ち出す
    lightAttack: {
      startup: 5, active: 3, recovery: 12,
      cancelFrom: 16, damage: 6, stamina: 21, poise: 1,
      projectile: { speed: 12.5, w: 34, h: 12, life: 34, offsetY: -46 },
    },
    heavyAttack: {
      startup: 18, active: 4, recovery: 22,
      cancelFrom: 32, damage: 18, stamina: 42, poise: 3,
      projectile: { speed: 15.5, w: 48, h: 16, life: 30, offsetY: -48, pierce: 1 },
    },
  },
};

export const CHARACTERS = [SWORD, HAMMER, BOW];

export function findCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
