/* Flora
   The forest's geometry library: pines, dead trees, birches, undergrowth and
   grass, each in several variants built once from the seeded RNG. world.js
   picks from these per biome and bakes them into per-chunk meshes.
   Every tree entry is { geo, top, trunkR }.
*/
import * as THREE from 'three';
import { rand, rr } from './config.js';
import { mergeParts, CYL, B, P, lumpy } from './geometry.js';

const V = THREE.Vector3, ORIGIN = new V();
export const pick = list => list[(rand() * list.length) | 0];
const TAU = Math.PI * 2;

// An open, tapered cylinder (cheaper than CYL for limbs you never see the ends of)
const tube = (r0, r1, len, sides) => { const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true); g.translate(0, len / 2, 0); return g; };
// Direction of a part placed with P(..., 0, yaw, tilt, ..., 'YZX'): tilted from vertical, then turned
const limbDir = (yaw, tilt) => new V(-Math.cos(yaw) * Math.sin(tilt), Math.cos(tilt), Math.sin(yaw) * Math.sin(tilt));
// One tapered limb from p along (yaw, tilt); returns its far end
function limb(parts, c, p, yaw, tilt, len, r0, r1, sides = 4) {
  parts.push(P(tube(r0, r1, len, sides), c, p.x, p.y, p.z, 0, yaw, tilt, 1, 1, 1, 'YZX'));
  return p.clone().addScaledVector(limbDir(yaw, tilt), len);
}
// A branch of n segments whose tilt changes by `curl` per segment (negative curls up, like fingers)
function branch(parts, c, p, yaw, tilt, len, r0, n, curl, twigs = 0) {
  let r = r0;
  for (let i = 0; i < n; i++) {
    const seg = len / n, r1 = r * 0.6, end = limb(parts, c, p, yaw + rr(-0.25, 0.25), tilt, seg, r, r1);
    for (let k = 0; k < twigs; k++) limb(parts, c, p.clone().lerp(end, rr(0.3, 0.9)), yaw + rr(-1.3, 1.3), tilt + rr(-0.6, 0.2), seg * rr(0.35, 0.6), r1 * 0.7, 0.005, 3);
    p = end; tilt += curl; r = r1;
  }
  return p;
}
const topOf = parts => { const g = mergeParts(parts); g.computeBoundingBox(); return { geo: g, top: g.boundingBox.max.y }; };

// ---------- Pines ----------
const C = (a, b) => [new THREE.Color(a), new THREE.Color(b)];
const PAL = {
  green: C(0x263a2a, 0x314a37), blue: C(0x213536, 0x2c4444), olive: C(0x2e3824, 0x3a4630),
  dark: C(0x1b261f, 0x243229), rust: C(0x4a3a26, 0x5b4a31), sick: C(0x3a3d26, 0x4a4a2e),
};
function pine({ h, tiers, r, cols, seg = 7, trunkR = 0.24, bark = 0x3d2f23, taper = 0.6, low = 0.43, high = 0.91, hMul = 1, skip = [], shift = 0, broken = 0, stubs = 0, caps = true }) {
  const parts = [], keep = tiers - broken;
  const trunkH = broken ? h * (low + (high - low) * ((keep - 1) / (tiers - 1))) + rr(0.9, 1.6) : h;
  parts.push(P(CYL(trunkR * (broken ? 0.7 : 0.42), trunkR, trunkH, caps ? 6 : 5), bark, 0, trunkH / 2, 0));
  for (let i = 0; i < keep; i++) {
    if (skip.includes(i)) continue;
    const t = tiers > 1 ? i / (tiers - 1) : 0, ri = r * (1 - t * taper) * rr(0.88, 1.1), hi = (0.9 + ri * 1.1) * hMul * rr(0.9, 1.1);
    const c = cols[0].clone().lerp(cols[1], t).multiplyScalar(rr(0.88, 1.08));
    parts.push(P(new THREE.ConeGeometry(ri, hi, seg, 1, !caps), c, shift * t * t, h * (low + (high - low) * t), 0, rr(-0.07, 0.07), rr(0, TAU), rr(-0.07, 0.07) - shift * t * 0.15));
  }
  if (broken) {
    // Snapped top: a splintered spike, and the broken crown hanging upside down beside the trunk
    for (let k = 0; k < 3; k++) parts.push(P(new THREE.ConeGeometry(trunkR * 0.3, rr(0.6, 1.5), 4), bark, rr(-0.06, 0.06), trunkH + 0.3, rr(-0.06, 0.06), rr(-0.35, 0.35), rr(0, TAU), rr(-0.35, 0.35)));
    const rt = r * (1 - ((keep) / (tiers - 1)) * taper);
    parts.push(P(new THREE.ConeGeometry(rt, 0.9 + rt * 1.1, seg), cols[0].clone().lerp(new THREE.Color(0x4a3a26), 0.6), 0.45, trunkH - rr(1.6, 2.4), 0.1, 0, rr(0, TAU), rr(2.1, 2.6)));
  }
  for (let k = 0; k < stubs; k++) branch(parts, bark, new V(0, rr(1.8, h * 0.62), 0), rr(0, TAU), rr(1.25, 1.75), rr(0.5, 1.4), 0.045, 1, 0.2);
  return { ...topOf(parts), trunkR };
}

