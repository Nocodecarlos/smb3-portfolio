// One neon string travelling round the Skip button's border (Figma: Intro Screen).
// A stroke can't fade along its own length, so the string is a run of short dashes
// on the button's outline, each its own colour, all moving together.

const PIECES = 24;
/** The string's length, as a share of the way round. */
const LENGTH = 0.32;
const LAP_S = 4;
const STROKE = 1.5;
const PURPLE = [115, 102, 255];
const BLUE = [89, 217, 255];

export function setupOrbit(button: HTMLElement) {
  const svg = button.querySelector<SVGSVGElement>('.orbit')!;
  const pieces = Array.from({ length: PIECES }, (_, i) => {
    const t = i / (PIECES - 1);
    // blue in the middle, purple toward the ends, fading out at the tips
    const mid = Math.sin(Math.PI * t);
    const colour = PURPLE.map((c, k) => Math.round(c + (BLUE[k] - c) * mid));
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', `rgb(${colour.join(' ')})`);
    path.setAttribute('stroke-opacity', String(Math.min(1, mid * 2)));
    path.style.animationDelay = `${-LAP_S * (1 - (LENGTH * i) / PIECES)}s`;
    svg.appendChild(path);
    return path;
  });

  new ResizeObserver(() => {
    // the svg runs 1px past the button on each side, over its border
    const w = button.offsetWidth + 2;
    const h = button.offsetHeight + 2;
    if (!button.offsetWidth) return;
    // the middle of the border, clockwise from the top left
    const inset = STROKE / 2;
    const r = h / 2 - inset;
    const left = inset + r;
    const right = w - inset - r;
    const d = `M${left} ${inset}H${right}A${r} ${r} 0 0 1 ${right} ${h - inset}H${left}A${r} ${r} 0 0 1 ${left} ${inset}Z`;
    const lap = 2 * (right - left) + 2 * Math.PI * r;
    const piece = (lap * LENGTH) / PIECES;
    svg.style.setProperty('--lap', `${lap}px`);
    for (const path of pieces) {
      path.setAttribute('d', d);
      // a hair long, so no seams show between the pieces
      path.style.strokeDasharray = `${piece + 0.4} ${lap - piece - 0.4}`;
    }
  }).observe(svg);
}
