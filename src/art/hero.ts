import Phaser from 'phaser';
import type { Hero } from '../game/state';

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
  const base = import.meta.env.BASE_URL;
  const keys = [
    ...Object.keys(RIG).flatMap((n) => [`hero-${n}-top`, `hero-${n}-leg`]),
    ...Object.keys(CHIBI).flatMap((h) => [
      ...['side', 'cape'].flatMap((skin) => ['top', 'back', 'front'].map((part) => `hero-${h}-${skin}-${part}`)),
      `hero-${h}-cape-fly`,
      `hero-${h}-front`,
    ]),
  ];
  for (const key of keys) if (!scene.textures.exists(key)) scene.load.image(key, `${base}felt/${key}.png`);
}

/** Front-facing hero for the overworld (Figma: sprite/player-*-overworld-0). */
export const heroFront = (hero: Hero) => `hero-${hero}-front`;

type Walker = { group: Phaser.GameObjects.Container; top: Phaser.GameObjects.Image; back: Phaser.GameObjects.Image; front: Phaser.GameObjects.Image; h: number };

/** A chibi hero whose lower legs swing while walking; with a power-up it wears a cape and flies. */
export class ChibiRig {
  readonly root: Phaser.GameObjects.Container;
  private hero!: Hero;
  private plain!: Walker;
  private cape!: Walker;
  private fly!: Phaser.GameObjects.Image;
  private powered = false;
  private phase = 0;
  private time = 0;

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
      const leg = (part: 'back' | 'front') => {
        const [px, py] = r[part];
        return tex(`hero-${hero}-${skin}-${part}`).setOrigin(px / w, py / h).setPosition(px - ax, py - h);
      };
      const back = leg('back');
      const front = leg('front');
      const top = tex(`hero-${hero}-${skin}-top`).setOrigin(0, 0).setPosition(-ax, -h);
      const group = this.scene.add.container(0, 0, [back, front, top]).setScale(this.height / h);
      return { group, top, back, front, h };
    };
    this.plain = walker('side');
    this.cape = walker('cape');
    const f = CHIBI[hero].fly;
    this.fly = tex(`hero-${hero}-cape-fly`)
      .setOrigin(f.center[0] / f.size[0], f.center[1] / f.size[1])
      .setScale(this.height / CHIBI[hero].cape.size[1]);
    this.root.add([this.plain.group, this.cape.group, this.fly]);
    this.show(false);
  }

  /** With the feather the hero wears the cape. */
  setPowered(on: boolean) {
    this.powered = on;
  }

  setFacing(left: boolean) {
    this.root.scaleX = left ? -1 : 1;
  }

  private show(inAir: boolean) {
    const flying = this.powered && inAir;
    this.plain.group.setVisible(!this.powered);
    this.cape.group.setVisible(this.powered && !inAir);
    this.fly.setVisible(flying);
  }

  /**
   * Legs swing while walking (faster when running), kick out in the air and
   * rest in the drawn stride. Powered up: the caped walk on the ground, the
   * flying pose in the air.
   */
  animate(dt: number, speed: number, inAir: boolean) {
    this.time += dt;
    this.show(inAir);
    if (this.powered && inAir) {
      // a little drift up and down while flying
      this.fly.y = -this.height * 0.5 + Math.sin(this.time * 6) * 0.6;
      return;
    }
    const w = this.powered ? this.cape : this.plain;
    let front = 0;
    let back = 0;
    let bob = 0;
    if (inAir) {
      front = -14;
      back = 12;
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
    w.front.angle += (front - w.front.angle) * ease;
    w.back.angle += (back - w.back.angle) * ease;
    w.top.y = -w.h + bob;
  }
}

export class HeroRig {
  readonly root: Phaser.GameObjects.Container;
  private top!: Phaser.GameObjects.Image;
  private front!: Phaser.GameObjects.Image;
  private back!: Phaser.GameObjects.Image;
  private who?: Puppet;
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
    this.root.scaleX = left ? -this.scale : this.scale;
  }

  /**
   * Legs swing while walking (faster when running), spread in the air and
   * settle when standing. `speed` is 0..1 of top running speed.
   */
  animate(dt: number, speed: number, inAir: boolean) {
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
