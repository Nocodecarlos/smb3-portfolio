import type { Lens } from '../content/types';

// Screen and play state shared by scenes. Progress is a per-visitor nicety,
// so it lives in localStorage and the game works without it.

export const TILE = 16;
export const WIDTH = 320;
export const HEIGHT = 240;
export const BAR = 32; // SMB3-style status bar at the bottom
export const FIELD = HEIGHT - BAR; // 208px playfield = 13 tiles
export const GROUND_Y = FIELD - TILE * 2; // top of the ground

interface Progress {
  cleared: string[];
  coins: number;
  mapNode: string;
}

const KEY = 'smb3.progress';

function load(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (p && Array.isArray(p.cleared)) return { cleared: p.cleared, coins: p.coins ?? 0, mapNode: p.mapNode ?? 'start' };
  } catch {}
  return { cleared: [], coins: 0, mapNode: 'start' };
}

export const progress: Progress = load();
export let lens: Lens = 'design';

export function setLens(l: Lens) {
  lens = l;
}

export function saveProgress() {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {}
}

export function markCleared(slug: string) {
  if (!progress.cleared.includes(slug)) progress.cleared.push(slug);
  saveProgress();
}

/** True while a DOM overlay (dialog, lightbox, dev panel input) owns the keyboard. */
export const ui = { blocking: false, dev: false };
