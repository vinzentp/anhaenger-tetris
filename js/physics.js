// Box geometry for the packing game: 90° rotations, collision and dropping.
// All values in cm. A "shape" is a piece in one orientation, shifted so its bounding box starts at 0.

export const EPS = 0.01;
export const IDENT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

const ROT = {
  x: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  y: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
  z: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
};

export function mul(A, B) {
  return A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
}

function transpose(A) {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));
}

// +90° (sign > 0) or -90° around a world axis.
export function axisRot(axis, sign) {
  return sign > 0 ? ROT[axis] : transpose(ROT[axis]);
}

function apply(R, v) {
  return R.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
}

export function orient(boxes, R) {
  const rb = boxes.map((bx) => {
    const a = apply(R, bx.min);
    const c = apply(R, bx.max);
    return { min: a.map((v, i) => Math.min(v, c[i])), max: a.map((v, i) => Math.max(v, c[i])) };
  });
  const lo = [0, 1, 2].map((i) => Math.min(...rb.map((bx) => bx.min[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...rb.map((bx) => bx.max[i])));
  return {
    boxes: rb.map((bx) => ({ min: bx.min.map((v, i) => v - lo[i]), max: bx.max.map((v, i) => v - lo[i]) })),
    size: hi.map((v, i) => v - lo[i]),
    offset: lo,
  };
}

export function worldBoxes(shape, x, y, z) {
  const p = [x, y, z];
  return shape.boxes.map((bx) => ({ min: bx.min.map((v, i) => v + p[i]), max: bx.max.map((v, i) => v + p[i]) }));
}

function overlap(a0, a1, b0, b1) {
  return a0 < b1 - EPS && b0 < a1 - EPS;
}

// Lowest height at which the shape comes to rest when dropped from above at (x, z).
export function landingY(shape, x, z, others) {
  let y = 0;
  for (const a of shape.boxes) {
    const ax0 = a.min[0] + x, ax1 = a.max[0] + x, az0 = a.min[2] + z, az1 = a.max[2] + z;
    for (const o of others) {
      if (overlap(ax0, ax1, o.min[0], o.max[0]) && overlap(az0, az1, o.min[2], o.max[2])) {
        y = Math.max(y, o.max[1] - a.min[1]);
      }
    }
  }
  return y;
}

export function volume(boxes) {
  return boxes.reduce((s, bx) => s + (bx.max[0] - bx.min[0]) * (bx.max[1] - bx.min[1]) * (bx.max[2] - bx.min[2]), 0);
}
