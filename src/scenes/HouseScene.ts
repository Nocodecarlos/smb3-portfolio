import Phaser from 'phaser';
import { asset } from '../assets';
import { Z, feltImage, preloadFelt, setupFelt } from '../art/felt';
import { ChibiRig, preloadHeroes } from '../art/hero';
import { getSite, getWorld } from '../content/store';
import type { HouseBox } from '../content/types';
import { FeltStatusBar } from '../game/feltHud';
import { Player, createControls } from '../game/Player';
import { sfx } from '../game/sfx';
import { HEIGHT, KEYS, WIDTH, progress, ui } from '../game/state';
import { px } from '../game/text';
import { showStory } from '../ui/overlays';

// A mushroom house you walk into from the map (the BLOG stop): felt diamond
// walls, a panel on the wall, the other hero waiting on a ledge, and three
// treasure boxes. Stand at a box and press S to open it and read the post
// inside. Esc goes back to the map.
// The same house hides past the end of World 1-3 (a world's `secretHouse`),
// with one box; Esc from there goes back to the course.

const T = 16;
/**
 * The house, 20 x 13 tiles and symmetrical: a dome on top of a narrower room. # is a felt diamond block, . is
 * inside (cream felt), a space is outside (black). The host stands on the right-hand step.
 */
const ROOM = [
  '      ########      ',
  '   ###........###   ',
  '  ##............##  ',
  ' ##..............## ',
  '#..................#',
  '#..................#',
  '#..................#',
  '###..............###',
  '  #..............#  ',
  '  #..............#  ',
  '  #..............#  ',
  '  #..............#  ',
  '  ################  ',
];
/** Centred on the screen; on a phone's narrower screen the room is wider, and the camera follows you across it. */
const ROOM_W = ROOM[0].length * T;
const X0 = Math.max(0, (WIDTH - ROOM_W) / 2);
const FLOOR = (ROOM.length - 1) * T;
/** The boxes stand four tiles apart, centred on the floor (three of them at columns 6, 10 and 14). */
const boxCol = (i: number, n: number) => 10 + (i - (n - 1) / 2) * 4;
const MAX_BOXES = 3;
const CHEST = 'house-chest';
const CHEST_OPEN = 'house-chest-open';
const CREAM = 'house-cream';

type Box = { x: number; art: Phaser.GameObjects.Image; hint: Phaser.GameObjects.Text; opened: boolean };
/** What a house holds and says: the status bar's two lines, the cards' kicker, the panel and the boxes. */
type House = { name: string; what: string; kicker: string; intro: string; boxes: HouseBox[] };
/** Where the secret house lets you out: back on its course. */
type Back = { slug: string; at: { x: number; y: number; powered: boolean }; read: string[] };

export class HouseScene extends Phaser.Scene {
  private house!: House;
  private back?: Back;
  private player!: Player;
  private host!: ChibiRig;
  private hud!: FeltStatusBar;
  private boxes: Box[] = [];
  private busy = false;
  private leaving = false;

  constructor() {
    super('House');
  }

  init(data: { node: string } | { secret: string; back: Back }) {
    if ('secret' in data) {
      const h = getWorld(data.secret)!.secretHouse!;
      this.house = { name: 'SECRET HOUSE', what: 'EARLY WORK', kicker: 'YOU FOUND IT', intro: h.intro, boxes: h.boxes };
      this.back = data.back;
    } else {
      const node = getSite().map.nodes.find((n) => n.id === data.node)!;
      this.house = { name: (node.label ?? 'HOUSE').toUpperCase() + ' HOUSE', what: 'WHAT IF IDEAS', kicker: 'WHAT IF…', intro: node.intro ?? '', boxes: node.boxes ?? [] };
      this.back = undefined;
    }
    this.boxes = [];
    this.busy = this.leaving = false;
  }

  preload() {
    preloadFelt(this);
    preloadHeroes(this);
    const files: [string, string][] = [
      [CHEST, 'felt/house/chest.png'],
      [CHEST_OPEN, 'felt/house/chest-open.png'],
      [CREAM, 'felt/ui/felt-cream.jpg'],
    ];
    for (const [key, path] of files) if (!this.textures.exists(key)) this.load.image(key, asset(path));
  }

