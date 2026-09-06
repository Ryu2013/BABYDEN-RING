// 攻撃は steps の配列で表す。
//   windup=予備動作, active=判定, gap=次の一撃までの間, damage, hitbox, unblockable, projectile, move
// steps を複数持たせれば連撃に、途中の windup を長くすればディレイ攻撃になる。

const DOLL_PATTERNS = {
  // 基本の横なぎ。ガードでもパリィでもロールでも対処できる
  swing: {
    weight: 2.2,
    recoveryFrames: 32,
    steps: [{ windup: 34, active: 9, damage: 20, hitbox: { w: 115, h: 74, offsetX: 42, offsetY: 0 } }],
  },

  // ディレイ振り下ろし。溜めが長く、早漏ロールを狩る
  delaySwing: {
    windupSprite: 'overhead',
    weight: 1.5,
    recoveryFrames: 36,
    hold: true,
    steps: [{ windup: 56, active: 8, damage: 27, hitbox: { w: 108, h: 96, offsetX: 40, offsetY: -8 } }],
  },

  // 2連撃。1発目をロールで抜けても2発目が追ってくる
  combo2: {
    weight: 1.7,
    recoveryFrames: 34,
    steps: [
      { windup: 28, active: 8, gap: 12, damage: 14, hitbox: { w: 104, h: 70, offsetX: 40, offsetY: 0 } },
      { windup: 12, active: 8, damage: 19, hitbox: { w: 118, h: 74, offsetX: 40, offsetY: 0 } },
    ],
  },

  // 3連撃。最後だけディレイが入る
  combo3: {
    weight: 1.3,
    recoveryFrames: 44,
    steps: [
      { windup: 30, active: 7, gap: 10, damage: 12, hitbox: { w: 100, h: 68, offsetX: 38, offsetY: 0 } },
      { windup: 10, active: 7, gap: 8, damage: 12, hitbox: { w: 106, h: 68, offsetX: 40, offsetY: 0 } },
      { windup: 26, active: 10, damage: 24, hitbox: { w: 126, h: 88, offsetX: 42, offsetY: -6 } },
    ],
  },

  // 遠距離。ガラガラを投げてくる。ジャンプかロールで抜ける
  rattleThrow: {
    windupSprite: 'throw',
    followUp: 'lunge',
    weight: 1.5,
    recoveryFrames: 30,
    longRange: true,
    steps: [{
      windup: 36, active: 5, damage: 18,
      projectile: { speed: 6.8, w: 38, h: 38, life: 170, offsetY: -86, color: '#ffd76a' },
    }],
  },

  // 足払い。低い判定なのでジャンプで跨ぐ
  lowSweep: {
    windupSprite: 'low',
    weight: 1.3,
    recoveryFrames: 30,
    steps: [{ windup: 30, active: 9, damage: 20, hitbox: { w: 210, h: 40, offsetX: 10, offsetY: 50 } }],
  },

  // ガード不可のおしり落とし。ロールでしか躱せない
  hipDrop: {
    windupSprite: 'overhead',
    weight: 1.1,
    recoveryFrames: 46,
    unblockableTelegraph: true,
    steps: [{
      windup: 48, active: 10, damage: 34, unblockable: true,
      hitbox: { w: 196, h: 116, offsetX: 0, offsetY: 8, centered: true },
    }],
  },

  // よちよち突進。相手側にロールして抜けるのが正解
  lunge: {
    windupSprite: 'dash',
    weight: 1.4,
    recoveryFrames: 40,
    longRange: true,
    steps: [{ windup: 34, active: 14, damage: 23, lungeSpeed: 8, hitbox: { w: 88, h: 100, offsetX: 32, offsetY: 4 } }],
  },

  // 回避行動。攻撃せず後ろに跳ぶ
  backstep: {
    windupSprite: 'dash',
    weight: 0.7,
    recoveryFrames: 12,
    steps: [{ windup: 8, active: 12, move: 'away', moveSpeed: 7.5 }],
  },

  // 第二形態の泣き叫び。広範囲・ガード不可
  wail: {
    windupSprite: 'scream',
    weight: 1.3,
    recoveryFrames: 48,
    unblockableTelegraph: true,
    steps: [{
      windup: 52, active: 16, damage: 30, unblockable: true,
      hitbox: { w: 350, h: 170, offsetX: 0, offsetY: -10, centered: true },
    }],
  },

  // 第二形態の高速4連。予備動作が極端に短い
  rush4: {
    weight: 1.4,
    recoveryFrames: 46,
    steps: [
      { windup: 20, active: 6, gap: 6, damage: 11, hitbox: { w: 100, h: 66, offsetX: 38, offsetY: 0 } },
      { windup: 7, active: 6, gap: 6, damage: 11, hitbox: { w: 100, h: 66, offsetX: 38, offsetY: 0 } },
      { windup: 7, active: 6, gap: 6, damage: 13, hitbox: { w: 108, h: 70, offsetX: 40, offsetY: 0 } },
      { windup: 18, active: 9, damage: 22, hitbox: { w: 130, h: 92, offsetX: 42, offsetY: -6 } },
    ],
  },
};

