// A black cat that lives in the yard: strolls around, sits, loafs, rolls on its back and rubs against
// things. Low poly with a simple rig (cm, +x forward, +y up, +z to its right). Poses are sets of joint
// angles; the cat blends towards the current one, the gait is layered on top while it walks.
import * as THREE from 'three';

const fur = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, flatShading: true });
const skin = new THREE.MeshStandardMaterial({ color: 0x2e2528, roughness: 0.6, flatShading: true });
const eyeMat = new THREE.MeshStandardMaterial({
  color: 0xd2df45, emissive: 0x6d7c0c, emissiveIntensity: 0.9, roughness: 0.15, flatShading: true,
});
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
const whiskerMat = new THREE.LineBasicMaterial({ color: 0xd0d0d0, transparent: true, opacity: 0.5 });
const ico = new THREE.IcosahedronGeometry(1, 1);

function blob(parent, [sx, sy, sz], [x, y, z], mat = fur) {
  const m = new THREE.Mesh(ico, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// A tapered segment hanging down from its joint; returns the joint at its lower end.
function limb(parent, len, r0, r1) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 6), fur);
  m.position.y = -len / 2;
  m.castShadow = true;
  parent.add(m);
  const end = new THREE.Group();
  end.position.y = -len;
  parent.add(end);
  return end;
}

function buildCat() {
  const root = new THREE.Group(); // position on the ground and heading
  const body = new THREE.Group(); // origin at the hip joint: height, pitch, roll
  root.add(body);

  // slim body: hips, torso, deep chest, a slightly hanging belly
  blob(body, [7, 7, 6.2], [1, 2.5, 0]);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(5.8, 18, 2, 8), fur);
  torso.rotation.z = Math.PI / 2;
  torso.position.set(12, 2.5, 0);
  torso.scale.set(1.05, 1, 0.85);
  torso.castShadow = true;
  body.add(torso);
  blob(body, [8, 7.2, 6.2], [23, 2, 0]);
  blob(body, [8.5, 4.5, 5.4], [12, -1.5, 0]);

  const neck = new THREE.Group();
  neck.position.set(27, 4.5, 0);
  body.add(neck);
  const nm = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 9.5, 7), fur);
  nm.position.y = 4.5;
  nm.castShadow = true;
  neck.add(nm);

  const head = new THREE.Group();
  head.position.y = 9;
  neck.add(head);
  blob(head, [5.4, 4.8, 5.6], [0, 0, 0]);
  blob(head, [3.6, 3.2, 5.4], [1.8, -1.6, 0]);
  blob(head, [2.6, 2, 3], [4.6, -2.2, 0]);
  blob(head, [1.6, 1, 1.8], [3.9, -3.6, 0]);
  blob(head, [0.7, 0.55, 0.9], [7, -1.3, 0], skin);
  const whiskers = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(-0.6, 3.6, s * 3.1);
    ear.rotation.set(s * 0.38, 0, -0.12);
    head.add(ear);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(2.7, 6.2, 3), fur);
    outer.position.y = 3.1;
    outer.rotation.y = -Math.PI / 2;
    outer.castShadow = true;
    ear.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 3), skin);
    inner.position.set(0.95, 2.3, 0);
    inner.rotation.y = -Math.PI / 2;
    ear.add(inner);
    blob(head, [0.9, 1.25, 1.45], [4, 0.7, s * 2.4], eyeMat);
    blob(head, [0.3, 1.05, 0.38], [4.85, 0.7, s * 2.45], pupilMat);
    for (const dy of [0.8, -0.4, -1.6]) {
      whiskers.push(new THREE.Vector3(5.6, -2.1, s * 2.2), new THREE.Vector3(3.2, -2.1 + dy * 1.6, s * 11));
    }
  }
  head.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(whiskers), whiskerMat));

  // legs: left first (z < 0), each with the joints that bend
  const front = [-1, 1].map((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(23, -3, s * 3.8);
    body.add(shoulder);
    const elbow = limb(shoulder, 9, 2.1, 1.6);
    const wrist = limb(elbow, 8, 1.6, 1.25);
    blob(wrist, [1.9, 1, 1.6], [0.6, -0.2, 0]);
    return { shoulder, elbow };
  });
  const hind = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(1, -1, s * 4);
    body.add(hip);
    blob(hip, [4.2, 5.6, 3.4], [1, -3.8, 0]);
    const knee = limb(hip, 9.5, 3, 1.9);
    const ankle = limb(knee, 9, 1.7, 1.3);
    const foot = limb(ankle, 4, 1.3, 1.1);
    blob(foot, [2.2, 1, 1.7], [0.8, -0.2, 0]);
    return { hip, knee, ankle };
  });

  // tail: a chain of segments
  const tail = [];
  let parent = new THREE.Group();
  parent.position.set(-5, 3, 0);
  body.add(parent);
  for (let i = 0; i < 11; i++) {
    const seg = new THREE.Group();
    const r = 1.8 - i * 0.09;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.07, r, 3.4, 6), fur);
    m.position.y = 1.7;
    m.castShadow = true;
    seg.add(m);
    if (i) seg.position.y = 3.3;
    parent.add(seg);
    tail.push(seg);
    parent = seg;
  }
  blob(parent, [0.85, 1.2, 0.85], [0, 3.6, 0]);
  return { root, body, neck, head, front, hind, tail };
}

