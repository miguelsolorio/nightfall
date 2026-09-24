/* World generation
   Terrain, the forest (varied trees per biome, baked per chunk for distance
   culling), open fields, landmarks (cabin, well, fence, stone circle, boulders,
   graveyard, scarecrow post) and the collision world.
*/
import * as THREE from 'three';
import { CFG, DEBUG, clamp, smoothstep, R, rand, rr, fbm, vnoise } from './config.js';
import { mat, mergeParts, bakeMesh, CYL, B, P, lumpy, glowTex, vcMat } from './geometry.js';
import { TREES, PROPS, EFFIGY, pick } from './flora.js';
import { scene, camera } from './scene.js';

const buildStart = performance.now();
const TAU = Math.PI * 2;

export const CABIN = { x: 36, z: -50, rot: 0.5 };
export const WELL = { x: -56, z: 20 };
export const CIRCLE = { x: -38, z: -78 };
export const BOULDERS = { x: 82, z: 34 };
export const FENCE = [[-26, 62], [-10, 71], [6, 75], [22, 69]];
// Open fields: the Hollow Field (scarecrow), the old pasture past the fence, the graveyard
export const MEADOWS = [
  { x: 60, z: -4, r: 30 },
  { x: -4, z: 90, r: 19 },
  { x: -82, z: -30, r: 20 },
];
export const HOLLOW = { x: 58, z: -2 };           // the scarecrow's post
export const GRAVEYARD = { x: -82, z: -30 };
const PASTURE = MEADOWS[1];
const CLEARINGS = [
  { x: 0, z: 0, r: 7 }, { x: CABIN.x, z: CABIN.z, r: 10 }, { x: WELL.x, z: WELL.z, r: 6.5 },
  { x: CIRCLE.x, z: CIRCLE.z, r: 9.5 }, { x: BOULDERS.x, z: BOULDERS.z, r: 5.5 },
  { x: GRAVEYARD.x, z: GRAVEYARD.z, r: 8.5 }, { x: HOLLOW.x, z: HOLLOW.z, r: 3 },
];
export const cabinToWorld = (lx, lz) => { const c = Math.cos(CABIN.rot), s = Math.sin(CABIN.rot); return { x: CABIN.x + lx * c + lz * s, z: CABIN.z - lx * s + lz * c }; };
function distToFence(x, z) {
  let best = 1e9;
  for (let i = 0; i < FENCE.length - 1; i++) {
    const [ax, az] = FENCE[i], [bx, bz] = FENCE[i + 1];
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
const inClearing = (x, z, pad = 0) => CLEARINGS.some(c => Math.hypot(x - c.x, z - c.z) < c.r + pad) || distToFence(x, z) < 2.6 + pad;

// How open is the ground here? 0 = forest, 1 = deep in a field. Edges are ragged.
export function meadowAt(x, z) {
  let o = 0;
  for (const m of MEADOWS) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d > m.r * 1.2 + 5) continue;
    const edge = m.r * (0.82 + 0.36 * fbm(x * 0.035 + m.x, z * 0.035 - m.z));
    o = Math.max(o, smoothstep(edge + 5, edge - 5, d));
  }
  return o;
}
// Blighted ground around the cabin, the stone circle and the graveyard: dead trees, ash
const blightAt = (x, z) => Math.max(smoothstep(30, 16, Math.hypot(x - CABIN.x, z - CABIN.z)), smoothstep(30, 16, Math.hypot(x - CIRCLE.x, z - CIRCLE.z)), smoothstep(34, 22, Math.hypot(x - GRAVEYARD.x, z - GRAVEYARD.z)));

// Terrain height: rolling fBm hills, gentled in the fields, flattened under landmarks
const rawHeight = (x, z) => (fbm(x * 0.012 + 10, z * 0.012 - 7) - 0.5) * 14 + (fbm(x * 0.07, z * 0.07) - 0.5) * 1.4;
const MEADOW_H = MEADOWS.map(m => rawHeight(m.x, m.z));
const FLAT_SPOTS = [
  { x: 0, z: 0, r: 5 }, { x: CABIN.x, z: CABIN.z, r: 6.5 }, { x: WELL.x, z: WELL.z, r: 3.5 }, { x: CIRCLE.x, z: CIRCLE.z, r: 7 },
  { x: GRAVEYARD.x, z: GRAVEYARD.z, r: 8 },
].map(f => ({ ...f, h: rawHeight(f.x, f.z) }));
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  for (let i = 0; i < MEADOWS.length; i++) {
    const m = MEADOWS[i], d = Math.hypot(x - m.x, z - m.z);
    if (d < m.r + 12) { const mh = MEADOW_H[i]; h += (mh + (h - mh) * 0.35 - h) * smoothstep(m.r + 12, m.r * 0.5, d); }
  }
  for (const f of FLAT_SPOTS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + 7) h += (f.h - h) * smoothstep(f.r + 7, f.r, d);
  }
  return h;
}
export function insideCabin(x, z) {
  const dx = x - CABIN.x, dz = z - CABIN.z, c = Math.cos(CABIN.rot), s = Math.sin(CABIN.rot);
  return Math.abs(dx * c - dz * s) < 3.05 && Math.abs(dx * s + dz * c) < 2.55;
}
export const groundAt = (x, z) => heightAt(x, z) + (insideCabin(x, z) ? 0.25 : 0);

