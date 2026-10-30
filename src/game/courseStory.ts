import Phaser from 'phaser';
import { ART, FELT, Z, feltPost } from '../art/felt';
import { resolveSrc } from '../content/store';
import type { Beat, World } from '../content/types';
import { type StoryCard, showImage, showStory } from '../ui/overlays';
import { type FeltStatusBar, SEED, SEED_STAGES } from './feltHud';
import { ui } from './state';
import { px } from './text';
import { asset } from '../assets';

// Puts a world's story into a hand-built course: play, then read, then play.
// The status bar names the chapter; the story itself lives in story blocks
// or on felt billboards (press S in front of one), which pause the game and
// open a reading card. Placement lives on each beat (`place`).

const T = 16;
const CARD_FRAMES = ['bug-0', 'icon-pencil', 'icon-star'];
const SIGN_W = 72;
const SIGN_H = 48;
export const STORY_TEXTURE = 'story-block';

type Open = () => Promise<void>;

export class CourseStory {
  /** Story blocks by "x,y": what they open and which story they count as. */
  private cells = new Map<string, { id: string; open: () => StoryCard }>();
  private stories: string[] = [];
  private read = new Set<string>();
  private signs: { beat: Beat; x: number; top: number; hint: Phaser.GameObjects.Text; parts: { setTint(color: number): unknown }[] }[] = [];
  private hints: { x: number; id: string; tag: Phaser.GameObjects.Text }[] = [];
  private chapter = -1;
  private roomShown = false;

  constructor(
    private scene: Phaser.Scene,
    private world: World,
    private hud: FeltStatusBar,
  ) {
    for (const b of world.beats) {
      const p = b.place;
      if (!p) continue;
      if (p.as === 'story') {
        this.cells.set(`${p.x},${p.y}`, { id: b.id, open: () => this.card(b) });
        this.stories.push(b.id);
      } else if (p.as === 'decision' && b.type === 'decision') {
        const option = (which: 'A' | 'B') => (): StoryCard => {
          const o = which === 'A' ? b.optionA : b.optionB;
          const won = b.chosen === which;
          return {
            kicker: b.question,
            title: `${which} · ${o.label}${won ? '  ✓' : ''}`,
            body: o.body + (won ? `\n\nWhat I chose. ${b.why}` : '\n\nNot this one. Bump the other block to see what I chose.'),
            image: b.image,
          };
        };
        this.cells.set(`${p.a[0]},${p.a[1]}`, { id: b.id, open: option('A') });
        this.cells.set(`${p.b[0]},${p.b[1]}`, { id: b.id, open: option('B') });
        this.stories.push(b.id);
      } else if (p.as === 'switch' || (p.as === 'sign' && b.type !== 'image')) this.stories.push(b.id);
    }
    if (world.chapters?.length) hud.setChapters(CARD_FRAMES.slice(0, world.chapters.length));
    hud.setStories(0, this.stories.length);
    if (world.growSeed) hud.setSeed(0);
  }

  /** The story block image and any billboard pictures, loaded with the scene. */
  static preload(scene: Phaser.Scene, world: World) {
    if (!scene.textures.exists(STORY_TEXTURE)) scene.load.image(STORY_TEXTURE, asset('felt/story-block.png'));
    if (world.growSeed) {
      for (let i = 0; i < SEED_STAGES; i++) if (!scene.textures.exists(`${SEED}-${i}`)) scene.load.image(`${SEED}-${i}`, asset(`felt/seed/stage-${i}.png`));
    }
    for (const b of world.beats) {
      const src = b.place?.as === 'sign' && picture(b);
      if (src && !scene.textures.exists(`img:${src}`)) scene.load.image(`img:${src}`, resolveSrc(src));
    }
  }

  /** Tiles that hold a story block (any level block there is replaced). */
  get storyCells(): [number, number][] {
    return [...this.cells.keys()].map((k) => k.split(',').map(Number) as [number, number]);
  }

  /** A "READ" tag over a story block, shown when the player is close and it hasn't been read. */
  tagStoryBlock(x: number, y: number) {
    const id = this.cells.get(`${x},${y}`)?.id;
    if (!id) return;
    const tag = px(this.scene, x * T + 8, y * T - 7, 'READ', { size: 6, color: '#ffffff' }).setOrigin(0.5).setDepth(20).setVisible(false);
    tag.setBackgroundColor('#2f6f86').setPadding(2, 2, 2, 1);
    this.scene.tweens.add({ targets: tag, y: tag.y - 2, yoyo: true, repeat: -1, duration: 450 });
    this.hints.push({ x: x * T + 8, id, tag });
  }

