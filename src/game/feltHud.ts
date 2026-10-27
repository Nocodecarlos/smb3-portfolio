import Phaser from 'phaser';
import { ART, FELT, Z } from '../art/felt';
import { getWorlds } from '../content/store';
import { FIELD, WIDTH, progress } from './state';

/** Extra width over the 320px bar the art was drawn for: the panel stretches, the card slots move right. */
const EXTRA = WIDTH - 320;
const CARD_X = 230 + EXTRA;
const COIN_X = 179 + EXTRA;
/** The app icon on a map stop: as tall as the two text rows beside it, inside the dashed outline. */
const STOP_ICON = 16;
const STOP_ICON_Y = FIELD + 14.25;
import { px } from './text';

// The felt status bar (Figma: ui-felt/status-bar) for courses that render
// at Z times resolution. Same API as StatusBar.

const NAVY = '#2f3f8f';
const BROWN = '#5a3518';
/** Card art for the problem / design / results chapters. */
const CHAPTER_FRAMES = ['bug-0', 'icon-pencil', 'icon-star'];

export class FeltStatusBar {
  private scene: Phaser.Scene;
  private coinText: Phaser.GameObjects.Text;
  private meter: Phaser.GameObjects.Text;
  private line2: Phaser.GameObjects.Text;
  private worldText: Phaser.GameObjects.Text;
  private root: Phaser.GameObjects.Container;
  private tip?: Phaser.GameObjects.Container;
  private subtitle: Phaser.GameObjects.Text;
  private headline: Phaser.GameObjects.Text;
  private storiesText: Phaser.GameObjects.Text;
  private chapterIcon?: Phaser.GameObjects.Image;
  private cards: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, worldLabel: string, line2: string) {
    this.scene = scene;
    // With a zoomed camera, scroll-fixed objects scale about the camera
    // centre; this offset puts the container's (0,0) at the screen's top-left.
    const cam = scene.cameras.main;
    const root = (this.root = scene.add
      .container(cam.width * cam.originX * (1 - 1 / cam.zoom), cam.height * cam.originY * (1 - 1 / cam.zoom))
      .setScrollFactor(0)
      .setDepth(100));

    // the info panel is a 3-slice that stretches across; the card slots keep their size
    const panelW = scene.textures.getFrame(FELT, 'hud-panel').width;
    const panel = scene.add.nineslice(0, FIELD - 1, FELT, 'hud-panel', panelW + EXTRA * ART, undefined, 40 * (ART / 4), 40 * (ART / 4)).setOrigin(0).setScale(1 / ART);
    const cards = scene.add.image(panelW / ART + EXTRA, FIELD - 1, FELT, 'hud-cards').setOrigin(0).setScale(1 / ART);
    root.add([panel, cards]);

    const text = (x: number, y: number, s: string, color: string) => {
      const t = scene.add
        .text(x, y, s, { fontFamily: '"Luckiest Guy", sans-serif', fontSize: '8.5px', color })
        .setResolution(Z)
        .setShadow(0, 0.6, 'rgba(42,22,8,0.35)', 0.6);
      root.add(t);
      return t;
    };
    const y1 = FIELD + 4;
    const y2 = FIELD + 14;
    this.worldText = text(10, y1, worldLabel, NAVY);
    this.meter = text(75, y1, '', NAVY);
    this.coinText = text(COIN_X, y1, '', NAVY);
    this.line2 = text(10, y2, line2, BROWN);
    const fredoka = { fontFamily: '"Fredoka", sans-serif', fontStyle: '600', fontSize: '6.5px', color: BROWN };
    this.subtitle = scene.add.text(10, y2 + 1.5, '', fredoka).setResolution(Z);
    // the map's headline: up to two lines, centred on the bar
    this.headline = scene.add
      .text(0, FIELD + 14.5, '', { ...fredoka, maxLines: 2, lineSpacing: 1, wordWrap: { width: 200 } })
      .setOrigin(0, 0.5)
      .setResolution(Z);
    root.add([this.subtitle, this.headline]);
    this.storiesText = text(126, y1, '', NAVY).setFontSize('7px').setY(y1 + 1);

    // Card slots are part of the background; cleared worlds show their plush card
    // (a course swaps these for its chapter cards).
    const worlds = getWorlds();
    for (let i = 0; i < 3; i++) {
      const w = worlds[i];
      if (w && progress.cleared.includes(w.slug)) {
        const card = scene.add.image(CARD_X + i * 30 + 14, FIELD - 1 + 13.5, FELT, `icon-${w.card}`).setScale(0.85 / ART);
        root.add(card);
        this.cards.push(card);
      }
    }
    this.setMeter(0);
    this.setCoins(progress.coins);
  }

  setCoins(n: number) {
    this.coinText.setText(`$ ${n}`);
  }

  /** 0..6 arrows; full meter flashes the P. */
  setMeter(n: number) {
    const full = n >= 6;
    const on = full && Math.floor(this.scene.time.now / 120) % 2 === 0;
    this.meter.setText('>'.repeat(n) + '-'.repeat(6 - n) + (on ? ' P' : ''));
  }

  setLine2(s: string) {
    this.line2.setText(s);
  }

  /**
   * A stop on the map (Figma: Second Round Feedback / feedback 1): the app
   * icon fills the bar's height, the world and title stack beside it, and
   * the headline wraps to two lines in the middle. No P-meter on the map.
   * Without an icon (`icon` is a loaded texture key) the text slides left.
   */
  setStop(world: string, title: string, headline = '', icon?: string) {
    this.meter.setVisible(false);
    this.chapterIcon?.destroy();
    this.chapterIcon = undefined;
    let x = 10;
    if (icon && this.scene.textures.exists(icon)) {
      const img = this.scene.add.image(10 + STOP_ICON / 2, STOP_ICON_Y, roundedIcon(this.scene, icon)).setDisplaySize(STOP_ICON, STOP_ICON);
      this.root.add(img);
      this.chapterIcon = img;
      this.scene.tweens.add({ targets: img, scale: { from: img.scale * 1.25, to: img.scale }, duration: 320, ease: 'Back.easeOut' });
      x = 10 + STOP_ICON + 5;
    }
    this.worldText.setText(world).setX(x);
    this.line2.setText(title).setX(x);
    const hx = x + Math.max(this.worldText.width, this.line2.width) + 10;
    this.headline.setText(headline).setX(hx).setWordWrapWidth(COIN_X - 10 - hx);
  }

  /**
   * Chapter header on the second line: the chapter's card, its title and a
   * one-line subtitle. Changes only when a new chapter starts.
   */
  setChapter(i: number, title: string, subtitle: string) {
    this.chapterIcon?.destroy();
    const frame = CHAPTER_FRAMES[i];
    if (frame) {
      this.chapterIcon = this.scene.add.image(15, FIELD + 18.5, FELT, frame).setScale(0.42 / ART);
      this.root.add(this.chapterIcon);
    }
    this.line2.setText(title).setX(frame ? 24 : 10);
    this.subtitle.setText(subtitle).setX(this.line2.x + this.line2.width + 6);
    this.lightChapter(i);
  }

  /** Big chapter title in the middle of the screen for a moment, then it lives in the bar. */
  banner(title: string, subtitle: string, frame?: string) {
    const cx = WIDTH / 2;
    const cy = FIELD / 2 - 10;
    const big = this.scene.add
      .text(cx, cy, title, { fontFamily: '"Luckiest Guy", sans-serif', fontSize: '22px', color: '#ffffff', stroke: '#5a3518', strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(Z)
      .setShadow(0, 2, 'rgba(42,22,8,0.45)', 2);
    const sub = this.scene.add
      .text(cx, cy + 17, subtitle, { fontFamily: '"Fredoka", sans-serif', fontStyle: '600', fontSize: '9px', color: '#ffffff', stroke: '#5a3518', strokeThickness: 2.5 })
      .setOrigin(0.5)
      .setResolution(Z);
    const parts: Phaser.GameObjects.GameObject[] = [big, sub];
    if (frame) parts.push(this.scene.add.image(cx - big.width / 2 - 14, cy, FELT, frame).setScale(0.6 / ART));
    const group = this.scene.add.container(0, 0, parts).setAlpha(0);
    this.root.add(group);
    this.scene.tweens.chain({
      targets: group,
      tweens: [
        { alpha: 1, y: { from: 6, to: 0 }, duration: 260, ease: 'Back.easeOut' },
        { alpha: 0, y: -6, delay: 1900, duration: 400, onComplete: () => group.destroy() },
      ],
    });
  }

  /** "STORIES 3/11" next to the P-meter. */
  setStories(read: number, total: number) {
    this.storiesText.setText(total ? `STORIES ${read}/${total}` : '');
    if (read > 0) this.scene.tweens.add({ targets: this.storiesText, scale: { from: 1.25, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  /** Chapter cards (bug, pencil, star): dim until reached. */
  setChapters(frames: string[]) {
    this.cards.forEach((c) => c.destroy());
    this.cards = frames.map((frame, i) => {
      const img = this.scene.add.image(CARD_X + i * 30 + 14, FIELD - 1 + 13.5, FELT, frame).setScale(0.7 / ART).setAlpha(0.22);
      this.root.add(img);
      return img;
    });
  }

  lightChapter(i: number) {
    const card = this.cards[i];
    if (!card || card.alpha === 1) return;
    card.setAlpha(1);
    this.scene.tweens.add({ targets: card, scale: { from: 1.25 / ART, to: 0.8 / ART }, duration: 380, ease: 'Back.easeOut' });
  }

  setWorld(s: string) {
    this.worldText.setText(s);
  }

  /** A sand-coloured strip just above the bar, for the controls at the start of a level. */
  showTip(s: string) {
    this.hideTip();
    const strip = this.scene.add.rectangle(0, FIELD - 15, WIDTH, 15, 0xfcd8a8).setOrigin(0);
    const text = px(this.scene, WIDTH / 2, FIELD - 11, s, { color: '#000000', size: 6 }).setOrigin(0.5, 0);
    this.tip = this.scene.add.container(0, 0, [strip, text]);
    this.root.add(this.tip);
  }

  hideTip() {
    const tip = this.tip;
    if (!tip) return;
    this.tip = undefined;
    this.scene.tweens.add({ targets: tip, alpha: 0, duration: 400, onComplete: () => tip.destroy() });
  }

  get tipShown() {
    return !!this.tip;
  }
}

/** The texture with iOS-style rounded corners, made once per icon. */
function roundedIcon(scene: Phaser.Scene, key: string) {
  const out = `${key}:rounded`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const s = src.width;
  const tex = scene.textures.createCanvas(out, s, s)!;
  const ctx = tex.context;
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, s * 0.225);
  ctx.clip();
  ctx.drawImage(src, 0, 0, s, s);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return out;
}
