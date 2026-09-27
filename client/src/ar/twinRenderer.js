// 2D AR layer drawn over the live camera: the user's hand skeleton, the
// delayed mirror "digital clone" of their hands, the AR twin avatar that walks
// between task stations, and its speech bubble. Coordinates are normalised
// (0..1) in camera space; `mirror` flips x for the selfie view.

import { makeHand } from '@shared/hands/synthetic.js';

export const STATIONS = {
  hydrate: { x: 0.14, y: 0.78, icon: '💧', label: 'Water' },
  'screen-break': { x: 0.86, y: 0.24, icon: '👀', label: 'Eyes' },
  posture: { x: 0.5, y: 0.13, icon: '🧍', label: 'Posture' },
  breathe: { x: 0.14, y: 0.28, icon: '🌬️', label: 'Calm' },
  'detox-hour': { x: 0.86, y: 0.78, icon: '🌿', label: 'Detox' },
  stretch: { x: 0.5, y: 0.86, icon: '🤲', label: 'Stretch' },
};

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const CLONE_DELAY = 8; // frames
export function createTwinState() {
  return { x: 0.8, y: 0.25, scale: 1, tilt: 0, anchor: 'home', placed: null, moving: false, history: new Array(CLONE_DELAY + 1).fill(null), head: 0, last: 0, scanUntil: 0, demoUntil: 0 };
}

function drawHand(ctx, lm, W, H, mirror, { color, width, glow, dots }) {
  const px = (p) => (mirror ? 1 - p.x : p.x) * W;
  const py = (p) => p.y * H;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(px(lm[a]), py(lm[a]));
    ctx.lineTo(px(lm[b]), py(lm[b]));
  }
  ctx.stroke();
  if (dots) {
    ctx.fillStyle = '#fff';
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(px(p), py(p), width * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawAvatar(ctx, x, y, r, shape, color, t, blink) {
  const bob = Math.sin(t / 380) * r * 0.12;
  y += bob;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.9;
  if (shape === 'bot') {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.8);
    ctx.lineTo(x, y - r * 1.25);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - r * 1.3, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, x - r, y - r * 0.8, r * 2, r * 1.6, r * 0.45);
    ctx.fill();
  } else if (shape === 'spark') {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 + t / 1400;
      const rr = i % 2 ? r * 0.55 : r * 1.15;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, color);
    g.addColorStop(1, color + '66');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // face
  ctx.fillStyle = '#071c26';
  const eh = blink ? r * 0.04 : r * 0.16;
  for (const dx of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y - r * 0.1, r * 0.11, eh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#071c26';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.12, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
  return y;
}

function drawBubble(ctx, x, y, text, W) {
  if (!text) return;
  const pad = 10;
  const maxW = Math.min(300, W * 0.6);
  ctx.save();
  ctx.font = '600 14px system-ui, sans-serif';
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 4);
  const bw = Math.max(...shown.map((l) => ctx.measureText(l).width)) + pad * 2;
  const bh = shown.length * 18 + pad * 2 - 4;
  const bx = Math.min(Math.max(8, x - bw / 2), W - bw - 8);
  const by = Math.max(46, y - bh - 14); // stay clear of the HUD chips
  ctx.fillStyle = 'rgba(7, 28, 38, 0.86)';
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e6fbff';
  ctx.textBaseline = 'top';
  shown.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad + i * 18));
  ctx.restore();
}

/**
 * Render one frame. `twin` is the mutable state from createTwinState().
 * opts: { hands, face, mirror, prefs, task: { templateId, waitingForHuman, progress } | null, bubble, now }
 */
