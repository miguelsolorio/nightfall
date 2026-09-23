/* Deer
   A small herd that grazes deep in the fog and bolts when you get close
   or hold the light on them.
*/
import * as THREE from 'three';
import { R, lerp, turnTo, flatDist } from '../config.js';
import { scene } from '../scene.js';
import { heightAt, resolveCollision } from '../world.js';
import { player } from '../state.js';
import { beamCenterness } from '../flashlight.js';
import { AudioSys } from '../audio.js';
import { findSpot, eyeMaterial, GEO, mesh } from './common.js';

const _v = new THREE.Vector3();

// ---------- Deer: graze, then bolt when approached or lit ----------
class Deer {
  constructor(buck) {
    this.group = new THREE.Group(); this.eyeMat = eyeMaterial();
    this.group.add(mesh(GEO.deerBody));
    this.neck = new THREE.Group(); this.neck.position.set(0, 1.18, 0.55); this.group.add(this.neck);
    this.neck.add(mesh(buck ? GEO.deerHeadBuck : GEO.deerHead), mesh(GEO.deerEyes, this.eyeMat, false));
    this.legs = [[0.15, 0.45], [-0.15, 0.45], [0.15, -0.45], [-0.15, -0.45]].map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, 0.95, z); g.add(mesh(GEO.deerLeg)); this.group.add(g); return g; });
    this.group.visible = false; scene.add(this.group);
    this.state = 'off'; this.phase = Math.random() * 6; this.heading = 0; this.dir = new THREE.Vector3();
  }
  spawn(x, z) { this.group.position.set(x, heightAt(x, z), z); this.heading = Math.random() * Math.PI * 2; this.group.rotation.y = this.heading; this.state = 'graze'; this.grazeT = R(1, 4); this.grazing = true; this.group.visible = true; this.alarmT = 0; }
  hide() { this.state = 'off'; this.group.visible = false; }
  update(dt) {
    if (this.state === 'off') return;
    const g = this.group, pos = g.position, d = flatDist(pos, player.pos);
    const lit = d < 30 ? beamCenterness(_v.set(pos.x, pos.y + 1.5, pos.z)) : 0;
    this.eyeMat.color.setRGB(0.6, 0.9, 0.7).multiplyScalar(0.02 + lit * 1.6);
    if (this.state === 'graze') {
      if ((this.grazeT -= dt) <= 0) { this.grazing = !this.grazing; this.grazeT = this.grazing ? R(2, 6) : R(1, 3); if (!this.grazing) this.heading += R(-1, 1); }
      this.neck.rotation.x = lerp(this.neck.rotation.x, this.grazing ? 1.05 : 0, 1 - Math.exp(-dt * 3));
      if (!this.grazing) { pos.x += Math.sin(this.heading) * 0.35 * dt; pos.z += Math.cos(this.heading) * 0.35 * dt; this.phase += dt * 2.5; }
      g.rotation.y = turnTo(g.rotation.y, this.heading, dt * 1.5);
      this.alarmT = lit > 0 ? this.alarmT + dt : Math.max(0, this.alarmT - dt);
      if (d < (player.running ? 22 : 14) || this.alarmT > 0.6) deerHerd.alarm();
      if (d > 95) this.hide();
    } else if (this.state === 'alert') {
      this.neck.rotation.x = lerp(this.neck.rotation.x, -0.2, 1 - Math.exp(-dt * 10));
      g.rotation.y = turnTo(g.rotation.y, Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z), dt * 6);
      if ((this.alertT -= dt) <= 0) {
        this.state = 'flee'; this.fleeT = 0;
        const a = Math.atan2(pos.x - player.pos.x, pos.z - player.pos.z) + R(-0.4, 0.4);
        this.heading = a; this.dir.set(Math.sin(a), 0, Math.cos(a));
      }
    } else if (this.state === 'flee') {
      const ox = pos.x, oz = pos.z;
      pos.x += this.dir.x * 10 * dt; pos.z += this.dir.z * 10 * dt;
      resolveCollision(pos, 0.45);
      if (dt > 0 && Math.hypot(pos.x - ox, pos.z - oz) < 5 * dt) {   // blocked by a trunk: veer off
        this.heading += (this.i % 2 ? 1 : -1) * R(0.5, 1.1); this.dir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      }
      this.phase += dt * 11;
      g.rotation.y = turnTo(g.rotation.y, this.heading, dt * 8);
      this.neck.rotation.x = -0.25;
      if (d > 65 || (this.fleeT += dt) > 9) this.hide();
    }
    const ground = heightAt(pos.x, pos.z);
    const moving = this.state === 'flee' || (this.state === 'graze' && !this.grazing);
    pos.y = ground + (this.state === 'flee' ? Math.abs(Math.sin(this.phase)) * 0.35 : 0);
    const amp = this.state === 'flee' ? 0.9 : moving ? 0.3 : 0;
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.3) * amp; });
    g.visible = d < 70;
  }
}
export const deerHerd = {
  deer: [new Deer(true), new Deer(false), new Deer(false)].map((d, i) => { d.i = i; return d; }), state: 'away', timer: 15,
  reset() { this.state = 'away'; this.timer = 15; this.deer.forEach(d => d.hide()); },
  alarm() {
    if (this.state !== 'present') return;
    this.state = 'fleeing';
    this.deer.forEach(d => { if (d.state === 'graze') { d.state = 'alert'; d.alertT = R(0.25, 0.5); } });
    const lead = this.deer.find(d => d.state !== 'off');
    if (lead) AudioSys.snort(lead.group.position);
  },
  update(dt) {
    if (this.state === 'away') {
      if ((this.timer -= dt) > 0) return;
      const s = findSpot(34, 44, 'ahead');
      if (!s) { this.timer = 3; return; }
      this.deer.forEach(d => { const x = s.x + R(-4, 4), z = s.z + R(-4, 4); d.spawn(x, z); resolveCollision(d.group.position, 0.6); });
      this.state = 'present'; return;
    }
    this.deer.forEach(d => d.update(dt));
    if (this.deer.every(d => d.state === 'off')) { this.state = 'away'; this.timer = R(40, 75); }
  },
};
