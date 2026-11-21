import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/* Capacitor serves the built app from a WebView, so:
   - base: './'  keeps asset URLs relative (works on capacitor://localhost and https://localhost)
   - single page (kid home) for now. The school/parent designs stay as static
     references in www/references/ and can be added as extra rollup inputs
     when they're ready to become real pages. */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, 'index.html'),
    },
  },
  server: { port: 8100 },
});
