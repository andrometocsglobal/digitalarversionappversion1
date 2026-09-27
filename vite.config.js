import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { cp, readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { CSP_META } from './shared/platform.js';

const WASM_DIR = fileURLToPath(new URL('./node_modules/@mediapipe/tasks-vision/wasm', import.meta.url));
const MIME = { '.js': 'text/javascript', '.wasm': 'application/wasm' };

/** Serves MediaPipe's WASM runtime at /mediapipe/wasm in dev and copies it into the build. */
function mediapipeWasm() {
  let outDir = 'dist';
  return {
    name: 'omni-mediapipe-wasm',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/mediapipe/wasm', async (req, res, next) => {
        const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (!/^[\w.-]+$/.test(name)) return next();
        try {
          const body = await readFile(join(WASM_DIR, name));
          res.setHeader('Content-Type', MIME[extname(name)] ?? 'application/octet-stream');
          res.end(body);
        } catch {
          next();
        }
      });
    },
    async closeBundle() {
      await cp(WASM_DIR, join(outDir, 'mediapipe', 'wasm'), { recursive: true });
    },
  };
}

/** Adds the Content-Security-Policy meta tag to production builds (dev needs inline HMR scripts). */
function cspMeta() {
  return {
    name: 'omni-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_META }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig({
  root: 'client',
  plugins: [react(), mediapipeWasm(), cspMeta()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { port: 5173, fs: { allow: ['..'] } },
  preview: { port: 4173 },
});
