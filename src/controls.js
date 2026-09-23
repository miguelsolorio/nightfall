/* Controls
   Keyboard and mouse input: WASD/arrows, Shift, F, Esc, mouse look
   (pointer lock or drag), and the ` debug toggle.
*/
import { clamp } from './config.js';
import { canvas } from './scene.js';
import { game, player, input } from './state.js';
import { toggleFlashlight } from './flashlight.js';
import { pauseGame } from './game.js';
import { $ } from './ui.js';

document.addEventListener('mousemove', e => {
  if (game.state !== 'playing') return;
  if (document.pointerLockElement === canvas || (input.dragLook && input.dragging)) {
    player.yaw -= clamp(e.movementX, -150, 150) * 0.0022;
    player.pitch = clamp(player.pitch - clamp(e.movementY, -150, 150) * 0.0022, -1.35, 1.35);
  }
});
canvas.addEventListener('mousedown', () => { input.dragging = true; });
addEventListener('mouseup', () => { input.dragging = false; });
addEventListener('keydown', e => {
  input.keys[e.code] = true;
  if (e.code === 'KeyF' && !e.repeat && game.state === 'playing') toggleFlashlight();
  if (e.code === 'Backquote') $('debug').hidden = !$('debug').hidden;
  if (e.code === 'Escape' && input.dragLook) pauseGame();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { input.keys[e.code] = false; });
addEventListener('blur', () => { for (const k in input.keys) delete input.keys[k]; });