  /**
   * Felt billboards, standing on the ground (`groundAt(x)` is its top at x; on a slope the posts differ). An image
   * beat's board is a picture to look at; any other beat's board shows its picture (or its headline) and reads as a story.
   * `legEnd(x)` is where a post stops, when that's not the ground (over an auto-scroller's gaps).
   */
  buildSigns(groundAt: (x: number) => number, legEnd = groundAt) {
    for (const b of this.world.beats) {
      if (b.place?.as !== 'sign') continue;
      const x = b.place.at * T;
      const legs = [x + 9, x + SIGN_W - 14];
      const top = Math.min(...legs.map((l) => groundAt(l + 2.5))) - SIGN_H - 30 - (b.place.lift ?? 0);
      for (const l of legs) feltPost(this.scene, l, top + SIGN_H - 2, 5, legEnd(l + 2.5) - top - SIGN_H + 2).setDepth(-3.1);
      const board = this.scene.add.nineslice(x, top, FELT, 'platform-f4faf4', SIGN_W * ART, SIGN_H * ART, 9 * ART, 9 * ART, 9 * ART, 9 * ART).setOrigin(0).setScale(1 / ART).setDepth(-3);
      const parts: { setTint(color: number): unknown }[] = [board];
      const src = picture(b);
      const label = (s: string, y: number, size: number, color: string) =>
        this.scene.add
          .text(x + SIGN_W / 2, y, s, { fontFamily: '"Fredoka", sans-serif', fontStyle: '600', fontSize: `${size}px`, color, align: 'center', wordWrap: { width: SIGN_W - 14 } })
          .setOrigin(0.5, 0)
          .setResolution(Z)
          .setDepth(-2.9);
      if (src && this.scene.textures.exists(`img:${src}`)) {
        const img = this.scene.add.image(x + SIGN_W / 2, top + SIGN_H / 2, `img:${src}`).setDepth(-2.9);
        img.setScale(Math.min((SIGN_W - 10) / img.width, (SIGN_H - 10) / img.height));
        parts.push(img);
      } else if (b.type === 'image') {
        label('IMAGE COMING SOON', top + 9, 4, '#a9461d');
        label(b.caption, top + 17, 5.2, '#5a3518');
      } else {
        // no picture: the headline is painted on the board, centred
        const card = this.card(b);
        const t = label(b.type === 'decision' ? b.question : card.title, 0, 6.5, '#5a3518');
        t.setY(top + (SIGN_H - t.height) / 2);
        parts.push(t);
      }
      const hint = px(this.scene, x + SIGN_W / 2, top - 9, b.type === 'image' ? 'S: LOOK' : 'S: READ', { size: 6, color: '#000' }).setOrigin(0.5).setDepth(20).setVisible(false);
      hint.setBackgroundColor('#ffffff').setPadding(2, 2, 2, 1);
      this.scene.tweens.add({ targets: hint, y: hint.y - 2, yoyo: true, repeat: -1, duration: 450 });
      this.signs.push({ beat: b, x, top, hint, parts });
    }
  }

  /** Per frame: chapter header and banner, READ tags, sign hints. */
  update(playerX: number, inRoom: boolean) {
    // billboards sit at their own x in the room, so they count there too; READ tags don't
    const near = (x: number, w: number) => playerX > x - 4 && playerX < x + w + 4;
    // on the other side the editor's own tags take their place
    this.signs.forEach((s) => s.hint.setVisible(!ui.dev && near(s.x, SIGN_W)));
    this.hints.forEach((h) => h.tag.setVisible(!ui.dev && !inRoom && !this.read.has(h.id) && near(h.x - 28, 56)));
    const chapters = this.world.chapters;
    if (!chapters || inRoom) return;
    let i = -1;
    chapters.forEach((c, n) => playerX / T >= c.at && (i = n));
    if (i > this.chapter) {
      this.chapter = i;
      const c = chapters[i];
      this.hud.setChapter(i, c.title, c.subtitle);
      this.hud.banner(c.title, c.subtitle, CARD_FRAMES[i]);
    }
  }

  /** Coming back to a spot after a rebuild: show its chapter without the banner. */
  resume(playerX: number) {
    const chapters = this.world.chapters ?? [];
    chapters.forEach((c, n) => playerX / T >= c.at && (this.chapter = n));
    const c = chapters[this.chapter];
    if (c) this.hud.setChapter(this.chapter, c.title, c.subtitle);
  }

