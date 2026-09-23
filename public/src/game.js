/* Game flow
   Reset, start / pause / resume, pointer lock (with drag-to-look fallback),
   the scripted catch and escape, and the end screens.
*/
import { CFG, R, lerp, turnTo } from './config.js';
import { scene, camera, renderer, canvas } from './scene.js';
import { heightAt } from './world.js';
import { game, player, flash, input } from './state.js';
import { updatePlayer } from './player.js';
import { updateFlashlight, updateBeamVectors } from './flashlight.js';
import { AudioSys } from './audio.js';
import { UI, $ } from './ui.js';
import { relics } from './relics.js';
import { deerHerd } from './creatures/deer.js';
import { owls } from './creatures/owls.js';
import { wolfPack } from './creatures/wolves.js';
import { ghostMgr } from './creatures/ghosts.js';
import { wanderer } from './creatures/wanderer.js';
import { monster } from './creatures/monster.js';

export function resetGame() {
  player.pos.set(0, 0, 3); player.vel.set(0, 0, 0); player.yaw = 0.35; player.pitch = 0; player.eyeY = null;
  player.stamina = 1; player.exhausted = false; player.shake = 0; player.bob = 0;
  flash.on = true; flash.level = 1; flash.flickerT = 0; flash.monsterFlicker = false; flash.next = R(10, 20); flash.lastYaw = player.yaw; flash.lastPitch = 0;
  relics.forEach(r => { r.collected = false; r.group.visible = true; });
  game.found = 0; game.time = 0; game.threat = 0;
  scene.fog.density = CFG.FOG_DENSITY; renderer.toneMappingExposure = 1.15;
  updatePlayer(0); updateBeamVectors();
  deerHerd.reset(); owls.forEach(o => o.reset()); wolfPack.reset(); ghostMgr.reset(); wanderer.reset(); monster.reset();
  UI.setStones(0); UI.clearText();
  if (AudioSys.ready) { AudioSys.muted = false; }
}
export function endGame(win) {
  game.state = win ? 'won' : 'dead';
  if (document.pointerLockElement) document.exitPointerLock();
  if (win) AudioSys.dawn(); else AudioSys.fadeBeds(0);
  UI.showEnd(win);
}
// Short scripted beats for the catch and the escape
export function stepCinematic(dt) {
  game.cineT += dt;
  if (game.state === 'dying') {
    const m = monster.group.position;
    // It closes the last meter and fills your view
    const dx = m.x - player.pos.x, dz = m.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
    m.x = player.pos.x + dx / d * 1.4; m.z = player.pos.z + dz / d * 1.4; m.y = heightAt(m.x, m.z);
    monster.face();
    const targetYaw = Math.atan2(-dx, -dz), targetPitch = Math.atan2(m.y + 2.85 - camera.position.y, 1.4);
    player.yaw = turnTo(player.yaw, targetYaw, dt * 9); player.pitch = lerp(player.pitch, targetPitch, 1 - Math.exp(-dt * 8));
    monster.head.rotation.z = Math.sin(game.cineT * 30) * 0.08;
    updatePlayer(0); updateFlashlight(dt, 1);
    if (game.cineT > 1.6) endGame(false);
  } else if (game.state === 'winning') {
    scene.fog.density = lerp(scene.fog.density, 0.012, 1 - Math.exp(-dt * 0.8));
    renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, 2.2, 1 - Math.exp(-dt * 0.6));
    updatePlayer(dt); updateFlashlight(dt, 0);
    if (game.cineT > 3) endGame(true);
  }
}


// Pointer lock, with a drag-to-look fallback for frames that refuse it
export function lockPointer() {
  if (input.dragLook) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(onLockError); } catch (e) { onLockError(); }
}
function onLockError() {
  if (input.hadLock) { if (game.state === 'playing') pauseGame(); return; }   // browser re-lock cooldown
  if (input.dragLook) return;
  input.dragLook = true;
  UI.message('Drag with the mouse to look around.', 4);
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) input.hadLock = true;
  else if (game.state === 'playing' && !input.dragLook) pauseGame();
});
document.addEventListener('pointerlockerror', onLockError);

export function startGame() {
  AudioSys.init(); AudioSys.resume();
  resetGame();
  game.state = 'playing'; UI.show(null); UI.hud.hidden = false;
  lockPointer();
}
export function pauseGame() { if (game.state !== 'playing') return; game.state = 'paused'; UI.show(UI.pause); AudioSys.suspend(); for (const k in input.keys) delete input.keys[k]; }
export function resumeGame() { if (game.state !== 'paused') return; game.state = 'playing'; UI.show(null); AudioSys.resume(); lockPointer(); }
UI.start.addEventListener('click', startGame);
UI.pause.addEventListener('click', resumeGame);
$('restart').addEventListener('click', startGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
