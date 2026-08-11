import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const target = 'http://localhost:8787';

export default defineConfig({
  envDir: '..',
  plugins: [svelte()],
  server: {
    proxy: {
      '/api': target,
      '/events': { target, ws: false },
      '/mcp': target
    }
  }
});
