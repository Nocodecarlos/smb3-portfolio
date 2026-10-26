import Phaser from 'phaser';
import { FELT, Z } from '../art/felt';
import { getWorlds } from '../content/store';
import { FIELD, WIDTH, progress } from './state';
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

    const bg = scene.add.image(0, FIELD - 1, FELT, 'hud-bg').setOrigin(0).setScale(1 / Z);
    root.add(bg);

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
    this.coinText = text(179, y1, '', NAVY);
    this.line2 = text(10, y2, line2, BROWN);
    this.subtitle = scene.add
      .text(10, y2 + 1.5, '', { fontFamily: '"Fredoka", sans-serif', fontStyle: '600', fontSize: '6.5px', color: BROWN })
      .setResolution(Z);
    root.add(this.subtitle);
    this.storiesText = text(126, y1, '', NAVY).setFontSize('7px').setY(y1 + 1);

    // Card slots are part of the background; cleared worlds show their plush card
    // (a course swaps these for its chapter cards).
    const worlds = getWorlds();
    for (let i = 0; i < 3; i++) {
      const w = worlds[i];
      if (w && progress.cleared.includes(w.slug)) {
        const card = scene.add.image(230 + i * 30 + 14, FIELD - 1 + 13.5, FELT, `icon-${w.card}`).setScale(0.85 / Z);
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
   * Chapter header on the second line: the chapter's card, its title and a
   * one-line subtitle. Changes only when a new chapter starts.
   */
  setChapter(i: number, title: string, subtitle: string) {
    this.chapterIcon?.destroy();
    const frame = CHAPTER_FRAMES[i];
    if (frame) {
      this.chapterIcon = this.scene.add.image(15, FIELD + 18.5, FELT, frame).setScale(0.42 / Z);
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
    if (frame) parts.push(this.scene.add.image(cx - big.width / 2 - 14, cy, FELT, frame).setScale(0.6 / Z));
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
      const img = this.scene.add.image(230 + i * 30 + 14, FIELD - 1 + 13.5, FELT, frame).setScale(0.7 / Z).setAlpha(0.22);
      this.root.add(img);
      return img;
    });
  }

  lightChapter(i: number) {
    const card = this.cards[i];
    if (!card || card.alpha === 1) return;
    card.setAlpha(1);
    this.scene.tweens.add({ targets: card, scale: { from: 1.25 / Z, to: 0.8 / Z }, duration: 380, ease: 'Back.easeOut' });
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
