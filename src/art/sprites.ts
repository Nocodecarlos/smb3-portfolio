import Phaser from 'phaser';

// All art is original and generated at boot: pixel maps for characters and
// icons, procedural drawing for tiles and scenery. No image files to manage.

type Pal = Record<string, string>;

const BASE: Pal = {
  K: '#000000',
  W: '#ffffff',
  S: '#f8b888', // skin
  H: '#5c2800', // hair
  B: '#2060e0', // beanie
  L: '#68a8f8', // beanie highlight
  O: '#e85c10', // shirt
  D: '#2038a0', // jeans
  N: '#7c3800', // shoes
  G: '#f8b800', // gold
  Y: '#fce4a0', // pale gold
  R: '#d82800', // red
  P: '#f878f8', // pink
  E: '#00a800', // green
  e: '#80d010', // light green
  q: '#005800', // dark green
  A: '#a0a0a0', // grey
  a: '#606060', // dark grey
  T: '#c84c0c', // brick
  U: '#8c4400', // brown
  C: '#fca044', // tan
};

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  return { tex, ctx: tex.getContext() };
}

/** Paint a pixel map. '.' is transparent; rows are padded to the widest. */
function pix(scene: Phaser.Scene, key: string, rows: string[], pal: Pal = BASE) {
  const w = Math.max(...rows.map((r) => r.length));
  const { tex, ctx } = canvasTexture(scene, key, w, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  tex.refresh();
}

/** Fill a shape pixel by pixel and outline it in black. */
function shape(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  inside: (x: number, y: number) => boolean,
  fill: (x: number, y: number) => string,
  outline = '#000000',
) {
  const { tex, ctx } = canvasTexture(scene, key, w, h);
  const ins = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!ins(x, y)) continue;
      const edge = !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1);
      ctx.fillStyle = edge ? outline : fill(x, y);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

function draw(scene: Phaser.Scene, key: string, w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void) {
  const { tex, ctx } = canvasTexture(scene, key, w, h);
  fn(ctx);
  tex.refresh();
}

// ---------- Characters ----------

const HEAD = [
  '................',
  '.....KKKKKK.....',
  '....KBBBLBBK....',
  '...KBBBBBLBBK...',
  '...KWWWWWWWWK...',
  '...KHHSSSKSSK...',
  '...KHSSSSKSSSK..',
  '....KSSSSSSSK...',
  '.....KSSSKKK....',
];
const BODY = [
  '....KOOWWWOK....',
  '...KSOOOOOOSK...',
  '...KSKOOOOKSK...',
];
const LEGS_STAND = [
  '....KDDDDDDK....',
  '....KDDKKDDK....',
  '...KNNNK.KNNNK..',
  '...KKKK...KKKK..',
];
const LEGS_STRIDE = [
  '....KDDDDDDK....',
  '...KDDK..KDDK...',
  '..KNNNK...KNNNK.',
  '..KKKK.....KKKK.',
];
const LEGS_PASS = [
  '....KDDDDDDK....',
  '.....KDDDDK.....',
  '....KNNNNNNK....',
  '....KKKKKKKK....',
];
const BODY_JUMP = [
  '...KKOOWWWOKKK..',
  '..KSKOOOOOOKSK..',
  '...K.KOOOOK.K...',
];

// ---------- Icons (card slots, goal box, title heart) ----------

const ICONS: Record<string, string[]> = {
  star: [
    '.......KK.......',
    '......KGGK......',
    '......KGGK......',
    '.....KGGGGK.....',
    'KKKKKKGGGGKKKKKK',
    'KGGGGGGGGGGGGGGK',
    '.KGGGKGGGGKGGGK.',
    '..KGGKGGGGKGGK..',
    '...KGGGGGGGGK...',
    '...KGGGGGGGGK...',
    '..KGGGGGGGGGGK..',
    '..KGGGGKKGGGGK..',
    '.KGGGKK..KKGGGK.',
    '.KGKK......KKGK.',
    '.KK..........KK.',
    '................',
  ],
  heart: [
    '................',
    '..KKKK....KKKK..',
    '.KOOOOK..KOOOOK.',
    'KOWWOOOKKOOOOOOK',
    'KOWOOOOOOOOOOOOK',
    'KOOOOOOOOOOOOOOK',
    'KOOOOOOOOOOOOOOK',
    '.KOOOOOOOOOOOOK.',
    '..KOOOOOOOOOOK..',
    '...KOOOOOOOOK...',
    '....KOOOOOOK....',
    '.....KOOOOK.....',
    '......KOOK......',
    '.......KK.......',
    '................',
    '................',
  ],
  pencil: [
    '............KKK.',
    '...........KPPPK',
    '..........KAPPPK',
    '.........KGAAPK.',
    '........KGGGAK..',
    '.......KGGGGK...',
    '......KGGGGK....',
    '.....KGGGGK.....',
    '....KGGGGK......',
    '...KYGGGK.......',
    '..KCYGGK........',
    '..KCCYK.........',
    '.KCCCK..........',
    '.KKCK...........',
    'KKKK............',
    '................',
  ],
  seed: [
    '.......KK.......',
    '......KeeK......',
    '...KK.KeeK.KK...',
    '..KeeKKEEKKeeK..',
    '..KeEEEEEEEEeK..',
    '...KKEEEEEEKK...',
    '.....KKEEKK.....',
    '.......KK.......',
    '......KUUK......',
    '.....KUCCUK.....',
    '....KUCCCCUK....',
    '....KUCCCCUK....',
    '....KUUCCUUK....',
    '.....KUUUUK.....',
    '......KKKK......',
    '................',
  ],
};

