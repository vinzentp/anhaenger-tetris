// Searches for a packing that loads all furniture and leaves room for as many moving boxes as possible.
//
// Pieces are dropped from above, like in the game, so the load is fully described by a height map
// (1 cm grid): a piece lands where the highest point under any of its boxes touches it.
//
// 1. Furniture: beam search. Starting from the empty trailer, every kept state is extended by every
//    remaining piece in every orientation at the lowest sensible spots (against walls and edges of what
//    is already loaded). States are ranked by the volume under the load envelope: everything below it
//    can no longer be reached from above, so less is better. Nesting pieces into each other pays off.
// 2. Moving boxes: for the best finished furniture packings, boxes are filled in greedily, each at the
//    lowest free spot (several fill orders are tried). The packing with the most boxes wins, ties go
//    to the lower load.
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

// Distinct orientations of a piece that fit into the trailer at all.
function orientations(def, { L, W, H }) {
  const unique = new Map();
  for (const R of allRotations()) {
    const s = P.orient(def.boxes, R);
    if (s.size[0] > L || s.size[1] > H || s.size[2] > W) continue;
    const boxes = s.boxes.map((b) => ({
      x0: Math.floor(b.min[0]), x1: Math.ceil(b.max[0]),
      z0: Math.floor(b.min[2]), z1: Math.ceil(b.max[2]),
      y0: b.min[1], y1: b.max[1],
    }));
    // top profile of the piece, sampled every 2 cm, to estimate how the load envelope grows
    const [sx, , sz] = s.size.map(Math.ceil);
    const col = new Float32Array(sx * sz).fill(-1);
    for (const b of boxes) {
      for (let x = b.x0; x < b.x1; x++) for (let z = b.z0; z < b.z1; z++) col[x * sz + z] = Math.max(col[x * sz + z], b.y1);
    }
    const profile = [];
    for (let x = 0; x < sx; x += 2) for (let z = 0; z < sz; z += 2) if (col[x * sz + z] >= 0) profile.push(x, z, col[x * sz + z]);
    unique.set(JSON.stringify(s.boxes), { R, size: s.size.map(Math.ceil), boxes, profile });
  }
  return [...unique.values()];
}

const LOG2 = new Uint8Array(4097);
for (let i = 2; i < LOG2.length; i++) LOG2[i] = LOG2[i >> 1] + 1;

// Height of the load per cm², with a 2D sparse table for fast "highest point in a rectangle".
class HeightMap {
  constructor(L, W, from) {
    this.L = L;
    this.W = W;
    this.h = from ? from.h.slice() : new Int16Array(L * W);
    this.t = null;
  }

  add(x0, x1, z0, z1, top) {
    const { W, h } = this;
    for (let x = Math.max(0, x0); x < Math.min(this.L, x1); x++) {
      for (let z = Math.max(0, z0), i = x * W + z; z < Math.min(W, z1); z++, i++) if (h[i] < top) h[i] = top;
    }
    this.t = null;
  }

  build() {
    const { L, W, h } = this;
    const KX = LOG2[L] + 1;
    const KZ = LOG2[W] + 1;
    const t = new Array(KX * KZ);
    t[0] = h;
    for (let kz = 1; kz < KZ; kz++) {
      const prev = t[kz - 1];
      const cur = new Int16Array(L * W);
      const step = 1 << (kz - 1);
      const zmax = W - (1 << kz);
      for (let x = 0; x < L; x++) {
        for (let z = 0, i = x * W; z <= zmax; z++, i++) cur[i] = prev[i] > prev[i + step] ? prev[i] : prev[i + step];
      }
      t[kz] = cur;
    }
    for (let kx = 1; kx < KX; kx++) {
      const step = (1 << (kx - 1)) * W;
      const n = (L - (1 << kx) + 1) * W;
      for (let kz = 0; kz < KZ; kz++) {
        const prev = t[(kx - 1) * KZ + kz];
        const cur = new Int16Array(L * W);
        for (let i = 0; i < n; i++) cur[i] = prev[i] > prev[i + step] ? prev[i] : prev[i + step];
        t[kx * KZ + kz] = cur;
      }
    }
    this.t = t;
    this.KZ = KZ;
  }

