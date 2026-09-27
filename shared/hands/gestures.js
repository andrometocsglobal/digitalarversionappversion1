// Rotation- and scale-invariant gesture classification from 21 MediaPipe hand
// landmarks (normalised image coords, y grows downward).
//
//  0 wrist | thumb 1 CMC 2 MCP 3 IP 4 TIP | index 5-8 | middle 9-12
//  ring 13-16 | pinky 17-20   (MCP, PIP, DIP, TIP)

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const CHAIN = { index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20] };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const GESTURES = {
  fist: { label: 'Fist', emoji: '✊' },
  point: { label: 'Pointing', emoji: '☝️' },
  peace: { label: 'Peace', emoji: '✌️' },
  three: { label: 'Three', emoji: '🤟' },
  four: { label: 'Four', emoji: '🖖' },
  open_palm: { label: 'Open palm', emoji: '🖐️' },
  thumbs_up: { label: 'Thumbs up', emoji: '👍' },
  thumbs_down: { label: 'Thumbs down', emoji: '👎' },
  rock: { label: 'Rock on', emoji: '🤘' },
  call_me: { label: 'Call me', emoji: '🤙' },
  l_shape: { label: 'L shape', emoji: '👆' },
  unknown: { label: 'Hand', emoji: '✋' },
};

export function extendedFingers(lm) {
  const wrist = lm[0];
  const palm = dist(wrist, lm[9]) || 1e-6;
  const out = {};
  for (const [name, [, pip, tip]] of Object.entries(CHAIN)) {
    out[name] = dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.1;
  }
  out.thumb = dist(lm[4], lm[17]) > dist(lm[2], lm[17]) * 1.1 && dist(lm[4], lm[5]) > 0.4 * palm;
  return { extended: out, palm };
}

/** Classify one hand. Returns { gesture, label, emoji, count, extended }. */
export function classifyHand(lm) {
  if (!Array.isArray(lm) || lm.length < 21) return null;
  const { extended: e, palm } = extendedFingers(lm);
  const count = FINGERS.reduce((n, f) => n + (e[f] ? 1 : 0), 0);
  const on = FINGERS.filter((f) => e[f]).join('+');

  let gesture = 'unknown';
  if (count === 0) gesture = 'fist';
  else if (count === 5) gesture = 'open_palm';
  else if (on === 'thumb') {
    const rise = lm[2].y - lm[4].y; // positive when the thumb tip is above its base
    gesture = rise > 0.3 * palm ? 'thumbs_up' : rise < -0.3 * palm ? 'thumbs_down' : 'unknown';
  } else if (on === 'index') gesture = 'point';
  else if (on === 'index+middle') gesture = 'peace';
  else if (on === 'index+middle+ring') gesture = 'three';
  else if (on === 'index+middle+ring+pinky') gesture = 'four';
  else if (on === 'index+pinky') gesture = 'rock';
  else if (on === 'thumb+pinky') gesture = 'call_me';
  else if (on === 'thumb+index') gesture = 'l_shape';

  return { gesture, ...GESTURES[gesture], count, extended: e };
}

/** Classify every detected hand; total finger count across hands (0..10). */
export function classifyHands(hands = []) {
  const results = hands.map((h) => classifyHand(h.landmarks ?? h)).filter(Boolean);
  return { hands: results, total: results.reduce((n, r) => n + r.count, 0), primary: results[0] ?? null };
}

/**
 * Debounces noisy per-frame labels: a label must hold for `frames` consecutive
 * updates before it is reported. O(1) state.
 */
export class GestureStabilizer {
  constructor(frames = 5) {
    this.frames = frames;
    this.candidate = null;
    this.streak = 0;
    this.stable = null;
  }
  /** Feed a label (or null). Returns the new stable label when it changes, else undefined. */
  push(label) {
    if (label === this.candidate) this.streak++;
    else {
      this.candidate = label;
      this.streak = 1;
    }
    if (this.streak >= this.frames && this.stable !== label) {
      this.stable = label;
      return label;
    }
    return undefined;
  }
}
