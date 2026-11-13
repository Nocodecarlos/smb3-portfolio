import Phaser from 'phaser';
import { asset } from '../assets';

// Felt art for hand-built courses, exported from the Figma sprite library
// ("03 · World 1-1"). Frames are drawn at ART times the game's pixel grid.
// Felt scenes render at Z times the base resolution with the camera zoomed
// in, Z picked at boot to match the display (main.ts): physics and level
// coordinates stay in game pixels, and the art is drawn at 1/ART scale.

/** Texture pixels per game pixel in the felt art. */
export const ART = 8;
/** Render zoom for felt scenes: screen pixels per game pixel. */
export let Z = 4;
export function setRenderZoom(z: number) {
  Z = z;
}
export const FELT = 'felt';
export const SKY = 'felt-sky';

export const POST = 'felt-post';

export function preloadFelt(scene: Phaser.Scene) {
  if (!scene.textures.exists(FELT)) scene.load.atlas(FELT, asset('felt/course.webp'), asset('felt/course.json'));
  if (!scene.textures.exists(SKY)) scene.load.image(SKY, asset('felt/sky.jpg'));
  if (!scene.textures.exists(POST)) scene.load.image(POST, asset('felt/post-wood.png'));
}

/** Empty rows under the plush art in some frames (measured on the 4x art), so they can sit on the ground. */
const BOTTOM_PAD: Record<string, number> = {
  shrub: 7, 'bush2-22x34': 8, 'bush2-27x34': 11, 'bush2-30x48': 23, 'bush2-34x40': 18, 'bush2-34x48': 20,
  'bush2-34x64': 47, 'bush2-35x48': 18, 'bush2-37x64': 32, 'bush2-38x48': 10, 'bush2-40x48': 16,
};

/** A felt image standing on `groundY`: its left edge at x, its visible bottom on the ground. */
export function feltOnGround(scene: Phaser.Scene, x: number, groundY: number, frame: string) {
  return feltImage(scene, x, groundY + (BOTTOM_PAD[frame] ?? 0) / 4, frame).setOrigin(0, 1);
}

/** A whittled wooden post (sign and billboard legs), `w` wide, from y down to the ground. `key` swaps the wood for another post (CANDY_POST). */
export function feltPost(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = POST) {
  if (key === CANDY_POST) candyPost(scene);
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return scene.add.tileSprite(x, y, w, h, key).setOrigin(0).setTileScale(w / 88);
}

/** Candy-cane posts for the Christmas world (World 1-5): red and cream felt stripes winding round a round post. */
export const CANDY_POST = 'felt-post-candy';

/** Paint the candy-cane post once: 88 px wide like the wood (one post across), its stripes repeating every 128 px down. */
function candyPost(scene: Phaser.Scene) {
  if (scene.textures.exists(CANDY_POST)) return;
  const W = 88;
  const H = 128;
  const tex = scene.textures.createCanvas(CANDY_POST, W, H)!;
  const ctx = tex.getContext();
  ctx.fillStyle = '#fbf3e6';
  ctx.fillRect(0, 0, W, H);
  // one velvet-red stripe per repeat, rising to the right, wrapped top to bottom so the tiles meet
  ctx.fillStyle = '#b81f2d';
  for (let x = 0; x < W; x++) for (const k of [-1, 0, 1]) ctx.fillRect(x, k * H + 40 - x * 0.55, 1, 50);
  // a thin darker edge on each stripe, like a stitched seam
  ctx.fillStyle = 'rgba(110, 12, 24, 0.35)';
  for (let x = 0; x < W; x++) for (const k of [-1, 0, 1]) ctx.fillRect(x, k * H + 88 - x * 0.55, 1, 3);
  // round the post: shade both sides, a soft highlight left of centre
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(70, 20, 24, 0.38)');
  g.addColorStop(0.32, 'rgba(255, 255, 255, 0.22)');
  g.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(70, 20, 24, 0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // felt fuzz: a fine scatter of light and dark fibres (seeded, so it never changes)
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,20,20,0.10)';
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1);
  }
  tex.refresh();
}

/** The sky's average colour (public/felt/sky.jpg): what distant felt fades toward. */
const HAZE = [179, 209, 222];
const LUMA = [0.299, 0.587, 0.114];

