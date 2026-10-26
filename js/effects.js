// Small particle effects: a dust puff when a piece lands, confetti when everything is loaded.
import * as THREE from 'three';

let scene = null;
const particles = [];

export function init(s) {
  scene = s;
}

const dustTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

// Puff along the footprint edges of a box that just landed (world coords).
export function dust(x0, y, z0, x1, z1) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const n = 34;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const per = 2 * (x1 - x0 + z1 - z0);
    let d = t * per;
    let px, pz;
    if (d < x1 - x0) [px, pz] = [x0 + d, z0];
    else if ((d -= x1 - x0) < z1 - z0) [px, pz] = [x1, z0 + d];
    else if ((d -= z1 - z0) < x1 - x0) [px, pz] = [x1 - d, z1];
    else [px, pz] = [x0, z1 - (d - (x1 - x0))];
    const mat = new THREE.SpriteMaterial({ map: dustTex, color: 0xe6d8c0, transparent: true, opacity: 0.55, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.position.set(px, y + 3, pz);
    sp.scale.setScalar(8);
    const out = new THREE.Vector3(px - cx, 0, pz - cz).normalize().multiplyScalar(40 + Math.random() * 40);
    out.y = 10 + Math.random() * 15;
    scene.add(sp);
    particles.push({ obj: sp, vel: out, life: 0, max: 0.8 + Math.random() * 0.4, kind: 'dust' });
  }
}

const CONFETTI = [0xff4d6d, 0xffc43d, 0x1f52c9, 0x34c759, 0xff8a1f, 0xb46ef5];
const confettiGeo = new THREE.PlaneGeometry(5, 3);

export function confetti(x, y, z) {
  for (let i = 0; i < 180; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: CONFETTI[i % CONFETTI.length], side: THREE.DoubleSide, transparent: true });
    const m = new THREE.Mesh(confettiGeo, mat);
    m.position.set(x + (Math.random() - 0.5) * 60, y, z + (Math.random() - 0.5) * 60);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 160;
    const vel = new THREE.Vector3(Math.cos(a) * sp, 220 + Math.random() * 200, Math.sin(a) * sp);
    const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    scene.add(m);
    particles.push({ obj: m, vel, spin, life: 0, max: 3 + Math.random() * 1.5, kind: 'confetti' });
  }
}

export function update(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    const k = p.life / p.max;
    if (p.kind === 'dust') {
      p.obj.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - 2.5 * dt);
      p.obj.scale.setScalar(8 + k * 22);
      p.obj.material.opacity = 0.55 * (1 - k);
    } else {
      p.vel.y -= 380 * dt;
      p.vel.multiplyScalar(1 - 1.6 * dt);
      p.obj.position.addScaledVector(p.vel, dt);
      p.obj.rotation.x += p.spin.x * dt;
      p.obj.rotation.y += p.spin.y * dt;
      if (p.obj.position.y < 1) {
        p.obj.position.y = 1;
        p.vel.set(0, 0, 0);
        p.spin.set(0, 0, 0);
      }
      p.obj.material.opacity = k > 0.75 ? (1 - k) * 4 : 1;
    }
    if (p.life >= p.max) {
      scene.remove(p.obj);
      p.obj.material.dispose();
      particles.splice(i, 1);
    }
  }
}
