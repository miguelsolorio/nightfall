/* Scene setup
   Renderer, fog, sky dome, and the fixed set of lights (moon, hemisphere,
   the flashlight spot — the only shadow caster — and one roaming relic light).
   Clouds drift over the moon now and then, and the forest goes darker.
*/
import * as THREE from 'three';
import { CFG, mulberry32, fbm, smoothstep } from './config.js';
import { canvasTexture } from './geometry.js';

export const canvas = document.getElementById('game');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.PIXEL_RATIO));
renderer.setSize(innerWidth || 1280, innerHeight || 720);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(CFG.FOG_COLOR);
scene.fog = new THREE.FogExp2(CFG.FOG_COLOR, CFG.FOG_DENSITY);

export const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 450);
camera.rotation.order = 'YXZ';
// Vertical FOV is 70°; on a portrait phone, widen it (up to 90°) so the view isn't a slit
function fitCamera(w, h) {
  camera.aspect = w / h;
  camera.fov = camera.aspect >= 1 ? 70 : Math.min(90, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(35)) / camera.aspect)));
  camera.updateProjectionMatrix();
}
if (innerWidth && innerHeight) fitCamera(innerWidth, innerHeight);
scene.add(camera);

// Sky dome: gradient that meets the fog at the horizon, a hazy moon and faint stars
export const MOON_DIR = new THREE.Vector3(-0.45, 0.52, -0.73).normalize();
export const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { horizon: { value: new THREE.Color(CFG.FOG_COLOR) }, zenith: { value: new THREE.Color(0x070a12) }, moonDir: { value: MOON_DIR }, moonVis: { value: 1 } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; uniform vec3 moonDir; uniform float moonVis; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, d.y));
      float m = max(dot(d, moonDir), 0.0);
      col += vec3(0.16, 0.19, 0.26) * pow(m, 14.0) * 0.55 * (0.4 + 0.6 * moonVis);   // halo in the haze
      col += vec3(0.92, 0.95, 1.0) * smoothstep(0.99905, 0.99935, m) * 1.3 * moonVis;  // moon disc
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -10;
scene.add(sky);
{
  const sp = [];
  for (let i = 0; i < 650; i++) {
    const y = 0.18 + Math.random() * 0.82, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    sp.push(Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa6bc, size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.5, depthWrite: false }));
  stars.renderOrder = -9; sky.add(stars);
}

// Lights — fixed count so shaders never recompile; "off" means intensity 0.
export const hemi = new THREE.HemisphereLight(0x5a6f96, 0x141610, 1.1);
scene.add(hemi);
export const moon = new THREE.DirectionalLight(0x9aaee0, 0.9);
moon.position.copy(MOON_DIR).multiplyScalar(100);
scene.add(moon);

// Flashlight: a spot light held in a "hand" that lags behind the camera
export const hand = new THREE.Object3D();
hand.position.set(0.2, -0.22, -0.05);
camera.add(hand);
export const spot = new THREE.SpotLight(0xfff0d8, CFG.FLASH_INTENSITY, 42, CFG.BEAM_ANGLE, 0.5, 1.35);
spot.castShadow = true;                        // the ONLY shadow-casting light
spot.shadow.mapSize.set(CFG.SHADOW_MAP, CFG.SHADOW_MAP);
spot.shadow.camera.near = 0.3;
spot.shadow.camera.far = 36;
spot.shadow.bias = -0.0006;
spot.shadow.normalBias = 0.03;
spot.map = canvasTexture(256, (g, s) => {       // lens "cookie": hot core, bright rim, a little dirt
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, '#ffffff'); r.addColorStop(0.3, '#e7e3da'); r.addColorStop(0.55, '#b9b5ad');
  r.addColorStop(0.66, '#f6f2ea'); r.addColorStop(0.78, '#6d6b67'); r.addColorStop(1, '#000000');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
  const q = mulberry32(7);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + q() * 0.08})`; g.beginPath(); g.arc(q() * s, q() * s, 2 + q() * 9, 0, 7); g.fill(); }
});
hand.add(spot);
spot.position.set(0, 0, 0);
spot.target.position.set(0, 0, -6);
hand.add(spot.target);

// Clouds: a slow noise over time dims the moon (and the sky around it) for a while
export function updateClouds(t) {
  const cloud = smoothstep(0.42, 0.62, fbm(t * 0.012 + 3.3, 7.1));
  moon.intensity = 0.9 * (1 - 0.65 * cloud);
  hemi.intensity = 1.1 * (1 - 0.3 * cloud);
  sky.material.uniforms.moonVis.value = 1 - 0.85 * cloud;
}

// One roaming point light, parked on the nearest foxfire stone
export const relicLight = new THREE.PointLight(0xa8f0c8, 0, 9, 2);
scene.add(relicLight);

// Is a world point on screen? (used for "is the player looking at it")
const _proj = new THREE.Vector3();
export function inFrustum(p, margin = 1.08) { _proj.copy(p).project(camera); return _proj.z < 1 && _proj.z > -1 && Math.abs(_proj.x) < margin && Math.abs(_proj.y) < margin + 0.1; }

addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return;   // hidden/collapsed frames report 0×0 — keep the last good size
  fitCamera(innerWidth, innerHeight); renderer.setSize(innerWidth, innerHeight);
});
