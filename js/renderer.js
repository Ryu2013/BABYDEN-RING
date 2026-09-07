import { images } from './assets.js';
import { CHARGE_LEVELS } from './entities/player.js';

const DEBUG_HITBOX = new URLSearchParams(location.search).has('debug');

// 床全体に届く技の予告。ジャンプでしか避けられない技なので、
// 発動前に床そのものを赤く光らせて知らせる
function drawFloorWarning(ctx, boss, worldW, logicalH, groundY) {
  const pattern = boss.currentPattern;
  if (!pattern || !pattern.steps.some((st) => st.floorWarning)) return;

  let intensity;
  if (boss.phase === 'windup') intensity = 0.14 + 0.5 * boss.getTelegraphProgress();
  else if (boss.phase === 'gap') intensity = 0.5;
  else if (boss.phase === 'active') intensity = 0.95;
  else return;

  const pulse = 0.85 + 0.15 * Math.sin(boss.frame * 0.35);
  const a = intensity * pulse;
  const top = groundY - 64;

  ctx.save();
  const g = ctx.createLinearGradient(0, top, 0, logicalH);
  g.addColorStop(0, `rgba(220,40,30,0)`);
  g.addColorStop(0.45, `rgba(230,50,35,${a * 0.55})`);
  g.addColorStop(1, `rgba(255,90,50,${a * 0.9})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, worldW || 1920, logicalH - top);

  // 地面のラインを走らせて「床全体」だと分かるようにする
  ctx.strokeStyle = `rgba(255,150,90,${a})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, groundY + 2);
  ctx.lineTo(worldW || 1920, groundY + 2);
  ctx.stroke();
  ctx.restore();
}

