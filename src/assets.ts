// Public files (felt art, music, pictures) keep their names from deploy to
// deploy, and GitHub Pages lets browsers cache them for 10 minutes, so a visit
// right after a deploy could mix old files with new ones (an old atlas map on
// a new atlas image). Every URL carries this build's version instead.
// (Images the page's CSS uses live in src/art/page, where Vite fingerprints them.)

declare const __BUILD__: string;

/** URL of a file in public/, versioned per build. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}?v=${__BUILD__}`;
