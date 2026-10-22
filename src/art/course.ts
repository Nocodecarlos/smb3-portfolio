import Phaser from 'phaser';

// Art for hand-built courses (World 1-1 and later), matched to the Figma
// reference: mint sky, diagonal ochre ground, bolted pastel platforms with
// drop shadows, note blocks, dotted bushes. All original pixel art.

type Pal = Record<string, string>;

const PAL: Pal = {
  K: '#000000',
  W: '#ffffff',
  w: '#f8fff8',
  O: '#f0a64a', // ochre
  o: '#ffd89c', // pale ochre
  U: '#9c5414', // dark ochre
  B: '#663d22', // block border brown
  T: '#e8904a', // wood/brick orange
  t: '#ffe0b8', // cream highlight
  b: '#b8582a', // brick shade
  G: '#f8a800', // gold
  g: '#ffe8a0', // pale gold
  N: '#24503c', // note-block green
  C: '#3090d0', // switch blue
  c: '#d8f8f8', // switch pale
  E: '#22b81c', // leaf green
  e: '#8ae84a', // light green
  X: '#0c4a00', // dark green
  S: '#f8d8b0', // skin
  R: '#e04820', // shoes
  P: '#7a4cc8', // plant purple
  p: '#c8a8f8', // plant light
  Y: '#fce4a0', // teeth
  L: '#c4f0fc', // diamond light
  D: '#4858e0', // diamond blue
  F: '#f878b8', // feather pink
  f: '#fcd0e8', // feather light
  Q: '#a0a0a0', // quill grey
  V: '#b8dcf8', // cloud shade
};

function canvas(scene: Phaser.Scene, key: string, w: number, h: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  return { tex, ctx: tex.getContext() };
}

