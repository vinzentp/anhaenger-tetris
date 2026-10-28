// Searches for a packing that loads all furniture and leaves room for as many moving boxes as possible.
//
// Pieces are dropped from above, like in the game, so the load is fully described by a height map
// (1 cm grid): a piece lands where the highest point under any of its boxes touches it.
//
// Furniture, cushions and boxes are planned together as one drop sequence. A placement rule turns a
// sequence into a load: every item goes to the orientation and spot that wastes the least space under
// the load envelope (space nothing can reach from above any more); ties go to the lower spot, then
// to the front left. Because boxes may come early, a mattress can end up on a stack of boxes and a
// cushion under a couch or in its seat. Simulated annealing searches the sequence: it moves pieces to
// other positions, swaps them and changes their orientation, and keeps a change when the load holds
// more boxes (or as many with more free room), sometimes also a worse one to get out of dead ends.
// Boxes run until the first one finds no spot: heights only grow, so no later one would fit either.
import * as P from './physics.js';

function allRotations() {
  const seen = new Map();
  const queue = [P.IDENT];
  while (queue.length) {
    const R = queue.pop();
    const k = JSON.stringify(R);
    if (seen.has(k)) continue;
    seen.set(k, R);
    for (const a of ['x', 'y', 'z']) queue.push(P.mul(P.axisRot(a, 1), R));
  }
  return [...seen.values()];
}

