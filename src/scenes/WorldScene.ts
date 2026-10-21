import Phaser from 'phaser';
import { getWorld, getWorlds, resolveSrc } from '../content/store';
import type { World } from '../content/types';
import { StatusBar } from '../game/hud';
import { buildLevel, type Bumpable, type Level } from '../game/levelBuilder';
import { Player, createControls, type Controls } from '../game/Player';
import { sfx } from '../game/sfx';
import { FIELD, HEIGHT, markCleared, progress, saveProgress, ui } from '../game/state';
import { px } from '../game/text';
import { showDialog, showEndCard, showImage } from '../ui/overlays';
import { devBus } from '../ui/devBus';

interface WorldData {
  slug: string;
  x?: number;
}

export class WorldScene extends Phaser.Scene {
  private world!: World;
  private worldIndex = 0;
  private level!: Level;
  private player!: Player;
  private controls!: Controls;
  private hud!: StatusBar;
  private bumpCandidates: Bumpable[] = [];
  private lastBump = 0;
  private safeX = 24;
  private busy = false;
  private finished = false;
  private devLayer?: Phaser.GameObjects.Container;
  private startX?: number;

  constructor() {
    super('World');
  }

  init(data: WorldData) {
    this.world = getWorld(data.slug)!;
    this.worldIndex = Math.max(0, getWorlds().findIndex((w) => w.slug === data.slug));
    this.startX = data.x;
    this.busy = false;
    this.finished = false;
    this.bumpCandidates = [];
  }

  preload() {
    for (const b of this.world.beats) {
      if (b.type === 'image' && b.src && !this.textures.exists(`img:${b.src}`)) this.load.image(`img:${b.src}`, resolveSrc(b.src));
    }
  }

  create() {
    this.controls = createControls(this);
    this.level = buildLevel(this, this.world, this.worldIndex);
    const L = this.level;

    this.player = new Player(this, this.startX ?? L.spawnX, FIELD - 48, this.controls);
    this.safeX = this.player.x;

    this.physics.world.setBounds(0, 0, L.width, HEIGHT + 64);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.player.setCollideWorldBounds(true);

    this.physics.add.collider(this.player, L.solids, (_p, s) => {
      if (this.player.body.blocked.up || this.player.body.touching.up) {
        const b = L.bumpables.get(s as Phaser.GameObjects.GameObject);
        if (b) this.bumpCandidates.push(b);
      }
    });
    this.physics.add.collider(L.bugs, L.solids);
    this.physics.add.overlap(this.player, L.bugs, (_p, bug) => this.touchBug(bug as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, L.coins, (_p, coin) => this.collect(coin as Phaser.GameObjects.Image));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, L.width, HEIGHT);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setDeadzone(24, 200);
    cam.setRoundPixels(true);

    this.hud = new StatusBar(this, `WORLD ${this.worldIndex + 1}`, this.world.title.toUpperCase().slice(0, 26));

    const k = this.input.keyboard!;
    k.on('keydown-ESC', () => !ui.blocking && this.exitToMap());

    this.drawDevLayer();
    const offDev = devBus.on('dev', () => this.drawDevLayer());
    this.events.once('shutdown', offDev);
    cam.fadeIn(250);
  }

  update() {
    if (this.busy) return;
    this.player.update();
    const L = this.level;

    // P-meter
    this.hud.setMeter(Math.min(6, Math.floor(Math.max(0, Math.abs(this.player.body.velocity.x) - 60) / 13)));

    // Bumps: pick the block nearest the player's head
    if (this.bumpCandidates.length) {
      const now = this.time.now;
      if (now - this.lastBump > 250) {
        this.lastBump = now;
        const b = this.bumpCandidates.reduce((a, c) => (Math.abs(c.obj.x - this.player.x) < Math.abs(a.obj.x - this.player.x) ? c : a));
        void this.bump(b);
      }
      this.bumpCandidates = [];
    }

    // Pipes: press down while standing on one
    if (this.player.downPressed) {
      const p = L.pipes.find((p) => this.player.x > p.x0 + 4 && this.player.x < p.x1 - 4 && Math.abs(this.player.body.bottom - p.top) < 3);
      if (p) void this.enterPipe(p);
    }

    // Track the last safe ground for respawns after a pit
    if (this.player.body.blocked.down && !L.pits.some(([a, b]) => this.player.x > a - 24 && this.player.x < b + 24)) {
      this.safeX = this.player.x;
    }
    if (this.player.y > HEIGHT + 24) this.respawn();

    // Bugs patrol between their bounds
    for (const bug of L.bugs.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!bug.active || bug.getData('dead')) continue;
      const body = bug.body as Phaser.Physics.Arcade.Body;
      if (bug.x < bug.getData('minX') || body.blocked.left) bug.setVelocityX(25);
      if (bug.x > bug.getData('maxX') || body.blocked.right) bug.setVelocityX(-25);
      bug.setFlipX(body.velocity.x > 0);
    }

