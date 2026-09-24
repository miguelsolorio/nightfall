/* Creatures — shared
   Spawn placement and the low-poly geometry for every creature (built once).
*/
import * as THREE from 'three';
import { CFG, R } from '../config.js';
import { mergeParts, B, P, CYL, lumpy, vcMat } from '../geometry.js';
import { inFrustum } from '../scene.js';
import { heightAt, blocked, insideCabin } from '../world.js';
import { player } from '../state.js';

// Pick a spawn point around the player: 'hidden' = out of view, 'ahead' = in front, deep in the fog
const _cand = new THREE.Vector3();
export function findSpot(minD, maxD, mode = 'hidden') {
  for (let i = 0; i < 40; i++) {
    const a = mode === 'ahead' ? player.yaw + R(-0.55, 0.55) : Math.random() * Math.PI * 2, d = R(minD, maxD);
    const x = player.pos.x - Math.sin(a) * d, z = player.pos.z - Math.cos(a) * d;
    if (Math.hypot(x, z) > CFG.WORLD_R - 4 || blocked(x, z, 0.9) || insideCabin(x, z)) continue;
    if (mode === 'hidden' && inFrustum(_cand.set(x, heightAt(x, z) + 1.2, z), 1.2)) continue;
    return { x, z };
  }
  return null;
}
export const eyeMaterial = () => new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });

