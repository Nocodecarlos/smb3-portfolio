import Phaser from 'phaser';
import { getWorlds } from '../content/store';
import { BAR, FIELD, WIDTH, progress } from './state';
import { px } from './text';

// The SMB3-style status bar: world, P-meter, coins and one card slot per world.

export class StatusBar {
  private scene: Phaser.Scene;
  private coinText: Phaser.GameObjects.Text;
  private meter: Phaser.GameObjects.Text;
  private line2: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, worldLabel: string, line2: string) {
    this.scene = scene;
    const g = scene.add.graphics().setScrollFactor(0).setDepth(100);
    g.fillStyle(0x000000).fillRect(0, FIELD, WIDTH, BAR);
    // Info panel
    // the info panel takes the extra width of a wide screen; card slots stay on the right
    const extra = WIDTH - 320;
    g.fillStyle(0xfcfcfc).fillRect(3, FIELD + 3, 222 + extra, BAR - 6);
    g.fillStyle(0x000000).fillRect(4, FIELD + 4, 220 + extra, BAR - 8);
    g.fillStyle(0xb8f8f8).fillRect(5, FIELD + 5, 218 + extra, BAR - 10);

    const y1 = FIELD + 7;
    const y2 = FIELD + 17;
    const ink = '#000000';
    this.add(px(scene, 9, y1, worldLabel, { color: ink }));
    this.meter = this.add(px(scene, 9 + (worldLabel.length + 1) * 8, y1, '', { color: ink }));
    this.coinText = this.add(px(scene, 178 + extra, y1, '', { color: ink }));
    this.line2 = this.add(px(scene, 9, y2, line2, { color: ink }));

    // Card slots
    const worlds = getWorlds();
    const slots = Math.max(3, Math.min(worlds.length, 3));
    for (let i = 0; i < slots; i++) {
      const x = 231 + extra + i * 29;
      g.fillStyle(0xfcfcfc).fillRect(x, FIELD + 3, 26, BAR - 6);
      g.fillStyle(0x000000).fillRect(x + 1, FIELD + 4, 24, BAR - 8);
      g.fillStyle(0xb8f8f8).fillRect(x + 2, FIELD + 5, 22, BAR - 10);
      const w = worlds[i];
      if (w && progress.cleared.includes(w.slug)) {
        scene.add.image(x + 13, FIELD + 16, `icon-${w.card}`).setScrollFactor(0).setDepth(101);
      }
    }
    this.setMeter(0);
    this.setCoins(progress.coins);
  }

  private add(t: Phaser.GameObjects.Text) {
    return t.setScrollFactor(0).setDepth(101);
  }

  setCoins(n: number) {
    this.coinText.setText(`$${String(n).padStart(3, ' ')}`);
  }

  /** 0..6 arrows; full meter flashes the P. */
  setMeter(n: number) {
    const full = n >= 6;
    const on = full && Math.floor(this.scene.time.now / 120) % 2 === 0;
    this.meter.setText('>'.repeat(n) + '-'.repeat(6 - n) + (on ? ' P' : '  '));
  }

  setLine2(s: string) {
    this.line2.setText(s);
  }
}