// Colliders: circles in a spatial hash + a few oriented boxes (cabin walls)
const GRID = 4;
const colGrid = new Map();
const cellKey = (cx, cz) => (cx + 512) * 1024 + (cz + 512);
function addCircle(x, z, r, occ = true) {
  const k = cellKey(Math.floor(x / GRID), Math.floor(z / GRID));
  let list = colGrid.get(k); if (!list) colGrid.set(k, list = []);
  list.push({ x, z, r, occ });
}
const boxes = [];
function addOBB(ox, oz, rot, lx, lz, hx, hz, occ = true) {
  const c = Math.cos(rot), s = Math.sin(rot);
  boxes.push({ x: ox + lx * c + lz * s, z: oz - lx * s + lz * c, hx, hz, c, s, rad: Math.hypot(hx, hz), occ });
}
// Push a point {x,z} out of every nearby obstacle
export function resolveCollision(p, r) {
  for (let it = 0; it < 2; it++) {
    const cx = Math.floor(p.x / GRID), cz = Math.floor(p.z / GRID);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const list = colGrid.get(cellKey(ix, iz)); if (!list) continue;
      for (const c of list) {
        const dx = p.x - c.x, dz = p.z - c.z, m = c.r + r, d2 = dx * dx + dz * dz;
        if (d2 < m * m && d2 > 1e-8) { const d = Math.sqrt(d2), k = (m - d) / d; p.x += dx * k; p.z += dz * k; }
      }
    }
    for (const b of boxes) {
      if (Math.abs(p.x - b.x) > b.rad + r || Math.abs(p.z - b.z) > b.rad + r) continue;
      const dx = p.x - b.x, dz = p.z - b.z;
      let lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      const qx = clamp(lx, -b.hx, b.hx), qz = clamp(lz, -b.hz, b.hz);
      const ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; lx += ex * k; lz += ez * k; }
      else if (b.hx - Math.abs(lx) < b.hz - Math.abs(lz)) lx = Math.sign(lx || 1) * (b.hx + r);
      else lz = Math.sign(lz || 1) * (b.hz + r);
      p.x = b.x + lx * b.c + lz * b.s; p.z = b.z - lx * b.s + lz * b.c;
    }
  }
}
export function blocked(x, z, r) { const q = { x, z }; resolveCollision(q, r); return Math.abs(q.x - x) + Math.abs(q.z - z) > 0.01; }
function segHitsBox(ax, az, bx, bz, b) {
  const l = (x, z) => { const dx = x - b.x, dz = z - b.z; return [dx * b.c - dz * b.s, dx * b.s + dz * b.c]; };
  const [x0, z0] = l(ax, az), [x1, z1] = l(bx, bz);
  let t0 = 0, t1 = 1;
  for (const [p0, d, h] of [[x0, x1 - x0, b.hx], [z0, z1 - z0, b.hz]]) {
    if (Math.abs(d) < 1e-9) { if (p0 < -h || p0 > h) return false; continue; }
    let ta = (-h - p0) / d, tb = (h - p0) / d; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
  }
  return true;
}
// Is the straight line a→b blocked by a trunk, boulder or wall?
export function losBlocked(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 1) return false;
  const ux = dx / len, uz = dz / len, visited = new Set(), steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, k = cellKey(Math.floor((ax + dx * t) / GRID), Math.floor((az + dz * t) / GRID));
    if (visited.has(k)) continue; visited.add(k);
    const list = colGrid.get(k); if (!list) continue;
    for (const c of list) {
      if (!c.occ) continue;
      const px = c.x - ax, pz = c.z - az, proj = px * ux + pz * uz;
      if (proj < 0.7 || proj > len - 0.7) continue;
      const qx = px - ux * proj, qz = pz - uz * proj;
      if (qx * qx + qz * qz < c.r * c.r * 0.7) return true;
    }
  }
  for (const b of boxes) if (b.occ && segHitsBox(ax, az, bx, bz, b)) return true;
  return false;
}

