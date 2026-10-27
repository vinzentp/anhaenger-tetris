// The trailer (modelled after the Stedele flatbed with tarp frame from the photo) and the yard around it.
// World units are cm. The loading area spans (0, BED, 0) to (L, BED + H, W).
import * as THREE from 'three';
import * as TX from './textures.js';

export const BED = 58;      // loading floor above ground
const BOARD = 35;           // side board height
const T = 3;                // board thickness
const WHEEL_R = 27;

const mat = {
  board: new THREE.MeshStandardMaterial({ color: 0xc3c9ce, metalness: 0.7, roughness: 0.35 }),
  galv: new THREE.MeshStandardMaterial({ color: 0x8f959a, metalness: 0.7, roughness: 0.45 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.6 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.6, roughness: 0.3 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc8261e, emissive: 0x400000, roughness: 0.4 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0x401800, roughness: 0.4 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xf2d21b, roughness: 0.5 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb59a3c, metalness: 0.7, roughness: 0.35 }),
  tarp: new THREE.MeshPhysicalMaterial({
    color: 0x1f52c9, roughness: 0.45, clearcoat: 0.4, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false,
  }),
};

function bm(x0, y0, z0, x1, y1, z1, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function beam(from, to, thick, m) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, a.distanceTo(b)), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(b);
  mesh.castShadow = true;
  return mesh;
}

function wheel(x, z, r, width) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 32), mat.tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, width + 0.6, 24), mat.rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.18, width + 2, 12), mat.galv);
  for (const m of [tire, rim, hub]) {
    m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    g.add(m);
  }
  g.position.set(x, r, z);
  return g;
}

const ribs = TX.aluBoard();
ribs.repeat.set(1, 4);
mat.board.map = ribs;
mat.board.bumpMap = ribs;
mat.board.bumpScale = 2;

