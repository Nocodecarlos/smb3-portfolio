import Phaser from 'phaser';
import type { Hero } from '../game/state';
import { asset } from '../assets';

// Felt characters that walk are paper-doll puppets: a top piece (head,
// torso, arms) and one leg piece used twice, swung at the hip so the feet
// step. Art faces right; pieces live in public/felt/hero-*.png.

export type Puppet = 'turtle';

/** Hip on the top piece and pivot on the leg piece, in image pixels. */
/** `legScale` squashes the leg piece: the turtle walks on short, stubby legs like its sprite. */
const RIG: Record<Puppet, { hip: [number, number]; pivot: number; legH: number; legScale: number }> = {
  turtle: { hip: [40.4, 119.8], pivot: 16.5, legH: 71, legScale: 0.5 },
};

/**
 * The heroes are the Figma chibis cut into a body and two lower legs that
 * swing from `back` / `front` pivots; all pieces share the sprite's canvas,
 * so they line up as drawn. `side` is the plain walk (sprite/player-0,
 * sprite/playerF-0); with the feather the hero walks in `cape`
 * (sprite/player-*-powerup-walking) and flies in `fly`
 * (sprite/player-*-powerup-flying). `anchor` is the body's centre line.
 */
interface Pose {
  size: [number, number];
  back: [number, number];
  front: [number, number];
  anchor?: number;
}
const CHIBI: Record<Hero, { side: Pose; cape: Pose; fly: { size: [number, number]; center: [number, number] } }> = {
  hat: {
    side: { size: [145, 204], back: [47, 160], front: [82.5, 160] },
    cape: { size: [226, 215], back: [129, 152], front: [153, 152], anchor: 141 },
    fly: { size: [229, 199], center: [134.9, 104] },
  },
  helmet: {
    side: { size: [112, 229], back: [36.5, 200], front: [83.5, 200] },
    cape: { size: [225, 226], back: [139, 166], front: [172, 166], anchor: 155.5 },
    fly: { size: [240, 221], center: [142.4, 105.2] },
  },
};

export function preloadHeroes(scene: Phaser.Scene) {
  const keys = [
    ...Object.keys(RIG).flatMap((n) => [`hero-${n}-top`, `hero-${n}-leg`]),
    ...Object.keys(CHIBI).flatMap((h) => [
      ...['side', 'cape'].flatMap((skin) => ['top', 'back', 'front'].map((part) => `hero-${h}-${skin}-${part}`)),
      `hero-${h}-cape-fly`,
      `hero-${h}-front`,
      // seen from behind, reading a billboard (Figma: Hero motion, sprite/player-*-back)
      `hero-${h}-back`,
    ]),
  ];
  for (const key of keys) if (!scene.textures.exists(key)) scene.load.image(key, asset(`felt/${key}.png`));
}

/** Front-facing hero for the overworld (Figma: sprite/player-*-overworld-0). */
export const heroFront = (hero: Hero) => `hero-${hero}-front`;

/**
 * A walking hero's pieces. Each leg (a shin and shoe) hangs in a `hip` joint above it, inside the body, with a
 * `thigh` in the jeans' colour joining the two: swung from the hip the foot travels and the leg stays attached.
 * The thighs only show on a lively hero; the plain walk turns the shins about their own tops, as it always has.
 */
type Walker = {
  group: Phaser.GameObjects.Container;
  top: Phaser.GameObjects.Image;
  /** The body in its jump pose (the plain walker only), shown in place of `top` while a lively hero is in the air. */
  jump?: Phaser.GameObjects.Image;
  back: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  hipBack: Phaser.GameObjects.Container;
  hipFront: Phaser.GameObjects.Container;
  thighs: Phaser.GameObjects.Graphics[];
  h: number;
};
/**
 * The jump pose (a lively hero in the air): the front arm thrown up, fist to the sky, the other arm left tucked
 * back by the body. It's made from the side view's body, in its own pixels: the front `hand` is lifted out and
 * the gap `mend`ed with shirt from beside it ([from x, to x]), then a sleeve runs from the `shoulder` up to the
 * `fist`, where the hand goes back on, turned `turn` degrees.
 */
