import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const api = process.env.API_ORIGIN ?? 'http://127.0.0.1:8787';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': api, '/mediapipe': api, '/models': api },
  },
});
