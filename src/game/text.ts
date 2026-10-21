import Phaser from 'phaser';

export const FONT = '"Press Start 2P", monospace';

interface TextOpts {
  color?: string;
  size?: number;
  shadow?: boolean;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
}

/** 8px pixel-font text snapped to whole pixels so it stays crisp when scaled. */
export function px(scene: Phaser.Scene, x: number, y: number, text: string, o: TextOpts = {}) {
  const t = scene.add.text(Math.round(x), Math.round(y), text, {
    fontFamily: FONT,
    fontSize: `${o.size ?? 8}px`,
    color: o.color ?? '#ffffff',
    align: o.align ?? 'left',
    lineSpacing: 2,
    wordWrap: o.wrap ? { width: o.wrap } : undefined,
  });
  if (o.shadow) t.setShadow(1, 1, '#000000', 0, false, true);
  return t;
}

/** Greedy word wrap by character count, for laying out blocks before rendering. */
export function wrapChars(text: string, max: number, maxLines = Infinity): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, max - 1) + '…';
    return kept;
  }
  return lines;
}