// --- Terrain ---
{
  const seg = 150, geo = new THREE.PlaneGeometry(CFG.TERRAIN, CFG.TERRAIN, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const moss = new THREE.Color(0x34422a), dirt = new THREE.Color(0x4a3d2e), litter = new THREE.Color(0x574433), c = new THREE.Color();
  const dryA = new THREE.Color(0x4f4d34), dryB = new THREE.Color(0x615d3d), bare = new THREE.Color(0x3f3a2b), ash = new THREE.Color(0x2f2b27), f = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const n = fbm(x * 0.05 + 3, z * 0.05), m = vnoise(x * 0.4, z * 0.4);
    c.copy(moss).lerp(dirt, smoothstep(0.35, 0.65, n)).lerp(litter, m * 0.35);
    const open = meadowAt(x, z);
    if (open > 0) c.lerp(f.copy(dryA).lerp(dryB, m).lerp(bare, smoothstep(0.55, 0.75, n) * 0.6), open * 0.85);
    c.lerp(ash, blightAt(x, z) * 0.45);
    if (inClearing(x, z, -1)) c.lerp(dirt, 0.5);
    c.multiplyScalar(0.8 + m * 0.35);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, vcMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
}

// --- Chunks: every static prop in a 30 m cell is baked into a few meshes, toggled by distance ---
// Layers: solid (trees, rocks, logs — cast shadows), soft (undergrowth), grass (sways)
const HALF = CFG.TERRAIN / 2;
export const chunks = new Map();
function chunkAt(x, z) {
  const cx = Math.floor((x + HALF) / CFG.CHUNK), cz = Math.floor((z + HALF) / CFG.CHUNK), k = cx * 100 + cz;
  let ch = chunks.get(k);
  if (!ch) {
    ch = { group: new THREE.Group(), x: -HALF + (cx + 0.5) * CFG.CHUNK, z: -HALF + (cz + 0.5) * CFG.CHUNK, items: { solid: [], soft: [], grass: [] } };
    scene.add(ch.group); chunks.set(k, ch);
  }
  return ch;
}
function addItem(layer, geo, x, z, m, tint) { chunkAt(x, z).items[layer].push({ geo, m, tint }); }
// A slightly off-grey tint so neighbouring copies never match exactly
const tint = (s, j = 0.07) => ({ r: s * (1 + rr(-j, j)), g: s * (1 + rr(-j, j)), b: s * (1 + rr(-j, j)) });

// --- The forest ---
export const PINES = [], DEADS = [];
function placeTree(x, z, t, dead, { scale = rr(0.8, 1.4), shade = rr(0.72, 1.12), charred = false, lean } = {}) {
  lean ??= rand() < 0.12 ? rr(0.08, 0.2) : rr(0, 0.04);
  const la = rr(0, TAU), sy = scale * rr(0.9, 1.2), y = heightAt(x, z) - 0.25;
  const m = mat(x, y, z, Math.cos(la) * lean, rr(0, TAU), Math.sin(la) * lean, scale * rr(0.88, 1.12), sy, scale * rr(0.88, 1.12));
  addItem('solid', t.geo, x, z, m, charred ? tint(rr(0.3, 0.42), 0.04) : tint(shade));
  (dead ? DEADS : PINES).push({ x, z, top: y + t.top * sy });
  if (Math.hypot(x, z) < CFG.WORLD_R + 3) addCircle(x, z, t.trunkR * scale + 0.06);
}
const weighted = w => { let s = 0; for (const k in w) s += w[k]; let r = rand() * s; for (const k in w) if ((r -= w[k]) <= 0) return k; return Object.keys(w)[0]; };
const MIXED = { standard: 5, fir: 2, spruce: 1, scraggly: 1.2, windswept: 1, broken: 0.8, dying: 0.5 };
const OLD = { fir: 3, broken: 2, dying: 2, scraggly: 2, standard: 1, windswept: 1 };
const DEAD = { claw: 3, spindly: 2, hunched: 2, forked: 1.5, snag: 2.5 };
// Biomes from two slow noise fields: spruce thickets, mixed pine, old dying stands, birch groves
const standKind = (x, z) => fbm(x * 0.018 - 20, z * 0.018 + 33);
function chooseTree(x, z, blight) {
  const kind = standKind(x, z);
  if (rand() < (blight > 0.3 ? 0.45 : kind > 0.56 ? 0.28 : 0.13)) return { t: pick(TREES[weighted(DEAD)]), dead: true };
  if (fbm(x * 0.05 + 7, z * 0.05 - 11) > 0.62 && rand() < 0.7) return { t: pick(rand() < 0.2 ? TREES.birchTwin : TREES.birch) };
  if (kind < 0.44) return { t: pick(TREES[rand() < 0.65 ? 'spruce' : 'standard']) };
  return { t: pick(TREES[weighted(kind > 0.56 ? OLD : MIXED)]) };
}
// Jittered grid scatter, density varied by noise; thinning out into the fields; a thick wall past the boundary
{
  const SP = 4.3;
  for (let gx = -HALF; gx < HALF; gx += SP) for (let gz = -HALF; gz < HALF; gz += SP) {
    const x = gx + rr(-1.7, 1.7), z = gz + rr(-1.7, 1.7), d = Math.hypot(x, z);
    if (d > CFG.WORLD_R + 28 || inClearing(x, z)) continue;
    if (d > CFG.WORLD_R + 6) { placeTree(x, z, pick(TREES.wall), false, { lean: 0 }); continue; }
    const open = d < CFG.WORLD_R - 2 ? meadowAt(x, z) : 0;
    if (open > 0 && rand() < open * 1.5) continue;
    const thicket = standKind(x, z) < 0.44;
    const keep = d > CFG.WORLD_R - 3 ? 1 : clamp(0.45 + (fbm(x * 0.03 + 50, z * 0.03) - 0.5) * 1.6 + (thicket ? 0.15 : 0), 0.18, 0.95);
    if (rand() > keep) continue;
    const blight = blightAt(x, z), c = chooseTree(x, z, blight);
    placeTree(x, z, c.t, c.dead, { charred: c.dead && rand() < blight * 0.6 });
    // Thickets crowd the gaps with saplings
    if (thicket && open === 0 && d < CFG.WORLD_R - 4 && rand() < 0.55) {
      const yx = x + SP * 0.5 + rr(-0.6, 0.6), yz = z + SP * 0.5 + rr(-0.6, 0.6);
      if (!inClearing(yx, yz) && !blocked(yx, yz, 0.7)) placeTree(yx, yz, pick(TREES.young), false, { scale: rr(0.6, 1.05) });
    }
  }
  for (let r = CFG.WORLD_R + 1.5; r < CFG.WORLD_R + 9; r += 2.4) {
    const n = Math.floor((TAU * r) / 2.6);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rr(-0.01, 0.01); placeTree(Math.cos(a) * (r + rr(-0.8, 0.8)), Math.sin(a) * (r + rr(-0.8, 0.8)), pick(r > CFG.WORLD_R + 5 ? TREES.wall : TREES.standard), false, { lean: 0 }); }
  }
}
// Rocks, logs, undergrowth
const randomSpot = (rMin, rMax) => { const a = rand() * TAU, d = rMin + Math.sqrt(rand()) * (rMax - rMin); return [Math.cos(a) * d, Math.sin(a) * d]; };
for (let i = 0; i < 420; i++) {
  const [x, z] = randomSpot(0, CFG.WORLD_R + 20);
  if (inClearing(x, z, 1) || (meadowAt(x, z) > 0.6 && rand() < 0.8)) continue;
  const s = 0.22 + Math.pow(rand(), 3) * 1.5;
  addItem('solid', pick(PROPS.rock), x, z, mat(x, heightAt(x, z) - s * 0.25, z, rr(0, 3), rr(0, 6.3), rr(0, 3), s * rr(0.9, 1.4), s, s * rr(0.9, 1.3)), tint(rr(0.75, 1.2)));
  if (s > 0.45) addCircle(x, z, s * 0.9);
}
for (let i = 0; i < 80; i++) {
  const [x, z] = randomSpot(8, CFG.WORLD_R - 2);
  if (inClearing(x, z, 3) || meadowAt(x, z) > 0.5) continue;
  const yaw = rr(0, TAU), dx = Math.cos(yaw), dz = -Math.sin(yaw);
  const h1 = heightAt(x - dx * 2.5, z - dz * 2.5), h2 = heightAt(x + dx * 2.5, z + dz * 2.5);
  addItem('solid', pick(PROPS.log), x, z, mat(x, (h1 + h2) / 2 + 0.22, z, 0, yaw, Math.atan2(h2 - h1, 5), 1, 1, 1, 'YZX'), tint(rr(0.75, 1.15)));
  for (const t of [-1.9, -0.65, 0.65, 1.9]) addCircle(x + dx * t, z + dz * t, 0.36, false);
}
for (const [kind, n, sMin, sMax, open] of [['bush', 700, 0.35, 0.95, 0.5], ['fern', 320, 0.6, 1.1, 0.4], ['bramble', 160, 0.7, 1.3, 0.8], ['forestGrass', 420, 0.8, 1.3, 0.3]]) {
  for (let i = 0; i < n; i++) {
    const [x, z] = randomSpot(0, CFG.WORLD_R + 20);
    if (inClearing(x, z, 0.5) || meadowAt(x, z) > open) continue;
    const s = rr(sMin, sMax);
    addItem(kind === 'forestGrass' ? 'grass' : 'soft', pick(PROPS[kind]), x, z, mat(x, heightAt(x, z) - 0.1, z, 0, rr(0, 6.3), 0, s, s * rr(0.8, 1.3), s), tint(rr(0.7, 1.2)));
  }
}

