// Static-app platform constants shared by the Vite build, the hosting configs
// (netlify.toml, render.yaml — a unit test keeps them in sync) and the client.

export const MODEL_URLS = Object.freeze({
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
});

/** CSP for the <meta> tag (frame-ancestors is ignored in meta, so hosts add it). */
export const CSP_META = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self' https://storage.googleapis.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/** CSP sent as an HTTP header by static hosts. */
export const CSP_HEADER = `${CSP_META}; frame-ancestors 'none'`;
