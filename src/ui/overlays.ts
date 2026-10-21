import { getSite, getWorlds, resolveSrc } from '../content/store';
import type { Beat, World } from '../content/types';
import { ui } from '../game/state';
import { sfx } from '../game/sfx';
import { isTyping } from './typing';

// DOM overlays drawn on top of the game screen. Reading long copy in real
// text beats rendering it on the canvas, and it stays selectable/accessible.

const overlay = () => document.getElementById('overlay')!;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Paragraphs and "- " bullet lines → HTML. */
export function richText(s: string): string {
  return s
    .split(/\n{2,}/)
    .map((p) => {
      const lines = p.split('\n');
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(esc).join('<br>')}</p>`;
    })
    .join('');
}

const CLOSE_KEYS = new Set([' ', 'Enter', 'Escape', 'x', 'X', 'z', 'Z']);

/** Mount an overlay node, grab the keyboard, resolve when it closes. */
function open<T = void>(
  node: HTMLElement,
  onKey: (e: KeyboardEvent, close: (v: T) => void) => void,
): Promise<T> {
  ui.blocking = true;
  overlay().appendChild(node);
  return new Promise<T>((resolve) => {
    let done = false;
    const close = (v: T) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', handler, true);
      node.remove();
      ui.blocking = overlay().children.length > 0;
      resolve(v);
    };
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      e.stopImmediatePropagation();
      onKey(e, close);
      if (e.key !== 'Tab') e.preventDefault();
    };
    // Capture phase on window runs before Phaser's own key listener.
    window.addEventListener('keydown', handler, true);
    node.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
      b.addEventListener('click', () => close(b.dataset.close as T)),
    );
  });
}

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

/** SMB3-style text box. Paragraph pages type out; Space advances, Esc closes. */
export function showDialog(title: string, body: string, kicker?: string): Promise<void> {
  const pages = body.split(/\n{2,}/).filter(Boolean);
  const node = el(`
    <div class="ov ov-dialog" role="dialog" aria-label="${esc(title)}">
      <div class="dlg">
        ${kicker ? `<div class="dlg-kicker">${esc(kicker)}</div>` : ''}
        <div class="dlg-title">${esc(title)}</div>
        <div class="dlg-body"></div>
        <div class="dlg-foot"><span class="dlg-page"></span><span class="dlg-next">▼</span></div>
      </div>
    </div>`);
  const bodyEl = node.querySelector<HTMLElement>('.dlg-body')!;
  const pageEl = node.querySelector<HTMLElement>('.dlg-page')!;
  let page = 0;
  let typing = 0;
  let full = '';

  const render = () => {
    full = richText(pages[page] ?? '');
    pageEl.textContent = pages.length > 1 ? `${page + 1}/${pages.length}` : '';
    // Type out the plain text, then swap in the formatted HTML.
    const plain = (pages[page] ?? '').replace(/^\s*[-•]\s+/gm, '• ');
    let i = 0;
    window.clearInterval(typing);
    bodyEl.textContent = '';
    typing = window.setInterval(() => {
      i += 3;
      bodyEl.textContent = plain.slice(0, i);
      if (i >= plain.length) finish();
    }, 16);
  };
  const finish = () => {
    window.clearInterval(typing);
    typing = 0;
    bodyEl.innerHTML = full;
  };
  render();
  node.addEventListener('click', () => advance());
  let closeFn: (() => void) | null = null;
  const advance = () => {
    if (typing) return finish();
    if (page < pages.length - 1) {
      page++;
      sfx.select();
      render();
    } else closeFn?.();
  };
  return open<void>(node, (e, close) => {
    closeFn = () => close();
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowLeft' && page > 0) {
      page--;
      render();
    } else if (CLOSE_KEYS.has(e.key) || e.key === 'ArrowRight') advance();
  }).finally(() => window.clearInterval(typing));
}

export function showImage(src: string, caption: string, alt = ''): Promise<void> {
  const node = el(`
    <div class="ov ov-image" role="dialog" aria-label="${esc(caption)}">
      <figure>
        <img src="${esc(resolveSrc(src))}" alt="${esc(alt || caption)}">
        <figcaption>${esc(caption)}</figcaption>
      </figure>
      <div class="hint">Press SPACE to close</div>
    </div>`);
  node.addEventListener('click', () => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  return open<void>(node, (e, close) => {
    if (CLOSE_KEYS.has(e.key)) close();
  });
}

export function showEndCard(world: World, iconUrl: string): Promise<void> {
  sfx.clear();
  const node = el(`
    <div class="ov ov-end" role="dialog" aria-label="Course clear">
      <div class="dlg end">
        <div class="end-banner">COURSE CLEAR!</div>
        <img class="end-icon" src="${iconUrl}" alt="">
        <div class="dlg-title">${esc(world.title)}</div>
        <div class="end-summary">${richText(world.summary)}</div>
        ${world.outcomes.length ? `<ul class="end-outcomes">${world.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
        ${world.links.length ? `<div class="end-links">${world.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
        <button class="pixel-btn" data-close="map">Back to map ▶</button>
      </div>
    </div>`);
  return open<void>(node, (e, close) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close();
  });
}

export function showLetter(): Promise<void> {
  const c = getSite().contact;
  const node = el(`
    <div class="ov ov-letter" role="dialog" aria-label="Letter">
      <div class="letter">
        <div class="letter-body">${richText(c.letter)}</div>
        <div class="letter-sign">${esc(c.signoff)}</div>
        <div class="letter-links">
          ${c.email ? `<a href="mailto:${esc(c.email)}">✉ ${esc(c.email)}</a>` : ''}
          ${c.linkedin ? `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">in LinkedIn ↗</a>` : ''}
        </div>
        <button class="pixel-btn" data-close="">Close</button>
      </div>
    </div>`);
  return open<void>(node, (e, close) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') close();
  });
}

// ---------- Quick view: the whole portfolio as a plain readable page ----------

function beatHtml(b: Beat): string {
  switch (b.type) {
    case 'copy':
      return `<section><h3>${esc(b.headline)}</h3>${richText(b.body)}</section>`;
    case 'image':
      return `<figure><img loading="lazy" src="${esc(resolveSrc(b.src))}" alt="${esc(b.alt || b.caption)}"><figcaption>${esc(b.caption)}</figcaption></figure>`;
    case 'decision': {
      const pick = b.chosen === 'A' ? b.optionA : b.optionB;
      return `<section class="qv-decision"><h3>Decision: ${esc(b.question)}</h3>
        <div class="qv-opts">
          <div class="${b.chosen === 'A' ? 'won' : ''}"><b>A · ${esc(b.optionA.label)}</b>${richText(b.optionA.body)}</div>
          <div class="${b.chosen === 'B' ? 'won' : ''}"><b>B · ${esc(b.optionB.label)}</b>${richText(b.optionB.body)}</div>
        </div><p><b>Chose ${esc(pick.label)}.</b> ${esc(b.why)}</p></section>`;
    }
    case 'metric':
      return `<div class="qv-metric"><span>${esc(b.value)}</span><div><b>${esc(b.label)}</b>${b.body ? richText(b.body) : ''}</div></div>`;
  }
}

export function showQuickView(focus?: string) {
  const site = getSite();
  const root = document.getElementById('quickview')!;
  const worlds = getWorlds();
  root.innerHTML = `
    <div class="qv-inner">
      <header>
        <button class="qv-close" aria-label="Close">✕ Back to the game</button>
        <h1>${esc(site.name)}</h1>
        <p class="qv-roles">${site.roles.map(esc).join(' · ')}</p>
        <nav>${worlds.map((w, i) => `<a href="#qv-${esc(w.slug)}">W${i + 1} · ${esc(w.title)}</a>`).join('')}</nav>
      </header>
      <section class="qv-about"><h2>${esc(site.about.title)}</h2>${richText(site.about.body)}</section>
      ${worlds
        .map(
          (w, i) => `
        <article id="qv-${esc(w.slug)}">
          <p class="qv-kicker">World ${i + 1} · ${esc(w.platform)} · ${esc(w.timeline)}</p>
          <h2>${esc(w.title)}</h2>
          <p class="qv-tagline">${esc(w.tagline)}</p>
          <p class="qv-role"><b>Role:</b> ${esc(w.role)}</p>
          ${w.beats.map(beatHtml).join('')}
          <section class="qv-summary"><h3>Outcome</h3>${richText(w.summary)}
            ${w.outcomes.length ? `<ul>${w.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
            ${w.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(' ')}
          </section>
        </article>`,
        )
        .join('')}
      <section class="qv-contact"><h2>Say hi</h2>${richText(site.contact.letter)}
        ${site.contact.email ? `<p><a href="mailto:${esc(site.contact.email)}">${esc(site.contact.email)}</a></p>` : ''}
        ${site.contact.linkedin ? `<p><a href="${esc(site.contact.linkedin)}" target="_blank" rel="noopener">LinkedIn ↗</a></p>` : ''}
      </section>
    </div>`;
  root.hidden = false;
  ui.blocking = true;
  document.body.classList.add('qv-open');
  const close = () => {
    root.hidden = true;
    document.body.classList.remove('qv-open');
    ui.blocking = overlay().children.length > 0;
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') {
      e.stopImmediatePropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  root.querySelector('.qv-close')!.addEventListener('click', close);
  if (focus) requestAnimationFrame(() => document.getElementById(`qv-${focus}`)?.scrollIntoView());
  else root.scrollTop = 0;
}
