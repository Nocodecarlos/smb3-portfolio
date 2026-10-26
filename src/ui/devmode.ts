import Phaser from 'phaser';
import { CARD_ICONS } from '../art/sprites';
import { THEME_NAMES } from '../art/themes';
import {
  addPendingAsset,
  getDirtyFiles,
  getSite,
  getWorld,
  getWorlds,
  hasUnsavedChanges,
  markSaved,
  newId,
  onContentChange,
  replaceSite,
  replaceWorld,
  resolveSrc,
  updateSite,
  updateWorld,
} from '../content/store';
import type { Beat, BeatType, Site, World } from '../content/types';
import { sfx } from '../game/sfx';
import { ui } from '../game/state';
import { devBus } from './devBus';
import { isTyping } from './typing';
import { commitFiles, getToken, setToken } from './github';

// Dev mode: enter the cheat code (or hold S on the tall white platform in a
// felt course) and the TV flips to a black-and-white editor: the other side
// of the world. Anyone can open it and poke around; only someone with a
// GitHub token that can write to the repo can save.

const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

let game: Phaser.Game;
let scope = 'site';
let tab: 'edit' | 'json' | 'docs' = 'edit';
let selected: string | null = null;
let saveState: 'idle' | 'ask' | 'saving' | 'done' | 'error' = 'idle';
let saveMsg = '';

