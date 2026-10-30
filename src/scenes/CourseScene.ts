import Phaser from 'phaser';
import { ART, FELT, PIPE_INSET, PIPE_RUN, SKY, Z, feltImage, feltOnGround, feltPlatform, feltPost, feltSprite, haze, preloadFelt, setupFelt } from '../art/felt';
import { HeroRig, preloadHeroes } from '../art/hero';
import { CAPY, preloadCapy, setupCapy } from '../art/capy';
import { drawKnit, preloadKnit } from '../art/knit';
import { getWorld, getWorlds } from '../content/store';
import type { World } from '../content/types';
import { CourseStory, STORY_TEXTURE } from '../game/courseStory';
import { FeltStatusBar } from '../game/feltHud';
import { Player, createControls, held, type Controls } from '../game/Player';
import { playMusic } from '../game/music';
import { sfx } from '../game/sfx';
import { BAR, HEIGHT, WIDTH, markCleared, progress, saveProgress, ui } from '../game/state';
import { Terrain } from '../game/terrain';
import { px } from '../game/text';
import { devBus } from '../ui/devBus';
import { setDevMode } from '../ui/devmode';
import { showEndCard } from '../ui/overlays';

// A hand-built course loaded from content/levels/*.json (World 1-1 is
// imported from the Figma reference). The world's beats are placed in it by
// CourseStory (captions, blocks, signs, chapter cards). Courses use the
// felt art (src/art/felt.ts) and render at Z times the base resolution.
// Holding S for two seconds on the tall white platform flips to the other side: the same
// course in black and white, where story blocks and billboards are editable
// in the dev panel (src/ui/devmode.ts).

export interface CourseLevel {
  id: string;
  width: number;
  height: number;
  groundRow: number;
  sky: string;
  spawn: [number, number];
  goal: number;
  /** Tile row of the goal card's centre, when it's set high (default: a hop off the ground). */
  goalRow?: number;
  /** A Capy slingshot on the ground, centred on this tile x: hold S on it to pull back, let go to fly straight up. */
  slingshot?: number;
  ground: [number, number][];
  /** Knit ground with slopes (in place of `ground`): each piece's top edge as [tile x, tiles above the ground row]. */
  terrain?: [number, number][][];
  platforms: { x: number; y: number; w: number; h: number; color: string }[];
  blocks: [string, number, number][];
  notes: [number, number][];
  pickups: [string, number, number][];
  coins: [number, number][];
  /**
   * Upright pipes are `h` tiles tall; sideways ones (`side` is where the mouth faces) are `w` tiles long and 2 tall.
   * `warp` drops into the room; `exit` ("room" or "sky") is where you come back out of that area (the warp pipe
   * when a room has none). A hanging exit pipe drops you out of its mouth.
   */
  pipes: { x: number; y: number; h?: number; w?: number; side?: 'left' | 'right'; capless?: boolean; plant?: boolean; hanging?: boolean; warp?: string; exit?: string }[];
  enemies: [string, number, number][];
  scenery: {
    clouds: [number, number, number][];
    bushes: [number, number, number, number][];
    shrubs: [number, number][];
    glints: [number, number, number][];
  };
  /**
   * The secret room: the entry pipe hangs from the ceiling at column `pipe` (row `pipeY`). With `exit`, the way
   * out is a sideways pipe in the left wall at that tile; without, it's off the right edge.
   */
  room?: { id: string; pipe: number; pipeY?: number; exit?: [number, number]; tiles: string[]; coins: [number, number][] };
  /**
   * A night sky above it all (World 1-3, in Launch the Capy's art), `width` x `height` tiles. A super note block
   * launches you up into it at column `entry`, through the cloud floor on row `floor`; the pipe at column `pipe`
   * takes you back down. `moon` is [x, y, size in px].
   */
  skySection?: { width: number; height: number; floor: number; entry: number; pipe: number; coins: [number, number][]; moon: [number, number, number] };
}

const levels = import.meta.glob<CourseLevel>('../../content/levels/*.json', { eager: true, import: 'default' });
export function getLevel(id: string): CourseLevel | undefined {
  return Object.values(levels).find((l) => l.id === id);
}

