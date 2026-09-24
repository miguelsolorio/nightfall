/* Eyes in the dark
   Pairs of eyes that watch from beside the trunks, just outside your beam —
   low to the ground, at head height, or higher than a person stands. Put the
   light on them, or walk toward them, and they're gone.
*/
import * as THREE from 'three';
import { CFG, R, clamp, flatDist } from '../config.js';
import { canvasTexture } from '../geometry.js';
import { scene, camera, inFrustum } from '../scene.js';
import { heightAt, losBlocked, PINES, DEADS } from '../world.js';
import { player, game } from '../state.js';
import { flashLit, beamCenterness, beamPos, beamDir } from '../flashlight.js';
import { AudioSys } from '../audio.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const EYE = new THREE.PlaneGeometry(0.3, 0.16);
// Eye-shine: a hard bright core with a short glow around it
const eyeTex = canvasTexture(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.28, 'rgba(255,255,255,.9)'); r.addColorStop(0.5, 'rgba(255,255,255,.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
// Nothing but open ground between here and there? (trunks are checked separately)
function terrainClear(ax, ay, az, bx, by, bz) {
  for (let i = 1; i < 10; i++) { const t = i / 10; if (heightAt(ax + (bx - ax) * t, az + (bz - az) * t) + 0.1 > ay + (by - ay) * t) return false; }
  return true;
}

class Eyes {
  constructor() {
    // Drawn over foliage (depthTest off): trunks and hills are ruled out when they spawn
    this.mat = new THREE.MeshBasicMaterial({ map: eyeTex, color: 0xd8e8a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
    this.group = new THREE.Group();
    for (const s of [-1, 1]) { const m = new THREE.Mesh(EYE, this.mat); m.position.x = s * 0.11; m.renderOrder = 5; this.group.add(m); }
    this.group.visible = false; this.state = 'off'; scene.add(this.group);
  }
  spawn(x, y, z, red) {
    this.group.position.set(x, y, z);
    this.mat.color.set(red ? 0xff3a1c : 0xd8e8a0);
    this.state = 'on'; this.life = R(5, 15); this.fade = 0; this.blinkT = R(1, 3); this.blink = 0; this.group.visible = true;
  }
  off(scurry = false) { if (scurry) AudioSys.scurry(this.group.position); this.state = 'off'; this.group.visible = false; }
  update(dt) {
    if (this.state === 'off') return;
    const g = this.group, p = g.position, d = flatDist(p, player.pos);
    g.lookAt(camera.position);
    if ((this.life -= dt) <= 0) this.fade -= dt * 2; else this.fade = Math.min(1, this.fade + dt * 1.5);
    if ((this.blinkT -= dt) <= 0) { this.blinkT = R(1.5, 4.5); this.blink = 0.14; }
    this.blink -= dt;
    const k = Math.max(1, d / 9);   // far eyes stay a few pixels wide
    g.scale.set(k, (this.blink > 0 ? 0.08 : 1) * k, k);
    this.mat.opacity = clamp(this.fade, 0, 1) * (0.55 + 0.45 * clamp((32 - d) / 16, 0, 1));
    if (beamCenterness(p) > 0 || d < 10) { this.off(Math.random() < 0.6); return; }
    if (this.life <= 0 && this.fade <= 0) this.off();
  }
}
export const eyes = {
  pairs: [new Eyes(), new Eyes(), new Eyes()], timer: 20,
  reset() { this.timer = R(15, 25); this.pairs.forEach(e => e.off()); },
  update(dt) {
    if ((this.timer -= dt) <= 0) {
      this.timer = R(12, 30);
      if (game.threat < 0.6) for (let i = Math.random() < 0.3 ? 2 : 1; i > 0; i--) this.spawnOne();
    }
    this.pairs.forEach(e => e.update(dt));
  },
  // Beside a trunk 14–30 m away, on screen, but outside the beam
  spawnOne() {
    const e = this.pairs.find(e => e.state === 'off'); if (!e) return;
    const cands = [], taken = this.pairs.filter(o => o.state === 'on').map(o => o.group.position);
    for (const list of [PINES, DEADS]) for (const t of list) {
      const d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z);
      if (d > 14 && d < 30 && !taken.some(q => Math.hypot(q.x - t.x, q.z - t.z) < 4)) cands.push({ t, bare: list === DEADS });
    }
    for (let k = 0; k < 40 && cands.length; k++) {
      const { t, bare } = cands[(Math.random() * cands.length) | 0];
      const dx = t.x - camera.position.x, dz = t.z - camera.position.z, d = Math.hypot(dx, dz), side = Math.random() < 0.5 ? -1 : 1;
      const x = t.x - dz / d * 0.5 * side, z = t.z + dx / d * 0.5 * side, roll = Math.random();
      const y = heightAt(x, z) + (roll < 0.3 ? 0.45 : roll < 0.85 || !bare ? R(1.4, 1.7) : R(2.4, 2.7));   // the tall ones only by bare trees
      if (!inFrustum(_v.set(x, y, z), 0.95)) continue;
      if (flashLit() && _w.subVectors(_v, beamPos).normalize().dot(beamDir) > Math.cos(CFG.BEAM_ANGLE * 1.1)) continue;
      const c = camera.position;
      if (losBlocked(c.x, c.z, x, z) || !terrainClear(c.x, c.y, c.z, x, y, z)) continue;
      e.spawn(x, y, z, Math.random() < 0.15); return;
    }
  },
};
