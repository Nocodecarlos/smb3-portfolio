import Phaser from 'phaser';
import { bushTexture, drawPlatform } from '../art/course';
import { getWorld, getWorlds } from '../content/store';
import type { World } from '../content/types';
import { StatusBar } from '../game/hud';
import { Player, createControls, type Controls } from '../game/Player';
import { sfx } from '../game/sfx';
import { BAR, HEIGHT, markCleared, progress, saveProgress, ui } from '../game/state';
import { px } from '../game/text';
import { showEndCard } from '../ui/overlays';

// A hand-built course loaded from content/levels/*.json (World 1-1 is
// imported from the Figma reference). Content beats get attached to its
// blocks in a later pass; for now it's the look and feel.

export interface CourseLevel {
  id: string;
  width: number;
  height: number;
  groundRow: number;
  sky: string;
  spawn: [number, number];
  goal: number;
  ground: [number, number][];
  platforms: { x: number; y: number; w: number; h: number; color: string }[];
  blocks: [string, number, number][];
  notes: [number, number][];
  pickups: [string, number, number][];
  coins: [number, number][];
  pipes: { x: number; y: number; h: number; plant?: boolean; hanging?: boolean; warp?: string }[];
  enemies: [string, number, number][];
  scenery: {
    clouds: [number, number, number][];
    bushes: [number, number, number, number][];
    shrubs: [number, number][];
    glints: [number, number, number][];
  };
  room: { id: string; pipe: number; tiles: string[]; coins: [number, number][] };
}

const levels = import.meta.glob<CourseLevel>('../../content/levels/*.json', { eager: true, import: 'default' });
export function getLevel(id: string): CourseLevel | undefined {
  return Object.values(levels).find((l) => l.id === id);
}

const T = 16;
type Kind = 'q' | 'item' | 'brick' | 'note' | 'pswitch';
interface Block {
  sprite: Phaser.GameObjects.Sprite;
  kind: Kind;
  used?: boolean;
}
interface Plant {
  sprite: Phaser.GameObjects.Sprite;
  top: number;
  cx: number;
}

export class CourseScene extends Phaser.Scene {
  private world!: World;
  private level!: CourseLevel;
  private worldIndex = 0;
  private player!: Player;
  private controls!: Controls;
  private hud!: StatusBar;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private semis!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private blocks = new Map<Phaser.GameObjects.GameObject, Block>();
  private plants: Plant[] = [];
  private feathers: Phaser.GameObjects.Sprite[] = [];
  private warp!: { x0: number; x1: number; top: number };
  private goal!: Phaser.GameObjects.Image;
  private heads: Block[] = [];
  private feet: Block[] = [];
  private lastBump = 0;
  private busy = false;
  private finished = false;
  private inRoom = false;
  private safe = { x: 0, y: 0 };
  private W = 0;
  private H = 0;
  private RX = 0;

  constructor() {
    super('Course');
  }

  init(data: { slug: string }) {
    this.world = getWorld(data.slug)!;
    this.level = getLevel(this.world.level!)!;
    this.worldIndex = Math.max(0, getWorlds().findIndex((w) => w.slug === data.slug));
    this.blocks = new Map();
    this.plants = [];
    this.feathers = [];
    this.heads = [];
    this.feet = [];
    this.busy = this.finished = this.inRoom = false;
  }

