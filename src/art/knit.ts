import Phaser from 'phaser';
import { asset } from '../assets';

// Knit ground for courses with `terrain` (World 1-2, Figma page "Level 1-2"):
// each ground piece, hills and slopes included, is one shape cut from the
// green knit, with the scalloped stitch along its edge. Drawn once on canvases
// (the knit is a small tiling texture, so the download stays small).

export const KNIT = 'felt-knit';
export const STITCH = 'felt-stitch';
/** Game px the knit texture spans across (Figma tiles it at 1.15 on 64px tiles). */
const KNIT_W = 855;
/** Game px per stitch tile along the edge (Figma: 144px art at 1/3 on 64px tiles). */
const STITCH_W = 12;
/** Canvas pixels per game pixel. */
const RES = 4;
/** Widest canvas, in game px (WebGL textures top out at 4096). */
const CHUNK = 1024;

export function preloadKnit(scene: Phaser.Scene) {
  if (!scene.textures.exists(KNIT)) scene.load.image(KNIT, asset('felt/knit.jpg'));
  if (!scene.textures.exists(STITCH)) scene.load.image(STITCH, asset('felt/stitch.png'));
  if (!scene.textures.exists(LANDMARKS)) scene.load.image(LANDMARKS, asset('felt/landmarks.webp'));
}

/**
 * Draw ground pieces from their top edges (game px, left to right) down to
 * `bottom`. `key` names the canvases so a restart reuses them.
 */
export function drawKnit(scene: Phaser.Scene, key: string, pieces: [number, number][][], bottom: number, depth: number) {
  const images: Phaser.GameObjects.Image[] = [];
  const knit = scene.textures.get(KNIT).getSourceImage() as HTMLImageElement;
  const stitch = scene.textures.get(STITCH).getSourceImage() as HTMLImageElement;
  pieces.forEach((top, i) => {
    const x0 = top[0][0];
    const x1 = top[top.length - 1][0];
    const y0 = Math.min(...top.map(([, y]) => y)) - 4;
    for (let cx = x0, j = 0; cx < x1; cx += CHUNK, j++) {
      const w = Math.min(CHUNK, x1 - cx);
      const name = `${key}-${i}-${j}`;
      if (!scene.textures.exists(name)) paint(scene, name, top, cx, y0, w, bottom, knit, stitch, RES);
      images.push(scene.add.image(cx, y0, name).setOrigin(0).setScale(1 / RES).setDepth(depth));
    }
  });
  return images;
}