// Shared creature geometry (built once)
export const GEO = {};
{ // Deer — faces +Z
  const fur = 0x76583f, dark = 0x3a2a1e, pale = 0xcfc3ad, antler = 0x8a7a64;
  GEO.deerBody = mergeParts([B(0.42, 0.5, 1.2, 0, 1.02, 0, fur), B(0.46, 0.56, 0.42, 0, 1.06, 0.42, fur), B(0.42, 0.5, 0.36, 0, 1.06, -0.48, fur), B(0.12, 0.16, 0.06, 0, 1.2, -0.68, pale, -0.4), B(0.3, 0.12, 0.9, 0, 0.78, 0, pale)]);
  const neck = [B(0.17, 0.62, 0.2, 0, 0.27, 0.1, fur, 0.5), B(0.2, 0.22, 0.4, 0, 0.58, 0.34, fur), B(0.13, 0.13, 0.18, 0, 0.54, 0.6, dark), B(0.05, 0.17, 0.1, 0.12, 0.72, 0.24, fur, 0, 0, -0.7), B(0.05, 0.17, 0.1, -0.12, 0.72, 0.24, fur, 0, 0, 0.7)];
  GEO.deerHead = mergeParts(neck);
  const ant = s => [P(CYL(0.012, 0.02, 0.5, 4), antler, s * 0.08, 0.9, 0.26, 0, 0, -s * 0.5), P(CYL(0.01, 0.015, 0.25, 4), antler, s * 0.2, 1.08, 0.32, 0.6, 0, -s * 0.2), P(CYL(0.008, 0.012, 0.2, 4), antler, s * 0.13, 1.0, 0.18, -0.5, 0, -s * 0.1)];
  GEO.deerHeadBuck = mergeParts([...neck, ...ant(1), ...ant(-1)]);
  GEO.deerLeg = mergeParts([B(0.08, 0.92, 0.08, 0, -0.46, 0, fur), B(0.09, 0.08, 0.1, 0, -0.9, 0.01, dark)]);
  GEO.deerEyes = mergeParts([B(0.04, 0.045, 0.04, 0.105, 0.62, 0.44, 0xffffff), B(0.04, 0.045, 0.04, -0.105, 0.62, 0.44, 0xffffff)]);
}
{ // Wolf — faces +Z
  const fur = 0x4a4643, dark = 0x2b2927, light = 0x6e6860, ear = new THREE.ConeGeometry(0.05, 0.13, 4);
  GEO.wolfBody = mergeParts([B(0.32, 0.34, 0.9, 0, 0.68, 0, fur), B(0.38, 0.42, 0.36, 0, 0.72, 0.3, fur), B(0.34, 0.34, 0.3, 0, 0.84, 0.5, dark), B(0.26, 0.1, 0.7, 0, 0.52, 0, light)]);
  GEO.wolfHead = mergeParts([B(0.24, 0.22, 0.26, 0, 0, 0.08, fur), B(0.12, 0.1, 0.24, 0, -0.04, 0.3, dark), B(0.06, 0.04, 0.05, 0, 0, 0.43, 0x111111), P(ear, dark, 0.08, 0.16, 0.02), P(ear, dark, -0.08, 0.16, 0.02)]);
  GEO.wolfEyes = mergeParts([B(0.035, 0.022, 0.02, 0.065, 0.04, 0.215, 0xffffff), B(0.035, 0.022, 0.02, -0.065, 0.04, 0.215, 0xffffff)]);
  GEO.wolfLeg = mergeParts([B(0.075, 0.52, 0.075, 0, -0.26, 0, fur)]);
  const tail = CYL(0.03, 0.07, 0.55, 5); tail.translate(0, -0.275, 0);
  GEO.wolfTail = mergeParts([{ g: tail, c: fur }]);
}
{ // Owl — faces +Z
  const brown = 0x66553f, face = 0x8f7f69;
  GEO.owlBody = mergeParts([P(new THREE.IcosahedronGeometry(1, 0), brown, 0, 0.24, 0, 0, 0, 0, 0.17, 0.24, 0.15)]);
  GEO.owlHead = mergeParts([P(new THREE.IcosahedronGeometry(1, 0), brown, 0, 0, 0, 0, 0, 0, 0.14, 0.12, 0.13), B(0.2, 0.16, 0.02, 0, 0, 0.11, face), P(new THREE.ConeGeometry(0.03, 0.08, 3), brown, 0.07, 0.12, 0), P(new THREE.ConeGeometry(0.03, 0.08, 3), brown, -0.07, 0.12, 0), P(new THREE.ConeGeometry(0.02, 0.05, 3), 0x222222, 0, -0.02, 0.13, Math.PI / 2)]);
  GEO.owlEyes = mergeParts([B(0.045, 0.045, 0.01, 0.046, 0.02, 0.124, 0xffffff), B(0.045, 0.045, 0.01, -0.046, 0.02, 0.124, 0xffffff)]);
  GEO.owlWing = mergeParts([B(0.03, 0.3, 0.22, 0, -0.14, 0, brown)]);
}
{ // Ghost — faces +Z, ~2.1 m. Pale parts are drawn by the ghost shader (smooth normals for
  // the rim glow); the head is its own piece so it can twitch. Dark parts (hair, eye
  // sockets, mouth) are drawn on top of the glow.
  const prof = [[0.46, 0], [0.4, 0.28], [0.3, 0.72], [0.22, 1.1], [0.19, 1.3], [0.25, 1.5], [0.3, 1.6], [0.22, 1.69], [0.08, 1.75], [0.05, 1.8]].map(([r, y]) => new THREE.Vector2(r, y));
  const SEG = 16, np = prof.length, robe = new THREE.LatheGeometry(prof, SEG), rp = robe.attributes.position;
  const hem = Array.from({ length: SEG }, (_, i) => i % 2 ? -R(0.15, 0.5) : R(-0.05, 0.1));   // ragged strips, long and short
  for (let i = 0; i <= SEG; i++) { const k = i * np, o = hem[i % SEG]; rp.setY(k, rp.getY(k) + o); rp.setY(k + 1, rp.getY(k + 1) + o * 0.4); }
  const pale = [P(robe, 0xffffff), P(CYL(0.035, 0.05, 0.24, 6), 0xffffff, 0, 1.82, 0)];
  for (const s of [-1, 1]) {   // arms too long, hanging past the knees, with thin fingers
    const arm = CYL(0.03, 0.05, 1.1, 6); arm.translate(0, -0.55, 0);
    pale.push(P(arm, 0xffffff, s * 0.27, 1.6, 0.02, -0.12, 0, s * 0.1));
    for (let f = 0; f < 4; f++) pale.push(P(new THREE.ConeGeometry(0.012, R(0.2, 0.28), 3), 0xffffff, s * (0.38 + f * 0.012), 0.4, 0.15 + (f - 1.5) * 0.025, Math.PI + R(-0.2, 0.2), 0, s * R(0, 0.3)));
  }
  GEO.ghostBody = mergeParts(pale, { smooth: true });
  GEO.ghostHead = mergeParts([P(new THREE.SphereGeometry(0.12, 14, 10), 0xffffff, 0, 0, 0, 0, 0, 0, 0.88, 1.3, 0.95)], { smooth: true });
  const ell = (x, y, z, sx, sy, sz) => P(new THREE.SphereGeometry(1, 8, 6), 0x000000, x, y, z, 0, 0, 0, sx, sy, sz);
  // Long black hair. The part over the face moves with the head; the long strands
  // (GEO.ghostHair) only half follow it, so they keep hanging when the head lolls.
  const face = [ell(0.045, 0.03, 0.098, 0.033, 0.024, 0.014), ell(-0.045, 0.03, 0.098, 0.033, 0.024, 0.014)], hair = [];
  for (const x of [-0.12, -0.095, -0.07, -0.048, 0.085, 0.11]) {   // parted so one eye shows
    face.push(B(0.022, 0.32, 0.008, x, 0.02, 0.1, 0x000000, -0.2));
    const len = R(0.4, 0.7); hair.push(B(0.022, len, 0.008, x + R(-0.01, 0.01), -0.12 - len / 2, 0.13, 0x000000, R(-0.05, 0.05)));
  }
  for (let i = 0; i < 12; i++) {
    const a = 1.1 + (i / 11) * (Math.PI * 2 - 2.2), len = R(0.55, 0.9);
    face.push(B(0.03, 0.2, 0.01, Math.sin(a) * 0.11, 0.06, Math.cos(a) * 0.1, 0x000000, Math.cos(a) * 0.12, a, -Math.sin(a) * 0.12));
    hair.push(B(0.03, len, 0.01, Math.sin(a) * 0.115, -0.02 - len / 2, Math.cos(a) * 0.105, 0x000000, Math.cos(a) * 0.08, a, -Math.sin(a) * 0.08));
  }
  GEO.ghostFace = mergeParts(face);
  GEO.ghostHair = mergeParts(hair);
  GEO.ghostMouth = mergeParts([ell(0, 0, 0, 0.026, 0.04, 0.012)]);
  GEO.ghostPupils = mergeParts([B(0.009, 0.009, 0.004, 0.045, 0.03, 0.113, 0xffffff), B(0.009, 0.009, 0.004, -0.045, 0.03, 0.113, 0xffffff)]);
}
{ // Scarecrow — faces +Z. Its own stake reaches the ground; arms lashed to a crossbar at 1.95 m
  const wood = 0x4a3d31, coat = 0x2f2c25, rag = 0x3a342a, straw = 0x8a7a55, twine = 0x3a2e20;
  const parts = [
    B(0.1, 1.5, 0.1, 0, 0.75, -0.05, wood), B(1.7, 0.09, 0.09, 0, 1.95, -0.05, wood),
    B(0.46, 0.72, 0.26, 0, 1.58, 0, coat, 0.04), B(0.5, 0.2, 0.28, 0, 1.92, 0, coat),
    B(0.14, 0.55, 0.14, 0.1, 1.0, 0.02, rag, 0.05, 0, 0.06), B(0.14, 0.5, 0.14, -0.1, 1.02, 0.02, rag, -0.04, 0, -0.1),   // limp, stuffed legs
  ];
  for (const s of [-1, 1]) {
    parts.push(B(0.62, 0.15, 0.17, s * 0.52, 1.93, 0, coat), B(0.08, 0.12, 0.14, s * 0.78, 1.94, -0.02, twine));
    for (let k = 0; k < 5; k++) parts.push(P(new THREE.ConeGeometry(0.025, R(0.18, 0.3), 3), straw, s * (0.85 + R(0, 0.05)), 1.93 + R(-0.05, 0.05), R(-0.05, 0.05), R(-0.4, 0.4), 0, -s * (Math.PI / 2 + R(-0.5, 0.5))));
    for (let k = 0; k < 3; k++) parts.push(B(R(0.05, 0.08), R(0.2, 0.4), 0.01, s * R(0.3, 0.7), 1.72, 0.07, rag, 0, 0, R(-0.15, 0.15)));
  }
  for (let k = 0; k < 7; k++) parts.push(B(R(0.05, 0.09), R(0.25, 0.55), 0.01, R(-0.2, 0.2), 1.1, R(-0.13, 0.13), rag, R(-0.1, 0.1), R(-0.5, 0.5), R(-0.15, 0.15)));
  GEO.scarecrow = mergeParts(parts);
  const sack = 0x7a6a4c, stitch = 0x120f0c, hat = 0x24211c, head = [
    P(lumpy(new THREE.IcosahedronGeometry(0.2, 1), 0.08, 1, Math.random), sack, 0, 0, 0, 0, 0, 0, 1, 1.12, 0.95),
    P(CYL(0.07, 0.09, 0.08, 6), twine, 0, -0.22, 0),
    P(CYL(0.3, 0.3, 0.02, 10), hat, 0, 0.19, 0, 0.12, 0, -0.08), P(new THREE.ConeGeometry(0.15, 0.32, 7), hat, 0.02, 0.35, -0.02, 0.1, 0, -0.2),
  ];
  for (const s of [-1, 1]) head.push(B(0.075, 0.014, 0.01, s * 0.07, 0.05, 0.2, stitch, 0, 0, 0.75), B(0.075, 0.014, 0.01, s * 0.07, 0.05, 0.2, stitch, 0, 0, -0.75));
  for (let k = 0; k < 6; k++) head.push(B(0.035, 0.012, 0.01, -0.09 + k * 0.036, -0.08 + (k % 2) * 0.012, 0.2 - Math.abs(k - 2.5) * 0.006, stitch, 0, 0, k % 2 ? 0.5 : -0.5));
  GEO.scarecrowHead = mergeParts(head);
}
{ // Wanderer — faces +Z
  const coat = 0x46443b, trou = 0x292723, skin = 0xb0a290, hat = 0x1f1e1b, boot = 0x171614, lamp = 0x302b24;
  GEO.wandererBody = mergeParts([
    B(0.15, 0.82, 0.16, 0.1, 0.46, 0, trou), B(0.15, 0.82, 0.16, -0.1, 0.46, 0, trou),
    B(0.17, 0.1, 0.28, 0.1, 0.05, 0.05, boot), B(0.17, 0.1, 0.28, -0.1, 0.05, 0.05, boot),
    B(0.52, 0.5, 0.32, 0, 0.98, 0, coat), B(0.5, 0.62, 0.3, 0, 1.5, 0.02, coat, 0.06),
    B(0.12, 0.72, 0.13, 0.32, 1.38, 0.02, coat, 0, 0, 0.06), B(0.12, 0.72, 0.13, -0.32, 1.38, 0.02, coat, 0, 0, -0.06),
    B(0.09, 0.12, 0.1, 0.34, 0.97, 0.03, skin), B(0.09, 0.12, 0.1, -0.34, 0.97, 0.03, skin),
    B(0.13, 0.2, 0.13, 0.35, 0.78, 0.06, lamp), B(0.02, 0.14, 0.02, 0.35, 0.93, 0.06, lamp),
    B(0.24, 0.12, 0.22, 0, 1.84, 0.02, coat),
  ]);
  GEO.wandererHead = mergeParts([B(0.2, 0.25, 0.22, 0, 0.1, 0.01, skin), P(CYL(0.24, 0.24, 0.025, 10), hat, 0, 0.25, 0), P(CYL(0.12, 0.13, 0.16, 8), hat, 0, 0.34, 0), B(0.035, 0.02, 0.01, 0.05, 0.13, 0.123, 0x0a0a0a), B(0.035, 0.02, 0.01, -0.05, 0.13, 0.123, 0x0a0a0a)]);
}
{ // The tall one — ~3.3 m, faces +Z
  const skin = 0x191514, bone = 0x958b7b, antler = 0x5e5243, parts = [];
  for (const s of [-1, 1]) {
    parts.push(P(CYL(0.05, 0.08, 0.9, 5), skin, s * 0.14, 1.12, 0.03, -0.1, 0, s * 0.03), P(CYL(0.035, 0.05, 0.82, 5), skin, s * 0.15, 0.41, -0.03, 0.08), B(0.1, 0.05, 0.3, s * 0.15, 0.025, 0.08, skin));
    parts.push(P(CYL(0.035, 0.045, 1.0, 5), skin, s * 0.34, 2.24, 0.1, 0, 0, s * 0.06), P(CYL(0.025, 0.035, 1.05, 5), skin, s * 0.37, 1.22, 0.16, -0.12, 0, s * 0.02));
    for (let f = -1; f <= 1; f++) parts.push(P(CYL(0.006, 0.016, 0.42, 3), bone, s * 0.37 + f * 0.03, 0.5, 0.2 + f * 0.01, -0.15 + f * 0.1, 0, s * 0.05 * f));
  }
  parts.push(B(0.34, 0.18, 0.18, 0, 1.58, 0, skin), P(CYL(0.21, 0.12, 1.2, 6), skin, 0, 2.17, 0.04, 0.12));
  parts.push(B(0.28, 0.05, 0.2, 0, 2.3, 0.12, bone, 0.12), B(0.26, 0.04, 0.19, 0, 2.15, 0.1, bone, 0.12), B(0.22, 0.04, 0.17, 0, 2.0, 0.08, bone, 0.12));
  parts.push(B(0.66, 0.1, 0.16, 0, 2.74, 0.1, skin), P(CYL(0.035, 0.05, 0.35, 5), skin, 0, 2.93, 0.16, 0.35));
  GEO.monsterBody = mergeParts(parts);
  const beam = L => { const g = CYL(0.012, 0.03, L, 4); g.translate(0, L / 2, 0); return g; };
  const head = [B(0.19, 0.28, 0.22, 0, 0.04, 0, bone), P(new THREE.ConeGeometry(0.085, 0.32, 5), bone, 0, -0.08, 0.17, Math.PI / 2 + 0.35), B(0.05, 0.04, 0.02, 0.05, 0.05, 0.11, 0x050505), B(0.05, 0.04, 0.02, -0.05, 0.05, 0.11, 0x050505)];
  for (const s of [-1, 1]) head.push(P(beam(0.65), antler, s * 0.07, 0.15, -0.02, -0.2, 0, -s * 0.55), P(beam(0.3), antler, s * 0.22, 0.4, 0, 0.35, 0, -s * 0.1), P(beam(0.35), antler, s * 0.3, 0.52, -0.05, -0.4, 0, -s * 0.9));
  GEO.monsterHead = mergeParts(head);
  GEO.monsterEyes = mergeParts([B(0.03, 0.03, 0.02, 0.05, 0.05, 0.125, 0xffffff), B(0.03, 0.03, 0.02, -0.05, 0.05, 0.125, 0xffffff)]);
}
export function mesh(geo, material = vcMat, shadow = true) { const m = new THREE.Mesh(geo, material); m.castShadow = shadow; return m; }