// --- Landmarks (each merged into a single mesh) ---
function addLandmark(parts, x, z, rot = 0, y = heightAt(x, z)) {
  const mesh = new THREE.Mesh(mergeParts(parts), vcMat);
  mesh.position.set(x, y, z); mesh.rotation.y = rot;
  mesh.castShadow = mesh.receiveShadow = true;
  chunkAt(x, z).group.add(mesh);
  return mesh;
}
// Parts built in world coordinates (spread over a field) → one mesh at the origin
function addWorldMesh(parts, x, z) {
  const mesh = new THREE.Mesh(mergeParts(parts), vcMat);
  mesh.castShadow = mesh.receiveShadow = true;
  chunkAt(x, z).group.add(mesh);
}
// Re-base a group of local parts under a matrix (a tilted cross, a leaning headstone)
const under = (M, list) => list.map(p => ({ g: p.g, c: p.c, m: M.clone().multiply(p.m) }));
// Cabin — door on +z, broken window on -x, hole in the roof
{
  const wall = 0x4d3c2e, roof = 0x2c2724, floor = 0x3b2f25, wood = 0x5b4735, stone = 0x4e4e4c;
  const H = 2.6, hw = 3, hd = 2.5, T = 0.2;
  const prism = CYL(1, 1, 6, 3); prism.rotateZ(Math.PI / 2); prism.rotateX(-Math.PI / 2);
  const parts = [
    B(6.2, 0.25, 5.2, 0, 0.12, 0, floor),
    B(6, H, T, 0, H / 2, -hd + T / 2, wall),
    B(T, H, 5, hw - T / 2, H / 2, 0, wall),
    B(T, 1.0, 5, -hw + T / 2, 0.5, 0, wall), B(T, 0.7, 5, -hw + T / 2, 2.25, 0, wall),
    B(T, 0.9, 1.8, -hw + T / 2, 1.45, -1.6, wall), B(T, 0.9, 1.8, -hw + T / 2, 1.45, 1.6, wall),
    B(0.05, 0.13, 1.3, -hw - 0.03, 1.5, 0.1, 0x2f251d, 0.55),              // board hanging across the window
    B(2.45, H, T, -1.775, H / 2, hd - T / 2, wall), B(2.45, H, T, 1.775, H / 2, hd - T / 2, wall),
    B(1.1, 0.6, T, 0, 2.3, hd - T / 2, wall),
    B(1.05, 1.95, 0.07, 0.41, 1.0, hd + 0.54, 0x3a2d22, 0, 1.3, 0),       // door hanging open
    P(prism, wall, 0, H + 0.533, 0, 0, 0, 0, 1, 1.067, 2.887),             // gable
    B(6.7, 0.14, 3.42, 0, 3.38, -1.42, roof, -0.569),
    B(3.6, 0.14, 3.42, -1.55, 3.38, 1.42, roof, 0.569), B(2.2, 0.14, 3.42, 2.25, 3.38, 1.42, roof, 0.569),
    B(0.18, 0.06, 2.2, 0.7, 2.9, 1.6, 0x241f1c, 0.9, 0.3, 0.2),           // snapped rafter
    B(0.7, 5.0, 0.6, -2.2, 2.5, -2.85, stone),                             // chimney
    B(1.6, 0.2, 0.6, 0, 0.1, hd + 0.35, floor),                             // step
    B(1.4, 0.07, 0.8, 1.3, 0.86, -1.3, wood),                               // table
    ...[[-0.62, -0.33], [0.62, -0.33], [-0.62, 0.33], [0.62, 0.33]].map(([a, b]) => B(0.07, 0.8, 0.07, 1.3 + a, 0.65, -1.3 + b, wood)),
    B(0.45, 0.05, 0.45, -0.3, 0.33, -0.6, wood, 1.35, 0.4, 0), B(0.45, 0.5, 0.05, -0.3, 0.5, -0.95, wood, 1.35, 0.4, 0), // tipped chair
    B(0.95, 0.35, 1.9, -2.3, 0.42, -1.4, 0x3d3229),                        // bed frame
  ];
  addLandmark(parts, CABIN.x, CABIN.z, CABIN.rot, heightAt(CABIN.x, CABIN.z));
  const o = [CABIN.x, CABIN.z, CABIN.rot];
  addOBB(...o, 0, -hd + 0.1, 3, 0.1); addOBB(...o, hw - 0.1, 0, 0.1, 2.5); addOBB(...o, -hw + 0.1, 0, 0.1, 2.5);
  addOBB(...o, -1.775, hd - 0.1, 1.225, 0.1); addOBB(...o, 1.775, hd - 0.1, 1.225, 0.1);
  addOBB(...o, 1.3, -1.3, 0.72, 0.42, false); addOBB(...o, -2.3, -1.4, 0.48, 0.95, false); addOBB(...o, -2.2, -2.85, 0.35, 0.3);
}
// Stone well
{
  const parts = [], wood = 0x4d3d2e;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + row * 0.26, sh = 0x50 + ((rand() * 22) | 0);
    parts.push(B(0.56, 0.3, 0.3, Math.cos(a) * 1.05, 0.15 + row * 0.3, Math.sin(a) * 1.05, (sh << 16) | (sh << 8) | (sh - 4), rr(-0.05, 0.05), Math.PI / 2 - a, rr(-0.05, 0.05)));
  }
  const water = new THREE.CircleGeometry(0.95, 12); water.rotateX(-Math.PI / 2);
  parts.push(P(water, 0x030405, 0, 0.05, 0));
  parts.push(B(0.14, 2.3, 0.14, 1.2, 1.15, 0, wood), B(0.14, 2.3, 0.14, -1.2, 1.15, 0, wood));
  const bar = CYL(0.05, 0.05, 2.5, 6); bar.rotateZ(Math.PI / 2); parts.push(P(bar, wood, 0, 2.0, 0));
  parts.push(B(2.9, 0.08, 1.05, 0, 2.45, 0.42, 0x2c2724, 0.6), B(2.9, 0.08, 1.05, 0, 2.45, -0.42, 0x2c2724, -0.6));
  parts.push(P(CYL(0.012, 0.012, 1.1, 3), 0x6b5d49, 0.1, 1.45, 0), P(CYL(0.16, 0.12, 0.26, 8), 0x3c3630, 0.1, 0.8, 0));
  addLandmark(parts, WELL.x, WELL.z);
  addCircle(WELL.x, WELL.z, 1.3);
}
// Broken fence: missing posts, tilted posts, sagging and missing rails
{
  const parts = [], wood = 0x4a3d31, posts = [];
  for (let i = 0; i < FENCE.length - 1; i++) {
    const [ax, az] = FENCE[i], [bx, bz] = FENCE[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 2.2);
    for (let k = 0; k <= n; k++) {
      if (i > 0 && k === 0) continue;
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      posts.push(rand() < 0.16 ? null : { x, z, y: heightAt(x, z), tilt: rand() < 0.3 ? rr(-0.35, 0.35) : 0 });
    }
  }
  posts.forEach((p, i) => {
    if (!p) return;
    parts.push(B(0.13, 1.35, 0.13, p.x, p.y + 0.55, p.z, wood, p.tilt, 0, p.tilt * 0.5));
    addCircle(p.x, p.z, 0.14, false);
    const q = posts[i + 1];
    if (!q) return;
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx), pitch = Math.atan2(q.y - p.y, len);
    for (const [ry, missing] of [[0.45, 0.12], [0.95, 0.3]]) {
      if (rand() < missing) continue;
      const sag = rand() < 0.15 ? rr(-0.35, -0.2) : 0;
      parts.push(B(len + 0.1, 0.07, 0.04, (p.x + q.x) / 2, (p.y + q.y) / 2 + ry + sag * 0.5, (p.z + q.z) / 2, wood, 0, yaw, pitch + sag, 'YZX'));
    }
    for (let t = 0.25; t < len; t += 0.5) addCircle(p.x + dx * t / len, p.z + dz * t / len, 0.12, false);
  });
  addWorldMesh(parts, FENCE[1][0], FENCE[1][1]);
}
// Standing stones with an altar
{
  const parts = [];
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue; // the gap you walk through
    const a = (i / 9) * TAU, x = Math.cos(a) * 5.5, z = Math.sin(a) * 5.5, h = rr(1.8, 2.8), sh = 0x58 + ((rand() * 16) | 0);
    parts.push(B(0.85, h, 0.5, x, h / 2 - 0.1, z, (sh << 16) | (sh << 8) | sh, rr(-0.08, 0.08), Math.PI / 2 - a, rr(-0.1, 0.1)));
    addCircle(CIRCLE.x + x, CIRCLE.z + z, 0.55);
  }
  parts.push(B(1.4, 0.55, 0.9, 0, 0.27, 0, 0x5f605c));
  addLandmark(parts, CIRCLE.x, CIRCLE.z);
  addCircle(CIRCLE.x, CIRCLE.z, 0.75, false);
  // One huge dead tree watching over it
  const x = CIRCLE.x + 8, z = CIRCLE.z - 5;
  placeTree(x, z, TREES.claw[0], true, { scale: 1.7, shade: 0.85, lean: 0.05 });
}
// Boulder cluster (open on one side)
for (let i = 0; i < 6; i++) {
  const a = 0.9 + i * 0.9, s = rr(1.7, 2.4), x = BOULDERS.x + Math.sin(a) * 3.3, z = BOULDERS.z + Math.cos(a) * 3.3;
  addItem('solid', PROPS.rock[0], x, z, mat(x, heightAt(x, z) - s * 0.2, z, rr(0, 3), rr(0, 6), rr(0, 3), s * 1.2, s, s), tint(rr(0.8, 1)));
  addCircle(x, z, s * 0.85);
}
// The graveyard: crooked crosses and leaning headstones in rough rows, and one open grave
{
  const parts = [], wood = 0x4a3d31, rot = 0.3, c = Math.cos(rot), s = Math.sin(rot);
  const cross = fallen => [B(0.09, 1.2, 0.07, 0, 0.45, 0, wood), fallen ? B(0.6, 0.08, 0.07, 0.18, 0.3, 0, wood, 0, 0, 1.1) : B(0.6, 0.08, 0.07, 0, 0.72, 0, wood)];
  const stone = sh => { const g = CYL(0.27, 0.27, 0.13, 10); g.rotateX(Math.PI / 2); const col = (sh << 16) | (sh << 8) | (sh + 2); return [B(0.54, 0.62, 0.13, 0, 0.21, 0, col), P(g, col, 0, 0.52, 0)]; };
  let open = null;
  for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) {
    const lx = k * 2.2 - 3.3 + rr(-0.3, 0.3), lz = row * 2.7 - 4 + rr(-0.3, 0.3), x = lx * c + lz * s, z = -lx * s + lz * c;
    if (!open && row === 2 && k === 1) { open = { x, z }; continue; }
    if (rand() < 0.2) continue;
    const y = heightAt(GRAVEYARD.x + x, GRAVEYARD.z + z) - heightAt(GRAVEYARD.x, GRAVEYARD.z);
    const M = mat(x, y, z, rr(-0.2, 0.2), rot + rr(-0.25, 0.25), rr(-0.2, 0.2));
    parts.push(...under(M, rand() < 0.6 ? cross(rand() < 0.2) : stone(0x4e + ((rand() * 20) | 0))));
    addCircle(GRAVEYARD.x + x, GRAVEYARD.z + z, 0.32, false);
  }
  // The open grave: a black pit, the dirt heaped beside it, a shovel left standing in the mound
  const M = mat(open.x, 0, open.z, 0, rot);
  parts.push(...under(M, [
    B(0.95, 0.03, 2.0, 0, 0.01, 0, 0x030202),
    P(lumpy(new THREE.IcosahedronGeometry(1, 0), 0.25), 0x3b2f25, 1.15, -0.1, 0, 0, 0, 0, 0.55, 0.4, 1.05),
    P(CYL(0.02, 0.02, 1.1, 4), 0x4a3d31, 1.2, 0.65, 0.3, 0.25, 0, -0.2), B(0.2, 0.28, 0.02, 1.08, 0.1, 0.2, 0x3a3b3c, 0.25, 0, -0.2),
  ]));
  addCircle(GRAVEYARD.x + open.x + 1.1 * c, GRAVEYARD.z + open.z - 1.1 * s, 0.7, false);
  addLandmark(parts, GRAVEYARD.x, GRAVEYARD.z);
  placeTree(GRAVEYARD.x + 7, GRAVEYARD.z - 5, TREES.hunched[0], true, { scale: 1.45, shade: 0.8, lean: 0.03 });
}
// The Hollow Field: the scarecrow's bare post (creatures/scarecrow.js hangs it there), a lone tree, stumps
{
  addLandmark([B(0.13, 2.4, 0.13, 0, 1.0, 0, 0x4a3d31), B(0.03, 0.4, 0.02, 0.07, 1.6, 0.05, 0x6b5d49, 0, 0, 0.2)], HOLLOW.x, HOLLOW.z);
  addCircle(HOLLOW.x, HOLLOW.z, 0.2, false);
  placeTree(HOLLOW.x + 11, HOLLOW.z + 8, TREES.hunched[1], true, { scale: 1.6, shade: 0.8, lean: 0.04 });
  for (let i = 0; i < 12; i++) {
    const a = rr(0, TAU), d = rr(6, 26), x = MEADOWS[0].x + Math.cos(a) * d, z = MEADOWS[0].z + Math.sin(a) * d;
    if (inClearing(x, z, 1) || blocked(x, z, 0.6)) continue;
    addItem('solid', pick(PROPS.stump), x, z, mat(x, heightAt(x, z) - 0.05, z, rr(-0.05, 0.05), rr(0, TAU), 0, rr(0.8, 1.3), rr(0.8, 1.2), rr(0.8, 1.3)), tint(rr(0.75, 1.05)));
    addCircle(x, z, 0.4, false);
  }
}
// The old pasture: stone cairns someone kept stacking, and a dead tree or two
{
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = rr(0, TAU), d = rr(3, 13), x = PASTURE.x + Math.cos(a) * d, z = PASTURE.z + Math.sin(a) * d, y = heightAt(x, z);
    if (blocked(x, z, 1)) continue;
    let h = 0;
    for (let k = 0, n = 4 + ((rand() * 3) | 0); k < n; k++) {
      const s = 0.42 * (1 - k / (n + 1)) * rr(0.85, 1.1), sh = 0x52 + ((rand() * 18) | 0);
      parts.push(P(lumpy(new THREE.IcosahedronGeometry(1, 0), 0.2), (sh << 16) | (sh << 8) | sh, x + rr(-0.04, 0.04), y + h + s * 0.45, z + rr(-0.04, 0.04), rr(0, 3), rr(0, 3), rr(0, 3), s * 1.15, s * 0.7, s));
      h += s * 1.05;
    }
    addCircle(x, z, 0.5, false);
  }
  addWorldMesh(parts, PASTURE.x, PASTURE.z);
  placeTree(PASTURE.x - 9, PASTURE.z + 6, TREES.snag[0], true, { scale: 1.2 });
  placeTree(PASTURE.x + 10, PASTURE.z - 3, TREES.dying[0], false, { scale: 1.2, lean: 0.12 });
}
// Tall grass in the fields: denser and taller toward the middle
for (const m of MEADOWS) {
  const n = Math.round(Math.PI * m.r * m.r / 1.8);
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU, d = Math.sqrt(rand()) * m.r * 1.25, x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d;
    const open = meadowAt(x, z);
    if (rand() > open || Math.hypot(x, z) > CFG.WORLD_R - 1 || inClearing(x, z, -5.5) || blocked(x, z, 0.3)) continue;
    const s = rr(0.8, 1.2) * (0.55 + 0.45 * open);
    addItem('grass', pick(PROPS.grass), x, z, mat(x, heightAt(x, z) - 0.05, z, 0, rr(0, TAU), 0, s, s * rr(0.85, 1.2), s), tint(rr(0.75, 1.15)));
  }
}
// Stick effigies hanging at the edge of the pasture, around the stone circle and near the cabin
export const effigies = [];
for (const [cx, cz, dMin, dMax, count] of [[PASTURE.x, PASTURE.z, 16, 26, 4], [CIRCLE.x, CIRCLE.z, 7, 16, 3], [CABIN.x, CABIN.z, 8, 16, 1]]) {
  const near = [...DEADS, ...PINES].filter(t => { const d = Math.hypot(t.x - cx, t.z - cz); return d > dMin && d < dMax; });
  for (let i = 0; i < count && near.length; i++) {
    const t = near.splice((rand() * near.length) | 0, 1)[0], d = Math.hypot(t.x - cx, t.z - cz);
    const x = t.x + (cx - t.x) / d * 1.3, z = t.z + (cz - t.z) / d * 1.3;
    const mesh = new THREE.Mesh(EFFIGY, vcMat);
    mesh.position.set(x, heightAt(x, z) + rr(2.1, 2.7), z); mesh.rotation.y = rr(0, TAU); mesh.castShadow = true;
    mesh.userData = { base: mesh.rotation.y, phase: rr(0, TAU), speed: rr(0.2, 0.4) };
    chunkAt(x, z).group.add(mesh); effigies.push(mesh);
  }
}