function paint(scene: Phaser.Scene, name: string, top: [number, number][], cx: number, cy: number, w: number, bottom: number, knit: HTMLImageElement, stitch: HTMLImageElement, res: number, far?: (ctx: CanvasRenderingContext2D) => void) {
  const tex = scene.textures.createCanvas(name, Math.ceil(w * res), Math.ceil((bottom - cy) * res))!;
  const ctx = tex.getContext();
  ctx.setTransform(res, 0, 0, res, -cx * res, -cy * res);
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(top[0][0], bottom + 20);
    for (const [x, y] of top) ctx.lineTo(x, y);
    ctx.lineTo(top[top.length - 1][0], bottom + 20);
    ctx.closePath();
  };
  const pattern = (img: HTMLImageElement, size: number) => {
    const p = ctx.createPattern(img, 'repeat')!;
    p.setTransform(new DOMMatrix().scale(size / img.width));
    return p;
  };
  // a soft shadow under the edge, like the felt cut-outs elsewhere
  ctx.save();
  shape();
  ctx.shadowColor = 'rgba(36, 23, 14, 0.35)';
  ctx.shadowBlur = 3 * res;
  ctx.shadowOffsetY = 1.5 * res;
  ctx.fillStyle = '#4c6b25';
  ctx.fill();
  ctx.restore();
  // knit, a darker rim inside the edge, then the stitches (Figma: 10px inside stroke at 72%)
  ctx.save();
  shape();
  ctx.clip();
  ctx.fillStyle = pattern(knit, KNIT_W);
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20, 34, 6, 0.16)';
  for (const lw of [8, 4]) {
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = pattern(stitch, STITCH_W);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
  far?.(ctx);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** The sky colour far things fade toward (as `haze` in felt.ts, baked in: its shader can't take a texture this big). */
const FAR_HAZE = 'rgba(179, 209, 222, 0.55)';
/** Canvas pixels per game pixel for the far range: it's soft anyway, and this is a lot of canvas. */
const FAR_RES = 3;
/** The landmark sheet (Figma: Landmarks / components): six 270px cells, art standing on each cell's bottom edge. */
const LANDMARKS = 'felt-landmarks';
const LANDMARK_CELL = 270;
/** The houses' colours, as their cells in the sheet; the first castle is the last cell. */
const HOUSES = 5;
const CASTLE = HOUSES;
/** Art px across a house or castle in its cell. */
const LANDMARK_W = 231;
/** The sheet as it's seen from far off: duller and a little toward the sky, so the course stays the strongest thing on screen. */
const FAR_LANDMARKS = 'felt-landmarks-far';
/** They only ever show tiny: the far sheet is this much smaller than the art's, drawn down smoothly so they don't shimmer as they scroll. */
const LANDMARK_SHRINK = 3;
const LANDMARK_SATURATION = 0.55;
const LANDMARK_HAZE = 0.18;

/**
 * A distant knit range for parallax, `span` game px long, in the layer's own
 * coordinates: rolling hills with mushroom villages along the ridge, and the
 * first castle at `castleX`.
 * `key` names the canvases so a restart reuses them.
 */
export function drawFarRange(scene: Phaser.Scene, key: string, span: number, ground: number, bottom: number, depth: number, castleX: number) {
  const knit = scene.textures.get(KNIT).getSourceImage() as HTMLImageElement;
  const stitch = scene.textures.get(STITCH).getSourceImage() as HTMLImageElement;
  const ridge = (x: number) => ground - (4.2 + 1.8 * Math.sin(x / 83) + 0.9 * Math.sin(x / 37 + 1)) * 16;
  const top: [number, number][] = [];
  for (let x = 0; x <= span + 8; x += 8) top.push([x, ridge(x)]);
  const y0 = Math.min(...top.map(([, y]) => y)) - 4;
  const far = (ctx: CanvasRenderingContext2D) => {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = FAR_HAZE;
    ctx.fillRect(0, y0, span + 8, bottom - y0);
  };
  const images: Phaser.GameObjects.Image[] = [];
  for (let cx = 0, j = 0; cx < span; cx += CHUNK, j++) {
    const w = Math.min(CHUNK, span + 8 - cx);
    const name = `${key}-${j}`;
    if (!scene.textures.exists(name)) paint(scene, name, top, cx, y0, w, bottom, knit, stitch, FAR_RES, far);
    images.push(scene.add.image(cx, y0, name).setOrigin(0).setScale(1 / FAR_RES).setDepth(depth));
  }
  if (!scene.textures.exists(FAR_LANDMARKS)) fadeLandmarks(scene);
  const place = (x: number, cell: number, width: number) =>
    // on the ridge's lowest point under it, so it never hovers on a slope
    images.push(scene.add.image(x, Math.max(ridge(x - width / 2), ridge(x), ridge(x + width / 2)) + 2, FAR_LANDMARKS, String(cell)).setOrigin(0.5, 1).setScale((width / LANDMARK_W) * LANDMARK_SHRINK).setDepth(depth + 1));
  place(castleX, CASTLE, 14);
  // two to four houses every so often, always laid out the same, leaving the castle its own hill
  for (let v = 0, x = 80; x < span - 30; v++, x += 170 + ((v * 67) % 120)) {
    if (Math.abs(x + 10 - castleX) < 60) continue;
    const count = 2 + (v % 3);
    for (let i = 0, hx = x; i < count; i++) {
      const n = v * 2 + i * 3;
      place(hx, n % HOUSES, 6.5 + ((n * 7) % 5) / 2);
      hx += 8 + ((n * 5) % 5) / 2;
    }
  }
  return images;
}

/** Bake the far look into a copy of the sheet once, so dozens of houses don't each need a shader pass. */
function fadeLandmarks(scene: Phaser.Scene) {
  const img = scene.textures.get(LANDMARKS).getSourceImage() as HTMLImageElement;
  const width = img.width / LANDMARK_SHRINK;
  const height = img.height / LANDMARK_SHRINK;
  const tex = scene.textures.createCanvas(FAR_LANDMARKS, width, height)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    [179, 209, 222].forEach((sky, c) => {
      d[i + c] = (1 - LANDMARK_HAZE) * (luma + LANDMARK_SATURATION * (d[i + c] - luma)) + LANDMARK_HAZE * sky;
    });
  }
  ctx.putImageData(pixels, 0, 0);
  tex.refresh();
  for (let c = 0; c <= CASTLE; c++) tex.add(String(c), 0, (c * LANDMARK_CELL) / LANDMARK_SHRINK, 0, LANDMARK_CELL / LANDMARK_SHRINK, LANDMARK_CELL / LANDMARK_SHRINK);
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}
