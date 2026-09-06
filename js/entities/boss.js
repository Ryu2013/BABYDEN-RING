export const Phase = {
  COOLDOWN: 'cooldown',
  WINDUP: 'windup',
  ACTIVE: 'active',
  GAP: 'gap',
  RECOVERY: 'recovery',
  STAGGER: 'stagger',
  EVOLVE: 'evolve',
  DEAD: 'dead',
};

const RECOVERY_VULNERABLE_MULTIPLIER = 1.5;
const STAGGER_VULNERABLE_MULTIPLIER = 2.4;
const STAGGER_FRAMES = 150;
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
    if (!initial) {
      this.phase = Phase.COOLDOWN;
      this.frame = 0;
      this.currentPattern = null;
    }
  }

  get isDead() { return this.phase === Phase.DEAD; }
  get isStaggered() { return this.phase === Phase.STAGGER; }
  get isEvolving() { return this.phase === Phase.EVOLVE; }
  get isFinalForm() { return this.formIndex >= this.def.forms.length - 1; }

  isTelegraphing() { return this.phase === Phase.WINDUP; }
  isRecovering() { return this.phase === Phase.RECOVERY || this.phase === Phase.GAP; }

  currentStep() {
    if (!this.currentPattern) return null;
    return this.currentPattern.steps[this.stepIndex] || null;
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

    if (this.phase === Phase.STAGGER) {
      if (this.frame >= STAGGER_FRAMES) {
        this.poise = this.maxPoise;
        this.phase = Phase.COOLDOWN;
        this.frame = 0;
        this.vulnerableMultiplier = 1;
      }
      return;
    }

    // 突進中は向きを固定し、それ以外は常にプレイヤーを向く
    if (this.phase !== Phase.ACTIVE) {
      this.facing = player.x < this.x ? -1 : 1;
    }

    switch (this.phase) {
      case Phase.COOLDOWN: {
        this.vulnerableMultiplier = 1;
        const distance = Math.abs(player.x - this.x);
        if (this.form.moveSpeed && distance > this.form.preferredRange) {
          this._moveToward(player, this.form.moveSpeed);
        }
        if (this.frame >= this.form.cooldownFrames) {
          this._pickPattern(player);
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
        if (this.frame >= (this.currentPattern.recoveryFrames || 24)) {
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
    const pool = this.form.pool
      .map((name) => this.patterns[name])
      .filter(Boolean);

    // プレイヤーが強攻撃を溜めているのを見たら、高確率で距離を取って躱す
    const dodge = this.patterns[this.form.dodgePattern || 'backstep'];
    if (dodge && player && player.isCharging && player.chargeLevel >= 1) {
      if (Math.abs(player.x - this.x) < 190 && Math.random() < 0.62) {
        this.currentPattern = dodge;
        return;
      }
    }

    const distance = Math.abs(player.x - this.x);
    const weighted = pool.map((p) => {
      let w = p.weight || 1;
      // 遠いときは飛び道具と突進を、近いときは近接をよく使う
      if (distance > 300) w *= p.longRange ? 2.6 : 0.5;
      else if (distance < 150) w *= p.longRange ? 0.5 : 1.3;
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
    const w = hb.w + extraReach;
    const x = hb.centered
      ? this.x - w / 2
      : (this.facing === 1 ? this.x + hb.offsetX : this.x - hb.offsetX - w);
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
