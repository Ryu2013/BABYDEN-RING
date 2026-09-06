// 攻撃は steps の配列で表す。
//   windup=予備動作, active=判定, gap=次の一撃までの間, damage, hitbox,
//   unblockable, projectile, rain, move, invulnerable, windupSprite
// steps を複数持たせれば連撃に、途中の windup を長くすればディレイ攻撃になる。
// 連撃は一撃ごとに windupSprite を変え、何発来るかを構えで読ませる。

const DOLL_PATTERNS = {
  // --- 通常 ---

  swing: {
    followUp: 'combo2',
    followUpChance: 0.4,
    staminaCost: 14,
    weight: 2.2,
    recoveryFrames: 19,
    steps: [{ windup: 34, active: 9, damage: 20, hitbox: { w: 115, h: 74, offsetX: 42, offsetY: 0 } }],
  },

  // ディレイ振り下ろし。溜めが長く、早漏ロールを狩る
  delaySwing: {
    windupSprite: 'overhead',
    staminaCost: 18,
    weight: 1.5,
    recoveryFrames: 21,
    steps: [{ windup: 56, active: 8, damage: 27, hitbox: { w: 108, h: 96, offsetX: 40, offsetY: -8 } }],
  },

  // 2連撃。振りかぶり → 回転、と構えが変わる
  combo2: {
    staminaCost: 20,
    weight: 1.7,
    recoveryFrames: 20,
    steps: [
      { windup: 28, active: 8, gap: 8, damage: 14, hitbox: { w: 104, h: 70, offsetX: 40, offsetY: 0 } },
      { windupSprite: 'spin', windup: 14, active: 8, damage: 19, hitbox: { w: 128, h: 78, offsetX: 38, offsetY: 0 } },
    ],
  },

  // 3連撃。振りかぶり → 突き → 振り下ろし
  combo3: {
    staminaCost: 26,
    weight: 1.3,
    recoveryFrames: 26,
    steps: [
      { windup: 30, active: 7, gap: 7, damage: 12, hitbox: { w: 100, h: 68, offsetX: 38, offsetY: 0 } },
      { windupSprite: 'thrust', windup: 12, active: 7, gap: 6, damage: 13, hitbox: { w: 132, h: 50, offsetX: 40, offsetY: -6 } },
      { windupSprite: 'overhead', windup: 26, active: 10, damage: 24, hitbox: { w: 126, h: 96, offsetX: 42, offsetY: -6 } },
    ],
  },

  // 遠距離。ガラガラを投げてくる。ジャンプかロールで抜ける
  rattleThrow: {
    windupSprite: 'throw',
    followUp: 'lunge',
    followUpChance: 0.92,
    staminaCost: 16,
    weight: 1.5,
    recoveryFrames: 18,
    longRange: true,
    steps: [{
      windup: 36, active: 5, damage: 18,
      projectile: { speed: 9.2, w: 40, h: 40, life: 190, offsetY: -86, color: '#ffd76a' },
    }],
  },

  // 足払い。低い判定なのでジャンプで跨ぐ
  lowSweep: {
    windupSprite: 'low',
    staminaCost: 16,
    weight: 1.3,
    recoveryFrames: 18,
    steps: [{ windup: 30, active: 9, damage: 20, hitbox: { w: 210, h: 40, offsetX: 10, offsetY: 50 } }],
  },

  // ガード不可のおしり落とし。ロールでしか躱せない
  hipDrop: {
    windupSprite: 'stomp',
    staminaCost: 24,
    weight: 1.1,
    recoveryFrames: 27,
    steps: [{
      windup: 48, active: 10, damage: 34, unblockable: true,
      hitbox: { w: 196, h: 116, offsetX: 0, offsetY: 8, centered: true },
    }],
  },

  // よちよち突進。相手側にロールして抜けるのが正解
  lunge: {
    windupSprite: 'dash',
    followUp: 'combo2',
    followUpChance: 0.8,
    staminaCost: 20,
    weight: 1.4,
    recoveryFrames: 24,
    longRange: true,
    steps: [{ windup: 34, active: 14, damage: 23, lungeSpeed: 11, hitbox: { w: 88, h: 100, offsetX: 32, offsetY: 4 } }],
  },

  // 回避。転がって距離を取る。この間は当たらない
  dodgeRoll: {
    windupSprite: 'roll',
    staminaCost: 8,
    weight: 0.7,
    recoveryFrames: 12,
    steps: [{ windup: 8, active: 16, move: 'away', moveSpeed: 9.5, invulnerable: true }],
  },

  // 第二形態の泣き叫び。広範囲・ガード不可
  wail: {
    windupSprite: 'scream',
    staminaCost: 28,
    weight: 1.3,
    recoveryFrames: 29,
    steps: [{
      windup: 52, active: 16, damage: 30, unblockable: true,
      hitbox: { w: 350, h: 170, offsetX: 0, offsetY: -10, centered: true },
    }],
  },

  // 第二形態の高速4連。一撃ごとに構えが変わる
  rush4: {
    staminaCost: 32,
    weight: 1.4,
    recoveryFrames: 27,
    steps: [
      { windup: 20, active: 6, gap: 5, damage: 11, hitbox: { w: 100, h: 66, offsetX: 38, offsetY: 0 } },
      { windupSprite: 'spin', windup: 8, active: 6, gap: 5, damage: 11, hitbox: { w: 118, h: 74, offsetX: 38, offsetY: 0 } },
      { windupSprite: 'thrust', windup: 8, active: 6, gap: 5, damage: 13, hitbox: { w: 136, h: 50, offsetX: 40, offsetY: -6 } },
      { windupSprite: 'overhead', windup: 18, active: 9, damage: 22, hitbox: { w: 130, h: 96, offsetX: 42, offsetY: -6 } },
    ],
  },

  // --- 大技。頻度は低いが、対処法が限られる ---

  // 突き。速く長いのでロールでは抜けにくい。早めに動くかジャンプ
  pierce: {
    windupSprite: 'thrust',
    big: true,
    staminaCost: 30,
    weight: 0.55,
    recoveryFrames: 34,
    longRange: true,
    steps: [{
      windup: 32, active: 16, damage: 34, lungeSpeed: 21,
      hitbox: { w: 150, h: 46, offsetX: 26, offsetY: -8, coversSelf: false },
    }],
  },

  // 地面全体の足踏み。ジャンプでしか避けられない
  groundStomp: {
    windupSprite: 'stomp',
    big: true,
    staminaCost: 34,
    weight: 0.5,
    recoveryFrames: 40,
    steps: [{
      windup: 54, active: 14, damage: 32, unblockable: true,
      hitbox: { w: 2200, h: 56, offsetX: 0, offsetY: 46, centered: true },
    }],
  },

  // 空から矢が降る。落ちてくる位置を見て動く
  arrowRain: {
    windupSprite: 'rain',
    big: true,
    staminaCost: 32,
    weight: 0.45,
    recoveryFrames: 40,
    longRange: true,
    steps: [{
      windup: 56, active: 46,
      rain: { count: 9, spread: 780, interval: 6, vy: 7.5, gravity: 0.42,
              w: 20, h: 66, damage: 16, color: '#ffd76a' },
    }],
  },

  // 溜めてから叩きつける。溜めの構えを見たら距離を取るか殴りに行く
  chargeSmash: {
    big: true,
    staminaCost: 36,
    weight: 0.5,
    recoveryFrames: 42,
    steps: [
      { windupSprite: 'charge', windup: 72, active: 4 },
      { windupSprite: 'overhead', windup: 14, active: 12, damage: 40, unblockable: true,
        hitbox: { w: 270, h: 180, offsetX: 0, offsetY: 0, centered: true } },
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
        maxStamina: 100,
        staminaRegen: 0.30,
        exhaustThreshold: 16,
        exhaustFrames: 88,
        moveSpeed: 2.5,
        dashSpeed: 9.0,
        preferredRange: 112,
        engageRange: 340,
        patienceFrames: 70,
        cooldownFrames: 8,
        chainCooldown: 4,
        damageScale: 1,
        telegraphScale: 0.72,
        bigMoveScale: 1,
        pool: ['swing', 'delaySwing', 'combo2', 'rattleThrow', 'lowSweep', 'lunge',
               'dodgeRoll', 'pierce', 'groundStomp', 'arrowRain', 'chargeSmash'],
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
        maxStamina: 120,
        staminaRegen: 0.38,
        exhaustThreshold: 16,
        exhaustFrames: 78,
        moveSpeed: 3.4,
        dashSpeed: 11.0,
        preferredRange: 104,
        engageRange: 330,
        patienceFrames: 55,
        cooldownFrames: 5,
        chainCooldown: 3,
        damageScale: 1.3,
        telegraphScale: 0.55,
        bigMoveScale: 1.8,
        pool: ['swing', 'delaySwing', 'combo3', 'rush4', 'rattleThrow', 'lowSweep', 'lunge',
               'hipDrop', 'wail', 'dodgeRoll', 'pierce', 'groundStomp', 'arrowRain', 'chargeSmash'],
      },
    ],
  },
];
