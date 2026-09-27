// Copies the MediaPipe WASM runtime into the static build (dist/mediapipe/wasm)
// for static/CDN hosts such as Netlify, where there is no Express to serve it.
import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function copyWasm(outDir = join(root, 'dist')) {
  const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  const dest = join(outDir, 'mediapipe', 'wasm');
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
  return readdir(dest);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = await copyWasm();
  console.log(`copied ${files.length} MediaPipe wasm files to dist/mediapipe/wasm`);
}
