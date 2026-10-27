import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARTON, CATALOG, MATERIALS } from './furniture.js';
import * as P from './physics.js';
import { BED, buildTrailer, buildYard } from './scene.js';
import * as TX from './textures.js';
import * as FX from './effects.js';
import { createCat } from './cat.js';

const STEP = 5;
const HOVER = 14;
const SAVE_KEY = 'anhaenger-tetris-v3';
const DEFAULT_TRAILER = { L: 250, W: 150, H: 140 };
const $ = (s) => document.querySelector(s);

// ---------- three.js setup

const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8dccb);
scene.fog = new THREE.Fog(0xe8dccb, 1600, 4200);
const pmrem = new THREE.PMREMGenerator(renderer);
// reflections only for metal parts, everything else is lit by sun and sky
const envMap = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(45, 1, 5, 8000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 120;
controls.maxDistance = 1600;

// low evening sun from the side, like in the photo
scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x7a6a58, 0.7));
const sun = new THREE.DirectionalLight(0xffdcae, 3.2);
sun.position.set(-600, 520, 480);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -650, right: 650, top: 650, bottom: -650, near: 10, far: 2600 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
const yard = buildYard();
scene.add(yard);
// Buildings fade out while the camera is inside one or one stands between camera and trailer.
const occluders = yard.userData.buildings.map((group) => {
  group.updateMatrixWorld(true);
  const mats = new Set();
  group.traverse((o) => o.material && mats.add(o.material));
  return { group, box: new THREE.Box3().setFromObject(group).expandByScalar(20), mats: [...mats], fade: 1 };
});
const cat = createCat(scene, catObstacles);
const viewRay = new THREE.Ray();
const rayHit = new THREE.Vector3();

// Tarp panels the camera looks through from outside fade out, so the load stays in view.
const toCam = new THREE.Vector3();
function fadeTarp(dt) {
  const k = 1 - Math.pow(0.002, dt);
  for (const m of trailerObj.tarp.children) {
    const u = m.userData;
    const blocks = toCam.copy(camera.position).sub(m.position).dot(u.normal) > 0;
    u.fade += ((blocks ? 0 : 1) - u.fade) * k;
    if (Math.abs(u.fade - (blocks ? 0 : 1)) < 0.01) u.fade = blocks ? 0 : 1;
    m.material.opacity = u.opacity * u.fade;
    m.visible = u.fade > 0;
  }
}

function fadeOccluders(dt) {
  const toTarget = camera.position.distanceTo(controls.target);
  viewRay.set(camera.position, controls.target.clone().sub(camera.position).normalize());
  const k = 1 - Math.pow(0.002, dt);
  for (const o of occluders) {
    const blocks = o.box.containsPoint(camera.position) ||
      (viewRay.intersectBox(o.box, rayHit) && rayHit.distanceTo(camera.position) < toTarget);
    o.fade += ((blocks ? 0 : 1) - o.fade) * k;
    if (Math.abs(o.fade - (blocks ? 0 : 1)) < 0.01) o.fade = blocks ? 0 : 1;
    o.group.visible = o.fade > 0;
    for (const m of o.mats) {
      const see = o.fade < 1;
      if (m.transparent !== see) {
        m.transparent = see;
        m.needsUpdate = true;
      }
      m.opacity = o.fade;
      m.depthWrite = o.fade > 0.5;
    }
  }
}
FX.init(scene);
let hovered = null;
// While the solution plays, every piece is briefly in the hand: user input would move or drop it.
let playing = false;

// ---------- state

let trailer = { ...DEFAULT_TRAILER };
let trailerObj = null;
let tarpVisible = true;
let active = null;
let history = [];
let placedBoxes = [];
let wonShown = false;
// Snapshot from when the piece in hand was taken out of the trailer, so "Zurück" can undo a misclick.
let taken = null;

// Furniture from the catalog is always there; moving boxes come and go (fetched from the stack, gone
// again when put back), so items are looked up by uid.
const items = [];
let nextUid = 0;
const byUid = (uid) => items.find((it) => it.uid === uid);
const isCarton = (it) => it.def === CARTON;
const furniture = () => items.filter((it) => !isCarton(it));

// ---------- meshes

function makeMaterial(name) {
  const m = new THREE.MeshStandardMaterial({ ...MATERIALS[name] });
  if (name === 'wood') m.map = TX.woodGrain();
  else if (name === 'carton') m.map = TX.cardboard();
  else if (name === 'mattress') {
    m.bumpMap = TX.quilt();
    m.bumpScale = 3;
  } else {
    m.bumpMap = TX.fabric().bump;
    m.bumpScale = 0.6;
  }
  return m;
}

