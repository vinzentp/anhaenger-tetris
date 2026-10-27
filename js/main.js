import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARTON, CATALOG, MATERIALS } from './furniture.js';
import * as P from './physics.js';
import { BED, buildTrailer, buildYard } from './scene.js';
import * as TX from './textures.js';
import * as FX from './effects.js';

const STEP = 5;
const HOVER = 14;
const SAVE_KEY = 'anhaenger-tetris-v2';
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
scene.add(buildYard());
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
  if (active) toYard(active, false);
  if (item.placed) {
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

function toYard(item, refresh = true) {
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

function undo() {
  const uid = history[history.length - 1];
  if (uid !== undefined) select(byUid(uid));
}

// Camera-relative axes on the floor, snapped to the trailer axes.
function camAxes() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  const f = Math.abs(d.x) > Math.abs(d.z) ? [Math.sign(d.x), 0] : [0, Math.sign(d.z)];
  return { f, r: [-f[1], f[0]] };
}

function move(fwd, right, step = STEP) {
  if (!active) return;
  const { f, r } = camAxes();
  active.x = Math.round(active.x + (f[0] * fwd + r[0] * right) * step);
  active.z = Math.round(active.z + (f[1] * fwd + r[1] * right) * step);
  updateActive();
}

function moveTo(px, pz) {
  if (!active) return;
  const [sx, , sz] = active.shape.size;
  active.x = Math.round((px - sx / 2) / STEP) * STEP;
  active.z = Math.round((pz - sz / 2) / STEP) * STEP;
  updateActive();
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

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      trailer,
      // placed pieces in loading order, so undo still works after a reload
      placed: items.filter((it) => it.placed)
        .sort((a, b) => history.indexOf(a.uid) - history.indexOf(b.uid))
        .map(({ def, R, x, y, z }) => ({ id: def.id, R, x, y, z })),
    }));
  } catch { /* storage unavailable */ }
}

function load() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch { /* ignore */ }
  if (!data) return { ...DEFAULT_TRAILER };
  history = [];
  for (const p of data.placed ?? []) {
    const it = p.id === CARTON.id ? createItem(CARTON) : items.find((x) => x.def.id === p.id && !x.placed);
    if (!it) continue;
    Object.assign(it, { R: p.R, x: p.x, y: p.y, z: p.z, placed: true });
    it.shape = P.orient(it.def.boxes, it.R);
    history.push(it.uid);
  }
  return data.trailer ?? { ...DEFAULT_TRAILER };
}

// ---------- pointer input

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BED);

function castAt(e) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = items.flatMap((it) => it.mesh.children);
  return raycaster.intersectObjects(meshes, false).map((h) => ({ item: byUid(h.object.userData.uid), point: h.point }));
}

// Point on the load (placed pieces or floor) under the pointer, ignoring the piece in hand.
function loadPoint(hits) {
  const h = hits.find((x) => x.item.placed);
  if (h) return h.point;
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(floorPlane, p) ? p : null;
}

let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY };
  unlockAudio();
});
canvas.addEventListener('pointermove', (e) => {
  if (playing) return;
  const hits = castAt(e);
  if (e.pointerType === 'mouse' && !e.buttons && active) {
    const p = loadPoint(hits);
    if (p) moveTo(p.x, p.z);
  }
  const yardHit = hits.find((h) => !h.item.placed && h.item !== active);
  hovered = e.pointerType === 'mouse' ? (yardHit?.item ?? null) : null;
  canvas.style.cursor = yardHit || (!active && hits.length) ? 'pointer' : active ? 'crosshair' : '';
});
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
  down = null;
  if (moved || playing) return;
  const hits = castAt(e);
  if (!active) {
    if (hits.length) select(hits[0].item);
    return;
  }
  const yardHit = hits.find((h) => !h.item.placed && h.item !== active);
  if (yardHit && yardHit === hits.find((h) => h.item !== active)) {
    select(yardHit.item);
    return;
  }
  const p = loadPoint(hits);
  if (e.pointerType === 'mouse') {
    if (p && p.x > -60 && p.x < trailer.L + 60 && p.z > -60 && p.z < trailer.W + 60) drop();
  } else if (p) {
    moveTo(p.x, p.z);
  }
});

