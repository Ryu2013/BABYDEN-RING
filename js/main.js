import { createInputManager } from './input.js';
import { createUI } from './ui.js';
import { Timer } from './timer.js';
import { encodeStageIndex, decodeStagePassword } from './password.js';
import { STAGES } from './stages.js';
import { CHARACTERS, findCharacter } from './characters.js';
import { Player, PARRY_POISE_DAMAGE, CHARGE_LEVELS } from './entities/player.js';
import { Boss } from './entities/boss.js';
import { Projectile } from './projectiles.js';
import { Effects } from './effects.js';
import { aabbIntersect } from './physics.js';
import { render } from './renderer.js';
import { Screen } from './state.js';
import { loadAssets } from './assets.js';

const LOGICAL_W = 960;
const LOGICAL_H = 540;
const GROUND_Y = 460;
const STEP_MS = 1000 / 60;

class Game {
  constructor() {
    this.ui = null;
    this.input = null;
    this.timer = new Timer();
    this.screen = Screen.TITLE;
    this.stageIndex = 0;
    this.pendingStageIndex = 0;
    this.charId = CHARACTERS[0].id;
    this.player = null;
    this.boss = null;
    this.projectiles = [];
    this.effects = new Effects();
  }

  // タイトルで合言葉を確かめたあと、生まれ（主人公）の選択画面に進む
  goToSelect(passwordRaw) {
    const trimmed = passwordRaw.trim();
    if (!trimmed) {
      this.pendingStageIndex = 0;
    } else {
      const result = decodeStagePassword(trimmed);
      if (!result.ok || result.index < 0 || result.index >= STAGES.length) {
        this.ui.showTitle('合言葉が違う');
        return;
      }
      this.pendingStageIndex = result.index;
    }
    this.screen = Screen.SELECT;
    this.ui.showSelect();
  }

  startFight(stageIndex) {
    const def = STAGES[stageIndex];
    this.stageIndex = stageIndex;
    this.player = new Player(240, GROUND_Y, findCharacter(this.charId));
    this.boss = new Boss(def, 720, GROUND_Y);
    this.projectiles = [];
    this.effects.clear();
    this.timer.start();
    this.screen = Screen.FIGHT;
    this.ui.showFight(this.boss.name);
  }

  confirmCharacter(charId) {
    if (charId) this.charId = charId;
    this.startFight(this.pendingStageIndex);
  }

  update() {
    if (this.screen !== Screen.FIGHT) return;
    const { player, boss, effects } = this;

    player.update(this.input);
    boss.update(player);

    this._resolveMelee();
    this._resolveProjectiles();
    this._drainEvents();

    // 体同士は押し合う。ただしロール中は最後まですり抜けられる
    // （無敵時間だけだと足の遅いキャラが敵を越えられず壁に詰められる）
    if (player.state !== 'roll' && !player.isInvulnerable && !boss.isDead) {
      const pb = player.getHurtbox();
      const bb = boss.getHurtbox();
      if (aabbIntersect(pb, bb)) {
        const pushLeft = pb.x + pb.w - bb.x;
        const pushRight = bb.x + bb.w - pb.x;
        player.x += pushLeft < pushRight ? -pushLeft : pushRight;
      }
    }

    player.x = Math.max(40, Math.min(LOGICAL_W - 40, player.x));
    boss.x = Math.max(80, Math.min(LOGICAL_W - 80, boss.x));

    effects.update();

    this.ui.updateHud({
      playerHpRatio: player.hp / player.maxHp,
      playerStaminaRatio: player.stamina / player.maxStamina,
      flasks: player.flasks,
      maxFlasks: player.maxFlasks,
      bossHpRatio: boss.hp / boss.maxHp,
      elapsedMs: this.timer.getElapsedMs(),
    });

    if (boss.isDead) this.onVictory();
    else if (player.isDead) this.onGameOver();
  }

  _resolveMelee() {
    const { player, boss, effects } = this;

    const playerHit = player.getActiveHitbox();
    if (playerHit && !player.hasHitThisAction && aabbIntersect(playerHit, boss.getHurtbox())) {
      player.hasHitThisAction = true;
      const staggered = boss.isStaggered;
      boss.takeDamage(playerHit.damage);
      boss.damagePoise(playerHit.poise);
      const cx = playerHit.x + playerHit.w / 2;
      const cy = playerHit.y + playerHit.h / 2;
      effects.hit(cx, cy, staggered ? 2 : (playerHit.kind === 'heavyAttack' ? 1.5 : 0.9));
    }

    const bossHit = boss.getActiveHitbox();
    if (bossHit && !boss.hasHitThisAction && aabbIntersect(bossHit, player.getHurtbox())) {
      boss.hasHitThisAction = true;
      const result = player.takeDamage(bossHit.damage, boss.x, { unblockable: bossHit.unblockable });
      if (result === 'parry') boss.damagePoise(PARRY_POISE_DAMAGE);
    }
  }

