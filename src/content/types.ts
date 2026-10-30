// Content model. Everything a visitor reads in the game comes from these
// JSON shapes in /content, and dev mode edits them in place.

export type Lens = 'design' | 'build';

/** The three case-study chapters; each lights a card in the status bar (bug, pencil, star). */
export type Chapter = 'problem' | 'design' | 'results';

/**
 * Where a beat lives in a hand-built course (tile coordinates of
 * content/levels/*.json). Beats without one only show in Quick View.
 */
export type Placement =
  /** A story block at (x, y): bumping it pauses the game and opens the beat as a reading card. */
  | { as: 'story'; x: number; y: number }
  /** Decision: two story blocks; bumping `a` or `b` reads that option. */
  | { as: 'decision'; a: [number, number]; b: [number, number] }
  /** Image beat on a felt billboard at tile `at` (raised `lift` px on taller posts); press S in front of it to see it full size. */
  | { as: 'sign'; at: number; lift?: number }
  /** Stepping on the P-switch / first entering the secret room opens the beat. */
  | { as: 'switch' | 'room' }
  /** Picking up the feather floats `lines[0]` (a wink, not content). */
  | { as: 'feather' };

interface BeatBase {
  id: string;
  /** Only show in one title-screen mode. Untagged beats show in both. */
  lens?: Lens;
  /** Chapter this beat belongs to in a hand-built course. */
  chapter?: Chapter;
  place?: Placement;
  /** Picture shown at the top of the reading card; an empty `src` shows a placeholder. */
  image?: { src: string; caption: string; alt?: string };
  /** Short lines for game moments (the feather's wink). */
  lines?: string[];
  /** Reminder for the author (open questions, numbers to update). Never shown. */
  note?: string;
}

/** A row of bricks with the headline painted on it, plus a ? block holding the body. */
export interface CopyBeat extends BeatBase {
  type: 'copy';
  headline: string;
  body: string;
}

/** A billboard you can bump from below to open the full-size image. */
export interface ImageBeat extends BeatBase {
  type: 'image';
  src: string;
  caption: string;
  alt?: string;
}

/** Two pipes. Press down on one to read that option; the ? block says which won and why. */
export interface DecisionBeat extends BeatBase {
  type: 'decision';
  question: string;
  optionA: { label: string; body: string };
  optionB: { label: string; body: string };
  chosen: 'A' | 'B';
  why: string;
}

/** A ? block that pops a coin and the number. */
export interface MetricBeat extends BeatBase {
  type: 'metric';
  value: string;
  label: string;
  body?: string;
}

export type Beat = CopyBeat | ImageBeat | DecisionBeat | MetricBeat;
export type BeatType = Beat['type'];

export type ThemeName = 'meadow' | 'sky' | 'sunset' | 'night';

export interface World {
  slug: string;
  title: string;
  tagline: string;
  /** One-line teaser in the overworld status bar while the hero stands on this world. */
  headline?: string;
  /** App icon (path in /public) shown next to the headline. */
  icon?: string;
  role: string;
  timeline: string;
  platform: string;
  theme: ThemeName;
  /** Icon shown in the status-bar card slot once the world is cleared. */
  card: 'star' | 'heart' | 'pencil' | 'seed';
  summary: string;
  outcomes: string[];
  links: { label: string; url: string }[];
  /** Hand-built course in content/levels (e.g. "world-1-1"). When set, it replaces the generated level. */
  level?: string;
  /** Chapters of the hand-built course, in order: where each starts and what the status bar says. */
  chapters?: { id: Chapter; at: number; title: string; subtitle: string }[];
  /** The status bar shows a seed (public/felt/seed) that grows a stage per story read and blooms at the goal. */
  growSeed?: boolean;
  /** Short takeaways for the end card. */
  lessons?: string[];
  /**
   * The full case study, read on the Quick View page in place of the beats
   * (the game tells the short version). A Markdown subset: ## headings,
   * "- " lists, "> " quotes, | tables |, ![caption](path) images (an empty
   * path shows "image coming soon"), **bold**.
   */
  article?: string;
  /**
   * A hidden mushroom house past the end of the course (World 1-3). Holding S on the white platform drops you
   * behind the scenery, in place of flipping sides, and walking on behind the black end zone finds it.
   */
  secretHouse?: { intro: string; boxes: HouseBox[] };
  beats: Beat[];
}

/**
 * Felt overworld stops. `step` is a plain stop on the road; `house` is a
 * mushroom house, `spade` the card panel, `fortress` the mini castle,
 * `lock` a door that opens once its `requires` worlds are cleared.
 */
export type MapNodeType = 'start' | 'world' | 'step' | 'house' | 'spade' | 'fortress' | 'lock' | 'castle';

export interface MapNode {
  id: string;
  type: MapNodeType;
  /** Centre of the stop on the felt map art (public/felt/map-bg.jpg), in Figma pixels of the 2668x1384 map (overworld · felt · 16:9). */
  x: number;
  y: number;
  /** World slug for type 'world'. Leave empty for a world that isn't ready yet. */
  world?: string;
  /** Tile number for type 'world'. */
  number?: number;
  /** Short name for the status bar and the sign above the stop. */
  label?: string;
  /** Dialog shown on ENTER for stops without a world (houses, spade, fortress, unfinished worlds). */
  title?: string;
  body?: string;
  /** Show the About text from this file on ENTER. */
  about?: boolean;
  /** For a lock: world slugs that must be cleared before it opens. */
  requires?: string[];
  /** A house you walk into: what the panel on its wall says, and the treasure boxes to open. */
  intro?: string;
  boxes?: HouseBox[];
  /**
   * The spade panel's picture-matching game: its strips show my face, my resume and a ladybug from the levels (paths in
   * /public; an empty one shows a stand-in). Matching the resume offers `resumePdf` to download.
   */
  bonus?: { face: string; resume: string; resumePdf: string };
}

/** A treasure box in a house: opening it reads one of my blog posts in full. */
export interface HouseBox {
  title: string;
  body: string;
  image: { src: string; caption: string; alt?: string };
}

export interface Site {
  name: string;
  year: string;
  /** Shown under the name in the case studies header. Falls back to the two roles. */
  title?: string;
  roles: [string, string];
  about: { title: string; body: string };
  contact: { letter: string; email: string; linkedin: string; signoff: string };
  repo: { owner: string; name: string; branch: string };
  map: { nodes: MapNode[]; edges: [string, string][] };
}
