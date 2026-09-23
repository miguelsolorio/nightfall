/* Wolves
   A pack that circles you at a distance, pauses to growl, backs off if you
   charge or hold the light on them, and eventually leaves.
*/
import * as THREE from 'three';
import { R, lerp, turnTo } from '../config.js';
import { scene } from '../scene.js';
import { heightAt, resolveCollision } from '../world.js';
import { player } from '../state.js';
import { beamCenterness } from '../flashlight.js';
import { AudioSys } from '../audio.js';
import { findSpot, eyeMaterial, GEO, mesh } from './common.js';

const _v = new THREE.Vector3();

// ---------- Wolves: a pack that circles you at a distance and growls ----------
class Wolf {
  constructor(i) {
    this.i = i; this.group = new THREE.Group(); this.eyeMat = eyeMaterial();
    this.group.add(mesh(GEO.wolfBody));
    this.head = new THREE.Group(); this.head.position.set(0, 0.86, 0.62); this.group.add(this.head);
    this.head.add(mesh(GEO.wolfHead), mesh(GEO.wolfEyes, this.eyeMat, false));
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.8, -0.44); this.tail.rotation.x = 0.6; this.tail.add(mesh(GEO.wolfTail)); this.group.add(this.tail);
    this.legs = [[0.12, 0.36], [-0.12, 0.36], [0.12, -0.36], [-0.12, -0.36]].map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, 0.52, z); g.add(mesh(GEO.wolfLeg)); this.group.add(g); return g; });
    this.group.visible = false; scene.add(this.group);
    this.phase = Math.random() * 6; this.prev = new THREE.Vector3();
  }
  spawn(x, z) {
    this.group.position.set(x, heightAt(x, z), z); this.group.visible = true; this.active = true;
    this.dist = Math.hypot(x - player.pos.x, z - player.pos.z);
    this.angle = Math.atan2(x - player.pos.x, z - player.pos.z);
    this.baseR = R(14, 19); this.omega = R(0.16, 0.23); this.growlT = R(2, 6); this.pauseT = 0; this.retreatT = 0; this.litT = 0; this.seed = Math.random() * 10;
  }
  hide() { this.active = false; this.group.visible = false; }
  update(dt, pack) {
    if (!this.active) return;
    const g = this.group, pos = g.position, px = player.pos.x, pz = player.pos.z;
    const d = Math.hypot(pos.x - px, pos.z - pz);
    this.prev.copy(pos);
    const lit = d < 28 ? beamCenterness(_v.set(pos.x, pos.y + 0.9, pos.z)) : 0;
    this.eyeMat.color.setRGB(1, 0.62, 0.2).multiplyScalar(0.22 + lit * 1.8);   // eyes always faintly glow
    let faceP = false;
    if (pack.state === 'leaving') {
      const a = Math.atan2(pos.x - px, pos.z - pz); pos.x += Math.sin(a) * 7 * dt; pos.z += Math.cos(a) * 7 * dt;
    } else {
      this.litT = lit > 0 ? this.litT + dt : Math.max(0, this.litT - dt * 0.5);
      if ((d < 7.5 || this.litT > 1.3) && this.retreatT <= 0) { this.retreatT = R(3, 4.5); this.litT = 0; this.pauseT = 0; AudioSys.growl(pos, 0.5, true); }
      if (this.retreatT > 0) this.retreatT -= dt;
      if (this.pauseT > 0) { this.pauseT -= dt; faceP = true; }
      else {
        this.angle += pack.dir * this.omega * dt;
        const r = this.baseR + Math.sin(pack.t * 0.4 + this.seed) * 2 + (this.retreatT > 0 ? 9 : 0);
        const tx = px + Math.sin(this.angle) * r, tz = pz + Math.cos(this.angle) * r;
        const dx = tx - pos.x, dz = tz - pos.z, dd = Math.hypot(dx, dz), sp = Math.min(this.retreatT > 0 ? 7 : 4.3, dd * 1.5);
        if (dd > 0.05) { pos.x += dx / dd * sp * dt; pos.z += dz / dd * sp * dt; }
      }
      if ((this.growlT -= dt) <= 0) { this.growlT = R(4, 8); if (d < 30) { AudioSys.growl(pos); this.pauseT = R(1.5, 3); } }
    }
    resolveCollision(pos, 0.4);
    pos.y = heightAt(pos.x, pos.z);
    const mv = Math.hypot(pos.x - this.prev.x, pos.z - this.prev.z) / Math.max(dt, 1e-4);
    const face = faceP || mv < 0.3 ? Math.atan2(px - pos.x, pz - pos.z) : Math.atan2(pos.x - this.prev.x, pos.z - this.prev.z);
    g.rotation.y = turnTo(g.rotation.y, face, dt * 6);
    this.head.rotation.x = lerp(this.head.rotation.x, faceP ? 0.35 : 0, 1 - Math.exp(-dt * 5));
    this.phase += dt * mv * 2.6;
    const amp = Math.min(0.8, mv * 0.18);
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp; });
    this.tail.rotation.z = Math.sin(pack.t * 3 + this.i) * 0.15;
    g.visible = d < 60;
    this.dist = d;
  }
}
export const wolfPack = {
  wolves: [new Wolf(0), new Wolf(1), new Wolf(2)], state: 'away', timer: 80, t: 0, dir: 1, life: 0,
  reset() { this.state = 'away'; this.timer = 80; this.wolves.forEach(w => w.hide()); },
  update(dt) {
    this.t += dt;
    if (this.state === 'away') {
      if ((this.timer -= dt) > 0) return;
      const s = findSpot(26, 30, 'hidden');
      if (!s) { this.timer = 3; return; }
      const a0 = Math.atan2(s.x - player.pos.x, s.z - player.pos.z), d0 = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
      this.wolves.forEach((w, i) => { const a = a0 + (i - 1) * 0.35; w.spawn(player.pos.x + Math.sin(a) * d0, player.pos.z + Math.cos(a) * d0); resolveCollision(w.group.position, 0.5); });
      AudioSys.howl(_v.set(player.pos.x + Math.sin(a0) * 45, player.pos.y + 3, player.pos.z + Math.cos(a0) * 45), 0.9);
      this.state = 'circling'; this.life = R(50, 70); this.dir = Math.random() < 0.5 ? -1 : 1;
      return;
    }
    if (this.state === 'circling' && (this.life -= dt) <= 0) this.state = 'leaving';
    this.wolves.forEach(w => w.update(dt, this));
    if (this.state === 'leaving' && this.wolves.every(w => !w.active || w.dist > 55)) { this.wolves.forEach(w => w.hide()); this.state = 'away'; this.timer = R(60, 120); }
  },
};
