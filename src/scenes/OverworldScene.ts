import Phaser from 'phaser';
import { ART, FELT, Z, preloadFelt, setupFelt } from '../art/felt';
import { heroFront, preloadHeroes } from '../art/hero';
import { getSite, getWorld, getWorlds } from '../content/store';
import type { MapNode } from '../content/types';
import { FeltStatusBar } from '../game/feltHud';
import { playMusic } from '../game/music';
import { sfx } from '../game/sfx';
import { BAR, HEIGHT, WIDTH, progress, saveProgress, ui } from '../game/state';
import { px } from '../game/text';
import { showDialog, showLetter, showQuickView } from '../ui/overlays';
import { devBus } from '../ui/devBus';
import { asset } from '../assets';

// The felt overworld (Figma: 02 · Screens / overworld · felt). The map art
// is one image; stops, roads and what each stop does come from
// content/site.json, with positions in the Figma map's pixels.

type Dir = 'left' | 'right' | 'up' | 'down';

/** The Figma map frame's width (overworld · felt · 16:9); the map fills the screen's width. */
const MAP_W = 2668;
const K = WIDTH / MAP_W;
const MAP_H = 1384 * K;
/** Texture pixels per Figma pixel in the exported map art (map-bg.jpg, map-lock.png). */
const MAP_TEX = 1.25;

const at = (n: MapNode) => ({ x: n.x * K, y: n.y * K });

/** The hero on the map covers most of a world tile (about 25x23 game px): its height, and how far below a stop's centre its feet stand. */
const MARKER_H = 24;
const MARKER_FEET = 10;

export class OverworldScene extends Phaser.Scene {
  private current!: MapNode;
  private marker!: Phaser.GameObjects.Container;
  private markerImg!: Phaser.GameObjects.Image;
  private moving = false;
  private hud!: FeltStatusBar;
  private lockArt?: Phaser.GameObjects.Image;

  constructor() {
    super('Overworld');
  }

  preload() {
    preloadFelt(this);
    preloadHeroes(this);
    if (!this.textures.exists('felt-map')) this.load.image('felt-map', asset('felt/map-bg.jpg'));
    if (!this.textures.exists('felt-map-lock')) this.load.image('felt-map-lock', asset('felt/map-lock.png'));
  }