  // Highest point in [x0, x1) × [z0, z1).
  max(x0, x1, z0, z1) {
    const kx = LOG2[x1 - x0];
    const kz = LOG2[z1 - z0];
    const a = this.t[kx * this.KZ + kz];
    const W = this.W;
    const xa = x0 * W;
    const xb = (x1 - (1 << kx)) * W;
    const zb = z1 - (1 << kz);
    return Math.max(a[xa + z0], a[xa + zb], a[xb + z0], a[xb + zb]);
  }

  landing(o, x, z) {
    let y = 0;
    for (const b of o.boxes) {
      const v = this.max(x + b.x0, x + b.x1, z + b.z0, z + b.z1) - b.y0;
      if (v > y) y = v;
    }
    return y;
  }

  place(o, x, y, z) {
    for (const b of o.boxes) this.add(x + b.x0, x + b.x1, z + b.z0, z + b.z1, Math.ceil(y + b.y1));
  }
}

function candidates(size, edges, lim) {
  const out = new Set([0, lim - size]);
  for (const e of edges) {
    out.add(e);
    out.add(e - size);
  }
  return [...out].filter((v) => v >= 0 && v + size <= lim);
}

// ---------- furniture

// How much usable space a placement costs, sampled on the 2 cm profile grid. Without moving boxes
// that is the growth of the load envelope. With boxes only free height in whole box layers counts
// (24 cm of air above a couch hold no box), plus a little of the plain growth to break ties.
function spaceCost(hm, o, x, y, z, H, layer) {
  const { W, h } = hm;
  const p = o.profile;
  let grow = 0;
  let lost = 0;
  for (let i = 0; i < p.length; i += 3) {
    const old = h[(x + p[i]) * W + z + p[i + 1]];
    const now = y + p[i + 2];
    if (now <= old) continue;
    grow += now - old;
    if (layer) lost += Math.floor((H - old) / layer) - Math.floor((H - now) / layer);
  }
  return layer ? (lost * layer + grow * 0.05) * 4 : grow * 4;
}

function stillFits(hm, left, orients, xs, zs, { L, W, H }) {
  hm.build();
  const ok = left.every((n, k) => !n || orients[k].some((o) => {
    const [sx, sy, sz] = o.size;
    return candidates(sx, xs, L).some((x) => candidates(sz, zs, W).some((z) => hm.landing(o, x, z) + sy <= H));
  }));
  hm.t = null;
  return ok;
}