  create() {
    // felt renders at Z times the base size, like the courses
    this.scale.resize(WIDTH * Z, HEIGHT * Z);
    const cam = this.cameras.main.setSize(WIDTH * Z, HEIGHT * Z).setZoom(Z).setBounds(0, 0, WIDTH, HEIGHT).setBackgroundColor(0x000000);
    cam.setRoundPixels(false);
    document.body.classList.add('felt');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.resize(WIDTH, HEIGHT);
      document.body.classList.remove('felt');
    });
    setupFelt(this);
    for (const key of [CHEST, CHEST_OPEN, CREAM]) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);

    // cream felt inside (row by row, one continuous texture), black outside, diamond blocks for the walls
    ROOM.forEach((row, ty) => {
      const a = row.search(/\S/);
      const b = row.trimEnd().length;
      const x = X0 + a * T;
      this.add.tileSprite(x, ty * T, (b - a) * T, T, CREAM).setOrigin(0).setTileScale(0.25).setTilePosition((a * T) / 0.25, (ty * T) / 0.25).setDepth(-10);
    });
    const solids = this.physics.add.staticGroup();
    ROOM.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) if (row[tx] === '#') solids.add(feltImage(this, X0 + tx * T + 8, ty * T + 8, 'diamond').setDepth(3));
    });

    // the panel on the wall: plain mint felt, a cream edge and a stitched line inside
    const pw = 11 * T;
    const ph = 4.5 * T;
    const pxl = X0 + 4.5 * T;
    const pyt = 2.25 * T;
    const panel = this.add.graphics().setDepth(-2);
    panel.fillStyle(0xcdeee4).fillRoundedRect(pxl, pyt, pw, ph, 5);
    panel.lineStyle(1.5, 0xf6efdc).strokeRoundedRect(pxl, pyt, pw, ph, 5);
    stitches(panel, pxl + 4, pyt + 4, pw - 8, ph - 8);
    this.add
      .text(pxl + pw / 2, pyt + ph / 2, this.house.intro, {
        fontFamily: '"Fredoka", sans-serif',
        fontStyle: '600',
        fontSize: '9px',
        color: '#2f3f8f',
        align: 'center',
        lineSpacing: 1,
        wordWrap: { width: pw - 22 },
      })
      .setOrigin(0.5)
      .setResolution(Z)
      .setDepth(-1);

    // the other hero keeps the house, on the ledge, facing the boxes
    const other = progress.hero === 'hat' ? 'helmet' : 'hat';
    this.host = new ChibiRig(this, other, 19);
    this.host.root.setPosition(X0 + 18 * T, 7 * T).setDepth(5);
    this.host.setFacing(true);

    // the boxes, standing on the floor
    const posts = this.house.boxes.slice(0, MAX_BOXES);
    posts.forEach((_, i) => {
      const x = X0 + boxCol(i, posts.length) * T;
      const art = this.add.image(x, FLOOR + 1, CHEST).setOrigin(0.5, 1).setDisplaySize(30, 34.3).setDepth(4);
      const hint = px(this, x, FLOOR - 44, `${KEYS.s}: OPEN`, { size: 6, color: '#000' }).setOrigin(0.5).setDepth(20).setVisible(false);
      hint.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1);
      this.tweens.add({ targets: hint, y: hint.y - 2, yoyo: true, repeat: -1, duration: 450 });
      this.boxes.push({ x, art, hint, opened: false });
    });

    // start by the left wall, facing the boxes
    const controls = createControls(this);
    this.player = new Player(this, X0 + 4 * T, FLOOR - 8, controls, progress.hero);
    this.physics.add.collider(this.player, solids);
    if (ROOM_W > WIDTH) cam.setBounds(0, 0, ROOM_W, HEIGHT).startFollow(this.player, true, 0.15, 0.15);

    this.hud = new FeltStatusBar(this, this.house.name, this.house.what);
    this.hud.setStories(0, this.boxes.length);
    this.input.keyboard!.on('keydown-ESC', () => !ui.blocking && this.leave());
    cam.fadeIn(250);
  }

  update() {
    if (this.busy) return;
    const p = this.player;
    p.update();
    this.host.animate(this.game.loop.delta / 1000, 0, false);
    const box = this.boxes.find((b) => Math.abs(p.x - b.x) < 14 && p.body.bottom > FLOOR - 4);
    this.boxes.forEach((b) => b.hint.setVisible(b === box && !ui.blocking).setText(b.opened ? `${KEYS.s}: READ` : `${KEYS.s}: OPEN`));
    if (box && p.downPressed) void this.open(box);
  }

  private async open(box: Box) {
    const i = this.boxes.indexOf(box);
    const post = this.house.boxes[i];
    this.busy = true;
    if (!box.opened) {
      box.opened = true;
      box.art.setTexture(CHEST_OPEN).setDisplaySize(30, 34.3);
      sfx.secret();
      this.tweens.add({ targets: box.art, scaleY: { from: box.art.scaleY * 0.85, to: box.art.scaleY }, duration: 260, ease: 'Back.easeOut' });
      this.hud.setStories(this.boxes.filter((b) => b.opened).length, this.boxes.length);
      await new Promise((r) => this.time.delayedCall(350, r));
    } else sfx.select();
    await showStory({
      kicker: this.house.kicker,
      title: post.title,
      body: post.body,
      image: post.image,
      progress: this.boxes.length > 1 ? `${i + 1} / ${this.boxes.length}` : undefined,
    });
    this.input.keyboard!.resetKeys();
    this.busy = false;
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = this.busy = true;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once('camerafadeoutcomplete', () => (this.back ? this.scene.start('Course', this.back) : this.scene.start('Overworld')));
  }
}

/** A dashed stitch line around a rectangle, like the felt's sewn edges. */
function stitches(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
  const dash = 3;
  const gap = 2;
  g.lineStyle(0.8, 0x7fb3a6);
  const run = (x0: number, y0: number, dx: number, dy: number, len: number) => {
    for (let d = 0; d < len; d += dash + gap) {
      const l = Math.min(dash, len - d);
      g.lineBetween(x0 + dx * d, y0 + dy * d, x0 + dx * (d + l), y0 + dy * (d + l));
    }
  };
  run(x, y, 1, 0, w);
  run(x, y + h, 1, 0, w);
  run(x, y, 0, 1, h);
  run(x + w, y, 0, 1, h);
}
