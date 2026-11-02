import Phaser from 'phaser';
import { asset } from '../assets';
import { WIDTH } from './state';

// The fortress (content/levels/fortress.json): a course drawn from a tile map instead of soil and platforms.
// Felt stone walls, plush lava and fire, doors you press S at, and two rows of columns on their own slow scroll.

export interface CastleDoor {
  /** Tile of the door's top left, in the course or (`room`) the secret room. */
  x: number;
  y: number;
  room?: boolean;
  /** The door it comes out of. */
  to: { x: number; y: number; room?: boolean };
}

export interface CastleLayout {
  /** One character a tile: # is stone. */
  tiles: string[];
  lava: [number, number][];
  /** Tile x of each fire spirit, standing in the lava. */
  fires: number[];
  windows: [number, number, boolean?][];
  doors: CastleDoor[];
}

interface Strip {
  img: Phaser.GameObjects.Image;
  /** How far this strip of the flame sways: most at the tips, none at the face. */
  sway: number;
}
interface Fire {
  strips: Strip[];
  /** Holds the strips, so the whole spirit can turn over at the top of its leap. */
  body: Phaser.GameObjects.Container;
  x: number;
  /** Where it waits, out of sight under the lava. */
  y: number;
  phase: number;
  /** How high it leaps, in px. */
  leap: number;
}

const T = 16;
const STONE = 'fort-stone';
const TEAL = 'fort-stone-teal';
const LAVA = 'fort-lava';
const FLAME = 'fort-flame';
const DOOR = 'fort-door';
const WINDOW = 'fort-window';
const COLUMN = 'fort-column';
const FIRE_H = 30;
/** Strips the flame hair is cut into. The art's lower part, the face and belly, stays whole. */
const FIRE_STRIPS = 12;
const HAIR = 0.58;
/** The leap: how strongly it's pulled back down (px/s²), and how long it waits under the lava between leaps (s). */
const FIRE_GRAVITY = 520;
const FIRE_REST = 0.9;
/** The fire spirit's preferred leap, in px; ceilings can cap it. */
const FIRE_LEAP = 124;
const STILL = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function preloadCastle(scene: Phaser.Scene) {
  const art: [string, string][] = [[STONE, 'stone.jpg'], [TEAL, 'stone-teal.jpg'], [LAVA, 'lava.jpg'], [FLAME, 'flame.png'], [DOOR, 'door.png'], [WINDOW, 'window.png'], [COLUMN, 'column.png']];
  for (const [key, file] of art) if (!scene.textures.exists(key)) scene.load.image(key, asset(`felt/fortress/${file}`));
}

/** The top of the lowest floor in a tile column, in px; undefined over a pit. */
function floorRow(tiles: string[], tx: number) {
  for (let y = tiles.length - 1; y > 0; y--) if (tiles[y][tx] === '#' && tiles[y - 1][tx] !== '#') return y;
  return undefined;
}

export class Castle {
  private lava: Phaser.GameObjects.TileSprite[] = [];
  private fires: Fire[] = [];
  private hints: { door: CastleDoor; hint: Phaser.GameObjects.Text }[] = [];

  constructor(
    private scene: Phaser.Scene,
    private layout: CastleLayout,
    /** Left edge of the secret room, in world px. */
    private roomX: number,
    private solid: (x: number, y: number, w: number, h: number) => unknown,
  ) {
    for (const key of [STONE, TEAL, LAVA, FLAME, DOOR, WINDOW, COLUMN]) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.drawStone(layout.tiles, 0, STONE);
    for (const [x, w] of layout.lava) {
      const l = scene.add.tileSprite(x * T, (layout.tiles.length - 2) * T, w * T, 2 * T + 8, LAVA).setOrigin(0).setDepth(7).setTileScale(32 / 256);
      l.setData('y0', l.y);
      this.lava.push(l);
    }
    for (const [i, x] of layout.fires.entries()) this.addFire(x, i);
    for (const [x, y, room] of layout.windows) scene.add.image((room ? roomX : 0) + x * T + 8, y * T, WINDOW).setOrigin(0.5, 0).setDisplaySize(14, 32).setDepth(-5);
    for (const d of layout.doors) {
      const x = this.doorX(d);
      scene.add.image(x, d.y * T, DOOR).setOrigin(0.5, 0).setDisplaySize(24, 32).setDepth(-4);
      const hint = scene.add.text(x, d.y * T - 8, 'S: ENTER', { fontFamily: '"Fredoka", sans-serif', fontStyle: '600', fontSize: '7px', color: '#000', backgroundColor: '#fff', padding: { x: 2, y: 1 } }).setOrigin(0.5).setResolution(4).setDepth(20).setVisible(false);
      this.hints.push({ door: d, hint });
    }
  }

  private doorX(d: { x: number; room?: boolean }) {
    return (d.room ? this.roomX : 0) + d.x * T + 8;
  }

