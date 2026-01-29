import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});
