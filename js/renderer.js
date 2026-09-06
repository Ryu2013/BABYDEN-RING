import { images } from './assets.js';
import { CHARGE_LEVELS } from './entities/player.js';

const DEBUG_HITBOX = new URLSearchParams(location.search).has('debug');

// 生成された元絵は転がりのポーズだけ左向きに描かれている
function sourceFacing(key) {
  return key.endsWith('Roll') ? -1 : 1;
}

function drawSprite(ctx, img, key, { x, bottomY, height, facing, rotation = 0, alpha = 1, filter = null }) {
  const width = img.width * (height / img.height);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (filter) ctx.filter = filter;
  ctx.translate(x, bottomY);
  if (rotation) {
    ctx.translate(0, -height / 2);
    ctx.rotate(rotation);
    ctx.translate(0, height / 2);
  }
  if (facing !== sourceFacing(key)) ctx.scale(-1, 1);
  ctx.drawImage(img, -width / 2, -height, width, height);
  ctx.restore();
}

function drawShadow(ctx, x, groundY, width) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, groundY, width / 2, width / 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBox(ctx, box, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

export function render(ctx, { screen, player, boss, projectiles, effects, logicalW, logicalH, groundY }) {
  ctx.clearRect(0, 0, logicalW, logicalH);
  ctx.save();

  // 大きな一撃やパリィで画面を揺らす
  const shake = effects ? effects.shake : 0;
  if (shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  if (images.arena) {
    ctx.drawImage(images.arena, 0, 0, logicalW, logicalH);
    ctx.fillStyle = 'rgba(10,12,20,0.35)';
    ctx.fillRect(0, 0, logicalW, logicalH);
  } else {
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(0, 0, logicalW, logicalH);
  }

  // 足元を少しだけ暗く落として、キャラが浮いて見えないようにする
  const floor = ctx.createLinearGradient(0, groundY - 30, 0, logicalH);
  floor.addColorStop(0, 'rgba(6,8,14,0)');
  floor.addColorStop(0.4, 'rgba(6,8,14,0.45)');
  floor.addColorStop(1, 'rgba(6,8,14,0.8)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, groundY - 30, logicalW, logicalH - groundY + 30);

  if (screen !== 'fight' || !player || !boss) {
    ctx.restore();
    return;
  }

  drawTelegraph(ctx, boss, groundY);
  drawBoss(ctx, boss, groundY);
  drawPlayer(ctx, player, groundY);
  drawImpact(ctx, boss);
  if (projectiles) for (const p of projectiles) drawProjectile(ctx, p);
  if (effects) drawEffects(ctx, effects);

  if (DEBUG_HITBOX) {
    drawBox(ctx, player.getHurtbox(), 'rgba(80,200,255,0.8)');
    drawBox(ctx, boss.getHurtbox(), 'rgba(255,120,120,0.8)');
    const ph = player.getActiveHitbox();
    if (ph) drawBox(ctx, ph, 'rgba(255,255,255,0.9)');
    const bh = boss.getActiveHitbox();
    if (bh) drawBox(ctx, bh, 'rgba(255,0,0,0.9)');
    if (projectiles) for (const p of projectiles) drawBox(ctx, p.getBox(), 'rgba(255,255,0,0.9)');
  }

  ctx.restore();
}

// 攻撃の予告。危険範囲を足元に表示し、満ちきったタイミングで攻撃が出る
function drawTelegraph(ctx, boss, groundY) {
  if (!boss.isTelegraphing()) return;
  const box = boss.getTelegraphBox();
  if (!box) return;
  const step = boss.currentStep();
  const unblockable = !!step.unblockable;
  const progress = boss.getTelegraphProgress();

  // ガード不可攻撃は黄色。「これはガードでは止まらない」と一目で分かるようにする
  const rgb = unblockable ? '255,190,40' : '255,40,40';
  ctx.save();

  const top = Math.min(groundY - 90, box.y);
  const glow = ctx.createLinearGradient(0, top, 0, groundY + 14);
  glow.addColorStop(0, `rgba(${rgb},0)`);
  glow.addColorStop(1, `rgba(${rgb},${0.10 + 0.24 * progress})`);
  ctx.fillStyle = glow;
  ctx.fillRect(box.x, top, box.w, groundY + 14 - top);

  // 満ちていくバーで発生タイミングを示す
  ctx.fillStyle = `rgba(${rgb},0.22)`;
  ctx.fillRect(box.x, groundY + 2, box.w, 10);
  ctx.fillStyle = unblockable
    ? `rgba(255,${Math.round(220 - 90 * progress)},60,0.95)`
    : `rgba(255,${Math.round(200 - 160 * progress)},60,0.95)`;
  ctx.fillRect(box.x, groundY + 2, box.w * progress, 10);

  ctx.strokeStyle = `rgba(${rgb},${0.4 + 0.45 * progress})`;
  ctx.lineWidth = unblockable ? 3 : 2;
  if (unblockable) ctx.setLineDash([10, 6]);
  ctx.strokeRect(box.x, groundY + 2, box.w, 10);
  ctx.restore();
}

// 攻撃発生の瞬間の斬撃エフェクト
function drawImpact(ctx, boss) {
  const hit = boss.getActiveHitbox();
  if (!hit) return;
  const step = boss.currentStep();
  const life = 1 - boss.frame / step.active;
  const rgb = hit.unblockable ? '255,180,50' : '255,70,50';
  ctx.save();
  ctx.fillStyle = `rgba(${rgb},${0.22 + 0.32 * life})`;
  ctx.fillRect(hit.x, hit.y, hit.w, hit.h);
  ctx.strokeStyle = `rgba(255,240,220,${0.8 * life})`;
  ctx.lineWidth = 4;
  ctx.strokeRect(hit.x, hit.y, hit.w, hit.h);
  ctx.restore();
}

function drawProjectile(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.owner === 'player') {
    // 矢は進行方向に伸びた光の筋として描く
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(Math.sign(p.vx) * (p.w / 2 - 8) - 4, -p.h / 2, 8, p.h);
  } else {
    ctx.rotate(p.age * 0.22);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-p.w / 6, -p.h / 2 - 4, p.w / 3, 8);
  }
  ctx.restore();
}

function drawEffects(ctx, effects) {
  for (const it of effects.items) {
    const t = it.age / it.life;
    const fade = 1 - t;
    ctx.save();
    switch (it.kind) {
      case 'spark':
        ctx.globalAlpha = fade;
        ctx.fillStyle = it.color;
        ctx.fillRect(it.x - it.size / 2, it.y - it.size / 2, it.size, it.size);
        break;
      case 'gather':
        ctx.globalAlpha = 0.85 * fade + 0.15;
        ctx.fillStyle = it.color;
        ctx.shadowColor = it.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(it.x - it.size / 2, it.y - it.size / 2, it.size, it.size);
        break;
      case 'ring':
        ctx.globalAlpha = fade;
        ctx.strokeStyle = it.color;
        ctx.lineWidth = it.width * fade + 1;
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.radius + t * it.radius * 2.2, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'slash': {
        // 振り抜きの弧。時間とともに広がりながら薄れる
        ctx.globalAlpha = fade;
        ctx.translate(it.x, it.y);
        ctx.scale(it.facing, 1);
        ctx.strokeStyle = it.color;
        ctx.lineWidth = 10 * fade + 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, it.size * (0.7 + 0.5 * t), -1.15, 1.15);
        ctx.stroke();
        break;
      }
      case 'text':
        ctx.globalAlpha = Math.min(1, fade * 2.2);
        ctx.font = 'bold 26px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(it.label, it.x, it.y);
        ctx.fillStyle = it.color;
        ctx.fillText(it.label, it.x, it.y);
        break;
    }
    ctx.restore();
  }
}

