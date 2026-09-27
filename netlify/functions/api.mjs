// Netlify Function: the same Express API, run serverless.
// netlify.toml rewrites /api/* here; static files and MediaPipe assets are
// served by Netlify's CDN, and /models/* is proxied straight to Google.
import express from 'express';
import serverless from 'serverless-http';
import { createApp } from '../../server/app.js';
import registry from '../../server/ar/ar-register.json' with { type: 'json' };

const api = createApp({
  registry, // bundled, so no filesystem access is needed at runtime
  dataDir: null, // identities are self-certifying; nothing to persist
  clientDir: '/nonexistent',
  modelCacheDir: '/tmp/omni-models',
  trustProxy: process.env.TRUST_PROXY ?? 1,
});

const app = express();
app.disable('x-powered-by');
// Requests may arrive as /.netlify/functions/api/<route>; the routes live under /api.
app.use((req, _res, next) => {
  req.url = req.url.replace(/^\/\.netlify\/functions\/api(?=\/|\?|$)/, '/api');
  next();
});
app.use(api);

export const handler = serverless(app);