  create() {
    const L = this.level;
    this.controls = createControls(this);
    this.W = L.width * T;
    this.H = L.height * T;
    this.RX = this.W + 8 * T;
    const G = L.groundRow * T;
    this.cameras.main.setBackgroundColor(L.sky);

    this.solids = this.physics.add.staticGroup();
    this.semis = this.physics.add.staticGroup();
    this.coins = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();

    const solidRect = (x: number, y: number, w: number, h: number) => {
      const r = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
      this.solids.add(r);
      return r;
    };

    // ---- Scenery ----
    for (const [x, y, s] of L.scenery.glints) {
      const g = this.add.image(x, y, 'glint').setDepth(-10).setScale(s / 5).setAlpha(0.8);
      this.tweens.add({ targets: g, alpha: 0.2, yoyo: true, repeat: -1, duration: 900 + ((x * 7) % 900), delay: (y * 13) % 1200 });
    }
    for (const [x, y, w] of L.scenery.clouds) this.add.image(x, y, w > 50 ? 'cloud-l' : w > 40 ? 'cloud-m' : 'cloud-s').setOrigin(0).setDepth(-8);
    for (const [x, y, w, h] of L.scenery.bushes) this.add.image(x, y, bushTexture(this, w, h)).setOrigin(0).setDepth(-6);
    for (const [x, y] of L.scenery.shrubs) this.add.image(x * T, y * T, 'shrub').setOrigin(0).setDepth(-6);

    // ---- Platforms: drawn back to front, tops are jump-through ----
    const g = this.add.graphics().setDepth(-4);
    for (const p of L.platforms) {
      const x = p.x * T;
      const y = p.y * T;
      const w = p.w * T;
      const h = p.h * T;
      drawPlatform(g, x, y, w, h, Phaser.Display.Color.HexStringToColor(p.color).color);
      const top = this.add.rectangle(x + w / 2, y + 3, w, 6).setVisible(false);
      this.semis.add(top);
      const b = top.body as Phaser.Physics.Arcade.StaticBody;
      b.checkCollision.down = b.checkCollision.left = b.checkCollision.right = false;
    }

    // ---- Ground ----
    for (const [x, w] of L.ground) {
      this.add.tileSprite(x * T, G, w * T, T, 'soil-top').setOrigin(0).setDepth(3);
      this.add.tileSprite(x * T, G + T, w * T, this.H - G - T, 'soil').setOrigin(0).setDepth(3);
      solidRect(x * T, G, w * T, this.H - G);
    }
    solidRect(this.W, 0, 8, this.H); // end wall

    // ---- Pipes ----
    for (const p of L.pipes) {
      const x = p.x * T;
      const top = p.y * T;
      const h = p.h * T;
      for (let r = 0; r < p.h; r++) {
        const capRow = p.hanging ? p.h - 1 : 0;
        this.add.image(x + 16, top + r * T + 8, r === capRow ? 'pipe2-top' : 'pipe2-body').setDepth(2).setFlipY(!!p.hanging && r === capRow);
      }
      solidRect(x, top, 32, h);
      if (p.plant) {
        const s = this.add.sprite(x + 16, top, 'snapper-0').setOrigin(0.5, 0).setDepth(1);
        s.play('snap');
        this.plants.push({ sprite: s, top, cx: x + 16 });
      }
      if (p.warp) this.warp = { x0: x, x1: x + 32, top };
    }
    for (const pl of this.plants) this.cyclePlant(pl);

    // ---- Blocks ----
    const block = (kind: Kind, tx: number, ty: number, key: string, ox = 0, oy = 0) => {
      const s = this.add.sprite(ox + tx * T + 8, oy + ty * T + 8, key).setDepth(3);
      this.solids.add(s);
      this.blocks.set(s, { sprite: s, kind });
      return s;
    };
    for (const [k, x, y] of L.blocks) {
      if (k === 'q') block('q', x, y, 'q2-0').play('q2');
      else if (k === 'item') block('item', x, y, 'wood');
      else if (k === 'brick') block('brick', x, y, 'brick2');
      else if (k === 'pswitch') block('pswitch', x, y, 'pswitch');
    }
    for (const [x, y] of L.notes) block('note', x, y, 'note');

    // ---- Coins & pickups ----
    for (const [x, y] of L.coins) this.coins.add(this.add.image(x * T + 8, y * T + 8, 'coin').setDepth(4));
    for (const [, x, y] of L.pickups) this.spawnFeather(x * T + 8, y * T + 8, false);

    // ---- Enemies ----
    for (const [k, x, y] of L.enemies) {
      const walker = k === 'walker';
      const e = this.enemies.create(x * T + 8, (y + 1) * T - (walker ? 10 : 8), walker ? 'hiker-0' : 'bug-0') as Phaser.Physics.Arcade.Sprite;
      e.play(walker ? 'hiker-walk' : 'bug-walk').setDepth(6);
      (e.body as Phaser.Physics.Arcade.Body).setSize(12, walker ? 18 : 12).setOffset(2, walker ? 2 : 4);
      e.setVelocityX(-24);
      e.setData('walker', walker);
    }

    // ---- Goal: black end zone with the spinning card box ----
    const gx = L.goal * T;
    this.add.rectangle(gx - 6 * T, 0, this.W - (gx - 6 * T), this.H, 0x000000).setOrigin(0).setDepth(-9);
    this.goal = this.add.image(gx, G - 5 * T, `icon-${this.world.card}`).setDepth(5);
    this.add.graphics().setDepth(4).lineStyle(2, 0xffffff).strokeRect(gx - 14, G - 5 * T - 14, 28, 28);

    this.buildRoom();

    // ---- Player ----
    const [sx, sy] = L.spawn;
    this.player = new Player(this, sx * T + 8, sy * T, this.controls);
    this.safe = { x: this.player.x, y: this.player.y };
    this.physics.world.setBounds(0, -64, this.RX + 32 * T, this.H + 128);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.player.setCollideWorldBounds(true);

    this.physics.add.collider(this.player, this.solids, (_p, o) => this.touchSolid(o as Phaser.GameObjects.GameObject));
    this.physics.add.collider(this.player, this.semis);
    this.physics.add.collider(this.enemies, this.solids);
    this.physics.add.collider(this.enemies, this.semis);
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.touchEnemy(e as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.coins, (_p, c) => this.collect(c as Phaser.GameObjects.Image));

    this.useMainCamera();
    this.hud = new StatusBar(this, `WORLD ${this.worldIndex + 1}-1`, this.world.title.toUpperCase().slice(0, 26));
    this.input.keyboard!.on('keydown-ESC', () => !ui.blocking && this.exitToMap());
    this.cameras.main.fadeIn(250);
  }

