// Furniture catalog. Every piece is a list of axis-aligned boxes in cm.
// Local axes: x = length, y = height, z = depth (0 = front edge of the seat, max = back).
// Each box is both what you see and what collides, so nesting pieces works exactly.
//
// To add furniture: write a function that returns boxes and add an entry to CATALOG.
// Small loose parts (cushions) get `loose: true`: the solver packs them after the big pieces, largest first.

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
const BACK_TOP = ARM_TOP;  // back cushions end flush with the armrests
const FRAME_TOP = ARM_TOP;
const CUSHION_D = 54;      // seat cushion depth, back cushions behind it
const FRAME_Z = 70;        // back frame starts here

function mirrorX(boxes, len) {
  return boxes.map((x) => ({ ...x, min: [len - x.max[0], x.min[1], x.min[2]], max: [len - x.min[0], x.max[1], x.max[2]] }));
}

// A side part without its cushions: armrest on one end, open end that docks to the corner piece.
function couchSide(len, armSide) {
  const boxes = [
    b(0, LEG, 0, ARM, ARM_TOP, DEPTH, 'fabric', 5),
    b(ARM, LEG, 0, len, SEAT_BASE, FRAME_Z, 'fabric', 2),
    b(ARM, LEG, FRAME_Z, len, FRAME_TOP, DEPTH, 'fabric', 3),
    leg(ARM / 2, 8), leg(ARM / 2, DEPTH - 8), leg(len - 6, 8), leg(len - 6, DEPTH - 8),
  ];
  return armSide === 'right' ? mirrorX(boxes, len) : boxes;
}

// Widths of the two cushion pairs on a side part, split on whole centimetres to stay on the 1 cm grid.
function sideCushions(len) {
  const a = Math.floor((len - ARM) / 2);
  return [a, len - ARM - a];
}

// The corner piece without its cushions: backrest frame on two sides, no armrest.
const CORNER_X = 87;
const CORNER_SIDE = CORNER_X - 15;
const CORNER_SEAT = CORNER_X - 31;
function couchCorner() {
  return [
    b(0, LEG, FRAME_Z, CORNER_X, FRAME_TOP, DEPTH, 'fabric', 3),
    b(CORNER_SIDE, LEG, 0, CORNER_X, FRAME_TOP, FRAME_Z, 'fabric', 3),
    b(0, LEG, 0, CORNER_SIDE, SEAT_BASE, FRAME_Z, 'fabric', 2),
    leg(6, 8), leg(6, DEPTH - 8), leg(CORNER_X - 6, 8), leg(CORNER_X - 6, DEPTH - 8),
  ];
}

// Loose cushions, standing as they sit on the couch.
function seatCushion(w) {
  return [b(0, 0, 0, w, SEAT_TOP - SEAT_BASE, CUSHION_D, 'cushion', 6)];
}

function backCushion(w) {
  return [b(0, 0, 0, w, BACK_TOP - SEAT_BASE, FRAME_Z - CUSHION_D, 'cushion', 7)];
}

const SEATS = [CORNER_SEAT, ...sideCushions(153), ...sideCushions(186)];
// the corner's second back cushion stands across, in front of its side frame
const BACKS = [CORNER_SIDE, CUSHION_D, ...sideCushions(153), ...sideCushions(186)];

function mattress(len, width, height) {
  return [b(0, 0, 0, len, height, width, 'mattress', 6)];
}

export const CATALOG = [
  { id: 'couch-corner', group: 'Couch', name: 'Couch: Eckteil', boxes: couchCorner() },
  { id: 'couch-side-153', group: 'Couch', name: 'Couch: Seitenteil 1,53 m', boxes: couchSide(153, 'left') },
  { id: 'couch-side-186', group: 'Couch', name: 'Couch: Seitenteil 1,86 m', boxes: couchSide(186, 'right') },
  ...SEATS.map((w, i) => ({ id: `seat-${i + 1}`, group: 'Kissen', name: `Sitzkissen ${i + 1}`, loose: true, boxes: seatCushion(w) })),
  ...BACKS.map((w, i) => ({ id: `back-${i + 1}`, group: 'Kissen', name: `Rückenkissen ${i + 1}`, loose: true, boxes: backCushion(w) })),
  { id: 'mattress-1', group: 'Matratzen', name: 'Matratze 1', boxes: mattress(200, 90, 20) },
  { id: 'mattress-2', group: 'Matratzen', name: 'Matratze 2', boxes: mattress(200, 90, 20) },
];

// Standard moving box (L × H × T = 60 × 34 × 33 cm). Not part of the catalog: the game hands out as many as wanted.
export const CARTON = { id: 'carton', group: 'Kartons', name: 'Umzugskarton', boxes: [b(0, 0, 0, 60, 34, 33, 'carton', 0.8)] };