  /** Everything the secret world lets you edit: story blocks and billboards, in world pixels. */
  get editables(): { id: string; label: string; x: number; y: number; w: number; h: number }[] {
    const cells = [...this.cells];
    const blocks = cells.map(([key, c]) => {
      const [x, y] = key.split(',').map(Number);
      // a decision's two blocks sit side by side: tag them A and B
      const pair = cells.filter(([, d]) => d.id === c.id);
      const label = pair.length > 1 ? (pair[0][0] === key ? 'A' : 'B') : 'EDIT';
      return { id: c.id, label, x: x * T, y: y * T, w: T, h: T };
    });
    const signs = this.signs.map((s) => ({ id: s.beat.id, label: s.beat.type === 'image' ? 'EDIT IMAGE' : 'EDIT', x: s.x, y: s.top, w: SIGN_W, h: SIGN_H }));
    return [...blocks, ...signs];
  }

  /** The billboard the player stands in front of, if any (press S to look, or to read its story). */
  signAt(playerX: number): Open | undefined {
    const s = this.signFor(playerX);
    if (!s) return;
    const b = s.beat;
    if (b.type === 'image') return () => showImage(b.src, b.caption, b.alt);
    return () => {
      // read boards fade a little, like read story blocks
      s.parts.forEach((p) => p.setTint(0xd2d2d2));
      return this.openCard(b.id, b.type === 'decision' ? this.decisionCard(b) : this.card(b));
    };
  }

  signFor(playerX: number) {
    return this.signs.find((s) => playerX > s.x - 4 && playerX < s.x + SIGN_W + 4);
  }

  /** Beat id behind the story block at (x, y). */
  idAt(x: number, y: number) {
    return this.cells.get(`${x},${y}`)?.id;
  }

  /** The reading card behind the story block at (x, y), if any. */
  storyAt(x: number, y: number): Open | undefined {
    const cell = this.cells.get(`${x},${y}`);
    if (!cell) return;
    return () => this.openCard(cell.id, cell.open());
  }

  isRead(x: number, y: number) {
    const cell = this.cells.get(`${x},${y}`);
    return !!cell && this.read.has(cell.id);
  }

  /** Feather pickup: a wink, not content. */
  feather(): string | undefined {
    return this.beatFor('feather')?.lines?.[0];
  }

  /** P-switch pressed: the plot-twist card. */
  switchPressed(): Open | undefined {
    const b = this.beatFor('switch');
    return b && (() => this.openCard(b.id, this.card(b)));
  }

  /** First visit to the secret room: the bonus card (not counted as a story). */
  room(): Open | undefined {
    const b = this.beatFor('room');
    if (!b || this.roomShown) return;
    this.roomShown = true;
    return () => showStory(this.card(b));
  }

  /** Reached the goal: the seed is in bloom, however many stories were read. */
  bloom() {
    if (this.world.growSeed) this.hud.setSeed(SEED_STAGES - 1);
  }

  private openCard(id: string, card: StoryCard) {
    this.read.add(id);
    this.hud.setStories(this.read.size, this.stories.length);
    // the seed grows with the stories; full bloom is saved for the goal
    if (this.world.growSeed) this.hud.setSeed(Math.min(SEED_STAGES - 2, Math.floor((this.read.size * (SEED_STAGES - 1)) / this.stories.length)));
    return showStory({ ...card, progress: `${this.read.size} / ${this.stories.length} stories` });
  }

  private card(b: Beat): StoryCard {
    const kicker = this.world.chapters?.find((c) => c.id === b.chapter)?.title ?? this.world.title.toUpperCase();
    switch (b.type) {
      case 'copy':
        return { kicker, title: b.headline, body: b.body, image: b.image };
      case 'metric':
        return { kicker, title: `${b.value} ${b.label}`, body: b.body ?? '', image: b.image };
      case 'image':
        return { kicker, title: b.caption, body: '', image: { src: b.src, caption: b.caption, alt: b.alt } };
      case 'decision':
        return { kicker: b.question, title: b.chosen === 'A' ? b.optionA.label : b.optionB.label, body: b.why, image: b.image };
    }
  }

  /** A decision on a billboard: both options on one card, then what I chose and why. */
  private decisionCard(b: Extract<Beat, { type: 'decision' }>): StoryCard {
    const won = b.chosen === 'A' ? b.optionA : b.optionB;
    const option = (which: 'A' | 'B', o: { label: string; body: string }) => `${which} · ${o.label}: ${o.body}`;
    return {
      kicker: b.question,
      title: won.label,
      body: `${option('A', b.optionA)}\n\n${option('B', b.optionB)}\n\nWhat I chose: ${won.label}. ${b.why}`,
      image: b.image,
    };
  }

  private beatFor(as: 'feather' | 'switch' | 'room') {
    return this.world.beats.find((b) => b.place?.as === as);
  }
}

/** The picture a billboard shows: an image beat's own, or the one on another beat's reading card. */
function picture(b: Beat) {
  return b.type === 'image' ? b.src : b.image?.src;
}