function buildMesh(item) {
  const g = new THREE.Group();
  const mats = {};
  for (const bx of item.def.boxes) {
    const size = [0, 1, 2].map((i) => bx.max[i] - bx.min[i]);
    const r = Math.max(0.01, Math.min(bx.r ?? 2, Math.min(...size) / 2 - 0.05));
    mats[bx.mat] ??= makeMaterial(bx.mat);
    // cushions are drawn a little smaller, so the seams between them show
    const inset = bx.mat === 'cushion' ? 0.8 : 0;
    const vs = size.map((v) => Math.max(0.5, v - inset));
    const m = new THREE.Mesh(new RoundedBoxGeometry(vs[0], vs[1], vs[2], 4, Math.min(r, Math.min(...vs) / 2 - 0.05)), mats[bx.mat]);
    m.position.set((bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2);
    m.castShadow = m.receiveShadow = true;
    m.userData.uid = item.uid;
    g.add(m);
  }
  g.userData.mats = Object.values(mats);
  scene.add(g);
  return g;
}

function createItem(def) {
  const it = {
    uid: nextUid++, def, R: P.IDENT, shape: P.orient(def.boxes, P.IDENT),
    placed: false, x: 0, y: 0, z: 0, landY: 0, problem: null,
    mesh: null, target: new THREE.Vector3(), targetQ: new THREE.Quaternion(),
  };
  items.push(it);
  it.mesh = buildMesh(it);
  return it;
}

function removeItem(it) {
  scene.remove(it.mesh);
  it.mesh.traverse((o) => o.geometry?.dispose());
  for (const m of it.mesh.userData.mats) m.dispose();
  items.splice(items.indexOf(it), 1);
  if (hovered === it) hovered = null;
}

for (const def of CATALOG) createItem(def);

// Endless supply of moving boxes: a pallet stack beside the trailer, a click takes a new box from it.
const [CW, CH, CD] = P.orient(CARTON.boxes, P.IDENT).size;
const PALLET = { L: 120, W: 80, H: 14 };
const stack = new THREE.Group();
{
  const wood = makeMaterial('wood');
  const board = (x0, y0, z0, x1, y1, z1) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 2, 0.6), wood);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    stack.add(m);
  };
  for (const z of [0, PALLET.W / 2 - 5, PALLET.W - 10]) board(0, 0, z, PALLET.L, PALLET.H - 2, z + 10);
  for (let x = 0; x < PALLET.L; x += 20) board(x, PALLET.H - 2, 0, x + 14, PALLET.H, PALLET.W);
  const card = makeMaterial('carton');
  const geo = new RoundedBoxGeometry(CW - 0.6, CH - 0.6, CD - 0.6, 3, 0.8);
  // slightly uneven, like a real stack; the top layer is one box short
  const jitter = [[1, -1, 2], [-2, 1, -1], [1, 2, 0], [-1, 0, 1]];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < (layer === 2 ? 3 : 4); i++) {
      const [dx, dz, rot] = jitter[(i + layer) % 4];
      const m = new THREE.Mesh(geo, card);
      m.position.set((i % 2) * CW + CW / 2 + dx, PALLET.H + layer * CH + CH / 2, Math.floor(i / 2) * (PALLET.W - CD) + CD / 2 + dz);
      m.rotation.y = (rot * Math.PI) / 180;
      m.castShadow = m.receiveShadow = true;
      stack.add(m);
    }
  }
  // floating sign so the stack reads as a button
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 112;
  const g = c.getContext('2d');
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(31, 79, 192, 0.92)';
    g.beginPath();
    g.roundRect(6, 6, 308, 100, 50);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '800 52px Nunito, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('+ Karton', 160, 58);
  };
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // redraw once the web font is there
  document.fonts?.load('800 52px Nunito').then(() => {
    draw();
    tex.needsUpdate = true;
  });
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sign.scale.set(64, 22.4, 1);
  sign.position.set(PALLET.L / 2, PALLET.H + 3 * CH + 34, PALLET.W / 2);
  stack.add(sign);
  stack.userData.sign = sign;
}
scene.add(stack);
let stackHover = false;

// What the cat walks around (and may rub against): trailer, drawbar, stack, walls, pieces in the yard.
function catObstacles() {
  const { L, W } = trailer;
  const s = stack.position;
  const list = [
    { x0: -2, x1: L + 8, z0: -4, z1: W + 4, rub: false },
    { x0: -152, x1: 0, z0: W * 0.2, z1: W * 0.8, rub: false },
    { x0: s.x, x1: s.x + PALLET.L, z0: s.z, z1: s.z + PALLET.W, rub: true },
    { x0: -600, x1: 900, z0: -442, z1: -418, rub: true },
    { x0: 778, x1: 822, z0: -400, z1: 520, rub: true },
  ];
  const bb = new THREE.Box3();
  for (const it of items) {
    if (it.placed || it === active) continue;
    bb.setFromObject(it.mesh);
    list.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, rub: true });
  }
  return list;
}

function placeStack() {
  stack.position.set(trailer.L + 70, 0, trailer.W / 2 - PALLET.W / 2);
}

function setHighlight(item, on) {
  for (const m of item.mesh.userData.mats) {
    m.emissive.setHex(on ? 0x2a4f7a : 0x000000);
    m.emissiveIntensity = on ? 0.45 : 0;
  }
}

const ghost = new THREE.Group();
ghost.renderOrder = 3;
scene.add(ghost);
const ghostFill = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false });
const ghostLine = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });

function rebuildGhost() {
  for (const c of [...ghost.children]) {
    c.geometry.dispose();
    ghost.remove(c);
  }
  if (!active) return;
  for (const bx of active.shape.boxes) {
    const size = [0, 1, 2].map((i) => bx.max[i] - bx.min[i]);
    const geo = new THREE.BoxGeometry(...size);
    const fill = new THREE.Mesh(geo, ghostFill);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), ghostLine);
    for (const m of [fill, line]) {
      m.position.set((bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2);
      ghost.add(m);
    }
  }
}

// Places the mesh so the shape's bounding box starts at the given world corner.
function setPose(item, cx, cy, cz) {
  const R = item.R;
  const m4 = new THREE.Matrix4().set(
    R[0][0], R[0][1], R[0][2], 0,
    R[1][0], R[1][1], R[1][2], 0,
    R[2][0], R[2][1], R[2][2], 0,
    0, 0, 0, 1,
  );
  item.targetQ.setFromRotationMatrix(m4);
  const o = item.shape.offset;
  item.target.set(cx - o[0], cy - o[1], cz - o[2]);
}

// Pieces that are not loaded lie in rows in front of the trailer.
function layoutYard() {
  const rest = items.filter((it) => !it.placed && it !== active);
  const gap = 40;
  const maxRow = Math.max(trailer.L + 260, 560);
  const rows = [[]];
  let width = 0;
  for (const it of rest) {
    const w = it.shape.size[0];
    if (rows.at(-1).length && width + gap + w > maxRow) {
      rows.push([]);
      width = 0;
    }
    width += (rows.at(-1).length ? gap : 0) + w;
    rows.at(-1).push(it);
  }
  let z = trailer.W + 90;
  for (const row of rows) {
    const total = row.reduce((s, it) => s + it.shape.size[0], 0) + gap * Math.max(0, row.length - 1);
    let x = trailer.L / 2 - total / 2;
    for (const it of row) {
      setPose(it, x, 0, z);
      x += it.shape.size[0] + gap;
    }
    z += Math.max(0, ...row.map((it) => it.shape.size[2])) + 50;
  }
}

