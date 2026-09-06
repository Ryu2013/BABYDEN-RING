export const Phase = {
  COOLDOWN: 'cooldown',
  WINDUP: 'windup',
  ACTIVE: 'active',
  GAP: 'gap',
  RECOVERY: 'recovery',
  STAGGER: 'stagger',
  EXHAUSTED: 'exhausted',
  EVOLVE: 'evolve',
  DEAD: 'dead',
};

const RECOVERY_VULNERABLE_MULTIPLIER = 1.5;
const STAGGER_VULNERABLE_MULTIPLIER = 2.4;
const STAGGER_FRAMES = 150;
const EXHAUST_VULNERABLE_MULTIPLIER = 2.0;
const EVOLVE_FRAMES = 130;
const POISE_REGEN = 0.03;
const POISE_DELAY = 100;

// 旧形式（単発攻撃）の定義も steps に揃えてエンジン側を1本化する
function normalizePattern(p) {
  if (p.steps) return p;
  return {
    ...p,
    steps: [{
      windup: p.telegraphFrames,
      active: p.activeFrames,
      damage: p.damage,
      hitbox: p.hitbox,
      lungeSpeed: p.lungeSpeed,
    }],
  };
}

export class Boss {
  constructor(def, x, groundY) {
    this.def = def;
    this.patterns = {};
    for (const [name, p] of Object.entries(def.attackPatterns)) {
      this.patterns[name] = normalizePattern({ name, ...p });
    }
    this.x = x;
    this.y = groundY;
    this.groundY = groundY;
    this.w = 90;
    this.h = 140;
    this.facing = -1;

    this.formIndex = 0;
    this.phase = Phase.COOLDOWN;
    this.frame = 0;
    this.currentPattern = null;
    this.stepIndex = 0;
    this.vulnerableMultiplier = 1;
    this.hasHitThisAction = false;
    this.hitFlash = 0;
    this.poiseIdleFrames = 0;
    this.events = [];
    this._forcedNext = null;
    this._applyForm(0, true);
  }

  _applyForm(index, initial = false) {
    const form = this.def.forms[index];
    this.formIndex = index;
    this.form = form;
    this.name = form.name;
    this.maxHp = form.maxHp;
    this.hp = form.maxHp;
    this.maxPoise = form.maxPoise;
    this.poise = form.maxPoise;
    // スタミナは内部の数値としてだけ持つ（ゲージは見せない）。
    // 尽きると息切れして大きな隙ができる
    this.maxStamina = form.maxStamina ?? 100;
    this.stamina = this.maxStamina;
    // 形態ごとに絵と大きさを差し替える
    this.spriteBase = form.sprite || this.def.sprite;
    this.spriteScale = form.spriteScale || this.def.spriteScale || 1.35;
    this.w = form.width || 90;
    this.h = form.height || 140;
    if (!initial) {
      this.phase = Phase.COOLDOWN;
      this.frame = 0;
      this.currentPattern = null;
    }
  }

  get isDead() { return this.phase === Phase.DEAD; }
  get isStaggered() { return this.phase === Phase.STAGGER; }
  get isExhausted() { return this.phase === Phase.EXHAUSTED; }
  get isEvolving() { return this.phase === Phase.EVOLVE; }
  get isFinalForm() { return this.formIndex >= this.def.forms.length - 1; }

  isTelegraphing() { return this.phase === Phase.WINDUP; }
  isRecovering() { return this.phase === Phase.RECOVERY || this.phase === Phase.GAP; }

  currentStep() {
    if (!this.currentPattern) return null;
    return this.currentPattern.steps[this.stepIndex] || null;
  }

  // いまの予備動作に対応する絵のキー。攻撃ごとに構えが変わるので読める
  windupSpriteKey() {
    const step = this.currentStep();
    const kind = (step && step.windupSprite) || (this.currentPattern && this.currentPattern.windupSprite);
    return kind ? `${this.spriteBase}_windup_${kind}` : `${this.spriteBase}_windup`;
  }

  // 予備動作以外でも専用の絵を出したい状態（息切れ・回避）
  specialSpriteKey() {
    if (this.isExhausted) return `${this.spriteBase}_exhausted`;
    const step = this.currentStep();
    if (step && step.windupSprite && this.phase === Phase.ACTIVE) {
      return `${this.spriteBase}_windup_${step.windupSprite}`;
    }
    return null;
  }

