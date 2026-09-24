/* Config & utilities
   Tunables, seeded RNG, value noise, small math helpers.
*/
// Phones and tablets (touch is the primary pointer) get a lighter render budget
export const MOBILE = matchMedia('(pointer: coarse)').matches;

export const CFG = {
  WORLD_R: 120,          // playable radius (m)
  TERRAIN: 330,          // terrain edge length (m)
  CHUNK: 30,             // culling chunk size (m)
  CULL_DIST: MOBILE ? 62 : 72,        // beyond this, fog is opaque — skip drawing
  PIXEL_RATIO: MOBILE ? 1.25 : 1.5,   // cap; the adaptive governor in main.js may go lower
  SHADOW_MAP: MOBILE ? 512 : 1024,
  MIST: MOBILE ? 12 : 24,             // drifting fog billboards (overdraw-heavy)
  FOG_COLOR: 0x121922,
  FOG_DENSITY: 0.047,
  EYE: 1.7,
  WALK: 3.2, RUN: 6.0,
  PLAYER_R: 0.35,
  FLASH_INTENSITY: 200,
  BEAM_ANGLE: 0.42,      // spot half-angle (rad)
  BEAM_RANGE: 28,
};
export const DEBUG = new URLSearchParams(location.search).has('debug');

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const R = (a, b) => a + (b - a) * Math.random();              // gameplay randomness
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rand = mulberry32(20261031);                            // seeded world generation
export const rr = (a, b) => a + (b - a) * rand();
export const turnTo = (cur, target, maxStep) => { let d = ((target - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return cur + clamp(d, -maxStep, maxStep); };

// Smooth 2D value noise + fBm for terrain and scattering
export function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y) { let s = 0, amp = 1, f = 1, n = 0; for (let i = 0; i < 4; i++) { s += vnoise(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2.03; } return s / n; }
export const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);  // distance on the ground plane