// 闘技場の端。ここから先へは行けないことを柱で示す
function drawArenaEdges(ctx, worldW, logicalH, groundY) {
  if (!worldW) return;
  ctx.save();
  for (const [x, dir] of [[0, 1], [worldW, -1]]) {
    const g = ctx.createLinearGradient(x, 0, x + dir * 90, 0);
    g.addColorStop(0, 'rgba(4,5,9,0.85)');
    g.addColorStop(1, 'rgba(4,5,9,0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x, x + dir * 90), 0, 90, logicalH);
  }
  ctx.strokeStyle = 'rgba(200,163,73,0.16)';
  ctx.lineWidth = 2;
  for (const x of [8, worldW - 8]) {
    ctx.beginPath();
    ctx.moveTo(x, groundY - 200);
    ctx.lineTo(x, groundY + 8);
    ctx.stroke();
  }
  ctx.restore();
}

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

export function render(ctx, { screen, player, boss, projectiles, effects, logicalW, logicalH, worldW, cameraX = 0, groundY }) {
  ctx.clearRect(0, 0, logicalW, logicalH);
  ctx.save();

  // 大きな一撃やパリィで画面を揺らす
  const shake = effects ? effects.shake : 0;
  if (shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  // 背景はカメラより遅く流して奥行きを出す。1枚では足りないので
  // 2枚並べ、継ぎ目が目立たないよう2枚目は左右反転する
  if (images.arena) {
    const bgX = -cameraX * 0.55;
    ctx.drawImage(images.arena, bgX, 0, logicalW, logicalH);
    ctx.save();
    ctx.translate(bgX + logicalW * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(images.arena, 0, 0, logicalW, logicalH);
    ctx.restore();
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

  // ここから先はワールド座標。カメラのぶんだけずらして描く
  ctx.translate(-cameraX, 0);
  drawArenaEdges(ctx, worldW, logicalH, groundY);
  drawFloorWarning(ctx, boss, worldW, logicalH, groundY);
  drawBoss(ctx, boss, groundY);
  drawPlayer(ctx, player, groundY);
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

// 矢を一本描く。原点を中心に +X 方向を向いた状態で描く
function drawArrow(ctx, len, accent) {
  const shaft = Math.max(2, len * 0.05);
  const head = len * 0.17;

  // 柄（木）
  const wood = ctx.createLinearGradient(0, -shaft, 0, shaft);
  wood.addColorStop(0, '#d8b183');
  wood.addColorStop(0.5, '#a8794a');
  wood.addColorStop(1, '#6f4b2a');
  ctx.fillStyle = wood;
  ctx.fillRect(-len / 2, -shaft / 2, len - head * 0.6, shaft);

  // 鏃（金属）
  const steel = ctx.createLinearGradient(0, -head * 0.5, 0, head * 0.5);
  steel.addColorStop(0, '#f2f6fb');
  steel.addColorStop(0.5, '#b9c6d6');
  steel.addColorStop(1, '#6d7c8e');
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.moveTo(len / 2, 0);
  ctx.lineTo(len / 2 - head, -head * 0.42);
  ctx.lineTo(len / 2 - head * 0.72, 0);
  ctx.lineTo(len / 2 - head, head * 0.42);
  ctx.closePath();
  ctx.fill();

  // 矢羽
  ctx.fillStyle = accent;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-len / 2 - len * 0.04, side * shaft * 0.4);
    ctx.lineTo(-len / 2 + len * 0.2, side * len * 0.12);
    ctx.lineTo(-len / 2 + len * 0.3, side * shaft * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  // 筈の巻き
  ctx.fillStyle = '#3b2a1c';
  ctx.fillRect(-len / 2 - len * 0.03, -shaft * 0.8, len * 0.05, shaft * 1.6);
}

// ガラガラ。玉と柄で「おもちゃ」に見せる
function drawRattle(ctx, p) {
  ctx.rotate(p.age * 0.22);
  const r = p.w / 2;
  ctx.fillStyle = '#6f4b2a';
  ctx.fillRect(-r * 0.16, 0, r * 0.32, r * 1.5);
  const ball = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.15, 0, 0, r);
  ball.addColorStop(0, '#fff4d2');
  ball.addColorStop(1, '#c99a4a');
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,80,30,0.55)';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawProjectile(ctx, p) {
  if (p.pending) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.kind === 'rain') {
    // 空から落ちてくる矢。真下を向く
    ctx.rotate(Math.PI / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    drawArrow(ctx, p.h, p.color || '#c0392b');
  } else if (p.owner === 'player') {
    ctx.rotate(p.vx < 0 ? Math.PI : 0);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5;
    drawArrow(ctx, p.w, p.color === '#eaf7ff' ? '#8fd6a0' : p.color);
  } else {
    drawRattle(ctx, p);
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
  // 息切れは一目で分かるよう専用の絵にする
  if (boss.isExhausted && images[`${base}_exhausted`]) return `${base}_exhausted`;
  if (boss.isTelegraphing()) {
    // 攻撃ごとに専用の構え絵があればそれを出す。読み合いの手がかりになる
    const specific = boss.windupSpriteKey();
    if (images[specific]) return specific;
    if (images[`${base}_windup`]) return `${base}_windup`;
  }
  if (boss.phase === 'active') {
    // 連撃は一撃ごとに絵が変わるので、振っている最中も同じ絵を保つ
    const special = boss.specialSpriteKey();
    if (special && images[special]) return special;
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
  } else if (boss.isExhausted) {
    // 息切れ中は色が抜けて、肩で息をするように上下する
    filter = 'brightness(0.8) saturate(0.35)';
    scale = 1 + Math.sin(boss.frame * 0.18) * 0.02;
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
  if (boss.isExhausted) drawBreath(ctx, boss.x, boss.y - height * 0.72, boss.facing, boss.frame);
  if (boss.formIndex > 0 && !boss.isStaggered) drawRage(ctx, boss, height);
}

// 息切れ中の吐息
function drawBreath(ctx, x, y, facing, frame) {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const t = ((frame * 0.02) + i * 0.33) % 1;
    ctx.globalAlpha = 0.35 * (1 - t);
    ctx.fillStyle = '#cfe0f0';
    ctx.beginPath();
    ctx.arc(x + facing * (24 + t * 46), y - t * 20, 4 + t * 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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
      key = playerSpriteKey(player, 'Heal') || key;
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
      rotation = (player.frame / total) * Math.PI * 2 * player.rollDir;
      break;
    }
    case 'hurt':
      key = playerSpriteKey(player, 'Hurt') || key;
      break;
    case 'stagger':
      key = playerSpriteKey(player, 'Stagger') || key;
      break;
    case 'dead':
      // 倒れる専用の絵は無いので、体勢を崩した絵を寝かせて使う
      key = playerSpriteKey(player, 'Stagger') || key;
      rotation = 1.15 * -player.facing;
      break;
    case 'walk':
      // 2枚の歩き絵を交互に出す
      key = playerSpriteKey(player, player.frame % 16 < 8 ? 'Run' : 'Run2') || key;
      bob = Math.abs(Math.sin(player.frame * 0.2)) * 2;
      break;
    case 'jump':
      key = playerSpriteKey(player, 'Jump') || key;
      break;
    case 'idle':
      bob = Math.sin(player.frame * 0.08) * 2;
      break;
    default:
      break;
  }

  // パリィ直後は受け止めの絵にする
  if (player.parryFlash > 0) {
    key = playerSpriteKey(player, 'Parry') || key;
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
  } else if (player.state === 'hurt') {
    filter = 'brightness(1.25) saturate(1.2)';
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
  if (info.index < player.maxChargeLevel) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, cy, 26 + (info.index + 1) * 13, -Math.PI / 2, -Math.PI / 2 + info.progress * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