/**
 * Push background felt back, like distance in a photo: drop some saturation,
 * then mix `amount` of the sky colour in. Lower contrast behind keeps what
 * you play on the strongest thing on screen. (WebGL only; canvas skips it.)
 */
export function haze<T extends Phaser.GameObjects.Image>(obj: T, amount: number, saturation = 1): T {
  const fx = obj.preFX?.addColorMatrix();
  if (!fx) return obj;
  const k = 1 - amount;
  // each output channel: k * (saturation-adjusted colour) + amount * haze (offsets are 0-255)
  const row = (i: number) => [...[0, 1, 2].map((j) => k * ((i === j ? saturation : 0) + (1 - saturation) * LUMA[j])), 0, amount * HAZE[i]];
  fx.set([...row(0), ...row(1), ...row(2), 0, 0, 0, 1, 0]);
  return obj;
}

/**
 * The straight middle of the pipe body art. The full frame is one segment with
 * rounded stripe ends, so tiling it shows a seam every few pixels; tiling this
 * slice gives one continuous pipe.
 */
export const PIPE_RUN = 'pipe2-body-run';
/** The body art fills 22 of the pipe's 32 px across; the cap is wider. */
export const PIPE_INSET = 5;
/**
 * The same run, as wide as the cap's knitted band: the braided edge is repeated outward on both sides, so an
 * upright pipe is one tube from rim to foot, not a narrow body under a wider cap. Its own texture (256 x 36).
 */
export const PIPE_WIDE = 'felt-pipe-wide';
/**
 * The block art (bricks, ? blocks, wood) fills 115 of its 128 px, which left a gap between neighbours. Drawn
 * this much bigger, blocks touch edge to edge. Their physics stays one tile.
 */
export const BLOCK_FIT = 1.13;