const JUMP: Record<Hero, { hand: [number, number, number, number]; clear: [number, number, number, number]; mend: [number, number, number]; shoulder: [number, number]; fist: [number, number]; turn: number; sleeve: number; cloth: [number, number] }> = {
  hat: { hand: [98, 122, 27, 29], clear: [96, 112, 31, 41], mend: [40, 90, 14], shoulder: [99, 122], fist: [139, 68], turn: -100, sleeve: 20, cloth: [48, 128] },
  // her hand rests on her sweater, among the hat's straps: it's covered with knit where it was (no `mend` strip)
  helmet: { hand: [47, 160, 15, 20], clear: [47, 160, 15, 20], mend: [0, 0, 0], shoulder: [84, 136], fist: [121, 98], turn: -95, sleeve: 14, cloth: [64, 128] },
};

/**
 * The back view (reading a billboard), made from the front-facing art, which is the same shape from behind. In
 * the `head` box ([x, y, w, h]) every skin-coloured pixel becomes hair, and so does everything inside the `face`
 * oval ([centre x, centre y, radius x, radius y]: eyes, mouth and their soft edges), in the colour found at
 * `hair`, shaded in soft strands; the ears, outside `ears` ([left x, right x]), stay. On the
 * `chest` (a box), anything white (a pocket) becomes shirt, in the colour found at `shirt`.
 */
const BACK: Record<Hero, { head: [number, number, number, number]; face: [number, number, number, number]; ears: [number, number]; hair: [number, number]; chest?: [number, number, number, number]; shirt?: [number, number] }> = {
  hat: { head: [30, 72, 140, 112], face: [100, 124, 58, 42], ears: [38, 162], hair: [14, 94], chest: [104, 194, 48, 46], shirt: [70, 210] },
  helmet: { head: [40, 92, 124, 110], face: [105, 146, 52, 44], ears: [0, 999], hair: [26, 100] },
};