  _resolveProjectiles() {
    const { player, boss, effects } = this;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update();
      const box = p.getBox();

      if (p.owner === 'player' && !boss.isDead && aabbIntersect(box, boss.getHurtbox())) {
        const staggered = boss.isStaggered;
        boss.takeDamage(p.damage);
        boss.damagePoise(p.poise);
        effects.hit(p.x, p.y, staggered ? 1.8 : 1);
        p.registerHit();
      } else if (p.owner === 'boss' && aabbIntersect(box, player.getHurtbox())) {
        const result = player.takeDamage(p.damage, p.x, { unblockable: p.unblockable });
        if (result === 'parry') boss.damagePoise(PARRY_POISE_DAMAGE);
        if (result !== 'miss') p.registerHit();
      }

      if (p.x < -80 || p.x > LOGICAL_W + 80 || p.y > LOGICAL_H + 80) p.dead = true;
      if (p.dead) {
        // 弓の矢が誰にも当たらず消えたら、空振り扱いで体幹が削れる
        if (p.owner === 'player' && p.hitCount === 0) player.notifyWhiff(p.kind);
        if (p.owner === 'player' || p.hitCount > 0) effects.spark(p.x, p.y, p.color, 6, 4);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _drainEvents() {
    const { player, boss, effects } = this;

    for (const ev of player.events) {
      switch (ev.type) {
        case 'shoot': {
          const spec = player.buildProjectile(ev.kind);
          if (spec) {
            this.projectiles.push(new Projectile(spec));
            effects.spark(spec.x, spec.y, spec.color, 5, 3);
          }
          break;
        }
        case 'chargeStep':
          effects.chargeStep(player.x, player.y - player.h * 0.6, ev.level, CHARGE_LEVELS[ev.level].color);
          break;
        case 'chargeRelease':
          effects.playerSwing(player.x + player.facing * 46, player.y - player.h * 0.55, player.facing, ev.level);
          break;
        case 'parry':
          effects.parry(ev.x, ev.y);
          break;
        case 'healStart':
          effects.heal(player.x, player.y - player.h * 0.5, false);
          break;
        case 'healDone':
          effects.heal(player.x, player.y - player.h * 0.5, true);
          break;
        case 'playerHurt':
          effects.spark(ev.x, ev.y, '#ff6b6b', 10, 6);
          effects.shake = Math.max(effects.shake, 5);
          break;
        case 'playerStagger':
          effects.stagger(player.x, player.y - player.h * 0.8, '体勢を崩した！');
          break;
      }
    }
    player.events.length = 0;

    for (const ev of boss.events) {
      switch (ev.type) {
        case 'bossShoot': {
          const spec = boss.buildProjectile(ev.step);
          this.projectiles.push(new Projectile(spec));
          effects.spark(spec.x, spec.y, spec.color, 8, 5);
          break;
        }
        case 'bossSwing':
          effects.slash(boss.x + boss.facing * 60, boss.y - boss.h * 0.5, boss.facing,
            ev.step.unblockable ? 'rgba(255,190,60,0.9)' : 'rgba(255,110,90,0.85)', 76);
          break;
        case 'bossStagger':
          effects.stagger(boss.x, boss.y - boss.h * 0.9, '体幹崩し！');
          break;
        case 'evolveStart':
          effects.evolve(boss.x, boss.y - boss.h * 0.6);
          break;
        case 'evolveDone':
          effects.ring(boss.x, boss.y - boss.h * 0.5, 'rgba(255,120,80,0.9)', 20, 30, 8);
          this.ui.setBossName(boss.name);
          break;
      }
    }
    boss.events.length = 0;

    if (player.isHealing) {
      effects.charging(player.x, player.y - player.h * 0.5, 0, '#9dffb0');
    }

    // 溜め中はオーラを出し続ける
    if (player.isCharging) {
      const info = player.chargeInfo();
      effects.charging(player.x, player.y - player.h * 0.55, info.index, info.level.color);
    }
  }

  onVictory() {
    this.timer.stop();
    this.screen = Screen.VICTORY;
    const nextIndex = this.stageIndex + 1;
    const isLastStage = nextIndex >= STAGES.length;
    this.ui.showVictory({
      elapsedMs: this.timer.getElapsedMs(),
      password: isLastStage ? '' : encodeStageIndex(nextIndex),
      isLastStage,
    });
  }

  onGameOver() {
    this.timer.stop();
    this.screen = Screen.GAMEOVER;
    this.ui.showGameOver();
  }

  backToTitle() {
    this.screen = Screen.TITLE;
    this.ui.showTitle();
  }

  render(ctx) {
    render(ctx, {
      screen: this.screen,
      player: this.player,
      boss: this.boss,
      projectiles: this.projectiles,
      effects: this.effects,
      logicalW: LOGICAL_W,
      logicalH: LOGICAL_H,
      groundY: GROUND_Y,
    });
  }
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = LOGICAL_W * dpr;
  canvas.height = LOGICAL_H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

async function main() {
  const canvas = document.getElementById('game-canvas');
  const ctx = setupCanvas(canvas);
  const input = createInputManager();
  const game = new Game();
  game.input = input;

  await loadAssets();

  const ui = createUI({
    onGoToSelect: (pw) => game.goToSelect(pw),
    onStartFight: (charId) => game.confirmCharacter(charId),
    onRetryFight: () => game.startFight(game.stageIndex),
    onBackToTitle: () => game.backToTitle(),
  });
  game.ui = ui;
  ui.bindTouchButtons(input);
  ui.showTitle();

  if (new URLSearchParams(location.search).has('debug')) {
    window.__game = game;
  }

  let lastTime = performance.now();
  let accumulator = 0;

  function loop(now) {
    accumulator += now - lastTime;
    lastTime = now;
    let steps = 0;
    while (accumulator >= STEP_MS && steps < 5) {
      game.update();
      input.tick();
      accumulator -= STEP_MS;
      steps++;
    }
    game.render(ctx);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main();