// States are grouped by which pieces they already hold; each group keeps its best `beam` states,
// so packings that start with a different piece are not crowded out.
function beamSearch(defs, trailer, { beam, perOrient, layer, deadline }) {
  const { L, W, H } = trailer;
  const kindOf = defs.map((d) => JSON.stringify(d.boxes));
  const kinds = [...new Set(kindOf)];
  const members = kinds.map((k) => defs.map((_, i) => i).filter((i) => kindOf[i] === k));
  const orients = kinds.map((_, ki) => orientations(defs[members[ki][0]], trailer));
  if (orients.some((o) => !o.length)) return [];

  let states = [{
    hm: new HeightMap(L, W),
    left: members.map((m) => m.length),
    placed: [],
    top: 0,
    env: 0,
    xs: [0, L],
    zs: [0, W],
  }];
  for (let level = 0; level < defs.length; level++) {
    const groups = new Map();
    for (const st of states) {
      if (Date.now() > deadline) return null;
      st.hm.build();
      for (let k = 0; k < kinds.length; k++) {
        if (!st.left[k]) continue;
        const left = st.left.slice();
        left[k]--;
        const gk = left.join(',');
        if (!groups.has(gk)) groups.set(gk, []);
        const group = groups.get(gk);
        for (let oi = 0; oi < orients[k].length; oi++) {
          const o = orients[k][oi];
          const [sx, sy, sz] = o.size;
          // per orientation only the lowest spots, ties go to spots near a corner
          const spots = [];
          for (const x of candidates(sx, st.xs, L)) {
            for (const z of candidates(sz, st.zs, W)) {
              const y = st.hm.landing(o, x, z);
              if (y + sy > H) continue;
              const corner = Math.min(x, L - x - sx) + Math.min(z, W - z - sz);
              spots.push({ x, y, z, r: y * 1e4 + corner });
            }
          }
          spots.sort((a, b) => a.r - b.r);
          for (const { x, y, z } of spots.slice(0, perOrient)) {
            const env = st.env + spaceCost(st.hm, o, x, y, z, H, layer);
            if (group.length >= beam * 3 && env >= group[group.length - 1].env) continue;
            const sig = `${k}:${oi}:${x}:${y}:${z}`;
            const key = [...st.placed.map((p) => p.sig), sig].sort().join('|');
            if (group.some((c) => c.key === key)) continue;
            group.push({ st, k, oi, x, y, z, env, key, sig, top: Math.max(st.top, y + sy), left });
            group.sort((a, b) => a.env - b.env);
            if (group.length > beam * 3) group.pop();
          }
        }
      }
      st.hm.t = null;
    }
    // keep the best `beam` states per group in which every missing piece still fits somewhere on its own
    states = [];
    const last = level === defs.length - 1;
    for (const group of groups.values()) {
      let kept = 0;
      for (const c of group) {
        if (kept >= beam) break;
        const o = orients[c.k][c.oi];
        const hm = new HeightMap(L, W, c.st.hm);
        hm.place(o, c.x, c.y, c.z);
        const xs = [...new Set([...c.st.xs, ...o.boxes.flatMap((b) => [c.x + b.x0, c.x + b.x1])])];
        const zs = [...new Set([...c.st.zs, ...o.boxes.flatMap((b) => [c.z + b.z0, c.z + b.z1])])];
        if (!last && !stillFits(hm, c.left, orients, xs, zs, trailer)) continue;
        kept++;
        states.push({
          hm, left: c.left, top: c.top, env: c.env,
          placed: [...c.st.placed, { k: c.k, oi: c.oi, x: c.x, y: c.y, z: c.z, sig: c.sig }],
          xs,
          zs,
        });
      }
    }
    if (!states.length) return [];
  }

  // map kinds back to concrete pieces (identical pieces are interchangeable)
  return states.map((st) => {
    const pool = members.map((m) => m.slice());
    return {
      hm: st.hm,
      top: st.top,
      env: st.env,
      placements: st.placed.map((p) => {
        const o = orients[p.k][p.oi];
        return { index: pool[p.k].shift(), R: o.R, x: p.x, y: p.y, z: p.z };
      }),
    };
  });
}

// ---------- moving boxes

// 2D sliding-window maximum of the height map for a w × d footprint.
function windowMax(hm, w, d) {
  const { L, W, h } = hm;
  const nz = W - d + 1;
  const nx = L - w + 1;
  const tmp = new Int16Array(L * nz);
  const dq = new Int32Array(Math.max(L, W));
  for (let x = 0; x < L; x++) {
    let head = 0;
    let tail = 0;
    const base = x * W;
    for (let z = 0; z < W; z++) {
      const v = h[base + z];
      while (tail > head && h[base + dq[tail - 1]] <= v) tail--;
      dq[tail++] = z;
      if (dq[head] <= z - d) head++;
      if (z >= d - 1) tmp[x * nz + z - d + 1] = h[base + dq[head]];
    }
  }
  const out = new Int16Array(nx * nz);
  for (let z = 0; z < nz; z++) {
    let head = 0;
    let tail = 0;
    for (let x = 0; x < L; x++) {
      const v = tmp[x * nz + z];
      while (tail > head && tmp[dq[tail - 1] * nz + z] <= v) tail--;
      dq[tail++] = x;
      if (dq[head] <= x - w) head++;
      if (x >= w - 1) out[(x - w + 1) * nz + z] = tmp[dq[head] * nz + z];
    }
  }
  return { out, nx, nz };
}