// ---------- Dead trees ----------
const BARK = [0x4f463c, 0x4a4239, 0x554b40, 0x463f38];
function deadTree(kind) {
  const parts = [], bark = pick(BARK), yaw = rr(0, TAU);
  let trunkR = 0.3;
  if (kind === 'claw') {            // branches that curl upward like fingers
    const h = rr(8, 10), mid = limb(parts, bark, ORIGIN, yaw, rr(0.02, 0.08), h * 0.55, 0.3, 0.2, 5);
    const tip = limb(parts, bark, mid, yaw + rr(-1, 1), rr(0.05, 0.2), h * 0.45, 0.2, 0.07, 5);
    for (let i = 0; i < 7; i++) {
      const t = rr(0.3, 0.95), s = t < 0.55 ? ORIGIN.clone().lerp(mid, t / 0.55) : mid.clone().lerp(tip, (t - 0.55) / 0.45);
      branch(parts, bark, s, rr(0, TAU), rr(1.0, 1.4), rr(1.4, 2.8) * (1.2 - t * 0.5), 0.08, 3, -0.42);
    }
  } else if (kind === 'spindly') {  // many thin branches with twigs
    const h = rr(9, 11), tip = limb(parts, bark, ORIGIN, yaw, rr(0, 0.05), h, 0.26, 0.05, 5);
    for (let i = 0; i < 9; i++) branch(parts, bark, ORIGIN.clone().lerp(tip, rr(0.3, 0.92)), rr(0, TAU), rr(0.7, 1.25), rr(1.3, 2.6), 0.06, 2, 0.12, 1);
    trunkR = 0.26;
  } else if (kind === 'hunched') { // trunk bent over, branches hanging like arms
    let p = ORIGIN;
    const segs = [[0.06, 3.4], [0.35, 2.6], [0.8, 2.2]], rs = [0.32, 0.24, 0.16, 0.08];
    const joints = segs.map(([tilt, len], i) => (p = limb(parts, bark, p, yaw, tilt + rr(-0.05, 0.05), len * rr(0.9, 1.15), rs[i], rs[i + 1], 5)));
    for (let i = 0; i < 7; i++) {
      const j = joints[(rand() * 3) | 0], s = (i < 2 ? ORIGIN : joints[0]).clone().lerp(j, rr(0.4, 1));
      branch(parts, bark, s, yaw + rr(-1.6, 1.6), rr(1.25, 1.6), rr(1.6, 2.8), 0.06, 3, 0.32);
    }
    trunkR = 0.32;
  } else if (kind === 'forked') {  // splits into two leaders
    const base = limb(parts, bark, ORIGIN, yaw, rr(0, 0.05), rr(3.8, 5), 0.3, 0.22, 5);
    for (const s of [0, Math.PI + rr(-0.4, 0.4)]) {
      const tip = limb(parts, bark, base, yaw + s, rr(0.22, 0.4), rr(3.8, 5), 0.2, 0.06, 5);
      for (let i = 0; i < 3; i++) branch(parts, bark, base.clone().lerp(tip, rr(0.35, 0.9)), rr(0, TAU), rr(0.9, 1.25), rr(1.2, 2.2), 0.06, 2, -0.25, 1);
    }
  } else {                          // snag: a broken stump of a trunk with a splintered top
    const h = rr(3, 5.2);
    parts.push(P(CYL(0.28, 0.37, h, 6), bark, 0, h / 2, 0));
    for (let k = 0; k < 4; k++) { const a = rr(0, TAU); parts.push(P(new THREE.ConeGeometry(rr(0.06, 0.13), rr(0.5, 1.3), 4), bark, Math.cos(a) * 0.14, h + 0.25, Math.sin(a) * 0.14, rr(-0.4, 0.4), rr(0, TAU), rr(-0.4, 0.4))); }
    for (let k = 0; k < 2; k++) branch(parts, bark, new V(0, rr(1.5, h - 0.5), 0), rr(0, TAU), rr(1.2, 1.5), rr(0.5, 1.0), 0.06, 1, 0.1);
    trunkR = 0.37;
  }
  return { ...topOf(parts), trunkR };
}

