import Phaser from 'phaser';
import { getSite, getWorld, getWorlds } from '../content/store';
import type { MapNode } from '../content/types';
import { StatusBar } from '../game/hud';
import { sfx } from '../game/sfx';
import { FIELD, TILE, WIDTH, progress, saveProgress, ui } from '../game/state';
import { px } from '../game/text';
import { showDialog, showLetter, showQuickView } from '../ui/overlays';
import { devBus } from '../ui/devBus';

type Dir = 'left' | 'right' | 'up' | 'down';

const COLS = WIDTH / TILE; // 20
const ROWS = FIELD / TILE; // 13

/** Path between two nodes: horizontal leg from `a`, then vertical. */
function legs(a: MapNode, b: MapNode): { x: number; y: number }[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
  ];
}

const center = (t: number) => t * TILE + TILE / 2;

export class OverworldScene extends Phaser.Scene {
  private current!: MapNode;
  private marker!: Phaser.GameObjects.Sprite;
  private moving = false;
  private hud!: StatusBar;

  constructor() {
    super('Overworld');
  }

  create() {
    const site = getSite();
    const nodes = site.map.nodes;
    this.current = nodes.find((n) => n.id === progress.mapNode) ?? nodes[0];
    this.moving = false;

    this.cameras.main.setBackgroundColor(0x000000);
    const onPath = new Set<string>();
    const mark = (x: number, y: number) => onPath.add(`${x},${y}`);

    // Background
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) this.add.image(center(x), center(y), 'map-bg');
    const frame = this.add.graphics();
    frame.lineStyle(2, 0xfcbcb0).strokeRect(TILE - 3, TILE - 3, (COLS - 2) * TILE + 6, (ROWS - 2) * TILE + 6);

