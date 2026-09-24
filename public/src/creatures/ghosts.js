/* Ghosts
   Gaunt, long-haired figures that come at you in lurches, heads snapping at
   wrong angles, moaning. The beam's light dissolves them. One that reaches
   you lunges into your face with a shriek — a scare, not a death.
*/
import * as THREE from 'three';
import { R, clamp, flatDist } from '../config.js';
import { glowTex } from '../geometry.js';
import { scene, camera } from '../scene.js';
import { heightAt, meadowAt, GRAVEYARD } from '../world.js';
import { player } from '../state.js';
import { beamCenterness, startFlicker } from '../flashlight.js';
import { AudioSys } from '../audio.js';
import { UI } from '../ui.js';
import { findSpot, GEO } from './common.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3();

// Rim-lit and nearly hollow in the middle, fading out toward the ragged hem, with a
// crawling shimmer and grain. uHem = 1 for the body (hem fade + ripple), 0 for the head.
const VERT = `
  uniform float uTime; uniform float uHem;
  varying vec3 vN; varying vec3 vV; varying float vY;
  void main() {
    vec3 p = position;
    float hem = (1.0 - smoothstep(0.0, 0.9, p.y)) * uHem;
    p.x += sin(uTime * 3.1 + p.y * 7.0 + p.z * 5.0) * 0.07 * hem;
    p.z += cos(uTime * 2.4 + p.y * 6.0 + p.x * 4.0) * 0.07 * hem;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uHem;
  varying vec3 vN; varying vec3 vV; varying float vY;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.8);
    float fade = mix(1.0, smoothstep(-0.35, 0.9, vY), uHem);
    float scan = 0.92 + 0.08 * sin(vY * 70.0 - uTime * 9.0);
    float grain = 0.7 + 0.6 * hash(gl_FragCoord.xy + fract(uTime) * 91.0);
    float a = (0.06 + f * 0.9) * fade * scan * grain * uOpacity;
    gl_FragColor = vec4(uColor * (0.45 + f * 0.9), clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ---------- Ghosts ----------
class Ghost {
  constructor() {
    this.u = { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xc2d4cc) } };
    const shader = hem => new THREE.ShaderMaterial({ uniforms: { ...this.u, uHem: { value: hem } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.dark = new THREE.MeshBasicMaterial({ color: 0x030304, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.pupilMat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const part = (geo, m, order) => { const o = new THREE.Mesh(geo, m); o.renderOrder = order; return o; };
    this.group = new THREE.Group();
    this.group.add(part(GEO.ghostBody, shader(1), 10));
    this.head = new THREE.Group(); this.head.position.set(0, 1.98, 0.02); this.group.add(this.head);
    this.hair = part(GEO.ghostHair, this.dark, 11); this.hair.position.copy(this.head.position); this.group.add(this.hair);
    this.mouth = part(GEO.ghostMouth, this.dark, 11); this.mouth.position.set(0.02, -0.075, 0.1);
    this.pupils = part(GEO.ghostPupils, this.pupilMat, 12);
    this.head.add(part(GEO.ghostHead, shader(0), 10), part(GEO.ghostFace, this.dark, 11), this.mouth, this.pupils);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7f9a8c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.scale.set(2.6, 4, 1); this.halo.position.y = 1.2; this.group.add(this.halo);
    this.state = 'off'; this.group.visible = false; scene.add(this.group);
  }
  spawn(x, z) {
    this.group.position.set(x, heightAt(x, z) + 0.3, z); this.group.scale.set(1, 1, 1);
    this.state = 'drift'; this.fade = 0; this.exposure = 0; this.dist = Math.hypot(x - player.pos.x, z - player.pos.z); this.t = Math.random() * 10; this.speed = R(0.55, 0.85);
    this.group.visible = true; this.jitT = 0; this.lurchT = R(1.5, 3.5); this.lurch = 0; this.glitch = 0;
    this.tilt = (Math.random() < 0.5 ? -1 : 1) * R(0.2, 0.35); this.twitchT = R(0.8, 2.5); this.head.rotation.set(0, 0, this.tilt);
    this.moanT = R(2, 6);
    this.whisper = AudioSys.whisperLoop(this.group.position);
  }
  off() { this.state = 'off'; this.group.visible = false; this.whisper?.stop(); this.whisper = null; }
  vanish() { this.state = 'vanish'; this.vt = 0; AudioSys.ghostVanish(this.group.position); this.whisper?.stop(); this.whisper = null; }
  lunge() { this.state = 'lunge'; this.lt = 0; this.whisper?.stop(); this.whisper = null; ghostScare(); }
  setOpacity(o, d) {
    this.u.uOpacity.value = o; this.dark.opacity = o * 0.92;
    this.pupilMat.opacity = o * clamp((10 - d) / 4, 0, 1);
    this.halo.material.opacity = 0.16 * o;
  }
  update(dt) {
    if (this.state === 'off') return;
    const g = this.group, pos = g.position; this.t += dt; this.u.uTime.value = this.t;
    const d = flatDist(pos, player.pos);
    if (this.state === 'drift') {
      this.fade = Math.min(1, this.fade + dt * 0.5);
      // A slow advance broken by lurches: it skips a meter or two and flickers as it does
      if ((this.lurchT -= dt) <= 0) { this.lurchT = R(1.5, 4); this.lurch = 0.15; this.glitch = 0.05; }
      const speed = this.lurch > 0 ? 8 : this.speed; this.lurch -= dt; this.glitch -= dt;
      const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
      pos.x += dx / d * speed * dt + Math.cos(this.t * 0.7) * 0.2 * dt; pos.z += dz / d * speed * dt;
      pos.y = heightAt(pos.x, pos.z) + 0.3 + Math.sin(this.t * 1.1) * 0.12;
      g.rotation.y = Math.atan2(dx, dz);
      // Head snaps to wrong angles and holds there
      if ((this.twitchT -= dt) <= 0) { this.twitchT = R(0.8, 3); this.head.rotation.set(R(-0.15, 0.3), R(-0.35, 0.35), this.tilt + R(-0.3, 0.3)); }
      if (d < 8) this.head.rotation.z += R(-1, 1) * 0.03;
      this.mouth.scale.y = 1 + clamp((12 - d) / 10, 0, 1) * 1.6;
      const lit = beamCenterness(_v.set(pos.x, pos.y + 1.2, pos.z));
      this.exposure = lit > 0 ? this.exposure + dt : Math.max(0, this.exposure - dt * 0.5);
      if (this.exposure > 0.35) { this.vanish(); return; }
      if (d < 1.4) { this.lunge(); return; }
      if (d > 70) { this.off(); return; }
      const distFade = clamp((52 - d) / 26, 0, 1), flick = 0.8 + 0.2 * Math.sin(this.t * 3.1) * Math.sin(this.t * 7.3);
      this.setOpacity(this.glitch > 0 ? 0 : this.fade * distFade * flick, d);
      if ((this.moanT -= dt) <= 0) { this.moanT = R(5, 10); if (d < 30) AudioSys.moan(_v.set(pos.x, pos.y + 1.9, pos.z)); }
      if (this.whisper) { this.whisper.setPos(_v.set(pos.x, pos.y + 1.4, pos.z)); this.whisper.setLevel(0.7 * this.fade); if ((this.jitT -= dt) <= 0) { this.jitT = R(0.1, 0.22); this.whisper.jitter(); } }
    } else if (this.state === 'lunge') {
      // In your face: hold it right in front of the camera, mouth wide, shaking
      this.lt += dt;
      camera.getWorldDirection(_f);
      const c = camera.position, j = 0.025;
      pos.set(c.x + _f.x * 0.62 + R(-j, j), c.y + _f.y * 0.62 - 1.98 + R(-j, j), c.z + _f.z * 0.62 + R(-j, j));
      g.rotation.y = Math.atan2(c.x - pos.x, c.z - pos.z);
      this.head.rotation.set(-_f.y * 0.8 + R(-0.08, 0.08), R(-0.1, 0.1), this.tilt * 0.5 + R(-0.15, 0.15));
      this.mouth.scale.y = 2.8 + R(-0.3, 0.3);
      this.setOpacity(Math.random() < 0.12 ? 0.3 : 1, 0);
      if (this.lt > 0.45) {
        UI.flash('#dfeaff', 0.6, 0.9);
        player.stamina = 0; player.exhausted = true;
        this.vanish();
      }
    } else if (this.state === 'vanish') {
      this.vt += dt;
      g.scale.set(Math.max(0.05, 1 - this.vt * 1.1), 1 + this.vt * 2.2, Math.max(0.05, 1 - this.vt * 1.1)); pos.y += dt * 1.2;
      pos.x += R(-1, 1) * 0.03; pos.z += R(-1, 1) * 0.03;
      this.setOpacity(this.u.uOpacity.value * Math.exp(-dt * 6), d);
      if (this.vt > 0.8) this.off();
    }
    const h = this.head.rotation; this.hair.rotation.set(h.x * 0.5, h.y, h.z * 0.3);
    this.dist = d;
  }
}
function ghostScare() {
  player.shake = 1.2;
  startFlicker(1.2);
  AudioSys.shriek();
}
export const ghostMgr = {
  ghosts: [new Ghost(), new Ghost(), new Ghost()], timer: 55,
  reset() { this.timer = 55; this.ghosts.forEach(g => g.off()); },
  update(dt) {
    // They come more often among the graves
    const graves = meadowAt(player.pos.x, player.pos.z) > 0.2 && Math.hypot(player.pos.x - GRAVEYARD.x, player.pos.z - GRAVEYARD.z) < 30;
    if ((this.timer -= dt * (graves ? 2.5 : 1)) <= 0) {
      this.timer = R(22, 40);
      const g = this.ghosts.find(g => g.state === 'off'), s = g && findSpot(26, 36, 'hidden');
      if (s) { g.spawn(s.x, s.z); if (Math.random() < 0.5) AudioSys.choir(8, 0.7); }
    }
    this.ghosts.forEach(g => g.update(dt));
  },
};