export type CardIcon = 'star' | 'heart' | 'pencil' | 'seed';
export const CARD_ICONS: CardIcon[] = ['star', 'heart', 'pencil', 'seed'];

export function generateTextures(scene: Phaser.Scene) {
  // Player: 0 idle, 1 stride, 2 pass, 3 jump
  pix(scene, 'player-0', [...HEAD, ...BODY, ...LEGS_STAND]);
  pix(scene, 'player-1', [...HEAD, ...BODY, ...LEGS_STRIDE]);
  pix(scene, 'player-2', [...HEAD, ...BODY, ...LEGS_PASS]);
  pix(scene, 'player-3', [...HEAD, ...BODY_JUMP, ...LEGS_STRIDE]);

  for (const [k, rows] of Object.entries(ICONS)) pix(scene, `icon-${k}`, rows);

  // Bug enemy (squash it for a "bug fixed")
  const bugTop = [
    '................',
    '...K........K...',
    '....K......K....',
    '.....KKKKKK.....',
    '...KKRRRRRRKK...',
    '..KRRWRRRRWRRK..',
    '.KRRWWRKKRWWRRK.',
    '.KRRRRRKKRRRRRK.',
    'KRRKRRRKKRRRKRRK',
    'KRRRRRRKKRRRRRRK',
    'KRRRRKRKKRKRRRRK',
    '.KRRRRRKKRRRRRK.',
    '..KKKKKKKKKKKK..',
  ];
  pix(scene, 'bug-0', [...bugTop, '..K.K......K.K..', '.K...K....K...K.', '................']);
  pix(scene, 'bug-1', [...bugTop, '...K.K....K.K...', '...K..K..K..K...', '................']);
  pix(scene, 'bug-flat', [
    ...Array(11).fill('................'),
    '..KKKKKKKKKKKK..',
    '.KRRWRRKKRRWRRK.',
    'KRRRRRRKKRRRRRRK',
    '.KKKKKKKKKKKKKK.',
    '................',
  ]);

  pix(scene, 'coin', [
    '....KKKK....',
    '...KGGGGK...',
    '..KGYYGGGK..',
    '..KGYGGGGK..',
    '.KGYGGKGGGK.',
    '.KGYGGKGGGK.',
    '.KGYGGKGGGK.',
    '.KGYGGKGGGK.',
    '.KGGGGKGGGK.',
    '..KGGGGGGK..',
    '..KGGGGGGK..',
    '...KGGGGK...',
    '....KKKK....',
  ]);

  // ---------- Tiles ----------

  draw(scene, 'ground', 16, 16, (c) => {
    c.fillStyle = '#d87818';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#000';
    c.fillRect(0, 0, 16, 1);
    c.fillStyle = '#fcbc74';
    c.fillRect(0, 1, 16, 3);
    c.fillStyle = '#000';
    c.fillRect(0, 4, 16, 1);
    c.fillStyle = '#8c4400';
    for (const [x, y] of [[2, 7], [9, 6], [5, 11], [13, 10], [1, 14], [10, 14]]) c.fillRect(x, y, 2, 1);
  });
  draw(scene, 'ground-fill', 16, 16, (c) => {
    c.fillStyle = '#d87818';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#8c4400';
    for (const [x, y] of [[3, 2], [11, 4], [6, 9], [14, 12], [1, 13]]) c.fillRect(x, y, 2, 1);
  });
  draw(scene, 'brick', 16, 16, (c) => {
    c.fillStyle = '#c84c0c';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#fca044';
    c.fillRect(0, 0, 15, 1);
    c.fillRect(0, 8, 7, 1);
    c.fillRect(8, 8, 8, 1);
    c.fillStyle = '#000';
    c.fillRect(0, 7, 16, 1);
    c.fillRect(0, 15, 16, 1);
    c.fillRect(15, 0, 1, 7);
    c.fillRect(7, 8, 1, 7);
  });
  pix(scene, 'qblock-0', qblock('G', 'W'));
  pix(scene, 'qblock-1', qblock('C', 'Y'));
  pix(scene, 'used', [
    'KKKKKKKKKKKKKKKK',
    'KUUUUUUUUUUUUUUK',
    'KUKUUUUUUUUUUKUK',
    ...Array(10).fill('KUUUUUUUUUUUUUUK'),
    'KUKUUUUUUUUUUKUK',
    'KUUUUUUUUUUUUUUK',
    'KKKKKKKKKKKKKKKK',
  ]);
  // Pastel block for staircases and the end platform
  draw(scene, 'stair', 16, 16, (c) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#fcbcb0';
    c.fillRect(1, 1, 14, 14);
    c.fillStyle = '#fff';
    c.fillRect(1, 1, 14, 2);
    c.fillStyle = '#d87870';
    c.fillRect(1, 13, 14, 2);
  });

  const pipe = (key: string, top: boolean) =>
    draw(scene, key, 32, 16, (c) => {
      const x0 = top ? 0 : 2;
      const w = top ? 32 : 28;
      c.fillStyle = '#000';
      c.fillRect(x0, 0, w, 16);
      c.fillStyle = '#00a800';
      c.fillRect(x0 + 1, top ? 1 : 0, w - 2, top ? 14 : 16);
      c.fillStyle = '#80d010';
      c.fillRect(x0 + 4, top ? 1 : 0, 4, top ? 14 : 16);
      c.fillRect(x0 + 10, top ? 1 : 0, 1, top ? 14 : 16);
      c.fillStyle = '#005800';
      c.fillRect(x0 + w - 7, top ? 1 : 0, 5, top ? 14 : 16);
    });
  pipe('pipe-top', true);
  pipe('pipe-body', false);

  // ---------- Scenery ----------

  const cloud = (x: number, y: number) => {
    const blobs = [[9, 12, 8], [18, 9, 9], [26, 13, 7]];
    return blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r) || (y >= 12 && y <= 19 && x >= 3 && x <= 31);
  };
  shape(scene, 'cloud', 35, 22, cloud, (x, y) => (y > 16 ? '#c8e0f8' : '#ffffff'));

  const hill = (w: number, h: number) => (x: number, y: number) => {
    const r = w / 2;
    if (y >= r) return true;
    return (x - r + 0.5) ** 2 + (y - r) ** 2 <= r * r;
  };
  const diamond = (x: number, y: number) => ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0 ? '#005800' : '#00a800');
  shape(scene, 'hill-lg', 48, 80, hill(48, 80), diamond);
  shape(scene, 'hill-sm', 32, 48, hill(32, 48), diamond);

  shape(
    scene,
    'bush',
    40,
    16,
    (x, y) => [[8, 9, 8], [20, 7, 9], [32, 9, 8]].some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r) || y >= 10,
    (x, y) => ((x * 7 + y * 3) % 11 === 0 ? '#005800' : '#00a800'),
  );

  // ---------- Overworld ----------

  draw(scene, 'map-bg', 16, 16, (c) => {
    c.fillStyle = '#fcd8a8';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#e8b878';
    c.fillRect(3, 4, 1, 1);
    c.fillRect(11, 11, 1, 1);
  });
  shape(
    scene,
    'map-bush',
    16,
    16,
    (x, y) => (x - 7.5) ** 2 + (y - 7) ** 2 <= 49 || (y >= 7 && y <= 15 && x >= 1 && x <= 14),
    (x, y) => (x < 5 && y < 8 ? '#b8f818' : '#00a800'),
  );
  shape(
    scene,
    'map-rock',
    16,
    16,
    (x, y) => (x - 5) ** 2 + (y - 10) ** 2 <= 22 || (x - 11) ** 2 + (y - 9) ** 2 <= 20,
    (x, y) => (y < 8 ? '#fce4a0' : '#c88c38'),
  );
  draw(scene, 'map-water', 16, 16, (c) => {
    c.fillStyle = '#3cbcfc';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#fff';
    c.fillRect(3, 5, 4, 1);
    c.fillRect(10, 11, 4, 1);
  });
  draw(scene, 'map-panel', 16, 16, (c) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#fff';
    c.fillRect(1, 1, 14, 1);
    c.fillRect(1, 1, 1, 14);
    c.fillStyle = '#3cbcfc';
    c.beginPath();
    c.moveTo(2, 2);
    c.lineTo(8, 2);
    c.lineTo(2, 8);
    c.fill();
  });
  draw(scene, 'map-panel-done', 16, 16, (c) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#f8b800';
    c.fillRect(1, 1, 14, 14);
    c.fillStyle = '#000';
    for (const [x, y] of [[4, 8], [5, 9], [6, 10], [7, 9], [8, 8], [9, 7], [10, 6], [11, 5]]) c.fillRect(x, y, 2, 2);
  });
  pix(scene, 'map-house', [
    '.......KK.......',
    '......KRRK......',
    '.....KRRRRK.....',
    '....KRRWWRRK....',
    '...KRRRRRRRRK...',
    '..KRRRRRRRRRRK..',
    '.KKKKKKKKKKKKKK.',
    '..KYYYYYYYYYYK..',
    '..KYKKYYYYKKYK..',
    '..KYKWYYYYKWYK..',
    '..KYYYYKKYYYYK..',
    '..KYYYYKUKYYYK..',
    '..KYYYYKUKYYYK..',
    '..KYYYYKUKYYYK..',
    '..KKKKKKKKKKKK..',
    '................',
  ]);
  pix(scene, 'map-castle', [
    '.KK.KK....KK.KK.',
    '.KAAAK....KAAAK.',
    '.KAAAKKKKKKAAAK.',
    '.KAaAKAKAKKAaAK.',
    '.KAAAAAAAAAAAAK.',
    '.KAAAAAAAAAAAAK.',
    '.KAaAAAKKAAAaAK.',
    '.KAAAAKWWKAAAAK.',
    '.KAAAKWWWWKAAAK.',
    '.KAaAKWWWWKAaAK.',
    '.KAAAKWKKWKAAAK.',
    '.KAAAKWWWWKAAAK.',
    '.KAAAKWWWWKAAAK.',
    '.KAAAKKKKKKAAAK.',
    '.KKKKKKKKKKKKKK.',
    '................',
  ]);
  pix(scene, 'map-start', [
    '................',
    '..KKKKKKKKKKKK..',
    '..KRRRRRRRRRRK..',
    '..KRWWRWWWRRRK..',
    '..KRWRRRWRRRRK..',
    '..KRWWRRWRRRRK..',
    '..KRRWRRWRRRRK..',
    '..KRWWRRWRRRRK..',
    '..KRRRRRRRRRRK..',
    '..KKKKKKKKKKKK..',
    '.......KK.......',
    '.......KK.......',
    '.......KK.......',
    '......KKKK......',
    '................',
    '................',
  ]);
}

