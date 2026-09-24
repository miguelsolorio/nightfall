/* The scarecrow
   Lashed to its post in the Hollow Field. Each time you look away and back,
   it's facing you. Look away once too often and the post is empty — and the
   next time you turn, it's standing at the treeline. Harmless. Probably.
*/
import * as THREE from 'three';
import { R, flatDist } from '../config.js';
import { scene, camera, inFrustum } from '../scene.js';
import { heightAt, losBlocked, HOLLOW } from '../world.js';
import { player, blockers } from '../state.js';
import { AudioSys } from '../audio.js';
import { findSpot, GEO, mesh } from './common.js';

const _v = new THREE.Vector3();
// Is this spot on screen, close enough to make out, and not behind a trunk?
const watched = (x, y, z) => Math.hypot(x - player.pos.x, z - player.pos.z) < 55 && inFrustum(_v.set(x, y, z), 1.1) && !losBlocked(camera.position.x, camera.position.z, x, z);

export const scarecrow = {
  group: new THREE.Group(), head: new THREE.Group(), state: 'post', turns: 0, seen: false, goneT: 0,
  init() {
    this.group.add(mesh(GEO.scarecrow));
    this.head.position.set(0, 2.24, 0); this.head.add(mesh(GEO.scarecrowHead)); this.group.add(this.head);
    scene.add(this.group);
  },
  reset() { this.onPost(R(0, Math.PI * 2)); },
  onPost(yaw) {
    this.state = 'post'; this.turns = 0; this.seen = false; this.group.visible = true;
    this.group.position.set(HOLLOW.x, heightAt(HOLLOW.x, HOLLOW.z) + 0.05, HOLLOW.z);
    this.group.rotation.y = yaw; this.head.rotation.set(0.15, 0, 0.35);
  },
  facePlayer() {
    const p = this.group.position;
    this.group.rotation.y = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
    this.head.rotation.set(R(-0.05, 0.3), R(-0.3, 0.3), R(-0.6, 0.6));
  },
  update(dt) {
    const g = this.group, p = g.position;
    const nearField = Math.hypot(player.pos.x - HOLLOW.x, player.pos.z - HOLLOW.z) < 80;
    if (this.state === 'post') {
      if (!nearField) return;
      if (watched(p.x, p.y + 1.8, p.z)) { this.seen = true; return; }
      if (!this.seen) return;
      // You looked away. It moved.
      this.seen = false;
      if (this.turns++ < 3) { this.facePlayer(); AudioSys.creak(_v.set(p.x, p.y + 1.9, p.z)); }
      else { this.state = 'gone'; this.goneT = 0; g.visible = false; }
    } else if (this.state === 'gone') {
      this.goneT += dt;
      if (!nearField) { if (this.goneT > 30) this.onPost(R(0, Math.PI * 2)); return; }
      if (watched(HOLLOW.x, heightAt(HOLLOW.x, HOLLOW.z) + 1.6, HOLLOW.z)) { this.seen = true; return; }   // you've seen the empty post
      if (!this.seen && this.goneT < 25) return;
      const s = findSpot(18, 26, 'hidden');
      if (!s) return;
      this.state = 'stalk'; this.seen = false; g.visible = true;
      p.set(s.x, heightAt(s.x, s.z), s.z); this.facePlayer();
      AudioSys.creak(_v.set(p.x, p.y + 1.9, p.z));
    } else if (this.state === 'stalk') {
      if (watched(p.x, p.y + 1.8, p.z)) { this.seen = true; return; }
      // Once you've seen it standing there, the next time you look it's back on its post
      if (this.seen || flatDist(p, player.pos) > 70) this.onPost(R(0, Math.PI * 2));
    }
  },
};
scarecrow.init();
blockers.push({ obj: scarecrow.group, r: 0.45 });
