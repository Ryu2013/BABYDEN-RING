// 3人の主人公。操作の骨格(FSM)は共通で、数値とヒットボックスだけを差し替える。
// timings の各値は 60fps のフレーム数。startup=発生までの隙, active=判定, recovery=硬直。

const SWORD = {
  id: 'sword',
  name: 'つるぎベイビー',
  tagline: 'バランス型',
  detail: '素直な性能。まずはこの子で間合いを覚える。',
  spritePrefix: 'sword',
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
  guardMultiplier: 0.15,
  guardStaminaPerDamage: 1.6,
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
  tagline: '重量型',
  detail: '動きは鈍いが一撃が重く、打たれ強い。体幹も削りやすい。',
  spritePrefix: 'hammer',
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
  guardMultiplier: 0.06,
  guardStaminaPerDamage: 1.05,
  timings: {
    roll: {
      startup: 4, active: 9, recovery: 15,
      iframeStart: 4, iframeEnd: 13,
      cancelFrom: 23, stamina: 33, speed: 6.6,
    },
    lightAttack: {
      startup: 7, active: 5, recovery: 15,
      cancelFrom: 18, damage: 15, stamina: 27, poise: 2,
      hitbox: { w: 78, h: 54, offsetX: 32, offsetY: -6 },
    },
    heavyAttack: {
      startup: 25, active: 7, recovery: 31,
      cancelFrom: 42, damage: 54, stamina: 50, poise: 4,
      hitbox: { w: 124, h: 78, offsetX: 34, offsetY: 0 },
    },
  },
};

const BOW = {
  id: 'bow',
  name: 'ゆみベイビー',
  tagline: '遠距離型',
  detail: '打たれ弱く火力も低いが、スタミナが多く矢で削り続けられる。',
  spritePrefix: 'bow',
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
  guardMultiplier: 0.3,
  guardStaminaPerDamage: 2.3,
  timings: {
    roll: {
      startup: 2, active: 9, recovery: 6,
      iframeStart: 2, iframeEnd: 12,
      cancelFrom: 13, stamina: 20, speed: 8.4,
    },
    // 弓は近接判定を持たず、activeの頭で矢を撃ち出す
    lightAttack: {
      startup: 5, active: 3, recovery: 12,
      cancelFrom: 14, damage: 9, stamina: 15, poise: 1,
      projectile: { speed: 12.5, w: 34, h: 12, life: 110, offsetY: -46 },
    },
    heavyAttack: {
      startup: 18, active: 4, recovery: 22,
      cancelFrom: 30, damage: 24, stamina: 30, poise: 3,
      projectile: { speed: 15.5, w: 48, h: 16, life: 130, offsetY: -48, pierce: 1 },
    },
  },
};

export const CHARACTERS = [SWORD, HAMMER, BOW];

export function findCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
