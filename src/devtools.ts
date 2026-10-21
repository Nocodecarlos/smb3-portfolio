import type Phaser from 'phaser';

// Dev-server-only helpers for scripted play-testing from the console.

const CODES: Record<string, number> = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, ' ': 32, Enter: 13, Shift: 16, Escape: 27, b: 66, a: 65 };

function fire(type: string, key: string) {
  const e = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => CODES[key] ?? key.toUpperCase().charCodeAt(0) });
  Object.defineProperty(e, 'which', { get: () => CODES[key] ?? key.toUpperCase().charCodeAt(0) });
  window.dispatchEvent(e);
}

export function installDevtools(game: Phaser.Game) {
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
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