function refreshPoses() {
  for (const it of items) if (it.placed) setPose(it, it.x, BED + it.y, it.z);
  layoutYard();
  if (active) setPose(active, active.x, BED + active.landY + HOVER, active.z);
}

// ---------- game logic

function recomputePlaced() {
  placedBoxes = items.filter((it) => it.placed).flatMap((it) => P.worldBoxes(it.shape, it.x, it.y, it.z));
}

function clampActive() {
  const [sx, , sz] = active.shape.size;
  active.x = Math.max(0, Math.min(active.x, trailer.L - sx));
  active.z = Math.max(0, Math.min(active.z, trailer.W - sz));
}

function problemOf(item) {
  const [sx, sy, sz] = item.shape.size;
  if (sx > trailer.L + P.EPS || sz > trailer.W + P.EPS) return 'So ist es zu groß für die Ladefläche. Drehen oder kippen!';
  const over = item.landY + sy - trailer.H;
  if (over > P.EPS) return `Zu hoch: ${Math.ceil(over)} cm über der Plane`;
  return null;
}

function updateActive() {
  if (!active) {
    ghost.visible = false;
    renderControls();
    return;
  }
  clampActive();
  active.landY = P.landingY(active.shape, active.x, active.z, placedBoxes);
  active.problem = problemOf(active);
  const color = active.problem ? 0xff3b30 : 0x34c759;
  ghostFill.color.setHex(color);
  ghostLine.color.setHex(color);
  ghost.visible = true;
  ghost.position.set(active.x, BED + active.landY, active.z);
  setPose(active, active.x, BED + active.landY + HOVER, active.z);
  renderControls();
}

function select(item) {
  if (active === item) return;
  if (active) putBack(false);
  taken = null;
  if (item.placed) {
    taken = {
      item, R: item.R, x: item.x, y: item.y, z: item.z,
      ys: items.filter((it) => it.placed).map((it) => [it, it.y]),
      history: history.slice(),
    };
    item.placed = false;
    history = history.filter((u) => u !== item.uid);
    settle();
  } else {
    item.x = Math.round((trailer.L - item.shape.size[0]) / 2);
    item.z = Math.round((trailer.W - item.shape.size[2]) / 2);
  }
  active = item;
  setHighlight(item, true);
  rebuildGhost();
  updateActive();
  refreshPoses();
  refreshUI();
}

// Puts the piece in hand back where it came from: into the trailer at its old spot (everything that
// slid down returns too) or into the yard.
function putBack(refresh = true) {
  if (!active) return;
  if (taken?.item !== active) {
    toYard(active, refresh);
    return;
  }
  const it = active;
  Object.assign(it, { R: taken.R, x: taken.x, y: taken.y, z: taken.z, placed: true });
  it.shape = P.orient(it.def.boxes, it.R);
  for (const [o, y] of taken.ys) o.y = y;
  history = taken.history;
  taken = null;
  setHighlight(it, false);
  active = null;
  recomputePlaced();
  if (refresh) {
    rebuildGhost();
    updateActive();
    refreshPoses();
    refreshUI();
    save();
  }
}

function toYard(item, refresh = true) {
  if (taken?.item === item) taken = null;
  if (isCarton(item)) {
    if (active === item) active = null;
    history = history.filter((u) => u !== item.uid);
    removeItem(item);
    if (refresh) {
      rebuildGhost();
      updateActive();
      refreshPoses();
      refreshUI();
      save();
    }
    return;
  }
  item.placed = false;
  item.R = P.IDENT;
  item.shape = P.orient(item.def.boxes, item.R);
  setHighlight(item, false);
  if (active === item) active = null;
  history = history.filter((u) => u !== item.uid);
  if (refresh) {
    rebuildGhost();
    updateActive();
    refreshPoses();
    refreshUI();
    save();
  }
}

// Pieces fall down again when something below them was taken out.
function settle() {
  const placed = items.filter((it) => it.placed).sort((a, b) => a.y - b.y);
  const boxes = [];
  for (const it of placed) {
    it.y = P.landingY(it.shape, it.x, it.z, boxes);
    boxes.push(...P.worldBoxes(it.shape, it.x, it.y, it.z));
  }
  placedBoxes = boxes;
}

function drop() {
  if (!active) return;
  if (active.problem) {
    toast(active.problem);
    shake();
    return;
  }
  const it = active;
  taken = null;
  it.y = it.landY;
  it.placed = true;
  history.push(it.uid);
  setHighlight(it, false);
  active = null;
  recomputePlaced();
  thud();
  const [sx, , sz] = it.shape.size;
  setTimeout(() => FX.dust(it.x, BED + it.y, it.z, it.x + sx, it.z + sz), 160);
  rebuildGhost();
  updateActive();
  refreshPoses();
  refreshUI();
  save();
  if (furniture().every((x) => x.placed) && !wonShown) setTimeout(showWin, 450);
}

// ---------- history: up to 25 steps back and forward again

const STEPS = 25;
const timeline = [];
let cursor = -1;
let restoring = false;

// Called with every save: a load that differs from the current step becomes a new step.
function record() {
  if (playing || restoring) return;
  const snap = JSON.stringify(snapshot());
  if (timeline[cursor] === snap) return;
  timeline.splice(cursor + 1);
  timeline.push(snap);
  if (timeline.length > STEPS + 1) timeline.shift();
  cursor = timeline.length - 1;
  renderControls();
}