const panel = () => document.getElementById('dev-panel')!;
const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function initDevMode(g: Phaser.Game) {
  game = g;
  let pos = 0;
  window.addEventListener(
    'keydown',
    (e) => {
      const t = e.target as HTMLElement;
      if (isTyping(t)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = key === CODE[pos] ? pos + 1 : key === CODE[0] ? 1 : 0;
      if (pos === CODE.length) {
        pos = 0;
        toggle();
      }
    },
    true,
  );
  devBus.on('select', ({ slug, beatId }) => {
    scope = slug;
    selected = beatId;
    tab = 'edit';
    render();
    requestAnimationFrame(() => panel().querySelector(`[data-beat="${beatId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  });
  onContentChange(() => updateStatus());
  window.addEventListener('beforeunload', (e) => {
    if (ui.dev && hasUnsavedChanges()) e.preventDefault();
  });
  // Handy for testing: /?dev opens it directly.
  if (new URLSearchParams(location.search).has('dev')) setTimeout(toggle, 300);
}

function activeWorldSlug(): string | null {
  for (const key of ['Course', 'World']) {
    if (game.scene.isActive(key)) return (game.scene.getScene(key) as unknown as { slug: string }).slug;
  }
  return null;
}

/** The tile the player stands on in a felt course, for adding beats where they are. */
function courseTile(): [number, number] | null {
  if (!game.scene.isActive('Course')) return null;
  return (game.scene.getScene('Course') as unknown as { playerTile: [number, number] }).playerTile;
}

/** Flip to (or back from) the other side. */
export function setDevMode(on: boolean) {
  if (ui.dev !== on) toggle();
}

function toggle() {
  sfx.secret();
  const flip = document.getElementById('tv-flip')!;
  flip.classList.remove('flipping');
  void flip.offsetWidth;
  flip.classList.add('flipping');
  setTimeout(() => {
    ui.dev = !ui.dev;
    document.body.classList.toggle('dev', ui.dev);
    panel().hidden = !ui.dev;
    if (ui.dev) {
      scope = activeWorldSlug() ?? scope;
      render();
    }
    devBus.emit('dev', ui.dev);
    game.scale.refresh();
  }, 450);
}

// ---------- Rendering ----------

function render() {
  const p = panel();
  const worlds = getWorlds();
  p.innerHTML = `
    <header>
      <h2>DEV MODE <button class="dev-btn small" data-act="exit" title="Exit (or type the code again)">✕</button></h2>
      <p class="sub">You found the other side. This is the CMS I use to edit this portfolio: click a story block or billboard in the game to edit it.</p>
      <div class="dev-tabs">
        ${(['edit', 'json', 'docs'] as const).map((t) => `<button data-act="tab" data-v="${t}" class="${tab === t ? 'on' : ''}">${{ edit: 'Edit', json: 'JSON', docs: 'How it works' }[t]}</button>`).join('')}
      </div>
    </header>
    <div class="dev-body">
      ${tab !== 'docs' ? `<label>Editing</label>
      <select data-act="scope">
        <option value="site" ${scope === 'site' ? 'selected' : ''}>Site: title screen, map, about, contact</option>
        ${worlds.map((w, i) => `<option value="${esc(w.slug)}" ${scope === w.slug ? 'selected' : ''}>World ${i + 1}: ${esc(w.title)}</option>`).join('')}
      </select>` : ''}
      ${saveState !== 'idle' ? saveBox() : ''}
      ${tab === 'edit' ? (scope === 'site' ? siteForm(getSite()) : worldForm(getWorld(scope)!)) : tab === 'json' ? jsonTab() : docsTab()}
    </div>
    <footer>
      <span class="status"></span>
      <button class="dev-btn primary" data-act="save">Save to GitHub</button>
    </footer>`;
  bind();
  updateStatus();
}

function updateStatus() {
  const s = panel().querySelector('.status');
  if (s) s.textContent = hasUnsavedChanges() ? `● ${getDirtyFiles().length} unsaved file(s)` : 'No changes';
}

const field = (label: string, f: string, value: string, opts: { area?: boolean; beat?: string; kind?: string; rows?: number } = {}) => `
  <label>${esc(label)}</label>
  ${
    opts.area
      ? `<textarea data-f="${f}" ${opts.beat ? `data-b="${opts.beat}"` : ''} ${opts.kind ? `data-kind="${opts.kind}"` : ''} rows="${opts.rows ?? 4}">${esc(value)}</textarea>`
      : `<input data-f="${f}" ${opts.beat ? `data-b="${opts.beat}"` : ''} ${opts.kind ? `data-kind="${opts.kind}"` : ''} value="${esc(value)}">`
  }`;

const select = (label: string, f: string, value: string, options: [string, string][], beat?: string) => `
  <label>${esc(label)}</label>
  <select data-f="${f}" ${beat ? `data-b="${beat}"` : ''}>
    ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}
  </select>`;

function siteForm(s: Site): string {
  return `
    ${field('Name (title screen)', 'name', s.name)}
    <div class="row"><div>${field('Menu option 1', 'roles.0', s.roles[0])}</div><div>${field('Menu option 2', 'roles.1', s.roles[1])}</div></div>
    ${field('Year', 'year', s.year)}
    ${field('About house: title', 'about.title', s.about.title)}
    ${field('About house: body (blank line = new page)', 'about.body', s.about.body, { area: true, rows: 6 })}
    ${field('Castle letter (blank line = new paragraph)', 'contact.letter', s.contact.letter, { area: true, rows: 6 })}
    ${field('Sign-off', 'contact.signoff', s.contact.signoff)}
    ${field('Email', 'contact.email', s.contact.email)}
    ${field('LinkedIn URL', 'contact.linkedin', s.contact.linkedin)}
    <div class="row"><div>${field('Repo owner', 'repo.owner', s.repo.owner)}</div><div>${field('Repo name', 'repo.name', s.repo.name)}</div><div>${field('Branch', 'repo.branch', s.repo.branch)}</div></div>
    <p class="sub" style="margin-top:12px">Map layout (node positions and paths) is in the JSON tab.</p>`;
}

function worldForm(w: World): string {
  if (w.level) return courseForm(w);
  return `
    ${field('Title', 'title', w.title)}
    ${field('Tagline', 'tagline', w.tagline)}
    <div class="row"><div>${field('Role', 'role', w.role)}</div><div>${field('Timeline', 'timeline', w.timeline)}</div></div>
    ${field('Platform', 'platform', w.platform)}
    <div class="row">
      <div>${select('Theme', 'theme', w.theme, THEME_NAMES.map((t) => [t, t]))}</div>
      <div>${select('Card', 'card', w.card, CARD_ICONS.map((c) => [c, c]))}</div>
    </div>
    ${field('End card summary', 'summary', w.summary, { area: true })}
    ${field('Outcomes (one per line)', 'outcomes', w.outcomes.join('\n'), { area: true, kind: 'lines' })}
    ${field('Links (Label | https://…, one per line)', 'links', w.links.map((l) => `${l.label} | ${l.url}`).join('\n'), { area: true, kind: 'links', rows: 2 })}
    <label style="margin-top:20px">Beats: the level, left to right</label>
    ${w.beats.map((b, i) => beatForm(b, i, w.beats.length)).join('')}
    <div class="dev-add">
      ${(['copy', 'image', 'decision', 'metric'] as BeatType[]).map((t) => `<button class="dev-btn" data-act="add" data-v="${t}">+ ${t}</button>`).join('')}
    </div>`;
}

function beatForm(b: Beat, i: number, n: number): string {
  const id = b.id;
  let body = '';
  switch (b.type) {
    case 'copy':
      body = field('Headline (painted on the bricks)', 'headline', b.headline, { beat: id }) + field('Body (in the ? block, blank line = new page)', 'body', b.body, { beat: id, area: true, rows: 6 });
      break;
    case 'image':
      body = `
        ${b.src ? `<img class="dev-thumb" src="${esc(resolveSrc(b.src))}" alt="">` : ''}
        <label>Image</label>
        <input type="file" accept="image/*" data-upload="${id}">
        ${field('Src (path in /public)', 'src', b.src, { beat: id })}
        ${field('Caption', 'caption', b.caption, { beat: id })}
        ${field('Alt text', 'alt', b.alt ?? '', { beat: id })}`;
      break;
    case 'decision':
      body = `
        ${field('Question', 'question', b.question, { beat: id })}
        ${field('Option A: label', 'optionA.label', b.optionA.label, { beat: id })}
        ${field('Option A: body', 'optionA.body', b.optionA.body, { beat: id, area: true, rows: 3 })}
        ${field('Option B: label', 'optionB.label', b.optionB.label, { beat: id })}
        ${field('Option B: body', 'optionB.body', b.optionB.body, { beat: id, area: true, rows: 3 })}
        ${select('Chosen', 'chosen', b.chosen, [['A', 'A'], ['B', 'B']], id)}
        ${field('Why', 'why', b.why, { beat: id, area: true, rows: 3 })}`;
      break;
    case 'metric':
      body = field('Value', 'value', b.value, { beat: id }) + field('Label', 'label', b.label, { beat: id }) + field('Detail', 'body', b.body ?? '', { beat: id, area: true, rows: 3 });
      break;
  }
  return `
    <div class="dev-beat ${selected === id ? 'sel' : ''}" data-beat="${id}">
      <div class="dev-beat-head">
        <b>#${i + 1} ${b.type}</b>
        <select data-f="lens" data-b="${id}" title="Which title-screen mode shows this beat" style="width:auto">
          ${[['', 'both'], ['design', 'designer'], ['build', 'builder']].map(([v, l]) => `<option value="${v}" ${(b.lens ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="dev-btn small" data-act="up" data-v="${id}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="dev-btn small" data-act="down" data-v="${id}" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        <button class="dev-btn small" data-act="del" data-v="${id}">✕</button>
      </div>
      ${body}
    </div>`;
}

/** A hand-built felt course: story blocks, billboards and chapters instead of generated beats. */
function courseForm(w: World): string {
  const here = courseTile();
  return `
    ${field('Title', 'title', w.title)}
    ${field('Tagline', 'tagline', w.tagline)}
    <div class="row"><div>${field('Role', 'role', w.role)}</div><div>${field('Timeline', 'timeline', w.timeline)}</div></div>
    ${field('Platform', 'platform', w.platform)}
    <label style="margin-top:20px">Chapters: the status bar</label>
    ${(w.chapters ?? [])
      .map(
        (c, i) => `<div class="dev-beat">
          <div class="row"><div>${field(`Chapter ${i + 1}`, `chapters.${i}.title`, c.title)}</div><div style="flex:0 0 80px">${field('Starts at tile', `chapters.${i}.at`, String(c.at), { kind: 'num' })}</div></div>
          ${field('Subtitle', `chapters.${i}.subtitle`, c.subtitle)}
        </div>`,
      )
      .join('')}
    ${field('End card summary', 'summary', w.summary, { area: true })}
    ${field('What happened (one per line)', 'outcomes', w.outcomes.join('\n'), { area: true, kind: 'lines' })}
    ${field('What I learned (one per line)', 'lessons', (w.lessons ?? []).join('\n'), { area: true, kind: 'lines' })}
    ${field('Links (Label | https://…, one per line)', 'links', w.links.map((l) => `${l.label} | ${l.url}`).join('\n'), { area: true, kind: 'links', rows: 2 })}
    <label style="margin-top:20px">Story blocks and billboards, left to right</label>
    ${w.beats.map((b, i) => courseBeatForm(w, b, i, w.beats.length)).join('')}
    <div class="dev-add">
      <button class="dev-btn" data-act="add-here" data-v="story" ${here ? '' : 'disabled'}>+ story block here</button>
      <button class="dev-btn" data-act="add-here" data-v="sign" ${here ? '' : 'disabled'}>+ billboard here</button>
    </div>
    <p class="sub">"Here" is above wherever your hero is standing. Nudge it with the tile numbers.</p>`;
}

const WHERE: Record<string, string> = {
  switch: 'Opens when the P-switch is pressed.',
  room: 'Opens the first time you drop into the secret room.',
  feather: 'Floats up when you grab the feather.',
};

function courseBeatForm(w: World, b: Beat, i: number, n: number): string {
  const id = b.id;
  const p = b.place;
  const num = (label: string, f: string, v: number | undefined) => `<div>${field(label, f, String(v ?? 0), { beat: id, kind: 'num' })}</div>`;
  const kind = !p ? 'quick view only' : p.as === 'sign' ? 'billboard' : p.as === 'story' ? 'story block' : p.as;
  let where = '<p class="sub">Not in the course: it only shows in Quick View.</p>';
  if (p?.as === 'story') where = `<div class="row">${num('Block x (tile)', 'place.x', p.x)}${num('Block y (tile)', 'place.y', p.y)}</div>`;
  else if (p?.as === 'decision')
    where = `<div class="row">${num('Block A x', 'place.a.0', p.a[0])}${num('Block A y', 'place.a.1', p.a[1])}${num('Block B x', 'place.b.0', p.b[0])}${num('Block B y', 'place.b.1', p.b[1])}</div>`;
  else if (p?.as === 'sign') where = `<div class="row">${num('Billboard at tile', 'place.at', p.at)}${num('Raise by (px)', 'place.lift', p.lift)}</div>`;
  else if (p) where = `<p class="sub">${WHERE[p.as]}</p>`;

  let body = '';
  switch (b.type) {
    case 'copy':
      body = field('Card title', 'headline', b.headline, { beat: id }) + field('Card text (blank line = new paragraph)', 'body', b.body, { beat: id, area: true, rows: 6 });
      break;
    case 'image':
      body = picture(id, 'src', b.src, b.caption, b.alt);
      break;
    case 'decision':
      body = `
        ${field('Question', 'question', b.question, { beat: id })}
        ${field('Option A: label', 'optionA.label', b.optionA.label, { beat: id })}
        ${field('Option A: body', 'optionA.body', b.optionA.body, { beat: id, area: true, rows: 3 })}
        ${field('Option B: label', 'optionB.label', b.optionB.label, { beat: id })}
        ${field('Option B: body', 'optionB.body', b.optionB.body, { beat: id, area: true, rows: 3 })}
        ${select('Chosen', 'chosen', b.chosen, [['A', 'A'], ['B', 'B']], id)}
        ${field('Why', 'why', b.why, { beat: id, area: true, rows: 3 })}`;
      break;
    case 'metric':
      body = field('Value', 'value', b.value, { beat: id }) + field('Label', 'label', b.label, { beat: id }) + field('Detail', 'body', b.body ?? '', { beat: id, area: true, rows: 3 });
      break;
  }
  // story cards can carry a picture at the top; billboards are the picture
  const card = b.type !== 'image' && p && p.as !== 'feather' ? `<label style="margin-top:14px">Card picture</label>${picture(id, 'image.src', b.image?.src ?? '', b.image?.caption ?? '', b.image?.alt)}` : '';
  const wink = p?.as === 'feather' ? field('Wink text', 'lines', (b.lines ?? []).join('\n'), { beat: id, area: true, kind: 'lines', rows: 2 }) : '';
  const chapters: [string, string][] = [['', 'no chapter'], ...(w.chapters ?? []).map((c): [string, string] => [c.id, c.title])];
  return `
    <div class="dev-beat ${selected === id ? 'sel' : ''}" data-beat="${id}">
      <div class="dev-beat-head">
        <b>#${i + 1} ${esc(kind)}</b>
        <select data-f="chapter" data-b="${id}" title="Chapter" style="width:auto">
          ${chapters.map(([v, l]) => `<option value="${esc(v)}" ${(b.chapter ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
        <button class="dev-btn small" data-act="up" data-v="${id}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="dev-btn small" data-act="down" data-v="${id}" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        <button class="dev-btn small" data-act="del" data-v="${id}">✕</button>
      </div>
      ${where}
      ${body}
      ${wink}
      ${card}
      ${field('Note to self (never shown)', 'note', b.note ?? '', { beat: id, area: true, rows: 2 })}
    </div>`;
}

/** Picture fields: thumbnail, upload, src, caption and alt. `f` is the src field ("src" or "image.src"). */
function picture(id: string, f: string, src: string, caption: string, alt?: string): string {
  const pre = f.replace(/src$/, '');
  return `
    ${src ? `<img class="dev-thumb" src="${esc(resolveSrc(src))}" alt="">` : '<p class="sub">No picture yet: the game shows "image coming soon".</p>'}
    <input type="file" accept="image/*" data-upload="${id}" data-into="${f}">
    ${field('Src (path in /public)', f, src, { beat: id })}
    ${field('Caption', `${pre}caption`, caption, { beat: id })}
    ${field('Alt text', `${pre}alt`, alt ?? '', { beat: id })}`;
}

function jsonTab(): string {
  const data = scope === 'site' ? getSite() : getWorld(scope);
  return `
    <p class="sub">This is the actual file the game reads: <code>content/${scope === 'site' ? 'site' : `worlds/${esc(scope)}`}.json</code>. Edit it and press Apply.</p>
    <textarea class="dev-json" spellcheck="false">${esc(JSON.stringify(data, null, 2))}</textarea>
    <div class="dev-add"><button class="dev-btn" data-act="apply-json">Apply</button></div>`;
}

function docsTab(): string {
  return `<div class="dev-doc">
    <h3>THE IDEA</h3>
    <p>Each world is a case study. Levels aren't drawn by hand: a builder reads the world's list of <b>beats</b> and lays them out left to right.</p>
    <ul>
      <li><code>copy</code> → bricks with the headline painted on them; the ? block holds the story.</li>
      <li><code>image</code> → a billboard; bump it to see the work full size.</li>
      <li><code>decision</code> → two pipes. ↓ on a pipe reads that option; the ? block says which won and why.</li>
      <li><code>metric</code> → a ? block that pops the number.</li>
    </ul>
    <p>Pits and bugs are added between beats so it still plays like a platformer.</p>
    <h3>THE STACK</h3>
    <ul>
      <li>Phaser 3 + TypeScript, bundled with Vite, hosted on GitHub Pages.</li>
      <li>All pixel art is generated in code at boot. No sprite sheets.</li>
      <li>Content is plain JSON in the repo: <code>content/site.json</code> and <code>content/worlds/*.json</code>.</li>
      <li>Long copy opens in real HTML overlays, so it's readable and selectable.</li>
    </ul>
    <h3>THIS EDITOR</h3>
    <p>Every field you change rebuilds the level live. <b>Save</b> commits the changed JSON and any uploaded images to GitHub in one commit, and GitHub Pages redeploys in a minute or two.</p>
    <p>You can play with everything here. Your changes stay in this tab and disappear on reload, because saving needs a GitHub token with write access to the repo.</p>
    <h3>THE OTHER SIDE</h3>
    <p>In World 1-1, stand on the tall white platform and hold S (or ↓) for two seconds. The world flips to black and white: every story block and billboard gets an outline. Click one, or bump it, to edit it here. Hold S on the platform again to flip back.</p>
    <h3>THE CODE</h3>
    <p>↑ ↑ ↓ ↓ ← → ← → B A. Type it again to flip the TV back.</p>
  </div>`;
}

function saveBox(): string {
  if (saveState === 'ask') {
    const files = getDirtyFiles();
    return `<div class="dev-modal">
      <p><b>Only Carlos can save.</b> Your edits are live in this tab, so play around. They'll disappear on reload.</p>
      <p>Here's what would be committed:</p>
      <pre>${esc(files.map((f) => f.path).join('\n') || '(nothing changed yet)')}</pre>
      <details><summary>I'm Carlos</summary>
        <label>GitHub fine-grained token (contents: write on this repo)</label>
        <input type="password" data-token placeholder="github_pat_…" autocomplete="off">
        <div class="dev-add"><button class="dev-btn primary" data-act="token-save">Save token &amp; commit</button></div>
        <p class="sub">Stored only in this browser's localStorage. Never in the repo.</p>
      </details>
      <div class="dev-add"><button class="dev-btn" data-act="dismiss">OK</button></div>
    </div>`;
  }
  return `<div class="dev-modal"><p>${esc(saveMsg)}</p>
    ${saveState !== 'saving' ? '<div class="dev-add"><button class="dev-btn" data-act="dismiss">OK</button>' + (getToken() ? ' <button class="dev-btn" data-act="token-clear">Forget token</button>' : '') + '</div>' : ''}</div>`;
}

// ---------- Events ----------

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let o = obj as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  const last = keys[keys.length - 1];
  if (value === '' && (last === 'lens' || last === 'alt' || last === 'note' || last === 'chapter')) delete o[last];
  else o[last] = value;
}

function parseValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): unknown {
  const v = el.value;
  switch (el.dataset.kind) {
    case 'num':
      return Number(v) || 0;
    case 'lines':
      return v.split('\n').map((l) => l.trim()).filter(Boolean);
    case 'links':
      return v
        .split('\n')
        .map((l) => l.split('|').map((x) => x.trim()))
        .filter(([label, url]) => label && url)
        .map(([label, url]) => ({ label, url }));
    default:
      return v;
  }
}

function bind() {
  const p = panel();
  p.oninput = (e) => {
    const el = e.target as HTMLInputElement;
    const f = el.dataset.f;
    if (!f) return;
    const value = parseValue(el);
    const beatId = el.dataset.b;
    if (scope === 'site') updateSite((s) => setPath(s as unknown as Record<string, unknown>, f, value));
    else
      updateWorld(scope, (w) => {
        const target = beatId ? w.beats.find((b) => b.id === beatId) : w;
        if (!target) return;
        // a story card gets its picture slot the first time one of its fields is filled in
        if (f.startsWith('image.') && !('image' in target && target.image)) (target as Beat).image = { src: '', caption: '' };
        setPath(target as unknown as Record<string, unknown>, f, value);
      });
    if (f === 'lens' || f === 'chosen' || f === 'chapter') render();
  };

  p.onchange = async (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.dataset.act === 'scope') {
      scope = el.value;
      selected = null;
      render();
      return;
    }
    const beatId = (el as HTMLInputElement).dataset.upload;
    const file = (el as HTMLInputElement).files?.[0];
    if (beatId && file) {
      const dataUrl = await downscale(file);
      const src = addPendingAsset(scope, file.name.replace(/\.\w+$/, '') + '.jpg', dataUrl);
      const into = (el as HTMLInputElement).dataset.into ?? 'src';
      updateWorld(scope, (w) => {
        const b = w.beats.find((x) => x.id === beatId);
        if (!b) return;
        if (into === 'image.src') b.image = { caption: '', ...b.image, src };
        else if (b.type === 'image') b.src = src;
      });
      render();
    }
  };

  p.onclick = async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!btn || btn.tagName === 'SELECT') return;
    const act = btn.dataset.act;
    const v = btn.dataset.v ?? '';
    switch (act) {
      case 'exit':
        return toggle();
      case 'tab':
        tab = v as typeof tab;
        return render();
      case 'up':
      case 'down':
        updateWorld(scope, (w) => {
          const i = w.beats.findIndex((b) => b.id === v);
          const j = act === 'up' ? i - 1 : i + 1;
          if (i < 0 || j < 0 || j >= w.beats.length) return;
          [w.beats[i], w.beats[j]] = [w.beats[j], w.beats[i]];
        });
        return render();
      case 'del':
        if (!confirm('Delete this beat?')) return;
        updateWorld(scope, (w) => (w.beats = w.beats.filter((b) => b.id !== v)));
        return render();
      case 'add': {
        const beat = newBeat(v as BeatType);
        selected = beat.id;
        updateWorld(scope, (w) => w.beats.push(beat));
        render();
        return panel().querySelector(`[data-beat="${beat.id}"]`)?.scrollIntoView({ block: 'center' });
      }
      case 'add-here': {
        const at = courseTile();
        if (!at) return;
        const [tx, ty] = at;
        const chapter = [...(getWorld(scope)?.chapters ?? [])].reverse().find((c) => tx >= c.at)?.id;
        // story blocks sit four tiles above the ground, in reach of a jump
        const beat: Beat =
          v === 'sign'
            ? { id: newId('image'), type: 'image', src: '', caption: 'New picture', chapter, place: { as: 'sign', at: tx } }
            : { id: newId('copy'), type: 'copy', headline: 'New story', body: 'Tell the story here.', chapter, place: { as: 'story', x: tx, y: ty - 4 } };
        selected = beat.id;
        updateWorld(scope, (w) => {
          // keep the list in course order
          const i = w.beats.findIndex((b) => placeX(b) > tx);
          w.beats.splice(i < 0 ? w.beats.length : i, 0, beat);
        });
        render();
        return panel().querySelector(`[data-beat="${beat.id}"]`)?.scrollIntoView({ block: 'center' });
      }
      case 'apply-json': {
        const ta = panel().querySelector<HTMLTextAreaElement>('.dev-json')!;
        try {
          const data = JSON.parse(ta.value);
          if (scope === 'site') replaceSite(data);
          else replaceWorld({ ...data, slug: scope });
          saveState = 'done';
          saveMsg = 'Applied. The game rebuilt with your JSON.';
        } catch (err) {
          saveState = 'error';
          saveMsg = `That JSON doesn't parse: ${(err as Error).message}`;
        }
        return render();
      }
      case 'save':
        if (!getToken()) {
          saveState = 'ask';
          return render();
        }
        return save();
      case 'token-save': {
        const t = panel().querySelector<HTMLInputElement>('[data-token]')?.value.trim();
        if (!t) return;
        setToken(t);
        return save();
      }
      case 'token-clear':
        setToken(null);
        saveState = 'idle';
        return render();
      case 'dismiss':
        saveState = 'idle';
        return render();
    }
  };
}

async function save() {
  const files = getDirtyFiles();
  if (!files.length) {
    saveState = 'done';
    saveMsg = 'Nothing to save yet.';
    return render();
  }
  const repo = getSite().repo;
  if (!repo.owner || !repo.name) {
    saveState = 'error';
    saveMsg = 'Set the repo owner and name in Site settings first.';
    return render();
  }
  saveState = 'saving';
  saveMsg = `Committing ${files.length} file(s) to ${repo.owner}/${repo.name}…`;
  render();
  try {
    const url = await commitFiles(repo, getToken()!, files, `Edit content from dev mode (${files.map((f) => f.path.split('/').pop()).join(', ')})`);
    markSaved();
    saveState = 'done';
    saveMsg = `Committed. GitHub Pages will redeploy in a minute or two. ${url}`;
  } catch (err) {
    saveState = 'error';
    saveMsg = `Save failed: ${(err as Error).message}. If GitHub says 401 or 403, the token is wrong or can't write to this repo.`;
  }
  render();
}

/** Left edge of a placed beat in tiles (unplaced beats sort last). */
function placeX(b: Beat): number {
  const p = b.place;
  if (!p) return Infinity;
  if (p.as === 'story') return p.x;
  if (p.as === 'decision') return Math.min(p.a[0], p.b[0]);
  if (p.as === 'sign') return p.at;
  return Infinity;
}

function newBeat(type: BeatType): Beat {
  const id = newId(type);
  switch (type) {
    case 'copy':
      return { id, type, headline: 'New headline', body: 'Tell the story here.\n\nA blank line starts a new page.' };
    case 'image':
      return { id, type, src: '', caption: 'New image' };
    case 'decision':
      return { id, type, question: 'Which way?', optionA: { label: 'Option A', body: '' }, optionB: { label: 'Option B', body: '' }, chosen: 'B', why: '' };
    case 'metric':
      return { id, type, value: '0', label: 'Metric' };
  }
}

/** Shrink uploads so the repo and the game stay light. */
function downscale(file: File, max = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
