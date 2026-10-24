import Phaser from 'phaser';

// Felt art for hand-built courses, exported from the Figma sprite library
// ("03 · World 1-1"). Frames are drawn at 4x the game's pixel grid, so a
// course renders at Z times the base resolution with the camera zoomed in:
// physics and level coordinates stay in game pixels, and one texture pixel
// lands on one screen pixel.

export const Z = 4;
export const FELT = 'felt';
export const SKY = 'felt-sky';

export function preloadFelt(scene: Phaser.Scene) {
  const base = import.meta.env.BASE_URL;
  if (!scene.textures.exists(FELT)) scene.load.atlas(FELT, `${base}felt/course.png`, `${base}felt/course.json`);
  if (!scene.textures.exists(SKY)) scene.load.image(SKY, `${base}felt/sky.jpg`);
}

/** Smooth filtering (the game defaults to pixel-art nearest) and the felt animations. */
export function setupFelt(scene: Phaser.Scene) {
  for (const key of [FELT, SKY]) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  const a = scene.anims;
  if (a.exists('felt-hiker-walk')) return;
  const frames = (...names: string[]) => names.map((frame) => ({ key: FELT, frame }));
  a.create({ key: 'felt-hiker-walk', frames: frames('hiker-0', 'hiker-1'), frameRate: 5, repeat: -1 });
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
  // shadow and face share a depth so later platforms overlap earlier ones, as in the file order
  scene.add.rectangle(x + 2, y + 2, w, h, 0x000000, 0.35).setOrigin(0).setDepth(-4);
  return scene.add
    .nineslice(x, y, FELT, scene.textures.get(FELT).has(frame) ? frame : 'platform-acddeb', w * s, h * s, 36, 36, 36, 36)
    .setOrigin(0)
    .setScale(1 / s)
    .setDepth(-4);
}
