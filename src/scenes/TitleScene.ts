import Phaser from 'phaser';
import { FELT, Z, preloadFelt, setupFelt } from '../art/felt';
import { ChibiRig, preloadHeroes } from '../art/hero';
import { stopMusic } from '../game/music';
import { sfx } from '../game/sfx';
import { HEIGHT, type Hero, WIDTH, progress, saveProgress, ui } from '../game/state';
import { showQuickView } from '../ui/overlays';

// Felt title screen (Figma: 02 · Screens / screen/title). The static art is
// one exported background; the hero menu, arrow, puppet, bugs and PRESS
// ENTER are live. Drawn directly in 1280x960 screen pixels.

// Two looks to pick from, named by what they wear rather than who they are.
const HEROES: Hero[] = ['hat', 'helmet'];
const NAMES: Record<Hero, string> = { hat: 'HAT HERO', helmet: 'HELMET HERO' };
const HERO_X = [470, 810];
const LABEL_Y = 514;

export class TitleScene extends Phaser.Scene {
  private choice = 0;
  private rigs: ChibiRig[] = [];

  constructor() {
    super('Title');
  }

  preload() {
    const base = import.meta.env.BASE_URL;
    preloadFelt(this);
    preloadHeroes(this);
    for (const [key, file] of [['title-bg', 'title-bg.jpg'], ['title-arrow', 'title-arrow.png'], ['title-press', 'title-press.png']]) {
      if (!this.textures.exists(key)) this.load.image(key, `${base}felt/${file}`);
    }
  }

  create() {
    this.scale.resize(WIDTH * Z, HEIGHT * Z);
    this.cameras.main.setSize(WIDTH * Z, HEIGHT * Z);
    document.body.classList.add('felt');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.resize(WIDTH, HEIGHT);
      document.body.classList.remove('felt');
    });
    setupFelt(this);
    for (const key of ['title-bg', 'title-arrow', 'title-press']) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.choice = Math.max(0, HEROES.indexOf(progress.hero));
    this.add.image(0, 0, 'title-bg').setOrigin(0);

    // A bug pacing between the two heroes, as in the mock
    const bug = this.add.image(640, 690, FELT, 'bug-0');
    this.tweens.add({ targets: bug, x: 680, yoyo: true, repeat: -1, duration: 2600, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: bug, angle: { from: -6, to: 6 }, yoyo: true, repeat: -1, duration: 260, ease: 'Sine.easeInOut' });

    // Both heroes stand still on the ground under their names; the chosen one is at full colour
    this.rigs = HEROES.map((h, i) => {
      const rig = new ChibiRig(this, h, 136);
      rig.root.setPosition(HERO_X[i], 714);
      // clicking a hero picks it; clicking the picked one starts
      this.add
        .zone(HERO_X[i], 630, 150, 190)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => (this.choice === i ? start() : setChoice(i)));
      return rig;
    });
    const labels = HEROES.map((h, i) =>
      this.add
        .text(HERO_X[i], LABEL_Y, `${i + 1} ${NAMES[h]}`, { fontFamily: '"Press Start 2P", monospace', fontSize: '22px', color: '#333333' })
        .setOrigin(0.5, 0),
    );
    const arrow = this.add.image(0, LABEL_Y + 11, 'title-arrow').setOrigin(1, 0.5);
    this.tweens.add({ targets: arrow, scale: 1.18, yoyo: true, repeat: -1, duration: 380, ease: 'Sine.easeInOut' });

    const press = this.add.image(452, 868, 'title-press').setOrigin(0);
    this.tweens.add({ targets: press, alpha: 0, yoyo: true, repeat: -1, duration: 500, hold: 300 });

    const setChoice = (c: number) => {
      if (ui.blocking) return;
      this.choice = (c + HEROES.length) % HEROES.length;
      arrow.setX(labels[this.choice].x - labels[this.choice].width / 2 - 8);
      labels.forEach((l, i) => l.setColor(i === this.choice ? '#111111' : '#555555'));
      this.rigs.forEach((r, i) => r.root.setAlpha(i === this.choice ? 1 : 0.55));
      sfx.select();
    };

    const k = this.input.keyboard!;
    for (const key of ['LEFT', 'A', 'UP', 'W']) k.on(`keydown-${key}`, () => setChoice(this.choice - 1));
    for (const key of ['RIGHT', 'D', 'DOWN', 'S']) k.on(`keydown-${key}`, () => setChoice(this.choice + 1));
    k.on('keydown-ONE', () => setChoice(0));
    k.on('keydown-TWO', () => setChoice(1));
    const start = () => {
      if (ui.blocking) return;
      sfx.clear();
      progress.hero = HEROES[this.choice];
      saveProgress();
      this.cameras.main.fadeOut(300);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Overworld'));
    };
    k.on('keydown-ENTER', start);
    k.on('keydown-SPACE', start);
    k.on('keydown-L', start);
    k.on('keydown-Q', () => !ui.blocking && showQuickView());
    setChoice(this.choice);
    stopMusic(); // the title is silent
    this.cameras.main.fadeIn(300);
  }
}
