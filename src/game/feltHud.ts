import Phaser from 'phaser';
import { FELT, Z } from '../art/felt';
import { getWorlds } from '../content/store';
import { FIELD, progress } from './state';

// The felt status bar (Figma: ui-felt/status-bar) for courses that render
// at Z times resolution. Same API as StatusBar.

const NAVY = '#2f3f8f';
const BROWN = '#5a3518';

export class FeltStatusBar {
  private scene: Phaser.Scene;
  private coinText: Phaser.GameObjects.Text;
  private meter: Phaser.GameObjects.Text;
  private line2: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, worldLabel: string, line2: string) {
    this.scene = scene;
    // With a zoomed camera, scroll-fixed objects scale about the camera
    // centre; this offset puts the container's (0,0) at the screen's top-left.
    const cam = scene.cameras.main;
    const root = scene.add
      .container(cam.width * cam.originX * (1 - 1 / cam.zoom), cam.height * cam.originY * (1 - 1 / cam.zoom))
      .setScrollFactor(0)
      .setDepth(100);

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
    text(10, y1, worldLabel, NAVY);
    this.meter = text(75, y1, '', NAVY);
    this.coinText = text(179, y1, '', NAVY);
    this.line2 = text(10, y2, line2, BROWN);

    // Card slots are part of the background; cleared worlds show their plush card.
    const worlds = getWorlds();
    for (let i = 0; i < 3; i++) {
      const w = worlds[i];
      if (w && progress.cleared.includes(w.slug)) {
        root.add(scene.add.image(230 + i * 30 + 14, FIELD - 1 + 13.5, FELT, `icon-${w.card}`).setScale(0.85 / Z));
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
}
