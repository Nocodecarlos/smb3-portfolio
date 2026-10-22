import Phaser from 'phaser';

// Dev-server-only helpers for scripted play-testing from the console.

const CODES: Record<string, number> = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, ' ': 32, Enter: 13, Shift: 16, Escape: 27, b: 66, a: 65 };

function fire(type: string, key: string) {
  const e = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => CODES[key] ?? key.toUpperCase().charCodeAt(0) });
  Object.defineProperty(e, 'which', { get: () => CODES[key] ?? key.toUpperCase().charCodeAt(0) });
  window.dispatchEvent(e);
}

const hex = (n: number) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

/** Every generated texture as palette-indexed pixel rows, for rebuilding in Figma. */
function exportSprites(game: Phaser.Game) {
  const pal: Record<string, string> = {};
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&*+-=?@^~';
  let next = 0;
  const out: Record<string, { w: number; h: number; rows: string[] }> = {};
  for (const key of game.textures.getTextureKeys()) {
    if (key.startsWith('img:') || key.startsWith('__')) continue;
    const src = game.textures.get(key).getSourceImage() as HTMLCanvasElement;
    if (!(src instanceof HTMLCanvasElement)) continue;
    const ctx = src.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, src.width, src.height);
    const rows: string[] = [];
    for (let y = 0; y < src.height; y++) {
      let row = '';
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        if (data[i + 3] < 128) {
          row += '.';
          continue;
        }
        const c = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        let ch = Object.keys(pal).find((k) => pal[k] === c);
        if (!ch) pal[(ch = chars[next++])] = c;
        row += ch;
      }
      rows.push(row);
    }
    out[key] = { w: src.width, h: src.height, rows };
  }
  return { pal, sprites: out };
}

/** The active scene's display list in world coordinates. */
function exportScene(game: Phaser.Game, key: string) {
  const scene = game.scene.getScene(key);
  const items: unknown[] = [];
  const walk = (list: Phaser.GameObjects.GameObject[], dx = 0, dy = 0) => {
    for (const o of list as any[]) {
      if (!o.visible && o.type !== 'Zone') continue;
      const base = { d: o.depth ?? 0, sf: o.scrollFactorX ?? 1 };
      if (o.type === 'Container' || o.type === 'Layer') walk(o.list, dx + (o.x ?? 0), dy + (o.y ?? 0));
      else if (o.type === 'Image' || o.type === 'Sprite') {
        items.push({ ...base, t: 'img', k: o.texture.key, x: dx + o.x - o.displayWidth * o.originX, y: dy + o.y - o.displayHeight * o.originY, w: o.displayWidth, h: o.displayHeight, fx: o.flipX || undefined, tint: o.isTinted ? hex(o.tintTopLeft) : undefined, a: o.alpha < 1 ? o.alpha : undefined });
      } else if (o.type === 'TileSprite') {
        items.push({ ...base, t: 'tile', k: o.texture.key, x: dx + o.x - o.width * o.originX, y: dy + o.y - o.height * o.originY, w: o.width, h: o.height });
      } else if (o.type === 'Text') {
        const s = o.style;
        items.push({ ...base, t: 'text', s: o.text, x: dx + o.x - o.width * o.originX, y: dy + o.y - o.height * o.originY, w: o.width, h: o.height, fs: parseInt(s.fontSize), ff: s.fontFamily, c: s.color, bg: s.backgroundColor || undefined, sh: o.style.shadowFill ? s.shadowColor : undefined, st: s.strokeThickness ? [s.stroke, s.strokeThickness] : undefined, al: s.align });
      } else if (o.type === 'Rectangle') {
        if (o.isFilled) items.push({ ...base, t: 'rect', x: dx + o.x - o.width * o.originX, y: dy + o.y - o.height * o.originY, w: o.width, h: o.height, c: hex(o.fillColor), a: o.fillAlpha });
      } else if (o.type === 'Graphics') {
        const b: number[] = o.commandBuffer;
        let fill = '#000000', fa = 1, line = '#000000', lw = 1, la = 1;
        let path: number[][] = [];
        const ox = dx + o.x, oy = dy + o.y;
        for (let i = 0; i < b.length; ) {
          const cmd = b[i];
          switch (cmd) {
            case 7: fill = hex(b[i + 1]); fa = b[i + 2]; i += 3; break;
            case 6: lw = b[i + 1]; line = hex(b[i + 2]); la = b[i + 3]; i += 4; break;
            case 3: items.push({ ...base, t: 'rect', x: ox + b[i + 1], y: oy + b[i + 2], w: b[i + 3], h: b[i + 4], c: fill, a: fa < 1 ? fa : undefined }); i += 5; break;
            case 1: path = []; i += 1; break;
            case 5: path.push([ox + b[i + 1], oy + b[i + 2]]); i += 3; break;
            case 4: path.push([ox + b[i + 1], oy + b[i + 2]]); i += 3; break;
            case 9: items.push({ ...base, t: 'line', pts: path, c: line, lw, a: la < 1 ? la : undefined }); i += 1; break;
            case 8: items.push({ ...base, t: 'poly', pts: path, c: fill, a: fa < 1 ? fa : undefined }); i += 1; break;
            case 0: i += 8; break;
            case 10: case 11: i += 7; break;
            case 16: case 17: i += 3; break;
            case 18: i += 2; break;
            default: i += 1;
          }
        }
      }
    }
  };
  walk(scene.children.list);
  const cam = scene.cameras.main;
  return { key, bg: hex(Phaser.Display.Color.GetColor(cam.backgroundColor.red, cam.backgroundColor.green, cam.backgroundColor.blue)), bounds: [cam.getBounds().width, cam.getBounds().height], items };
}