    // Goal
    if (!this.finished && Phaser.Math.Distance.Between(this.player.x, this.player.y, L.goal.x, L.goal.y) < 18) void this.finish();
    if (!this.finished) {
      const icons = ['star', 'heart', 'pencil', 'seed'];
      L.goal.setTexture(`icon-${icons[Math.floor(this.time.now / 140) % icons.length]}`);
    }
  }

  private async pauseFor(fn: () => Promise<void>) {
    this.busy = true;
    this.physics.pause();
    this.player.anims.pause();
    await fn();
    this.input.keyboard!.resetKeys();
    this.player.anims.resume();
    this.physics.resume();
    this.busy = false;
  }

  private async bump(b: Bumpable) {
    const obj = b.obj as Phaser.GameObjects.Sprite;
    sfx.bump();
    if (obj.type === 'Sprite') {
      this.tweens.add({ targets: obj, y: obj.y - 5, duration: 70, yoyo: true });
    }
    const a = b.action;
    if (b.question) {
      b.question.stop();
      b.question.setTexture('used');
      b.question = undefined;
    }
    // let the bump animation read before the overlay covers it
    await new Promise((r) => this.time.delayedCall(140, r));
    switch (a.kind) {
      case 'copy':
        return this.pauseFor(() => showDialog(a.beat.headline, a.beat.body));
      case 'image':
        return this.pauseFor(() => showImage(a.beat.src, a.beat.caption, a.beat.alt));
      case 'decision': {
        const pick = a.beat.chosen === 'A' ? a.beat.optionA : a.beat.optionB;
        return this.pauseFor(() =>
          showDialog(`Chose ${a.beat.chosen}: ${pick.label}`, `${a.beat.why}\n\nTip: stand on a pipe and press ↓ to read each option.`, a.beat.question),
        );
      }
      case 'metric': {
        sfx.coin();
        this.addCoins(1);
        const t = px(this, obj.x, obj.y - 20, a.beat.value, { color: '#fce4a0', shadow: true, size: 8 }).setOrigin(0.5).setDepth(20);
        this.tweens.add({ targets: t, y: t.y - 14, duration: 400, ease: 'Quad.easeOut' });
        const coin = this.add.image(obj.x, obj.y - 12, 'coin').setDepth(19);
        this.tweens.add({ targets: coin, y: coin.y - 30, alpha: 0, duration: 400, onComplete: () => coin.destroy() });
        await new Promise((r) => this.time.delayedCall(450, r));
        return this.pauseFor(() => showDialog(a.beat.label, a.beat.body || a.beat.label, a.beat.value));
      }
    }
  }

  private async enterPipe(p: Level['pipes'][number]) {
    sfx.pipe();
    const opt = p.option === 'A' ? p.beat.optionA : p.beat.optionB;
    const won = p.beat.chosen === p.option;
    await this.pauseFor(() =>
      showDialog(`Option ${p.option}: ${opt.label}`, opt.body + (won ? '\n\n★ This is the one I shipped.' : ''), p.beat.question),
    );
  }

  private touchBug(bug: Phaser.Physics.Arcade.Sprite) {
    if (bug.getData('dead') || this.busy) return;
    const pb = this.player.body;
    if (pb.velocity.y > 0 && pb.bottom - (bug.body as Phaser.Physics.Arcade.Body).top < 8) {
      bug.setData('dead', true);
      bug.anims.stop();
      bug.setTexture('bug-flat');
      (bug.body as Phaser.Physics.Arcade.Body).enable = false;
      sfx.stomp();
      this.player.bounce();
      const t = px(this, bug.x, bug.y - 16, 'BUG FIXED!', { color: '#ffffff', shadow: true, size: 6 }).setOrigin(0.5).setDepth(20);
      this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 900, onComplete: () => t.destroy() });
      this.time.delayedCall(500, () => bug.destroy());
    } else {
      this.player.hurt(bug.x);
    }
  }

  private collect(coin: Phaser.GameObjects.Image) {
    coin.destroy();
    sfx.coin();
    this.addCoins(1);
  }

  private addCoins(n: number) {
    progress.coins += n;
    saveProgress();
    this.hud.setCoins(progress.coins);
  }

  private respawn() {
    sfx.hurt();
    this.player.setPosition(Math.max(24, this.safeX - 16), FIELD - 64);
    this.player.setVelocity(0, 0);
    this.player.hurt(this.player.x + 1);
  }

  private async finish() {
    this.finished = true;
    this.level.goal.setTexture(`icon-${this.world.card}`);
    this.tweens.add({ targets: this.level.goal, y: this.level.goal.y - 40, duration: 600, ease: 'Quad.easeOut' });
    markCleared(this.world.slug);
    await this.pauseFor(() => showEndCard(this.world, this.textures.getBase64(`icon-${this.world.card}`)));
    this.exitToMap();
  }

  private exitToMap() {
    this.busy = true;
    this.cameras.main.fadeOut(200);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Overworld'));
  }

  /** In dev mode every beat gets an outline and a label you can click to edit. */
  private drawDevLayer() {
    this.devLayer?.destroy();
    this.devLayer = undefined;
    if (!ui.dev) return;
    const c = this.add.container(0, 0).setDepth(90);
    for (const z of this.level.zones) {
      const g = this.add.graphics();
      g.lineStyle(1, 0xffffff, 0.9).strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      g.fillStyle(0xffffff, 0.06).fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      const label = px(this, z.x0 + 2, z.y0 + 2, `#${z.index + 1} ${z.beat.type}`, { size: 6, color: '#000' });
      label.setBackgroundColor('#ffffff').setPadding(1, 1, 1, 0);
      const hit = this.add
        .zone(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0)
        .setOrigin(0)
        .setInteractive({ cursor: 'pointer' });
      hit.on('pointerdown', () => devBus.emit('select', { slug: this.world.slug, beatId: z.beat.id }));
      c.add([g, label, hit]);
    }
    this.devLayer = c;
  }

  get playerX() {
    return this.player?.x ?? 24;
  }

  get slug() {
    return this.world.slug;
  }
}
