/* The wanderer
   A lost man who turns, slowly, as you approach — says one line — and is
   gone the moment you look away.
*/
import * as THREE from 'three';
import { R, turnTo, flatDist } from '../config.js';
import { scene, inFrustum } from '../scene.js';
import { heightAt } from '../world.js';
import { player, blockers } from '../state.js';
import { AudioSys } from '../audio.js';
import { UI } from '../ui.js';
import { findSpot, GEO, mesh } from './common.js';

const _v = new THREE.Vector3();

// ---------- The wanderer: a lost man with one line for you ----------
const WANDERER_LINES = [
  'Five lights. The last one is always farther than you think.',
  'It’s slow while you’re watching. Everything is.',
  'The cabin door was open when I got here too. I didn’t go in.',
  'Put the light right in its face. It hates being seen whole. It always comes back, though.',
  'The well’s still full. Don’t ask of what.',
  'The stones in the circle are counting. I lost count at seven.',
  'When your light stutters, that’s when it walks.',
  'I’ve been walking toward the road for three days.',
];
export const wanderer = {
  group: new THREE.Group(), head: new THREE.Group(), state: 'away', timer: 30, line: 0,
  init() {
    this.group.add(mesh(GEO.wandererBody));
    this.head.position.set(0, 1.88, 0); this.head.add(mesh(GEO.wandererHead)); this.group.add(this.head);
    this.group.visible = false; scene.add(this.group);
  },
  reset() { this.state = 'away'; this.timer = 30; this.line = 0; this.group.visible = false; },
  update(dt) {
    const g = this.group, pos = g.position;
    if (this.state === 'away') {
      if ((this.timer -= dt) > 0) return;
      const s = findSpot(32, 40, 'ahead');
      if (!s) { this.timer = 3; return; }
      pos.set(s.x, heightAt(s.x, s.z), s.z);
      g.rotation.y = Math.atan2(s.x - player.pos.x, s.z - player.pos.z);   // facing away from you
      this.state = 'waiting'; this.waitT = 0; g.visible = true;
      return;
    }
    const d = flatDist(pos, player.pos), toP = Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z);
    if (this.state === 'waiting') {
      this.waitT += dt;
      if (d < 13) g.rotation.y = turnTo(g.rotation.y, toP, dt * 0.5);      // a slow, slow turn
      if (d < 4.5) {
        this.state = 'lingering'; this.spokeT = 0;
        UI.subtitle('“' + WANDERER_LINES[this.line++ % WANDERER_LINES.length] + '”', 7);
        AudioSys.murmur(_v.set(pos.x, pos.y + 1.8, pos.z));
      } else if (this.waitT > 80 && d > 45) { g.visible = false; this.state = 'away'; this.timer = R(20, 40); }
    } else if (this.state === 'lingering') {
      this.spokeT += dt;
      g.rotation.y = turnTo(g.rotation.y, toP, dt * 2);
      this.head.rotation.z = Math.sin(this.spokeT * 0.8) * 0.12;
      // Gone the moment you look away
      if ((this.spokeT > 2.5 && !inFrustum(_v.set(pos.x, pos.y + 1.6, pos.z), 1.25)) || this.spokeT > 25) {
        g.visible = false; this.state = 'away'; this.timer = R(90, 150); this.head.rotation.z = 0;
      }
    }
  },
};
wanderer.init();
blockers.push({ obj: wanderer.group, r: 0.7 });
