/* Nightfall — main loop
   Wires every system together, runs the per-frame update, and exposes a
   small test hook (window.__nf).
*/
import { CFG, DEBUG, clamp, lerp } from './config.js';
import { renderer, scene, camera, sky, spot, hemi, moon, updateClouds } from './scene.js';
import { updateCulling, updateMist, updateFoliage, meadowAt, PINES, DEADS, chunks, CABIN, WELL, CIRCLE, BOULDERS, MEADOWS, HOLLOW, GRAVEYARD } from './world.js';
import { game, player, input, flash } from './state.js';
import { updatePlayer } from './player.js';
import { updateFlashlight, updateBeamVectors } from './flashlight.js';
import { AudioSys } from './audio.js';
import { UI, $ } from './ui.js';
import { relics, updateRelics, RELIC_SPOTS, menuRelic, placeMenuRelic, updateMenuRelic } from './relics.js';
import { deerHerd } from './creatures/deer.js';
import { owls } from './creatures/owls.js';
import { wolfPack } from './creatures/wolves.js';
import { ghostMgr } from './creatures/ghosts.js';
import { wanderer } from './creatures/wanderer.js';
import { scarecrow } from './creatures/scarecrow.js';
import { eyes } from './creatures/eyes.js';
import { monster } from './creatures/monster.js';
import { resetGame, stepCinematic } from './game.js';
import './controls.js';
import './touch.js';

function step(dt) {
  game.time += dt;
  updatePlayer(dt);
  updateFlashlight(dt, game.threat);
  updateBeamVectors();
  deerHerd.update(dt);
  owls.forEach(o => o.update(dt, game.t));
  wolfPack.update(dt);
  ghostMgr.update(dt);
  wanderer.update(dt);
  scarecrow.update(dt);
  eyes.update(dt);
  monster.update(dt);
  if (game.state !== 'playing') return;   // caught this frame
  updateRelics(dt);

  // The fog thins a little over the open fields; now and then clouds cover the moon
  scene.fog.density = lerp(scene.fog.density, CFG.FOG_DENSITY * (1 - 0.25 * meadowAt(player.pos.x, player.pos.z)), 1 - Math.exp(-dt * 0.8));
  updateClouds(game.time);

  // Threat: how close is something that wants you? Drives drone, heartbeat, vignette, flicker
  let threat = 0;
  if (monster.state === 'stalk' && !monster.hidden) threat = clamp(1 - (monster.dist - 2) / 30, 0, 1);
  for (const g of ghostMgr.ghosts) if (g.state === 'drift') threat = Math.max(threat, 0.55 * clamp(1 - g.dist / 22, 0, 1));
  if (wolfPack.state === 'circling') for (const w of wolfPack.wolves) if (w.active) threat = Math.max(threat, 0.3 * clamp(1 - (w.dist - 8) / 25, 0, 1));
  if (Number.isFinite(threat)) game.threat = lerp(game.threat, threat, 1 - Math.exp(-dt * 2));
  AudioSys.update(dt, game.threat);
  UI.stamina(player.stamina, player.exhausted);
  UI.light(flash.on);
  UI.setThreat(game.threat);
}
// Behind the title screen: a still shot across the clearing toward the moon, drifting a little,
// with a foxfire stone hung beside the copy. The stone is placed from the resting pose, and again
// whenever the window changes shape.
const MENU = { yaw: 1.2, pitch: 0.13 };
let placeStone = true;
addEventListener('resize', () => { placeStone = true; });
function attract(dt) {
  if (placeStone) { player.yaw = MENU.yaw; player.pitch = MENU.pitch; updatePlayer(0); placeMenuRelic(); placeStone = false; }
  player.yaw = MENU.yaw + Math.sin(game.t * 0.11) * 0.025;
  player.pitch = MENU.pitch + Math.sin(game.t * 0.07) * 0.012;
  updatePlayer(0); updateFlashlight(dt, 0); updateBeamVectors(); updateRelics(dt); updateMenuRelic(dt);
}

// Adaptive resolution: if frames run long during play, render fewer pixels
// (down to a floor), and step back up once there's headroom again.
const res = { max: renderer.getPixelRatio(), min: Math.min(0.75, renderer.getPixelRatio()), acc: 0, n: 0 };
function adaptResolution(raw) {
  if (game.state !== 'playing' || raw > 0.25) return;   // ignore menus and tab-switch hiccups
  res.acc += raw; res.n++;
  if (res.acc < 2) return;
  const avg = res.acc / res.n, ratio = renderer.getPixelRatio();
  res.acc = res.n = 0;
  if (avg > 1 / 40 && ratio > res.min) renderer.setPixelRatio(Math.max(res.min, ratio - 0.15));
  else if (avg < 1 / 57 && ratio < res.max) renderer.setPixelRatio(Math.min(res.max, ratio + 0.1));
}

const debugEl = $('debug');
if (DEBUG) debugEl.hidden = false;
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(raw, 0.05);
  game.t += dt;
  if (game.state === 'playing') step(dt);
  else if (game.state === 'dying' || game.state === 'winning') { stepCinematic(dt); updateRelics(dt); }
  else if (game.state === 'menu') attract(dt);
  sky.position.copy(camera.position);
  updateCulling();
  updateMist(dt);
  updateFoliage(game.t);
  renderer.render(scene, camera);
  adaptResolution(raw);

  if (!debugEl.hidden) {
    fpsAcc += raw; fpsN++;
    if ((fpsT += raw) > 0.5) {
      const i = renderer.info.render;
      debugEl.textContent = `fps   ${(fpsN / fpsAcc).toFixed(0)}\ncalls ${i.calls}\ntris  ${(i.triangles / 1000).toFixed(0)}k\nres   ${renderer.getPixelRatio().toFixed(2)}x\npos   ${player.pos.x.toFixed(1)}, ${player.pos.z.toFixed(1)}\nthing ${monster.state}${monster.hidden ? ' (hidden)' : ''} ${monster.dist.toFixed(1)}m\nthreat ${game.threat.toFixed(2)}`;
      fpsAcc = fpsN = fpsT = 0;
    }
  }
}
resetGame();
game.state = 'menu';
requestAnimationFrame(frame);

// Test hooks (harmless in play): window.__nf.teleport(x, z)
window.__nf = {
  game, player, input, flash, monster, wanderer, ghostMgr, wolfPack, deerHerd, owls, scarecrow, eyes, relics, menuRelic, MENU, camera, renderer, scene,
  CFG, spot, hemi, moon, RELIC_SPOTS, CABIN, WELL, CIRCLE, BOULDERS, MEADOWS, HOLLOW, GRAVEYARD, audio: AudioSys,
  teleport(x, z, yaw) { player.pos.x = x; player.pos.z = z; player.vel.set(0, 0, 0); player.eyeY = null; if (yaw !== undefined) player.yaw = yaw; },
  counts: () => ({ pines: PINES.length, deads: DEADS.length, chunks: chunks.size }),
  // Advance the simulation by n fixed steps (for testing without rAF), then render once
  tick(n = 1, dt = 1 / 60) {
    for (let i = 0; i < n; i++) {
      game.t += dt;
      if (game.state === 'playing') step(dt);
      else if (game.state === 'dying' || game.state === 'winning') { stepCinematic(dt); updateRelics(dt); }
    }
    sky.position.copy(camera.position); updateCulling(); renderer.render(scene, camera);
    return game.state;
  },
};
