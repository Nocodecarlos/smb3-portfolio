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

export interface StoryCard {
  /** Chapter name or the decision's question. */
  kicker: string;
  title: string;
  body: string;
  image?: { src: string; caption: string; alt?: string };
  /** e.g. "3 / 11 stories". */
  progress?: string;
}

/**
 * Felt reading card for a story block (Figma: ui-felt/dialog-box). The game
 * is paused underneath; one idea per card, no typing effect, closes on
 * Space / Enter / L / Esc or a click.
 */
export function showStory(c: StoryCard): Promise<void> {
  const img = c.image;
  const node = el(`
    <div class="ov ov-story" role="dialog" aria-label="${esc(c.title)}">
      <article class="story ${img ? 'has-img' : ''}">
        <header class="story-head"><span>${esc(c.kicker)}</span>${c.progress ? `<span class="story-progress">${esc(c.progress)}</span>` : ''}</header>
        ${
          img
            ? `<figure class="story-img">${img.src ? `<img src="${esc(resolveSrc(img.src))}" alt="${esc(img.alt || img.caption)}">` : placeholder(img.caption)}${img.src ? `<figcaption>${esc(img.caption)}</figcaption>` : ''}</figure>`
            : ''
        }
        <div class="story-text">
          <h2 class="story-title">${esc(c.title)}</h2>
          <div class="story-body">${richText(c.body)}</div>
        </div>
        <footer class="story-foot">SPACE or L to keep playing</footer>
      </article>
    </div>`);
  node.addEventListener('click', () => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  return open<void>(node, (e, close) => {
    if (CLOSE_KEYS.has(e.key) || e.key === 'l' || e.key === 'L') close();
  });
}

/** Stand-in for an image that hasn't been added yet (empty `src`). */
const placeholder = (caption: string) => `<div class="img-placeholder" role="img" aria-label="${esc(caption)}"><span>IMAGE COMING SOON</span>${esc(caption)}</div>`;

export function showImage(src: string, caption: string, alt = ''): Promise<void> {
  const node = el(`
    <div class="ov ov-image" role="dialog" aria-label="${esc(caption)}">
      <figure>
        ${src ? `<img src="${esc(resolveSrc(src))}" alt="${esc(alt || caption)}">` : placeholder(caption)}
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
    <div class="ov ov-end ov-story" role="dialog" aria-label="Course clear">
      <article class="story end-story">
        <header class="story-head"><span>COURSE CLEAR!</span><img class="end-icon" src="${iconUrl}" alt=""></header>
        <div class="story-text">
          <h2 class="story-title">${esc(world.title)}</h2>
          <div class="story-body">
            ${richText(world.summary)}
            ${world.outcomes.length ? `<h3>What happened</h3><ul>${world.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
            ${world.lessons?.length ? `<h3>What I learned</h3><ul>${world.lessons.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
          </div>
          ${world.links.length ? `<div class="end-links">${world.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
        </div>
        <footer class="story-foot"><button class="story-btn" data-close="map">Back to map ›</button></footer>
      </article>
    </div>`);
  return open<void>(node, (e, close) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close();
  });
}

/**
 * The welcome card: who I am and how the portfolio works. Shown over the map
 * when a session starts, and again from the About house. Its text is the
 * site's `about`.
 */
export function showIntro(): Promise<void> {
  const about = getSite().about;
  const node = el(`
    <div class="ov ov-story" role="dialog" aria-label="${esc(about.title)}">
      <article class="story intro-story">
        <header class="story-head"><span>WELCOME</span></header>
        <div class="story-text">
          <h2 class="story-title">${esc(about.title)}</h2>
          <div class="story-body">${richText(about.body)}</div>
        </div>
        <footer class="story-foot"><button class="story-btn" data-close="">ok let's a-go</button></footer>
      </article>
    </div>`);
  const shown = performance.now();
  return open<void>(node, (e, close) => {
    // the Enter that left the title screen can still be repeating: ignore keys for a moment
    if (performance.now() - shown < 500) return;
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

/** **bold**, `code` and [links](https://…) inside a line of article text. */
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1 ↗</a>');
}

/**
 * A world's full case study (`World.article`): a small Markdown subset.
 * Blocks are separated by blank lines: ## and ### headings, "> " quotes,
 * "- " and "1. " lists, a "| a | b |" table, and ![caption](path) images.
 */
function articleHtml(md: string, slug: string): { html: string; toc: { id: string; label: string }[] } {
  const toc: { id: string; label: string }[] = [];
  const html = md
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      const first = lines[0];
      if (first.startsWith('### ')) return `<h4>${inline(first.slice(4))}</h4>`;
      if (first.startsWith('## ')) {
        // every section heading is a stop in the jump links: "3. Designing the happy path" → "Designing the happy path"
        const text = first.slice(3);
        const label = text.replace(/^\d+\.\s*/, '').split(':')[0];
        const id = `qv-${slug}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        toc.push({ id, label });
        return `<h3 id="${esc(id)}">${inline(text)}</h3>`;
      }
      const img = /^!\[(.*)\]\((.*)\)$/.exec(first);
      // an empty path is a picture that isn't added yet
      // loaded up front: pictures that pop in later would push the jump-link targets out of place
      if (img) return `<figure>${img[2] ? `<img src="${esc(resolveSrc(img[2]))}" alt="${esc(img[1])}">` : placeholder(img[1])}<figcaption>${inline(img[1])}</figcaption></figure>`;
      if (lines.every((l) => l.startsWith('>'))) return `<blockquote>${inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '))}</blockquote>`;
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
      if (lines.every((l) => /^\d+\.\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
      if (lines.every((l) => l.startsWith('|'))) {
        const cells = (l: string) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const [head, , ...rows] = lines;
        return `<div class="qv-table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
  return { html, toc };
}

function beatHtml(b: Beat): string {
  switch (b.type) {
    case 'copy':
      return `<section><h3>${esc(b.headline)}</h3>${richText(b.body)}</section>`;
    case 'image':
      return `<figure>${b.src ? `<img loading="lazy" src="${esc(resolveSrc(b.src))}" alt="${esc(b.alt || b.caption)}">` : placeholder(b.caption)}<figcaption>${esc(b.caption)}</figcaption></figure>`;
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
    <div class="qv-band" aria-hidden="true"></div>
    <header class="qv-top">
      <div class="qv-top-in">
        <div class="qv-head-row">
          <h1>${esc(site.name)}</h1>
          <button class="qv-close" aria-label="Close">✕ Back to the game</button>
        </div>
        <p class="qv-roles">${esc(site.title || site.roles.join(' · '))}</p>
        <nav aria-label="Case studies">${worlds.map((w, i) => `<a href="#qv-${esc(w.slug)}">W${i + 1} · ${esc(w.title)}</a>`).join('')}</nav>
      </div>
    </header>
    <div class="qv-inner">
      ${worlds
        .map((w, i) => {
          const article = w.article ? articleHtml(w.article, w.slug) : null;
          return `
        <article id="qv-${esc(w.slug)}">
          <p class="qv-kicker">World ${i + 1} · ${esc(w.platform)} · ${esc(w.timeline)}</p>
          <h2>${esc(w.title)}</h2>
          <p class="qv-tagline">${esc(w.tagline)}</p>
          <p class="qv-role"><b>Role:</b> ${esc(w.role)}</p>
          ${article ? `<nav class="qv-toc" aria-label="${esc(w.title)} sections">${article.toc.map((t) => `<a href="#${esc(t.id)}">${esc(t.label)}</a>`).join('')}</nav>` : ''}
          ${
            // the full case study when there is one; otherwise the game's beats, read in order
            article
              ? `<div class="qv-article">${article.html}</div>
          <section class="qv-summary">${w.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(' ')}</section>`
              : `${w.beats.map(beatHtml).join('')}
          <section class="qv-summary"><h3>Outcome</h3>${richText(w.summary)}
            ${w.outcomes.length ? `<ul>${w.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
            ${w.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(' ')}
          </section>`
          }
        </article>`;
        })
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
  // the jump links scroll this page smoothly (and don't touch the address bar)
  root.onclick = (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    const target = a && document.getElementById(a.getAttribute('href')!.slice(1));
    if (!target) return;
    e.preventDefault();
    // stop just under the sticky header, whatever height it has at this width
    const header = root.querySelector('header')!;
    const gap = () => header.getBoundingClientRect().bottom + 16;
    const go = (smooth: boolean) => root.scrollTo({ top: root.scrollTop + target.getBoundingClientRect().top - gap(), behavior: smooth ? 'smooth' : 'auto' });
    go(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // a picture finishing its load mid-scroll can move the target: land exactly once it settles
    window.setTimeout(() => {
      if (Math.abs(target.getBoundingClientRect().top - gap()) > 6) go(false);
    }, 900);
  };
  if (focus) requestAnimationFrame(() => document.getElementById(`qv-${focus}`)?.scrollIntoView());
  else root.scrollTop = 0;
}
