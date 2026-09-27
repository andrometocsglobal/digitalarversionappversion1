// Web AR: the same 3D twin as room-scale WebXR, rendered with three.js on a
// transparent layer over the live camera. Works in any browser with WebGL and
// a camera — laptops, desktops, iPhone, Android — no ARCore needed.
//
// The twin is anchored to what the camera sees (decided in twinRenderer.js):
// standing on an open palm, floating beside your face, at a spot you clicked,
// or walking to a task station. Each frame, update() receives that anchor in
// normalised display coordinates plus a scale and tilt.

import * as THREE from 'three';
import { buildTwin, makeLabel } from './twinModel.js';

const MODEL_CENTER_Y = 0.2; // model units: feet at 0, body centre ~0.2
const VIEW_SHARE = 0.2; // at scale 1 the twin is ~20% of the view height

export function createWebAR(host) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (err) {
    console.warn('WebGL unavailable — using the 2D twin', err);
    return null;
  }
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); // sharp enough, kind to weak GPUs
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'ar3d-layer';
  canvas.dataset.testid = 'ar3d';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
  keyLight.position.set(1.5, 3, 4);
  scene.add(keyLight);
  const rim = new THREE.DirectionalLight(0x22d3ee, 0.9);
  rim.position.set(-3, 1.5, -2);
  scene.add(rim);

  const root = new THREE.Group(); // positioned/scaled each frame
  const body = new THREE.Group(); // bob, hop and look-at live here
  root.add(body);
  scene.add(root);
  const label = makeLabel();
  label.sprite.position.y = 0.5;
  root.add(label.sprite);

  let twin = null;
  let modelKey = '';
  let W = 0;
  let H = 0;
  const clock = new THREE.Clock();

  const disposeTree = (obj) =>
    obj.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h || (w === W && h === H)) return;
    W = w;
    H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const viewHeight = () => 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  /**
   * s: { visible, x, y (display 0..1), scale, tilt, shape, color, label, moving, lookX }
   */
  function update(s) {
    resize();
    const key = `${s.shape}|${s.color}`;
    if (key !== modelKey) {
      if (twin) {
        body.remove(twin);
        disposeTree(twin);
      }
      twin = buildTwin(s.shape, new THREE.Color(s.color));
      body.add(twin);
      modelKey = key;
    }
    root.visible = !!s.visible;
    if (!root.visible) {
      renderer.render(scene, camera);
      return;
    }

    const t = clock.getElapsedTime();
    const vh = viewHeight();
    const vw = vh * camera.aspect;
    const sc = ((vh * VIEW_SHARE) / 0.4) * s.scale;
    root.scale.setScalar(sc);
    root.position.set((s.x - 0.5) * vw, (0.5 - s.y) * vh - MODEL_CENTER_Y * sc, 0);
    root.rotation.set(0.28, 0, s.tilt ?? 0); // a slight top-down view shows the ground shadow

    // Idle bob, a hop while walking, and turning to look toward the user.
    body.position.y = Math.sin(t * 2.6) * 0.015 + (s.moving ? Math.abs(Math.sin(t * 11)) * 0.05 : 0);
    const look = s.lookX == null ? Math.sin(t * 0.7) * 0.25 : THREE.MathUtils.clamp((s.lookX - s.x) * 2.2, -0.9, 0.9);
    body.rotation.y += (look - body.rotation.y) * 0.12;
    twin.children.forEach((c) => {
      if (c.name === 'spin') c.rotation.z += 0.03;
    });
    label.set(s.label);
    renderer.render(scene, camera);
  }

  function dispose() {
    if (twin) disposeTree(twin);
    renderer.dispose();
    canvas.remove();
  }

  return { update, dispose, canvas };
}
