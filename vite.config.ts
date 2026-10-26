import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const monacoEsm = fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs/', import.meta.url));

// base './' so the built site works from any sub-path (GitHub Pages project sites, artifact hosting).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    // monaco-editor's package "exports" hide deep esm paths; map them to the files directly
    // (used for the editor web worker import).
    alias: [{ find: /^monaco-editor\/esm\/vs\/(.*)$/, replacement: `${monacoEsm}$1` }],
  },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 4000 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], testTimeout: 60000 },
} as never);