// ---------- Birches: pale bare trunks with dark knots, often in pairs, like eyes ----------
function birch(twin) {
  const parts = [], bark = pick([0xa39d90, 0x9a958a, 0xaaa396]), knot = 0x1b1916, yaw = rr(0, TAU);
  for (let k = 0; k < (twin ? 2 : 1); k++) {
    const h = rr(9, 12) * (k ? 0.85 : 1), lean = twin ? rr(0.08, 0.16) : rr(0, 0.05), dir = yaw + k * Math.PI;
    const mid = limb(parts, bark, ORIGIN, dir, lean, h * 0.5, 0.17, 0.12, 6);
    const tip = limb(parts, bark, mid, dir + rr(-0.5, 0.5), lean * 0.5 + rr(0, 0.08), h * 0.5, 0.12, 0.03, 5);
    for (let i = 0; i < 6; i++) branch(parts, bark, mid.clone().lerp(tip, rr(0, 0.9)), rr(0, TAU), rr(0.45, 0.85), rr(1, 2.2), 0.035, 2, -0.1, 1);
    // Knots on the lower trunk: lenticel bands, and slanted pairs at eye height
    const knotAt = (y, a, w, h2, rz) => {
      const t = y / (h * 0.5), s = ORIGIN.clone().lerp(mid, t), r = 0.17 - 0.05 * t + 0.006;
      parts.push(B(w, h2, 0.02, s.x + Math.cos(a) * r, s.y, s.z + Math.sin(a) * r, knot, 0, Math.PI / 2 - a, rz));
    };
    for (let i = 0; i < 6; i++) knotAt(rr(0.4, h * 0.45), rr(0, TAU), rr(0.06, 0.14), 0.018, rr(-0.1, 0.1));
    for (let i = 0; i < 2; i++) { const y = rr(1.3, 2.3), a = rr(0, TAU); knotAt(y, a - 0.3, 0.075, 0.028, 0.25); knotAt(y, a + 0.3, 0.075, 0.028, -0.25); }
  }
  return { ...topOf(parts), trunkR: 0.17 };
}

