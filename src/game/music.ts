import Phaser from 'phaser';
import { asset } from '../assets';

// Background music: one looping track at a time, shared across scenes
// (Phaser's sound manager is global). The overworld and each course have a
// track (World 1-2's is "Hidden Forest Loop", the fortress's "Dungeon Loop", World 1-5's "Christmas Chiptune"); the title is silent. Files live
// in public/music as AAC with an MP3 fallback. Browsers only allow sound after
// the first key press, so a track asked for before then starts on that press.

export type Track = 'overworld' | 'world-1-1' | 'world-1-2' | 'world-1-3' | 'world-1-5' | 'fortress';

import { setSfxGain } from './sfx';

const VOLUME = 0.45;
/**
 * The TV's volume: 0 (off) to 20, like a 90s set's bar, where 12 is the usual loudness. Set with the buttons on the TV's bottom strip or the
 * - and + keys, and remembered. It turns the sound effects up and down too.
 */
export const VOLUME_MAX = 20;
const USUAL = 12;
let level = USUAL;
try {
  const saved = Number(localStorage.getItem('smb3.vol20') ?? USUAL);
  if (saved >= 0 && saved <= VOLUME_MAX) level = Math.round(saved);
} catch {}
setSfxGain(level / USUAL);
/** Hushed while the case studies are open: reading is quiet. */
let hushed = false;
const loudness = () => (hushed ? 0 : (VOLUME * level) / USUAL);

export function volumeLevel() {
  return level;
}

/** Turn the volume up or down a step. Returns the new level. */
export function stepVolume(by: number) {
  level = Math.max(0, Math.min(VOLUME_MAX, level + by));
  try {
    localStorage.setItem('smb3.vol20', String(level));
  } catch {}
  setSfxGain(level / USUAL);
  if (current) ramp(current.sound, loudness(), 200);
  return level;
}

/** Fade the music out while something is being read (the case studies), and back in after. */
export function hushMusic(on: boolean) {
  hushed = on;
  if (current) ramp(current.sound, loudness(), on ? 350 : 700);
}
let current: { track: Track; sound: Phaser.Sound.BaseSound } | null = null;
let pending: (() => void) | null = null;
/** The track the current scene asked for (a late-loading file only plays if it's still wanted). */
let wanted: Track | null = null;

const key = (t: Track) => `music:${t}`;

/**
 * Fade into `track` (no-op if it's already playing). The file loads in the
 * background the first time, so entering a scene never waits on music.
 */
export function playMusic(scene: Phaser.Scene, track: Track) {
  if (current?.track === track) return;
  stopMusic();
  wanted = track;
  if (!scene.cache.audio.exists(key(track))) {
    scene.load.audio(key(track), [asset(`music/${track}.m4a`), asset(`music/${track}.mp3`)]);
    scene.load.once(`filecomplete-audio-${key(track)}`, () => wanted === track && playMusic(scene, track));
    scene.load.start();
    return;
  }
  const sounds = scene.sound;
  const start = () => {
    pending = null;
    if (wanted !== track) return;
    const sound = sounds.add(key(track), { loop: true, volume: 0 });
    sound.play();
    current = { track, sound };
    ramp(sound, loudness(), 900);
  };
  if (sounds.locked) {
    if (pending) sounds.off(Phaser.Sound.Events.UNLOCKED, pending);
    pending = start;
    sounds.once(Phaser.Sound.Events.UNLOCKED, start);
  } else start();
}

/** Fade out and drop whatever is playing. */
export function stopMusic() {
  wanted = null;
  const c = current;
  current = null;
  if (!c) return;
  ramp(c.sound, 0, 350, () => c.sound.destroy());
}

/** Volume ramp on a timer, so it survives the scene that started it shutting down. */
const ramps = new WeakMap<Phaser.Sound.BaseSound, number>();
function ramp(sound: Phaser.Sound.BaseSound, to: number, ms: number, done?: () => void) {
  const s = sound as Phaser.Sound.WebAudioSound;
  // a new ramp takes over from one still running on the same sound
  window.clearInterval(ramps.get(sound));
  const from = s.volume ?? 0;
  const t0 = performance.now();
  // a timer rather than animation frames, which pause in background tabs
  const id = window.setInterval(() => {
    if (!s.manager) return window.clearInterval(id);
    const k = Math.min(1, (performance.now() - t0) / ms);
    s.setVolume(from + (to - from) * k);
    if (k >= 1) {
      window.clearInterval(id);
      done?.();
    }
  }, 30);
  ramps.set(sound, id);
}
