/* The tall one
   Moves only while unseen; freezes when your lit view is on it; dissolves
   under the beam's hot center; steps to the rim of the beam when your light
   stutters; and ends the game if it reaches you.
*/
import * as THREE from 'three';
import { CFG, R, clamp } from '../config.js';
import { scene, camera, inFrustum } from '../scene.js';
import { heightAt, resolveCollision, blocked, losBlocked, insideCabin } from '../world.js';
import { player, game, flash } from '../state.js';
import { flashLit, beamCenterness, startFlicker, beamPos, beamDir } from '../flashlight.js';
import { AudioSys } from '../audio.js';
import { UI } from '../ui.js';
import { findSpot, eyeMaterial, GEO, mesh } from './common.js';

const _v = new THREE.Vector3(), _t = new THREE.Vector3();

// ---------- The tall one ----------
// It moves only while unseen (behind you, behind trees, or when your light is off
// or stuttering). Hold the beam's hot center on it and it dissolves — for a while.
// It likes to stand just at the rim of your light.
export const monster = {
  group: new THREE.Group(), head: new THREE.Group(), eyeMat: eyeMaterial(),
  state: 'inactive', timer: 45, hidden: false, hiddenT: 0, centerT: 0, flickerCd: 20, relocated: true,
  seenT: 0, twigT: 0, dist: 999, stuckT: 0, lastD: 999, catchT: 0,
  init() {
    this.group.add(mesh(GEO.monsterBody));
    this.head.position.set(0, 3.05, 0.22); this.head.add(mesh(GEO.monsterHead), mesh(GEO.monsterEyes, this.eyeMat, false)); this.group.add(this.head);
    this.group.visible = false; scene.add(this.group);
  },
  reset() { this.state = 'inactive'; this.timer = 45; this.hidden = false; this.group.visible = false; this.flickerCd = R(16, 26); this.relocated = true; this.centerT = 0; this.dist = 999; this.group.scale.setScalar(1); },
  place(x, z) { this.group.position.set(x, heightAt(x, z), z); this.face(); this.stuckT = 0; this.lastD = 999; },
  face() { const p = this.group.position; this.group.rotation.y = Math.atan2(player.pos.x - p.x, player.pos.z - p.z); },
  hideFor(t) { this.hidden = true; this.hiddenT = t; this.group.visible = false; this.centerT = 0; },
  toBeamEdge(d) {
    const yaw = Math.atan2(beamDir.x, beamDir.z);
    for (let i = 0; i < 12; i++) {
      const a = yaw + (Math.random() < 0.5 ? -1 : 1) * (CFG.BEAM_ANGLE * 1.2 + R(0, 0.12)), dist = clamp(d * 0.75, 10, 20) + R(-1, 1);
      const x = beamPos.x + Math.sin(a) * dist, z = beamPos.z + Math.cos(a) * dist;
      if (Math.hypot(x, z) > CFG.WORLD_R - 3 || blocked(x, z, 0.5) || insideCabin(x, z)) continue;
      this.place(x, z); AudioSys.sting(this.group.position, 0.55); return;
    }
  },
  update(dt) {
    const g = this.group, p = g.position;
    if (this.state === 'inactive') {
      if (game.found > 0) this.timer = Math.min(this.timer, 10);
      if ((this.timer -= dt) > 0) return;
      const s = findSpot(34, 42, 'hidden');
      if (!s) { this.timer = 2; return; }
      this.place(s.x, s.z); this.state = 'stalk'; g.visible = true;
      AudioSys.bowedMetal(null, 0.9);   // it's here now
      return;
    }
    if (this.state !== 'stalk') return;
    if (this.hidden) {
      if ((this.hiddenT -= dt) > 0) return;
      const s = findSpot(26, 34, 'hidden');
      if (s) { this.place(s.x, s.z); this.hidden = false; g.visible = true; } else this.hiddenT = 1;
      return;
    }
    const dx = player.pos.x - p.x, dz = player.pos.z - p.z, d = Math.hypot(dx, dz);
    this.dist = d;
    if (d > 55) { const s = findSpot(30, 38, 'hidden'); if (s) this.place(s.x, s.z); return; }

    const chest = _v.set(p.x, p.y + 2.3, p.z);
    const inView = d < 40 && inFrustum(chest, 1.0) && !losBlocked(camera.position.x, camera.position.z, p.x, p.z);
    const seen = inView && flashLit();
    const center = seen ? beamCenterness(chest) : 0;

    // Only ever glimpsed at the edge of the light: the hot center erases it
    g.visible = center < 0.5;
    if (center >= 0.5) { if ((this.centerT += dt) > 0.3) { AudioSys.sting(chest); this.hideFor(R(3, 6)); return; } }
    else this.centerT = Math.max(0, this.centerT - dt * 2);

    // It makes your light stutter, and uses the dark to step to the rim of the beam
    this.flickerCd -= dt;
    if (this.flickerCd <= 0 && d < 38 && d > 9 && flash.on && flash.flickerT <= 0) {
      startFlicker(0.9, true); this.relocated = false; this.flickerCd = Math.max(8, R(14, 26) - game.found * 1.5);
    }
    if (flash.monsterFlicker && flash.level === 0 && !this.relocated) { this.relocated = true; this.toBeamEdge(d); return; }

    if (!seen) {
      const speed = (1.55 + 0.45 * game.found) * (flash.on ? 1 : 1.5) * (d > 28 ? 1.7 : 1);
      p.x += dx / d * speed * dt; p.z += dz / d * speed * dt;
      resolveCollision(p, 0.4);
      p.y = heightAt(p.x, p.z);
      this.face(); this.head.rotation.z *= Math.exp(-dt * 4); this.seenT = 0;
      if (d < 26 && (this.twigT -= dt) <= 0) { this.twigT = R(1.2, 3.5) * (0.4 + d / 26); AudioSys.twig(_t.set(p.x, p.y + 0.2, p.z), 1.2); }
      // Unstick if a wall or boulder is holding it back
      this.stuckT = d > this.lastD - 0.02 ? this.stuckT + dt : 0; this.lastD = d;
      if (this.stuckT > 3) { const s = findSpot(Math.max(9, d - 8), Math.max(12, d - 3), 'hidden'); if (s) this.place(s.x, s.z); }
    } else {
      this.seenT += dt;
      this.head.rotation.z = Math.sin(this.seenT * 0.7) * 0.35;   // a slow, curious tilt while you stare
      this.stuckT = 0; this.lastD = d;
    }
    this.eyeMat.color.setRGB(0.85, 0.9, 1).multiplyScalar(seen ? 0.3 : 0.04);
    if (d < 1.5) triggerCatch();
  },
};
monster.init();

// Contact: hand off to the scripted catch in game.js (via game.state)
export function triggerCatch() {
  if (game.state !== 'playing') return;
  game.state = 'dying'; game.cineT = 0;
  monster.group.visible = true; flash.on = true; startFlicker(1.4);
  AudioSys.scream(); UI.flash('#6a0000', 0.55, 1.6); player.shake = 1.2;
}