// Grass: vertex-colored like everything else, bent by a slow wind in the vertex shader
export const grassUniforms = { uTime: { value: 0 } };
const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true });
grassMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = grassUniforms.uTime;
  sh.vertexShader = 'attribute float sway;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float sw = sway * sway, ph = uTime * 1.3 + position.x * 0.35 + position.z * 0.28;
    transformed.x += (sin(ph) * 0.12 + sin(ph * 2.7 + position.z) * 0.04) * sw;
    transformed.z += cos(ph * 0.8 + position.x * 0.2) * 0.08 * sw;`);
};
// Bake every chunk's props into its meshes
for (const ch of chunks.values()) {
  const { solid, soft, grass } = ch.items;
  if (solid.length) { const m = bakeMesh(solid, vcMat); m.castShadow = m.receiveShadow = true; ch.group.add(m); }
  if (soft.length) { const m = bakeMesh(soft, vcMat); m.receiveShadow = true; ch.group.add(m); }
  if (grass.length) { const m = bakeMesh(grass, grassMat, { sway: true }); m.receiveShadow = true; ch.group.add(m); }
  ch.items = null;
}
export function updateCulling() {
  const r = CFG.CULL_DIST + CFG.CHUNK * 0.71, r2 = r * r;
  for (const ch of chunks.values()) { const dx = ch.x - camera.position.x, dz = ch.z - camera.position.z; ch.group.visible = dx * dx + dz * dz < r2; }
}
// Grass sway and the effigies turning slowly on their strings
export function updateFoliage(t) {
  grassUniforms.uTime.value = t;
  for (const e of effigies) { const u = e.userData; e.rotation.y = u.base + Math.sin(t * u.speed + u.phase) * 0.9; e.rotation.z = Math.sin(t * u.speed * 1.7 + u.phase) * 0.04; }
}

// Low drifting mist billboards, recycled around the player — lower, wider banks over the fields
export const mist = [];
{
  const mm = new THREE.SpriteMaterial({ map: glowTex, color: 0x8190a4, transparent: true, opacity: 0.075, depthWrite: false });
  for (let i = 0; i < CFG.MIST; i++) { const s = new THREE.Sprite(mm); s.scale.set(rr(10, 16), rr(3, 5), 1); s.userData.drift = rr(0.2, 0.6); scene.add(s); mist.push(s); s.position.set(1e4, 0, 0); }
}
export function updateMist(dt) {
  const cx = camera.position.x, cz = camera.position.z;
  for (const s of mist) {
    s.position.x += s.userData.drift * dt; s.position.z += s.userData.drift * 0.4 * dt;
    if (Math.hypot(s.position.x - cx, s.position.z - cz) > 34) {
      let x, z, open = 0;
      for (let k = 0; k < 2 && open < 0.3; k++) { const a = Math.random() * TAU, d = R(8, 30); x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d; open = meadowAt(x, z); }
      const field = open > 0.3;
      s.position.set(x, heightAt(x, z) + (field ? R(0.2, 1.1) : R(0.6, 2.2)), z);
      s.scale.set(field ? R(16, 24) : R(10, 16), field ? R(2.5, 3.5) : R(3, 5), 1);
    }
  }
}
if (DEBUG) console.info(`world built in ${(performance.now() - buildStart).toFixed(0)} ms: ${PINES.length} living trees, ${DEADS.length} dead, ${chunks.size} chunks`);