function restore(data) {
  restoring = true;
  if (active) setHighlight(active, false);
  active = null;
  taken = null;
  for (const it of [...items]) {
    if (isCarton(it)) removeItem(it);
    else Object.assign(it, { placed: false, R: P.IDENT, shape: P.orient(it.def.boxes, P.IDENT) });
  }
  const t = data.trailer;
  if (t.L !== trailer.L || t.W !== trailer.W || t.H !== trailer.H) applyTrailer({ ...t });
  placeAll(data.placed);
  recomputePlaced();
  wonShown = furniture().every((it) => it.placed);
  rebuildGhost();
  updateActive();
  refreshPoses();
  refreshUI();
  save();
  restoring = false;
}

// Zurück: a piece in hand goes back where it came from first, otherwise one step back.
function stepBack() {
  if (playing) return;
  if (active) {
    putBack();
    return;
  }
  if (cursor <= 0) return;
  cursor--;
  restore(JSON.parse(timeline[cursor]));
}

function stepForward() {
  if (playing || cursor >= timeline.length - 1) return;
  if (active) putBack();
  cursor++;
  restore(JSON.parse(timeline[cursor]));
}

// Camera-relative axes on the floor, snapped to the trailer axes.
let lastF = null;
function camAxes() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  // a little hysteresis, so the mapping does not flip back and forth around 45 degrees
  const keep = lastF && (lastF[0] ? Math.abs(d.x) * 1.25 > Math.abs(d.z) && Math.sign(d.x) === lastF[0]
    : Math.abs(d.z) * 1.25 > Math.abs(d.x) && Math.sign(d.z) === lastF[1]);
  const f = keep ? lastF : Math.abs(d.x) > Math.abs(d.z) ? [Math.sign(d.x), 0] : [0, Math.sign(d.z)];
  lastF = f;
  return { f, r: [-f[1], f[0]] };
}

// ---------- arrow movement
// Tap: one step (5 cm, with Shift 1 cm), or up to the next edge if that comes first.
// Hold: after a short delay the piece glides and speeds up; it rests for a moment wherever it would sit
// flush against a wall or a loaded piece, so lining things up needs no fiddling. While arrows are
// held, their mapping to the trailer axes stays fixed even if the camera turns.
const DIRS = { up: [1, 0], down: [-1, 0], left: [0, -1], right: [0, 1] };
const DAS = 0.16;      // hold this long before gliding
const REST = 0.12;     // pause at a flush position
const held = new Map(); // direction -> pressed with Shift
let axesLock = null;
const glide = { x: { t: 0, rest: 0, acc: 0 }, z: { t: 0, rest: 0, acc: 0 } };

// World direction per axis (-1, 0, 1) from the arrows held right now.
function heldDirs() {
  const { f, r } = axesLock ?? camAxes();
  let x = 0;
  let z = 0;
  for (const d of held.keys()) {
    const [fwd, right] = DIRS[d];
    x += f[0] * fwd + r[0] * right;
    z += f[1] * fwd + r[1] * right;
  }
  return { x: Math.sign(x), z: Math.sign(z) };
}

// Positions along an axis where the piece's outline is flush with a wall or with an edge of a loaded box
// beside it. `contact` limits them to touching edges (for gliding), taps also stop where edges align.
function stopsOn(axis, contact) {
  const i = axis === 'x' ? 0 : 2;
  const j = axis === 'x' ? 2 : 0;
  const size = active.shape.size[i];
  const lim = (axis === 'x' ? trailer.L : trailer.W) - size;
  const o0 = axis === 'x' ? active.z : active.x;
  const o1 = o0 + active.shape.size[j];
  const out = [0, lim];
  for (const b of placedBoxes) {
    if (b.max[j] <= o0 + 0.5 || b.min[j] >= o1 - 0.5) continue;
    out.push(b.min[i] - size, b.max[i]);
    if (!contact) out.push(b.min[i], b.max[i] - size);
  }
  return out.map(Math.round).filter((v) => v >= 0 && v <= lim);
}

function nextStop(axis, dir, contact) {
  const pos = active[axis];
  let best = null;
  for (const v of stopsOn(axis, contact)) {
    if ((v - pos) * dir >= 1 && (best === null || Math.abs(v - pos) < Math.abs(best - pos))) best = v;
  }
  return best;
}

function wallOf(axis, dir) {
  return dir < 0 ? 0 : (axis === 'x' ? trailer.L : trailer.W) - active.shape.size[axis === 'x' ? 0 : 2];
}

// Moves the piece along one axis by up to `dist` cm; returns true when it stopped at an edge.
function slide(axis, dir, dist, snap, contact) {
  const pos = active[axis];
  const wall = wallOf(axis, dir);
  let to = dir > 0 ? Math.min(pos + dist, wall) : Math.max(pos - dist, wall);
  let stopped = to === wall;
  if (snap) {
    const s = nextStop(axis, dir, contact);
    if (s !== null && (s - to) * dir <= 0) {
      to = s;
      stopped = true;
    }
  }
  if (to === pos) return true;
  active[axis] = to;
  return stopped;
}

function press(dir, fine = false) {
  if (!active || playing || held.has(dir)) return;
  if (!held.size) axesLock = camAxes();
  held.set(dir, fine);
  const { f, r } = axesLock;
  const [fwd, right] = DIRS[dir];
  const axis = f[0] * fwd + r[0] * right ? 'x' : 'z';
  const sign = axis === 'x' ? f[0] * fwd + r[0] * right : f[1] * fwd + r[1] * right;
  Object.assign(glide[axis], { t: 0, rest: 0, acc: 0 });
  const atWall = active[axis] === wallOf(axis, sign);
  slide(axis, sign, fine ? 1 : STEP, !fine, false);
  if (atWall) bump();
  updateActive();
}

function release(dir) {
  held.delete(dir);
  if (!held.size) axesLock = null;
}