  create() {
    const site = getSite();
    const nodes = site.map.nodes;
    this.current = nodes.find((n) => n.id === progress.mapNode) ?? nodes.find((n) => n.type === 'start') ?? nodes[0];
    this.moving = false;

    this.scale.resize(WIDTH * Z, HEIGHT * Z);
    const cam = this.cameras.main;
    cam.setSize(WIDTH * Z, HEIGHT * Z).setZoom(Z).setRoundPixels(false).setBackgroundColor(0xe8807a);
    document.body.classList.add('felt');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.resize(WIDTH, HEIGHT);
      document.body.classList.remove('felt');
    });
    setupFelt(this);
    for (const key of ['felt-map', 'felt-map-lock']) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.add.image(0, 0, 'felt-map').setOrigin(0).setDisplaySize(WIDTH, MAP_H);

    // Live pieces on top of the art: the lock (until opened), cleared-world cards, signs
    const lock = nodes.find((n) => n.type === 'lock');
    if (lock && !this.isOpen(lock)) {
      const p = at(lock);
      this.lockArt = this.add.image(p.x, p.y, 'felt-map-lock').setScale(K / MAP_TEX);
    }
    const worlds = getWorlds();
    for (const n of nodes) {
      const p = at(n);
      if (n.type === 'world' && n.world && progress.cleared.includes(n.world)) {
        const card = worlds.find((w) => w.slug === n.world)?.card ?? 'star';
        this.add.image(p.x + 9, p.y - 9, FELT, `icon-${card}`).setScale(0.45 / ART);
      }
      if ((n.type === 'house' || n.type === 'castle') && n.label) {
        const sign = px(this, p.x, p.y - (n.type === 'castle' ? 30 : 16), n.label, { size: 6, color: '#000' }).setOrigin(0.5);
        sign.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1).setDepth(5);
        if (n.type === 'castle') this.tweens.add({ targets: sign, y: sign.y - 2, yoyo: true, repeat: -1, duration: 500 });
      }
    }

    // The chosen hero walks the roads
    // The chosen hero faces us on the map (Figma: sprite/player-*-overworld-0) and hops along the roads
    const key = heroFront(progress.hero);
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.markerImg = this.add.image(0, 0, key).setOrigin(0.5, 1);
    this.markerImg.setScale(MARKER_H / this.markerImg.height);
    const start = at(this.current);
    this.marker = this.add.container(start.x, start.y + MARKER_FEET, [this.markerImg]).setDepth(10);

    cam.setBounds(0, 0, WIDTH, MAP_H + BAR);
    cam.startFollow(this.marker, true, 0.2, 0.2);

    this.hud = new FeltStatusBar(this, 'WORLD 1', '');
    this.updateLabel();

    const k = this.input.keyboard!;
    const go = (d: Dir) => () => !ui.blocking && this.move(d);
    for (const [key, d] of [['LEFT', 'left'], ['A', 'left'], ['RIGHT', 'right'], ['D', 'right'], ['UP', 'up'], ['W', 'up'], ['DOWN', 'down'], ['S', 'down']] as [string, Dir][]) {
      k.on(`keydown-${key}`, go(d));
    }
    const enter = () => !ui.blocking && !this.moving && void this.enter();
    for (const key of ['ENTER', 'SPACE', 'L', 'Z']) k.on(`keydown-${key}`, enter);
    k.on('keydown-Q', () => !ui.blocking && showQuickView(this.current.world));

    const offDev = devBus.on('dev', () => this.updateLabel());
    this.events.once('shutdown', offDev);
    cam.fadeIn(250);
    playMusic(this, 'overworld');

    if (!progress.cleared.length && this.current.type === 'start' && !this.registry.get('mapHintShown')) {
      this.registry.set('mapHintShown', true);
      const hint = px(this, start.x, start.y + 12, 'WASD + ENTER', { size: 6, color: '#000' }).setOrigin(0.5, 0).setDepth(20);
      hint.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1);
      this.time.delayedCall(4000, () => hint.destroy());
    }
  }

  update(_time: number, delta: number) {
    const t = this.time.now;
    this.markerImg.y = this.moving ? -Math.abs(Math.sin(t / 85)) * 2.5 : Math.sin(t / 420) * 0.35;
  }

  private isOpen(n: MapNode) {
    return n.type !== 'lock' || (n.requires ?? []).every((slug) => progress.cleared.includes(slug));
  }

  /** Stops joined to the current one, keyed by the direction you press to reach them. */
  private neighbors(): { node: MapNode; dir: Dir }[] {
    const site = getSite();
    const out: { node: MapNode; dir: Dir }[] = [];
    for (const [ia, ib] of site.map.edges) {
      if (ia !== this.current.id && ib !== this.current.id) continue;
      const other = site.map.nodes.find((n) => n.id === (ia === this.current.id ? ib : ia));
      if (!other) continue;
      const dx = other.x - this.current.x;
      const dy = other.y - this.current.y;
      const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      out.push({ node: other, dir });
    }
    return out;
  }

  private move(d: Dir) {
    if (this.moving) return;
    const next = this.neighbors().find((n) => n.dir === d);
    if (!next) return;
    if (!this.isOpen(next.node)) {
      sfx.bump();
      const need = (next.node.requires ?? []).map((slug) => getWorlds().findIndex((w) => w.slug === slug) + 1).filter(Boolean);
      this.hud.setLine2(`LOCKED » CLEAR WORLD ${need.join(' + ') || '?'}`);
      this.tweens.add({ targets: this.lockArt, angle: { from: -6, to: 6 }, yoyo: true, repeat: 2, duration: 60, onComplete: () => this.lockArt?.setAngle(0) });
      return;
    }
    this.moving = true;
    sfx.select();
    const from = at(this.current);
    const to = at(next.node);
    this.tweens.add({
      targets: this.marker,
      x: to.x,
      y: to.y + MARKER_FEET,
      duration: Math.max(180, Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y) * 14),
      onComplete: () => {
        this.current = next.node;
        progress.mapNode = next.node.id;
        saveProgress();
        this.moving = false;
        this.updateLabel();
      },
    });
  }

  private updateLabel() {
    const n = this.current;
    const name = (n.label ?? n.title ?? '').toUpperCase();
    let world = 'WORLD 1';
    let label = 'START  »  PICK A WORLD';
    if (n.type === 'world') {
      const w = n.world ? getWorld(n.world) : undefined;
      world = `WORLD ${n.number ?? '?'}`;
      label = w ? w.title.toUpperCase() : 'COMING SOON';
    } else if (n.type === 'house') label = `${name || 'HOUSE'}  »  ENTER`;
    else if (n.type === 'castle') label = `${name || 'CASTLE'}  »  READ LETTER`;
    else if (n.type === 'spade' || n.type === 'fortress') label = `${name || n.type.toUpperCase()}  »  ENTER`;
    else if (n.type !== 'start') label = '';
    this.hud.setWorld(world);
    this.hud.setLine2(label.slice(0, 30));
  }

  private async enter() {
    const n = this.current;
    if (n.type === 'world' && n.world && getWorld(n.world)) {
      sfx.select();
      this.moving = true;
      this.cameras.main.fadeOut(250);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(getWorld(n.world!)?.level ? 'Course' : 'World', { slug: n.world }));
      return;
    }
    if (n.type === 'step' || n.type === 'lock') return;
    if (n.type === 'castle') await showLetter();
    else if (n.about) await showDialog(getSite().about.title, getSite().about.body);
    else if (n.title || n.body) await showDialog(n.title ?? '', n.body ?? '');
    else if (n.type === 'start') {
      await showDialog('Welcome!', 'Walk the roads with WASD and press ENTER on a numbered panel to play that project. Mushroom houses, the bonus panel and the fortress open up as they are built.\n\nIn a hurry? Press Q for Quick View, a plain case-study page.');
    }
    this.input.keyboard!.resetKeys();
  }
}
