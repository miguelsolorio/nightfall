/* Owls
   Perch on dead trees, track you with their heads, eyes shine in the beam,
   and take off when disturbed.
*/
import * as THREE from 'three';
import { CFG, R, clamp, turnTo, flatDist } from '../config.js';
import { vcMat } from '../geometry.js';
import { scene, inFrustum } from '../scene.js';
import { PINES, DEADS } from '../world.js';
import { player } from '../state.js';
import { beamCenterness } from '../flashlight.js';
import { AudioSys } from '../audio.js';
import { eyeMaterial, GEO, mesh } from './common.js';

const _v = new THREE.Vector3(), _cand = new THREE.Vector3();

// ---------- Owls: perch on dead trees, eyes shine, fly off when disturbed ----------
class Owl {
  constructor() {
    this.group = new THREE.Group(); this.group.scale.setScalar(1.35); this.eyeMat = eyeMaterial();
    this.group.add(mesh(GEO.owlBody, vcMat, false));
    this.head = new THREE.Group(); this.head.position.set(0, 0.5, 0); this.group.add(this.head);
    this.head.add(mesh(GEO.owlHead, vcMat, false), mesh(GEO.owlEyes, this.eyeMat, false));
    this.wings = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.16, 0.42, 0); p.userData.s = s; p.add(mesh(GEO.owlWing, vcMat, false)); this.group.add(p); return p; });
    this.vel = new THREE.Vector3(); this.state = 'gone'; this.timer = 0; this.group.visible = false;
    scene.add(this.group);
  }
  perch(initial = false) {
    const pick = list => list.filter(t => { const d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z); return d > 16 && d < 45 && Math.hypot(t.x, t.z) < CFG.WORLD_R && (initial || !inFrustum(_cand.set(t.x, t.top, t.z))); });
    let options = pick(DEADS); if (!options.length) options = pick(PINES);
    if (!options.length) { this.timer = 5; return; }
    const t = options[(Math.random() * options.length) | 0];
    this.group.position.set(t.x, t.top - 0.15, t.z);
    this.group.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.state = 'perch'; this.group.visible = true; this.litT = 0; this.hootT = R(8, 25); this.scanT = 0;
    this.wings.forEach(w => { w.rotation.z = 0; });
  }
  reset() { this.state = 'gone'; this.timer = 0; this.perch(true); }
  update(dt, t) {
    if (this.state === 'gone') { if ((this.timer -= dt) <= 0) this.perch(); return; }
    const g = this.group, pos = g.position, d = flatDist(pos, player.pos);
    if (this.state === 'perch') {
      const lit = d < 30 ? beamCenterness(_v.set(pos.x, pos.y + 0.7, pos.z)) : 0;
      this.eyeMat.color.setRGB(1, 0.85, 0.35).multiplyScalar(0.03 + lit * 2.2);
      // Owl head swivels to track you — creepier than it sounds
      const toP = Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z) - g.rotation.y;
      if (d < 28) this.head.rotation.y = turnTo(this.head.rotation.y, clamp(((toP + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI, -2.4, 2.4), dt * 3);
      else if ((this.scanT -= dt) <= 0) { this.scanT = R(2, 5); this.head.userData.target = R(-1.5, 1.5); }
      if (d >= 28) this.head.rotation.y = turnTo(this.head.rotation.y, this.head.userData.target || 0, dt * 2);
      this.litT = lit > 0 ? this.litT + dt : Math.max(0, this.litT - dt);
      if (d < 40 && (this.hootT -= dt) <= 0) { this.hootT = R(12, 30); AudioSys.hoot(pos); }
      if (d < 9 || this.litT > 1.0) {
        this.state = 'fly'; this.flyT = 0;
        const a = Math.atan2(pos.x - player.pos.x, pos.z - player.pos.z) + R(-0.6, 0.6);
        this.vel.set(Math.sin(a) * 7, 2.4, Math.cos(a) * 7); g.rotation.y = a;
        AudioSys.hoot(pos); AudioSys.flap(pos);
      }
    } else if (this.state === 'fly') {
      this.flyT += dt;
      pos.addScaledVector(this.vel, dt); this.vel.y *= Math.exp(-dt * 0.5);
      this.wings.forEach(w => { w.rotation.z = w.userData.s * (1.35 + Math.sin(t * 16) * 0.9); });
      g.rotation.x = 0.35; this.eyeMat.color.setScalar(0);
      if (this.flyT > 6) { this.state = 'gone'; g.visible = false; g.rotation.x = 0; this.timer = R(20, 45); }
    }
    if (this.state !== 'gone') g.visible = d < 70;
  }
}
export const owls = [new Owl(), new Owl(), new Owl(), new Owl()];