function releaseAll() {
  held.clear();
  axesLock = null;
}

// Called every frame: gliding while arrows are held.
function tickMove(dt) {
  if (!held.size) return;
  if (!active || playing) {
    releaseAll();
    return;
  }
  const dirs = heldDirs();
  const fine = [...held.values()].some(Boolean);
  let changed = false;
  for (const axis of ['x', 'z']) {
    const g = glide[axis];
    if (!dirs[axis]) continue;
    g.t += dt;
    if (g.t < DAS) continue;
    if (g.rest > 0) {
      g.rest -= dt;
      continue;
    }
    const speed = fine ? 18 : Math.min(240, 70 + (g.t - DAS) * 320);
    g.acc += speed * dt;
    const n = Math.floor(g.acc);
    if (n < 1) continue;
    g.acc -= n;
    const before = active[axis];
    if (slide(axis, dirs[axis], n, !fine, true) && !fine) {
      g.acc = 0;
      if (active[axis] !== before) {
        g.rest = REST;
        // after a rest it starts again a little slower
        g.t = Math.min(g.t, DAS + 0.15);
      }
    }
    changed ||= active[axis] !== before;
  }
  if (changed) updateActive();
}

function rotate(kind, sign = 1) {
  if (!active) return;
  const { f, r } = camAxes();
  let M;
  if (kind === 'yaw') M = P.axisRot('y', sign);
  else {
    const a = kind === 'tilt' ? r : f;
    M = a[0] ? P.axisRot('x', a[0] * sign) : P.axisRot('z', a[1] * sign);
  }
  const [ox, , oz] = active.shape.size;
  const cx = active.x + ox / 2;
  const cz = active.z + oz / 2;
  active.R = P.mul(M, active.R);
  active.shape = P.orient(active.def.boxes, active.R);
  active.x = Math.round(cx - active.shape.size[0] / 2);
  active.z = Math.round(cz - active.shape.size[2] / 2);
  rebuildGhost();
  updateActive();
}

function applyTrailer(dims) {
  trailer = dims;
  if (trailerObj) scene.remove(trailerObj.group);
  trailerObj = buildTrailer(trailer);
  trailerObj.tarp.visible = tarpVisible;
  trailerObj.group.traverse((o) => {
    if (o.material?.metalness > 0.3) o.material.envMap = envMap;
  });
  scene.add(trailerObj.group);
  placeStack();
  cat.setArea(trailer);

  // keep what still fits, the rest goes back to the yard
  const placed = items.filter((it) => it.placed).sort((a, b) => a.y - b.y);
  const boxes = [];
  for (const it of placed) {
    const [sx, sy, sz] = it.shape.size;
    const y = P.landingY(it.shape, it.x, it.z, boxes);
    if (it.x + sx > trailer.L + P.EPS || it.z + sz > trailer.W + P.EPS || y + sy > trailer.H + P.EPS) {
      toYard(it, false);
      continue;
    }
    it.y = y;
    boxes.push(...P.worldBoxes(it.shape, it.x, it.y, it.z));
  }
  placedBoxes = boxes;
  wonShown = furniture().every((x) => x.placed);
  updateActive();
  refreshPoses();
  refreshUI();
}

// ---------- persistence

function snapshot() {
  return {
    trailer: { ...trailer },
    // placed pieces in loading order, so taking out the last one still works after a reload
    placed: items.filter((it) => it.placed)
      .sort((a, b) => history.indexOf(a.uid) - history.indexOf(b.uid))
      .map(({ def, R, x, y, z }) => ({ id: def.id, R, x, y, z })),
  };
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()));
  } catch { /* storage unavailable */ }
  record();
}

function load() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch { /* ignore */ }
  if (!data) return { ...DEFAULT_TRAILER };
  placeAll(data.placed ?? []);
  return data.trailer ?? { ...DEFAULT_TRAILER };
}

function placeAll(placed) {
  history = [];
  for (const p of placed) {
    const it = p.id === CARTON.id ? createItem(CARTON) : items.find((x) => x.def.id === p.id && !x.placed);
    if (!it) continue;
    Object.assign(it, { R: p.R, x: p.x, y: p.y, z: p.z, placed: true });
    it.shape = P.orient(it.def.boxes, it.R);
    history.push(it.uid);
  }
}

// ---------- pointer input

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function castAt(e) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = items.flatMap((it) => it.mesh.children);
  return raycaster.intersectObjects(meshes, false).map((h) => ({ item: byUid(h.object.userData.uid), point: h.point }));
}

// True when the carton stack is in front of every piece under the pointer (uses the last castAt ray).
function hitsStack(hits) {
  const s = raycaster.intersectObject(stack, true)[0];
  if (!s) return false;
  const first = hits.find((h) => h.item !== active);
  return !first || s.distance < first.point.distanceTo(raycaster.ray.origin);
}

let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY };
  unlockAudio();
});
// The mouse (or a tap) only picks things up: a piece from the yard or the trailer (Zurück puts a
// misclicked one back), a box from the stack, the cat. Moving and dropping is done with the arrows.
canvas.addEventListener('pointermove', (e) => {
  if (playing) return;
  const hits = castAt(e);
  const yardHit = hits.find((h) => !h.item.placed && h.item !== active);
  hovered = e.pointerType === 'mouse' ? (yardHit?.item ?? null) : null;
  stackHover = e.pointerType === 'mouse' && hitsStack(hits);
  const catHover = e.pointerType === 'mouse' && !!cat.hit(raycaster);
  const pieceHover = hits.some((h) => h.item !== active);
  canvas.style.cursor = catHover || stackHover || pieceHover ? 'pointer' : '';
});
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
  down = null;
  if (moved || playing) return;
  const hits = castAt(e);
  if (cat.hit(raycaster)) {
    cat.poke();
    meow();
    return;
  }
  if (hitsStack(hits)) {
    fetchCarton();
    return;
  }
  const first = hits.find((h) => h.item !== active);
  if (first) select(first.item);
});

