// A black cat that strolls around the yard, stops now and then to look at you and meows when poked.
// Built from simple shapes in cm; +x is forward.
import * as THREE from 'three';

const fur = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.55 });
const nose = new THREE.MeshStandardMaterial({ color: 0x3a2a2c, roughness: 0.5 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xc9e33f, emissive: 0x6f8a10, emissiveIntensity: 0.8, roughness: 0.2 });
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

function blob(parent, sx, sy, sz, x, y, z, mat = fur) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function buildCat() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  blob(body, 20, 9.5, 8.5, 0, 21, 0);
  blob(body, 9, 10, 8, 13, 24, 0);
  blob(body, 9, 8.5, 8.5, -13, 22, 0);

  // head with ears, eyes and muzzle
  const head = new THREE.Group();
  head.position.set(22, 32, 0);
  body.add(head);
  blob(head, 7.2, 6.4, 7.4, 0, 0, 0);
  blob(head, 3.4, 2.6, 3.8, 5.6, -2.2, 0);
  blob(head, 0.9, 0.7, 1.1, 8.8, -1.2, 0, nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(2.8, 6.5, 4), fur);
    ear.position.set(-0.8, 6.2, s * 3.6);
    ear.rotation.set(s * -0.28, 0, 0);
    ear.castShadow = true;
    head.add(ear);
    blob(head, 1.1, 1.5, 1.3, 5.6, 1.4, s * 2.9, eyeMat);
    blob(head, 0.35, 1.2, 0.5, 6.6, 1.4, s * 2.9, pupilMat);
  }

  // legs swing around their hips
  const legs = [];
  for (const [x, z, phase] of [[12, 4.5, 0], [12, -4.5, Math.PI], [-13, 4.5, Math.PI], [-13, -4.5, 0]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 19, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.6, 17, 8), fur);
    leg.position.y = -8.5;
    leg.castShadow = true;
    hip.add(leg);
    blob(hip, 2.4, 1.4, 2.1, 0.8, -17.4, 0);
    body.add(hip);
    legs.push({ hip, phase });
  }

  // tail: a chain of segments, each one bends a little more
  const tail = [];
  let parent = new THREE.Group();
  parent.position.set(-21, 25, 0);
  body.add(parent);
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4 - i * 0.08, 1.6 - i * 0.08, 6.5, 8), fur);
    m.position.y = 3.2;
    m.castShadow = true;
    seg.add(m);
    if (i) seg.position.y = 6.2;
    else seg.rotation.z = 0.9;
    parent.add(seg);
    tail.push(seg);
    parent = seg;
  }
  return { root, body, head, legs, tail };
}

export function createCat(scene) {
  const cat = buildCat();
  scene.add(cat.root);
  let route = [];
  let next = 0;
  let heading = 0;
  let phase = 0;
  let pause = 0;
  let hop = 0;
  let hurry = 0;
  let lookAt = null;

  // A loop around the whole yard, clear of trailer, carton stack and the pieces lying in front.
  function setRoute({ L, W }) {
    const right = Math.max(650, L + 260);
    const front = W + 900;
    route = [[-400, -330], [110, -330], [right, -330], [right, 300], [right, front], [-400, front], [-400, 300]];
    if (!cat.root.userData.placed) {
      cat.root.position.set(110, 0, -330);
      cat.root.userData.placed = true;
    }
  }

  function update(dt, t, camera) {
    const pos = cat.root.position;
    hurry = Math.max(0, hurry - dt);
    let moving = false;
    if (pause > 0) {
      pause -= dt;
      lookAt = camera.position;
    } else if (route.length) {
      const [tx, tz] = route[next];
      const dx = tx - pos.x;
      const dz = tz - pos.z;
      if (Math.hypot(dx, dz) < 25) {
        next = (next + 1) % route.length;
        // now and then sit down for a moment and look around
        if (Math.random() < 0.45) pause = 2 + Math.random() * 4;
      } else {
        const want = Math.atan2(-dz, dx);
        let d = want - heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        heading += d * Math.min(1, dt * 3);
        const speed = hurry > 0 ? 150 : 55;
        pos.x += Math.cos(heading) * speed * dt;
        pos.z -= Math.sin(heading) * speed * dt;
        phase += dt * speed * 0.17;
        moving = true;
      }
      lookAt = null;
    }
    cat.root.rotation.y = heading;

    // gait: diagonal legs together, a slight bob; at rest the legs settle
    for (const l of cat.legs) {
      const target = moving ? Math.sin(phase + l.phase) * 0.55 : 0;
      l.hip.rotation.z += (target - l.hip.rotation.z) * Math.min(1, dt * 12);
    }
    hop = Math.max(0, hop - dt);
    const jump = hop > 0 ? Math.sin((1 - hop / 0.45) * Math.PI) * 18 : 0;
    cat.body.position.y = (moving ? Math.abs(Math.sin(phase)) * 0.8 : 0) + jump;

    // tail sways, more when walking
    cat.tail.forEach((s, i) => {
      if (i === 0) return;
      s.rotation.x = Math.sin(t * (moving ? 3 : 1.4) - i * 0.6) * (moving ? 0.16 : 0.1);
      s.rotation.z = -0.12;
    });

    // head turns towards the camera while resting
    let yaw = 0;
    if (lookAt) {
      const local = cat.root.worldToLocal(lookAt.clone());
      yaw = Math.max(-1, Math.min(1, Math.atan2(-local.z, local.x)));
    }
    cat.head.rotation.y += (yaw - cat.head.rotation.y) * Math.min(1, dt * 4);
  }

  function hit(raycaster) {
    return raycaster.intersectObject(cat.root, true)[0] ?? null;
  }

  // poked: a little jump, then it trots off quickly
  function poke() {
    hop = 0.45;
    hurry = 3;
    pause = 0;
  }

  return { group: cat.root, setRoute, update, hit, poke };
}
