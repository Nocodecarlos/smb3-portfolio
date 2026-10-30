import Phaser from 'phaser';

// Sloped ground for arcade physics, which only knows boxes. Each piece of
// ground is its top edge (game px, left to right); after every physics step
// bodies are set on the surface under their centre, walk up and down slopes,
// and stop at cliffs and the sides of gaps.

/** Highest step a foot climbs on its own (a 45° slope rises half a body width). */
const STEP = 9;
/** How far into the ground a falling body can sink in one step and still land. */
const SINK = 16;
/** How far a body that was standing follows the ground down (walking downhill). */
const STICK = 8;

type Body = Phaser.Physics.Arcade.Body;

export class Terrain {
  private standing = new WeakSet<Body>();

  constructor(private pieces: [number, number][][]) {}

  /** Top of the ground at x, or undefined over a gap. On a cliff the higher side wins. */
  surface(x: number): number | undefined {
    let best: number | undefined;
    for (const top of this.pieces) {
      if (x < top[0][0] || x > top[top.length - 1][0]) continue;
      for (let i = 0; i < top.length - 1; i++) {
        const [x0, y0] = top[i];
        const [x1, y1] = top[i + 1];
        if (x1 <= x0 || x < x0 || x > x1) continue;
        const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
        if (best === undefined || y < best) best = y;
      }
    }
    return best;
  }

  /** Land, stand and walk on the ground; walls block like a solid. Call after each physics step. */
  collide(b: Body) {
    if (!b.enable) return;
    const dx = b.position.x - b.prev.x;
    if (dx !== 0) {
      const foot = this.surface(dx > 0 ? b.right : b.left);
      if (foot !== undefined && foot < b.bottom - STEP) {
        b.position.x = b.prev.x;
        b.velocity.x = 0;
        b.blocked.none = false;
        if (dx > 0) b.blocked.right = true;
        else b.blocked.left = true;
      }
    }
    const s = this.surface(b.position.x + b.halfWidth);
    const sink = s === undefined ? -Infinity : b.bottom - s;
    const wasStanding = this.standing.has(b);
    if (s !== undefined && b.velocity.y >= 0 && sink <= SINK && (sink >= 0 || (wasStanding && sink >= -STICK))) {
      b.position.y = s - b.height;
      b.velocity.y = 0;
      b.blocked.none = false;
      b.blocked.down = true;
      this.standing.add(b);
    } else if (!b.blocked.down) this.standing.delete(b);
    b.updateCenter();
  }
}