  /** Stone as big rectangles, so its texture stays on the tile grid and the physics stays light. */
  private drawStone(tiles: string[], ox: number, key: string) {
    const used = tiles.map(() => new Set<number>());
    const free = (x: number, y: number) => tiles[y]?.[x] === '#' && !used[y].has(x);
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        if (!free(x, y)) continue;
        let w = 1;
        while (free(x + w, y)) w++;
        let h = 1;
        while (y + h < tiles.length && Array.from({ length: w }, (_, k) => k).every((k) => free(x + k, y + h))) h++;
        for (let a = y; a < y + h; a++) for (let k = x; k < x + w; k++) used[a].add(k);
        this.scene.add.tileSprite(ox + x * T, y * T, w * T, h * T, key).setOrigin(0).setDepth(3).setTileScale(T / 128);
        this.solid(ox + x * T, y * T, w * T, h * T);
      }
    }
  }

  /** The secret room: teal stone over its own dark wall. */
  drawRoom(tiles: string[]) {
    this.scene.add.tileSprite(this.roomX, 0, tiles[0].length * T, tiles.length * T, TEAL).setOrigin(0).setDepth(-9).setTileScale(T / 128).setTint(0x233338);
    this.drawStone(tiles, this.roomX, TEAL);
  }

  /** The far wall and two rows of columns, each on its own slow scroll. `place` fits a far object to the camera. */
  drawFar(width: number, height: number, place: (o: Phaser.GameObjects.TileSprite, f: number) => void) {
    const wall = this.scene.add.tileSprite(-WIDTH, -height, width + 2 * WIDTH, height * 3, STONE).setOrigin(0).setDepth(-17).setTileScale(T / 128).setTint(0x2c2a33);
    place(wall, 0.2);
    for (const [f, w, gap, tint, depth] of [[0.42, 15, 74, 0x4b4853, -16], [0.68, 24, 118, 0x7a7682, -15]] as const) {
      const span = WIDTH + (width - WIDTH) * f;
      for (let x = 24; x < span; x += gap) {
        const c = this.scene.add.tileSprite(x, -height, w, height * 3, COLUMN).setOrigin(0.5, 0).setDepth(depth).setTileScale(w / 160).setTint(tint);
        place(c, f);
      }
    }
  }

  private addFire(tx: number, i: number) {
    const lavaTop = (this.layout.tiles.length - 2) * T;
    const x = tx * T + 8;
    const y = lavaTop + FIRE_H / 2 + 4;
    // up to just under whatever is overhead, in that column
    let ceiling = 0;
    for (let row = this.layout.tiles.length - 3; row >= 0; row--) {
      if (this.layout.tiles[row][tx] === '#') {
        ceiling = (row + 1) * T;
        break;
      }
    }
    const leap = Math.min(FIRE_LEAP + ((i * 37) % 3) * 12, y - ceiling - FIRE_H);
    const tex = this.scene.textures.get(FLAME).getSourceImage();
    const k = FIRE_H / tex.height;
    const hair = Math.round(tex.height * HAIR);
    const step = hair / FIRE_STRIPS;
    const body = this.scene.add.container(x, y).setDepth(6);
    const strips: Strip[] = [];
    const strip = (cy: number, ch: number, sway: number) => {
      // the container turns about the spirit's middle
      const img = this.scene.add.image(0, FIRE_H / 2, FLAME).setOrigin(0.5, 1).setScale(k).setCrop(0, cy, tex.width, ch);
      body.add(img);
      strips.push({ img, sway });
    };
    // a pixel of overlap, so no gaps open between strips as they sway
    for (let s = 0; s < FIRE_STRIPS; s++) strip(s * step, step + 1, (1 - s / FIRE_STRIPS) ** 1.5);
    strip(hair, tex.height - hair, 0);
    this.fires.push({ strips, body, x, y, phase: i * 0.73, leap });
  }

  /** Where things stand at world x (a billboard's posts, say). */
  groundAt(x: number, fallback: number) {
    const room = x >= this.roomX;
    const tiles = room ? this.roomTiles : this.layout.tiles;
    const row = floorRow(tiles, Math.floor((room ? x - this.roomX : x) / T));
    return row === undefined ? fallback : row * T;
  }

  roomTiles: string[] = [];

  /** Per frame: lava drifts and breathes, flame hair waves. Returns a fire the hero is touching, by its x. */
  update(now: number, heroBounds: Phaser.Geom.Rectangle): number | undefined {
    const t = now / 1000;
    let hit: number | undefined;
    if (!STILL) {
      for (const [i, l] of this.lava.entries()) {
        l.tilePositionX = Math.sin(t * 0.5 + i) * 40 + t * 6;
        l.y = (l.getData('y0') as number) + Math.sin(t * 0.9 + i) * 1.5;
      }
    }
    for (const f of this.fires) {
      // out of the lava and up, slowing to a stop; it turns over at the top and falls head first
      const rise = Math.sqrt((2 * f.leap) / FIRE_GRAVITY);
      const cycle = 2 * rise + FIRE_REST;
      const at = STILL ? rise : (t + f.phase) % cycle;
      const air = at < 2 * rise;
      const fromTop = at - rise;
      const height = air ? f.leap - 0.5 * FIRE_GRAVITY * fromTop * fromTop : 0;
      f.body.y = f.y - height;
      f.body.angle = Phaser.Math.Clamp((fromTop + 0.14) / 0.28, 0, 1) * 180;
      f.body.setVisible(air);
      for (const [i, s] of f.strips.entries()) {
        s.img.x = STILL ? 0 : Math.sin(t * 3.4 + f.phase - i * 0.62) * 3.2 * s.sway + Math.sin(t * 5.3 + f.phase + i) * 0.7 * s.sway;
      }
      if (air && height > 8 && Phaser.Geom.Rectangle.Overlaps(heroBounds, new Phaser.Geom.Rectangle(f.x - 7, f.body.y - 11, 14, 22))) hit = f.x;
    }
    return hit;
  }

  /** The door the hero stands at, and its prompt. */
  doorAt(x: number, feet: number, inRoom: boolean) {
    let found: CastleDoor | undefined;
    for (const { door, hint } of this.hints) {
      const on = !!door.room === inRoom && Math.abs(x - this.doorX(door)) < 11 && Math.abs(feet - (door.y + 2) * T) < 4;
      hint.setVisible(on);
      if (on) found = door;
    }
    return found;
  }

  /** Where a door lets the hero out. */
  exitOf(d: CastleDoor) {
    return { x: this.doorX(d.to), y: (d.to.y + 2) * T - 8, room: !!d.to.room };
  }
}
