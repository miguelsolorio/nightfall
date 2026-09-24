/* Foxfire stones
   The five glowing objectives: placement, bob/spin/halo, the shared glow
   light and hum, pickup, and the win trigger. Plus a sixth, untouchable
   stone that hangs beside the title screen's copy.
*/
import * as THREE from 'three';
import { clamp, flatDist } from './config.js';
import { glowTex } from './geometry.js';
import { scene, camera, relicLight } from './scene.js';
import { heightAt, cabinToWorld, WELL, CIRCLE, BOULDERS } from './world.js';
import { game, player } from './state.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';

export const RELIC_SPOTS = [
  { ...cabinToWorld(1.3, -1.3), yo: 1.13 },               // on the cabin table
  { x: WELL.x, z: WELL.z + 1.05, yo: 1.12 },               // on the well's rim
  { x: -1.7, z: 71.8, yo: 0.38 },                          // by the broken fence
  { x: CIRCLE.x, z: CIRCLE.z, yo: 0.9 },                   // on the altar in the stone circle
  { x: BOULDERS.x, z: BOULDERS.z, yo: 0.38 },              // among the boulders
];
const relicCoreMat = new THREE.MeshBasicMaterial({ color: 0xd8fff0, fog: false });
const relicShellMat = new THREE.MeshBasicMaterial({ color: 0x86e6b4, wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
function relicMesh() {
  const g = new THREE.Group(), core = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), relicCoreMat), shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), relicShellMat);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9ff5c8, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.setScalar(2.2); g.add(core, shell, halo); scene.add(g);
  return { group: g, core, shell, halo };
}
function spin(r, dt) { r.core.rotation.y += dt * 1.1; r.shell.rotation.y -= dt * 0.6; r.shell.rotation.x += dt * 0.3; }
export const relics = RELIC_SPOTS.map((s, i) => {
  const r = relicMesh(), base = heightAt(s.x, s.z) + s.yo; r.group.position.set(s.x, base, s.z);
  return { ...r, base, i, collected: false };
});
const REMAIN = ['One. Four more are waiting.', 'Two. The fog feels closer.', 'Three. Something has noticed.', 'Four. One left — don’t stop now.'];

export function updateRelics(dt) {
  let nearest = null, best = 1e9;
  for (const r of relics) {
    if (r.collected) continue;
    r.group.position.y = r.base + Math.sin(game.t * 1.8 + r.i) * 0.07;
    spin(r, dt);
    const d = camera.position.distanceTo(r.group.position);
    r.halo.material.opacity = Math.pow(clamp(1 - d / 50, 0, 1), 1.4) * (0.55 + 0.15 * Math.sin(game.t * 2.5 + r.i));
    if (d < best) { best = d; nearest = r; }
    if (game.state === 'playing' && flatDist(r.group.position, player.pos) < 1.6 && Math.abs(r.group.position.y - player.pos.y) < 2.5) collect(r);
  }
  if (nearest && best < 30) { relicLight.position.copy(nearest.group.position); relicLight.intensity = 5 + Math.sin(game.t * 2.5) * 1.2; }
  else relicLight.intensity = 0;
  AudioSys.setHum(nearest && nearest.group.position, nearest && best < 45 ? 1 : 0);
}

// The title screen's stone, framed in screen space: right of the copy on wide screens, above it on
// portrait phones (where the copy sits along the bottom). Placed from the menu camera's resting pose.
export const menuRelic = { ...relicMesh(), base: new THREE.Vector3() };
menuRelic.group.scale.setScalar(1.8);
menuRelic.halo.material.color.set(0x6fd9a0);   // a deeper green than the in-world halo, which reads as white this close
const _dir = new THREE.Vector3();
export function placeMenuRelic() {
  const portrait = camera.aspect < 1;
  _dir.set(portrait ? 0.02 : 0.42, portrait ? 0.56 : -0.16, 0.5).unproject(camera).sub(camera.position).normalize();
  menuRelic.base.copy(camera.position).addScaledVector(_dir, 4);
}
export function updateMenuRelic(dt) {
  const r = menuRelic, g = r.group;
  g.visible = true; g.position.copy(r.base); g.position.y += Math.sin(game.t * 1.8) * 0.07; spin(r, dt);
  r.halo.material.opacity = 0.5 + 0.1 * Math.sin(game.t * 2.5);
  relicLight.position.copy(g.position); relicLight.intensity = 5 + Math.sin(game.t * 2.5) * 1.2;
}
function collect(r) {
  r.collected = true; r.group.visible = false; game.found++;
  AudioSys.chime(); UI.setStones(game.found); UI.flash('#bfe9cf', 0.25, 1.2);
  if (game.found >= 5) { game.state = 'winning'; game.cineT = 0; UI.message('The fog is thinning…', 3); AudioSys.fadeBeds(0); }
  else UI.message(REMAIN[game.found - 1], 3.5);
}
