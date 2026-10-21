import Phaser from 'phaser';
import type { Beat, World } from '../content/types';
import { THEMES } from '../art/themes';
import { FIELD, GROUND_Y, TILE, lens } from './state';
import { px, wrapChars } from './text';

// Turns a world's beats into a level, left to right. Content decides the
// layout, so adding a beat in dev mode adds platforms without hand-placing tiles.

export type BumpAction =
  | { kind: 'copy'; beat: Beat & { type: 'copy' } }
  | { kind: 'image'; beat: Beat & { type: 'image' } }
  | { kind: 'decision'; beat: Beat & { type: 'decision' } }
  | { kind: 'metric'; beat: Beat & { type: 'metric' } }
  | { kind: 'none' };

export interface Bumpable {
  obj: Phaser.GameObjects.GameObject & { x: number; y: number };
  action: BumpAction;
  /** ? blocks turn into used blocks after the first hit. */
  question?: Phaser.GameObjects.Sprite;
}

export interface PipeSpot {
  x0: number;
  x1: number;
  top: number;
  beat: Beat & { type: 'decision' };
  option: 'A' | 'B';
}

export interface BeatZone {
  beat: Beat;
  index: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Level {
  width: number;
  solids: Phaser.Physics.Arcade.StaticGroup;
  bumpables: Map<Phaser.GameObjects.GameObject, Bumpable>;
  pipes: PipeSpot[];
  bugs: Phaser.Physics.Arcade.Group;
  coins: Phaser.Physics.Arcade.StaticGroup;
  goal: Phaser.GameObjects.Image;
  zones: BeatZone[];
  pits: [number, number][];
  spawnX: number;
}

/** Deterministic random so a world's scenery doesn't reshuffle on every rebuild. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const ROW = (r: number) => r * TILE;
const BRICK_ROW = 8; // y 128..144: bump from the ground, stand on with a jump

export function visibleBeats(world: World): Beat[] {
  return world.beats.filter((b) => !b.lens || b.lens === lens);
}

export function buildLevel(scene: Phaser.Scene, world: World, worldIndex: number): Level {
  const theme = THEMES[world.theme] ?? THEMES.meadow;
  const rand = rng(world.slug);
  const solids = scene.physics.add.staticGroup();
  const coins = scene.physics.add.staticGroup();
  const bugs = scene.physics.add.group({ allowGravity: true });
  const bumpables = new Map<Phaser.GameObjects.GameObject, Bumpable>();
  const pipes: PipeSpot[] = [];
  const zones: BeatZone[] = [];
  const pits: [number, number][] = [];
  const decor = scene.add.layer().setDepth(-5);

  scene.cameras.main.setBackgroundColor(theme.sky);

  const block = (tx: number, row: number, key: string, action?: BumpAction) => {
    const s = scene.add.sprite(tx * TILE + 8, ROW(row) + 8, key);
    solids.add(s);
    if (action) bumpables.set(s, { obj: s, action, question: key.startsWith('qblock') ? s : undefined });
    if (key.startsWith('qblock')) s.play('qblock');
    return s;
  };

  const solidRect = (x: number, y: number, w: number, h: number) => {
    const r = scene.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
    solids.add(r);
    return r;
  };

  // ---------- Intro sign ----------
  const signX = 40;
  const sign = scene.add.graphics().setDepth(-2);
  sign.fillStyle(0x8c4400).fillRect(signX + 20, 120, 6, GROUND_Y - 120).fillRect(signX + 150, 120, 6, GROUND_Y - 120);
  sign.fillStyle(0x000000).fillRect(signX, 28, 176, 96);
  sign.fillStyle(0xfcfcfc).fillRect(signX + 2, 30, 172, 92);
  sign.fillStyle(0x000000).fillRect(signX + 4, 32, 168, 88);
  sign.fillStyle(0xfce4a0).fillRect(signX + 5, 33, 166, 86);
  px(scene, signX + 12, 40, `WORLD ${worldIndex + 1}`, { color: '#d82800' }).setDepth(-1);
  const titleLines = wrapChars(world.title.toUpperCase(), 19, 2);
  px(scene, signX + 12, 54, titleLines.join('\n'), { color: '#000' }).setDepth(-1);
  const subY = 56 + titleLines.length * 10 + 2;
  const sub = wrapChars(world.tagline, 26, titleLines.length > 1 ? 2 : 3).join('\n');
  px(scene, signX + 12, subY, sub, { color: '#5c2800', size: 6 }).setDepth(-1);
  px(scene, signX + 12, 101, world.platform.slice(0, 26), { color: '#2038a0', size: 6 }).setDepth(-1);
  px(scene, signX + 12, 110, `${world.role}`.slice(0, 26), { color: '#2038a0', size: 6 }).setDepth(-1);
  if (worldIndex === 0) {
    px(scene, signX + 4, GROUND_Y - 28, 'ARROWS MOVE  SPACE JUMP  SHIFT RUN', { size: 6, color: '#000' }).setDepth(-1);
  }

  let tx = 16;
  const beats = visibleBeats(world);

  beats.forEach((beat, i) => {
    const startTx = tx;
    let y0 = 0;
    switch (beat.type) {
      case 'copy': {
        const lines = wrapChars(beat.headline.toUpperCase(), 26, 2);
        const longest = Math.max(...lines.map((l) => l.length));
        const n = Math.max(4, Math.ceil((longest * 8 + 12) / TILE) + 1);
        const action: BumpAction = { kind: 'copy', beat };
        block(tx, BRICK_ROW, 'qblock-0', action);
        for (let k = 1; k < n; k++) {
          block(tx + k, BRICK_ROW, 'brick', action);
          if (lines.length > 1) block(tx + k, BRICK_ROW - 1, 'brick', action);
        }
        lines.forEach((line, li) => {
          const row = lines.length > 1 ? BRICK_ROW - 1 + li : BRICK_ROW;
          px(scene, (tx + 1) * TILE + 6, ROW(row) + 4, line, { shadow: true }).setDepth(5);
        });
        y0 = ROW(BRICK_ROW - lines.length);
        tx += n + 3;
        break;
      }
      case 'image': {
        const key = `img:${beat.src}`;
        const frame = scene.textures.exists(key) ? scene.textures.get(key).getSourceImage() : null;
        const maxW = 176;
        const maxH = 96;
        let w = maxW;
        let h = maxH;
        if (frame) {
          const k = Math.min(maxW / frame.width, maxH / frame.height);
          w = Math.round(frame.width * k);
          h = Math.round(frame.height * k);
        }
        const barY = ROW(BRICK_ROW);
        const barW = Math.max(w + 12, 144);
        const bx = tx * TILE;
        const cx = bx + barW / 2;
        const g = scene.add.graphics().setDepth(-1);
        // posts
        g.fillStyle(0x8c4400).fillRect(bx + 10, barY + 12, 6, GROUND_Y - barY - 12);
        g.fillRect(bx + barW - 16, barY + 12, 6, GROUND_Y - barY - 12);
        // frame
        const fy = barY - h - 8;
        g.fillStyle(0x000000).fillRect(cx - w / 2 - 4, fy - 4, w + 8, h + 8);
        g.fillStyle(0xfcfcfc).fillRect(cx - w / 2 - 3, fy - 3, w + 6, h + 6);
        g.fillStyle(0x000000).fillRect(cx - w / 2 - 1, fy - 1, w + 2, h + 2);
        if (frame) scene.add.image(cx, fy + h / 2, key).setDisplaySize(w, h).setDepth(0);
        else px(scene, cx - 28, fy + h / 2 - 4, 'LOADING', { color: '#888' });
        // caption bar: the bump target
        const bar = solidRect(bx, barY, barW, 12);
        g.fillStyle(0x000000).fillRect(bx, barY, barW, 12);
        g.fillStyle(0x2038a0).fillRect(bx + 1, barY + 1, barW - 2, 10);
        const cap = wrapChars(beat.caption, Math.floor((barW - 20) / 6), 1)[0] ?? '';
        px(scene, bx + 6, barY + 3, `▲ ${cap}`, { size: 6 }).setDepth(1);
        bumpables.set(bar, { obj: bar, action: { kind: 'image', beat } });
        y0 = fy - 4;
        tx += Math.ceil(barW / TILE) + 3;
        break;
      }
      case 'decision': {
        const q = wrapChars(beat.question, 24, 3);
        px(scene, tx * TILE + 4, 22, q.join('\n'), { shadow: true }).setDepth(5);
        const pipe = (ptx: number, heightTiles: number, option: 'A' | 'B') => {
          const top = GROUND_Y - heightTiles * TILE;
          scene.add.image(ptx * TILE + 16, top + 8, 'pipe-top').setDepth(2);
          for (let k = 1; k < heightTiles; k++) scene.add.image(ptx * TILE + 16, top + k * TILE + 8, 'pipe-body').setDepth(2);
          solidRect(ptx * TILE, top, 32, heightTiles * TILE);
          pipes.push({ x0: ptx * TILE, x1: ptx * TILE + 32, top, beat, option });
          const opt = option === 'A' ? beat.optionA : beat.optionB;
          const label = wrapChars(`${option}: ${opt.label}`, 12, 3);
          const ly = top - 8 - label.length * 10;
          px(scene, ptx * TILE - 8, ly, label.join('\n'), { shadow: true, size: 8 }).setDepth(5);
          if (beat.chosen === option) scene.add.image(ptx * TILE + 16, ly - 12, 'icon-star').setDepth(5);
          px(scene, ptx * TILE + 6, top - 7, '▼', { color: '#fce4a0', size: 6, shadow: true }).setDepth(5);
        };
        pipe(tx + 1, 2, 'A');
        block(tx + 5, 6, 'qblock-0', { kind: 'decision', beat });
        pipe(tx + 8, 3, 'B');
        y0 = 18;
        tx += 13;
        break;
      }
      case 'metric': {
        block(tx + 1, BRICK_ROW, 'qblock-0', { kind: 'metric', beat });
        for (let k = 0; k < 4; k++) coins.add(scene.add.image((tx + k) * TILE + 8, ROW(5) + 8, 'coin'));
        y0 = ROW(4);
        tx += 6;
        break;
      }
    }
    zones.push({ beat, index: world.beats.indexOf(beat), x0: startTx * TILE - 4, x1: (tx - 2) * TILE + 4, y0, y1: GROUND_Y });

    // A short pit after every other beat keeps it a platformer, not a slideshow.
    if (i % 2 === 1 && i < beats.length - 1 && beat.type !== 'decision') {
      pits.push([tx * TILE, (tx + 2) * TILE]);
      tx += 4;
    }
    // A bug to squash on the flat stretch before most beats, kept clear of pits.
    if (i > 0 && i % 2 === 0) {
      const lastPit = pits[pits.length - 1]?.[1] ?? 0;
      const minX = Math.max((startTx - 3) * TILE, lastPit + 12);
      const maxX = (startTx + 1) * TILE;
      const bug = bugs.create((minX + maxX) / 2, GROUND_Y - 8, 'bug-0') as Phaser.Physics.Arcade.Sprite;
      bug.play('bug-walk');
      bug.setData('minX', minX).setData('maxX', maxX);
      bug.setVelocityX(-25);
      (bug.body as Phaser.Physics.Arcade.Body).setSize(14, 12).setOffset(1, 4);
    }
  });

  // ---------- Ending: staircase, then the goal box ----------
  tx += 1;
  for (let step = 1; step <= 4; step++) {
    for (let h = 0; h < step; h++) block(tx + step - 1, 10 - h, 'stair');
  }
  tx += 8;
  const endBg = scene.add.rectangle(tx * TILE, 0, 20 * TILE, FIELD, 0x000000).setOrigin(0).setDepth(-4);
  void endBg;
  const goal = scene.add.image(tx * TILE + 6 * TILE, ROW(6), `icon-${world.card}`).setDepth(5);
  const goalBox = scene.add.graphics().setDepth(4);
  goalBox.lineStyle(2, 0xffffff).strokeRect(goal.x - 14, goal.y - 14, 28, 28);
  const width = (tx + 14) * TILE;

  // ---------- Ground (with pit gaps) ----------
  let gx = 0;
  const segs: [number, number][] = [];
  for (const [a, b] of pits) {
    segs.push([gx, a]);
    gx = b;
  }
  segs.push([gx, width]);
  for (const [a, b] of segs) {
    scene.add.tileSprite(a, GROUND_Y, b - a, TILE, 'ground').setOrigin(0).setDepth(1);
    scene.add.tileSprite(a, GROUND_Y + TILE, b - a, TILE, 'ground-fill').setOrigin(0).setDepth(1);
    solidRect(a, GROUND_Y, b - a, TILE * 2);
  }

  // ---------- Scenery ----------
  for (let x = 0; x < width; x += 60 + rand() * 80) {
    decor.add(scene.add.image(x, 24 + rand() * 50, 'cloud').setScrollFactor(0.6).setAlpha(world.theme === 'night' ? 0.35 : 1));
  }
  for (let x = 120; x < width - 300; x += 140 + rand() * 160) {
    const big = rand() > 0.5;
    decor.add(scene.add.image(x, GROUND_Y, big ? 'hill-lg' : 'hill-sm').setOrigin(0.5, 1).setTint(theme.hill));
  }
  for (let x = 60; x < width - 300; x += 90 + rand() * 120) {
    if (pits.some(([a, b]) => x > a - 40 && x < b + 20)) continue;
    decor.add(scene.add.image(x, GROUND_Y, 'bush').setOrigin(0.5, 1));
  }

  return { width, solids, bumpables, pipes, bugs, coins, goal, zones, pits, spawnX: 24 };
}