// The top surface of a piece as disjoint rectangles with their height, to measure how much the
// load envelope grows when it lands.
function topRects(boxes) {
  const xs = [...new Set(boxes.flatMap((b) => [b.x0, b.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(boxes.flatMap((b) => [b.z0, b.z1]))].sort((a, b) => a - b);
  const top = xs.slice(1).map((_, i) => zs.slice(1).map((_, j) => {
    let t = -1;
    for (const b of boxes) if (b.x0 <= xs[i] && b.x1 >= xs[i + 1] && b.z0 <= zs[j] && b.z1 >= zs[j + 1]) t = Math.max(t, b.y1);
    return t;
  }));
  // runs along z per x strip, merged with the same run of the strip before
  const rects = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1;) {
      const t = top[i][j];
      let k = j;
      while (k < zs.length - 1 && top[i][k] === t) k++;
      if (t >= 0) {
        const prev = rects.find((r) => r.x1 === xs[i] && r.z0 === zs[j] && r.z1 === zs[k] && r.top === t);
        if (prev) prev.x1 = xs[i + 1];
        else rects.push({ x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[k], top: t });
      }
      j = k;
    }
  }
  return rects;
}

// Distinct orientations of a piece that fit into the trailer at all.
function orientations(def, { L, W, H }) {
  const unique = new Map();
  for (const R of allRotations()) {
    const s = P.orient(def.boxes, R);
    if (s.size[0] > L + 1e-6 || s.size[1] > H + 1e-6 || s.size[2] > W + 1e-6) continue;
    const boxes = s.boxes.map((b) => ({
      x0: Math.floor(b.min[0] + 1e-6), x1: Math.ceil(b.max[0] - 1e-6),
      z0: Math.floor(b.min[2] + 1e-6), z1: Math.ceil(b.max[2] - 1e-6),
      y0: b.min[1], y1: b.max[1],
    }));
    const key = JSON.stringify(boxes);
    if (unique.has(key)) continue;
    const rects = topRects(boxes);
    let area = 0;
    let topSum = 0;
    for (const r of rects) {
      const a = (r.x1 - r.x0) * (r.z1 - r.z0);
      area += a;
      topSum += a * r.top;
    }
    unique.set(key, { R, size: s.size.map((v) => Math.ceil(v - 1e-6)), boxes, rects, area, topSum });
  }
  return [...unique.values()];
}

function place(h, W, o, x, y, z) {
  for (const b of o.boxes) {
    const top = Math.ceil(y + b.y1 - 1e-6);
    for (let i = x + b.x0; i < x + b.x1; i++) {
      for (let j = z + b.z0, k = i * W + j; j < z + b.z1; j++, k++) if (h[k] < top) h[k] = top;
    }
  }
}

const LOG2 = new Uint8Array(4097);
for (let i = 2; i < LOG2.length; i++) LOG2[i] = LOG2[i >> 1] + 1;
let table = new Int16Array(1 << 16);

// Best spot for one item, or null. Only spots flush with a wall or a height step on both axes count.
// The height map is constant between its steps, so "highest point in a rectangle" runs on the
// compressed grid of those cells with a 2D sparse table; the wasted space comes from prefix sums.
function bestSpot(h, { L, W, H }, orients, only) {
  const W1 = W + 1;
  const S = new Int32Array((L + 1) * W1);
  const ex = new Uint8Array(L + 1);
  const ez = new Uint8Array(W + 1);
  ex[0] = ex[L] = ez[0] = ez[W] = 1;
  for (let x = 0; x < L; x++) {
    let row = 0;
    for (let z = 0; z < W; z++) {
      const v = h[x * W + z];
      row += v;
      S[(x + 1) * W1 + z + 1] = S[x * W1 + z + 1] + row;
      if (x && h[(x - 1) * W + z] !== v) ex[x] = 1;
      if (z && h[x * W + z - 1] !== v) ez[z] = 1;
    }
  }
  const xs = [];
  const zs = [];
  for (let x = 0; x <= L; x++) if (ex[x]) xs.push(x);
  for (let z = 0; z <= W; z++) if (ez[z]) zs.push(z);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const cx = new Int16Array(L);
  const cz = new Int16Array(W);
  for (let i = 0; i < nx; i++) cx.fill(i, xs[i], xs[i + 1]);
  for (let j = 0; j < nz; j++) cz.fill(j, zs[j], zs[j + 1]);
  const KX = LOG2[nx] + 1;
  const KZ = LOG2[nz] + 1;
  const n = nx * nz;
  if (table.length < KX * KZ * n) table = new Int16Array(KX * KZ * n * 2);
  const t = table;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) t[i * nz + j] = h[xs[i] * W + zs[j]];
  for (let kz = 1; kz < KZ; kz++) {
    const prev = (kz - 1) * n;
    const cur = kz * n;
    const step = 1 << (kz - 1);
    const jmax = nz - (1 << kz);
    for (let i = 0; i < nx; i++) {
      for (let j = 0, a = i * nz; j <= jmax; j++, a++) t[cur + a] = t[prev + a] > t[prev + a + step] ? t[prev + a] : t[prev + a + step];
    }
  }
  for (let kx = 1; kx < KX; kx++) {
    const step = (1 << (kx - 1)) * nz;
    const lim = (nx - (1 << kx) + 1) * nz;
    for (let kz = 0; kz < KZ; kz++) {
      const prev = ((kx - 1) * KZ + kz) * n;
      const cur = (kx * KZ + kz) * n;
      for (let a = 0; a < lim; a++) t[cur + a] = t[prev + a] > t[prev + a + step] ? t[prev + a] : t[prev + a + step];
    }
  }
  const spots = (e, len, s) => {
    const out = [];
    for (let v = 0; v + s <= len; v++) if (e[v] || e[v + s]) out.push(v);
    return out;
  };

  let best = null;
  for (let oi = 0; oi < orients.length; oi++) {
    if (only >= 0 && oi !== only) continue;
    const o = orients[oi];
    const [sx, sy, sz] = o.size;
    if (sx > L || sz > W || sy > H) continue;
    const bx = o.boxes;
    const rs = o.rects;
    const ia = new Int32Array(bx.length);
    const ib = new Int32Array(bx.length);
    const kxs = new Int32Array(bx.length);
    const zSpots = spots(ez, W, sz);
    for (const x of spots(ex, L, sx)) {
      for (let i = 0; i < bx.length; i++) {
        const i0 = cx[x + bx[i].x0];
        const i1 = cx[x + bx[i].x1 - 1];
        kxs[i] = LOG2[i1 - i0 + 1];
        ia[i] = i0 * nz;
        ib[i] = (i1 - (1 << kxs[i]) + 1) * nz;
      }
      for (const z of zSpots) {
        let y = 0;
        for (let i = 0; i < bx.length; i++) {
          const b = bx[i];
          const j0 = cz[z + b.z0];
          const j1 = cz[z + b.z1 - 1];
          const kz = LOG2[j1 - j0 + 1];
          const base = (kxs[i] * KZ + kz) * n;
          const jb = j1 - (1 << kz) + 1;
          let m = t[base + ia[i] + j0];
          if (t[base + ia[i] + jb] > m) m = t[base + ia[i] + jb];
          if (t[base + ib[i] + j0] > m) m = t[base + ib[i] + j0];
          if (t[base + ib[i] + jb] > m) m = t[base + ib[i] + jb];
          m -= b.y0;
          if (m > y) y = m;
        }
        if (y + sy > H) continue;
        let under = 0;
        for (let i = 0; i < rs.length; i++) {
          const r = rs[i];
          const a0 = (x + r.x0) * W1;
          const a1 = (x + r.x1) * W1;
          under += S[a1 + z + r.z1] - S[a0 + z + r.z1] - S[a1 + z + r.z0] + S[a0 + z + r.z0];
        }
        const waste = o.area * y + o.topSum - under;
        if (!best || waste < best.waste || (waste === best.waste && y < best.y)) best = { waste, oi, x, y, z };
      }
    }
  }
  return best;
}

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function solve(defs, trailer, { carton, timeLimit = 30000, seed = 1, onBest } = {}) {
  const start = Date.now();
  const end = start + timeLimit;
  const T = { L: Math.round(trailer.L), W: Math.round(trailer.W), H: Math.round(trailer.H) };
  const cells = T.L * T.W;
  const items = [...defs, carton];
  const BOX = defs.length;
  const ori = items.map((d) => orientations(d, T));
  if (defs.some((_, i) => !ori[i].length)) return { best: null, ms: Date.now() - start };
  const rand = random(seed);

  // Height maps before each step are kept so a change in the middle of the sequence only replays
  // the rest. Big trailers keep fewer of them (about 16 MB per sequence).
  const stride = (len) => Math.max(1, Math.ceil((cells * 2 * len) / 16e6));

  // seq: [{ k: item, o: orientation or -1 for "best" }]. Replays from step `from` of `prev`.
  function decode(seq, from = 0, prev = null) {
    const every = stride(seq.length);
    const k0 = prev ? Math.floor(from / every) * every : 0;
    const snaps = prev && prev.every === every ? prev.snaps.slice(0, k0 / every + 1) : [new Int16Array(cells)];
    const k = prev && prev.every === every ? k0 : 0;
    const steps = prev ? prev.steps.slice(0, k) : [];
    let st = k ? { ...prev.st[k - 1] } : { boxes: 0, missing: 0, full: false };
    const sts = prev ? prev.st.slice(0, k) : [];
    const h = snaps[snaps.length - 1].slice();
    for (let i = k; i < seq.length; i++) {
      const { k: it, o } = seq[i];
      let p = null;
      if (!(it === BOX && st.full)) {
        const s = bestSpot(h, T, ori[it], o);
        if (s) {
          place(h, T.W, ori[it][s.oi], s.x, s.y, s.z);
          p = { k: it, oi: s.oi, x: s.x, y: s.y, z: s.z };
        }
      }
      st = { ...st };
      if (it === BOX) {
        if (p) st.boxes++;
        else st.full = true;
      } else if (!p) st.missing++;
      steps.push(p);
      sts.push(st);
      if ((i + 1) % every === 0) snaps.push(h.slice());
    }
    let free = 0;
    let top = 0;
    for (let i = 0; i < cells; i++) {
      free += T.H - h[i];
      if (h[i] > top) top = h[i];
    }
    return { seq, snaps, every, steps, st: sts, top, ...st, score: st.boxes - 100 * st.missing + free / (cells * T.H) };
  }

  // boxes until one finds no spot, so the sequence always ends with enough of them
  function topUp(seq, res) {
    while (!res.full) {
      const n = seq.length;
      for (let i = 0; i < 10; i++) seq.push({ k: BOX, o: -1 });
      res = decode(seq, n, res);
    }
    return res;
  }

  const result = (r) => ({
    cartons: r.boxes,
    top: r.top,
    steps: r.steps.filter(Boolean).map((p) => {
      const o = ori[p.k][p.oi];
      return { index: p.k === BOX ? -1 : p.k, R: o.R, x: p.x, y: p.y, z: p.z };
    }),
  });

  // start: big pieces first, then cushions, then boxes, like the old two-stage search
  const vol = (i) => P.volume(items[i].boxes) * (defs[i].loose ? 1 : 1e3);
  const seq0 = defs.map((_, i) => ({ k: i, o: -1 })).sort((a, b) => vol(b.k) - vol(a.k));
  let cur = topUp(seq0, decode(seq0));
  let best = cur;
  const report = () => {
    if (!best.missing) onBest?.(result(best));
  };
  report();

  const T0 = 0.4;
  const T1 = 0.02;
  while (Date.now() < end) {
    const temp = T0 * (T1 / T0) ** ((Date.now() - start) / timeLimit);
    const seq = cur.seq.slice();
    // mostly furniture moves; a box moved to another spot is the same as moving the furniture
    const pick = () => {
      for (;;) {
        const i = Math.floor(rand() * seq.length);
        if (seq[i].k !== BOX || rand() < 0.15) return i;
      }
    };
    let from;
    const m = rand();
    if (m < 0.45) {
      const i = pick();
      const [s] = seq.splice(i, 1);
      const j = Math.floor(rand() * (seq.length + 1));
      seq.splice(j, 0, s);
      from = Math.min(i, j);
    } else if (m < 0.75) {
      const i = pick();
      const j = pick();
      if (i === j) continue;
      [seq[i], seq[j]] = [seq[j], seq[i]];
      from = Math.min(i, j);
    } else {
      const i = pick();
      if (seq[i].k === BOX) continue;
      seq[i] = { k: seq[i].k, o: rand() < 0.5 ? -1 : Math.floor(rand() * ori[seq[i].k].length) };
      from = i;
    }
    const cand = topUp(seq, decode(seq, from, cur));
    const d = cand.score - cur.score;
    if (d >= 0 || rand() < Math.exp(d / temp)) cur = cand;
    if (cur.score > best.score) {
      const more = cur.boxes > best.boxes || best.missing;
      best = cur;
      if (more) report();
    }
  }
  return { best: best.missing ? null : result(best), ms: Date.now() - start };
}
