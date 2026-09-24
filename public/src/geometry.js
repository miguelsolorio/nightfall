/* Geometry helpers
   Low-poly building blocks shared by the world and creatures.
*/
import * as THREE from 'three';
import { rand } from './config.js';

// Geometry helpers: bake several primitives (with color + transform) into one
// flat-shaded, vertex-colored geometry so each prop/creature part is one draw call.
// { smooth: true } keeps each primitive's own smooth normals instead (ghosts).
export function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)), new THREE.Vector3(sx, sy, sz));
}
export function mergeParts(parts, { smooth = false } = {}) {
  let n = 0;
  const geos = parts.map(p => {
    let g;
    if (smooth) {
      g = p.g.clone(); if (!g.attributes.normal) g.computeVertexNormals();
      if (g.index) g = g.toNonIndexed();
      g.deleteAttribute('uv');
    } else {
      g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      g.computeVertexNormals();
    }
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

// Bake transformed, tinted copies of mergeParts geometries into one static mesh
// (one draw call). items: [{ geo, m: Matrix4, tint: {r,g,b} }]. Attributes are
// compact (Int8 normals, Uint16 colors — Uint8 bands on dark linear colors), and
// the CPU copies are dropped once they're on the GPU. { sway: true } adds a 0..1
// attribute (base → top of each piece) for the grass shader.
const _nm = new THREE.Matrix3();
function freeArray() { this.array = null; }
export function bakeMesh(items, material, { sway = false } = {}) {
  let n = 0;
  for (const it of items) n += it.geo.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Int8Array(n * 3), col = new Uint16Array(n * 3), sw = sway ? new Uint8Array(n) : null;
  let o = 0;
  for (const { geo, m, tint } of items) {
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, C = geo.attributes.color.array, cnt = geo.attributes.position.count;
    const e = m.elements, q = _nm.getNormalMatrix(m).elements;
    if (sway && !geo.boundingBox) geo.computeBoundingBox();
    const top = sway ? geo.boundingBox.max.y || 1 : 1;
    for (let i = 0; i < cnt; i++, o++) {
      const i3 = i * 3, o3 = o * 3, x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      pos[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = N[i3], ny = N[i3 + 1], nz = N[i3 + 2];
      const a = q[0] * nx + q[3] * ny + q[6] * nz, b = q[1] * nx + q[4] * ny + q[7] * nz, c = q[2] * nx + q[5] * ny + q[8] * nz;
      const l = 127 / (Math.hypot(a, b, c) || 1);
      nor[o3] = a * l; nor[o3 + 1] = b * l; nor[o3 + 2] = c * l;
      col[o3] = Math.min(1, C[i3] * tint.r) * 65535; col[o3 + 1] = Math.min(1, C[i3 + 1] * tint.g) * 65535; col[o3 + 2] = Math.min(1, C[i3 + 2] * tint.b) * 65535;
      if (sw) sw[o] = Math.max(0, Math.min(1, y / top)) * 255;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  if (sw) g.setAttribute('sway', new THREE.BufferAttribute(sw, 1, true));
  g.computeBoundingSphere();
  for (const a of Object.values(g.attributes)) a.onUpload(freeArray);
  const mesh = new THREE.Mesh(g, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}
