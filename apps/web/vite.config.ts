import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@hsr-sim/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
      '@hsr-sim/data': fileURLToPath(new URL('../../packages/data/src/index.ts', import.meta.url)),
      '@hsr-sim/equipment': fileURLToPath(new URL('../../packages/equipment/src/index.ts', import.meta.url)),
      '@hsr-sim/content': fileURLToPath(new URL('../../packages/content/src/index.ts', import.meta.url)),
      '@hsr-sim/policy': fileURLToPath(new URL('../../packages/policy/src/index.ts', import.meta.url)),
      '@hsr-sim/replay': fileURLToPath(new URL('../../packages/replay/src/index.ts', import.meta.url)),
      '@hsr-sim/scenarios': fileURLToPath(new URL('../../packages/scenarios/src/index.ts', import.meta.url)),
      '@hsr-sim/search': fileURLToPath(new URL('../../packages/search/src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