function bossSpriteKey(boss) {
  const base = boss.spriteBase;
  if (boss.isTelegraphing()) {
    // 攻撃ごとに専用の構え絵があればそれを出す。読み合いの手がかりになる
    const specific = boss.windupSpriteKey();
    if (images[specific]) return specific;
    if (images[`${base}_windup`]) return `${base}_windup`;
  }
  if ((boss.phase === 'active' || boss.isRecovering()) && images[`${base}_attack`]) {
    return `${base}_attack`;
  }
  return images[base] ? base : boss.def.sprite;
}

function drawBoss(ctx, boss, groundY) {
  const key = bossSpriteKey(boss);
  const img = images[key];
  const height = relativeHeight(boss.h * (boss.spriteScale || 1.35), boss.spriteBase, key);

  drawShadow(ctx, boss.x, groundY, boss.w * 1.4);

  if (!img) {
    const hurtbox = boss.getHurtbox();
    ctx.fillStyle = boss.isTelegraphing() ? '#ffffff' : boss.def.color;
    ctx.fillRect(hurtbox.x, hurtbox.y, hurtbox.w, hurtbox.h);
    return;
  }

  let filter = null;
  let scale = 1;
  let rotation = 0;
  if (boss.isEvolving) {
    // 進化中は赤く脈打ちながら一回り大きくなる
    const t = boss.frame / 130;
    filter = `brightness(${1.2 + Math.sin(boss.frame * 0.4) * 0.5}) sepia(0.8) saturate(5) hue-rotate(-25deg)`;
    scale = 1 + 0.14 * t;
  } else if (boss.isStaggered) {
    filter = 'brightness(0.85) saturate(0.4)';
    rotation = 0.22 * boss.facing;
  } else if (boss.isTelegraphing()) {
    const step = boss.currentStep();
    // 白いボスでも分かるよう、白飛ばしではなく染める。ガード不可は黄色
    filter = step && step.unblockable
      ? 'brightness(1.3) sepia(1) saturate(6) hue-rotate(-5deg)'
      : 'brightness(1.15) sepia(0.7) saturate(4) hue-rotate(-30deg)';
    scale = 1 + 0.05 * boss.getTelegraphProgress();
  } else if (boss.hitFlash > 0) {
    filter = 'brightness(2.2)';
  } else if (boss.isRecovering()) {
    filter = 'brightness(0.75)';
  }

  drawSprite(ctx, img, key, {
    x: boss.x,
    bottomY: boss.y,
    height: height * scale,
    facing: boss.facing,
    rotation,
    filter,
  });

  if (boss.isStaggered) drawStaggerStars(ctx, boss.x, boss.y - height * 0.95, boss.frame);
  if (boss.formIndex > 0 && !boss.isStaggered) drawRage(ctx, boss, height);
}

