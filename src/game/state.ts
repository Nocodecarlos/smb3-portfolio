import type { Lens } from '../content/types';

// Screen and play state shared by scenes. Progress is a per-visitor nicety,
// so it lives in localStorage and the game works without it.

export const TILE = 16;
/** 16:9 at the NES's 240 lines (426.7, rounded). */
export const WIDTH = 427;
export const HEIGHT = 240;
export const BAR = 32; // SMB3-style status bar at the bottom
export const FIELD = HEIGHT - BAR; // 208px playfield = 13 tiles
export const GROUND_Y = FIELD - TILE * 2; // top of the ground

/** The character picked on the title screen: one wears a cap, the other a bike helmet. */
export type Hero = 'hat' | 'helmet';

interface Progress {
  cleared: string[];
  coins: number;
  mapNode: string;
  /** Picked on the title screen. */
  hero: Hero;
}

const KEY = 'smb3.progress';

function load(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '');
    // 'female' is the helmet hero's id from before the heroes were renamed
    if (p && Array.isArray(p.cleared)) return { cleared: p.cleared, coins: p.coins ?? 0, mapNode: p.mapNode ?? 'start', hero: p.hero === 'helmet' || p.hero === 'female' ? 'helmet' : 'hat' };
  } catch {}
  return { cleared: [], coins: 0, mapNode: 'start', hero: 'hat' };
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