export const STAGES = [
  {
    id: 'stage-01-yochiyochi',
    name: 'よちよちドール',
    sprite: 'boss1',
    color: '#c0392b',
    spriteScale: 1.4,
    attackPatterns: DOLL_PATTERNS,
    forms: [
      {
        name: 'よちよちドール',
        maxHp: 200,
        maxPoise: 14,
        moveSpeed: 1.9,
        dashSpeed: 4.6,
        preferredRange: 112,
        cooldownFrames: 32,
        damageScale: 1,
        telegraphScale: 1,
        pool: ['swing', 'delaySwing', 'combo2', 'rattleThrow', 'lowSweep', 'lunge', 'backstep'],
      },
      {
        // 第二形態は絵も大きさも別物にする
        name: 'ひび割れドール',
        sprite: 'boss1b',
        spriteScale: 1.85,
        width: 112,
        height: 168,
        maxHp: 280,
        maxPoise: 18,
        moveSpeed: 2.7,
        dashSpeed: 6.2,
        preferredRange: 104,
        cooldownFrames: 20,
        damageScale: 1.3,
        telegraphScale: 0.7,
        pool: ['swing', 'delaySwing', 'combo3', 'rush4', 'rattleThrow', 'lowSweep', 'lunge', 'hipDrop', 'wail', 'backstep'],
      },
    ],
  },
  {
    id: 'stage-02-yakedo-bear',
    name: 'やけどのクマさん',
    sprite: 'boss2',
    color: '#8e44ad',
    spriteScale: 1.5,
    attackPatterns: {
      swing: {
        weight: 2,
        recoveryFrames: 26,
        steps: [{ windup: 36, active: 10, damage: 28, hitbox: { w: 120, h: 80, offsetX: 42, offsetY: 0 } }],
      },
      lunge: {
        windupSprite: 'dash',
        weight: 1,
        recoveryFrames: 42,
        longRange: true,
        steps: [{ windup: 40, active: 14, damage: 36, lungeSpeed: 9, hitbox: { w: 90, h: 96, offsetX: 34, offsetY: 6 } }],
      },
      backstep: {
        weight: 0.6,
        recoveryFrames: 12,
        steps: [{ windup: 8, active: 12, move: 'away', moveSpeed: 8 }],
      },
    },
    forms: [
      {
        name: 'やけどのクマさん',
        maxHp: 210,
        maxPoise: 16,
        moveSpeed: 2.4,
        dashSpeed: 5.2,
        preferredRange: 108,
        cooldownFrames: 34,
        damageScale: 1,
        telegraphScale: 1,
        pool: ['swing', 'lunge', 'backstep'],
      },
    ],
  },
];
