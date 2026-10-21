import Phaser from 'phaser';
import { getSite } from '../content/store';
import { sfx } from '../game/sfx';
import { HEIGHT, TILE, WIDTH, setLens, ui } from '../game/state';
import { px } from '../game/text';
import { showQuickView } from '../ui/overlays';

export class TitleScene extends Phaser.Scene {
  private choice = 0;
  private cursor!: Phaser.GameObjects.Text;

  constructor() {
    super('Title');
  }

  create() {
    const site = getSite();
    this.choice = 0;
    this.cameras.main.setBackgroundColor(0xfcd8a8);

    // Brick curtain
    for (let y = 0; y < 2; y++) for (let x = 0; x < WIDTH / TILE; x++) this.add.image(x * TILE + 8, y * TILE + 8, 'brick');
    this.add.rectangle(0, 32, WIDTH, 2, 0x000000).setOrigin(0);

    // Floating rings, a nod to the title-screen clouds
    const ring = (x: number, y: number, r: number) => {
      const g = this.add.graphics();
      g.lineStyle(1, 0xd87870).strokeEllipse(x, y, r * 2, r);
      g.lineStyle(1, 0xfcfcfc).strokeEllipse(x, y, r * 1.3, r * 0.6);
      this.tweens.add({ targets: g, x: 6, yoyo: true, repeat: -1, duration: 2200 + r * 40, ease: 'Sine.easeInOut' });
    };
    ring(52, 52, 16);
    ring(36, 70, 8);
    ring(270, 50, 18);

    // Hills
    this.add.image(26, HEIGHT - 48, 'hill-lg').setOrigin(0.5, 1);
    this.add.image(54, HEIGHT - 48, 'hill-sm').setOrigin(0.5, 1);
    this.add.image(292, HEIGHT - 48, 'hill-lg').setOrigin(0.5, 1);
    this.add.image(264, HEIGHT - 48, 'hill-sm').setOrigin(0.5, 1).setScale(1, 0.8);

    // Checkerboard floor
    const floor = this.add.graphics();
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < WIDTH / 16; x++) {
        floor.fillStyle((x + y) % 2 ? 0x000000 : 0xfcfcfc).fillRect(x * 16, HEIGHT - 48 + y * 16, 16, 16);
      }
    }

    // Wordmark
    const [first, ...rest] = site.name.split(' ');
    const wordmark = (text: string, y: number) =>
      this.add
        .text(WIDTH / 2, y, text.toUpperCase(), {
          fontFamily: '"Luckiest Guy", "Press Start 2P", sans-serif',
          fontSize: '30px',
          color: '#1878f8',
          stroke: '#0c1878',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setShadow(3, 3, '#6020a8', 0, true, true);
    wordmark(first, 62);
    wordmark(rest.join(' ') + '.', 92);

    const heart = this.add.image(WIDTH / 2, 124, 'icon-heart').setScale(1.5);
    this.tweens.add({ targets: heart, scale: 1.7, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });

    const menuX = 108;
    site.roles.forEach((r, i) => px(this, menuX, 148 + i * 12, `${i + 1} ${r.toUpperCase()}`, { color: '#000' }));
    this.cursor = px(this, menuX - 12, 148, '▶', { color: '#d82800' });
    px(this, WIDTH / 2, 177, site.year, { color: '#000', size: 6 }).setOrigin(0.5, 0);
    const blink = px(this, WIDTH / 2, HEIGHT - 32, 'PRESS ENTER', { color: '#d82800', size: 8 }).setOrigin(0.5).setDepth(5);
    blink.setBackgroundColor('#fcfcfc').setPadding(3, 3, 3, 2);
    this.tweens.add({ targets: blink, alpha: 0, yoyo: true, repeat: -1, duration: 500, hold: 300 });

    const k = this.input.keyboard!;
    const setChoice = (c: number) => {
      if (ui.blocking) return;
      this.choice = (c + 2) % 2;
      this.cursor.setY(148 + this.choice * 12);
      sfx.select();
    };
    k.on('keydown-UP', () => setChoice(this.choice - 1));
    k.on('keydown-DOWN', () => setChoice(this.choice + 1));
    k.on('keydown-W', () => setChoice(this.choice - 1));
    k.on('keydown-S', () => setChoice(this.choice + 1));
    k.on('keydown-ONE', () => setChoice(0));
    k.on('keydown-TWO', () => setChoice(1));
    const start = () => {
      if (ui.blocking) return;
      sfx.clear();
      setLens(this.choice === 0 ? 'design' : 'build');
      this.cameras.main.fadeOut(300);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Overworld'));
    };
    k.on('keydown-ENTER', start);
    k.on('keydown-SPACE', start);
    k.on('keydown-Q', () => !ui.blocking && showQuickView());
    this.cameras.main.fadeIn(300);
  }
}
