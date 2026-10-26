import { defineConfig } from 'vite';

export default defineConfig({
  // Set by the Pages workflow: "/smb3-portfolio/" on github.io, "/" on a custom domain.
  base: process.env.BASE_PATH || '/',
  // Versions public asset URLs (src/assets.ts): the commit on CI, the start time locally.
  define: { __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? Date.now().toString(36)).slice(0, 8)) },
  // Phaser alone is ~1.4 MB minified; that's expected for a game.
  build: { chunkSizeWarningLimit: 1800 },
});
