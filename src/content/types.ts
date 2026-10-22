// Content model. Everything a visitor reads in the game comes from these
// JSON shapes in /content, and dev mode edits them in place.

export type Lens = 'design' | 'build';

interface BeatBase {
  id: string;
  /** Only show in one title-screen mode. Untagged beats show in both. */
  lens?: Lens;
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
  beats: Beat[];
}

export type MapNodeType = 'start' | 'world' | 'house' | 'castle';

export interface MapNode {
  id: string;
  type: MapNodeType;
  x: number;
  y: number;
  /** World slug for type 'world'. */
  world?: string;
  label?: string;
}

export interface Site {
  name: string;
  year: string;
  roles: [string, string];
  about: { title: string; body: string };
  contact: { letter: string; email: string; linkedin: string; signoff: string };
  repo: { owner: string; name: string; branch: string };
  map: { nodes: MapNode[]; edges: [string, string][] };
}