// ---------- keyboard

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };

// Tab: the next piece still in the yard into the hand.
function pickNext(dir) {
  const rest = furniture().filter((it) => !it.placed || it === active);
  if (!rest.length) return;
  const i = active ? rest.indexOf(active) : dir > 0 ? -1 : 0;
  select(rest[(i + dir + rest.length) % rest.length]);
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (!$('#ask-solve').hidden) {
    if (e.key === 'Escape') $('#ask-solve').hidden = true;
    return;
  }
  if (playing) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const arrow = ARROWS[k];
  if (arrow) {
    e.preventDefault();
    if (!e.repeat) press(arrow, e.shiftKey);
    return;
  }
  // everything else fires once per press, holding does not repeat
  const map = {
    q: () => rotate('yaw', 1), e: () => rotate('yaw', -1),
    r: () => rotate('tilt', 1), f: () => rotate('roll', 1),
    ' ': drop, Enter: drop,
    Escape: () => putBack(),
    Backspace: stepBack, z: stepBack, y: stepForward,
    Tab: () => pickNext(e.shiftKey ? -1 : 1),
    k: fetchCarton,
    o: takePhoto,
    p: toggleTarp,
  };
  const fn = map[k];
  if (!fn) return;
  e.preventDefault();
  if (!e.repeat) fn();
});
addEventListener('keyup', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (ARROWS[k]) release(ARROWS[k]);
});
// a lost focus would otherwise leave an arrow "held"
addEventListener('blur', releaseAll);
// clicked buttons give the focus back, so Space and Enter stay with the game
document.addEventListener('click', (e) => e.target.closest?.('button')?.blur());

// ---------- UI

function dims(it) {
  const [x, y, z] = P.orient(it.def.boxes, P.IDENT).size;
  return `${x} × ${z} × ${y} cm (L × T × H)`;
}

function refreshUI() {
  const list = $('#yard-list');
  list.innerHTML = '';
  let group = null;
  for (const it of furniture()) {
    if (it.def.group !== group) {
      group = it.def.group;
      const h = document.createElement('li');
      h.className = 'group';
      const n = furniture().filter((x) => x.def.group === group);
      h.textContent = `${group} (${n.filter((x) => x.placed).length}/${n.length})`;
      list.append(h);
    }
    const li = document.createElement('li');
    const btn = document.createElement('button');
    const state = it === active ? 'in der Hand' : it.placed ? 'geladen' : 'im Hof';
    btn.className = `item ${it === active ? 'is-active' : it.placed ? 'is-placed' : ''}`;
    btn.innerHTML = `<span class="name"></span><span class="meta"></span><span class="state"></span>`;
    btn.querySelector('.name').textContent = it.def.name;
    btn.querySelector('.meta').textContent = dims(it);
    btn.querySelector('.state').textContent = state;
    btn.onclick = () => {
      if (playing) return;
      select(it);
      if (matchMedia('(max-width: 767px)').matches) togglePanel(false);
    };
    li.append(btn);
    list.append(li);
  }

  // moving boxes: one row with the count and a button to fetch another one
  const cartons = items.filter((it) => isCarton(it) && it.placed).length;
  const li = document.createElement('li');
  li.className = 'carton-row';
  li.innerHTML = `<div><span class="name"></span><span class="meta"></span></div><button type="button" class="primary">+ Karton</button>`;
  li.querySelector('.name').textContent = `${CARTON.name}: ${cartons} geladen`;
  li.querySelector('.meta').textContent = dims({ def: CARTON });
  li.querySelector('button').disabled = playing;
  li.querySelector('button').onclick = () => {
    fetchCarton();
    if (matchMedia('(max-width: 767px)').matches) togglePanel(false);
  };
  list.append(li);

  const placed = items.filter((it) => it.placed);
  const furn = furniture();
  const loaded = furn.filter((it) => it.placed).length;
  const vol = P.volume(placed.flatMap((it) => it.shape.boxes));
  const top = Math.max(0, ...placed.map((it) => it.y + it.shape.size[1]));
  $('#st-items').textContent = `${loaded}/${furn.length} Möbel`;
  $('#st-cartons').textContent = `${cartons} Kartons`;
  $('#st-vol').textContent = `${Math.round((vol / (trailer.L * trailer.W * trailer.H)) * 100)} % voll`;
  $('#st-fill').style.width = `${(loaded / furn.length) * 100}%`;
  $('#st-h').textContent = `Höhe ${Math.round(top)}/${trailer.H} cm`;

  const form = $('#trailer-form');
  for (const k of ['L', 'W', 'H']) if (document.activeElement !== form[k]) form[k].value = trailer[k];
}

