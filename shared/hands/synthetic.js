// Builds plausible 21-point hand landmarks for tests and the mock tracker.
// Hand space: wrist at origin, fingers point toward -y, palm length (wrist to
// middle MCP) = 1. Then rotated, scaled and placed in normalised image coords.

const MCP = { index: [0.25, -0.95], middle: [0.05, -1.0], ring: [-0.15, -0.95], pinky: [-0.33, -0.85] };
const BASE = { index: 5, middle: 9, ring: 13, pinky: 17 };

export const POSES = {
  fist: [],
  point: ['index'],
  peace: ['index', 'middle'],
  three: ['index', 'middle', 'ring'],
  four: ['index', 'middle', 'ring', 'pinky'],
  open_palm: ['thumb', 'index', 'middle', 'ring', 'pinky'],
  thumbs_up: ['thumb'],
  thumbs_down: ['thumb'],
  rock: ['index', 'pinky'],
  call_me: ['thumb', 'pinky'],
  l_shape: ['thumb', 'index'],
};

// Rotation (degrees) that points the extended thumb up or down in the image.
const THUMB_ANGLE = (Math.atan2(-0.8, 0.8) * 180) / Math.PI; // direction of wrist→thumb tip
export const POSE_ROTATION = { thumbs_up: -90 - THUMB_ANGLE, thumbs_down: 90 - THUMB_ANGLE };

/** Hand with `n` fingers raised (0..5), thumb first. */
export const fingersFor = (n) => ['thumb', 'index', 'middle', 'ring', 'pinky'].slice(0, n);
export const countPose = (n) => (n === 5 ? ['thumb', 'index', 'middle', 'ring', 'pinky'] : ['index', 'middle', 'ring', 'pinky'].slice(0, n));

export function makeHand({ fingers = [], pose, rotation, scale = 0.18, cx = 0.5, cy = 0.62 } = {}) {
  if (pose) {
    fingers = POSES[pose];
    rotation ??= POSE_ROTATION[pose] ?? 0;
  }
  rotation ??= 0;
  const up = new Set(fingers);
  const pts = new Array(21);
  pts[0] = [0, 0];

  // Thumb
  pts[1] = [0.3, -0.2];
  pts[2] = [0.5, -0.4];
  if (up.has('thumb')) {
    pts[3] = [0.65, -0.6];
    pts[4] = [0.8, -0.8];
  } else {
    pts[3] = [0.4, -0.6];
    pts[4] = [0.1, -0.7];
  }

  for (const [name, [mx, my]] of Object.entries(MCP)) {
    const b = BASE[name];
    pts[b] = [mx, my];
    if (up.has(name)) {
      pts[b + 1] = [mx, my - 0.4];
      pts[b + 2] = [mx, my - 0.65];
      pts[b + 3] = [mx, my - 0.85];
    } else {
      pts[b + 1] = [mx, my - 0.35];
      pts[b + 2] = [mx * 0.9, my - 0.2];
      pts[b + 3] = [mx * 0.8, my + 0.1];
    }
  }

  const t = (rotation * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return pts.map(([x, y]) => ({ x: cx + (x * c - y * s) * scale, y: cy + (x * s + y * c) * scale, z: 0 }));
}