export function renderFrame(ctx, W, H, twin, opts) {
  const { hands = [], face, mirror, prefs, task, bubble, now, arEnabled, palm = null, avatar3d = false } = opts;
  ctx.clearRect(0, 0, W, H);
  const color = prefs.twinColor;
  const X = (x) => (mirror ? 1 - x : x);

  // User's hands — thin white skeleton.
  for (const h of hands) drawHand(ctx, h.landmarks, W, H, mirror, { color: 'rgba(255,255,255,0.85)', width: 2.5, glow: 6, dots: true });

  // Ring buffer of recent frames for the delayed clone (fixed memory).
  twin.head = (twin.head + 1) % twin.history.length;
  twin.history[twin.head] = hands.length ? hands : null;
  if (!arEnabled) return;

  if (prefs.mirrorClone) {
    const past = twin.history[(twin.head + 1) % twin.history.length];
    if (past) {
      for (const h of past) {
        const clone = h.landmarks.map((p) => ({ x: 1 - p.x, y: p.y }));
        drawHand(ctx, clone, W, H, mirror, { color, width: 4, glow: 18, dots: false });
      }
    }
  }

  if (!prefs.showTwin) return;

  // Task stations.
  const station = task ? STATIONS[task.templateId] : null;
  if (station) {
    ctx.save();
    ctx.font = '26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sx = X(station.x) * W;
    const sy = station.y * H;
    const pulse = 1 + Math.sin(now / 300) * 0.08;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(sx, sy, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(station.icon, sx, sy);
    ctx.restore();
  }

  // Where should the twin be? task > palm > placed > face > home.
  let tx = 0.8;
  let ty = 0.22;
  let ts = 1;
  let tilt = 0;
  let anchor = 'home';
  if (station) {
    anchor = 'task';
    tx = station.x + (station.x > 0.5 ? -0.08 : 0.08);
    ty = station.y + (task.waitingForHuman ? -0.1 : 0);
  } else if (palm) {
    anchor = 'palm';
    tx = palm.x;
    ty = palm.y - palm.size * 0.55; // standing on the palm
    ts = Math.min(2.2, Math.max(0.45, palm.size / 0.16));
    tilt = mirror ? -palm.tilt : palm.tilt;
  } else if (twin.placed) {
    anchor = 'placed';
    tx = twin.placed.x;
    ty = twin.placed.y;
  } else if (face) {
    anchor = 'face';
    tx = face.x + face.width / 2 + face.width * 0.9;
    ty = Math.max(0.12, face.y - 0.02);
    ts = Math.min(1.8, Math.max(0.6, face.width / 0.25));
  }
  const dt = Math.min(0.1, (now - (twin.last || now)) / 1000);
  twin.last = now;
  const k = prefs.reducedMotion ? 1 : Math.min(1, dt * (anchor === 'palm' ? 9 : 2.4));
  twin.moving = Math.hypot(tx - twin.x, ty - twin.y) > 0.02;
  twin.x += (tx - twin.x) * k;
  twin.y += (ty - twin.y) * k;
  twin.scale += (ts - twin.scale) * k;
  twin.tilt += (tilt - twin.tilt) * k;
  twin.anchor = anchor;

  const ax = X(twin.x) * W;
  const ay = twin.y * H;
  const r = Math.max(18, Math.min(W, H) * 0.045) * twin.scale;

  // Posture scan box.
  if (face && now < twin.scanUntil) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const fx = X(face.x + (mirror ? face.width : 0)) * W;
    ctx.strokeRect(fx, face.y * H, face.width * W, face.height * H);
    const sweep = face.y * H + ((now / 6) % (face.height * H));
    ctx.beginPath();
    ctx.moveTo(fx, sweep);
    ctx.lineTo(fx + face.width * W, sweep);
    ctx.stroke();
    ctx.restore();
  }

  // Stretch demo: the twin shows open-palm / fist with a synthetic hand.
  if (now < twin.demoUntil) {
    const open = Math.floor(now / 700) % 2 === 0;
    const demo = makeHand({ pose: open ? 'open_palm' : 'fist', scale: 0.1, cx: twin.x + (twin.x > 0.5 ? -0.12 : 0.12), cy: twin.y + 0.16 });
    drawHand(ctx, demo, W, H, false, { color, width: 3, glow: 12, dots: false });
  }

  // In 3D mode the three.js layer draws the twin; keep only the speech bubble here.
  if (avatar3d) {
    drawBubble(ctx, ax, ay - H * 0.12 * twin.scale, bubble, W);
    return;
  }

  const blink = Math.floor(now / 160) % 25 === 0;
  const drawnY = drawAvatar(ctx, ax, ay, r, prefs.twinShape, color, now, blink);

  if (task) {
    ctx.save();
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ax, drawnY, r * 1.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.03, task.progress));
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.fillText(prefs.twinName, ax, drawnY + r * 1.7);
  ctx.restore();

  drawBubble(ctx, ax, drawnY - r * 1.4, bubble, W);
}

/** Palm anchor from 21 landmarks: centre, size (wrist→middle MCP) and roll. */
export function palmAnchor(lm) {
  const ids = [0, 5, 9, 13, 17];
  const x = ids.reduce((s, i) => s + lm[i].x, 0) / ids.length;
  const y = ids.reduce((s, i) => s + lm[i].y, 0) / ids.length;
  const size = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
  // Roll: angle of the wrist→middle-MCP axis away from straight up, damped.
  const roll = Math.atan2(lm[9].x - lm[0].x, lm[0].y - lm[9].y);
  return { x, y, size, tilt: Math.max(-0.8, Math.min(0.8, -roll * 0.8)) };
}