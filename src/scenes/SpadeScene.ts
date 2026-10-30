import Phaser from 'phaser';
import { asset } from '../assets';
import { FELT, Z, preloadFelt, setupFelt } from '../art/felt';
import { getSite, resolveSrc } from '../content/store';
import type { MapNode } from '../content/types';
import { FeltStatusBar } from '../game/feltHud';
import { sfx } from '../game/sfx';
import { HEIGHT, KEYS, WIDTH, progress, saveProgress, ui } from '../game/state';
import { showStory } from '../ui/overlays';

// The spade panel's bonus game: three pictures (my face, my resume and a
// ladybug from the levels) are cut into three strips that scroll sideways
// through one picture frame, the bottom one slowest and the top one fastest,
// so the frame shows a jumble of them. Press S to stop the strips one by one,
// top first, and they always put one whole picture together: it's a fun
// moment, not a test of timing, so the odds pick the picture (ODDS) and the
// strips glide to it. The resume opens with a button to download it; the bug
// eats up to 50 coins. Esc goes back to the map.

/** The frame holds one picture, in three strips; the pictures follow each other along every strip. */
const PIC_W = Math.min(240, WIDTH - 32);
const PIC_H = 150;
const STRIP = PIC_H / 3;
const WX0 = Math.round((WIDTH - PIC_W) / 2);
const WY0 = 22;
/** The pictures are drawn at this many texture px per game px, so they stay sharp at zoom Z. */
const RES = 4;
/** Strip speeds in px a second, top to bottom. */
const SPEEDS = [330, 230, 140];
const CREAM = 'house-cream';
type Pic = 'face' | 'resume' | 'bug';
const PICS: Pic[] = ['face', 'resume', 'bug'];
/** How likely each picture is to come up: 60 : 40 : 20, so the resume half the time, the face a third, the bug a sixth. */
const ODDS: Record<Pic, number> = { resume: 60, face: 40, bug: 20 };
/** What the bug eats. */
const BUG_BITE = 50;
/** Each picture's backing, so the strips tell apart at a glance. */
const BACKS: Record<Pic, number> = { face: 0xf1b6a2, resume: 0xacddeb, bug: 0xcdeee4 };

interface Strip {
  /** How far the strip has scrolled, in px; a picture fills the frame at every multiple of PIC_W. */
  o: number;
  speed: number;
  /** Where it comes to rest once stopped: set when S is pressed, and it glides there. */
  target?: number;
  stopped: boolean;
  images: Phaser.GameObjects.Image[];
}

export class SpadeScene extends Phaser.Scene {
  private node!: MapNode;
  private strips: Strip[] = [];
  private active = 0;
  private arrow!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private result!: Phaser.GameObjects.Text;
  private hud!: FeltStatusBar;
  /** The picture this round puts together. */
  private pick: Pic = 'resume';
  /** Waiting for S to spin again, after a round. */
  private over = false;
  private busy = false;
  private leaving = false;

  constructor() {
    super('Spade');
  }

  init(data: { node: string }) {
    this.node = getSite().map.nodes.find((n) => n.id === data.node)!;
    this.strips = [];
    this.active = 0;
    this.over = this.busy = this.leaving = false;
  }

  preload() {
    preloadFelt(this);
    if (!this.textures.exists(CREAM)) this.load.image(CREAM, asset('felt/ui/felt-cream.jpg'));
    const b = this.node.bonus!;
    for (const src of [b.face, b.resume]) if (src && !this.textures.exists(`img:${src}`)) this.load.image(`img:${src}`, resolveSrc(src));
  }

