import { defineConfig } from 'vite';

export default defineConfig({
  // Set by the Pages workflow: "/smb3-portfolio/" on github.io, "/" on a custom domain.
  base: process.env.BASE_PATH || '/',
  // Phaser alone is ~1.4 MB minified; that's expected for a game.
  build: { chunkSizeWarningLimit: 1800 },
});