export function buildTrailer({ L, W, H }) {
  const g = new THREE.Group();
  const floorTex = TX.phenolic().clone();
  floorTex.repeat.set(L / 45, W / 45);
  mat.floor.map?.dispose();
  mat.floor.map = floorTex;
  mat.floor.needsUpdate = true;
  const tarp = new THREE.Group();
  const bh = Math.min(BOARD, H);

  // floor and side boards
  g.add(bm(0, BED - 4, 0, L, BED, W, mat.floor));
  g.add(bm(-T, BED - 8, -T, L + T, BED + bh, 0, mat.board));
  g.add(bm(-T, BED - 8, W, L + T, BED + bh, W + T, mat.board));
  g.add(bm(-T, BED - 8, 0, 0, BED + bh, W, mat.board));
  g.add(bm(L, BED - 8, 0, L + T, BED + bh, W, mat.board));

  // profile grooves and board locks
  for (const f of [0.33, 0.66]) {
    const y = BED - 8 + (bh + 8) * f;
    g.add(bm(-T, y - 0.4, -T - 0.3, L + T, y + 0.4, -T, mat.galv));
    g.add(bm(-T, y - 0.4, W + T, L + T, y + 0.4, W + T + 0.3, mat.galv));
    g.add(bm(L + T, y - 0.4, 0, L + T + 0.3, y + 0.4, W, mat.galv));
  }
  const locks = Math.max(2, Math.round(L / 50));
  for (let i = 0; i < locks; i++) {
    const x = ((i + 0.5) / locks) * L;
    g.add(bm(x - 2.5, BED + bh * 0.55, W + T, x + 2.5, BED + bh * 0.75, W + T + 1, mat.dark));
    g.add(bm(x - 2.5, BED + bh * 0.55, -T - 1, x + 2.5, BED + bh * 0.75, -T, mat.dark));
  }
  for (const z of [W * 0.25, W * 0.75]) {
    g.add(bm(L + T, BED + bh * 0.55, z - 2.5, L + T + 1, BED + bh * 0.75, z + 2.5, mat.dark));
  }

  // chassis
  for (const z of [W * 0.2, W * 0.8]) g.add(bm(-15, BED - 18, z - 4, L - 5, BED - 8, z + 4, mat.galv));
  for (let x = 20; x < L; x += 60) g.add(bm(x - 2, BED - 14, 4, x + 2, BED - 8, W - 4, mat.galv));

  // axle and wheels (under the bed, like the photo)
  const ax = L * 0.52;
  g.add(bm(ax - 3, WHEEL_R - 3, 6, ax + 3, WHEEL_R + 3, W - 6, mat.galv));
  for (const z of [10, W - 10]) g.add(wheel(ax, z, WHEEL_R, 17));
  for (const z of [W * 0.2, W * 0.8]) g.add(beam([ax, WHEEL_R, z], [ax, BED - 18, z], 6, mat.galv));

  // drawbar, coupling and jockey wheel
  const tip = [-125, 46, W / 2];
  g.add(beam([0, BED - 13, W * 0.2], tip, 7, mat.galv));
  g.add(beam([0, BED - 13, W * 0.8], tip, 7, mat.galv));
  g.add(bm(-150, 40, W / 2 - 5, -122, 52, W / 2 + 5, mat.brass));
  g.add(bm(-152, 42, W / 2 - 4, -148, 50, W / 2 + 4, mat.dark));
  const jx = -65, jz = W / 2 + 13;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, BED - 6, 12), mat.galv);
  tube.position.set(jx, (BED - 6) / 2 + 12, jz);
  tube.castShadow = true;
  g.add(tube);
  g.add(wheel(jx, jz, 9, 6));

  // rear lights and side reflectors
  for (const z of [8, W - 22]) {
    g.add(bm(L + T, BED - 16, z, L + T + 4, BED - 8, z + 14, mat.red));
    g.add(bm(L + T, BED - 16, z, L + T + 4.2, BED - 12, z + 5, mat.orange));
  }
  for (const x of [L * 0.12, L * 0.93]) {
    g.add(bm(x - 3, BED - 6, W + T, x + 3, BED - 2, W + T + 0.8, mat.orange));
    g.add(bm(x - 3, BED - 6, -T - 0.8, x + 3, BED - 2, -T, mat.orange));
  }
  // manufacturer sticker (plain, no lettering)
  const sx = L * 0.7;
  g.add(bm(sx - 22, BED + 2, W + T, sx + 22, BED + 14, W + T + 0.4, mat.yellow));
  for (let i = 0; i < 3; i++) g.add(bm(sx + 10 + i * 4, BED + 3, W + T + 0.4, sx + 12 + i * 4, BED + 13, W + T + 0.6, mat.dark));
  g.add(bm(sx - 20, BED + 4, W + T + 0.4, sx + 6, BED + 12, W + T + 0.6, mat.dark));

  // tarp frame: posts, bows and top rails, slightly outside the loading space
  const postXs = [-2, L + 2];
  for (let n = Math.round(L / 125), i = 1; i < n; i++) postXs.push((i / n) * L);
  for (const x of postXs) {
    g.add(bm(x - 2, BED + bh - 10, -T - 4, x + 2, BED + H + 4, -T, mat.galv));
    g.add(bm(x - 2, BED + bh - 10, W + T, x + 2, BED + H + 4, W + T + 4, mat.galv));
    g.add(bm(x - 2, BED + H, -T - 4, x + 2, BED + H + 4, W + T + 4, mat.galv));
  }
  g.add(bm(-4, BED + H, -T - 4, L + 4, BED + H + 4, -T, mat.galv));
  g.add(bm(-4, BED + H, W + T, L + 4, BED + H + 4, W + T + 4, mat.galv));

  // tarp: roof, front and far side; the near side and the rear stay open for loading.
  // Each panel has its own material and knows which way it faces, so it can fade out when the
  // camera looks at the load through it.
  const panels = [
    [[-8, BED + H + 4, -T - 8, L + 8, BED + H + 5, W + T + 8], [0, 1, 0]],
    [[-T - 8, BED + bh, -T - 8, -T - 7, BED + H + 5, W + T + 8], [-1, 0, 0]],
    [[-8, BED + bh, -T - 9, L + 8, BED + H + 5, -T - 8], [0, 0, -1]],
  ];
  for (const [box, normal] of panels) {
    const m = bm(...box, mat.tarp.clone());
    m.castShadow = false;
    m.renderOrder = 2;
    m.userData.normal = new THREE.Vector3(...normal);
    m.userData.opacity = mat.tarp.opacity;
    m.userData.fade = 1;
    tarp.add(m);
  }
  g.add(tarp);

  // loading space outline and floor grid (10 cm)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
  );
  edges.position.set(L / 2, BED + H / 2, W / 2);
  g.add(edges);
  const pts = [];
  for (let x = 10; x < L; x += 10) pts.push(x, BED + 0.1, 0, x, BED + 0.1, W);
  for (let z = 10; z < W; z += 10) pts.push(0, BED + 0.1, z, L, BED + 0.1, z);
  const grid = new THREE.BufferGeometry();
  grid.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })));

  return { group: g, tarp };
}