function renderControls() {
  const c = $('#controls');
  c.classList.toggle('is-idle', !active);
  $('#hint').textContent = playing
    ? 'Die Lösung wird eingeladen …'
    : active
      ? active.problem ?? `${active.def.name}: landet auf ${Math.round(active.landY)} cm`
      : furniture().every((it) => it.placed)
        ? 'Alle Möbel geladen. Passen noch Kartons rein?'
        : 'Teil im Hof anklicken oder Tab drücken.';
  $('#hint').classList.toggle('is-bad', !!active?.problem);
  $('#btn-drop').disabled = !active || !!active.problem;
  $('#controls').classList.toggle('is-playing', playing);
  $('#btn-back').disabled = playing || (!active && cursor <= 0);
  $('#btn-fwd').disabled = playing || cursor >= timeline.length - 1;
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

let shakeT = 0;
function shake() {
  shakeT = 0.35;
}

function toggleTarp() {
  tarpVisible = !tarpVisible;
  trailerObj.tarp.visible = tarpVisible;
  $('#btn-tarp').textContent = tarpVisible ? 'Plane ausblenden' : 'Plane einblenden';
}

// Saves the current 3D view as a PNG with a caption (on phones it opens the share sheet instead).
async function takePhoto() {
  // the side panel is not part of the picture, so render without the offset that makes room for it
  const ghostWas = ghost.visible;
  ghost.visible = false;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const g = out.getContext('2d');
  g.drawImage(src, 0, 0);
  ghost.visible = ghostWas;
  resize();

  // caption: what is loaded and how full it is
  const s = out.width / innerWidth;
  const text = ['🛋️ Anhänger-Tetris', $('#st-items').textContent, $('#st-cartons').textContent, $('#st-vol').textContent,
    `${trailer.L} × ${trailer.W} × ${trailer.H} cm`].join('  ·  ');
  g.font = `800 ${15 * s}px Nunito, sans-serif`;
  const w = g.measureText(text).width + 32 * s;
  const h = 34 * s;
  const x = (out.width - w) / 2;
  const y = out.height - h - 16 * s;
  g.fillStyle = 'rgba(255, 252, 247, 0.88)';
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = '#1d2330';
  g.textBaseline = 'middle';
  g.fillText(text, x + 16 * s, y + h / 2 + s);

  const flash = $('#flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');

  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  if (!blob) {
    toast('Das Foto hat nicht geklappt.');
    return;
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `anhaenger-tetris-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Anhänger-Tetris' });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Foto gespeichert');
}

function resetCamera() {
  const { L, W } = trailer;
  // centre between trailer and carton stack, so both are in view
  const cx = (L + 70 + PALLET.L) / 2;
  controls.target.set(cx, BED + 20, W / 2 + 70);
  const narrow = innerWidth < innerHeight;
  camera.position.set(cx + (narrow ? 360 : 260), BED + (narrow ? 820 : 420), W + (narrow ? 1060 : 560));
  controls.update();
}

function togglePanel(open) {
  $('#panel').classList.toggle('open', open);
}

// Takes a new moving box from the stack and puts it in the hand.
function fetchCarton() {
  const it = createItem(CARTON);
  // comes flying off the top of the stack
  it.mesh.position.copy(stack.position).add(new THREE.Vector3(PALLET.L / 2 - CW / 2, PALLET.H + 3 * CH, PALLET.W / 2 - CD / 2));
  select(it);
}

function showWin() {
  wonShown = true;
  const placed = items.filter((it) => it.placed);
  const vol = P.volume(placed.flatMap((it) => it.shape.boxes));
  const top = Math.max(...placed.map((it) => it.y + it.shape.size[1]));
  const cartons = placed.filter(isCarton).length;
  $('#win-text').textContent =
    `Alle ${furniture().length} Möbel sind drin${cartons ? `, dazu ${cartons} Kartons` : ''}. ` +
    `Ladehöhe ${Math.round(top)} cm von ${trailer.H} cm, ` +
    `der Anhänger ist zu ${Math.round((vol / (trailer.L * trailer.W * trailer.H)) * 100)} % gefüllt.`;
  $('#win').hidden = false;
  FX.confetti(trailer.L / 2, BED + top + 20, trailer.W / 2);
}

// ---------- solution

const SOLVE_LIMIT = 30000;
const solutions = new Map();
let solving = false;

function setPlaying(on) {
  playing = on;
  hovered = null;
  canvas.style.cursor = '';
  for (const id of ['#btn-solve', '#btn-reset', '#trailer-form button']) $(id).disabled = on || (id === '#btn-solve' && solving);
  renderControls();
  refreshUI();
  // the whole solution is one step
  if (!on) record();
}

function showSolution() {
  if (solving || playing) return;
  const key = `${trailer.L}x${trailer.W}x${trailer.H}`;
  if (solutions.has(key)) {
    playSolution(solutions.get(key));
    return;
  }
  const btn = $('#btn-solve');
  const worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
  const t0 = performance.now();
  let best = null;
  const tick = setInterval(() => {
    const s = Math.round((performance.now() - t0) / 1000);
    btn.textContent = `Rechne … ${s} s${best ? `, bisher ${best.cartons.length} Kartons` : ''}`;
  }, 250);
  const finish = () => {
    clearInterval(tick);
    worker.terminate();
    solving = false;
    btn.disabled = false;
    btn.textContent = 'Lösung zeigen';
  };
  solving = true;
  btn.disabled = true;
  worker.onmessage = ({ data }) => {
    if (data.type === 'best') {
      best = data.best;
      return;
    }
    finish();
    if (!data.best) {
      toast(data.timedOut ? 'In 30 s keine Lösung gefunden.' : 'Keine Lösung: so passt nicht alles rein.');
      return;
    }
    solutions.set(key, data.best);
    const n = data.best.cartons.length;
    toast(`Beste gefundene Lösung: alle Möbel und ${n} ${n === 1 ? 'Karton' : 'Kartons'}`);
    playSolution(data.best);
  };
  worker.onerror = () => {
    finish();
    toast('Die Lösungssuche ist fehlgeschlagen.');
  };
  worker.postMessage({ trailer, timeLimit: SOLVE_LIMIT });
}

// Unloads everything and loads the solution: furniture piece by piece, then the moving boxes quickly.
function playSolution(best) {
  setPlaying(true);
  unloadAll();
  wonShown = true;
  const furn = furniture();
  best.placements.forEach((p, i) => {
    const it = furn.find((x) => x.def === CATALOG[p.index]);
    const pose = () => {
      if (active !== it) select(it);
      it.R = p.R;
      it.shape = P.orient(it.def.boxes, it.R);
      it.x = p.x;
      it.z = p.z;
      rebuildGhost();
      updateActive();
    };
    setTimeout(pose, i * 1000);
    setTimeout(() => {
      pose();
      drop();
      if (i === best.placements.length - 1 && !best.cartons.length) setPlaying(false);
    }, i * 1000 + 500);
  });
  const t0 = best.placements.length * 1000 + 300;
  best.cartons.forEach((c, i) => {
    setTimeout(() => {
      const it = createItem(CARTON);
      it.R = c.R;
      it.shape = P.orient(CARTON.boxes, c.R);
      it.x = c.x;
      it.z = c.z;
      it.y = P.landingY(it.shape, c.x, c.z, placedBoxes);
      it.placed = true;
      history.push(it.uid);
      setPose(it, it.x, BED + it.y, it.z);
      it.mesh.position.copy(it.target).setY(it.target.y + 120);
      it.mesh.quaternion.copy(it.targetQ);
      recomputePlaced();
      if (i % 3 === 0) thud();
      refreshUI();
      if (i === best.cartons.length - 1) {
        setPlaying(false);
        save();
        toast(`Alle Möbel und ${best.cartons.length} Kartons sind drin.`);
      }
    }, t0 + i * 160);
  });
}

$('#trailer-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const v = (k, min, max) => Math.max(min, Math.min(max, Math.round(Number(f[k].value) || DEFAULT_TRAILER[k])));
  applyTrailer({ L: v('L', 100, 800), W: v('W', 80, 260), H: v('H', 40, 300) });
  resetCamera();
  save();
  toast(`Anhänger: ${trailer.L} × ${trailer.W} × ${trailer.H} cm`);
});
$('#btn-tarp').onclick = toggleTarp;
$('#btn-photo').onclick = takePhoto;
$('#btn-cam').onclick = resetCamera;
function unloadAll() {
  for (const it of [...items]) toYard(it, false);
  history = [];
  recomputePlaced();
  wonShown = false;
  updateActive();
  refreshPoses();
  refreshUI();
  save();
}
$('#btn-reset').onclick = unloadAll;
// The solution spoils the puzzle, so ask first.
$('#btn-solve').onclick = () => ($('#ask-solve').hidden = false);
$('#ask-no').onclick = () => ($('#ask-solve').hidden = true);
$('#ask-solve').onclick = (e) => {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
};
$('#ask-yes').onclick = () => {
  $('#ask-solve').hidden = true;
  if (matchMedia('(max-width: 767px)').matches) togglePanel(false);
  showSolution();
};
$('#btn-back').onclick = stepBack;
$('#btn-fwd').onclick = stepForward;
$('#panel-toggle').onclick = () => togglePanel(!$('#panel').classList.contains('open'));
$('#win-close').onclick = () => ($('#win').hidden = true);
$('#win-again').onclick = () => {
  $('#win').hidden = true;
  $('#btn-reset').click();
};

// Control pad: the arrow buttons behave like held arrow keys.
for (const btn of document.querySelectorAll('[data-act]')) {
  const [act, a, b] = btn.dataset.act.split(':');
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    if (playing) return;
    if (act === 'move') press(a);
    else if (act === 'rot') rotate(a, Number(b));
    else if (act === 'drop') drop();
  });
  if (act === 'move') {
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => release(a));
  }
}

// ---------- sound

let actx = null;
function unlockAudio() {
  try {
    actx ??= new AudioContext();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* no audio */ }
}
// Two short gliding tones through a vowel-like filter: close enough to a meow.
function meow() {
  if (!actx) return;
  const t = actx.currentTime + 0.02;
  const o = actx.createOscillator();
  const f = actx.createBiquadFilter();
  const g = actx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(520, t);
  o.frequency.linearRampToValueAtTime(820, t + 0.14);
  o.frequency.exponentialRampToValueAtTime(430, t + 0.55);
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(900, t);
  f.frequency.linearRampToValueAtTime(1800, t + 0.15);
  f.frequency.linearRampToValueAtTime(700, t + 0.55);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.06);
  g.gain.setValueAtTime(0.35, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o.connect(f).connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + 0.62);
}

// pushing against a wall: a dull knock and a small shake
function bump() {
  shakeT = Math.max(shakeT, 0.12);
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + 0.11);
}

function thud() {
  if (!actx) return;
  const t = actx.currentTime + 0.12;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
  g.gain.setValueAtTime(0.0001, actx.currentTime);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g).connect(actx.destination);
  o.start(actx.currentTime);
  o.stop(t + 0.3);
}

// ---------- loop

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  // on desktop the side panel covers the left, so center the picture in the free space
  if (innerWidth >= 768) camera.setViewOffset(innerWidth, innerHeight, -162, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  tickMove(dt);
  const k = 1 - Math.pow(0.0005, dt);
  // the piece in hand follows more tightly, so arrows feel immediate
  const kActive = 1 - Math.pow(0.00002, dt);
  for (const it of items) {
    const target = it.target.clone();
    if (it === hovered && !it.placed && it !== active) target.y += 8;
    if (it === active) {
      target.y += Math.sin(t * 3) * 2.5;
      if (shakeT > 0) target.x += Math.sin(t * 60) * 4 * shakeT;
    }
    it.mesh.position.lerp(target, it === active ? kActive : k);
    it.mesh.quaternion.slerp(it.targetQ, it === active ? kActive : k);
  }
  shakeT = Math.max(0, shakeT - dt);
  const sign = stack.userData.sign;
  sign.position.y = PALLET.H + 3 * CH + 34 + Math.sin(t * 2.2) * 3;
  sign.scale.setScalar(stackHover && !playing ? 1.12 : 1).multiply(new THREE.Vector3(64, 22.4, 1));
  FX.update(dt);
  controls.update();
  cat.update(dt, t, camera);
  fadeOccluders(dt);
  fadeTarp(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- start

const startTrailer = load();
resize();
applyTrailer(startTrailer);
recomputePlaced();
settle();
refreshPoses();
for (const it of items) {
  it.mesh.position.copy(it.target);
  it.mesh.quaternion.copy(it.targetQ);
}
resetCamera();
refreshUI();
record();
frame();
window.__game = { items, trailer: () => trailer, select, drop, rotate, press, release, tickMove, toYard, camera, controls, cat };