/** Paint a hero's back view once; returns its texture key. */
function backPose(scene: Phaser.Scene, hero: Hero) {
  const key = `hero-${hero}-back`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(`hero-${hero}-front`).getSourceImage() as HTMLImageElement;
  const b = BACK[hero];
  const tex = scene.textures.createCanvas(key, src.width, src.height)!;
  const ctx = tex.getContext();
  ctx.drawImage(src, 0, 0);
  /** The average colour of a small patch. */
  const colour = (x: number, y: number) => {
    const d = ctx.getImageData(x, y, 8, 8).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c];
    return sum.map((v) => v / (d.length / 4));
  };
  const hair = colour(...b.hair);
  const [hx, hy, hw, hh] = b.head;
  const head = ctx.getImageData(hx, hy, hw, hh);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const i = (y * hw + x) * 4;
      const [r, g, bl, a] = [head.data[i], head.data[i + 1], head.data[i + 2], head.data[i + 3]];
      if (a < 40) continue;
      const skin = r > 185 && g > 125 && bl > 85 && r - bl > 30 && r - bl < 130;
      const ear = hx + x < b.ears[0] || hx + x > b.ears[1];
      const inFace = ((hx + x - b.face[0]) / b.face[2]) ** 2 + ((hy + y - b.face[1]) / b.face[3]) ** 2 < 1;
      if (!inFace && (!skin || ear)) continue;
      // strands: a little lighter and darker across, like combed yarn
      const k = 1 + 0.13 * Math.sin((hx + x) * 0.9) + 0.06 * Math.sin((hy + y) * 0.35 + x * 0.2);
      for (let c = 0; c < 3; c++) head.data[i + c] = Math.min(255, hair[c] * k);
    }
  }
  ctx.putImageData(head, hx, hy);
  if (b.chest && b.shirt) {
    const shirt = colour(...b.shirt);
    const [cx, cy, cw, ch] = b.chest;
    const chest = ctx.getImageData(cx, cy, cw, ch);
    for (let i = 0; i < chest.data.length; i += 4) {
      const [r, g, bl] = [chest.data[i], chest.data[i + 1], chest.data[i + 2]];
      if (chest.data[i + 3] > 40 && r > 200 && g > 190 && bl > 170) for (let c = 0; c < 3; c++) chest.data[i + c] = shirt[c];
    }
    ctx.putImageData(chest, cx, cy);
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** Extra canvas to the right of the body for the raised arm, in art px. */
const JUMP_ROOM = 24;

/** Paint a hero's jump pose once; returns its texture key. */
function jumpPose(scene: Phaser.Scene, hero: Hero) {
  const key = `hero-${hero}-side-jump`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(`hero-${hero}-side-top`).getSourceImage() as HTMLImageElement;
  const j = JUMP[hero];
  // wider than the body's canvas on the right: the raised fist reaches out past the face
  const tex = scene.textures.createCanvas(key, src.width + JUMP_ROOM, src.height)!;
  const ctx = tex.getContext();
  ctx.drawImage(src, 0, 0);
  // a swatch of the shirt, to cut the sleeve from the same felt
  const swatch = document.createElement('canvas');
  swatch.width = swatch.height = 18;
  swatch.getContext('2d')!.drawImage(src, j.cloth[0], j.cloth[1], 18, 18, 0, 0, 18, 18);
  const cloth = ctx.createPattern(swatch, 'repeat')!;
  // lift the arm out and mend the body where it hung
  const [cx, cy, cw, ch] = j.clear;
  if (j.mend[2]) {
    ctx.clearRect(cx, cy, cw, ch);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(j.mend[1] - 12, cy - 12, j.mend[2] + 12, ch + 12, 12);
    ctx.clip();
    ctx.drawImage(src, j.mend[0], cy, j.mend[2], ch, j.mend[1], cy, j.mend[2], ch);
    ctx.restore();
  } else {
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.ellipse(cx + cw / 2, cy + ch / 2, cw / 2 + 1, ch / 2 + 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the sleeve, a touch darker along its edge so it reads against the shirt
  ctx.lineCap = 'round';
  const arm = (width: number, style: string | CanvasPattern) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(...j.shoulder);
    ctx.lineTo(j.fist[0] - (j.fist[0] - j.shoulder[0]) * 0.25, j.fist[1] - (j.fist[1] - j.shoulder[1]) * 0.25);
    ctx.stroke();
  };
  arm(j.sleeve + 4, 'rgba(120, 52, 8, 0.55)');
  arm(j.sleeve, cloth);
  // the hand, back on at the end of it, turned to point up
  const [hx, hy, hw, hh] = j.hand;
  ctx.save();
  ctx.translate(...j.fist);
  ctx.rotate(Phaser.Math.DegToRad(j.turn));
  // only the round of the hand, not the corners of its box
  ctx.beginPath();
  ctx.ellipse(0, 0, hw / 2, hh / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(src, hx, hy, hw, hh, -hw / 2, -hh / 2, hw, hh);
  ctx.restore();
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** The jeans, for the thighs. */
const JEANS: Record<Hero, number> = { hat: 0x3b70a0, helmet: 0x475f86 };
/** How far above a shin's top its hip joint sits, as a share of the hero's height. */
const HIP = 0.13;
/** The walk's stages, as the front leg's swing from the hip in degrees (the back leg mirrors it): out in front, halfway, together, halfway back, out behind, and back again. */
const STAGES = [-1, -0.5, 0, 0.5, 1, 0.5, 0, -0.5];
const SWING = 27;

/** A chibi hero whose lower legs swing while walking; with a power-up it wears a cape and flies. */
export class ChibiRig {
  readonly root: Phaser.GameObjects.Container;
  private hero!: Hero;
  private plain!: Walker;
  private cape!: Walker;
  private fly!: Phaser.GameObjects.Image;
  /** The hero seen from behind, shown while reading a billboard (when the front art is loaded). */
  private back?: Phaser.GameObjects.Image;
  private turned = false;
  private powered = false;
  private phase = 0;
  private time = 0;
  /**
   * The polish test (World 1-1): the hero moves like a soft toy. Turning flips like a paper cut-out, running
   * leans in with a longer, quicker stride, jumps stretch and landings squash, and standing still breathes.
   */
  lively = false;
  /** Which way the cut-out is turned, -1..1 (it passes through 0, edge on, as it flips). */
  private face = 1;
  private faceTo = 1;
  /** Squash and stretch: + is taller and thinner. A spring pulls it back to 0. */
  private squash = 0;
  private squashV = 0;
  private wasAir = false;
  private lastVy = 0;
  private tilt = 0;
  private lean = 0;
  /** How far into a crouch, 0..1. */
  private duck = 0;

  /** `height` is from the feet to the top of the hat, in scene units. */
  constructor(private scene: Phaser.Scene, hero: Hero, private height: number) {
    this.root = scene.add.container(0, 0);
    this.setHero(hero);
  }

  setHero(hero: Hero) {
    if (hero === this.hero) return;
    this.hero = hero;
    this.root.removeAll(true);
    const tex = (key: string) => {
      this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      return this.scene.add.image(0, 0, key);
    };
    // canvas (u, v) sits at (u - anchor, v - h): feet on the container's origin
    const walker = (skin: 'side' | 'cape'): Walker => {
      const r = CHIBI[hero][skin];
      const [w, h] = r.size;
      const ax = r.anchor ?? w / 2;
      const drop = HIP * h;
      const girth = (hero === 'hat' ? 0.085 : 0.075) * w;
      const thighs: Phaser.GameObjects.Graphics[] = [];
      const leg = (part: 'back' | 'front') => {
        const [px, py] = r[part];
        const shin = tex(`hero-${hero}-${skin}-${part}`).setOrigin(px / w, py / h).setPosition(0, drop);
        // the back leg's thigh is a shade darker, like the shin behind it
        const thigh = this.scene.add.graphics().setVisible(this.lively);
        thigh.fillStyle(JEANS[hero]).fillRoundedRect(-girth, -girth, girth * 2, drop + girth + 4, girth);
        if (part === 'back') thigh.fillStyle(0x000000, 0.14).fillRoundedRect(-girth, -girth, girth * 2, drop + girth + 4, girth);
        thighs.push(thigh);
        return { shin, hip: this.scene.add.container(px - ax, py - drop - h, [thigh, shin]) };
      };
      const b = leg('back');
      const f = leg('front');
      const top = tex(`hero-${hero}-${skin}-top`).setOrigin(0, 0).setPosition(-ax, -h);
      const jump = skin === 'side' ? this.scene.add.image(-ax, -h, jumpPose(this.scene, hero)).setOrigin(0, 0).setVisible(false) : undefined;
      const group = this.scene.add.container(0, 0, jump ? [b.hip, f.hip, top, jump] : [b.hip, f.hip, top]).setScale(this.height / h);
      return { group, top, jump, back: b.shin, front: f.shin, hipBack: b.hip, hipFront: f.hip, thighs, h };
    };
    this.plain = walker('side');
    this.cape = walker('cape');
    const f = CHIBI[hero].fly;
    this.fly = tex(`hero-${hero}-cape-fly`)
      .setOrigin(f.center[0] / f.size[0], f.center[1] / f.size[1])
      .setScale(this.height / CHIBI[hero].cape.size[1]);
    this.root.add([this.plain.group, this.cape.group, this.fly]);
    if (this.scene.textures.exists(`hero-${hero}-front`)) {
      this.back = this.scene.add.image(0, 0, backPose(this.scene, hero)).setOrigin(0.5, 1).setVisible(false);
      this.back.setScale(this.height / this.back.height);
      this.root.add(this.back);
    }
    this.turned = false;
    this.show(false);
  }

  /** With the feather the hero wears the cape. */
  setPowered(on: boolean) {
    this.powered = on;
  }

  setFacing(left: boolean) {
    this.faceTo = left ? -1 : 1;
    // lively heroes flip over a few frames (in animate); the first facing, before any frame, is just set
    if (!this.lively || this.time === 0) {
      this.face = this.faceTo;
      this.root.scaleX = this.face;
    }
  }

  /** Turn the lively motion on or off (see `lively`): the thighs that join the legs to the body show with it. */
  setLively(on: boolean) {
    this.lively = on;
    for (const w of [this.plain, this.cape]) for (const t of w.thighs) t.setVisible(on);
  }

  /** Lean the whole hero (degrees, clockwise), easing toward it: sliding down a slope, the body follows the snow. */
  setTilt(angle: number, dt: number) {
    this.tilt += (angle - this.tilt) * Math.min(1, dt * 14);
    this.root.angle = this.tilt + this.lean;
  }

  /** The lively extras, each frame: the paper flip, the squash spring, the lean into a run. `vy` is the fall speed in px/s. */
  private liven(dt: number, speed: number, inAir: boolean, vy: number, crouch: boolean) {
    // paper flip: about a tenth of a second from one side to the other
    this.face += (this.faceTo - this.face) * Math.min(1, dt * 24);
    if (Math.abs(this.faceTo - this.face) < 0.02) this.face = this.faceTo;
    // takeoff stretches, landing squashes by how hard you came down
    if (inAir && !this.wasAir && vy < 0) this.squashV = 3.2;
    if (!inAir && this.wasAir) this.squashV = -2.2 - 3.5 * Math.min(1, Math.abs(this.lastVy) / 320);
    this.wasAir = inAir;
    this.lastVy = vy;
    const step = Math.min(dt, 1 / 30);
    this.squashV += (-380 * this.squash - 20 * this.squashV) * step;
    this.squash = Phaser.Math.Clamp(this.squash + this.squashV * step, -0.3, 0.3);
    // a little longer while moving fast through the air, and a slow breath standing still
    const air = inAir ? 0.05 * Math.min(1, Math.abs(vy) / 300) : 0;
    const breath = !inAir && speed < 0.02 ? 0.014 * Math.sin(this.time * 2.4) : 0;
    // ducking presses the whole toy down a little
    this.duck += ((crouch ? 1 : 0) - this.duck) * Math.min(1, dt * 20);
    const tall = (1 + this.squash + air + breath) * (1 - 0.13 * this.duck);
    this.root.setScale(this.face * (1 - 0.6 * (this.squash + air)) * (1 + 0.07 * this.duck), tall);
    // lean into a run, and a touch with the fall
    const want = inAir ? this.faceTo * Phaser.Math.Clamp(vy / 60, -4, 5) : crouch ? this.faceTo * 5 : this.faceTo * 7 * Math.min(1.3, speed);
    this.lean += (want - this.lean) * Math.min(1, dt * 10);
    this.root.angle = this.tilt + this.lean;
  }

  private show(inAir: boolean) {
    const flying = this.powered && inAir;
    this.plain.group.setVisible(!this.turned && !this.powered);
    this.cape.group.setVisible(!this.turned && this.powered && !inAir);
    this.fly.setVisible(!this.turned && flying);
    this.back?.setVisible(this.turned);
  }

  /**
   * Turn to face what's behind the course (a billboard), or back again: the cut-out flips edge on, and comes
   * round showing its other side. Resolves when the turn is done.
   */
  turn(away: boolean) {
    if (!this.back || away === this.turned) return Promise.resolve();
    const side = Math.sign(this.root.scaleX) || 1;
    return new Promise<void>((done) => {
      this.scene.tweens.add({
        targets: this.root,
        scaleX: 0,
        duration: 110,
        ease: 'Sine.easeIn',
        onComplete: () => {
          this.turned = away;
          this.show(false);
          this.scene.tweens.add({ targets: this.root, scaleX: away ? 1 : side, duration: 130, ease: 'Sine.easeOut', onComplete: () => done() });
        },
      });
    });
  }

  /**
   * Legs swing while walking (faster when running), kick out in the air and
   * rest in the drawn stride. Powered up: the caped walk on the ground, the
   * flying pose in the air.
   */
  animate(dt: number, speed: number, inAir: boolean, vy = 0, crouch = false) {
    this.time += dt;
    this.show(inAir);
    if (this.lively) this.liven(dt, speed, inAir, vy, crouch);
    // a plain hero just presses down
    else this.root.scaleY += ((crouch ? 0.84 : 1) - this.root.scaleY) * Math.min(1, dt * 20);
    if (this.powered && inAir) {
      // a little drift up and down while flying
      this.fly.y = -this.height * 0.5 + Math.sin(this.time * 6) * 0.6;
      return;
    }
    const w = this.powered ? this.cape : this.plain;
    // the shins' own turn (the plain walk), and the legs' swing from the hip (the lively walk)
    let front = 0;
    let back = 0;
    let hip = 0;
    let bob = 0;
    /** The knees' bend (crouching): thighs forward, shins folded back under. */
    let knees = 0;
    if (crouch && !inAir) {
      knees = 1;
      bob = w.h * 0.075;
      this.phase = 0;
    } else if (inAir && this.lively) {
      // going up the front knee comes up, coming down the legs reach for the ground
      hip = vy < 0 ? -1.1 : 0.35;
    } else if (inAir) {
      front = -14;
      back = 12;
    } else if (speed > 0.02 && this.lively) {
      // five stages, there and back: front leg out and back leg behind, halfway, legs together, halfway the
      // other way, back leg out and front leg behind. A stage lasts about a tenth of a second walking, less running.
      this.phase += dt * (9 + 7 * Math.min(1.3, speed));
      hip = STAGES[Math.floor(this.phase) % STAGES.length];
      // the body rides highest as the legs pass each other
      bob = -(1 - Math.abs(hip)) * w.h * 0.025;
    } else if (speed > 0.02) {
      this.phase += dt * (8 + 10 * speed);
      const s = Math.sin(this.phase);
      front = s * 16;
      back = -s * 16;
      bob = -Math.abs(s) * 2.5;
    } else {
      this.phase = 0;
    }
    const ease = Math.min(1, dt * 18);
    w.front.angle += (front + knees * 58 - w.front.angle) * ease;
    w.back.angle += (back + knees * 50 - w.back.angle) * ease;
    // each stage is a pose: the legs get there in a frame or two, then hold
    const snap = Math.min(1, dt * 40);
    const bend = this.lively ? knees : 0;
    w.hipFront.angle += (hip * SWING - bend * 46 - w.hipFront.angle) * snap;
    w.hipBack.angle += (-hip * SWING - bend * 34 - w.hipBack.angle) * snap;
    w.top.y = -w.h + bob;
    // in the air a lively hero throws an arm up
    const leap = this.lively && inAir && !!w.jump;
    w.top.setVisible(!leap);
    w.jump?.setVisible(leap).setY(w.top.y);
  }
}

export class HeroRig {
  readonly root: Phaser.GameObjects.Container;
  private top!: Phaser.GameObjects.Image;
  private front!: Phaser.GameObjects.Image;
  private back!: Phaser.GameObjects.Image;
  private who?: Puppet;
  /** The polish test: turns flip like a paper cut-out, and the walk has a little sway. */
  lively = false;
  private face = 1;
  private faceTo = 1;
  private time = 0;
  private scale = 1;
  private phase = 0;
  private legH = 91;

  /** `height` is the puppet's height from feet to the top of the head, in scene units. */
  constructor(private scene: Phaser.Scene, who: Puppet, private height: number) {
    this.root = scene.add.container(0, 0);
    this.setHero(who);
  }

  setHero(who: Puppet) {
    if (who === this.who) return;
    this.who = who;
    this.root.removeAll(true);
    const r = RIG[who];
    this.legH = r.legH * r.legScale;
    this.scale = this.height / (r.hip[1] + this.legH);
    for (const part of ['top', 'leg']) this.scene.textures.get(`hero-${who}-${part}`).setFilter(Phaser.Textures.FilterMode.LINEAR);
    const leg = (tint: number) => {
      const img = this.scene.add.image(0, -this.legH, `hero-${who}-leg`).setScale(1, r.legScale);
      return img.setOrigin(r.pivot / img.width, 0).setTint(tint);
    };
    this.back = leg(0xbdbdbd);
    this.back.x = -2.5;
    this.front = leg(0xffffff);
    this.top = this.scene.add.image(0, -this.legH + 3, `hero-${who}-top`);
    this.top.setOrigin(r.hip[0] / this.top.width, r.hip[1] / this.top.height);
    this.root.add([this.back, this.front, this.top]);
    this.root.setScale(this.scale);
  }

  setFacing(left: boolean) {
    this.faceTo = left ? -1 : 1;
    if (!this.lively) this.root.scaleX = this.faceTo * this.scale;
  }

  /**
   * Legs swing while walking (faster when running), spread in the air and
   * settle when standing. `speed` is 0..1 of top running speed.
   */
  animate(dt: number, speed: number, inAir: boolean) {
    if (this.lively) {
      this.time += dt;
      this.face += (this.faceTo - this.face) * Math.min(1, dt * 14);
      this.root.scaleX = this.face * this.scale;
      this.root.angle = inAir ? 0 : Math.sin(this.time * 7) * 3.5;
    }
    let front = 0;
    let back = 0;
    let bob = 0;
    if (inAir) {
      front = -28;
      back = 20;
    } else if (speed > 0.02) {
      this.phase += dt * (7 + 9 * speed);
      const s = Math.sin(this.phase);
      front = -s * 30;
      back = s * 30;
      bob = -Math.abs(s) * 3;
    } else {
      this.phase = 0;
    }
    const ease = Math.min(1, dt * 18);
    this.front.angle += (front - this.front.angle) * ease;
    this.back.angle += (back - this.back.angle) * ease;
    this.top.y = -this.legH + 3 + bob;
  }
}
