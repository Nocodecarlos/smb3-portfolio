import { showQuickView } from './overlays';

export function isMobile(): boolean {
  if (new URLSearchParams(location.search).has('desktop')) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
  return coarse || window.innerWidth < 720;
}

/** Phones get a Game Boy that points them to desktop, with a way to read anyway. */
export function showMobileGate() {
  document.getElementById('stage')!.hidden = true;
  const gate = document.getElementById('mobile')!;
  gate.hidden = false;
  document.body.style.overflow = 'auto';

  document.getElementById('gb-read')!.addEventListener('click', () => showQuickView());
  document.getElementById('gb-share')!.addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title: document.title, text: 'Play this portfolio on desktop', url });
      else {
        await navigator.clipboard.writeText(url);
        alert('Link copied. Open it on your computer.');
      }
    } catch {}
  });
}
