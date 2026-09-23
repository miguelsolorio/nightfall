/* Ghosts
   Translucent figures that drift toward you whispering and dissolve when
   the beam finds them. Contact is a scare, not a death.
*/
import * as THREE from 'three';
import { R, clamp, flatDist } from '../config.js';
import { glowTex } from '../geometry.js';
import { scene } from '../scene.js';
import { heightAt } from '../world.js';
import { player } from '../state.js';
import { beamCenterness, startFlicker } from '../flashlight.js';
import { AudioSys } from '../audio.js';
import { UI } from '../ui.js';
import { findSpot, GEO } from './common.js';

const _v = new THREE.Vector3();

// ---------- Ghosts: drift toward you, dissolve in the beam ----------
class Ghost {
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xa9d4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(GEO.ghost, this.mat); this.group.add(this.body);
    this.eyes = new THREE.Mesh(GEO.ghostEyes, new THREE.MeshBasicMaterial({ color: 0x000000 })); this.group.add(this.eyes);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x6fa6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.scale.set(3.2, 3.8, 1); this.halo.position.y = 1.2; this.group.add(this.halo);
    this.state = 'off'; this.group.visible = false; scene.add(this.group);
  }
  spawn(x, z) {
    this.group.position.set(x, heightAt(x, z) + 0.4, z); this.group.scale.set(1, 1, 1);
    this.state = 'drift'; this.fade = 0; this.exposure = 0; this.dist = Math.hypot(x - player.pos.x, z - player.pos.z); this.t = Math.random() * 10; this.speed = R(1.0, 1.5);
    this.group.visible = true; this.eyes.visible = true; this.jitT = 0;
    this.whisper = AudioSys.whisperLoop(this.group.position);
  }
  off() { this.state = 'off'; this.group.visible = false; this.whisper?.stop(); this.whisper = null; }
  vanish() { this.state = 'vanish'; this.vt = 0; this.eyes.visible = false; AudioSys.ghostVanish(this.group.position); this.whisper?.stop(); this.whisper = null; }
  update(dt) {
    if (this.state === 'off') return;
    const g = this.group, pos = g.position; this.t += dt;
    const d = flatDist(pos, player.pos);
    if (this.state === 'drift') {
      this.fade = Math.min(1, this.fade + dt * 0.5);
      const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
      pos.x += dx / d * this.speed * dt + Math.cos(this.t * 0.7) * 0.3 * dt; pos.z += dz / d * this.speed * dt;
      pos.y = heightAt(pos.x, pos.z) + 0.35 + Math.sin(this.t * 1.4) * 0.2;
      g.rotation.y = Math.atan2(dx, dz); this.body.rotation.z = Math.sin(this.t * 0.9) * 0.08;
      const lit = beamCenterness(_v.set(pos.x, pos.y + 1.2, pos.z));
      this.exposure = lit > 0 ? this.exposure + dt : Math.max(0, this.exposure - dt * 0.5);
      if (this.exposure > 0.35) { this.vanish(); return; }
      if (d < 1.1) { ghostScare(); this.vanish(); return; }
      if (d > 70) { this.off(); return; }
      const distFade = clamp((52 - d) / 26, 0, 1), flick = 0.8 + 0.2 * Math.sin(this.t * 3.1) * Math.sin(this.t * 7.3);
      this.mat.opacity = 0.3 * this.fade * distFade * flick;
      this.halo.material.opacity = 0.28 * this.fade * distFade * flick;
      if (this.whisper) { this.whisper.setPos(_v.set(pos.x, pos.y + 1.4, pos.z)); this.whisper.setLevel(0.7 * this.fade); if ((this.jitT -= dt) <= 0) { this.jitT = R(0.1, 0.22); this.whisper.jitter(); } }
    } else if (this.state === 'vanish') {
      this.vt += dt;
      g.scale.set(1 + this.vt * 0.6, 1 + this.vt * 1.4, 1 + this.vt * 0.6); pos.y += dt * 1.5;
      this.mat.opacity *= Math.exp(-dt * 6); this.halo.material.opacity *= Math.exp(-dt * 6);
      if (this.vt > 0.8) this.off();
    }
    this.dist = d;
  }
}
function ghostScare() {
  UI.flash('#dfeaff', 0.85, 1.1);
  player.stamina = 0; player.exhausted = true; player.shake = 1;
  startFlicker(1.2);
  AudioSys.ghostScare();
}
export const ghostMgr = {
  ghosts: [new Ghost(), new Ghost()], timer: 55,
  reset() { this.timer = 55; this.ghosts.forEach(g => g.off()); },
  update(dt) {
    if ((this.timer -= dt) <= 0) {
      this.timer = R(22, 40);
      const g = this.ghosts.find(g => g.state === 'off'), s = g && findSpot(26, 36, 'hidden');
      if (s) g.spawn(s.x, s.z);
    }
    this.ghosts.forEach(g => g.update(dt));
  },
};