function qblock(fill: string, mark: string): string[] {
  const f = fill;
  const m = mark;
  return [
    'KKKKKKKKKKKKKKKK',
    `K${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}K`,
    `K${f}K${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}K${f}K`,
    `K${f}${f}${f}${f}${m}${m}${m}${m}${f}${f}${f}${f}${f}${f}K`,
    `K${f}${f}${f}${m}${m}KK${m}${m}${f}${f}${f}${f}${f}K`,
    `K${f}${f}${f}${m}${m}K${f}${m}${m}K${f}${f}${f}${f}K`,
    `K${f}${f}${f}${f}KK${f}${m}${m}K${f}${f}${f}${f}K`,
    `K${f}${f}${f}${f}${f}${f}${m}${m}K${f}${f}${f}${f}${f}K`,
    `K${f}${f}${f}${f}${f}${m}${m}K${f}${f}${f}${f}${f}${f}K`,
    `K${f}${f}${f}${f}${f}${m}${m}K${f}${f}${f}${f}${f}${f}K`,
    `K${f}${f}${f}${f}${f}${f}KK${f}${f}${f}${f}${f}${f}K`,
    `K${f}${f}${f}${f}${f}${m}${m}${f}${f}${f}${f}${f}${f}${f}K`,
    `K${f}${f}${f}${f}${f}${m}${m}K${f}${f}${f}${f}${f}${f}K`,
    `K${f}K${f}${f}${f}${f}KK${f}${f}${f}${f}K${f}K`,
    `K${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}${f}K`,
    'KKKKKKKKKKKKKKKK',
  ];
}

export function registerAnims(scene: Phaser.Scene) {
  const a = scene.anims;
  if (a.exists('walk')) return;
  a.create({ key: 'walk', frames: [{ key: 'player-1' }, { key: 'player-2' }], frameRate: 10, repeat: -1 });
  a.create({ key: 'bug-walk', frames: [{ key: 'bug-0' }, { key: 'bug-1' }], frameRate: 5, repeat: -1 });
  a.create({ key: 'qblock', frames: [{ key: 'qblock-0', duration: 900 }, { key: 'qblock-1', duration: 200 }], repeat: -1 });
}
