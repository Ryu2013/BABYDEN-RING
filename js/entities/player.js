import { CHARACTERS } from '../characters.js';

const GRAVITY = 0.55;
const HURT_DURATION = 18;
const HURT_CANCEL_FROM = 12;
const HIT_INVULN_FRAMES = 24;

// ガードを押した直後のこの猶予内に攻撃を受けるとパリィになる
export const PARRY_WINDOW = 7;
export const PARRY_POISE_DAMAGE = 5;

// 体幹の減り方。空振りには代償があり、振り回すだけでは体勢を保てない
const POISE_LOSS = { lightAttack: 1, heavyAttack: 2, hit: 1 };
const STAGGER_FRAMES = 78;

// 強攻撃の溜め3段階。atFrame は溜め開始からのフレーム数
export const CHARGE_LEVELS = [
  { atFrame: 0, damage: 1.0, poise: 0, reach: 0, extraStamina: 0, color: '#ffe9b0' },
  { atFrame: 26, damage: 1.7, poise: 1, reach: 14, extraStamina: 12, color: '#ffa63d' },
  { atFrame: 58, damage: 2.5, poise: 2, reach: 30, extraStamina: 22, color: '#ff4438' },
];
const CHARGE_MAX_FRAMES = 96;

function totalFrames(t) {
  return t.startup + t.active + t.recovery;
}

export class Player {
  constructor(x, groundY, charDef = CHARACTERS[0]) {
    this.char = charDef;
    this.timings = charDef.timings;
    this.x = x;
    this.y = groundY;
    this.groundY = groundY;
    this.w = 48;
    this.h = 90;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;

    this.maxHp = charDef.maxHp;
    this.hp = charDef.maxHp;
    this.maxStamina = charDef.maxStamina;
    this.stamina = charDef.maxStamina;
    this.staminaIdleFrames = 0;
    this.maxPoise = charDef.maxPoise;
    this.poise = charDef.maxPoise;
    this.poiseIdleFrames = 0;

    this.guardBroken = false;
    this.state = 'idle';
    this.frame = 0;
    this.onGround = true;
    this.hasHitThisAction = false;
    this.invulnFrames = 0;
    this.isDead = false;

    this.chargeFrames = 0;
    this.chargeLevel = 0;
    this.parryFlash = 0;
    // 描画とエフェクトに伝えるための1フレーム分の出来事
    this.events = [];
  }

  get isInvulnerable() {
    if (this.invulnFrames > 0) return true;
    if (this.state !== 'roll') return false;
    const t = this.timings.roll;
    return this.frame >= t.iframeStart && this.frame <= t.iframeEnd;
  }

  get isGuarding() {
    return this.state === 'guard';
  }

  get isStaggered() {
    return this.state === 'stagger';
  }

  get isCharging() {
    return this.state === 'heavyCharge';
  }

  _spendStamina(cost) {
    if (this.stamina < cost) return false;
    this.stamina -= cost;
    this.staminaIdleFrames = 0;
    return true;
  }

  _enterState(state) {
    this.state = state;
    this.frame = 0;
    this.hasHitThisAction = false;
  }

  _emit(type, extra = {}) {
    this.events.push({ type, x: this.x, y: this.y - this.h / 2, facing: this.facing, ...extra });
  }