// Several builds of each kind so no two neighbours match
const many = (n, f) => Array.from({ length: n }, f);
export const TREES = {
  standard: [pine({ h: 10.5, tiers: 4, r: 2.5, cols: PAL.green }), pine({ h: 11, tiers: 5, r: 2.6, cols: PAL.blue }), pine({ h: 10, tiers: 4, r: 2.4, cols: PAL.olive })],
  spruce: many(2, () => pine({ h: rr(12, 14), tiers: 6, r: 1.7, taper: 0.7, hMul: 1.15, low: 0.3, cols: PAL.dark, seg: 6, trunkR: 0.2 })),
  fir: many(2, () => pine({ h: rr(8, 9), tiers: 3, r: 3.1, taper: 0.55, hMul: 0.85, low: 0.36, high: 0.85, cols: PAL.olive, trunkR: 0.3 })),
  young: many(2, () => pine({ h: rr(4.5, 6), tiers: 3, r: 1.5, low: 0.35, cols: PAL.green, trunkR: 0.12, seg: 6 })),
  scraggly: [pine({ h: 11, tiers: 5, r: 2.2, skip: [1, 2], stubs: 5, cols: PAL.dark }), pine({ h: 10, tiers: 4, r: 2.2, skip: [1], stubs: 4, cols: PAL.sick })],
  broken: many(2, () => pine({ h: 11, tiers: 5, r: 2.4, broken: 2, stubs: 2, cols: PAL.green })),
  dying: [pine({ h: 10, tiers: 4, r: 2.3, skip: [2], stubs: 3, cols: PAL.rust }), pine({ h: 9.5, tiers: 4, r: 2.2, stubs: 2, cols: PAL.sick })],
  windswept: [pine({ h: 10, tiers: 5, r: 2.1, shift: 1.1, cols: PAL.blue }), pine({ h: 9, tiers: 4, r: 2.3, shift: -0.9, stubs: 2, cols: PAL.olive })],
  claw: many(2, () => deadTree('claw')),
  spindly: [deadTree('spindly')],
  hunched: many(2, () => deadTree('hunched')),
  forked: [deadTree('forked')],
  snag: many(2, () => deadTree('snag')),
  birch: many(2, () => birch(false)),
  birchTwin: [birch(true)],
  // The wall of trees past the edge of the world: seen only from a distance, so cheaper
  wall: [pine({ h: 11, tiers: 3, r: 2.6, seg: 5, cols: PAL.green, caps: false }), pine({ h: 12.5, tiers: 4, r: 2, seg: 5, taper: 0.65, cols: PAL.dark, caps: false }), pine({ h: 10, tiers: 3, r: 2.8, seg: 5, cols: PAL.blue, caps: false })],
};

