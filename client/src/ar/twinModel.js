// The 3D AR twin, shared by Web AR (any browser with a camera) and WebXR room AR.
import * as THREE from 'three';

export function buildTwin(shape, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x071c26, roughness: 0.6 });
  let headY = 0.22;
  if (shape === 'bot') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 24), mat);
    body.position.y = 0.08;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), mat);
    head.position.y = 0.23;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07), mat);
    antenna.position.y = 0.32;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.015), new THREE.MeshBasicMaterial({ color: 0xeab308 }));
    tip.position.y = 0.36;
    group.add(body, head, antenna, tip);
    headY = 0.23;
  } else if (shape === 'spark') {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat);
    core.position.y = 0.2;
    core.name = 'spin';
    group.add(core);
    headY = 0.2;
  } else {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), mat);
    orb.position.y = 0.2;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.006, 8, 48), new THREE.MeshBasicMaterial({ color: 0xeab308 }));
    halo.position.y = 0.2;
    halo.rotation.x = Math.PI / 2;
    halo.name = 'spin';
    group.add(orb, halo);
  }
  for (const dx of [-0.035, 0.035]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), dark);
    eye.position.set(dx, headY + 0.01, shape === 'bot' ? 0.062 : 0.092);
    group.add(eye);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(shadow);
  return group;
}

export function makeLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(0.4, 0.1, 1);
  let current = null;
  const set = (text) => {
    if (text === current) return;
    current = text;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    if (text) {
      ctx.fillStyle = 'rgba(7,28,38,0.85)';
      ctx.beginPath();
      ctx.roundRect(4, 4, 504, 120, 28);
      ctx.fill();
      ctx.fillStyle = '#e6fbff';
      ctx.font = '600 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.length > 30 ? `${text.slice(0, 29)}…` : text, 256, 64);
    }
    texture.needsUpdate = true;
  };
  return { sprite, set };
}