// Greedy fill: each box goes to the free spot the score ranks first.
function fillBoxes(hm0, orients, H, score, deadline) {
  const hm = new HeightMap(hm0.L, hm0.W, hm0);
  const placed = [];
  for (;;) {
    if (Date.now() > deadline) return null;
    let best = null;
    for (let oi = 0; oi < orients.length; oi++) {
      const [w, sh, d] = orients[oi].size;
      const { out, nx, nz } = windowMax(hm, w, d);
      for (let x = 0; x < nx; x++) {
        for (let z = 0; z < nz; z++) {
          const y = out[x * nz + z];
          if (y + sh > H) continue;
          const s = score(x, y, z, sh);
          if (!best || s < best.s) best = { s, oi, x, y, z };
        }
      }
    }
    if (!best) return placed;
    const o = orients[best.oi];
    hm.add(best.x, best.x + o.size[0], best.z, best.z + o.size[2], best.y + o.size[1]);
    placed.push({ R: o.R, x: best.x, y: best.y, z: best.z, top: best.y + o.size[1] });
  }
}

const FILL_ORDERS = [
  (x, y, z) => y * 1e8 + x * 1e4 + z,
  (x, y, z) => y * 1e8 + z * 1e4 + x,
  (x, y, z, h) => (y + h) * 1e8 + x * 1e4 + z,
];

export function solve(defs, trailer, { carton = null, timeLimit = 30000, onBest } = {}) {
  const start = Date.now();
  const deadline = start + timeLimit;
  const T = { L: Math.round(trailer.L), W: Math.round(trailer.W), H: Math.round(trailer.H) };

  // the thinnest side of a box decides which gaps can still take one
  const layer = carton ? Math.min(...P.orient(carton.boxes, P.IDENT).size) : 0;

  // Furniture: which ranking finds the packing with the most room for boxes differs from case to case,
  // so both run (plain envelope and whole box layers), each with a widening beam while time allows.
  // The best finished packings of every run are collected.
  const metrics = layer ? [0, layer] : [0];
  const share = (timeLimit * 0.55) / metrics.length;
  const finals = new Map();
  let timedOut = false;
  metrics.forEach((m, mi) => {
    const until = start + share * (mi + 1);
    for (let b = 4; b <= 64; b *= 2) {
      const t0 = Date.now();
      const res = beamSearch(defs, T, { beam: b, perOrient: 6 + b, layer: m, deadline: until });
      if (res === null) {
        timedOut = true;
        break;
      }
      res.sort((a, z) => a.env - z.env);
      for (const f of res) finals.set(JSON.stringify(f.placements), f);
      // the next round costs about four times as much
      if (Date.now() + (Date.now() - t0) * 4 > until) break;
    }
  });
  if (!finals.size) return { best: null, timedOut, ms: Date.now() - start };

  let best = null;
  const offer = (cand) => {
    const n = cand.cartons.length;
    if (!best || n > best.cartons.length || (n === best.cartons.length && cand.top < best.top)) {
      best = cand;
      onBest?.(best);
    }
  };
  for (const f of finals.values()) offer({ top: f.top, placements: f.placements, cartons: [] });

  if (carton) {
    const orients = orientations(carton, T);
    outer: for (const order of FILL_ORDERS) {
      for (const f of finals.values()) {
        const boxes = fillBoxes(f.hm, orients, T.H, order, deadline);
        if (!boxes) {
          timedOut = true;
          break outer;
        }
        const top = Math.max(f.top, ...boxes.map((b) => b.top));
        offer({ top, placements: f.placements, cartons: boxes.map(({ R, x, y, z }) => ({ R, x, y, z })) });
      }
    }
  }
  return { best, timedOut, ms: Date.now() - start };
}
