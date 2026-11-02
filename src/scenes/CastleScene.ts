import Phaser from 'phaser';
import { asset } from '../assets';
import { Z, preloadFelt, setupFelt } from '../art/felt';
import { preloadHeroes } from '../art/hero';
import { FeltStatusBar } from '../game/feltHud';
import { Player, createControls } from '../game/Player';
import { sfx } from '../game/sfx';
import { HEIGHT, KEYS, WIDTH, progress, ui } from '../game/state';
import { px } from '../game/text';
import { showLetter } from '../ui/overlays';

// The contact castle, the last stop on the map (Figma page "Contact Castle"): a felt throne room with
// Carlos in front of the throne. Walk up the red steps and press S to talk: the letter, with his email
// and LinkedIn. Esc goes back to the map.

const ROOM = 'castle-room';
const AVATAR = 'castle-avatar';
/** The room art's size in game px; on a phone's narrower screen the camera follows you across it. */
const ROOM_W = 427;
/** Drawn this far up, so the checkered floor clears the status bar. */
const ROOM_Y = -16;
/** Where you stand, measured off the art: [left, right, top] in game px. */
const FLOOR = 183;
const STEPS: [number, number, number][] = [
  [242, ROOM_W, 170],
  [256, 392, 159],
];
const CARLOS_X = 324;
const CARLOS_H = 42;
/** The hero in this room: nearly Carlos's size, up close. */
const HERO_H = 36;
/** Close enough to talk: from the lower step on. */
const TALK_REACH = 62;
/** What Carlos calls out until you're close enough to talk. */
const CALL = "COME OVER HERE, LET'S TALK!";

export class CastleScene extends Phaser.Scene {
  private player!: Player;
  private hint!: Phaser.GameObjects.Text;
  private busy = false;
  private leaving = false;

  constructor() {
    super('Castle');
  }

  init() {
    this.busy = this.leaving = false;
  }

  preload() {
    preloadFelt(this);
    preloadHeroes(this);
    for (const [key, path] of [[ROOM, 'felt/castle/room.webp'], [AVATAR, 'felt/castle/avatar.webp']]) {
      if (!this.textures.exists(key)) this.load.image(key, asset(path));
    }
  }

  create() {
    this.scale.resize(WIDTH * Z, HEIGHT * Z);
    const cam = this.cameras.main.setSize(WIDTH * Z, HEIGHT * Z).setZoom(Z).setBounds(0, 0, Math.max(ROOM_W, WIDTH), HEIGHT).setBackgroundColor(0x000000);
    cam.setRoundPixels(false);
    document.body.classList.add('felt');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.resize(WIDTH, HEIGHT);
      document.body.classList.remove('felt');
    });
    setupFelt(this);
    for (const key of [ROOM, AVATAR]) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.add.image(0, ROOM_Y, ROOM).setOrigin(0).setDisplaySize(ROOM_W, HEIGHT).setDepth(-10);

    const solids = this.physics.add.staticGroup();
    const solid = (x: number, y: number, w: number, h: number) => solids.add(this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false));
    solid(-16, FLOOR, ROOM_W + 32, HEIGHT - FLOOR);
    solid(-16, -64, 16, HEIGHT + 64);
    solid(ROOM_W, -64, 16, HEIGHT + 64);
    for (const [l, r, top] of STEPS) solid(l, top, r - l, FLOOR - top);

    // Carlos, in front of the throne, breathing a little
    const carlos = this.add.image(CARLOS_X, STEPS[1][2] + 1, AVATAR).setOrigin(0.5, 1).setDepth(4);
    carlos.setScale(CARLOS_H / carlos.height);
    this.tweens.add({ targets: carlos, scaleY: carlos.scaleY * 1.025, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });

    // always up, so it's clear from the door who to go to; clicking Carlos works from anywhere
    carlos.setInteractive({ useHandCursor: true }).on('pointerdown', () => !this.busy && !ui.blocking && void this.talk());
    this.hint = px(this, CARLOS_X, STEPS[1][2] - CARLOS_H - 10, CALL, { size: 6, color: '#000' }).setOrigin(0.5).setDepth(20);
    this.hint.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1);
    this.tweens.add({ targets: this.hint, y: this.hint.y - 2, yoyo: true, repeat: -1, duration: 450 });

    this.player = new Player(this, 40, FLOOR - 8, createControls(this), progress.hero, HERO_H);
    this.physics.add.collider(this.player, solids);
    if (ROOM_W > WIDTH) cam.startFollow(this.player, true, 0.15, 0.15);

    new FeltStatusBar(this, 'CONTACT CASTLE', 'WALK UP TO CARLOS');
    this.input.keyboard!.on('keydown-ESC', () => !ui.blocking && this.leave());
    cam.fadeIn(250);
  }

  update() {
    if (this.busy) return;
    const p = this.player;
    p.update();
    const near = Math.abs(p.x - CARLOS_X) < TALK_REACH;
    this.hint.setText(near ? `${KEYS.s}: TALK` : CALL);
    if (near && p.downPressed) void this.talk();
  }

  private async talk() {
    this.busy = true;
    sfx.select();
    await showLetter();
    this.input.keyboard!.resetKeys();
    this.busy = false;
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = this.busy = true;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Overworld'));
  }
}
