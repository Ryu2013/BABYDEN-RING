// 弓の矢とボスの飛び道具。owner で相手を判定する。
export class Projectile {
  constructor(spec) {
    Object.assign(this, {
      vy: 0, gravity: 0, pierce: 0, unblockable: false, life: 150, spawnDelay: 0,
    }, spec);
    this.age = 0;
    this.hitCount = 0;
    this.dead = false;
    this.expired = false;
  }

  // 出現待ちのあいだは動かず、当たりもしない（矢の雨を少しずつ落とすため）
  get pending() {
    return this.age < this.spawnDelay;
  }

  update() {
    this.age++;
    if (this.pending) return;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    if (this.age >= this.life + this.spawnDelay) {
      this.dead = true;
      this.expired = true;
    }
  }

  registerHit() {
    this.hitCount++;
    if (this.hitCount > this.pierce) this.dead = true;
  }

  getBox() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }
}
