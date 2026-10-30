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
  if (!scene.textures.exists(POST)) scene.load.image(POST, asset('felt/post-knit.png'));
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

/** A knitted brown post (sign and billboard legs), `w` wide, from y down to the ground. */
export function feltPost(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  scene.textures.get(POST).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return scene.add.tileSprite(x, y, w, h, POST).setOrigin(0).setTileScale(w / 88);
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

/** Smooth filtering (the game defaults to pixel-art nearest) and the felt animations. */
export function setupFelt(scene: Phaser.Scene) {
  for (const key of [FELT, SKY]) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  const felt = scene.textures.get(FELT);
  if (!felt.has(PIPE_RUN)) {
    const f = felt.get('pipe2-body');
    felt.add(PIPE_RUN, f.sourceIndex, f.cutX, f.cutY + 30, f.cutWidth, 36);
  }
  const a = scene.anims;
  if (a.exists('felt-snap')) return;
  const frames = (...names: string[]) => names.map((frame) => ({ key: FELT, frame }));
  a.create({ key: 'felt-snap', frames: frames('snapper-0', 'snapper-1'), frameRate: 4, repeat: -1 });
}

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
  return scene.add
    .nineslice(x, y, FELT, scene.textures.get(FELT).has(frame) ? frame : 'platform-acddeb', w * s, h * s, 9 * s, 9 * s, 9 * s, 9 * s)
    .setOrigin(0)
    .setScale(1 / s)
    .setDepth(-4);
}
