import type { Site, World } from './types';
import siteJson from '../../content/site.json';

// Content is bundled at build time. Dev mode edits these in-memory copies,
// marks files dirty, and the GitHub save writes them back to the repo.

const worldModules = import.meta.glob<World>('../../content/worlds/*.json', {
  eager: true,
  import: 'default',
});

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

let site: Site = clone(siteJson as Site);
const worlds = new Map<string, World>();
for (const w of Object.values(worldModules)) worlds.set(w.slug, clone(w));

/** Repo-relative paths of files changed in dev mode. */
const dirty = new Set<string>();
/** Uploaded images not yet committed: repo path (public/...) → data URL. */
const pendingAssets = new Map<string, string>();

type Listener = (scope: string) => void;
const listeners = new Set<Listener>();

export const SITE_PATH = 'content/site.json';
export const worldPath = (slug: string) => `content/worlds/${slug}.json`;

export function getSite(): Site {
  return site;
}

export function getWorld(slug: string): World | undefined {
  return worlds.get(slug);
}

/** Worlds in overworld order. */
export function getWorlds(): World[] {
  return site.map.nodes
    .filter((n) => n.type === 'world' && n.world && worlds.has(n.world))
    .map((n) => worlds.get(n.world!)!);
}

export function onContentChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(scope: string) {
  for (const fn of listeners) fn(scope);
}

export function updateSite(mutate: (s: Site) => void) {
  mutate(site);
  dirty.add(SITE_PATH);
  emit('site');
}

export function updateWorld(slug: string, mutate: (w: World) => void) {
  const w = worlds.get(slug);
  if (!w) return;
  mutate(w);
  dirty.add(worldPath(slug));
  emit(slug);
}

/** Store an uploaded image and return the public src to put in a beat. */
export function addPendingAsset(slug: string, fileName: string, dataUrl: string): string {
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
  const src = `content/${slug}/${Date.now().toString(36)}-${safe}`;
  pendingAssets.set(`public/${src}`, dataUrl);
  return src;
}

/** Resolve a beat's src to something an <img> or Phaser loader can fetch. */
export function resolveSrc(src: string): string {
  return pendingAssets.get(`public/${src}`) ?? `${import.meta.env.BASE_URL}${src}`;
}

export function getDirtyFiles(): { path: string; content: string; encoding: 'utf-8' | 'base64' }[] {
  const files: { path: string; content: string; encoding: 'utf-8' | 'base64' }[] = [];
  for (const [path, dataUrl] of pendingAssets) {
    files.push({ path, content: dataUrl.split(',')[1] ?? '', encoding: 'base64' });
  }
  for (const path of dirty) {
    const data = path === SITE_PATH ? site : worlds.get(path.replace(/^content\/worlds\/|\.json$/g, ''));
    if (data) files.push({ path, content: JSON.stringify(data, null, 2) + '\n', encoding: 'utf-8' });
  }
  return files;
}

export function hasUnsavedChanges(): boolean {
  return dirty.size > 0 || pendingAssets.size > 0;
}

export function markSaved() {
  dirty.clear();
  pendingAssets.clear();
}

export function exportAll(): { site: Site; worlds: World[] } {
  return { site, worlds: [...worlds.values()] };
}

/** Replace site from JSON typed into the dev panel's raw editor. */
export function replaceSite(next: Site) {
  site = next;
  dirty.add(SITE_PATH);
  emit('site');
}

export function replaceWorld(next: World) {
  worlds.set(next.slug, next);
  dirty.add(worldPath(next.slug));
  emit(next.slug);
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
}
