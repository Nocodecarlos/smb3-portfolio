import { track } from '../analytics';
import { getSite, getWorlds, resolveSrc } from '../content/store';
import type { Beat, World } from '../content/types';
import { PHONE, ui } from '../game/state';
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
  /** A button in the footer, e.g. to download the resume (`download` is the saved file's name). */
  link?: { label: string; href: string; download?: string };
}

/** From this width-to-height ratio on, a reading card's picture goes across the top. */
const WIDE_PICTURE = 1.6;

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
          ${img?.src ? `<p class="story-caption">${esc(img.caption)}</p>` : ''}
        </div>
        <footer class="story-foot">${
          c.link
            ? `<a class="story-btn story-link" href="${esc(resolveSrc(c.link.href))}"${c.link.download ? ` download="${esc(c.link.download)}"` : ''} target="_blank" rel="noopener">${esc(c.link.label)}</a>`
            : ''
        }${PHONE ? 'A to keep playing' : 'SPACE or L to keep playing'}</footer>
      </article>
    </div>`);
  node.addEventListener('click', () => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  // the link downloads without closing the card
  node.querySelector('.story-link')?.addEventListener('click', (e) => e.stopPropagation());
  const text = node.querySelector<HTMLElement>('.story-text')!;
  // a wide picture goes across the top of the card; anything narrower stands full height beside the text
  const picture = node.querySelector<HTMLImageElement>('.story-img img');
  const fit = () => node.querySelector('.story')!.classList.toggle('is-wide', picture!.naturalWidth / picture!.naturalHeight >= WIDE_PICTURE);
  if (picture?.complete) fit();
  else picture?.addEventListener('load', fit);
  return open<void>(node, (e, close) => {
    // longer pieces scroll: arrows or W/S
    const scroll = { ArrowDown: 1, s: 1, S: 1, ArrowUp: -1, w: -1, W: -1 }[e.key];
    if (scroll) text.scrollBy({ top: scroll * 40, behavior: 'smooth' });
    else if (CLOSE_KEYS.has(e.key) || e.key === 'l' || e.key === 'L') close();
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
      <div class="hint">${PHONE ? 'Press A to close' : 'Press SPACE to close'}</div>
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
  // on a phone there's no "Skip the game" button to point at (START does it), and a wider screen plays better
  const body = PHONE ? about.body.replace(/Tap [“"]Skip the game[^.]*\.[”"]?/, 'Press START anytime.') : about.body;
  const node = el(`
    <div class="ov ov-story" role="dialog" aria-label="${esc(about.title)}">
      <article class="story intro-story">
        <header class="story-head"><span>WELCOME</span></header>
        <div class="story-text">
          <h2 class="story-title">${esc(about.title)}</h2>
          <div class="story-body">${richText(body)}${PHONE ? `<p class="intro-wide">This portfolio is better played on a wider screen. <button class="intro-send" type="button">Send to desktop?</button></p>` : ''}</div>
        </div>
        <footer class="story-foot"><button class="story-btn" data-close="">ok let's a-go</button></footer>
      </article>
    </div>`);
  node.querySelector<HTMLElement>('.intro-send')?.addEventListener('click', (e) => void sendToDesktop(e.currentTarget as HTMLElement));
  const shown = performance.now();
  return open<void>(node, (e, close) => {
    // the Enter that left the title screen can still be repeating: ignore keys for a moment
    if (performance.now() - shown < 500) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') close();
  });
}

/** Gets the site's link off the phone: the share sheet, or the clipboard, or at worst the link itself to copy by hand. */
async function sendToDesktop(btn: HTMLElement) {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, text: 'Play this portfolio on a computer', url });
      track('send_to_desktop', { method: 'share' });
      return;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    track('send_to_desktop', { method: 'copy' });
    btn.textContent = 'Link copied!';
  } catch {
    btn.textContent = url;
  }
}

export function showLetter(): Promise<void> {
  const c = getSite().contact;
  const node = el(`
    <div class="ov ov-story" role="dialog" aria-label="Letter">
      <article class="story letter-story">
        <header class="story-head"><span>LET'S CHAT</span></header>
        <div class="story-text">
          <div class="story-body">${richText(c.letter)}</div>
          <div class="letter-sign">${esc(c.signoff)}</div>
          <div class="letter-links">
            ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}
            ${c.email ? `<button class="letter-copy" type="button">Copy email</button>` : ''}
            ${c.linkedin ? `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
            ${c.resume ? `<a href="${esc(resolveSrc(c.resume))}" download="Carlos-Velasquez-Resume.pdf">Resume</a>` : ''}
          </div>
        </div>
        <footer class="story-foot"><button class="story-btn" data-close="">back to the castle</button></footer>
      </article>
    </div>`);
  const copy = node.querySelector<HTMLButtonElement>('.letter-copy');
  copy?.addEventListener('click', async () => {
    track('contact_clicked', { channel: 'email_copy' });
    try {
      await navigator.clipboard.writeText(c.email);
      copy.textContent = 'Copied!';
    } catch {
      copy.textContent = c.email;
    }
  });
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
      if (img) return `<figure>${img[2] ? `<img src="${esc(resolveSrc(img[2]))}" alt="${esc(img[1])}" tabindex="0">` : placeholder(img[1])}<figcaption>${inline(img[1])}</figcaption></figure>`;
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
      return `<figure>${b.src ? `<img loading="lazy" src="${esc(resolveSrc(b.src))}" alt="${esc(b.alt || b.caption)}" tabindex="0">` : placeholder(b.caption)}<figcaption>${esc(b.caption)}</figcaption></figure>`;
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