function pix(scene: Phaser.Scene, key: string, rows: string[]) {
  const w = Math.max(...rows.map((r) => r.length));
  const { tex, ctx } = canvas(scene, key, w, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = PAL[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  tex.refresh();
}

function draw(scene: Phaser.Scene, key: string, w: number, h: number, fn: (c: CanvasRenderingContext2D) => void) {
  const { tex, ctx } = canvas(scene, key, w, h);
  fn(ctx);
  tex.refresh();
}

/** Diagonal "interlocking" soil, period 8px so tiles join seamlessly. */
function soil(c: CanvasRenderingContext2D, y0: number) {
  for (let y = y0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = (x + y * 2) % 8;
      c.fillStyle = d < 2 ? PAL.U : d === 2 ? PAL.o : PAL.O;
      c.fillRect(x, y, 1, 1);
    }
  }
}

export function generateCourseTextures(scene: Phaser.Scene) {
  draw(scene, 'soil-top', 16, 16, (c) => {
    soil(c, 3);
    c.fillStyle = PAL.K;
    c.fillRect(0, 0, 16, 1);
    c.fillStyle = PAL.o;
    c.fillRect(0, 1, 16, 2);
  });
  draw(scene, 'soil', 16, 16, (c) => soil(c, 0));

  // ? block in the reference style: gold, brown border, corner rivets
  pix(scene, 'q2-0', [
    'BBBBBBBBBBBBBBBB',
    'BGGGGGGGGGGGGGGB',
    'BGBGGGGGGGGGGBGB',
    'BGGGGggggGGGGGGB',
    'BGGGgggBBggGGGGB',
    'BGGGggBGGggBGGGB',
    'BGGGGBBGGggBGGGB',
    'BGGGGGGGggBBGGGB',
    'BGGGGGGggBBGGGGB',
    'BGGGGGGggBGGGGGB',
    'BGGGGGGGBBGGGGGB',
    'BGGGGGGggGGGGGGB',
    'BGGGGGGggBGGGGGB',
    'BGBGGGGGBBGGGBGB',
    'BGGGGGGGGGGGGGGB',
    'BBBBBBBBBBBBBBBB',
  ]);
  pix(scene, 'q2-1', [
    'BBBBBBBBBBBBBBBB',
    'BTTTTTTTTTTTTTTB',
    'BTBTTTTTTTTTTBTB',
    'BTTTTggggTTTTTTB',
    'BTTTgggBBggTTTTB',
    'BTTTggBTTggBTTTB',
    'BTTTTBBTTggBTTTB',
    'BTTTTTTTggBBTTTB',
    'BTTTTTTggBBTTTTB',
    'BTTTTTTggBTTTTTB',
    'BTTTTTTTBBTTTTTB',
    'BTTTTTTggTTTTTTB',
    'BTTTTTTggBTTTTTB',
    'BTBTTTTTBBTTTBTB',
    'BTTTTTTTTTTTTTTB',
    'BBBBBBBBBBBBBBBB',
  ]);
  pix(scene, 'empty', [
    'BBBBBBBBBBBBBBBB',
    'BbbbbbbbbbbbbbbB',
    'BbBbbbbbbbbbbBbB',
    ...Array(10).fill('BbbbbbbbbbbbbbbB'),
    'BbBbbbbbbbbbbBbB',
    'BbbbbbbbbbbbbbbB',
    'BBBBBBBBBBBBBBBB',
  ]);
  // Wooden item block: cream inverted triangle, dark base stripe
  pix(scene, 'wood', [
    'BBBBBBBBBBBBBBBB',
    'BTTTTTTTTTTTTTTB',
    'BTttttttttttttTB',
    'BTTTTTTTTTTTTTTB',
    'BTTTttttttttTTTB',
    'BTTTTttttttTTTTB',
    'BTTTTTttttTTTTTB',
    'BTTTTTttttTTTTTB',
    'BTTTTTTttTTTTTTB',
    'BTTTTTTttTTTTTTB',
    'BTTTTTTTTTTTTTTB',
    'BTTTTTTTTTTTTTTB',
    'BTbbbbbbbbbbbbTB',
    'BTbbbbbbbbbbbbTB',
    'BTTTTTTTTTTTTTTB',
    'BBBBBBBBBBBBBBBB',
  ]);
  pix(scene, 'brick2', [
    'BBBBBBBBBBBBBBBB',
    'BTTTTTTBTTTTTTTB',
    'BTttttTBTttttTTB',
    'BTTTTTTBTTTTTTTB',
    'BTTTTTTBTTTTTTTB',
    'BbbbbbbBbbbbbbbB',
    'BBBBBBBBBBBBBBBB',
    'BTTTBTTTTTTTTTTB',
    'BTttBTttttttTTTB',
    'BTTTBTTTTTTTTTTB',
    'BTTTBTTTTTTTTTTB',
    'BTTTBTTTTTTTTTTB',
    'BbbbBbbbbbbbbbbB',
    'BTTTBTTTTTTTTTTB',
    'BbbbBbbbbbbbbbbB',
    'BBBBBBBBBBBBBBBB',
  ]);
  pix(scene, 'note', [
    '..NNNNNNNNNNNN..',
    '.NwwwwwwwwwwwwN.',
    'NwwwwwwwwwwwwwwN',
    'NwwwwwwwwwwwwwwN',
    'NwwwwwwwwNNNwwwN',
    'NwwwwwwwwNwwwwwN',
    'NwwwwwwwwNwwwwwN',
    'NwwwwwwwwNwwwwwN',
    'NwwwwwwwwNwwwwwN',
    'NwwwwwwNNNwwwwwN',
    'NwwwwwNNNNwwwwwN',
    'NwwwwwNNNwwwwwwN',
    'NwwwwwwwwwwwwwwN',
    'NwwwwwwwwwwwwwwN',
    '.NwwwwwwwwwwwwN.',
    '..NNNNNNNNNNNN..',
  ]);
  pix(scene, 'pswitch', [
    'BBBBBBBBBBBBBBBB',
    'BCCCCCCCCCCCCCCB',
    'BCCcccccccCCCCCB',
    'BCCccCCCCccCCCCB',
    'BCCccCCCCCccCCCB',
    'BCCccCCCCCccCCCB',
    'BCCccCCCCccCCCCB',
    'BCCcccccccCCCCCB',
    'BCCccCCCCCCCCCCB',
    'BCCccCCCCCCCCCCB',
    'BCCccCCCCCCCCCCB',
    'BCCccCCCCCCCCCCB',
    'BCCccCCCCCCCCCCB',
    'BCCCCCCCCCCCCCCB',
    'BCCCCCCCCCCCCCCB',
    'BBBBBBBBBBBBBBBB',
  ]);
  pix(scene, 'pswitch-flat', [
    ...Array(11).fill('................'),
    '.BBBBBBBBBBBBBB.',
    'BCCcccccccccCCCB',
    'BCCCCCCCCCCCCCCB',
    'BBBBBBBBBBBBBBBB',
    '................',
  ]);
  // Feather power-up (stands in for a flight power-up)
  pix(scene, 'feather', [
    '..........KKK...',
    '........KKffFK..',
    '.......KffFFFK..',
    '......KfFFFFK...',
    '.....KfFFFFFK...',
    '....KfFFFFFK....',
    '....KfFFFFK.....',
    '...KfFFFFFK.....',
    '...KfFFFFK......',
    '..KfFFFFK.......',
    '..KFFFFK........',
    '..KFFFK.........',
    '.KQKKK..........',
    '.KQK............',
    'KQK.............',
    'KK..............',
  ]);
  pix(scene, 'shrub', [
    '................',
    '.......X........',
    '......XEX.......',
    '.....XeEEX......',
    '.....XeEEX......',
    '....XeeEEEX.....',
    '....XeeEEEX.....',
    '...XeeeEEEEX....',
    '...XeeEEEEEX....',
    '..XeeeEEEEEEX...',
    '..XeeEEEEEEEX...',
    '..XeeEEEEEEEX...',
    '.XeeEEEEEEEEEX..',
    '.XeEEEEEEEEEEX..',
    '.XEEEEEEEEEEEX..',
    '.XXXXXXXXXXXXX..',
  ]);
  // Hiker: the taller walker, round head, green tunic
  const hikerTop = [
    '.....KKKKK......',
    '....KSSSSSK.....',
    '...KSSSSSSSK....',
    '...KSSKSSKSK....',
    '...KSSKSSKSK....',
    '...KSSSSSSSK....',
    '....KSSSSSK.....',
    '.....KKKKK......',
    '...KKEEEEEKK....',
    '..KEeEEEEEEEK...',
    '..KeEEEEEEEEK...',
    '.KSKEEEEEEEKSK..',
    '.KSKEEEEEEEKSK..',
    '..KKEEEEEEEKK...',
    '...KSSSSSSSK....',
    '...KSSSSSSSK....',
  ];
  pix(scene, 'hiker-0', [...hikerTop, '...KSSK.KSSK....', '..KRRRK.KRRRK...', '..KKKKK.KKKKK...', '................']);
  pix(scene, 'hiker-1', [...hikerTop, '....KSSKSSK.....', '...KRRRKRRRK....', '...KKKKKKKKK....', '................']);
  pix(scene, 'hiker-flat', [...Array(12).fill('................'), '..KKKKKKKKKKK...', '.KSKEEEEEEEKSK..', '.KRRRKKKKKRRRK..', '.KKKKK...KKKKK..']);
  // Snapper: a purple pitcher-flower that lives in pipes
  const stem = ['.......XX.......', '....XX.XX.XX....', '...XeEXXXEeX....', '....XXEXXEX.....', '.......XX.......', '.......XX.......', '.......XX.......', '.......XX.......'];
  pix(scene, 'snapper-0', [
    '.....KKKKKK.....',
    '...KKPPPPPPKK...',
    '..KPPpPPPPpPPK..',
    '.KPPpppPPpppPPK.',
    '.KPPPPPPPPPPPPK.',
    '.KKYKYKYKYKYKKK.',
    '..K..........K..',
    '.KKYKYKYKYKYKKK.',
    '.KPPPPPPPPPPPPK.',
    '..KPPPPPPPPPPK..',
    '...KKPPPPPPKK...',
    '.....KKKKKK.....',
    ...stem,
  ]);
  pix(scene, 'snapper-1', [
    '................',
    '.....KKKKKK.....',
    '...KKPPPPPPKK...',
    '..KPPpPPPPpPPK..',
    '.KPPpppPPpppPPK.',
    '.KPPPPPPPPPPPPK.',
    '.KKYKYKYKYKYKKK.',
    '.KKYKYKYKYKYKKK.',
    '.KPPPPPPPPPPPPK.',
    '..KPPPPPPPPPPK..',
    '...KKPPPPPPKK...',
    '.....KKKKKK.....',
    ...stem,
  ]);
  draw(scene, 'diamond', 16, 16, (c) => {
    c.fillStyle = PAL.D;
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = PAL.L;
    for (let y = 0; y < 16; y++) c.fillRect(0, y, 16 - y, 1);
  });
  draw(scene, 'glint', 5, 5, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(2, 0, 1, 5);
    c.fillRect(0, 2, 5, 1);
    c.globalAlpha = 0.5;
    c.fillRect(1, 1, 3, 3);
  });
  cloud(scene, 'cloud-s', 32);
  cloud(scene, 'cloud-m', 46);
  cloud(scene, 'cloud-l', 62);
  // Pipes in the reference greens
  const pipe = (key: string, top: boolean) =>
    draw(scene, key, 32, 16, (c) => {
      const x0 = top ? 0 : 2;
      const w = top ? 32 : 28;
      c.fillStyle = '#000';
      c.fillRect(x0, 0, w, 16);
      const stripes: [number, number, string][] = [
        [1, 3, '#2ca818'], [4, 2, '#8ae84a'], [6, 4, '#5cd030'], [10, 1, '#8ae84a'], [11, 5, '#2ca818'], [16, 3, '#1c8917'], [19, w - 22, '#0c6a00'],
      ];
      for (const [sx, sw, col] of stripes) {
        c.fillStyle = col;
        c.fillRect(x0 + sx, top ? 1 : 0, Math.min(sw, w - 1 - sx), top ? 14 : 16);
      }
    });
  pipe('pipe2-top', true);
  pipe('pipe2-body', false);
  // Dark pipe in the coin room ceiling
  draw(scene, 'pipe-dark', 32, 32, (c) => {
    c.fillStyle = '#e8f0e8';
    c.fillRect(2, 0, 28, 24);
    c.fillStyle = '#1a1e24';
    c.fillRect(4, 0, 24, 22);
    c.fillStyle = '#e8f0e8';
    c.fillRect(0, 22, 32, 8);
    c.fillStyle = '#1a1e24';
    c.fillRect(2, 24, 28, 4);
  });

  // Powered-up player: same frames with a red beanie
  for (let i = 0; i < 4; i++) recolor(scene, `player-${i}`, `playerF-${i}`, { '32,96,224': [216, 40, 0], '104,168,248': [248, 120, 184] });
}

