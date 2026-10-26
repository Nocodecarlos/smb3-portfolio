// The SMB3 opening: a felt curtain covers the screen while the game loads,
// then rises to reveal the title. Any key or click hurries it along.

let raised = false;

/** Lift the curtain (only the first time; later title visits skip it). */
export function raiseCurtain(delay = 500) {
  if (raised) return;
  raised = true;
  const curtain = document.getElementById('curtain');
  if (!curtain) return;
  const lift = () => {
    window.removeEventListener('keydown', hurry, true);
    window.removeEventListener('pointerdown', hurry, true);
    curtain.classList.add('up');
    curtain.addEventListener('transitionend', () => curtain.remove(), { once: true });
  };
  const timer = window.setTimeout(lift, delay);
  // the key or click that hurries the curtain shouldn't also pick a hero behind it
  const hurry = (e: Event) => {
    e.stopPropagation();
    window.clearTimeout(timer);
    curtain.classList.add('fast');
    lift();
  };
  window.addEventListener('keydown', hurry, true);
  window.addEventListener('pointerdown', hurry, true);
}