// Joint angles per pose. f*/h*: front and hind leg joints, t*: tail, neck/hp/hy/hr: head.
const STAND = {
  y: 21, pitch: 0, roll: 0, neck: 0, hp: 0, hy: 0, hr: 0,
  fA: 0, fB: 0, hA: 0.5, hB: -1.2, hC: 0.7,
  tBase: 1.6, tCurl: 0.1, tTip: 0, tYaw: 0,
};
const POSES = {
  stand: STAND,
  walk: { ...STAND, tBase: 0.55, tCurl: -0.04, tTip: -0.35 },
  // rubbing: head low, tail straight up
  rub: { ...STAND, neck: -0.15, tBase: 0.12, tCurl: 0.02, tTip: -0.25 },
  sit: { ...STAND, y: 6.5, pitch: 0.6, neck: 0.1, fA: -0.6, hA: 0.6, hB: -2.6, hC: 1.6, tBase: 2, tCurl: 0.1, tYaw: 0.22 },
  loaf: { ...STAND, y: 8.5, neck: -0.25, fA: 0.9, fB: 0.6, hA: 1.3, hB: -2.6, hC: 1.4, tBase: 1.65, tCurl: 0.02, tYaw: 0.18 },
  side: { ...STAND, y: 6.5, roll: Math.PI / 2, neck: -0.4, fA: 0.5, fB: -0.3, hA: 0.9, hB: -1, hC: 0.5, tBase: 1.6, tCurl: 0, tYaw: 0.1 },
  back: { ...STAND, y: 9.5, roll: Math.PI, neck: -0.8, fA: 0.7, fB: -1.3, hA: 0.9, hB: -1.4, hC: 0.6, tBase: 1.6, tCurl: 0.05, tYaw: 0.15 },
};
const KEYS = Object.keys(STAND);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// getObstacles(): boxes on the ground { x0, x1, z0, z1, rub } the cat walks around and may rub against.
export function createCat(scene, getObstacles) {
  const cat = buildCat();
  scene.add(cat.root);
  const pos = cat.root.position;
  const cur = { ...STAND };
  let heading = 0;
  let phase = 0;
  let gait = 0;
  let hop = 0;
  let area = { x0: -350, x1: 600, z0: -380, z1: 900 };
  let boxes = [];
  let boxesAge = 99;
  let steps = [];
  let step = null;
  let stuck = { t: 0, d: Infinity };

  function setArea({ L, W }) {
    area = { x0: -350, x1: Math.min(740, Math.max(600, L + 240)), z0: -380, z1: W + 700 };
    if (!cat.root.userData.placed) {
      pos.set(110, 0, -330);
      cat.root.userData.placed = true;
    }
  }

  // the obstacle list is rebuilt regularly, so the box being rubbed is recognised by where it is
  const same = (b, own) => own && Math.abs(b.x0 - own.x0) + Math.abs(b.x1 - own.x1) + Math.abs(b.z0 - own.z0) + Math.abs(b.z1 - own.z1) < 4;

  function clearOf(x, z, margin) {
    return boxes.every((b) => x < b.x0 - margin || x > b.x1 + margin || z < b.z0 - margin || z > b.z1 + margin);
  }

  function wanderTo(speed = 55) {
    for (let i = 0; i < 40; i++) {
      const x = rand(area.x0, area.x1);
      const z = rand(area.z0, area.z1);
      const d = Math.hypot(x - pos.x, z - pos.z);
      // short strolls, unless it is running away
      if (clearOf(x, z, 30) && d > 120 && (d < 450 || speed > 100)) return { type: 'walk', x, z, speed, pose: 'walk' };
    }
    return { type: 'walk', x: rand(area.x0, area.x1), z: area.z0 + 20, speed, pose: 'walk' };
  }

  // Walk up to an object and brush along one of its sides, maybe back again.
  function rubPlan() {
    const cands = boxes.filter((b) => b.rub);
    if (!cands.length) return null;
    const b = pick(cands);
    const side = Math.floor(Math.random() * 4);
    const along = side < 2 ? [b.x0, b.x1] : [b.z0, b.z1];
    const len = Math.min(70, along[1] - along[0]);
    if (len < 25) return null;
    const a0 = rand(along[0], along[1] - len);
    const off = 11;
    const fixed = [b.z0 - off, b.z1 + off, b.x0 - off, b.x1 + off][side];
    const at = (a) => (side < 2 ? [a, fixed] : [fixed, a]);
    const [p0, p1] = Math.random() < 0.5 ? [at(a0), at(a0 + len)] : [at(a0 + len), at(a0)];
    if (!clearOf(...p0, 4) || !clearOf(...p1, 4)) return null;
    const plan = [
      { type: 'walk', x: p0[0], z: p0[1], speed: 55, pose: 'walk', box: b },
      { type: 'walk', x: p1[0], z: p1[1], speed: 17, pose: 'rub', box: b, rub: true },
    ];
    if (Math.random() < 0.5) plan.push({ type: 'walk', x: p0[0], z: p0[1], speed: 17, pose: 'rub', box: b, rub: true });
    plan.push({ type: 'hold', pose: 'sit', time: rand(2, 4), look: true });
    return plan;
  }

  function decide() {
    const r = Math.random();
    if (r < 0.22) steps = [{ type: 'hold', pose: 'sit', time: rand(3, 7), look: true }];
    else if (r < 0.36) steps = [{ type: 'hold', pose: 'loaf', time: rand(4, 9), look: true }];
    else if (r < 0.56) {
      // lie down, roll onto the back, stretch and wriggle, and back again
      steps = [
        { type: 'hold', pose: 'loaf', time: 1.2 },
        { type: 'hold', pose: 'side', time: 0.9 },
        { type: 'hold', pose: 'back', time: rand(3.5, 7) },
        { type: 'hold', pose: 'side', time: 0.8 },
        { type: 'hold', pose: 'loaf', time: 1 },
      ];
    } else if (r < 0.82) steps = rubPlan() ?? [wanderTo()];
    else steps = [];
    steps.push(wanderTo());
  }

  function nextStep() {
    if (!steps.length) decide();
    step = steps.shift();
    step.left = step.time;
    stuck = { t: 0, d: Infinity };
  }

  // Desired direction towards the goal, pushed away from (and around) nearby boxes.
  function steer(tx, tz, own) {
    let dx = tx - pos.x;
    let dz = tz - pos.z;
    const d0 = Math.hypot(dx, dz) || 1;
    dx /= d0;
    dz /= d0;
    let ax = 0;
    let az = 0;
    for (const b of boxes) {
      // the object it heads for or rubs against only counts through pushOut
      if (same(b, own)) continue;
      const e = 14;
      const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
      let nx = pos.x - cx;
      let nz = pos.z - cz;
      const d = Math.hypot(nx, nz) || 0.01;
      const R = e + 35;
      if (d > R) continue;
      nx /= d;
      nz /= d;
      const w = (R - d) / R;
      // slide along the obstacle in the direction closer to the goal
      let txv = -nz;
      let tzv = nx;
      if (txv * dx + tzv * dz < 0) {
        txv = -txv;
        tzv = -tzv;
      }
      ax += nx * w * 1.6 + txv * w * 1.2;
      az += nz * w * 1.6 + tzv * w * 1.2;
    }
    const x = dx + ax;
    const z = dz + az;
    const n = Math.hypot(x, z) || 1;
    return [x / n, z / n, d0];
  }

  // Hard limit: never end up inside an obstacle.
  function pushOut(own) {
    for (const b of boxes) {
      const e = same(b, own) ? 3 : 7;
      if (pos.x < b.x0 - e || pos.x > b.x1 + e || pos.z < b.z0 - e || pos.z > b.z1 + e) continue;
      const opts = [[b.x0 - e - pos.x, 0], [b.x1 + e - pos.x, 0], [0, b.z0 - e - pos.z], [0, b.z1 + e - pos.z]];
      const [mx, mz] = opts.reduce((a, o) => (Math.abs(o[0] + o[1]) < Math.abs(a[0] + a[1]) ? o : a));
      pos.x += mx;
      pos.z += mz;
    }
  }

  function update(dt, t, camera) {
    boxesAge += dt;
    if (boxesAge > 0.4) {
      boxes = getObstacles();
      boxesAge = 0;
    }
    if (!step) nextStep();

    let moving = false;
    let speed = 0;
    let lean = 0;
    let headYaw = 0;
    let look = false;
    if (step.type === 'hold') {
      step.left -= dt;
      look = !!step.look;
      if (step.left <= 0) nextStep();
    } else {
      const [dx, dz, dist] = steer(step.x, step.z, step.box);
      if (dist < (step.rub ? 6 : 18)) {
        nextStep();
      } else {
        const want = Math.atan2(-dz, dx);
        const diff = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
        heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
        speed = step.speed * (0.35 + 0.65 * Math.max(0, Math.cos(Math.min(Math.abs(diff), Math.PI / 2))));
        pos.x += Math.cos(heading) * speed * dt;
        pos.z -= Math.sin(heading) * speed * dt;
        pushOut(step.box);
        moving = true;
        // give up on goals it cannot reach
        stuck.t += dt;
        if (stuck.t > 2.5) {
          if (dist > stuck.d - 10) nextStep();
          stuck = { t: 0, d: dist };
        }
        if (step.rub) {
          // lean into the object, head turned to it
          const b = step.box;
          const cx = Math.max(b.x0, Math.min(pos.x, b.x1)) - pos.x;
          const cz = Math.max(b.z0, Math.min(pos.z, b.z1)) - pos.z;
          const right = cx * Math.sin(heading) + cz * Math.cos(heading) > 0 ? 1 : -1;
          lean = right * 0.22;
          headYaw = -right * 0.55;
        }
      }
    }
    cat.root.rotation.y = heading;

    // blend towards the pose of the current step
    const target = { ...POSES[step.pose ?? 'walk'] };
    if (!moving && step.type === 'walk') Object.assign(target, POSES.stand);
    target.roll += lean;
    target.hy += headYaw;
    target.hr += lean * 1.5;
    if (step.pose === 'back') {
      // wriggle on the back
      target.roll += Math.sin(t * 1.7) * 0.3;
      target.hA += Math.sin(t * 1.7) * 0.25;
      target.hr += Math.sin(t * 0.9) * 0.4;
    }
    if (look && step.pose !== 'back') {
      const local = cat.root.worldToLocal(camera.position.clone());
      target.hy += Math.max(-1.1, Math.min(1.1, Math.atan2(-local.z, local.x - 30)));
      target.hp += Math.max(-0.4, Math.min(0.5, Math.atan2(local.y - 30, Math.hypot(local.x, local.z)) * 0.6));
    }
    const k = 1 - Math.exp(-dt * (step.speed > 100 ? 12 : 5));
    const kRoll = 1 - Math.exp(-dt * 3.5);
    for (const key of KEYS) cur[key] += (target[key] - cur[key]) * (key === 'roll' ? kRoll : k);

    // gait on top of the pose: lateral sequence walk, diagonal legs half a step apart
    gait += ((moving ? 1 : 0) - gait) * (1 - Math.exp(-dt * 6));
    phase += speed * dt * ((2 * Math.PI) / (speed > 100 ? 42 : 30));
    const amp = gait * Math.min(1.1, Math.max(0.35, speed / 55)) * 0.42;
    const leg = (o) => [Math.sin(phase + o) * amp, Math.max(0, Math.cos(phase + o)) * gait];
    cat.front.forEach((f, i) => {
      const [s, lift] = leg(i ? 1.5 * Math.PI : 0.5 * Math.PI);
      const knead = step.pose === 'back' ? Math.sin(t * 4.5 + i * Math.PI) * 0.35 : 0;
      f.shoulder.rotation.z = cur.fA + s + knead;
      f.elbow.rotation.z = cur.fB - lift * 1.1 - Math.max(0, knead);
    });
    cat.hind.forEach((h, i) => {
      const [s, lift] = leg(i ? Math.PI : 0);
      h.hip.rotation.z = cur.hA + s;
      h.knee.rotation.z = cur.hB - lift * 0.7;
      h.ankle.rotation.z = cur.hC + lift * 0.5;
    });

    hop = Math.max(0, hop - dt);
    const jump = hop > 0 ? Math.sin((1 - hop / 0.45) * Math.PI) * 18 : 0;
    cat.body.position.y = cur.y + gait * (Math.abs(Math.cos(phase)) * 0.7 - 0.35) + jump;
    cat.body.rotation.set(cur.roll + gait * Math.sin(phase) * 0.035, 0, cur.pitch);

    // the neck leans forward; the head stays level unless the pose tilts it
    cat.neck.rotation.z = -0.75 + cur.neck;
    cat.head.rotation.set(cur.hr, cur.hy, 0.75 - cur.neck - cur.pitch * 0.8 + cur.hp);

    // tail: base angle and curl from the pose, a travelling sway on top
    const sway = moving ? 0.1 : 0.07;
    const freq = moving ? 2.4 : 1.1;
    cat.tail.forEach((s, i) => {
      s.rotation.z = i === 0 ? cur.tBase : cur.tCurl + (i >= 8 ? cur.tTip : 0);
      s.rotation.x = cur.tYaw + Math.sin(t * freq - i * 0.55) * sway * (0.4 + i / 11);
    });
  }

  function hit(raycaster) {
    return raycaster.intersectObject(cat.root, true)[0] ?? null;
  }

  // poked: jumps up (from lying too) and runs off
  function poke() {
    hop = 0.45;
    steps = [];
    step = { ...wanderTo(160), left: 0 };
    stuck = { t: 0, d: Infinity };
  }

  // for debugging from the console: cat.play([{ type: 'hold', pose: 'back', time: 5 }])
  function play(plan) {
    steps = plan.map((p) => ({ ...p }));
    step = null;
  }

  return { group: cat.root, setArea, update, hit, poke, play, state: () => step };
}