export function installDevtools(game: Phaser.Game) {
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  w.exportSprites = () => exportSprites(game);
  /** Stitch the whole active course into one image (HUD hidden) and post it. */
  w.snapCourse = async (name: string, key = 'Course') => {
    const scene = game.scene.getScene(key);
    const cam = scene.cameras.main;
    const b = cam.getBounds();
    const hud = scene.children.list.filter((o) => (o as unknown as { depth: number }).depth >= 100) as unknown as { setVisible(v: boolean): void }[];
    hud.forEach((o) => o.setVisible(false));
    cam.stopFollow();
    const out = document.createElement('canvas');
    out.width = b.width;
    out.height = b.height;
    const ctx = out.getContext('2d')!;
    for (let y = b.y; y < b.y + b.height; y += 240) {
      for (let x = b.x; x < b.x + b.width; x += 320) {
        cam.setScroll(x, y);
        await new Promise((r) => setTimeout(r, 120));
        const img = await new Promise<HTMLImageElement>((r) => game.renderer.snapshot((i) => r(i as HTMLImageElement)));
        ctx.drawImage(img, cam.scrollX - b.x, cam.scrollY - b.y);
      }
    }
    hud.forEach((o) => o.setVisible(true));
    return fetch(`http://127.0.0.1:5199/${name}`, { method: 'POST', body: out.toDataURL('image/png') }).then((r) => r.status);
  };
  w.exportScene = (key: string) => exportScene(game, key);
  w.down = (key: string) => fire('keydown', key);
  w.up = (key: string) => fire('keyup', key);
  w.press = async (key: string, ms = 100) => {
    fire('keydown', key);
    await new Promise((r) => setTimeout(r, ms));
    fire('keyup', key);
  };
  w.wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  w.snap = (name: string) =>
    new Promise((res) =>
      game.renderer.snapshot((img) => {
        const c = document.createElement('canvas');
        c.width = 960;
        c.height = 720;
        const x = c.getContext('2d')!;
        x.imageSmoothingEnabled = false;
        x.drawImage(img as HTMLImageElement, 0, 0, 960, 720);
        fetch(`http://127.0.0.1:5199/${name}`, { method: 'POST', body: c.toDataURL('image/png') }).then((r) => res(r.status));
      }),
    );
}