  create() {
    this.scale.resize(WIDTH * Z, HEIGHT * Z);
    const cam = this.cameras.main.setSize(WIDTH * Z, HEIGHT * Z).setZoom(Z).setBounds(0, 0, WIDTH, HEIGHT).setBackgroundColor(0x000000);
    cam.setRoundPixels(false);
    document.body.classList.add('felt');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.resize(WIDTH, HEIGHT);
      document.body.classList.remove('felt');
    });
    setupFelt(this);
    this.textures.get(CREAM).setFilter(Phaser.Textures.FilterMode.LINEAR);

    // cream felt all over, a mint stitched panel round the picture frame
    this.add.tileSprite(0, 0, WIDTH, HEIGHT, CREAM).setOrigin(0).setTileScale(0.25).setDepth(-10);
    const pad = 9;
    const panel = this.add.graphics().setDepth(-2);
    panel.fillStyle(0xcdeee4).fillRoundedRect(WX0 - pad, WY0 - pad, PIC_W + 2 * pad, PIC_H + 2 * pad, 6);
    panel.lineStyle(1.5, 0xf6efdc).strokeRoundedRect(WX0 - pad, WY0 - pad, PIC_W + 2 * pad, PIC_H + 2 * pad, 6);
    stitches(panel, WX0 - pad + 3.5, WY0 - pad + 3.5, PIC_W + 2 * pad - 7, PIC_H + 2 * pad - 7);

    for (const pic of PICS) this.drawPicture(pic);
    this.strips = SPEEDS.map((speed) => ({
      o: Phaser.Math.Between(0, 3 * PIC_W),
      speed,
      stopped: false,
      images: Array.from({ length: 2 }, () => this.add.image(0, WY0, `bonus-${PICS[0]}`).setOrigin(0, 0).setScale(1 / RES).setDepth(1)),
    }));
    // a dark frame, like the bonus game's
    this.add.graphics().setDepth(2).lineStyle(3, 0x3a2410).strokeRect(WX0 - 1.5, WY0 - 1.5, PIC_W + 3, PIC_H + 3);
    this.arrow = this.add.graphics().setDepth(3);

    this.result = this.text(WIDTH / 2, WY0 + PIC_H + pad + 10, '', 'heading', 13, '#d82800');
    this.hint = this.text(WIDTH / 2, WY0 + PIC_H + pad + 23, `${KEYS.stop}: STOP THE TOP STRIP`, 'body', 8, '#5a3518');
    this.pick = draw();
    this.tweens.add({ targets: this.hint, alpha: 0.55, yoyo: true, repeat: -1, duration: 600 });

    this.hud = new FeltStatusBar(this, 'BONUS GAME', 'MATCH ALL THREE');
    const kb = this.input.keyboard!;
    for (const key of ['S', 'L', 'SPACE', 'DOWN', 'ENTER']) kb.on(`keydown-${key}`, () => this.press());
    this.input.on('pointerdown', () => this.press());
    kb.on('keydown-ESC', () => !ui.blocking && this.leave());
    cam.fadeIn(250);
  }

  /** Text in the felt status bar's type: Luckiest Guy for headings, Fredoka for the rest. */
  private text(x: number, y: number, s: string, font: 'heading' | 'body', size: number, color: string) {
    return this.add
      .text(x, y, s, {
        fontFamily: font === 'heading' ? '"Luckiest Guy", sans-serif' : '"Fredoka", sans-serif',
        fontStyle: font === 'heading' ? '' : '600',
        fontSize: `${size}px`,
        color,
      })
      .setOrigin(0.5)
      .setResolution(Z)
      .setDepth(5);
  }

  /** Draws one picture on its coloured felt square, into a texture the strips cut up. A missing photo gets a stand-in. */
  private drawPicture(pic: Pic) {
    const key = `bonus-${pic}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    const w = PIC_W * RES;
    const h = PIC_H * RES;
    const rt = this.add.renderTexture(0, 0, w, h).setVisible(false);
    rt.fill(BACKS[pic]);
    const src = pic === 'bug' ? undefined : this.node.bonus![pic];
    const put = (img: Phaser.GameObjects.Image, fit: 'cover' | 'contain', share = 1) => {
      const f = fit === 'cover' ? Math.max : Math.min;
      img.setScale(f(w / img.width, h / img.height) * share).setPosition(w / 2, h / 2);
      rt.draw(img);
      img.destroy();
    };
    if (pic === 'bug') put(this.make.image({ key: FELT, frame: 'bug-0' }, false), 'contain', 0.75);
    else if (src && this.textures.exists(`img:${src}`)) {
      // the face fills its square; the resume sits on it whole, like a sheet of paper
      put(this.make.image({ key: `img:${src}` }, false), pic === 'face' ? 'cover' : 'contain', pic === 'face' ? 1 : 0.86);
    } else {
      const g = this.make.graphics({}, false);
      if (pic === 'face') g.fillStyle(0xf6d2b8).fillCircle(w / 2, h * 0.42, h * 0.3).fillStyle(0x5a3518).fillCircle(w / 2 - h * 0.1, h * 0.38, 14).fillCircle(w / 2 + h * 0.1, h * 0.38, 14);
      else {
        g.fillStyle(0xffffff).fillRect(w / 2 - h * 0.3, h * 0.06, h * 0.6, h * 0.72).fillStyle(0x9aa6b8);
        for (let i = 0; i < 9; i++) g.fillRect(w / 2 - h * 0.22, h * (0.14 + i * 0.065), h * (i % 3 === 0 ? 0.25 : 0.44), 8);
      }
      rt.draw(g);
      g.destroy();
      const label = this.make.text({ text: pic === 'face' ? 'YOUR FACE' : 'RESUME', style: { fontFamily: '"Luckiest Guy", sans-serif', fontSize: '64px', color: '#5a3518' } }, false);
      rt.draw(label, w / 2 - label.width / 2, h * 0.88 - label.height / 2);
      label.destroy();
    }
    rt.saveTexture(key);
  }

  update(_t: number, delta: number) {
    if (this.busy) return;
    this.strips.forEach((s, row) => {
      if (s.target === undefined) s.o += (s.speed * delta) / 1000;
      this.place(s, row);
    });
    // the arrow points at the strip that stops next
    this.arrow.clear();
    if (!this.over && this.active < 3) {
      const y = WY0 + this.active * STRIP + STRIP / 2;
      const x = Math.max(WX0 - 14, 7) + Math.sin(this.time.now / 150) * 1.5;
      this.arrow.fillStyle(0xd82800).fillTriangle(x - 5, y - 6, x - 5, y + 6, x + 4, y);
    }
  }

  /** Lays out the two pictures a strip shows in the frame, each cut to its row and clipped to the frame. */
  private place(s: Strip, row: number) {
    const first = Math.floor(s.o / PIC_W);
    s.images.forEach((img, i) => {
      const slot = first + i;
      const left = WX0 + slot * PIC_W - s.o;
      const from = Math.max(left, WX0);
      const to = Math.min(left + PIC_W, WX0 + PIC_W);
      img.setVisible(to > from);
      if (to <= from) return;
      img.setTexture(`bonus-${PICS[((slot % 3) + 3) % 3]}`).setPosition(left, WY0);
      img.setCrop((from - left) * RES, row * STRIP * RES, (to - from) * RES, STRIP * RES);
    });
  }

  /** The picture a stopped strip shows in the frame. */
  private shown(s: Strip): Pic {
    return PICS[((Math.round(s.o / PIC_W) % 3) + 3) % 3];
  }

  private press() {
    if (ui.blocking || this.busy || this.leaving) return;
    if (this.over) return this.spin();
    const s = this.strips[this.active];
    if (!s || s.target !== undefined) return;
    // it glides on, slowing down, until this round's picture fills the frame (a little way on at least)
    const want = PICS.indexOf(this.pick);
    let n = Math.ceil((s.o + PIC_W * 0.4) / PIC_W);
    while (((n % 3) + 3) % 3 !== want) n++;
    s.target = n * PIC_W;
    this.tweens.add({
      targets: s,
      o: s.target,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => {
        s.stopped = true;
        sfx.bump();
        if (this.strips.every((x) => x.stopped)) void this.score();
      },
    });
    sfx.select();
    this.active++;
    this.hint.setText(this.active === 1 ? `${KEYS.stop}: STOP THE MIDDLE STRIP` : this.active === 2 ? `${KEYS.stop}: STOP THE BOTTOM STRIP` : '');
  }

  private spin() {
    this.over = false;
    this.active = 0;
    this.result.setText('');
    this.hint.setText(`${KEYS.stop}: STOP THE TOP STRIP`);
    this.pick = draw();
    for (const s of this.strips) {
      s.stopped = false;
      s.target = undefined;
    }
  }

  private async score() {
    this.over = true;
    const [top, ...rest] = this.strips.map((s) => this.shown(s));
    const win = rest.every((p) => p === top);
    this.result.setText(!win ? 'SO CLOSE!' : top === 'bug' ? "YOU'VE GOT A BUG!" : "IT'S A MATCH!");
    this.tweens.add({ targets: this.result, scale: { from: 1.3, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    this.hint.setText(`${KEYS.stop}: PLAY AGAIN   ${KEYS.esc}: MAP`);
    if (!win || top === 'bug') sfx.hurt();
    else sfx.secret();
    if (!win) return;
    this.busy = true;
    await new Promise((r) => this.time.delayedCall(700, r));
    await this.prize(top);
    this.input.keyboard!.resetKeys();
    this.busy = false;
  }

  /** What a match wins. */
  private prize(pic: Pic) {
    const b = this.node.bonus!;
    const about = getSite().about;
    if (pic === 'resume') {
      return showStory({
        kicker: 'YOU MATCHED IT',
        title: 'My resume',
        body: 'You put it together! Here is my resume.',
        image: { src: b.resume, caption: 'My resume' },
        link: b.resumePdf ? { label: 'DOWNLOAD RESUME', href: b.resumePdf, download: 'Carlos Velasquez - Resume.pdf' } : undefined,
      });
    }
    if (pic === 'face') return showStory({ kicker: 'YOU MATCHED IT', title: about.title, body: about.body, image: { src: b.face, caption: 'Me' } });
    // the bug eats up to 50 coins, or nothing when there are none
    const bite = Math.min(BUG_BITE, progress.coins);
    progress.coins -= bite;
    saveProgress();
    this.hud.setCoins(progress.coins);
    return showStory({
      kicker: 'OH NO',
      title: "You've got a bug!",
      body: bite ? `It ate ${bite} of your coins.` : "Lucky you: you didn't have any coins for it to eat.",
    });
  }

  private leave() {
    if (this.leaving) return;
    this.leaving = this.busy = true;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Overworld'));
  }
}

/** Picks a picture by ODDS. */
function draw(): Pic {
  const total = PICS.reduce((n, p) => n + ODDS[p], 0);
  let r = Math.random() * total;
  return PICS.find((p) => (r -= ODDS[p]) < 0) ?? 'resume';
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