    // Paths
    const g = this.add.graphics();
    for (const [ia, ib] of site.map.edges) {
      const a = nodes.find((n) => n.id === ia);
      const b = nodes.find((n) => n.id === ib);
      if (!a || !b) continue;
      const pts = legs(a, b);
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        const x0 = Math.min(p.x, q.x);
        const x1 = Math.max(p.x, q.x);
        const y0 = Math.min(p.y, q.y);
        const y1 = Math.max(p.y, q.y);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) mark(x, y);
        g.fillStyle(0xc88c38).fillRect(x0 * TILE + 4, y0 * TILE + 4, (x1 - x0) * TILE + 8, (y1 - y0) * TILE + 8);
        g.fillStyle(0xfcf0d8).fillRect(x0 * TILE + 5, y0 * TILE + 5, (x1 - x0) * TILE + 6, (y1 - y0) * TILE + 6);
      }
      // Dots along the way, like the stepping stones on the SMB3 map
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        const steps = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        for (let s = 1; s < steps; s++) {
          const x = p.x + Math.sign(q.x - p.x) * s;
          const y = p.y + Math.sign(q.y - p.y) * s;
          g.fillStyle(0xe8b878).fillRect(center(x) - 1, center(y) - 1, 2, 2);
        }
      }
    }
    nodes.forEach((n) => mark(n.x, n.y));

    // Scenery fills the rest, seeded so it doesn't move between visits
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        const near = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => onPath.has(`${x + dx},${y + dy}`) && Math.abs(dx) + Math.abs(dy) < 2));
        if (onPath.has(`${x},${y}`) || near) continue;
        const r = rand();
        if (y >= 8 && x <= 4) this.add.image(center(x), center(y), r > 0.4 ? 'map-rock' : 'map-bg');
        else if (r < 0.62) this.add.image(center(x), center(y), 'map-bush');
      }
    }

    // Nodes
    const worlds = getWorlds();
    for (const n of nodes) {
      const cx = center(n.x);
      const cy = center(n.y);
      if (n.type === 'start') this.add.image(cx, cy, 'map-start');
      else if (n.type === 'world') {
        const idx = worlds.findIndex((w) => w.slug === n.world);
        const done = n.world ? progress.cleared.includes(n.world) : false;
        this.add.image(cx, cy, done ? 'map-panel-done' : 'map-panel');
        if (!done) px(this, cx - 1, cy - 3, String(idx + 1), { color: '#ffffff' });
      } else if (n.type === 'house') {
        this.add.image(cx, cy, 'map-house');
        px(this, cx, cy + 10, n.label ?? 'ABOUT', { size: 6, color: '#000' }).setOrigin(0.5, 0);
      } else if (n.type === 'castle') {
        this.add.image(cx, cy, 'map-castle');
        const bubble = px(this, cx, cy - 20, n.label ?? 'HIRE ME!', { size: 6, color: '#000' }).setOrigin(0.5, 0.5);
        bubble.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1);
        bubble.setX(Math.min(cx, WIDTH - TILE - bubble.width / 2));
        this.tweens.add({ targets: bubble, y: bubble.y - 2, yoyo: true, repeat: -1, duration: 500 });
      }
    }

    this.marker = this.add.sprite(center(this.current.x), center(this.current.y) - 4, 'player-0').setDepth(10);
    this.tweens.add({ targets: this.marker, scaleY: 0.92, yoyo: true, repeat: -1, duration: 260 });

    this.hud = new StatusBar(this, 'WORLD 1', '');
    this.updateLabel();

    const k = this.input.keyboard!;
    const go = (d: Dir) => () => !ui.blocking && this.move(d);
    k.on('keydown-LEFT', go('left'));
    k.on('keydown-A', go('left'));
    k.on('keydown-RIGHT', go('right'));
    k.on('keydown-D', go('right'));
    k.on('keydown-UP', go('up'));
    k.on('keydown-W', go('up'));
    k.on('keydown-DOWN', go('down'));
    k.on('keydown-S', go('down'));
    const enter = () => !ui.blocking && !this.moving && void this.enter();
    k.on('keydown-ENTER', enter);
    k.on('keydown-SPACE', enter);
    k.on('keydown-Z', enter);
    k.on('keydown-Q', () => !ui.blocking && showQuickView(this.current.world));

    const offDev = devBus.on('dev', () => this.updateLabel());
    this.events.once('shutdown', offDev);
    this.cameras.main.fadeIn(250);

    if (!progress.cleared.length && this.current.type === 'start' && !this.registry.get('mapHintShown')) {
      this.registry.set('mapHintShown', true);
      const hint = px(this, center(this.current.x) - 8, center(this.current.y) + 12, 'ARROWS + ENTER', { size: 6, color: '#000' });
      hint.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1);
      this.time.delayedCall(4000, () => hint.destroy());
    }
  }

  private neighbors(): { node: MapNode; dir: Dir; path: { x: number; y: number }[] }[] {
    const site = getSite();
    const out: { node: MapNode; dir: Dir; path: { x: number; y: number }[] }[] = [];
    for (const [ia, ib] of site.map.edges) {
      if (ia !== this.current.id && ib !== this.current.id) continue;
      const a = site.map.nodes.find((n) => n.id === ia);
      const b = site.map.nodes.find((n) => n.id === ib);
      if (!a || !b) continue;
      const forward = ia === this.current.id;
      let path = legs(a, b);
      if (!forward) path = [...path].reverse();
      // drop zero-length legs
      path = path.filter((p, i) => i === 0 || p.x !== path[i - 1].x || p.y !== path[i - 1].y);
      const first = path[1];
      const dx = first.x - path[0].x;
      const dy = first.y - path[0].y;
      const dir: Dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
      out.push({ node: forward ? b : a, dir, path });
    }
    return out;
  }

  private move(d: Dir) {
    if (this.moving) return;
    const n = this.neighbors().find((n) => n.dir === d);
    if (!n) return;
    this.moving = true;
    sfx.select();
    this.marker.setFlipX(d === 'left');
    const tweens = n.path.slice(1).map((p, i) => {
      const prev = n.path[i];
      const dist = Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
      return { x: center(p.x), y: center(p.y) - 4, duration: dist * 90 };
    });
    this.tweens.chain({
      targets: this.marker,
      tweens,
      onComplete: () => {
        this.current = n.node;
        progress.mapNode = n.node.id;
        saveProgress();
        this.moving = false;
        this.updateLabel();
      },
    });
  }

  private updateLabel() {
    const n = this.current;
    let label = 'START  ▶ PICK A WORLD';
    if (n.type === 'world') {
      const w = n.world ? getWorld(n.world) : undefined;
      const idx = getWorlds().findIndex((x) => x.slug === n.world);
      label = `${idx + 1} ${(w?.title ?? '?').toUpperCase()}`.slice(0, 26);
    } else if (n.type === 'house') label = `${(n.label ?? 'ABOUT').toUpperCase()}  ▶ ENTER`;
    else if (n.type === 'castle') label = 'CASTLE  ▶ READ LETTER';
    this.hud.setLine2(label);
  }

  private async enter() {
    const n = this.current;
    if (n.type === 'world' && n.world && getWorld(n.world)) {
      sfx.select();
      this.moving = true;
      this.cameras.main.fadeOut(250);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('World', { slug: n.world }));
    } else if (n.type === 'house') {
      const about = getSite().about;
      await showDialog(about.title, about.body);
      this.input.keyboard!.resetKeys();
    } else if (n.type === 'castle') {
      await showLetter();
      this.input.keyboard!.resetKeys();
    } else {
      await showDialog('Welcome!', 'Walk the path with the arrow keys and press ENTER on a numbered panel to play that project.\n\nIn a hurry? Press Q for Quick View, a plain case-study page.');
      this.input.keyboard!.resetKeys();
    }
  }
}
