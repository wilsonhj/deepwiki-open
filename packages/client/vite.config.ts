import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In development the client runs on 5173 and proxies both the API and
 * the WebSocket to the game server on 8080, so the browser only ever
 * talks to one origin — same as in production, where the server serves
 * this bundle itself.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
