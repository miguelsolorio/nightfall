/* Geometry helpers
   Low-poly building blocks shared by the world and creatures.
*/
import * as THREE from 'three';
import { rand } from './config.js';

// Geometry helpers: bake several primitives (with color + transform) into one
// flat-shaded, vertex-colored geometry so each prop/creature part is one draw call.
export function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)), new THREE.Vector3(sx, sy, sz));
}
export function mergeParts(parts) {
  let n = 0;
  const geos = parts.map(p => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g.computeVertexNormals();
    if (p.m) g.applyMatrix4(p.m);
    n += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = new THREE.Color(); let o = 0;
  geos.forEach((g, i) => {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    c.set(parts[i].c ?? 0xffffff);
    for (let k = 0; k < cnt; k++) { col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b; }
    o += cnt; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, s);
export const B = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0, order) => ({ g: BOX, c, m: mat(x, y, z, rx, ry, rz, w, h, d, order) });
export const P = (g, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order) => ({ g, c, m: mat(x, y, z, rx, ry, rz, sx, sy, sz, order) });

// Jitter shared vertices of a primitive (keeps faces connected) — used for rocks/bushes
export function lumpy(geo, amt, squash = 1, rng = rand) {
  const pos = geo.attributes.position, seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getX(i).toFixed(2) + ',' + pos.getY(i).toFixed(2) + ',' + pos.getZ(i).toFixed(2);
    let s = seen.get(k); if (s === undefined) { s = 1 - amt + rng() * amt * 2; seen.set(k, s); }
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * squash, pos.getZ(i) * s);
  }
  return geo;
}
export function canvasTexture(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const glowTex = canvasTexture(128, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,.55)'); r.addColorStop(0.5, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});

// Shared vertex-colored material for everything built with mergeParts
export const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
