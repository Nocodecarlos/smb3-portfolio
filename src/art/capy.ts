import Phaser from 'phaser';
import { asset } from '../assets';

// Launch the Capy's own art, borrowed for World 1-3 (Figma page "Level 1-3"):
// the night sky and yarn moon of its top zones, its yarn clouds (big white, blue, small dark), and the
// wooden slingshot. Files live in public/felt/capy.

export const CAPY = {
  /** Stars from zone 5: 863 x 1408 px, four per game px, tiles sideways. */
  stars: 'capy-stars',
  moon: 'capy-moon',
  cloud: 'capy-cloud',
  cloudBlue: 'capy-cloud-blue',
  cloudDark: 'capy-cloud-dark',
  slingshot: 'capy-slingshot',
} as const;

export function preloadCapy(scene: Phaser.Scene) {
  const files: [string, string][] = [
    [CAPY.stars, 'felt/capy/stars.jpg'],
    [CAPY.moon, 'felt/capy/moon.png'],
    [CAPY.cloud, 'felt/capy/cloud-large.png'],
    [CAPY.cloudBlue, 'felt/capy/cloud-medium.png'],
    [CAPY.cloudDark, 'felt/capy/cloud-small.png'],
    [CAPY.slingshot, 'felt/capy/slingshot.png'],
  ];
  for (const [key, path] of files) if (!scene.textures.exists(key)) scene.load.image(key, asset(path));
}

/** Smooth filtering: the game defaults to pixel-art nearest. */
export function setupCapy(scene: Phaser.Scene) {
  for (const key of Object.values(CAPY)) if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
}