/** A world's picture for its card: its own thumb, or the article's first picture. */
function thumbOf(w: World): string | undefined {
  return w.thumb || (w.article && /!\[.*\]\((.+)\)/.exec(w.article)?.[1]) || undefined;
}

function contactHtml(): string {
  const c = getSite().contact;
  return `<section class="qv-contact"><h2>Say hi</h2>${richText(c.letter)}
    <p class="qv-contact-links">
      ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}
      ${c.linkedin ? `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ''}
      ${c.resume ? `<a href="${esc(resolveSrc(c.resume))}" download="Carlos-Velasquez-Resume.pdf">Resume (PDF)</a>` : ''}
    </p></section>`;
}

/** The front page: every project as a card. */
function homeHtml(worlds: World[]): string {
  return `
    <div class="qv-inner qv-home">
      <p class="qv-intro">${esc(getSite().about.title)} I'm a product designer who builds what I design. Here's the work.</p>
      <div class="qv-grid">
        ${worlds
          .map((w) => {
            const thumb = thumbOf(w);
            return `<a class="qv-card" href="#work/${esc(w.slug)}" data-page="${esc(w.slug)}">
              <div class="qv-thumb">${thumb ? `<img loading="lazy" src="${esc(resolveSrc(thumb))}" alt="">` : ''}</div>
              <p class="qv-kicker">${esc(w.platform)} · ${esc(w.timeline)}</p>
              <h2>${esc(w.title)}</h2>
              <p class="qv-card-line">${esc(w.tagline)}</p>
              <p class="qv-card-role">${esc(w.role)}</p>
            </a>`;
          })
          .join('')}
      </div>
      ${contactHtml()}
    </div>`;
}

/** One project on its own page, with a way on to the next. */
function projectHtml(w: World, worlds: World[]): string {
  const article = w.article ? articleHtml(w.article, w.slug) : null;
  const links = w.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(' ');
  const next = worlds[(worlds.indexOf(w) + 1) % worlds.length];
  return `
    <div class="qv-inner">
      <article id="qv-${esc(w.slug)}">
        <a class="qv-back" href="#work" data-page="">← All projects</a>
        <p class="qv-kicker">${esc(w.platform)} · ${esc(w.timeline)}</p>
        <h2>${esc(w.title)}</h2>
        <p class="qv-tagline">${esc(w.tagline)}</p>
        <p class="qv-role"><b>Role:</b> ${esc(w.role)}</p>
        ${article ? `<nav class="qv-toc" aria-label="${esc(w.title)} sections">${article.toc.map((t) => `<a href="#${esc(t.id)}">${esc(t.label)}</a>`).join('')}</nav>` : ''}
        ${
          // the full case study when there is one; otherwise the game's beats, read in order
          article
            ? `<div class="qv-article">${article.html}</div><section class="qv-summary">${links}</section>`
            : `${w.beats.map(beatHtml).join('')}
        <section class="qv-summary"><h3>Outcome</h3>${richText(w.summary)}
          ${w.outcomes.length ? `<ul>${w.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
          ${links}
        </section>`
        }
      </article>
      ${next && next !== w ? `<a class="qv-next" href="#work/${esc(next.slug)}" data-page="${esc(next.slug)}"><span>Next project</span>${esc(next.title)} →</a>` : ''}
      ${contactHtml()}
    </div>`;
}

export function showQuickView(focus?: string, source = 'other') {
  track('case_studies_opened', { source, focus });
  const openedAt = Date.now();
  const site = getSite();
  const root = document.getElementById('quickview')!;
  const worlds = [...getWorlds()].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  const c = site.contact;
  let seen: IntersectionObserver | undefined;
  const reported = new Set<string>();

  /** Draw the front page ('') or a project, and report what gets read. */
  const show = (page: string) => {
    const world = worlds.find((w) => w.slug === page);
    root.classList.toggle('home', !world);
    root.innerHTML = `
      <div class="qv-band" aria-hidden="true"></div>
      <header class="qv-top">
        <div class="qv-top-in">
          <div class="qv-head-row">
            <h1><a href="#work" data-page="">${esc(site.name)}</a></h1>
            <button class="qv-close" aria-label="Close">▶ Play the game</button>
          </div>
          <p class="qv-roles">${esc(site.title || site.roles.join(' · '))}</p>
          <nav aria-label="Projects and contact">
            ${worlds.map((w) => `<a href="#work/${esc(w.slug)}" data-page="${esc(w.slug)}"${w === world ? ' aria-current="page"' : ''}>${esc(w.title)}</a>`).join('')}
            ${c.resume ? `<a class="qv-nav-resume" href="${esc(resolveSrc(c.resume))}" download="Carlos-Velasquez-Resume.pdf">Resume</a>` : ''}
          </nav>
        </div>
      </header>
      ${world ? projectHtml(world, worlds) : homeHtml(worlds)}`;
    root.querySelector('.qv-close')!.addEventListener('click', close);
    root.scrollTop = 0;
    seen?.disconnect();
    if (!world) return;
    const viewed = `case_study_viewed${world.slug}`;
    if (!reported.has(viewed)) {
      reported.add(viewed);
      track('case_study_viewed', { world: world.slug });
    }
    seen = new IntersectionObserver(
      (entries) => {
        const finished = `case_study_finished${world.slug}`;
        if (!entries.some((e) => e.isIntersecting) || reported.has(finished)) return;
        reported.add(finished);
        track('case_study_finished', { world: world.slug });
      },
      { root },
    );
    const end = root.querySelector('.qv-summary');
    if (end) seen.observe(end);
  };
  const pageFromHash = () => /^#work\/(.+)$/.exec(location.hash)?.[1] ?? '';

  const close = () => {
    closeZoom();
    root.hidden = true;
    document.body.classList.remove('qv-open');
    ui.blocking = overlay().children.length > 0;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('popstate', onPop);
    seen?.disconnect();
    history.replaceState(null, '', location.pathname + location.search);
    track('case_studies_closed', { seconds: Math.round((Date.now() - openedAt) / 1000) });
  };
  // the browser's back button walks the pages, and past the first one back to the game
  const onPop = () => (location.hash.startsWith('#work') ? show(pageFromHash()) : close());

  // ---- a picture, full size
  let zoom: HTMLElement | null = null;
  const closeZoom = () => {
    zoom?.remove();
    zoom = null;
  };
  const openZoom = (img: HTMLImageElement) => {
    track('image_enlarged', { src: img.getAttribute('src') ?? '' });
    zoom = el(`
      <div class="qv-zoom" role="dialog" aria-label="Enlarged image">
        <button class="qv-zoom-close" type="button" aria-label="Close image">✕</button>
        <img src="${esc(img.currentSrc || img.src)}" alt="${esc(img.alt)}">
      </div>`);
    zoom.addEventListener('click', (e) => {
      const big = (e.target as HTMLElement).closest<HTMLImageElement>('.qv-zoom img');
      // the picture itself toggles between fitting the screen and its full size
      if (big) big.classList.toggle('full');
      else closeZoom();
    });
    root.appendChild(zoom);
  };

  const onKey = (e: KeyboardEvent) => {
    const activate = (e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).matches?.('.qv-inner figure img');
    if (activate) {
      e.preventDefault();
      openZoom(e.target as HTMLImageElement);
      return;
    }
    if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') {
      e.stopImmediatePropagation();
      if (zoom) closeZoom();
      else close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('popstate', onPop);

  root.onclick = (e) => {
    const t = e.target as HTMLElement;
    const pic = t.closest<HTMLImageElement>('.qv-inner figure img');
    if (pic) return openZoom(pic);
    const pageLink = t.closest<HTMLAnchorElement>('a[data-page]');
    if (pageLink) {
      e.preventDefault();
      const page = pageLink.dataset.page!;
      history.pushState(null, '', page ? `#work/${page}` : '#work');
      return show(page);
    }
    // the jump links scroll this page smoothly (and don't touch the address bar)
    const a = t.closest<HTMLAnchorElement>('a[href^="#"]');
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

  root.hidden = false;
  ui.blocking = true;
  document.body.classList.add('qv-open');
  const page = worlds.some((w) => w.slug === focus) ? focus! : '';
  history.pushState(null, '', page ? `#work/${page}` : '#work');
  show(page);
}

/** A shared link straight to the work: site/#work or site/#work/pause. */
export function openQuickViewFromLink() {
  const m = /^#work(?:\/(.+))?$/.exec(location.hash);
  if (m) showQuickView(m[1], 'link');
}