const T = 16;
/** How long S has to be held on the white platform to flip sides, in ms. */
const DOOR_HOLD = 2000;
/** `coin` is a brick hiding a coin: a shell can't break it, it bounces back. `wood` is a plain solid block (stairs). */
type Kind = 'q' | 'item' | 'brick' | 'coin' | 'wood' | 'note' | 'super' | 'pswitch' | 'story';
interface Block {
  sprite: Phaser.GameObjects.Sprite;
  kind: Kind;
  used?: boolean;
  /** A super note that hasn't been found: invisible, and only solid from below. */
  hidden?: boolean;
  /** Tile position, for beats placed behind blocks. */
  tx: number;
  ty: number;
}
/** A stomped turtle's shell: resting where it was stomped, or kicked and sliding. */
type Shell = 'still' | 'slide';
/** How fast a kicked shell slides, in px/s (the walkers stroll at 24). */
const SHELL_SPEED = 150;
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
  private hud!: FeltStatusBar;
  private story!: CourseStory;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private semis!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private blocks = new Map<Phaser.GameObjects.GameObject, Block>();
  private plants: Plant[] = [];
  private feathers: Phaser.GameObjects.Sprite[] = [];
  private warp?: { x0: number; x1: number; top: number };
  /** Where the room or the sky lets you out (the room's defaults to its warp pipe). */
  private exits: Partial<Record<'room' | 'sky', { x0: number; x1: number; top: number; bottom: number; hanging: boolean }>> = {};
  /** The sky section's pipe down. */
  private skyPipe?: { x0: number; x1: number; top: number };
  /** Left edge of the sky section, in world px (past the course and any room). */
  private SX = 0;
  private inSky = false;
  /** Shot up by a super note: the sky takes over once you leave the top of the screen. */
  private skyBound = false;
  /** The slingshot: where it stands, how far it's pulled back (0..1) and its prompt. */
  private sling?: { x: number; pull: number; band: Phaser.GameObjects.Graphics; hint: Phaser.GameObjects.Text; art: Phaser.GameObjects.Image };
  private terrain?: Terrain;
  /** The tall white platform: S on top flips to the secret editor world. */
  private door?: { x0: number; x1: number; top: number };
  /** How long S has been held on the door. */
  private doorHold = 0;
  /** Set after a flip until S is let go, so holding it doesn't flip straight back. */
  private doorLatch = false;
  private devLayer?: Phaser.GameObjects.Container;
  /** Where to put the player back after a live rebuild from the editor. */
  private resumeAt?: { x: number; y: number; powered: boolean };
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

  init(data: { slug: string; at?: { x: number; y: number; powered: boolean } }) {
    this.world = getWorld(data.slug)!;
    this.resumeAt = data.at;
    this.door = this.devLayer = undefined;
    this.doorHold = 0;
    this.doorLatch = false;
    this.level = getLevel(this.world.level!)!;
    this.worldIndex = Math.max(0, getWorlds().findIndex((w) => w.slug === data.slug));
    this.blocks = new Map();
    this.plants = [];
    this.feathers = [];
    this.heads = [];
    this.feet = [];
    this.busy = this.finished = this.inRoom = this.inSky = this.skyBound = false;
    this.exits = {};
    this.warp = this.skyPipe = this.sling = this.terrain = undefined;
  }

  preload() {
    preloadFelt(this);
    if (this.level.terrain) preloadKnit(this);
    if (this.level.skySection || this.level.slingshot !== undefined) preloadCapy(this);
    preloadHeroes(this);
    CourseStory.preload(this, this.world);
  }

  create() {
    const L = this.level;
    this.controls = createControls(this);
    this.W = L.width * T;
    this.H = L.height * T;
    this.RX = this.W + 8 * T;
    // the sky section sits past the course and any room, 8 tiles clear
    this.SX = (L.room ? this.RX + L.room.tiles[0].length * T : this.W) + 8 * T;
    const G = L.groundRow * T;

    // Felt needs more pixels than the pixel-art scenes: render this scene
    // at Z times the base size and zoom the camera to match.
    this.scale.resize(WIDTH * Z, HEIGHT * Z);
    this.cameras.main.setSize(WIDTH * Z, HEIGHT * Z).setZoom(Z);
    document.body.classList.add('felt');
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.followRigs);
    const offDev = devBus.on('dev', () => this.drawDevLayer());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.resize(WIDTH, HEIGHT);
      document.body.classList.remove('felt');
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.followRigs);
      offDev();
    });
    setupFelt(this);
    setupCapy(this);
    this.cameras.main.setBackgroundColor(L.sky);
    this.add.image(0, 0, SKY).setOrigin(0).setDisplaySize(this.W, this.H).setDepth(-20);

    this.solids = this.physics.add.staticGroup();
    this.semis = this.physics.add.staticGroup();
    this.coins = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();

    const solidRect = (x: number, y: number, w: number, h: number) => {
      const r = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
      this.solids.add(r);
      return r;
    };

    // Sloped knit ground (World 1-2): its pieces' top edges in game px
    const terrain = L.terrain?.map((top) => top.map(([x, h]) => [x * T, G - h * T] as [number, number]));
    if (terrain) this.terrain = new Terrain(terrain);
    /** Where things stand at x: the sky section's cloud floor, the slope there, or the flat ground row. */
    const sky = L.skySection;
    const groundAt = (x: number) => (sky && x >= this.SX ? sky.floor * T : (this.terrain?.surface(x) ?? G));

    // ---- Scenery ----
    for (const [x, y, s] of L.scenery.glints) {
      const g = feltImage(this, x, y, 'glint').setDepth(-10).setScale(s / 5 / ART).setAlpha(0.8);
      this.tweens.add({ targets: g, alpha: 0.2, yoyo: true, repeat: -1, duration: 900 + ((x * 7) % 900), delay: (y * 13) % 1200 });
    }
    // clouds and the big bushes are the far layer: hazed toward the sky so the course reads first
    for (const [x, y, w] of L.scenery.clouds) haze(feltImage(this, x, y, w > 50 ? 'cloud-l' : w > 40 ? 'cloud-m' : 'cloud-s').setOrigin(0).setDepth(-8), 0.45, 0.8);
    // Plants stand on the ground line (their felt art has empty rows underneath)
    // on knit ground the big bushes sink in a little, so their round bottoms sit behind its stitched edge
    const sink = terrain ? 3 : 0;
    for (const [x, , w, h] of L.scenery.bushes) haze(feltOnGround(this, x, groundAt(x + w / 2) + sink, `bush2-${w}x${h}`).setDepth(-6), 0.22, 0.85);
    for (const [x] of L.scenery.shrubs) feltOnGround(this, x * T, groundAt(x * T + 8), 'shrub').setDepth(-6);

    // ---- Platforms: drawn back to front, tops are jump-through ----
    for (const p of L.platforms) {
      const x = p.x * T;
      const y = p.y * T;
      const w = p.w * T;
      const h = p.h * T;
      feltPlatform(this, x, y, w, h, p.color);
      if (p.color.toLowerCase() === '#f4faf4' && !this.door) this.door = { x0: x, x1: x + w, top: y };
      const top = this.add.rectangle(x + w / 2, y + 3, w, 6).setVisible(false);
      this.semis.add(top);
      const b = top.body as Phaser.Physics.Arcade.StaticBody;
      b.checkCollision.down = b.checkCollision.left = b.checkCollision.right = false;
    }

    // ---- Ground ----
    for (const [x, w] of L.ground) {
      // felt soil tiles are separate rounded squares; the dark backing shows as the seams between them
      this.add.rectangle(x * T, G, w * T, this.H - G, 0x4e2e24).setOrigin(0).setDepth(3);
      // the Figma course fills both ground rows with the diagonal soil felt
      this.add.tileSprite(x * T, G, w * T, this.H - G, FELT, 'soil').setOrigin(0).setDepth(3).setTileScale(1 / ART);
      solidRect(x * T, G, w * T, this.H - G);
    }
    // the knit pieces are drawn in front of the pipes, so pipe feet tuck into the ground,
    // and run on under the status bar so no sky shows around its cards
    if (terrain) drawKnit(this, L.id, terrain, this.H + BAR, 3);
    solidRect(this.W, 0, 8, this.H); // end wall

    // ---- Pipes ----
    const cap = 14;
    for (const p of L.pipes) {
      const x = p.x * T;
      const top = p.y * T;
      if (p.side) {
        // Lying down: the knitted body runs along the pipe, the cap turned to face its mouth. It's
        // lowered so the body itself rests on what's below; the wider cap tucks behind the ground.
        const len = p.w! * T;
        const left = p.side === 'left';
        const bodyX = left ? x + cap - 4 : x;
        const mid = top + 16 + PIPE_INSET;
        this.add.tileSprite(bodyX + (len - cap + 4) / 2, mid, 32, len - cap + 4, FELT, PIPE_RUN).setDepth(2).setTileScale(1 / ART).setAngle(90);
        feltImage(this, left ? x + cap / 2 : x + len - cap / 2, mid, 'pipe2-top').setDisplaySize(32, cap).setAngle(left ? -90 : 90).setDepth(2);
        solidRect(x, top + 2 * PIPE_INSET, len, 32 - 2 * PIPE_INSET);
        continue;
      }
      const h = p.h! * T;
      // One knitted body (tiled down the pipe) under a 14px felt cap; hanging pipes cap their bottom end.
      const bodyY = p.hanging || p.capless ? top : top + cap - 4;
      this.add.tileSprite(x, bodyY, 32, h - (p.capless ? 0 : cap - 4), FELT, PIPE_RUN).setOrigin(0).setDepth(p.capless ? 1.9 : 2).setTileScale(1 / ART);
      if (!p.capless) feltImage(this, x, p.hanging ? top + h - cap : top, 'pipe2-top').setOrigin(0).setDisplaySize(32, cap).setDepth(2).setFlipY(!!p.hanging);
      solidRect(x, top, 32, h);
      if (p.plant) {
        const s = feltSprite(this, x + 16, top, 'snapper-0').setOrigin(0.5, 0).setDepth(1);
        s.play('felt-snap');
        this.plants.push({ sprite: s, top, cx: x + 16 });
      }
      if (p.warp) this.warp = { x0: x, x1: x + 32, top };
      if (p.exit === 'room' || p.exit === 'sky') this.exits[p.exit] = { x0: x, x1: x + 32, top, bottom: top + h, hanging: !!p.hanging };
    }
    for (const pl of this.plants) this.cyclePlant(pl);

    // ---- Status bar and story (story blocks replace level blocks on their tiles) ----
    this.hud = new FeltStatusBar(this, `WORLD ${this.levelNumber}`, this.world.title.toUpperCase().slice(0, 26));
    this.story = new CourseStory(this, this.world, this.hud);
    const storyCells = new Set(this.story.storyCells.map(([x, y]) => `${x},${y}`));

    // ---- Blocks ----
    const block = (kind: Kind, tx: number, ty: number, key: string, ox = 0, oy = 0) => {
      const s = (kind === 'story' ? this.add.sprite(0, 0, STORY_TEXTURE).setScale(T / 128) : feltSprite(this, 0, 0, key)).setPosition(ox + tx * T + 8, oy + ty * T + 8).setDepth(3);
      if (kind === 'story') this.textures.get(STORY_TEXTURE).setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.solids.add(s);
      this.blocks.set(s, { sprite: s, kind, tx, ty });
      return s;
    };
    for (const [x, y] of this.story.storyCells) block('story', x, y, STORY_TEXTURE);
    // only the first story block says READ; after that players know what the book blocks are
    const [first] = [...this.story.storyCells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (first) this.story.tagStoryBlock(...first);
    // story blocks stand alone: no bricks right next to them, so the book reads as the thing to hit
    const nearStory = (x: number, y: number) => this.story.storyCells.some(([sx, sy]) => Math.abs(sx - x) <= 1 && Math.abs(sy - y) <= 1);
    for (const [k, x, y] of L.blocks) {
      if (storyCells.has(`${x},${y}`) || (k === 'brick' && nearStory(x, y))) continue;
      if (k === 'q') block('q', x, y, 'q2-0');
      else if (k === 'item') block('item', x, y, 'wood');
      else if (k === 'brick') block('brick', x, y, 'brick2');
      else if (k === 'coin') block('coin', x, y, 'brick2');
      else if (k === 'wood') block('wood', x, y, 'wood');
      else if (k === 'pswitch') block('pswitch', x, y, 'pswitch');
      else if (k === 'super') {
        // a super note starts hidden: invisible, and only there for a head coming up from below
        const s = block('super', x, y, 'note').setVisible(false);
        const body = s.body as Phaser.Physics.Arcade.StaticBody;
        body.checkCollision.up = body.checkCollision.left = body.checkCollision.right = false;
        this.blocks.get(s)!.hidden = true;
      }
    }
    for (const [x, y] of L.notes) block('note', x, y, 'note');

    // ---- Coins & pickups ----
    for (const [x, y] of L.coins) this.coins.add(feltImage(this, x * T + 8, y * T + 8, 'coin').setDepth(4));
    for (const [, x, y] of L.pickups) this.spawnFeather(x * T + 8, y * T + 8, false);

    // ---- Enemies ----
    for (const [k, x, y] of L.enemies) {
      const walker = k === 'walker';
      const e = this.enemies.create(x * T + 8, (y + 1) * T - (walker ? 10 : 8), FELT, walker ? 'hiker-0' : 'bug-0') as Phaser.Physics.Arcade.Sprite;
      e.setScale(1 / ART).setDepth(6);
      // walkers are turtle puppets whose feet step; the plush bug waddles
      if (walker) {
        const rig = new HeroRig(this, 'turtle', 20);
        rig.root.setDepth(6);
        e.setVisible(false).setData('rig', rig);
      } else this.tweens.add({ targets: e, angle: { from: -6, to: 6 }, yoyo: true, repeat: -1, duration: 240, ease: 'Sine.easeInOut' });
      (e.body as Phaser.Physics.Arcade.Body).setSize(12 * ART, (walker ? 18 : 12) * ART).setOffset(2 * ART, (walker ? 2 : 4) * ART);
      e.setVelocityX(-24);
      e.setData('walker', walker);
    }

    // ---- Goal: black end zone with the spinning card box ----
    const gx = L.goal * T;
    this.add.rectangle(gx - 6 * T, 0, this.W - (gx - 6 * T), this.H, 0x000000).setOrigin(0).setDepth(-9);
    // low enough to reach with a hop from the ground, unless the level sets it high (World 1-3: up the slingshot)
    const goalY = L.goalRow !== undefined ? L.goalRow * T : G - 2.5 * T;
    this.goal = feltImage(this, gx, goalY, `icon-${this.world.card}`).setDepth(5);
    this.add.graphics().setDepth(4).lineStyle(2, 0xffffff).strokeRect(gx - 14, goalY - 14, 28, 28);
    if (L.slingshot !== undefined) this.buildSlingshot(L.slingshot * T, G);

    if (L.room) this.buildRoom();
    this.buildSky();

    // ---- Player ----
    const [sx, sy] = L.spawn;
    const at = this.resumeAt;
    this.player = new Player(this, at ? at.x : sx * T + 8, at ? at.y : sy * T, this.controls, progress.hero);
    this.player.powered = !!at?.powered;
    this.safe = { x: this.player.x, y: this.player.y };
    this.physics.world.setBounds(0, -64, Math.max(this.RX, this.SX) + 80 * T, this.H + 128);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.player.setCollideWorldBounds(true);

    this.physics.add.collider(this.player, this.solids, (_p, o) => this.touchSolid(o as Phaser.GameObjects.GameObject));
    this.physics.add.collider(this.player, this.semis);
    this.physics.add.collider(this.enemies, this.solids, undefined, (e, o) => this.shellHits(e as Phaser.Physics.Arcade.Sprite, o as Phaser.GameObjects.GameObject));
    this.physics.add.collider(this.enemies, this.semis);
    this.physics.add.overlap(this.enemies, this.enemies, (a, b) => this.shellMeets(a as Phaser.Physics.Arcade.Sprite, b as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.touchEnemy(e as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.coins, (_p, c) => this.collect(c as Phaser.GameObjects.Image));
    if (this.terrain) {
      const ground = this.terrain;
      const settle = () => {
        ground.collide(this.player.body);
        for (const e of this.enemies.getChildren()) ground.collide((e as Phaser.Physics.Arcade.Sprite).body as Phaser.Physics.Arcade.Body);
      };
      // the physics world is torn down with the scene, listeners and all
      this.physics.world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, settle);
    }

    this.useMainCamera();
    this.introSign(G);
    this.story.buildSigns(groundAt);
    this.input.keyboard!.on('keydown-ESC', () => !ui.blocking && this.exitToMap());
    this.drawDevLayer();
    // a rebuild from the editor picks up where the player was, without the intro
    if (at) this.story.resume(at.x);
    else this.cameras.main.fadeIn(250);
    playMusic(this, L.id === 'world-1-2' ? 'world-1-2' : 'world-1-1');
  }

  /** The world billboard at the start of the course (Figma: screen/gameplay · world 1 start). */
  private introSign(groundY: number) {
    const w = this.world;
    const x = 40;
    const y = this.H + BAR - HEIGHT + 4; // near the top of the first screen, clear of the story block below
    const sign = this.add.graphics().setDepth(-2);
    feltPost(this, x + 20, y + 92, 6, groundY - y - 92).setDepth(-2.1);
    feltPost(this, x + 150, y + 92, 6, groundY - y - 92).setDepth(-2.1);
    sign.fillStyle(0x000000).fillRect(x, y, 176, 96);
    sign.fillStyle(0xfcfcfc).fillRect(x + 2, y + 2, 172, 92);
    sign.fillStyle(0x000000).fillRect(x + 4, y + 4, 168, 88);
    sign.fillStyle(0xfce4a0).fillRect(x + 5, y + 5, 166, 86);
    // same type as the felt status bar: Luckiest Guy for the heading, Fredoka for the rest
    const left = x + 12;
    const width = 150;
    const text = (ty: number, s: string, font: 'heading' | 'body', size: number, color: string, lines = 1) =>
      this.add
        .text(left, ty, s, {
          fontFamily: font === 'heading' ? '"Luckiest Guy", sans-serif' : '"Fredoka", sans-serif',
          fontStyle: font === 'heading' ? '' : '600',
          fontSize: `${size}px`,
          color,
          lineSpacing: font === 'heading' ? -1 : 0,
          wordWrap: { width },
          maxLines: lines,
        })
        .setResolution(Z)
        .setDepth(-1);
    const world = text(y + 11, `WORLD ${this.levelNumber}`, 'heading', 10, '#d82800');
    const title = text(world.y + world.height, w.title.toUpperCase(), 'heading', 13, '#000000', 2);
    // platform and role sit on the bottom edge; the tagline gets whatever room is left between
    const role = text(y + 88, w.role, 'body', 7, '#2038a0').setOrigin(0, 1);
    const platform = text(role.y - role.height, w.platform, 'body', 7, '#2038a0').setOrigin(0, 1);
    const tagline = text(title.y + title.height + 1, w.tagline, 'body', 7.5, '#5c2800', 4);
    while (tagline.getBottomLeft().y! > platform.getTopLeft().y! - 3 && tagline.style.maxLines > 1) tagline.setMaxLines(tagline.style.maxLines - 1);
  }

  // ---------- Secret world ----------

  /** Holding S on the white platform long enough flips the world. No hint: it's for those who know. */
  private holdDoor(p: Player): boolean {
    const d = this.door;
    const down = held(this.controls.down);
    if (!down) this.doorLatch = false;
    const onDoor = !!d && !this.inRoom && p.body.blocked.down && p.x > d.x0 + 2 && p.x < d.x1 - 2 && Math.abs(p.body.bottom - d.top) < 3;
    this.doorHold = onDoor && down && !this.doorLatch ? this.doorHold + this.game.loop.delta : 0;
    if (this.doorHold < DOOR_HOLD) return false;
    this.doorHold = 0;
    this.doorLatch = true;
    return true;
  }

  /** The TV flips and the course turns black and white (or back). */
  private async flipSides() {
    this.busy = true;
    this.physics.pause();
    setDevMode(!ui.dev);
    await new Promise((r) => this.time.delayedCall(900, r));
    this.physics.resume();
    this.input.keyboard!.resetKeys();
    this.busy = false;
  }

  /** On the other side every story block and billboard is outlined; click one (or bump it) to edit it. */
  private drawDevLayer() {
    this.devLayer?.destroy();
    this.devLayer = undefined;
    if (!ui.dev) return;
    const c = this.add.container(0, 0).setDepth(90);
    const tag = (x: number, y: number, s: string) => {
      const t = px(this, x, y, s, { size: 6, color: '#000' }).setOrigin(0.5, 1);
      return t.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1);
    };
    for (const e of this.story.editables) {
      const g = this.add.graphics().lineStyle(1, 0xffffff, 0.9).strokeRect(e.x - 1, e.y - 1, e.w + 2, e.h + 2);
      const hit = this.add.zone(e.x, e.y, e.w, e.h).setOrigin(0).setInteractive({ cursor: 'pointer' });
      hit.on('pointerdown', () => this.select(e.id));
      c.add([g, tag(e.x + e.w / 2, e.y - 2, e.label), hit]);
    }
    if (this.door) c.add(tag((this.door.x0 + this.door.x1) / 2, this.door.top - 4, 'HOLD S: FLIP BACK'));
    this.devLayer = c;
  }

  /** Open a beat in the editor panel. */
  private select(beatId: string) {
    devBus.emit('select', { slug: this.world.slug, beatId });
  }

  // ---------- Areas ----------

  private buildRoom() {
    const R = this.level.room!;
    const w = R.tiles[0].length * T;
    const h = R.tiles.length * T;
    this.add.rectangle(this.RX - this.roomMargin, 0, Math.max(w, WIDTH), Math.max(h, HEIGHT), 0x000000).setOrigin(0).setDepth(-9);
    R.tiles.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (row[tx] !== '#') continue;
        const s = feltImage(this, this.RX + tx * T + 8, ty * T + 8, 'diamond').setDepth(3);
        this.solids.add(s);
      }
    });
    const cap = 14;
    if (R.pipeY === undefined) {
      // The entry pipe hangs from the ceiling; the way out is up the stairs and off the right edge.
      this.solids.add(feltImage(this, this.RX + R.pipe * T + 16, 16, 'pipe-dark').setDepth(3));
    } else {
      // A felt pipe, two tiles long, hanging under the ceiling with its mouth down
      const x = this.RX + R.pipe * T;
      const top = R.pipeY * T;
      this.add.tileSprite(x, top, 32, 2 * T - cap + 4, FELT, PIPE_RUN).setOrigin(0).setDepth(2).setTileScale(1 / ART);
      feltImage(this, x, top + 2 * T - cap, 'pipe2-top').setOrigin(0).setDisplaySize(32, cap).setDepth(2).setFlipY(true);
      this.solids.add(this.add.rectangle(x + 16, top + T, 32, 2 * T).setVisible(false));
    }
    if (R.exit) {
      // the way out: a sideways pipe in the left wall, mouth facing into the room
      const [ex, ey] = R.exit;
      const x = this.RX + ex * T;
      const y = ey * T;
      // lowered like the sideways pipes outside, so the body rests on the floor
      const mid = y + 16 + PIPE_INSET;
      this.add.tileSprite(x + (2 * T - cap + 4) / 2, mid, 32, 2 * T - cap + 4, FELT, PIPE_RUN).setDepth(2).setTileScale(1 / ART).setAngle(90);
      feltImage(this, x + 2 * T - cap / 2, mid, 'pipe2-top').setDisplaySize(32, cap).setAngle(90).setDepth(2);
      this.solids.add(this.add.rectangle(x + T, y + 16, 2 * T, 32).setVisible(false));
    }
    for (const [x, y] of R.coins) this.coins.add(feltImage(this, this.RX + x * T + 8, y * T + 8, 'coin').setDepth(4));
  }

  /**
   * The sky section (World 1-3): Launch the Capy's night sky and yarn moon, a floor of its yarn clouds
   * you can jump up through, coins, and a pipe back down. Its billboards and story blocks are beats.
   */
  private buildSky() {
    const S = this.level.skySection;
    if (!S) return;
    const x0 = this.SX;
    const w = S.width * T;
    const h = S.height * T;
    const floor = S.floor * T;
    // the stars art is four texture px to a game px, as tall as the section, and tiles sideways
    this.add.tileSprite(x0, 0, w, h, CAPY.stars).setOrigin(0).setDepth(-20).setTileScale(h / this.textures.get(CAPY.stars).getSourceImage().height);
    const [mx, my, size] = S.moon;
    this.add.image(x0 + mx * T, my * T, CAPY.moon).setOrigin(0).setDisplaySize(size, size).setDepth(-19);
    // yarn clouds overlap along the floor; the floor itself is a jump-through top, like the platforms
    for (let x = -15; x < w; x += 65) this.add.image(x0 + x, floor - 17.5, CAPY.cloud).setOrigin(0).setDisplaySize(96, 48).setDepth(3);
    const top = this.add.rectangle(x0 + w / 2, floor + 3, w, 6).setVisible(false);
    this.semis.add(top);
    const tb = top.body as Phaser.Physics.Arcade.StaticBody;
    tb.checkCollision.down = tb.checkCollision.left = tb.checkCollision.right = false;
    for (const [x, y] of S.coins) this.coins.add(feltImage(this, x0 + x * T + 8, y * T + 8, 'coin').setDepth(4));
    // the pipe down stands on the floor and runs down out of sight
    const cap = 14;
    const px0 = x0 + S.pipe * T;
    const ptop = floor - 2 * T;
    this.add.tileSprite(px0, ptop + cap - 4, 32, h - ptop - cap + 4, FELT, PIPE_RUN).setOrigin(0).setDepth(2.5).setTileScale(1 / ART);
    feltImage(this, px0, ptop, 'pipe2-top').setOrigin(0).setDisplaySize(32, cap).setDepth(2.5);
    this.solids.add(this.add.rectangle(px0 + 16, ptop + T, 32, 2 * T).setVisible(false));
    this.skyPipe = { x0: px0, x1: px0 + 32, top: ptop };
  }

  /** The Capy slingshot by the goal: stand on it and hold S to pull back, let go to fly. */
  private buildSlingshot(x: number, ground: number) {
    const art = this.add.image(x, ground + 2, CAPY.slingshot).setOrigin(0.5, 1).setDisplaySize(40, 40).setDepth(-2);
    const band = this.add.graphics().setDepth(11);
    const hint = px(this, x, ground - 44, 'HOLD S: PULL BACK', { size: 6, color: '#000' }).setOrigin(0.5).setDepth(20).setVisible(false);
    hint.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1);
    this.tweens.add({ targets: hint, y: hint.y - 2, yoyo: true, repeat: -1, duration: 450 });
    this.sling = { x, pull: 0, band, hint, art };
  }

  /** Per frame: pull back while S is held on the slingshot, fly when it's let go. */
  private updateSlingshot(p: Player) {
    const s = this.sling;
    if (!s || this.inRoom || this.inSky) return;
    const G = this.level.groundRow * T;
    const on = p.body.blocked.down && Math.abs(p.x - s.x) < 12 && Math.abs(p.body.bottom - G) < 3;
    s.hint.setVisible(on && s.pull === 0 && !ui.dev);
    s.band.clear();
    if (on && held(this.controls.down)) {
      s.pull = Math.min(1, s.pull + this.game.loop.delta / 900);
      // the band stretches from the fork tips down to the hero, and the slingshot leans back a touch
      const forkY = G - 30;
      s.band.lineStyle(1.5, 0x5a3518).lineBetween(s.x - 13, forkY, p.x, p.body.bottom - 4 + s.pull * 3).lineBetween(s.x + 13, forkY, p.x, p.body.bottom - 4 + s.pull * 3);
      s.art.setAngle(Math.sin(this.time.now / 40) * s.pull * 2);
      return;
    }
    if (s.pull > 0) {
      // full pull carries you just past the goal card; less, proportionally lower
      const rise = G - this.goal.y + 28;
      const speed = Math.sqrt(2 * this.physics.world.gravity.y * rise) * (0.55 + 0.45 * s.pull);
      s.pull = 0;
      s.art.setAngle(0);
      if (on) {
        p.setVelocityX(0);
        p.launch(speed);
        sfx.jump();
        this.tweens.add({ targets: s.art, scaleY: { from: s.art.scaleY * 0.9, to: s.art.scaleY }, duration: 200, ease: 'Back.easeOut' });
      }
    }
  }

  private useSkyCamera() {
    const S = this.level.skySection!;
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x111622);
    cam.setBounds(this.SX, 0, Math.max(S.width * T, WIDTH), S.height * T + BAR);
  }

  /** Off the top of the screen from a super note: come up through the sky section's cloud floor. */
  private async enterSky() {
    const S = this.level.skySection!;
    this.busy = true;
    this.skyBound = false;
    sfx.secret();
    const p = this.player;
    this.cameras.main.fadeOut(200, 255, 255, 255);
    await new Promise((r) => this.cameras.main.once('camerafadeoutcomplete', r));
    this.inSky = true;
    this.useSkyCamera();
    p.setPosition(this.SX + S.entry * T + 8, S.floor * T + 40);
    p.body.reset(p.x, p.y);
    p.launch(420);
    this.cameras.main.fadeIn(250, 255, 255, 255);
    this.busy = false;
  }

  /** Down the sky's pipe: drop out of the hanging pipe back on the course. */
  private async exitSky() {
    this.busy = true;
    sfx.pipe();
    const p = this.player;
    p.body.enable = false;
    p.setX((this.skyPipe!.x0 + this.skyPipe!.x1) / 2);
    await this.tweenTo(p, { y: p.y + 24 }, 500);
    this.cameras.main.fadeOut(150);
    await new Promise((r) => this.cameras.main.once('camerafadeoutcomplete', r));
    this.inSky = false;
    const out = this.exits.sky!;
    p.setPosition((out.x0 + out.x1) / 2, out.bottom - 12);
    this.useMainCamera();
    this.cameras.main.fadeIn(150);
    await this.tweenTo(p, { y: out.bottom + 10 }, 400);
    p.body.reset(p.x, p.y);
    p.body.enable = true;
    this.busy = false;
  }

  private useMainCamera() {
    const cam = this.cameras.main;
    cam.setBackgroundColor(this.level.sky);
    cam.setBounds(0, 0, this.W, this.H + BAR);
    cam.startFollow(this.player, true, 0.15, 0.12);
    cam.setDeadzone(24, 80);
    // felt scrolls smoothly; snapping to whole game pixels would jump 4 screen pixels at a time
    cam.setRoundPixels(false);
  }

  private useRoomCamera() {
    const R = this.level.room!;
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setBounds(this.RX - this.roomMargin, 0, Math.max(R.tiles[0].length * T, WIDTH), Math.max(R.tiles.length * T + BAR, HEIGHT));
  }

  /** A room narrower than the screen sits in the middle of it, with this much black either side. */
  private get roomMargin() {
    return Math.max(0, (WIDTH - this.level.room!.tiles[0].length * T) / 2);
  }

  private async enterRoom() {
    this.busy = true;
    sfx.pipe();
    const p = this.player;
    p.body.enable = false;
    p.setX((this.warp!.x0 + this.warp!.x1) / 2);
    await this.tweenTo(p, { y: p.y + 24 }, 500);
    this.cameras.main.fadeOut(150);
    await new Promise((r) => this.cameras.main.once('camerafadeoutcomplete', r));
    this.inRoom = true;
    this.useRoomCamera();
    const R = this.level.room!;
    p.setPosition(this.RX + R.pipe * T + 16, R.pipeY === undefined ? 40 : (R.pipeY + 2) * T + 10);
    p.body.reset(p.x, p.y);
    p.body.enable = true;
    this.cameras.main.fadeIn(150);
    this.busy = false;
    const numbers = this.story.room();
    if (numbers) this.time.delayedCall(500, () => void this.read(numbers));
  }

  private async exitRoom() {
    this.busy = true;
    sfx.pipe();
    const p = this.player;
    p.body.enable = false;
    this.cameras.main.fadeOut(150);
    await new Promise((r) => this.cameras.main.once('camerafadeoutcomplete', r));
    this.inRoom = false;
    const out = this.exits.room ?? this.warp!;
    p.setPosition((out.x0 + out.x1) / 2, out.top + 8);
    this.useMainCamera();
    this.cameras.main.fadeIn(150);
    await this.tweenTo(p, { y: out.top - 10 }, 400);
    p.body.reset(p.x, p.y);
    p.body.enable = true;
    this.busy = false;
  }

  /** Open a dialog or picture with the game paused, then hand the keys back. */
  private async read(open: () => Promise<void>) {
    if (this.busy || ui.blocking) return;
    this.busy = true;
    this.physics.pause();
    await open();
    this.physics.resume();
    this.input.keyboard!.resetKeys();
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

    // Pipes: down into the secret room, or down out of the sky
    const onPipe = (q?: { x0: number; x1: number; top: number }) => !!q && p.downPressed && p.x > q.x0 + 4 && p.x < q.x1 - 4 && Math.abs(p.body.bottom - q.top) < 3;
    if (!this.inRoom && !this.inSky && onPipe(this.warp)) {
      void this.enterRoom();
      return;
    }
    if (this.inSky && onPipe(this.skyPipe)) {
      void this.exitSky();
      return;
    }
    // shot up by the super note: the sky takes over once you're off the top of the screen
    if (this.skyBound && p.y < -24) {
      void this.enterSky();
      return;
    }
    this.updateSlingshot(p);

    // The white platform is the door to the other side
    if (this.holdDoor(p)) {
      void this.flipSides();
      return;
    }

    // Felt signposts: press S in front of one to look at its picture
    if (!this.inRoom && p.downPressed) {
      const look = this.story.signAt(p.x);
      if (look) {
        if (ui.dev) this.select(this.story.signFor(p.x)!.beat.id);
        void this.read(look);
        return;
      }
    }

    const R = this.level.room;
    const leaving =
      R &&
      (R.exit
        ? // walk into the sideways pipe's mouth
          p.body.blocked.left && held(this.controls.left) && p.x < this.RX + (R.exit[0] + 2) * T + 10 && p.body.bottom > R.exit[1] * T + 16
        : p.x > this.RX + R.tiles[0].length * T - 4);
    if (this.inRoom && leaving) {
      void this.exitRoom();
      return;
    }

    // Pits
    if (p.body.blocked.down && !this.inRoom && !this.inSky) this.safe = { x: p.x, y: p.y };
    if (p.y > this.H + 24) {
      sfx.hurt();
      p.setPosition(this.safe.x - 12, this.safe.y - 24);
      p.setVelocity(0, 0);
      p.hurt(p.x + 1);
    }

    this.story.update(p.x, this.inRoom);
    this.updateEnemies();
    this.updateFeathers();
    for (const pl of this.plants) {
      if (pl.sprite.y < pl.top - 4 && Phaser.Geom.Intersects.RectangleToRectangle(p.getBounds(), new Phaser.Geom.Rectangle(pl.cx - 6, pl.sprite.y + 2, 12, pl.top - pl.sprite.y))) {
        p.hurt(pl.cx);
      }
    }

    if (!this.finished) {
      if (Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y) < 18) void this.finish();
      else this.goal.setTexture(FELT, `icon-${['star', 'heart', 'pencil', 'seed'][Math.floor(this.time.now / 140) % 4]}`);
    }
  }

  private updateEnemies() {
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!e.active || e.getData('dead')) continue;
      const b = e.body as Phaser.Physics.Arcade.Body;
      const shell = e.getData('shell') as Shell | undefined;
      if (shell) {
        // a kicked shell bounces off walls and pipes and falls off ledges; a resting one stays put
        if (e.y > this.H + 32) e.destroy();
        else if (shell === 'still') e.setVelocityX(0);
        else {
          const dir = b.blocked.left ? 1 : b.blocked.right ? -1 : (e.getData('dir') as number);
          e.setData('dir', dir).setVelocityX(dir * SHELL_SPEED);
        }
        continue;
      }
      let dir = Math.sign(b.velocity.x) || -1;
      if (b.blocked.left) dir = 1;
      else if (b.blocked.right) dir = -1;
      else if (b.blocked.down) {
        // turn around at ledges so walkers patrol their platform
        const ahead = this.physics.overlapRect(e.x + dir * 9, b.bottom + 2, 2, 2, false, true);
        // on knit ground the slope ahead counts too, as long as it doesn't drop away
        const slope = this.terrain?.surface(e.x + dir * 9);
        if (!ahead.length && !(slope !== undefined && slope < b.bottom + 12)) dir = -dir;
      }
      e.setVelocityX(dir * 24);
      e.setFlipX(dir < 0); // felt art faces right
      const rig = e.getData('rig') as HeroRig | undefined;
      if (rig) {
        rig.setFacing(dir < 0);
        rig.animate(this.game.loop.delta / 1000, 0.45, !b.blocked.down);
      }
    }
  }

  /** Puppets follow their physics bodies every frame, also while update() is paused. */
  private followRigs = () => {
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      const rig = e.getData('rig') as HeroRig | undefined;
      if (rig && e.body) rig.root.setPosition(e.x, (e.body as Phaser.Physics.Arcade.Body).bottom);
    }
  };

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
    this.tweens.add({ targets: s, y: s.y - 5, duration: 70, yoyo: true });
    // Story blocks open their reading card on every bump (so they can be re-read); read ones dim a little.
    if (b.kind === 'story') {
      const open = this.story.storyAt(b.tx, b.ty);
      if (open) {
        sfx.select();
        // on the other side the card is a preview of what you're editing
        if (ui.dev) this.select(this.story.idAt(b.tx, b.ty)!);
        this.time.delayedCall(150, () => void this.read(open).then(() => s.setTint(0xd2d2d2)));
      }
      return;
    }
    if (b.kind === 'super') {
      // found it: the hidden note shows itself and becomes solid all round; land on it to go up
      if (b.hidden) {
        b.hidden = false;
        const body = s.body as Phaser.Physics.Arcade.StaticBody;
        body.checkCollision.up = body.checkCollision.left = body.checkCollision.right = true;
        s.setVisible(true).setTint(0xfff6d8);
        sfx.secret();
        this.tweens.add({ targets: s, scale: { from: s.scale * 1.3, to: s.scale }, duration: 300, ease: 'Back.easeOut' });
      }
      return;
    }
    if (b.used) return;
    if (b.kind === 'q' || b.kind === 'coin') {
      b.used = true;
      s.setTexture(FELT, 'empty');
      this.popCoin(s.x, s.y - 12);
    } else if (b.kind === 'item') {
      b.used = true;
      s.setTexture(FELT, 'empty');
      if (this.player.powered) this.popCoin(s.x, s.y - 12);
      else this.spawnFeather(s.x, s.y - 8, true);
    } else if (b.kind === 'pswitch') {
      // the P block only works from below: the bricks turn to coins
      b.used = true;
      s.setTexture(FELT, 'empty');
      this.pressSwitch();
    }
  }

  private landOn(b: Block) {
    const s = b.sprite;
    if (b.kind === 'note') {
      this.player.spring(300, 470);
      sfx.select();
      this.tweens.add({ targets: s, y: s.y + 4, duration: 60, yoyo: true });
    } else if (b.kind === 'super' && !b.hidden && this.level.skySection) {
      // straight up and off the top of the screen, into the sky section
      this.player.launch(900);
      this.skyBound = true;
      sfx.select();
      this.tweens.add({ targets: s, y: s.y + 6, duration: 80, yoyo: true });
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
      const c = feltImage(this, b.sprite.x, b.sprite.y, 'coin').setDepth(4);
      this.coins.add(c);
      swapped.push([b, c]);
    }
    const twist = this.story.switchPressed();
    if (twist) this.time.delayedCall(900, () => void this.read(twist));
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
    const shell = e.getData('shell') as Shell | undefined;
    // one stomp per landing: the shell shrinks under you, so the next physics step can still overlap it
    if (this.time.now - (e.getData('stompedAt') ?? -1e9) < 200) return;
    if (pb.velocity.y > 0 && pb.bottom - eb.top < 10) {
      e.setData('stompedAt', this.time.now);
      sfx.stomp();
      this.player.bounce();
      if (!e.getData('walker')) {
        e.setData('dead', true);
        e.anims.stop();
        this.tweens.killTweensOf(e);
        e.setAngle(0).setTexture(FELT, 'bug-flat');
        eb.enable = false;
        this.time.delayedCall(500, () => e.destroy());
      } else if (!shell) this.hideInShell(e);
      // stomp the left side and it slides right, the right side and it slides left
      else if (shell === 'still') this.kickShell(e, this.player.x < e.x ? 1 : -1);
      else this.stopShell(e);
      return;
    }
    // a resting shell is harmless, and a kicked one gives you a moment to get clear
    if (shell === 'still' || (shell === 'slide' && this.time.now - e.getData('kickedAt') < 250)) return;
    this.player.hurt(e.x);
  }

  /** First stomp: the turtle pulls into its shell and stays put. */
  private hideInShell(e: Phaser.Physics.Arcade.Sprite) {
    const eb = e.body as Phaser.Physics.Arcade.Body;
    const bottom = eb.bottom;
    (e.getData('rig') as HeroRig | undefined)?.root.destroy();
    e.setData('rig', undefined).setData('shell', 'still');
    e.setVisible(true).setFlipX(false).setTexture(FELT, 'hiker-flat');
    // the felt shell's dome fills about 13x8.5 px of its 16px frame, sitting 3.5px above the bottom edge
    eb.setSize(13 * ART, 8.5 * ART).setOffset(1.5 * ART, 4 * ART);
    e.setY(bottom - 4.5);
    eb.reset(e.x, e.y);
    eb.setVelocity(0, 0);
  }

  private kickShell(e: Phaser.Physics.Arcade.Sprite, dir: 1 | -1) {
    e.setData('shell', 'slide').setData('dir', dir).setData('kickedAt', this.time.now);
    e.setVelocityX(dir * SHELL_SPEED);
  }

  private stopShell(e: Phaser.Physics.Arcade.Sprite) {
    e.setData('shell', 'still');
    e.setVelocityX(0);
  }

  /**
   * A sliding shell against a block (the process callback of the enemy-solid
   * collider). Bricks it meets side-on break and it keeps going; ?, item and
   * coin-brick blocks give up what they hold and it bounces back. Returns whether to collide.
   */
  private shellHits(e: Phaser.Physics.Arcade.Sprite, o: Phaser.GameObjects.GameObject) {
    const b = this.blocks.get(o);
    if (!b || e.getData('shell') !== 'slide') return true;
    const eb = e.body as Phaser.Physics.Arcade.Body;
    const ob = b.sprite.body as Phaser.Physics.Arcade.StaticBody;
    // riding along the top of a row of blocks isn't a hit
    if (eb.bottom <= ob.top + 3 || eb.top >= ob.bottom - 3) return true;
    if (b.kind === 'brick') {
      this.breakBrick(b);
      return false;
    }
    if (b.kind === 'q' || b.kind === 'item' || b.kind === 'coin') this.bumpFromBelow(b);
    return true;
  }

  /** A brick smashed by a shell: four felt pieces fly off and it's gone for good. */
  private breakBrick(b: Block) {
    const s = b.sprite;
    this.blocks.delete(s);
    (s.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    s.setVisible(false);
    // the physics step is mid-collision here: let it finish before removing the sprite
    this.time.delayedCall(0, () => s.destroy());
    sfx.bump();
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const piece = feltImage(this, s.x + dx * 4, s.y + dy * 4, 'brick2').setScale(0.4 / ART).setDepth(8);
      this.tweens.add({ targets: piece, x: piece.x + dx * 18, y: piece.y + 40, angle: dx * 200, duration: 600, ease: 'Quad.easeIn', onComplete: () => piece.destroy() });
      this.tweens.add({ targets: piece, y: piece.y - 18 + dy * 6, duration: 220, ease: 'Quad.easeOut' });
    }
  }

  /** A sliding shell knocks other enemies off the course. */
  private shellMeets(a: Phaser.Physics.Arcade.Sprite, b: Phaser.Physics.Arcade.Sprite) {
    if (a.getData('dead') || b.getData('dead')) return;
    const victim = a.getData('shell') === 'slide' ? b : b.getData('shell') === 'slide' ? a : undefined;
    if (!victim) return;
    victim.setData('dead', true);
    sfx.stomp();
    this.tweens.killTweensOf(victim);
    const rig = victim.getData('rig') as HeroRig | undefined;
    // a turtle tumbles off as its shell, like the rest
    rig?.root.destroy();
    if (rig) victim.setTexture(FELT, 'hiker-flat');
    (victim.body as Phaser.Physics.Arcade.Body).enable = false;
    victim.setVisible(true).setFlipY(true);
    this.tweens.add({ targets: victim, y: victim.y - 20, duration: 220, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: victim, y: this.H + 40, delay: 220, duration: 700, ease: 'Quad.easeIn', onComplete: () => victim.destroy() });
  }

  private collect(c: Phaser.GameObjects.Image) {
    c.destroy();
    sfx.coin();
    this.addCoins(1);
  }

  private popCoin(x: number, y: number) {
    sfx.coin();
    this.addCoins(1);
    const c = feltImage(this, x, y, 'coin').setDepth(8);
    this.tweens.add({ targets: c, y: y - 32, duration: 260, yoyo: true, onComplete: () => c.destroy() });
  }

  private addCoins(n: number) {
    progress.coins += n;
    saveProgress();
    this.hud.setCoins(progress.coins);
  }

  // ---------- Feather power-up ----------

  private spawnFeather(x: number, y: number, rising: boolean) {
    const f = feltSprite(this, x, y, 'feather').setDepth(7);
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
        const power = this.story.feather();
        const t = this.add
          .text(p.x, p.y - 22, `${power ?? 'FEATHER!'}\nRUN + JUMP TO FLY`, { fontFamily: '"Luckiest Guy", sans-serif', fontSize: '8px', color: '#ffffff', stroke: '#5a3518', strokeThickness: 2, align: 'center' })
          .setOrigin(0.5)
          .setResolution(Z)
          .setDepth(20);
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
    this.story.bloom();
    this.goal.setTexture(FELT, `icon-${this.world.card}`);
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

  /** "1-2" for content/levels/world-1-2.json; levels named otherwise count worlds from 1. */
  private get levelNumber() {
    const m = /(\d+)-(\d+)$/.exec(this.level.id);
    return m ? `${m[1]}-${m[2]}` : `${this.worldIndex + 1}-1`;
  }

  /** Restart data that keeps the player where they are (live rebuilds while editing). */
  get restartData() {
    const p = this.player;
    return { slug: this.world.slug, at: this.inRoom || this.inSky || !p?.active ? undefined : { x: p.x, y: p.y, powered: p.powered } };
  }

  /** The tile the player stands on, for adding beats "here" from the editor. */
  get playerTile(): [number, number] {
    return [Math.floor(this.player.x / T), Math.floor((this.player.body.bottom - 1) / T)];
  }
}
