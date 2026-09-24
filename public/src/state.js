/* Shared game state
   Plain mutable objects read and written by every system.
*/
import * as THREE from 'three';
import { R } from './config.js';

// move*: the touch stick (x right, y forward, -1..1). touch: on-screen controls are in use.
export const input = { keys: {}, dragLook: false, dragging: false, hadLock: false, touch: false, moveX: 0, moveY: 0, moveRun: false };
export const player = {
  pos: new THREE.Vector3(0, 0, 3), vel: new THREE.Vector3(), yaw: 0, pitch: 0, eyeY: null,
  stamina: 1, exhausted: false, runLock: 0, running: false, speed: 0,
  bob: 0, lastStep: 0, shake: 0, breathT: 0, edgeMsgT: 0,
};
export const flash = { on: true, level: 1, target: 1, flickerT: 0, jitterT: 0, next: R(10, 22), monsterFlicker: false, lagX: 0, lagY: 0, lastYaw: 0, lastPitch: 0 };
export const game = { state: 'menu', time: 0, t: 0, found: 0, threat: 0, cineT: 0 };
// Moving things the player can't walk through: { obj: Object3D, r: radius }
export const blockers = [];