  // 硬直の終盤（cancelFrom以降）は次の行動でキャンセルできる
  _acceptsAction() {
    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'guard':
      case 'heavyCharge':
        return true;
      case 'roll':
      case 'lightAttack':
      case 'heavyAttack':
        return this.frame >= this.timings[this.state].cancelFrom;
      case 'hurt':
        return this.frame >= HURT_CANCEL_FROM;
      default:
        return false;
    }
  }

  _faceHeldDirection(input) {
    if (input.isDown('left')) this.facing = -1;
    else if (input.isDown('right')) this.facing = 1;
  }

  damagePoise(amount) {
    if (this.isStaggered || this.isDead) return;
    this.poise = Math.max(0, this.poise - amount);
    this.poiseIdleFrames = 0;
    if (this.poise <= 0) {
      this.poise = 0;
      this.vx = 0;
      this._enterState('stagger');
      this._emit('playerStagger');
    }
  }

  // 空振りの代償。弓の矢が誰にも当たらずに消えたときも呼ばれる
  notifyWhiff(kind) {
    this.damagePoise(POISE_LOSS[kind] || 1);
  }

  chargeInfo() {
    const level = CHARGE_LEVELS[this.chargeLevel] || CHARGE_LEVELS[0];
    const next = CHARGE_LEVELS[this.chargeLevel + 1];
    const progress = next
      ? (this.chargeFrames - level.atFrame) / (next.atFrame - level.atFrame)
      : 1;
    return { index: this.chargeLevel, level, progress: Math.max(0, Math.min(1, progress)) };
  }

  _levelForFrames(frames) {
    let level = 0;
    for (let i = 0; i < CHARGE_LEVELS.length; i++) {
      if (frames >= CHARGE_LEVELS[i].atFrame) level = i;
    }
    return level;
  }

  _releaseCharge() {
    let level = this._levelForFrames(this.chargeFrames);
    // 溜めきってもスタミナが足りなければ、払える段階まで落として撃つ
    while (level > 0 && this.stamina < CHARGE_LEVELS[level].extraStamina) level--;
    if (level > 0) this._spendStamina(CHARGE_LEVELS[level].extraStamina);
    this.chargeLevel = level;
    this._enterState('heavyAttack');
    this._emit('chargeRelease', { level });
  }

  update(input) {
    if (this.isDead) return;
    this.frame++;
    this.events.length = 0;
    if (this.invulnFrames > 0) this.invulnFrames--;
    if (this.parryFlash > 0) this.parryFlash--;

    this.vy += GRAVITY;
    this.y += this.vy;
    if (this.y >= this.groundY) {
      this.y = this.groundY;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // スタミナ回復。行動してから少し間を置くと回復し始める
    this.staminaIdleFrames++;
    if (this.staminaIdleFrames > this.char.staminaDelay) {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.char.staminaRegen);
      if (this.stamina >= this.maxStamina * 0.3) this.guardBroken = false;
    }

    // 体幹も自動で回復する。崩されている間は回復しない
    this.poiseIdleFrames++;
    if (!this.isStaggered && this.poiseIdleFrames > this.char.poiseDelay) {
      this.poise = Math.min(this.maxPoise, this.poise + this.char.poiseRegen);
    }

    if (this.isStaggered) {
      this.vx *= 0.82;
      this.x += this.vx;
      if (this.frame >= STAGGER_FRAMES) {
        this.poise = this.maxPoise;
        this._enterState('idle');
      }
      return;
    }

    if (this.onGround && this._acceptsAction()) {
      // スタミナが足りない行動は発動しない（連打ではなく間合いと回復の管理を強いる）
      for (const action of ['roll', 'heavyAttack', 'lightAttack']) {
        if (!input.consumeBuffered(action)) continue;
        if (!this._spendStamina(this.timings[action].stamina)) break;
        this._faceHeldDirection(input);
        if (action === 'heavyAttack') {
          // 強攻撃は押しっぱなしで溜めに入る
          this.chargeFrames = 0;
          this.chargeLevel = 0;
          this._enterState('heavyCharge');
        } else {
          this._enterState(action);
        }
        break;
      }
      const busy = this.state === 'roll' || this.state === 'heavyCharge' || this.state.endsWith('Attack');
      if (!busy && input.consumeBuffered('jump')) {
        this._faceHeldDirection(input);
        this.vy = this.char.jumpVelocity;
        this.onGround = false;
        this._enterState('jump');
      }
    }

    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'guard': {
        const guarding = input.isDown('guard') && !this.guardBroken;
        let moving = false;
        if (!guarding) {
          if (input.isDown('left')) {
            this.vx = -this.char.moveSpeed;
            this.facing = -1;
            moving = true;
          } else if (input.isDown('right')) {
            this.vx = this.char.moveSpeed;
            this.facing = 1;
            moving = true;
          } else {
            this.vx = 0;
          }
        } else {
          this.vx = 0;
        }

        const nextState = guarding ? 'guard' : (moving ? 'walk' : 'idle');
        if (nextState !== this.state) this._enterState(nextState);
        break;
      }
      case 'jump': {
        if (input.isDown('left')) {
          this.vx = -this.char.moveSpeed;
          this.facing = -1;
        } else if (input.isDown('right')) {
          this.vx = this.char.moveSpeed;
          this.facing = 1;
        }
        if (this.onGround) this._enterState('idle');
        break;
      }
      case 'roll': {
        const t = this.timings.roll;
        const progress = this.frame / totalFrames(t);
        this.vx = this.facing * t.speed * (1 - 0.7 * progress);
        if (this.frame >= totalFrames(t)) this._enterState('idle');
        break;
      }
      case 'heavyCharge': {
        this.chargeFrames++;
        const level = this._levelForFrames(this.chargeFrames);
        if (level !== this.chargeLevel) {
          this.chargeLevel = level;
          this._emit('chargeStep', { level });
        }
        // 溜め中もじりじり動けるが、足はかなり遅くなる
        const creep = this.char.moveSpeed * 0.32;
        if (input.isDown('left')) { this.vx = -creep; this.facing = -1; }
        else if (input.isDown('right')) { this.vx = creep; this.facing = 1; }
        else this.vx = 0;

        if (!input.isDown('heavyAttack') || this.chargeFrames >= CHARGE_MAX_FRAMES) {
          this._releaseCharge();
        }
        break;
      }
      case 'lightAttack':
      case 'heavyAttack': {
        const t = this.timings[this.state];
        const localFrame = this.frame - t.startup;
        // 攻撃の出際に少しだけ前に踏み込む（弓は踏み込まない）
        const step = t.projectile ? 0 : 2.4;
        this.vx = localFrame >= 0 && localFrame < t.active ? this.facing * step : 0;
        // 弓はactiveの頭で矢を放つ。以降は当たり判定を持たない
        if (t.projectile && localFrame === 0 && !this.hasHitThisAction) {
          this.hasHitThisAction = true;
          this._emit('shoot', { kind: this.state });
        }
        if (this.frame >= totalFrames(t)) {
          if (!this.hasHitThisAction) this.notifyWhiff(this.state);
          // 空振りで体幹が尽きたときは idle で上書きせず、そのまま崩れる
          if (!this.isStaggered) this._enterState('idle');
        }
        break;
      }
      case 'hurt': {
        this.vx *= 0.85;
        if (this.frame >= HURT_DURATION) this._enterState('idle');
        break;
      }
    }

    this.x += this.vx;
  }

  // 弓が撃つ矢の仕様。main.js が Projectile に変換する
  buildProjectile(kind) {
    const t = this.timings[kind];
    if (!t.projectile) return null;
    const p = t.projectile;
    const charge = kind === 'heavyAttack' ? CHARGE_LEVELS[this.chargeLevel] : CHARGE_LEVELS[0];
    return {
      owner: 'player',
      kind,
      x: this.x + this.facing * 30,
      y: this.y + (p.offsetY || -46),
      vx: this.facing * p.speed,
      vy: 0,
      w: p.w + charge.reach,
      h: p.h,
      life: p.life,
      pierce: (p.pierce || 0) + (kind === 'heavyAttack' ? this.chargeLevel : 0),
      damage: t.damage * charge.damage,
      poise: t.poise + charge.poise,
      color: kind === 'heavyAttack' ? charge.color : '#eaf7ff',
    };
  }

  getActiveHitbox() {
    const t = this.timings[this.state];
    if (!t || !t.hitbox) return null;
    const localFrame = this.frame - t.startup;
    if (localFrame < 0 || localFrame >= t.active) return null;

    const charge = this.state === 'heavyAttack' ? CHARGE_LEVELS[this.chargeLevel] : CHARGE_LEVELS[0];
    const hb = t.hitbox;
    const w = hb.w + charge.reach;
    const h = hb.h + charge.reach * 0.5;
    const x = this.facing === 1 ? this.x + hb.offsetX : this.x - hb.offsetX - w;
    const y = this.y - this.h + hb.offsetY + this.h / 2 - h / 2;
    return {
      x, y, w, h,
      damage: t.damage * charge.damage,
      poise: t.poise + charge.poise,
      kind: this.state,
    };
  }

  getHurtbox() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  // 戻り値: 'parry' | 'guard' | 'hit' | 'miss'
  takeDamage(amount, fromX, opts = {}) {
    if (this.isDead || this.isInvulnerable) return 'miss';

    const canGuard = !opts.unblockable && this.state === 'guard' && !this.guardBroken;

    // 相手の攻撃に合わせてガードを入れるとパリィ。無傷で受け止め、相手の体幹を大きく削る
    if (canGuard && this.frame <= PARRY_WINDOW) {
      this.parryFlash = 20;
      this.stamina = Math.min(this.maxStamina, this.stamina + 14);
      this.staminaIdleFrames = 0;
      this._emit('parry', { x: this.x + this.facing * 34, y: this.y - this.h * 0.6 });
      return 'parry';
    }

    let guarded = canGuard;
    if (guarded) {
      // 受け止めた分だけスタミナを消費し、支えきれなければガードが崩れて直撃する
      const cost = amount * this.char.guardStaminaPerDamage;
      if (this._spendStamina(cost)) {
        this.staminaIdleFrames = -20; // 受けた直後は回復を遅らせる
      } else {
        this.stamina = 0;
        this.guardBroken = true;
        guarded = false;
        this._emit('guardBreak');
      }
    }

    const raw = guarded ? amount * this.char.guardMultiplier : amount * this.char.defense;
    this.hp = Math.max(0, this.hp - raw);
    this.invulnFrames = HIT_INVULN_FRAMES;

    const knockDir = fromX !== undefined && fromX > this.x ? -1 : 1;
    if (this.hp <= 0) {
      this.isDead = true;
      this.state = 'dead';
      return 'hit';
    }
    if (guarded) {
      this.vx = knockDir * 1.5;
      this._emit('guardHit', { x: this.x + this.facing * 30, y: this.y - this.h * 0.6 });
      return 'guard';
    }

    this._emit('playerHurt', { x: this.x, y: this.y - this.h * 0.6 });
    this.vx = knockDir * 4;
    // 体幹が尽きればのけぞりではなく体勢崩しに移行する
    this.damagePoise(POISE_LOSS.hit);
    if (!this.isStaggered) this._enterState('hurt');
    return 'hit';
  }
}