// ---------- keyboard

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (!$('#ask-solve').hidden) {
    if (e.key === 'Escape') $('#ask-solve').hidden = true;
    return;
  }
  if (playing) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const step = e.shiftKey ? 1 : STEP;
  const map = {
    ArrowUp: () => move(1, 0, step), w: () => move(1, 0, step),
    ArrowDown: () => move(-1, 0, step), s: () => move(-1, 0, step),
    ArrowLeft: () => move(0, -1, step), a: () => move(0, -1, step),
    ArrowRight: () => move(0, 1, step), d: () => move(0, 1, step),
    q: () => rotate('yaw', 1), e: () => rotate('yaw', -1),
    r: () => rotate('tilt', 1), f: () => rotate('roll', 1),
    ' ': drop, Enter: drop,
    Escape: () => active && toYard(active),
    Backspace: undo, z: undo,
    p: toggleTarp,
  };
  const fn = map[k];
  if (!fn) return;
  e.preventDefault();
  fn();
});

// ---------- UI

function dims(it) {
  const [x, y, z] = P.orient(it.def.boxes, P.IDENT).size;
  return `${x} × ${z} × ${y} cm (L × T × H)`;
}

function refreshUI() {
  const list = $('#yard-list');
  list.innerHTML = '';
  for (const it of furniture()) {
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
        : 'Tippe ein Möbelstück im Hof an.';
  $('#hint').classList.toggle('is-bad', !!active?.problem);
  $('#btn-drop').disabled = !active || !!active.problem;
  $('#controls').classList.toggle('is-playing', playing);
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

function resetCamera() {
  const { L, W } = trailer;
  controls.target.set(L / 2, BED + 20, W / 2 + 70);
  const narrow = innerWidth < innerHeight;
  camera.position.set(L / 2 + 260, BED + (narrow ? 620 : 420), W + (narrow ? 820 : 560));
  controls.update();
}

function togglePanel(open) {
  $('#panel').classList.toggle('open', open);
}

// Takes a new moving box from the stack and puts it in the hand.
function fetchCarton() {
  const it = createItem(CARTON);
  it.mesh.position.set(trailer.L / 2, 0, trailer.W + 90);
  select(it);
  it.mesh.position.copy(it.target).setY(0);
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
  unloadAll();
  wonShown = true;
  setPlaying(true);
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
$('#panel-toggle').onclick = () => togglePanel(!$('#panel').classList.contains('open'));
$('#win-close').onclick = () => ($('#win').hidden = true);
$('#win-again').onclick = () => {
  $('#win').hidden = true;
  $('#btn-reset').click();
};

// Control pad: buttons repeat while held.
for (const btn of document.querySelectorAll('[data-act]')) {
  const run = () => {
    if (playing) return;
    const [act, a, b] = btn.dataset.act.split(':');
    if (act === 'move') move(Number(a), Number(b));
    else if (act === 'rot') rotate(a, Number(b));
    else if (act === 'drop') drop();
    else if (act === 'yard') active && toYard(active);
  };
  let timer = 0;
  const stop = () => clearInterval(timer);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    run();
    if (btn.dataset.act.startsWith('move')) {
      timer = setTimeout(() => (timer = setInterval(run, 70)), 320);
    }
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => {
    clearTimeout(timer);
    stop();
  });
}

// ---------- sound

let actx = null;
function unlockAudio() {
  try {
    actx ??= new AudioContext();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* no audio */ }
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
  const k = 1 - Math.pow(0.0005, dt);
  for (const it of items) {
    const target = it.target.clone();
    if (it === hovered && !it.placed && it !== active) target.y += 8;
    if (it === active) {
      target.y += Math.sin(t * 3) * 2.5;
      if (shakeT > 0) target.x += Math.sin(t * 60) * 4 * shakeT;
    }
    it.mesh.position.lerp(target, k);
    it.mesh.quaternion.slerp(it.targetQ, k);
  }
  shakeT = Math.max(0, shakeT - dt);
  FX.update(dt);
  controls.update();
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
renderControls();
frame();
window.__game = { items, trailer: () => trailer, select, drop, rotate, move, toYard };
