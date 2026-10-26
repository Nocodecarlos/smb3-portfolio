import Phaser from 'phaser';

// Felt art for hand-built courses, exported from the Figma sprite library
// ("03 · World 1-1"). Frames are drawn at 4x the game's pixel grid, so a
// course renders at Z times the base resolution with the camera zoomed in:
// physics and level coordinates stay in game pixels, and one texture pixel
// lands on one screen pixel.

export const Z = 4;
export const FELT = 'felt';
export const SKY = 'felt-sky';

export const POST = 'felt-post';

export function preloadFelt(scene: Phaser.Scene) {
  const base = import.meta.env.BASE_URL;
  if (!scene.textures.exists(FELT)) scene.load.atlas(FELT, `${base}felt/course.png`, `${base}felt/course.json`);
  if (!scene.textures.exists(SKY)) scene.load.image(SKY, `${base}felt/sky.jpg`);
  if (!scene.textures.exists(POST)) scene.load.image(POST, `${base}felt/post-knit.png`);
}

/** Empty rows under the plush art in some frames (texture px), so they can sit on the ground. */
const BOTTOM_PAD: Record<string, number> = {
  shrub: 7, 'bush2-22x34': 8, 'bush2-27x34': 11, 'bush2-30x48': 23, 'bush2-34x40': 18, 'bush2-34x48': 20,
  'bush2-34x64': 47, 'bush2-35x48': 18, 'bush2-37x64': 32, 'bush2-38x48': 10, 'bush2-40x48': 16,
};

/** A felt image standing on `groundY`: its left edge at x, its visible bottom on the ground. */
export function feltOnGround(scene: Phaser.Scene, x: number, groundY: number, frame: string) {
  return feltImage(scene, x, groundY + (BOTTOM_PAD[frame] ?? 0) / Z, frame).setOrigin(0, 1);
}

/** A knitted brown post (sign and billboard legs), `w` wide, from y down to the ground. */
export function feltPost(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  scene.textures.get(POST).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return scene.add.tileSprite(x, y, w, h, POST).setOrigin(0).setTileScale(w / 88);
}

/** Smooth filtering (the game defaults to pixel-art nearest) and the felt animations. */
export function setupFelt(scene: Phaser.Scene) {
  for (const key of [FELT, SKY]) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  const a = scene.anims;
  if (a.exists('felt-snap')) return;
  const frames = (...names: string[]) => names.map((frame) => ({ key: FELT, frame }));
  a.create({ key: 'felt-snap', frames: frames('snapper-0', 'snapper-1'), frameRate: 4, repeat: -1 });
}

/** A felt image at game-pixel size. */
export function feltImage(scene: Phaser.Scene, x: number, y: number, frame: string) {
  return scene.add.image(x, y, FELT, frame).setScale(1 / Z);
}

export function feltSprite(scene: Phaser.Scene, x: number, y: number, frame: string) {
  return scene.add.sprite(x, y, FELT, frame).setScale(1 / Z);
}

/** Platform faces are 9-slices of a 192px felt panel; corners hold the bolts. */
export function feltPlatform(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: string) {
  const frame = `platform-${color.replace('#', '').toLowerCase()}`;
  const s = Z;
  // A solid, rounded drop shadow (chunky, like a felt cut-out on a backing).
  // Shadow and face share a depth so later platforms overlap earlier ones, as in the file order.
  scene.add.graphics().setDepth(-4).fillStyle(0x24170e, 1).fillRoundedRect(x + 4, y + 4, w, h, 5);
  return scene.add
    .nineslice(x, y, FELT, scene.textures.get(FELT).has(frame) ? frame : 'platform-acddeb', w * s, h * s, 36, 36, 36, 36)
    .setOrigin(0)
    .setScale(1 / s)
    .setDepth(-4);
}