  // 攻撃ごとの溜め時間。第二形態では短くなる
  _windupOf(step) {
    return Math.max(6, Math.round(step.windup * (this.form.telegraphScale || 1)));
  }

  _damageOf(step) {
    return step.damage * (this.form.damageScale || 1);
  }

  _emit(type, extra = {}) {
    this.events.push({ type, x: this.x, y: this.y - this.h / 2, ...extra });
  }

  takeDamage(amount) {
    if (this.isDead || this.isEvolving) return;
    // 回避行動の最中は当たらない
    const step = this.currentStep();
    if (step && step.invulnerable && this.phase === Phase.ACTIVE) return;
    this.hp = Math.max(0, this.hp - amount * this.vulnerableMultiplier);
    this.hitFlash = 6;
    if (this.hp <= 0) {
      if (!this.isFinalForm) {
        // HPが尽きても進化して立ち上がる
        this.phase = Phase.EVOLVE;
        this.frame = 0;
        this.currentPattern = null;
        this.vulnerableMultiplier = 1;
        this._emit('evolveStart');
      } else {
        this.phase = Phase.DEAD;
      }
    }
  }

  damagePoise(amount) {
    if (this.isDead || this.isEvolving || this.isStaggered) return;
    this.poise = Math.max(0, this.poise - amount);
    this.poiseIdleFrames = 0;
    if (this.poise <= 0) {
      this.phase = Phase.STAGGER;
      this.frame = 0;
      this.currentPattern = null;
      this.vulnerableMultiplier = STAGGER_VULNERABLE_MULTIPLIER;
      this._emit('bossStagger');
    }
  }

