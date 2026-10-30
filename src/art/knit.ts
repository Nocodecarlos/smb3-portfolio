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
}

/**
 * Draw ground pieces from their top edges (game px, left to right) down to
 * `bottom`. `key` names the canvases so a restart reuses them.
 */
export function drawKnit(scene: Phaser.Scene, key: string, pieces: [number, number][][], bottom: number, depth: number) {
  const knit = scene.textures.get(KNIT).getSourceImage() as HTMLImageElement;
  const stitch = scene.textures.get(STITCH).getSourceImage() as HTMLImageElement;
  pieces.forEach((top, i) => {
    const x0 = top[0][0];
    const x1 = top[top.length - 1][0];
    const y0 = Math.min(...top.map(([, y]) => y)) - 4;
    for (let cx = x0, j = 0; cx < x1; cx += CHUNK, j++) {
      const w = Math.min(CHUNK, x1 - cx);
      const name = `${key}-${i}-${j}`;
      if (!scene.textures.exists(name)) paint(scene, name, top, cx, y0, w, bottom, knit, stitch);
      scene.add.image(cx, y0, name).setOrigin(0).setScale(1 / RES).setDepth(depth);
    }
  });
}

function paint(scene: Phaser.Scene, name: string, top: [number, number][], cx: number, cy: number, w: number, bottom: number, knit: HTMLImageElement, stitch: HTMLImageElement) {
  const tex = scene.textures.createCanvas(name, Math.ceil(w * RES), Math.ceil((bottom - cy) * RES))!;
  const ctx = tex.getContext();
  ctx.setTransform(RES, 0, 0, RES, -cx * RES, -cy * RES);
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
  ctx.shadowBlur = 3 * RES;
  ctx.shadowOffsetY = 1.5 * RES;
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
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}
