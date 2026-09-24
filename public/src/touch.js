/* Touch
   On-screen controls for phones and tablets: a move stick under the left
   thumb (drag past its ring to run), drag anywhere else to look, and
   buttons for the flashlight and pause. The last tap or click picks the
   scheme, so a touchscreen laptop can switch between the two.
*/
import { clamp } from './config.js';
import { game, player, input } from './state.js';
import { toggleFlashlight } from './flashlight.js';
import { pauseGame } from './game.js';
import { $ } from './ui.js';

const layer = $('touch'), stick = $('stick'), knob = $('knob');
const STICK_R = 48;     // px the knob travels
const RUN_AT = 1.4;     // drag this many radii from where the thumb landed to run
const DEAD = 0.12;      // ignore tiny nudges
const LOOK = 3.4;       // radians turned by a swipe across the long edge of the screen
let stickId = null, sx = 0, sy = 0;
const looks = new Map();   // pointerId → last position

function setTouch(on) { input.touch = on; document.documentElement.classList.toggle('touch', on); }
setTouch(document.documentElement.classList.contains('touch'));   // first guess is made in index.html
// A tap can be followed by compatibility mouse events, and some mobile browsers report those as a
// mouse pointer. Flipping to desktop mode then swaps the screen's text mid-tap, and iOS reads that
// as a hover and cancels the click. So only a real mouse, well after the last touch, switches back.
const hasMouse = matchMedia('(any-pointer: fine)');
let lastTouch = -Infinity;
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') { lastTouch = e.timeStamp; setTouch(true); }
  else if (hasMouse.matches && e.timeStamp - lastTouch > 1000) setTouch(false);
}, true);

function releaseStick() {
  stickId = null; input.moveX = input.moveY = 0; input.moveRun = false;
  stick.classList.remove('on', 'run'); stick.style.left = stick.style.top = ''; knob.style.transform = '';
}
function releaseAll() { releaseStick(); looks.clear(); }

layer.addEventListener('touchstart', e => e.preventDefault(), { passive: false });   // no synthetic clicks, zoom or callouts
layer.addEventListener('pointerdown', e => {
  if (e.isPrimary) releaseAll();   // no other finger is down, so anything still tracked is stale
  if (game.state !== 'playing' || e.target.closest('button')) return;
  if (stickId === null && e.clientX < innerWidth * 0.45) {
    stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
    stick.style.left = `${sx}px`; stick.style.top = `${sy}px`; stick.classList.add('on');
  } else looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
layer.addEventListener('pointermove', e => {
  if (game.state !== 'playing') return;
  if (e.pointerId === stickId) {
    const dx = e.clientX - sx, dy = e.clientY - sy, d = Math.hypot(dx, dy) || 1e-6;
    const m = Math.min(1, d / STICK_R), mag = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD), k = Math.min(d, STICK_R) / d;
    input.moveX = dx / d * mag; input.moveY = -dy / d * mag;
    input.moveRun = d > STICK_R * RUN_AT;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    stick.classList.toggle('run', input.moveRun);
  }
  const l = looks.get(e.pointerId);
  if (l) {
    const s = LOOK / Math.max(innerWidth, innerHeight);
    player.yaw -= (e.clientX - l.x) * s;
    player.pitch = clamp(player.pitch - (e.clientY - l.y) * s, -1.35, 1.35);
    l.x = e.clientX; l.y = e.clientY;
  }
});
function lift(e) { if (e.pointerId === stickId) releaseStick(); looks.delete(e.pointerId); }
layer.addEventListener('pointerup', lift);
layer.addEventListener('pointercancel', lift);
addEventListener('blur', releaseAll);

$('lightBtn').addEventListener('pointerdown', () => { if (game.state === 'playing') toggleFlashlight(); });
// On lift, not press: a pause screen that appears under a finger that's still down takes that tap as "resume"
$('pauseBtn').addEventListener('pointerup', () => { releaseAll(); pauseGame(); });
