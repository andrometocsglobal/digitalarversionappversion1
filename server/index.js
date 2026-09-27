import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';

createApp(process.env.OMNI_DATA_DIR ? { dataDir: process.env.OMNI_DATA_DIR } : {}).listen(port, host, () => {
  console.log(`Omni AR wellness server on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});
