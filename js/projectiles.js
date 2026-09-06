// 弓の矢とボスの飛び道具。owner で相手を判定する。
export class Projectile {
  constructor(spec) {
    Object.assign(this, {
      vy: 0, gravity: 0, pierce: 0, unblockable: false, life: 150,
    }, spec);
    this.age = 0;
    this.hitCount = 0;
    this.dead = false;
    this.expired = false;
  }

  update() {
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.age++;
    if (this.age >= this.life) {
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
