import type Phaser from 'phaser';
import { ui } from '../game/state';
import { showQuickView } from './overlays';

// On a phone the game sits in a Game Boy Color (src/art/page/gameboy-color.webp,
// laid out in style.css) and its buttons are touch buttons that press the
// same keys the keyboard does: the D-pad moves (down is S: pipes, billboards,
// the slingshot), A jumps, picks and closes cards, B runs, SELECT is Esc (back
// to the map) and START always opens the case studies. B sits above A, so a thumb resting on B rolls down
// onto A for a running jump; every press grows and lights up its button.

const CODES: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32, k: 75, Escape: 27, Enter: 13 };
const A = ' ';
const B = 'k';

/** Keys held by the touch buttons, counted, so two fingers on one key don't let it go early. */
const held = new Map<string, number>();

/** Keeps a finger's moves and lift on the button it went down on, even if it slides off. */
function capture(el: HTMLElement, id: number) {
  try {
    el.setPointerCapture(id);
  } catch {}
}

function fire(type: 'keydown' | 'keyup', key: string) {
  const e = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => CODES[key] });
  Object.defineProperty(e, 'which', { get: () => CODES[key] });
  window.dispatchEvent(e);
}

function press(key: string) {
  const n = held.get(key) ?? 0;
  held.set(key, n + 1);
  if (n === 0) fire('keydown', key);
}

function release(key: string) {
  const n = held.get(key) ?? 0;
  if (n <= 1) {
    held.delete(key);
    if (n === 1) fire('keyup', key);
  } else held.set(key, n - 1);
}

/** A button that holds `keys` down for as long as a finger is on it. */
function button(el: HTMLElement, keys: string[], onPress?: () => void) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    capture(el, e.pointerId);
    el.classList.add('down');
    navigator.vibrate?.(8);
    if (onPress) return onPress();
    keys.forEach(press);
    const up = () => {
      el.classList.remove('down');
      keys.forEach(release);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
  el.addEventListener('pointerup', () => onPress && el.classList.remove('down'));
}

/**
 * B and A share one touch zone, so a single thumb can work both: it holds B once it has touched it, and presses
 * A only while it's on A, rolling on and off to jump again and again. Between them it presses both.
 */
function faceButtons(zone: HTMLElement, a: HTMLElement, b: HTMLElement) {
  const fingers = new Map<number, { a: boolean; b: boolean }>();
  const show = () => {
    a.classList.toggle('down', held.has(A));
    b.classList.toggle('down', held.has(B));
  };
  const set = (e: PointerEvent, first: boolean) => {
    const box = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    };
    const ra = box(a);
    const rb = box(b);
    const da = Math.hypot(e.clientX - ra.x, e.clientY - ra.y);
    const db = Math.hypot(e.clientX - rb.x, e.clientY - rb.y);
    const seam = Math.hypot(e.clientX - (ra.x + rb.x) / 2, e.clientY - (ra.y + rb.y) / 2) < ra.r * 0.55;
    const prev = fingers.get(e.pointerId) ?? { a: false, b: false };
    const next = { a: seam || da < ra.r * 1.2, b: prev.b || seam || db < rb.r * 1.2 };
    // a first touch anywhere in the zone counts as the nearer button
    if (first && !next.a && !next.b) {
      if (da < db) next.a = true;
      else next.b = true;
    }
    if (next.a !== prev.a) (next.a ? press : release)(A);
    if (next.b !== prev.b) (next.b ? press : release)(B);
    fingers.set(e.pointerId, next);
    show();
  };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    capture(zone, e.pointerId);
    navigator.vibrate?.(8);
    set(e, true);
  });
  zone.addEventListener('pointermove', (e) => fingers.has(e.pointerId) && set(e, false));
  const end = (e: PointerEvent) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    if (f.a) release(A);
    if (f.b) release(B);
    fingers.delete(e.pointerId);
    show();
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}

/** The D-pad: the finger's offset from its centre picks one or two arrows, and it can slide between them. */
function dpad(el: HTMLElement) {
  const fingers = new Map<number, Set<string>>();
  const dirs = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    const out = new Set<string>();
    // a dead spot in the middle, and diagonals when the finger is off both axes
    if (Math.hypot(dx, dy) < 0.08) return out;
    if (Math.abs(dx) > Math.abs(dy) * 0.5) out.add(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    if (Math.abs(dy) > Math.abs(dx) * 0.5) out.add(dy < 0 ? 'ArrowUp' : 'ArrowDown');
    return out;
  };
  const update = (e: PointerEvent, next: Set<string>) => {
    const prev = fingers.get(e.pointerId) ?? new Set<string>();
    prev.forEach((k) => !next.has(k) && release(k));
    next.forEach((k) => !prev.has(k) && press(k));
    fingers.set(e.pointerId, next);
    el.dataset.dir = [...next].join(' ');
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    capture(el, e.pointerId);
    navigator.vibrate?.(8);
    update(e, dirs(e));
  });
  el.addEventListener('pointermove', (e) => fingers.has(e.pointerId) && update(e, dirs(e)));
  const end = (e: PointerEvent) => {
    if (!fingers.has(e.pointerId)) return;
    update(e, new Set());
    fingers.delete(e.pointerId);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** Builds the Game Boy's buttons and moves the reading cards out of its little screen, to fill the phone. */
export function setupPhone(game: Phaser.Game) {
  const shell = document.getElementById('tv-flip')!;
  const pad = document.createElement('div');
  pad.id = 'pad';
  pad.innerHTML = `
    <p class="pad-brand">C-V-ision</p>
    <div class="pad-dpad" aria-label="D-pad"><i></i></div>
    <div class="pad-face" aria-label="B: run. A: jump."></div>
    <span class="pad-b"></span>
    <span class="pad-a"></span>
    <button class="pad-select" type="button" aria-label="Select: back to the map"></button>
    <button class="pad-start" type="button" aria-label="Start: read the case studies"></button>`;
  shell.appendChild(pad);
  const $ = (s: string) => pad.querySelector<HTMLElement>(s)!;
  dpad($('.pad-dpad'));
  faceButtons($('.pad-face'), $('.pad-a'), $('.pad-b'));
  button($('.pad-select'), ['Escape']);
  button($('.pad-start'), [], () => {
    if (!ui.blocking) {
      // in a level, the case studies open at that level's own
      const course = game.scene.isActive('Course') ? (game.scene.getScene('Course') as unknown as { slug: string }) : undefined;
      showQuickView(course?.slug, 'phone_start');
    }
  });

  // cards and dialogs open out of the Game Boy's little screen to fill the phone above its buttons, so A
  // still closes them and the D-pad scrolls them
  const overlay = document.getElementById('overlay')!;
  document.body.appendChild(overlay);
  const fit = () => {
    const r = shell.getBoundingClientRect();
    overlay.style.bottom = `${window.innerHeight - (r.top + r.height * 0.535)}px`;
  };
  new ResizeObserver(fit).observe(shell);
  window.addEventListener('resize', fit);
  fit();
  // no long-press menus or double-tap zoom on the Game Boy
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}
