/* Nightfall — main loop
   Wires every system together, runs the per-frame update, and exposes a
   small test hook (window.__nf).
*/
import { CFG, DEBUG, clamp, lerp } from './config.js';
import { renderer, scene, camera, sky, spot, hemi, moon } from './scene.js';
import { updateCulling, updateMist, PINES, DEADS, chunks, CABIN, WELL, CIRCLE, BOULDERS } from './world.js';
import { game, player, flash } from './state.js';
import { updatePlayer } from './player.js';
import { updateFlashlight, updateBeamVectors } from './flashlight.js';
import { AudioSys } from './audio.js';
import { UI, $ } from './ui.js';
import { relics, updateRelics, RELIC_SPOTS } from './relics.js';
import { deerHerd } from './creatures/deer.js';
import { owls } from './creatures/owls.js';
import { wolfPack } from './creatures/wolves.js';
import { ghostMgr } from './creatures/ghosts.js';
import { wanderer } from './creatures/wanderer.js';
import { monster } from './creatures/monster.js';
import { resetGame, stepCinematic } from './game.js';
import './controls.js';

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
  monster.update(dt);
  if (game.state !== 'playing') return;   // caught this frame
  updateRelics(dt);

  // Threat: how close is something that wants you? Drives drone, heartbeat, vignette, flicker
  let threat = 0;
  if (monster.state === 'stalk' && !monster.hidden) threat = clamp(1 - (monster.dist - 2) / 30, 0, 1);
  for (const g of ghostMgr.ghosts) if (g.state === 'drift') threat = Math.max(threat, 0.55 * clamp(1 - g.dist / 22, 0, 1));
  if (wolfPack.state === 'circling') for (const w of wolfPack.wolves) if (w.active) threat = Math.max(threat, 0.3 * clamp(1 - (w.dist - 8) / 25, 0, 1));
  if (Number.isFinite(threat)) game.threat = lerp(game.threat, threat, 1 - Math.exp(-dt * 2));
  AudioSys.update(dt, game.threat);
  UI.stamina(player.stamina, player.exhausted);
  UI.setThreat(game.threat);
}
function attract(dt) {   // slow look around the clearing behind the title screen
  player.yaw += dt * 0.04;
  updatePlayer(0); updateFlashlight(dt, 0); updateBeamVectors(); updateRelics(dt);
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
  renderer.render(scene, camera);

  if (!debugEl.hidden) {
    fpsAcc += raw; fpsN++;
    if ((fpsT += raw) > 0.5) {
      const i = renderer.info.render;
      debugEl.textContent = `fps   ${(fpsN / fpsAcc).toFixed(0)}\ncalls ${i.calls}\ntris  ${(i.triangles / 1000).toFixed(0)}k\npos   ${player.pos.x.toFixed(1)}, ${player.pos.z.toFixed(1)}\nthing ${monster.state}${monster.hidden ? ' (hidden)' : ''} ${monster.dist.toFixed(1)}m\nthreat ${game.threat.toFixed(2)}`;
      fpsAcc = fpsN = fpsT = 0;
    }
  }
}
resetGame();
game.state = 'menu';
requestAnimationFrame(frame);

// Test hooks (harmless in play): window.__nf.teleport(x, z)
window.__nf = {
  game, player, flash, monster, wanderer, ghostMgr, wolfPack, deerHerd, owls, relics, camera, renderer, scene,
  CFG, spot, hemi, moon, RELIC_SPOTS, CABIN, WELL, CIRCLE, BOULDERS,
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
