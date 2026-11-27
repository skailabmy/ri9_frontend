import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/* Capacitor serves the built app from a WebView, so:
   - base: './'  keeps asset URLs relative (works on capacitor://localhost and https://localhost)
   - multi-page: kid home (index.html) + kid profile (profile.html). The
     school/parent designs stay as static references in www/references/
     and can be added as extra rollup inputs when they become real pages. */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        auth: resolve(root, 'auth.html'),
        onboarding: resolve(root, 'onboarding.html'),
        profile: resolve(root, 'profile.html'),
        stats: resolve(root, 'stats.html'),
        challenge: resolve(root, 'challenge.html'),
        quiz: resolve(root, 'quiz.html'),
        past: resolve(root, 'past.html'),
      },
    },
  },
  server: { port: 8100 },
});