function blob(r, color, seed) {
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + 0.18 * Math.sin(i * 12.9898 + seed * 78.233);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

// A bush of a few lumpy spheres, optionally with flowers on top.
function bush(x, z, size, flowers = null, seed = 1) {
  const g = new THREE.Group();
  const greens = [0x4f7d32, 0x5f8f3a, 0x3f6a2a, 0x6d9a44];
  for (let i = 0; i < 6; i++) {
    const a = seed * 3 + i * 2.1;
    const r = size * (0.45 + 0.25 * Math.abs(Math.sin(a * 1.7)));
    const b = blob(r, greens[i % greens.length], seed + i);
    b.position.set(Math.cos(a) * size * 0.45, r * 0.8 + (i % 2) * size * 0.25, Math.sin(a) * size * 0.45);
    g.add(b);
  }
  if (flowers) {
    const fm = new THREE.MeshStandardMaterial({ color: flowers, roughness: 0.7 });
    const geo = new THREE.SphereGeometry(2.6, 6, 4);
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996;
      const rr = size * 0.75 * Math.sqrt((i + 0.5) / 40);
      const f = new THREE.Mesh(geo, fm);
      f.position.set(Math.cos(a) * rr, size * 1.05 - (rr / size) * size * 0.45, Math.sin(a) * rr);
      g.add(f);
    }
  }
  g.position.set(x, 0, z);
  return g;
}

// Cobblestone yard with a garage and barn like in the photo.
export function buildYard() {
  const g = new THREE.Group();

  const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), TX.skyMaterial());
  sky.renderOrder = -1;
  g.add(sky);

  const cob = TX.cobble();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ map: cob.map, bumpMap: cob.bump, bumpScale: 3, roughness: 0.92 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  // every building gets its own materials, so it can fade out alone when it blocks the view
  const plankTex = TX.planks();
  plankTex.repeat.set(6, 1);
  const tileTex = TX.roofTiles();
  tileTex.repeat.set(14, 4);
  const roofMat = () => new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.8 });

  // garage row behind the trailer, with an open gate
  const garage = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3d2416, roughness: 0.9 });
  const gutter = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.7, roughness: 0.4 });
  const z0 = -420;
  garage.add(bm(-600, 0, z0 - 20, 900, 250, z0, wood));
  garage.add(bm(-40, 0, z0 - 1, 260, 215, z0 + 1, darkWood));
  for (const x of [-45, 260]) garage.add(bm(x - 6, 0, z0, x + 6, 220, z0 + 6, darkWood));
  const r = bm(-660, -8, -50, 960, 8, 270, roofMat());
  r.rotation.x = 0.33;
  r.position.set(150, 300, z0 + 20);
  garage.add(r);
  const gut = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1620, 12), gutter);
  gut.rotation.z = Math.PI / 2;
  gut.position.set(150, 250, z0 + 150);
  garage.add(gut);
  g.add(garage);

  // barn on the right with greenery
  const barn = new THREE.Group();
  const barnWood = new THREE.MeshStandardMaterial({ map: TX.planks(), roughness: 0.9 });
  barn.add(bm(780, 0, -400, 820, 330, 520, barnWood));
  const br = bm(-40, -8, -460, 220, 8, 1000, roofMat());
  br.rotation.z = -0.35;
  br.position.set(760, 390, 60);
  barn.add(br);
  g.add(barn);
  g.userData.buildings = [garage, barn];

  g.add(bush(700, 380, 70, null, 1));
  g.add(bush(735, 200, 90, null, 2));
  g.add(bush(720, -40, 75, null, 3));
  g.add(bush(560, 520, 45, 0xd8436e, 4));
  g.add(bush(640, 560, 38, 0xe0587d, 5));
  g.add(bush(-420, -340, 60, null, 6));
  return g;
}
