// 攻撃・被弾・パリィなどの視覚効果。renderer.js が kind ごとに描き分ける。
const rand = (a, b) => a + Math.random() * (b - a);

export class Effects {
  constructor() {
    this.items = [];
    this.shake = 0;
  }

  _add(item) {
    this.items.push({ age: 0, ...item });
  }

  spark(x, y, color, count, power = 6) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(power * 0.35, power);
      this._add({
        kind: 'spark', x, y, color,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.4,
        life: Math.round(rand(14, 26)), size: rand(2, 4.5),
      });
    }
  }

  ring(x, y, color, radius, life = 16, width = 5) {
    this._add({ kind: 'ring', x, y, color, radius, life, width });
  }

  text(x, y, label, color) {
    this._add({ kind: 'text', x, y, label, color, life: 42 });
  }

  slash(x, y, facing, color, size) {
    this._add({ kind: 'slash', x, y, facing, color, size, life: 12 });
  }

  // --- 名前つきの演出 ---

  hit(x, y, power = 1) {
    this.spark(x, y, '#fff3c4', Math.round(8 + 6 * power), 5 + 3 * power);
    this.spark(x, y, '#ff9d4a', Math.round(5 + 4 * power), 4 + 3 * power);
    this.ring(x, y, 'rgba(255,220,150,0.9)', 10 + 8 * power, 13, 4);
    this.shake = Math.max(this.shake, 3 * power);
  }

  playerSwing(x, y, facing, level) {
    const colors = ['rgba(230,246,255,0.9)', 'rgba(255,190,90,0.95)', 'rgba(255,90,70,0.95)'];
    this.slash(x, y, facing, colors[level] || colors[0], 58 + level * 26);
    if (level > 0) this.spark(x, y, colors[level], 6 + level * 6, 5 + level * 2);
  }

  charging(x, y, level, color) {
    // 溜め中は毎フレーム少しずつ火の粉が集まる
    const a = rand(0, Math.PI * 2);
    const r = 42 + level * 12;
    this._add({
      kind: 'gather', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.7,
      tx: x, ty: y, color, life: 16, size: rand(2, 3.4 + level),
    });
  }

  chargeStep(x, y, level, color) {
    this.ring(x, y, color, 26 + level * 14, 18, 4);
    this.spark(x, y, color, 8 + level * 4, 5);
  }

  parry(x, y) {
    this.ring(x, y, 'rgba(255,255,255,0.95)', 16, 20, 7);
    this.ring(x, y, 'rgba(160,220,255,0.9)', 30, 26, 4);
    this.spark(x, y, '#ffffff', 18, 9);
    this.spark(x, y, '#9fe4ff', 12, 7);
    this.text(x, y - 40, 'パリィ！', '#bfe9ff');
    this.shake = Math.max(this.shake, 7);
  }

  guardHit(x, y) {
    this.spark(x, y, '#c8d4e4', 7, 4);
    this.ring(x, y, 'rgba(180,200,230,0.7)', 14, 12, 3);
  }

  stagger(x, y, label) {
    this.ring(x, y, 'rgba(255,240,160,0.95)', 26, 30, 6);
    this.spark(x, y, '#ffe680', 22, 8);
    this.text(x, y - 60, label, '#ffe680');
    this.shake = Math.max(this.shake, 9);
  }

  evolve(x, y) {
    this.ring(x, y, 'rgba(255,80,60,0.95)', 30, 46, 8);
    this.ring(x, y, 'rgba(255,190,90,0.8)', 60, 52, 5);
    this.spark(x, y, '#ff6a4a', 40, 12);
    this.text(x, y - 90, '第二形態', '#ff7a5a');
    this.shake = Math.max(this.shake, 14);
  }

  update() {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.8);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age++;
      if (it.kind === 'spark') {
        it.vy += 0.35;
        it.vx *= 0.96;
        it.x += it.vx;
        it.y += it.vy;
      } else if (it.kind === 'gather') {
        it.x += (it.tx - it.x) * 0.18;
        it.y += (it.ty - it.y) * 0.18;
      } else if (it.kind === 'text') {
        it.y -= 0.7;
      }
      if (it.age >= it.life) this.items.splice(i, 1);
    }
  }

  clear() {
    this.items.length = 0;
    this.shake = 0;
  }
}