/** Smooth filtering (the game defaults to pixel-art nearest) and the felt animations. */
export function setupFelt(scene: Phaser.Scene) {
  for (const key of [FELT, SKY]) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  const felt = scene.textures.get(FELT);
  if (!felt.has(PIPE_RUN)) {
    const f = felt.get('pipe2-body');
    felt.add(PIPE_RUN, f.sourceIndex, f.cutX, f.cutY + 30, f.cutWidth, 36);
  }
  if (!felt.has(SOIL)) {
    const f = felt.get('soil');
    felt.add(SOIL, f.sourceIndex, f.cutX + 8, f.cutY + 8, SOIL_W, SOIL_H);
  }
  if (!scene.textures.exists(PIPE_WIDE)) {
    const f = felt.get('pipe2-body');
    const src = f.source.image as HTMLImageElement;
    const tex = scene.textures.createCanvas(PIPE_WIDE, 256, 36)!;
    const ctx = tex.getContext();
    // the braid sits 40 to 90 px in: copies 30 px out on each side carry it to the cap's edge (10 px in)
    for (const dx of [-30, 30, 0]) ctx.drawImage(src, f.cutX, f.cutY + 30, 256, 36, dx, 0, 256, 36);
    // round the tube: a little shade toward both edges
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0.04, 'rgba(18, 48, 12, 0.34)');
    g.addColorStop(0.2, 'rgba(18, 48, 12, 0)');
    g.addColorStop(0.8, 'rgba(18, 48, 12, 0)');
    g.addColorStop(0.96, 'rgba(18, 48, 12, 0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 36);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  const a = scene.anims;
  if (a.exists('felt-snap')) return;
  const frames = (...names: string[]) => names.map((frame) => ({ key: FELT, frame }));
  a.create({ key: 'felt-snap', frames: frames('snapper-0', 'snapper-1'), frameRate: 4, repeat: -1 });
}

/**
 * The ground tile with its empty margin cut off (the art fills 113 x 112 of its 128 px), so a tiled floor has no
 * gaps between tiles. `SOIL_SEAM` is the colour behind it, which only shows at the tiles' rounded corners: the
 * brown of their own stitched edge.
 */
export const SOIL = 'soil-tight';
export const SOIL_W = 113;
export const SOIL_H = 112;
export const SOIL_SEAM = 0x6b4a36;

/** How wide a pipe's body is drawn, of the 32 px its rim spans. */
const PIPE_BODY = 28;
/** The rim's depth along the pipe, in game px. */
const PIPE_RIM = 11;

/**
 * A whole pipe in one piece, `len` game px long and 32 across, its mouth at the top: one knit from end to end,
 * flaring out into a rim at the mouth (`rim: false` leaves the end plain). The rim is the same knit, set off only
 * by its width, a rounded lip and the shade it casts on the body. Painted once per length; flip or turn the
 * image for hanging and sideways pipes.
 */
export function feltPipe(scene: Phaser.Scene, len: number, rim = true) {
  const key = `felt-pipe-${Math.round(len)}-${rim ? 'rim' : 'plain'}`;
  if (!scene.textures.exists(key)) {
    const W = 32 * ART;
    const H = Math.round(len) * ART;
    const tile = scene.textures.get(PIPE_WIDE).getSourceImage() as HTMLCanvasElement;
    const tex = scene.textures.createCanvas(key, W, H)!;
    const ctx = tex.getContext();
    const inset = ((32 - PIPE_BODY) / 2) * ART;
    const R = rim ? PIPE_RIM * ART : 0;
    // the body, a little narrower, all the way up
    for (let y = 0; y < H; y += tile.height) ctx.drawImage(tile, 0, 0, tile.width, tile.height, inset, y, W - 2 * inset, tile.height);
    if (rim) {
      // the rim: the same knit at full width, with rounded corners
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, W, R, 2.5 * ART);
      ctx.clip();
      ctx.clearRect(0, 0, W, R);
      for (let y = 0; y < R; y += tile.height) ctx.drawImage(tile, 0, y);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-atop';
      const band = (y0: number, y1: number, from: string, to: string) => {
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, from);
        g.addColorStop(1, to);
        ctx.fillStyle = g;
        ctx.fillRect(0, y0, W, y1 - y0);
      };
      // a lit lip along the mouth, the rim rounding under, and the shade it casts on the body below
      band(0, 3 * ART, 'rgba(235, 255, 215, 0.34)', 'rgba(235, 255, 215, 0)');
      band(R - 3 * ART, R, 'rgba(14, 44, 10, 0)', 'rgba(14, 44, 10, 0.3)');
      band(R, R + 5 * ART, 'rgba(10, 36, 8, 0.5)', 'rgba(10, 36, 8, 0)');
    }
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  return scene.add.image(0, 0, key).setOrigin(0).setScale(1 / ART);
}
/** A sideways pipe is drawn this much smaller across, so its body is as thick as its 22 px of solid. */
export const PIPE_SIDE = (32 - 2 * PIPE_INSET) / PIPE_BODY;

/** A felt image at game-pixel size. */
export function feltImage(scene: Phaser.Scene, x: number, y: number, frame: string) {
  return scene.add.image(x, y, FELT, frame).setScale(1 / ART);
}

export function feltSprite(scene: Phaser.Scene, x: number, y: number, frame: string) {
  return scene.add.sprite(x, y, FELT, frame).setScale(1 / ART);
}

/** Platform faces are 9-slices of a 48 game px felt panel; the 9px corners hold the bolts. */
export function feltPlatform(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: string) {
  const frame = `platform-${color.replace('#', '').toLowerCase()}`;
  const s = ART;
  // A solid, rounded drop shadow (chunky, like a felt cut-out on a backing).
  // Shadow and face share a depth so later platforms overlap earlier ones, as in the file order.
  scene.add.graphics().setDepth(-4).fillStyle(0x24170e, 1).fillRoundedRect(x + 4, y + 4, w, h, 5);
  // the blue platform's own art has a scale pattern; it's drawn as the plain white felt, dyed blue, so it's flat like the rest
  const flat = frame === 'platform-acddeb' || !scene.textures.get(FELT).has(frame);
  const face = scene.add
    .nineslice(x, y, FELT, flat ? 'platform-f4faf4' : frame, w * s, h * s, 9 * s, 9 * s, 9 * s, 9 * s)
    .setOrigin(0)
    .setScale(1 / s)
    .setDepth(-4);
  if (flat) face.setTint(0xacddeb);
  return face;
}