  update(player) {
    this.events.length = 0;
    if (this.isDead) return;
    if (this.hitFlash > 0) this.hitFlash--;
    this.frame++;

    this.poiseIdleFrames++;
    if (!this.isStaggered && this.poiseIdleFrames > POISE_DELAY) {
      this.poise = Math.min(this.maxPoise, this.poise + POISE_REGEN);
    }

    if (this.phase === Phase.EVOLVE) {
      this.vulnerableMultiplier = 0;
      if (this.frame >= EVOLVE_FRAMES) {
        this._applyForm(this.formIndex + 1);
        this.vulnerableMultiplier = 1;
        this._emit('evolveDone');
      }
      return;
    }

    if (this.phase === Phase.EXHAUSTED) {
      this.vulnerableMultiplier = EXHAUST_VULNERABLE_MULTIPLIER;
      if (this.frame >= (this.form.exhaustFrames ?? 110)) {
        this.stamina = this.maxStamina;
        this.phase = Phase.COOLDOWN;
        this.frame = 0;
        this.vulnerableMultiplier = 1;
      }
      return;
    }

    if (this.phase === Phase.STAGGER) {
      if (this.frame >= STAGGER_FRAMES) {
        this.poise = this.maxPoise;
        this.phase = Phase.COOLDOWN;
        this.frame = 0;
        this.vulnerableMultiplier = 1;
      }
      return;
    }

    // 狙いを定められるのは待機中だけ。予備動作に入ったら振り向けない
    if (this.phase === Phase.COOLDOWN) {
      this.facing = player.x < this.x ? -1 : 1;
    }

    switch (this.phase) {
      case Phase.COOLDOWN: {
        this.vulnerableMultiplier = 1;
        this.stamina = Math.min(this.maxStamina, this.stamina + (this.form.staminaRegen ?? 0.22));
        const distance = Math.abs(player.x - this.x);
        const poiseRatio = this.poise / this.maxPoise;
        if (this.form.moveSpeed) {
          if (poiseRatio < 0.4 && distance < this.form.preferredRange * 0.9) {
            // 体幹が危ないので距離を取る
            this._moveToward(player, -this.form.moveSpeed * 0.8);
          } else if (distance > this.form.preferredRange) {
            // 離されているほど速く詰める。大きく開かれたら全力で走る
            const dash = this.form.dashSpeed || this.form.moveSpeed * 2.1;
            const hustle = distance > 620 ? dash * 1.4
              : distance > 340 ? dash
              : this.form.moveSpeed;
            this._moveToward(player, hustle);
          }
        }
        const wait = this._forcedNext
          ? (this.form.chainCooldown ?? 6)
          : this.form.cooldownFrames;
        // 間合いの外では立ち止まって撃たず、走って詰める。
        // ただし詰めきれないまま待たされ続けたら、痺れを切らして飛び道具を投げる
        const engaged = distance <= (this.form.engageRange ?? 340);
        const impatient = this.frame >= wait + (this.form.patienceFrames ?? 70);
        if (this.frame >= wait && (engaged || impatient)) {
          if (this.stamina < (this.form.exhaustThreshold ?? 16)) {
            // 振りすぎて息が上がった。大きな隙になる
            this.phase = Phase.EXHAUSTED;
            this.frame = 0;
            this.currentPattern = null;
            this._emit('bossExhausted');
            break;
          }
          this._pickPattern(player);
          this.stamina -= this.currentPattern.staminaCost ?? 16;
          this.stepIndex = 0;
          this.phase = Phase.WINDUP;
          this.frame = 0;
          this._emit('windupStart', { pattern: this.currentPattern.name });
        }
        break;
      }

      case Phase.WINDUP: {
        const step = this.currentStep();
        if (this.frame >= this._windupOf(step)) {
          this.phase = Phase.ACTIVE;
          this.frame = 0;
          this.hasHitThisAction = false;
          if (step.projectile) {
            this._emit('bossShoot', { step });
          }
          if (step.rain) {
            this._emit('bossRain', { step });
          }
          if (step.hitbox) this._emit('bossSwing', { step });
        }
        break;
      }

      case Phase.ACTIVE: {
        const step = this.currentStep();
        if (step.lungeSpeed) this._moveToward(player, step.lungeSpeed, true);
        if (step.move) {
          const dir = step.move === 'away' ? (player.x < this.x ? 1 : -1) : (player.x < this.x ? -1 : 1);
          this.x += dir * (step.moveSpeed || 6);
        }
        if (this.frame >= step.active) {
          this.frame = 0;
          if (this.stepIndex < this.currentPattern.steps.length - 1) {
            this.phase = Phase.GAP;
          } else {
            this.phase = Phase.RECOVERY;
            this.vulnerableMultiplier = RECOVERY_VULNERABLE_MULTIPLIER;
          }
        }
        break;
      }

      case Phase.GAP: {
        const step = this.currentStep();
        if (this.frame >= (step.gap || 8)) {
          this.stepIndex++;
          this.phase = Phase.WINDUP;
          this.frame = 0;
        }
        break;
      }

      case Phase.RECOVERY: {
        // 振り終わりで少し息を整える
        this.stamina = Math.min(this.maxStamina, this.stamina + (this.form.staminaRegen ?? 0.22));
        if (this.frame >= (this.currentPattern.recoveryFrames || 24)) {
          // 「投げてから一気に詰める」のような繋ぎを仕込む
          if (this.currentPattern.followUp
              && Math.random() < (this.currentPattern.followUpChance ?? 0.85)) {
            this._forcedNext = this.currentPattern.followUp;
          }
          this.phase = Phase.COOLDOWN;
          this.frame = 0;
          this.currentPattern = null;
        }
        break;
      }
    }

    if (this.phase !== Phase.ACTIVE) this.hasHitThisAction = false;
    this.y = this.groundY;
  }

  _moveToward(player, speed, useFacing = false) {
    const dir = useFacing ? this.facing : (player.x < this.x ? -1 : 1);
    this.x += dir * speed;
  }

