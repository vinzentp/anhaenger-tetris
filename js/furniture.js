// Furniture catalog. Every piece is a list of axis-aligned boxes in cm.
// Local axes: x = length, y = height, z = depth (0 = front edge of the seat, max = back).
// Each box is both what you see and what collides, so nesting pieces works exactly.
//
// To add furniture: write a function that returns boxes and add an entry to CATALOG.

export const MATERIALS = {
  fabric: { color: 0xcfc6b5, roughness: 1 },
  cushion: { color: 0xdad2c2, roughness: 1 },
  wood: { color: 0xc8955a, roughness: 0.6 },
  mattress: { color: 0xf1eee6, roughness: 0.9 },
  carton: { color: 0xc49a6a, roughness: 0.85 },
};

function b(x0, y0, z0, x1, y1, z1, mat = 'fabric', r = 3) {
  return { min: [x0, y0, z0], max: [x1, y1, z1], mat, r };
}

function leg(x, z) {
  return b(x - 3, 0, z - 3, x + 3, LEG, z + 3, 'wood', 0.6);
}

// Couch measurements taken from the photos.
const DEPTH = 85;          // seat depth incl. backrest
const LEG = 14;            // wooden legs
const ARM = 15;            // armrest width
const ARM_TOP = LEG + 48;  // armrest: 48 cm upholstery on 14 cm legs
const SEAT_BASE = 32;
const SEAT_TOP = 46;
const BACK_TOP = 80;
const FRAME_TOP = 66;
const CUSHION_D = 54;      // seat cushion depth, back cushions behind it
const FRAME_Z = 70;        // back frame starts here

function mirrorX(boxes, len) {
  return boxes.map((x) => ({ ...x, min: [len - x.max[0], x.min[1], x.min[2]], max: [len - x.min[0], x.max[1], x.max[2]] }));
}

// A side part: armrest on one end, open end that docks to the corner piece.
function couchSide(len, armSide) {
  const boxes = [
    b(0, LEG, 0, ARM, ARM_TOP, DEPTH, 'fabric', 5),
    b(ARM, LEG, 0, len, SEAT_BASE, FRAME_Z, 'fabric', 2),
    b(ARM, LEG, FRAME_Z, len, FRAME_TOP, DEPTH, 'fabric', 3),
  ];
  // two cushions, split on whole centimetres so all edges stay on the 1 cm grid
  const mid = ARM + Math.floor((len - ARM) / 2);
  for (const [x0, x1] of [[ARM, mid], [mid, len]]) {
    boxes.push(b(x0, SEAT_BASE, 0, x1, SEAT_TOP, CUSHION_D, 'cushion', 6));
    boxes.push(b(x0, SEAT_BASE, CUSHION_D, x1, BACK_TOP, FRAME_Z, 'cushion', 7));
  }
  boxes.push(leg(ARM / 2, 8), leg(ARM / 2, DEPTH - 8), leg(len - 6, 8), leg(len - 6, DEPTH - 8));
  return armSide === 'right' ? mirrorX(boxes, len) : boxes;
}

// The corner piece: backrest on two sides, no armrest.
function couchCorner() {
  const X = 87;
  const side = X - 15;
  return [
    b(0, LEG, FRAME_Z, X, FRAME_TOP, DEPTH, 'fabric', 3),
    b(side, LEG, 0, X, FRAME_TOP, FRAME_Z, 'fabric', 3),
    b(0, LEG, 0, side, SEAT_BASE, FRAME_Z, 'fabric', 2),
    b(0, SEAT_BASE, 0, X - 31, SEAT_TOP, CUSHION_D, 'cushion', 6),
    b(0, SEAT_BASE, CUSHION_D, side, BACK_TOP, FRAME_Z, 'cushion', 7),
    b(X - 31, SEAT_BASE, 0, side, BACK_TOP, CUSHION_D, 'cushion', 7),
    leg(6, 8), leg(6, DEPTH - 8), leg(X - 6, 8), leg(X - 6, DEPTH - 8),
  ];
}

function mattress(len, width, height) {
  return [b(0, 0, 0, len, height, width, 'mattress', 6)];
}

export const CATALOG = [
  { id: 'couch-corner', group: 'Couch', name: 'Couch: Eckteil', boxes: couchCorner() },
  { id: 'couch-side-153', group: 'Couch', name: 'Couch: Seitenteil 1,53 m', boxes: couchSide(153, 'left') },
  { id: 'couch-side-186', group: 'Couch', name: 'Couch: Seitenteil 1,86 m', boxes: couchSide(186, 'right') },
  { id: 'mattress-1', group: 'Matratzen', name: 'Matratze 1', boxes: mattress(200, 90, 20) },
  { id: 'mattress-2', group: 'Matratzen', name: 'Matratze 2', boxes: mattress(200, 90, 20) },
];

// Standard moving box (L × H × T = 60 × 34 × 33 cm). Not part of the catalog: the game hands out as many as wanted.
export const CARTON = { id: 'carton', group: 'Kartons', name: 'Umzugskarton', boxes: [b(0, 0, 0, 60, 34, 33, 'carton', 0.8)] };