function cloud(scene: Phaser.Scene, key: string, w: number) {
  const h = 18;
  const { tex, ctx } = canvas(scene, key, w, h);
  const humps = Math.max(2, Math.round(w / 14));
  const inside = (x: number, y: number) => {
    if (y >= 9 && y <= 16 && x >= 2 && x <= w - 3) return true;
    for (let i = 0; i < humps; i++) {
      const cx = 6 + (i * (w - 12)) / (humps - 1);
      const r = i === Math.floor(humps / 2) ? 8 : 6;
      if ((x - cx) ** 2 + (y - 10) ** 2 <= r * r) return true;
    }
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      ctx.fillStyle = edge ? '#000' : y >= 14 ? PAL.V : '#fff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // eyes
  ctx.fillStyle = '#000';
  ctx.fillRect(Math.floor(w / 2) - 3, 8, 1, 3);
  ctx.fillRect(Math.floor(w / 2) + 2, 8, 1, 3);
  tex.refresh();
}

function recolor(scene: Phaser.Scene, from: string, to: string, map: Record<string, [number, number, number]>) {
  const src = scene.textures.get(from).getSourceImage() as HTMLCanvasElement;
  const { tex, ctx } = canvas(scene, to, src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const k = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
    const m = map[k];
    if (m) [img.data[i], img.data[i + 1], img.data[i + 2]] = m;
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

/** Tall capsule bush with the dotted "seed" pattern, any size. */
export function bushTexture(scene: Phaser.Scene, w: number, h: number): string {
  const key = `bush2-${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const { tex, ctx } = canvas(scene, key, w, h);
  const r = w / 2;
  const inside = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && (y >= r || (x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1);
      ctx.fillStyle = edge ? PAL.X : PAL.E;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // seeds: 2×3 ovals in a staggered grid
  for (let y = 5; y < h - 2; y += 6) {
    for (let x = 4 + ((y / 6) % 2) * 3; x < w - 3; x += 6) {
      if (!inside(x - 1, y - 1) || !inside(x + 2, y + 3)) continue;
      ctx.fillStyle = '#1a8a14';
      ctx.fillRect(x, y, 2, 3);
      ctx.fillStyle = PAL.e;
      ctx.fillRect(x, y, 1, 2);
    }
  }
  tex.refresh();
  return key;
}

/** A bolted pastel platform face with its drop shadow, drawn into a Graphics. */
export function drawPlatform(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number) {
  g.fillStyle(0x000000).fillRect(x + 8, y + 8, w, h);
  g.fillStyle(0x203028).fillRect(x, y, w, h);
  g.fillStyle(color).fillRect(x + 1, y + 1, w - 2, h - 1);
  const bolt = (bx: number, by: number) => {
    g.fillStyle(0x203028).fillRect(bx, by, 5, 5);
    g.fillStyle(0xf8f8f8).fillRect(bx + 1, by + 1, 1, 3).fillRect(bx + 3, by + 1, 1, 3);
  };
  bolt(x + 2, y + 2);
  bolt(x + w - 7, y + 2);
  if (h >= 24) {
    bolt(x + 2, y + h - 7);
    bolt(x + w - 7, y + h - 7);
  }
}

export function registerCourseAnims(scene: Phaser.Scene) {
  const a = scene.anims;
  if (a.exists('hiker-walk')) return;
  a.create({ key: 'hiker-walk', frames: [{ key: 'hiker-0' }, { key: 'hiker-1' }], frameRate: 5, repeat: -1 });
  a.create({ key: 'snap', frames: [{ key: 'snapper-0' }, { key: 'snapper-1' }], frameRate: 4, repeat: -1 });
  a.create({ key: 'q2', frames: [{ key: 'q2-0', duration: 900 }, { key: 'q2-1', duration: 160 }], repeat: -1 });
  a.create({ key: 'walkF', frames: [{ key: 'playerF-1' }, { key: 'playerF-2' }], frameRate: 10, repeat: -1 });
}