  _pickPattern(player) {
    const distance = Math.abs(player.x - this.x);
    const poiseRatio = this.poise / this.maxPoise;

    // 直前の攻撃から繋ぐことが決まっていればそれを最優先する
    if (this._forcedNext) {
      const next = this.form.pool.includes(this._forcedNext) ? this.patterns[this._forcedNext] : null;
      this._forcedNext = null;
      if (next) {
        this.currentPattern = next;
        return;
      }
    }

    const dodge = this.patterns[this.form.dodgePattern || 'backstep'];
    if (dodge) {
      // 体幹を削られてきたら距離を取って立て直す
      if (poiseRatio < 0.4 && distance < 240 && Math.random() < 0.7) {
        this.currentPattern = dodge;
        return;
      }
      // 強攻撃を溜めているのを見たら高確率で躱す
      if (player.isCharging && distance < 220 && Math.random() < 0.62) {
        this.currentPattern = dodge;
        return;
      }
      // 回復しようとしているのは見逃さない。すぐ詰めて潰す
      if (player.isHealing && this.patterns.lunge && distance > 140) {
        this.currentPattern = this.patterns.lunge;
        return;
      }
    }

    const pool = this.form.pool.map((name) => this.patterns[name]).filter(Boolean);
    const weighted = pool.map((p) => {
      let w = p.weight || 1;
      // 大技は形態によって出る頻度を変える
      if (p.big) w *= this.form.bigMoveScale ?? 1;
      if (distance > 300) {
        // 離れられたら飛び道具と突進。近接技はまず選ばない
        w *= p.longRange ? 3.2 : 0.25;
      } else if (distance > 180) {
        w *= p.longRange ? 1.4 : 0.9;
      } else {
        w *= p.longRange ? 0.4 : 1.35;
      }
      return { p, w };
    });
    const total = weighted.reduce((s, e) => s + e.w, 0);
    let roll = Math.random() * total;
    for (const entry of weighted) {
      roll -= entry.w;
      if (roll <= 0) { this.currentPattern = entry.p; return; }
    }
    this.currentPattern = pool[0];
  }

  _stepBox(step, extraReach = 0) {
    const hb = step.hitbox;
    if (!hb) return null;
    let w = hb.w + extraReach;
    let x;
    if (hb.centered) {
      x = this.x - w / 2;
    } else {
      x = this.facing === 1 ? this.x + hb.offsetX : this.x - hb.offsetX - w;
      // 判定を自分の足元まで広げる。すり抜けた相手が真下で安全にならないように
      if (hb.coversSelf !== false) {
        const back = this.x - (this.facing === 1 ? this.w / 2 : -this.w / 2);
        const left = Math.min(x, back);
        const right = Math.max(x + w, back);
        x = left;
        w = right - left;
      }
    }
    const y = this.y - this.h + hb.offsetY + this.h / 2 - hb.h / 2;
    return { x, y, w, h: hb.h };
  }

  // 予告表示用。突進はその移動距離ぶんも危険範囲に含める
  getTelegraphBox() {
    const step = this.currentStep();
    if (!step || !step.hitbox) return null;
    const lungeReach = step.lungeSpeed ? step.lungeSpeed * step.active : 0;
    return this._stepBox(step, lungeReach);
  }

  getTelegraphProgress() {
    const step = this.currentStep();
    if (!step) return 0;
    return Math.min(1, this.frame / this._windupOf(step));
  }

  getHurtbox() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  getActiveHitbox() {
    if (this.phase !== Phase.ACTIVE) return null;
    const step = this.currentStep();
    if (!step || !step.hitbox) return null;
    const box = this._stepBox(step);
    return { ...box, damage: this._damageOf(step), unblockable: !!step.unblockable };
  }

  // 空から降ってくる矢。プレイヤーの周りに散らして、少しずつ落とす
  buildRain(step, player) {
    const r = step.rain;
    const out = [];
    for (let i = 0; i < r.count; i++) {
      const t = r.count === 1 ? 0.5 : i / (r.count - 1);
      const x = player.x - r.spread / 2 + r.spread * t + (Math.random() - 0.5) * 60;
      out.push({
        owner: 'boss',
        kind: 'rain',
        x,
        y: -90 - Math.random() * 60,
        vx: 0,
        vy: r.vy,
        gravity: r.gravity,
        w: r.w,
        h: r.h,
        life: 220,
        pierce: 0,
        damage: this._damageOf({ damage: r.damage }),
        unblockable: !!r.unblockable,
        spawnDelay: Math.round(i * (r.interval ?? 5)),
        color: r.color || '#ffd76a',
      });
    }
    return out;
  }

  // ボスが放つ飛び道具の仕様。main.js が Projectile に変換する
  buildProjectile(step) {
    const p = step.projectile;
    return {
      owner: 'boss',
      kind: 'bossShot',
      x: this.x + this.facing * 40,
      y: this.y + (p.offsetY ?? -80),
      vx: this.facing * p.speed,
      vy: p.vy || 0,
      gravity: p.gravity || 0,
      w: p.w,
      h: p.h,
      life: p.life || 150,
      pierce: 0,
      damage: this._damageOf(step),
      unblockable: !!step.unblockable,
      color: p.color || '#ff8a4a',
    };
  }
}