// ---------- Undergrowth ----------
export const PROPS = {
  rock: [0x5b5f5e, 0x4f574a, 0x5f5c58].map((c, i) => mergeParts([{ g: lumpy(new THREE.IcosahedronGeometry(1, 0), 0.22 + i * 0.05, 0.7 + i * 0.05), c }])),
  log: [
    (() => { const g = CYL(0.28, 0.34, 5, 7); g.rotateZ(Math.PI / 2); return mergeParts([{ g, c: 0x40322a }, P(CYL(0.04, 0.08, 0.9, 4), 0x40322a, 0.8, 0.45, 0.1, 0.3, 0, -0.4)]); })(),
    (() => { const g = CYL(0.24, 0.3, 4.2, 6); g.rotateZ(Math.PI / 2); return mergeParts([{ g, c: 0x33291f }, P(new THREE.ConeGeometry(0.2, 0.7, 4), 0x33291f, 2.3, 0, 0, 0, 0, -Math.PI / 2 + 0.3), P(CYL(0.03, 0.06, 1.1, 4), 0x33291f, -0.9, 0.5, 0, -0.5, 0, 0.3)]); })(),
  ],
  bush: [mergeParts([
    { g: lumpy(new THREE.IcosahedronGeometry(1, 0), 0.3, 0.55), c: 0x223223 },
    { g: lumpy(new THREE.IcosahedronGeometry(0.7, 0), 0.3, 0.6), c: 0x273827, m: new THREE.Matrix4().makeTranslation(0.7, 0.05, 0.3) },
  ])],
  bramble: many(2, () => {
    const parts = [], c = pick([0x3b3027, 0x2f2a22]);
    for (let i = 0; i < 12; i++) branch(parts, c, new V(rr(-0.15, 0.15), 0, rr(-0.15, 0.15)), rr(0, TAU), rr(0.25, 1.2), rr(0.6, 1.4), 0.02, 2, 0.25, 1);
    return mergeParts(parts);
  }),
  fern: many(2, () => {
    const parts = [], n = 8 + ((rand() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const g = new THREE.ConeGeometry(0.11, rr(0.7, 1.0), 4); g.translate(0, g.parameters.height / 2, 0);
      parts.push(P(g, pick([0x2b3a25, 0x34452b, 0x2f3d27]), 0, 0, 0, 0, (i / n) * TAU + rr(-0.2, 0.2), rr(0.85, 1.25), 0.22, 1, 1, 'YZX'));
    }
    return mergeParts(parts);
  }),
  stump: [
    mergeParts([P(CYL(0.3, 0.38, 0.55, 7), 0x3d3027, 0, 0.27, 0), P(CYL(0.29, 0.29, 0.02, 7), 0x6b5a44, 0, 0.55, 0)]),
    mergeParts([P(CYL(0.3, 0.4, 0.8, 7), 0x3a2e25, 0, 0.4, 0), ...[0, 1, 2].map(k => P(new THREE.ConeGeometry(0.1, rr(0.4, 0.8), 4), 0x3a2e25, Math.cos(k * 2.1) * 0.15, 0.95, Math.sin(k * 2.1) * 0.15, rr(-0.3, 0.3), 0, rr(-0.3, 0.3)))]),
  ],
};
// Grass tufts: thin open blades. Field grass is dry and pale; forest grass darker.
function tuft(n, hMin, hMax, cols) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const h = rr(hMin, hMax), g = new THREE.ConeGeometry(rr(0.02, 0.035), h, 3, 1, true); g.translate(0, h / 2, 0);
    parts.push(P(g, pick(cols), rr(-0.12, 0.12), 0, rr(-0.12, 0.12), 0, rr(0, TAU), rr(0.05, 0.42), 1, 1, 1, 'YZX'));
  }
  return mergeParts(parts);
}
const DRY = [0x6b6848, 0x5f5c3e, 0x77714d, 0x535539], DAMP = [0x3a4530, 0x44503a, 0x39402c];
PROPS.grass = [tuft(8, 0.7, 1.3, DRY), tuft(7, 0.55, 1.0, DRY), tuft(6, 0.8, 1.45, DRY)];
PROPS.forestGrass = [tuft(6, 0.35, 0.7, DAMP), tuft(5, 0.3, 0.6, DAMP)];

// A stick effigy hanging from a length of twine. Origin = where the figure is tied on.
export const EFFIGY = (() => {
  const s = 0x5c4a36, tw = 0x2a2118, parts = [P(CYL(0.003, 0.003, 2.2, 3), 0x3b352c, 0, 1.1, 0)];
  parts.push(B(0.02, 0.7, 0.02, 0, -0.42, 0, s), B(0.5, 0.018, 0.018, 0, -0.28, 0, s, 0, 0, 0.12), B(0.16, 0.02, 0.02, 0, -0.1, 0, s, 0, 0, -0.5), B(0.16, 0.02, 0.02, 0, -0.1, 0, s, 0, 0, 0.5));
  parts.push(B(0.018, 0.45, 0.018, 0.09, -0.92, 0, s, 0, 0, 0.35), B(0.018, 0.45, 0.018, -0.09, -0.92, 0, s, 0, 0, -0.35));
  parts.push(B(0.05, 0.05, 0.05, 0, -0.28, 0, tw), B(0.045, 0.045, 0.045, 0, -0.1, 0, tw), B(0.045, 0.06, 0.045, 0, -0.72, 0, tw));
  return mergeParts(parts);
})();
