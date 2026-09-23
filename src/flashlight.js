/* Flashlight
   Toggle, flicker, hand lag, and the "is this lit?" test that ghosts,
   owls, wolves and the monster all react to.
*/
import * as THREE from 'three';
import { CFG, clamp, R } from './config.js';
import { hand, spot } from './scene.js';
import { losBlocked } from './world.js';
import { flash, player } from './state.js';
import { AudioSys } from './audio.js';

const _t = new THREE.Vector3(), _w = new THREE.Vector3();

// Flashlight: toggle, random flicker (more often when the monster is near), hand lag
export const flashLit = () => flash.on && flash.level > 0.35;
export function startFlicker(dur, monsterDriven = false) { flash.flickerT = dur; flash.monsterFlicker = monsterDriven; }
export function toggleFlashlight() { flash.on = !flash.on; AudioSys.click(flash.on); }
export function updateFlashlight(dt, threat) {
  flash.next -= dt * (1 + threat * 2.5);
  if (flash.next <= 0 && flash.flickerT <= 0) { startFlicker(R(0.25, 1.4)); flash.next = R(9, 25); }
  if (flash.flickerT > 0) {
    flash.flickerT -= dt; flash.jitterT -= dt;
    if (flash.jitterT <= 0) { flash.jitterT = R(0.03, 0.09); const r = Math.random(); flash.target = r < 0.4 ? 0.02 : r < 0.7 ? R(0.2, 0.6) : R(0.8, 1); }
    flash.level = flash.target;
    if (flash.monsterFlicker && flash.flickerT < 0.6 && flash.flickerT > 0.15) flash.level = 0; // full blackout
    if (flash.flickerT <= 0) flash.monsterFlicker = false;
  } else flash.level += (1 - flash.level) * (1 - Math.exp(-dt * 10));
  spot.intensity = flash.on ? CFG.FLASH_INTENSITY * flash.level : 0;

  // Beam trails the view a little when turning, and sways with each step
  flash.lagY = clamp((flash.lagY - (player.yaw - flash.lastYaw) * 0.45) * Math.exp(-dt * 8), -0.2, 0.2);
  flash.lagX = clamp((flash.lagX - (player.pitch - flash.lastPitch) * 0.45) * Math.exp(-dt * 8), -0.2, 0.2);
  flash.lastYaw = player.yaw; flash.lastPitch = player.pitch;
  const amt = Math.min(1, player.speed / CFG.WALK);
  hand.rotation.set(0.03 + flash.lagX + Math.sin(player.bob * 2) * 0.012 * amt, 0.025 + flash.lagY + Math.sin(player.bob) * 0.016 * amt, 0);
}
// World-space beam origin/direction, and a helper for "is this point in the light?"
export const beamPos = new THREE.Vector3(), beamDir = new THREE.Vector3();
export function updateBeamVectors() { hand.updateMatrixWorld(true); spot.getWorldPosition(beamPos); spot.target.getWorldPosition(_t); beamDir.subVectors(_t, beamPos).normalize(); }
export function beamCenterness(p) { // 0 = not lit, (0..1] = lit, 1 = dead center
  if (!flashLit()) return 0;
  _w.subVectors(p, beamPos);
  const d = _w.length(); if (d > CFG.BEAM_RANGE || d < 0.05) return 0;
  const ang = Math.acos(clamp(_w.dot(beamDir) / d, -1, 1));
  if (ang > CFG.BEAM_ANGLE) return 0;
  if (losBlocked(beamPos.x, beamPos.z, p.x, p.z)) return 0;
  return 1 - ang / CFG.BEAM_ANGLE;
}