  // ---------- Areas ----------

  private buildRoom() {
    const R = this.level.room;
    const w = R.tiles[0].length * T;
    const h = R.tiles.length * T;
    this.add.rectangle(this.RX, 0, w, Math.max(h, HEIGHT), 0x000000).setOrigin(0).setDepth(-9);
    R.tiles.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (row[tx] !== '#') continue;
        const s = this.add.image(this.RX + tx * T + 8, ty * T + 8, 'diamond').setDepth(3);
        this.solids.add(s);
      }
    });
    // The entry pipe hangs from the ceiling; the way out is up the stairs and off the right edge.
    this.solids.add(this.add.image(this.RX + R.pipe * T + 16, 16, 'pipe-dark').setDepth(3));
    for (const [x, y] of R.coins) this.coins.add(this.add.image(this.RX + x * T + 8, y * T + 8, 'coin').setDepth(4));
  }

  private useMainCamera() {
    const cam = this.cameras.main;
    cam.setBackgroundColor(this.level.sky);
    cam.setBounds(0, 0, this.W, this.H + BAR);
    cam.startFollow(this.player, true, 0.15, 0.12);
    cam.setDeadzone(24, 80);
    cam.setRoundPixels(true);
  }

  private useRoomCamera() {
    const R = this.level.room;
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setBounds(this.RX, 0, R.tiles[0].length * T, Math.max(R.tiles.length * T + BAR, HEIGHT));
  }

  private async enterRoom() {
    this.busy = true;
    sfx.pipe();
    const p = this.player;
    p.body.enable = false;
    p.setX((this.warp.x0 + this.warp.x1) / 2);
    await this.tweenTo(p, { y: p.y + 24 }, 500);
    this.cameras.main.fadeOut(150);
    await new Promise((r) => this.cameras.main.once('camerafadeoutcomplete', r));
    this.inRoom = true;
    this.useRoomCamera();
    p.setPosition(this.RX + this.level.room.pipe * T + 16, 40);
    p.body.reset(p.x, p.y);
    p.body.enable = true;
    this.cameras.main.fadeIn(150);
    this.busy = false;
  }

  private async exitRoom() {
    this.busy = true;
    sfx.pipe();
    const p = this.player;
    p.body.enable = false;
    this.cameras.main.fadeOut(150);
    await new Promise((r) => this.cameras.main.once('camerafadeoutcomplete', r));
    this.inRoom = false;
    p.setPosition((this.warp.x0 + this.warp.x1) / 2, this.warp.top + 8);
    this.useMainCamera();
    this.cameras.main.fadeIn(150);
    await this.tweenTo(p, { y: this.warp.top - 10 }, 400);
    p.body.reset(p.x, p.y);
    p.body.enable = true;
    this.busy = false;
  }

  private tweenTo(target: object, props: Record<string, number>, duration: number) {
    return new Promise<void>((resolve) => this.tweens.add({ targets: target, ...props, duration, onComplete: () => resolve() }));
  }

  // ---------- Loop ----------

  update() {
    if (this.busy) return;
    const p = this.player;
    p.update();
    this.hud.setMeter(Math.round(p.pMeter * 6));

    if (this.heads.length && this.time.now - this.lastBump > 200) {
      this.lastBump = this.time.now;
      const b = this.heads.reduce((a, c) => (Math.abs(c.sprite.x - p.x) < Math.abs(a.sprite.x - p.x) ? c : a));
      this.bumpFromBelow(b);
    }
    this.heads = [];
    for (const b of this.feet) this.landOn(b);
    this.feet = [];

    // Secret pipe
    if (!this.inRoom && p.downPressed && p.x > this.warp.x0 + 4 && p.x < this.warp.x1 - 4 && Math.abs(p.body.bottom - this.warp.top) < 3) {
      void this.enterRoom();
      return;
    }

    if (this.inRoom && p.x > this.RX + this.level.room.tiles[0].length * T - 4) {
      void this.exitRoom();
      return;
    }

    // Pits
    if (p.body.blocked.down && !this.inRoom) this.safe = { x: p.x, y: p.y };
    if (p.y > this.H + 24) {
      sfx.hurt();
      p.setPosition(this.safe.x - 12, this.safe.y - 24);
      p.setVelocity(0, 0);
      p.hurt(p.x + 1);
    }

    this.updateEnemies();
    this.updateFeathers();
    for (const pl of this.plants) {
      if (pl.sprite.y < pl.top - 4 && Phaser.Geom.Intersects.RectangleToRectangle(p.getBounds(), new Phaser.Geom.Rectangle(pl.cx - 6, pl.sprite.y + 2, 12, pl.top - pl.sprite.y))) {
        p.hurt(pl.cx);
      }
    }

    if (!this.finished) {
      if (Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y) < 18) void this.finish();
      else this.goal.setTexture(`icon-${['star', 'heart', 'pencil', 'seed'][Math.floor(this.time.now / 140) % 4]}`);
    }
  }

  private updateEnemies() {
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!e.active || e.getData('dead')) continue;
      const b = e.body as Phaser.Physics.Arcade.Body;
      let dir = Math.sign(b.velocity.x) || -1;
      if (b.blocked.left) dir = 1;
      else if (b.blocked.right) dir = -1;
      else if (b.blocked.down) {
        // turn around at ledges so walkers patrol their platform
        const ahead = this.physics.overlapRect(e.x + dir * 9, b.bottom + 2, 2, 2, false, true);
        if (!ahead.length) dir = -dir;
      }
      e.setVelocityX(dir * 24);
      e.setFlipX(dir > 0);
    }
  }

  // ---------- Collisions ----------

  private touchSolid(o: Phaser.GameObjects.GameObject) {
    const b = this.blocks.get(o);
    if (!b) return;
    const pb = this.player.body;
    if (pb.touching.up || pb.blocked.up) this.heads.push(b);
    else if ((pb.touching.down || pb.blocked.down) && b.sprite.y > this.player.y) this.feet.push(b);
  }

  private bumpFromBelow(b: Block) {
    const s = b.sprite;
    sfx.bump();
    if (b.kind !== 'pswitch') this.tweens.add({ targets: s, y: s.y - 5, duration: 70, yoyo: true });
    if (b.used) return;
    if (b.kind === 'q') {
      b.used = true;
      s.stop().setTexture('empty');
      this.popCoin(s.x, s.y - 12);
    } else if (b.kind === 'item') {
      b.used = true;
      s.setTexture('empty');
      if (this.player.powered) this.popCoin(s.x, s.y - 12);
      else this.spawnFeather(s.x, s.y - 8, true);
    }
  }

  private landOn(b: Block) {
    const s = b.sprite;
    if (b.kind === 'note') {
      this.player.spring(300, 470);
      sfx.select();
      this.tweens.add({ targets: s, y: s.y + 4, duration: 60, yoyo: true });
    } else if (b.kind === 'pswitch' && !b.used) {
      b.used = true;
      s.setTexture('pswitch-flat');
      (s.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.pressSwitch();
    }
  }

  /** Bricks turn into coins for a few seconds. */
  private pressSwitch() {
    sfx.secret();
    this.cameras.main.shake(200, 0.004);
    const swapped: [Block, Phaser.GameObjects.Image][] = [];
    for (const b of this.blocks.values()) {
      if (b.kind !== 'brick' || !b.sprite.active) continue;
      b.sprite.setVisible(false);
      (b.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      const c = this.add.image(b.sprite.x, b.sprite.y, 'coin').setDepth(4);
      this.coins.add(c);
      swapped.push([b, c]);
    }
    this.time.delayedCall(8000, () => {
      for (const [b, c] of swapped) {
        if (!c.active) continue;
        c.destroy();
        b.sprite.setVisible(true);
        (b.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = true;
      }
    });
  }

  private touchEnemy(e: Phaser.Physics.Arcade.Sprite) {
    if (e.getData('dead') || this.busy) return;
    const pb = this.player.body;
    const eb = e.body as Phaser.Physics.Arcade.Body;
    if (pb.velocity.y > 0 && pb.bottom - eb.top < 10) {
      e.setData('dead', true);
      e.anims.stop();
      e.setTexture(e.getData('walker') ? 'hiker-flat' : 'bug-flat');
      eb.enable = false;
      sfx.stomp();
      this.player.bounce();
      this.time.delayedCall(500, () => e.destroy());
    } else this.player.hurt(e.x);
  }

  private collect(c: Phaser.GameObjects.Image) {
    c.destroy();
    sfx.coin();
    this.addCoins(1);
  }

  private popCoin(x: number, y: number) {
    sfx.coin();
    this.addCoins(1);
    const c = this.add.image(x, y, 'coin').setDepth(8);
    this.tweens.add({ targets: c, y: y - 32, duration: 260, yoyo: true, onComplete: () => c.destroy() });
  }

  private addCoins(n: number) {
    progress.coins += n;
    saveProgress();
    this.hud.setCoins(progress.coins);
  }

  // ---------- Feather power-up ----------

  private spawnFeather(x: number, y: number, rising: boolean) {
    const f = this.add.sprite(x, y, 'feather').setDepth(7);
    f.setData('x0', x).setData('t0', this.time.now).setData('drift', rising);
    if (rising) this.tweens.add({ targets: f, y: y - 24, duration: 300 });
    else this.tweens.add({ targets: f, y: y - 3, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
    this.feathers.push(f);
  }

  private updateFeathers() {
    const p = this.player;
    for (const f of this.feathers) {
      if (!f.active) continue;
      if (f.getData('drift')) {
        const t = (this.time.now - f.getData('t0')) / 1000;
        if (t > 0.35) {
          f.x = f.getData('x0') + Math.sin(t * 3) * 18;
          f.y += 0.5;
          f.setFlipX(Math.cos(t * 3) < 0);
        }
        if (f.y > this.H) f.destroy();
      }
      if (f.active && Phaser.Math.Distance.Between(p.x, p.y, f.x, f.y) < 14) {
        f.destroy();
        p.powered = true;
        sfx.clear();
        const t = px(this, p.x, p.y - 20, 'FEATHER! RUN + JUMP TO FLY', { size: 6, shadow: true }).setOrigin(0.5).setDepth(20);
        this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, delay: 1200, duration: 800, onComplete: () => t.destroy() });
      }
    }
  }

  // ---------- Plants ----------

  private cyclePlant(pl: Plant) {
    const s = pl.sprite;
    const wait = (ms: number) => this.time.delayedCall(ms, () => this.cyclePlant(pl));
    // Stay in the pipe while the player is right next to it.
    if (this.player?.active && Math.abs(this.player.x - pl.cx) < 28) return wait(700);
    this.tweens.add({
      targets: s,
      y: pl.top - 20,
      duration: 500,
      delay: 1400,
      hold: 1300,
      yoyo: true,
      onComplete: () => this.cyclePlant(pl),
    });
  }

  // ---------- End ----------

  private async finish() {
    this.finished = true;
    this.goal.setTexture(`icon-${this.world.card}`);
    this.tweens.add({ targets: this.goal, y: this.goal.y - 40, duration: 600, ease: 'Quad.easeOut' });
    markCleared(this.world.slug);
    this.busy = true;
    this.physics.pause();
    await showEndCard(this.world, this.textures.getBase64(`icon-${this.world.card}`));
    this.exitToMap();
  }

  private exitToMap() {
    this.busy = true;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Overworld'));
  }

  get slug() {
    return this.world.slug;
  }
}
