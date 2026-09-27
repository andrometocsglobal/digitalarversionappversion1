// Real-world AR with WebXR (Chrome on ARCore Android devices).
//
//  1st tap on a detected surface  -> places your AR twin in the room
//  next taps                      -> drop task stations; the twin walks to the
//                                    station of whichever task it is working on
//
// The twin is built from three.js primitives in the user's chosen shape and
// colour, and a floating label shows its current task step.

import * as THREE from 'three';
import { buildTwin, makeLabel } from './twinModel.js';

export async function isImmersiveArSupported() {
  try {
    return !!(await navigator.xr?.isSessionSupported?.('immersive-ar'));
  } catch {
    return false;
  }
}

function makeStation(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.1, 40), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25), new THREE.MeshBasicMaterial({ color: 0xeab308 }));
  pillar.position.y = 0.125;
  g.add(ring, pillar);
  return g;
}

/**
 * Starts an immersive-ar session.
 * getState(): { prefs, taskId, stepLabel, waitingForHuman } — polled each frame.
 * onInfo(text): status messages for the DOM overlay.
 */
export async function startXR({ overlayRoot, getState, onInfo, onEnd }) {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'local-floor'],
    domOverlay: overlayRoot ? { root: overlayRoot } : undefined,
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.domElement.className = 'xr-canvas';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(0.5, 2, 1);
  scene.add(sun);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const { prefs } = getState();
  const twin = buildTwin(prefs.twinShape, new THREE.Color(prefs.twinColor));
  twin.visible = false;
  scene.add(twin);
  const label = makeLabel();
  label.sprite.position.y = 0.48;
  twin.add(label.sprite);

  const stations = []; // { taskId|null, group }
  const home = new THREE.Vector3();
  const target = new THREE.Vector3();

  await renderer.xr.setSession(session);
  const viewerSpace = await session.requestReferenceSpace('viewer');
  const hitSource = await session.requestHitTestSource({ space: viewerSpace });
  onInfo?.('Move your phone slowly to find a surface, then tap to place your twin.');

  const tmp = new THREE.Vector3();
  session.addEventListener('select', () => {
    if (!reticle.visible) return;
    tmp.setFromMatrixPosition(reticle.matrix);
    if (!twin.visible) {
      twin.position.copy(tmp);
      home.copy(tmp);
      twin.visible = true;
      onInfo?.('Twin placed. Tap more surfaces to drop task stations, then assign tasks.');
    } else {
      const g = makeStation(new THREE.Color(prefs.twinColor));
      g.position.copy(tmp);
      scene.add(g);
      stations.push({ taskId: null, group: g });
      onInfo?.(`Station ${stations.length} placed.`);
    }
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop((_t, frame) => {
    const dt = Math.min(0.1, clock.getDelta());
    if (frame) {
      const refSpace = renderer.xr.getReferenceSpace();
      const hit = frame.getHitTestResults(hitSource)[0];
      const pose = hit?.getPose(refSpace);
      reticle.visible = !!pose;
      if (pose) reticle.matrix.fromArray(pose.transform.matrix);
    }

    if (twin.visible) {
      const s = getState();
      // Bind the active task to a station (stations are claimed in order).
      let dest = home;
      if (s.taskId) {
        let st = stations.find((x) => x.taskId === s.taskId) ?? stations.find((x) => !x.taskId);
        if (st) {
          st.taskId = s.taskId;
          dest = st.group.position;
        }
      }
      for (const st of stations) if (st.taskId && st.taskId !== s.taskId) st.taskId = null;

      target.copy(dest);
      if (dest !== home) target.x += 0.15;
      const step = Math.min(1, dt * 1.6);
      twin.position.lerp(target, step);
      // Face the camera.
      const cam = renderer.xr.getCamera();
      tmp.setFromMatrixPosition(cam.matrixWorld);
      twin.lookAt(tmp.x, twin.position.y, tmp.z);
      const t = clock.elapsedTime;
      twin.children.forEach((c) => {
        if (c.name === 'spin') c.rotation.z += dt * 2;
      });
      twin.position.y = target.y + Math.abs(Math.sin(t * 3)) * (twin.position.distanceTo(target) > 0.02 ? 0.04 : 0.01);
      label.set(s.stepLabel ? (s.waitingForHuman ? `Your turn: ${s.stepLabel}` : s.stepLabel) : `${s.prefs.twinName} is ready`);
    }
    renderer.render(scene, camera);
  });

  const cleanup = () => {
    renderer.setAnimationLoop(null);
    hitSource.cancel?.();
    renderer.dispose();
    renderer.domElement.remove();
    onEnd?.();
  };
  session.addEventListener('end', cleanup, { once: true });

  return { end: () => session.end().catch(() => {}) };
}
