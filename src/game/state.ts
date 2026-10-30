import type { Lens } from '../content/types';

// Screen and play state shared by scenes. Progress is a per-visitor nicety,
// so it lives in localStorage and the game works without it.

export const TILE = 16;

/**
 * Phones play in a Game Boy Color (src/ui/phone.ts) with touch buttons. ?phone forces it on a desktop, to
 * test; ?desktop turns it off.
 */
export const PHONE = (() => {
  const q = new URLSearchParams(location.search);
  if (q.has('phone')) return true;
  if (q.has('desktop')) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
  return coarse || window.innerWidth < 720;
})();
/** What on-screen hints call the keys: S and Esc on a keyboard; on the Game Boy, the D-pad's down, SELECT, and A to stop the bonus game. */
export const KEYS = PHONE ? { s: 'DOWN', esc: 'SELECT', stop: 'A' } : { s: 'S', esc: 'ESC', stop: 'S' };
/** 16:9 at the NES's 240 lines (426.7, rounded); on a phone, the NES's own 256, almost square. */
export const WIDTH = PHONE ? 256 : 427;
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
  /** Cleared worlds whose map tile has already flipped to the check card. */
  flipped: string[];
}

const KEY = 'smb3.progress';

function load(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '');
    // 'female' is the helmet hero's id from before the heroes were renamed
    if (p && Array.isArray(p.cleared)) {
      const hero = p.hero === 'helmet' || p.hero === 'female' ? 'helmet' : 'hat';
      return { cleared: p.cleared, coins: p.coins ?? 0, mapNode: p.mapNode ?? 'start', hero, flipped: Array.isArray(p.flipped) ? p.flipped : [] };
    }
  } catch {}
  return { cleared: [], coins: 0, mapNode: 'start', hero: 'hat', flipped: [] };
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
