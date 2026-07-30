import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * Builds the admin SPA into `<pkg>/dist/public`, which the Nest app serves at
 * `/admin` via ServeStaticModule. `dist/` is committed so the package works as
 * a plain `github:` dependency with no install-time build step.
 */
export default defineConfig({
  root: here,
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: resolve(here, '../dist/public'),
    emptyOutDir: true,
    sourcemap: false,
    // One JS + one CSS file — keeps the committed dist reviewable.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/admin.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/admin.[ext]',
      },
    },
  },
});