// 体勢を崩している間、頭上に星を回す
function drawStaggerStars(ctx, x, y, frame) {
  ctx.save();
  ctx.fillStyle = '#ffe680';
  for (let i = 0; i < 3; i++) {
    const a = frame * 0.11 + (i * Math.PI * 2) / 3;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(a);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 34, y + Math.sin(a) * 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 第二形態は常時ゆらぐ赤いオーラをまとう
function drawRage(ctx, boss, height) {
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.06 * Math.sin(boss.frame * 0.15);
  const g = ctx.createRadialGradient(boss.x, boss.y - height * 0.45, 10, boss.x, boss.y - height * 0.45, height * 0.7);
  g.addColorStop(0, 'rgba(255,70,50,0.9)');
  g.addColorStop(1, 'rgba(255,70,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(boss.x - height, boss.y - height * 1.2, height * 2, height * 1.4);
  ctx.restore();
}

// 切り抜き後のPNGはポーズ間の相対的な大きさを保持している。
// 基準ポーズ(Idle)との高さの比をそのまま描画に反映すれば、
// 武器を振り上げた絵でも体の大きさが変わって見えない。
function relativeHeight(baseHeight, refKey, key) {
  const ref = images[refKey];
  const img = images[key];
  if (!ref || !img) return baseHeight;
  return baseHeight * (img.height / ref.height);
}

function playerSpriteKey(player, suffix) {
  const prefix = player.char.spritePrefix;
  if (images[prefix + suffix]) return prefix + suffix;
  if (images['sword' + suffix]) return 'sword' + suffix;
  return null;
}

function drawPlayer(ctx, player, groundY) {
  const baseHeight = player.h * 1.3;
  drawShadow(ctx, player.x, groundY, player.w * 1.5);

  let key = playerSpriteKey(player, 'Idle');
  let rotation = 0;
  let bob = 0;

  switch (player.state) {
    case 'attackHold':
      key = playerSpriteKey(player, 'Attack') || key;
      break;
    case 'heavyCharge': {
      // 溜めの段階ごとに絵そのものを変える
      const poses = ['Attack', 'Charge2', 'Charge3'];
      key = playerSpriteKey(player, poses[player.chargeLevel]) || playerSpriteKey(player, 'Attack') || key;
      bob = Math.sin(player.frame * 0.9) * (0.6 + player.chargeLevel * 0.8);
      break;
    }
    case 'heal':
      // 専用の絵は無いので、身をかがめるガードの絵を流用する
      key = playerSpriteKey(player, 'Guard') || key;
      break;
    case 'lightAttack':
    case 'heavyAttack': {
      // 振りかぶり中は溜めの絵、判定が出てからは振り下ろしの絵にする
      const t = player.timings[player.state];
      const windingUp = player.frame < t.startup;
      key = (windingUp ? playerSpriteKey(player, 'Attack') : playerSpriteKey(player, 'Swing'))
        || playerSpriteKey(player, 'Attack') || key;
      break;
    }
    case 'roll': {
      const t = player.timings.roll;
      const total = t.startup + t.active + t.recovery;
      key = playerSpriteKey(player, 'Roll') || key;
      rotation = (player.frame / total) * Math.PI * 2 * player.facing;
      break;
    }
    case 'stagger':
      key = playerSpriteKey(player, 'Idle') || key;
      rotation = 0.3 * -player.facing;
      break;
    case 'walk':
      key = playerSpriteKey(player, 'Run') || key;
      bob = Math.abs(Math.sin(player.frame * 0.35)) * 5;
      break;
    case 'jump':
      key = playerSpriteKey(player, 'Run') || key;
      break;
    case 'idle':
      bob = Math.sin(player.frame * 0.08) * 2;
      break;
    default:
      break;
  }

  // パリィ直後は受け止めの絵にする
  if (player.parryFlash > 0) {
    key = playerSpriteKey(player, 'Guard') || key;
    rotation = 0;
  }

  // 溜めのオーラは本体より先に敷く
  if (player.isCharging) drawChargeAura(ctx, player, baseHeight);

  const img = key ? images[key] : null;
  if (!img) {
    const hurtbox = player.getHurtbox();
    ctx.fillStyle = player.state === 'hurt' ? '#e74c3c' : player.char.accent;
    ctx.fillRect(hurtbox.x, hurtbox.y, hurtbox.w, hurtbox.h);
    return;
  }
  const refKey = playerSpriteKey(player, 'Idle');
  const height = relativeHeight(baseHeight, refKey, key);

  let filter = null;
  let alpha = 1;
  if (player.parryFlash > 0) {
    filter = 'brightness(2.4) saturate(0.4)';
  } else if (player.state === 'hurt' || player.isStaggered) {
    filter = 'brightness(1.6) sepia(1) saturate(6) hue-rotate(-35deg)';
  } else if (player.isInvulnerable) {
    // 無敵中は点滅させて分かるようにする
    alpha = player.frame % 8 < 4 ? 0.45 : 0.9;
  } else if (player.isCharging && player.chargeLevel > 0) {
    filter = `brightness(${1 + player.chargeLevel * 0.18})`;
  }

  drawSprite(ctx, img, key, {
    x: player.x,
    bottomY: player.y - bob,
    height,
    facing: player.facing,
    rotation,
    alpha,
    filter,
  });

  if (player.isStaggered) drawStaggerStars(ctx, player.x, player.y - baseHeight * 1.05, player.frame);
}

// 溜め段階が上がるほど濃く大きくなるオーラ
function drawChargeAura(ctx, player, height) {
  const info = player.chargeInfo();
  const color = info.level.color;
  const cy = player.y - height * 0.5;
  const radius = 34 + info.index * 16 + Math.sin(player.frame * 0.3) * 3;

  ctx.save();
  ctx.globalAlpha = 0.22 + info.index * 0.14;
  const g = ctx.createRadialGradient(player.x, cy, 4, player.x, cy, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(player.x, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // 現在の段階を輪の数で示す
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i <= info.index; i++) {
    ctx.beginPath();
    ctx.arc(player.x, cy, 26 + i * 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 次の段階までの進み具合
  if (info.index < CHARGE_LEVELS.length - 1) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, cy, 26 + (info.index + 1) * 13, -Math.PI / 2, -Math.PI / 2 + info.progress * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
