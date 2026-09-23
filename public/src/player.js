/* Player
   WASD movement with acceleration, stamina and running, collision,
   world bounds, head bob and footsteps. Look input lives in controls.js.
*/
import { CFG, lerp, R } from './config.js';
import { camera } from './scene.js';
import { resolveCollision, groundAt } from './world.js';
import { player, input, blockers } from './state.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';

export function updatePlayer(dt) {
  const k = input.keys;
  const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
  const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
  const len = Math.hypot(wx, wz), moving = len > 0;
  if (moving) { wx /= len; wz /= len; }

  // Stamina: drains while running; once exhausted you must recover to 35%
  const wantRun = (k.ShiftLeft || k.ShiftRight) && moving && !player.exhausted && player.stamina > 0;
  player.running = wantRun;
  if (wantRun) {
    player.stamina = Math.max(0, player.stamina - dt / 6.5); player.runLock = 0.9;
    if (player.stamina <= 0) player.exhausted = true;
  } else {
    player.runLock -= dt;
    if (player.runLock <= 0) player.stamina = Math.min(1, player.stamina + dt / (player.exhausted ? 7 : 4.5));
    if (player.exhausted && player.stamina > 0.35) player.exhausted = false;
  }
  if (player.exhausted) { player.breathT -= dt; if (player.breathT <= 0) { AudioSys.breath(); player.breathT = 1.4; } }

  const target = moving ? (wantRun ? CFG.RUN : CFG.WALK) : 0, a = 1 - Math.exp(-dt * (moving ? 9 : 12));
  player.vel.x += (wx * target - player.vel.x) * a;
  player.vel.z += (wz * target - player.vel.z) * a;

  // Move, then collide with trees/rocks/walls and the wanderer
  const p = player.pos;
  p.x += player.vel.x * dt; p.z += player.vel.z * dt;
  resolveCollision(p, CFG.PLAYER_R);
  for (const b of blockers) {
    if (!b.obj.visible) continue;
    const w = b.obj.position, dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
    if (d < b.r && d > 1e-4) { p.x = w.x + dx / d * b.r; p.z = w.z + dz / d * b.r; }
  }
  const dc = Math.hypot(p.x, p.z), maxR = CFG.WORLD_R - 2;
  if (dc > maxR) {
    p.x *= maxR / dc; p.z *= maxR / dc;
    if (player.edgeMsgT <= 0) { UI.message('The trees grow too thick to pass.', 2.6); player.edgeMsgT = 9; }
  }
  player.edgeMsgT -= dt;
  player.speed = Math.hypot(player.vel.x, player.vel.z);

  // Head bob drives footsteps
  const amt = Math.min(1, player.speed / CFG.WALK);
  if (player.speed > 0.4) {
    player.bob += dt * (player.running ? 11.5 : 7.8);
    const step = Math.floor(player.bob / Math.PI);
    if (step !== player.lastStep) { player.lastStep = step; AudioSys.step(player.running); }
  }
  const ground = groundAt(p.x, p.z);
  p.y = ground;
  player.eyeY = player.eyeY === null ? ground + CFG.EYE : lerp(player.eyeY, ground + CFG.EYE, 1 - Math.exp(-dt * 14));
  const bobY = (Math.abs(Math.sin(player.bob)) - 0.5) * 0.07 * amt, sway = Math.sin(player.bob) * 0.03 * amt;
  player.shake = Math.max(0, player.shake - dt * 1.8);
  const sh = player.shake * player.shake;
  camera.position.set(p.x + cy * sway, player.eyeY + bobY, p.z - sy * sway);
  camera.rotation.set(player.pitch + R(-1, 1) * sh * 0.05, player.yaw + R(-1, 1) * sh * 0.05, 0);
  camera.updateMatrixWorld(true);
}
