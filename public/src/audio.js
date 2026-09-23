/* Audio
   Everything is synthesized with the Web Audio API — no sound files.
   Beds: wind, a threat-driven drone, the foxfire hum. One-shots: twigs, howls,
   growls, hoots, whispers, stings, footsteps, heartbeat and more.
*/
import * as THREE from 'three';
import { R } from './config.js';
import { camera } from './scene.js';

const _fwd = new THREE.Vector3(), _t = new THREE.Vector3();

export const AudioSys = {
  ctx: null, ready: false, muted: false,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(3.4, 2.6);
    const vg = ctx.createGain(); vg.gain.value = 0.5; this.verb.connect(vg); vg.connect(this.master);
    this.white = this.noise('white', 3); this.brown = this.noise('brown', 4);
    this.startWind(); this.startDrone(); this.startHum();
    this.timers = { howl: R(10, 22), twig: R(5, 12), hoot: R(20, 40), gust: 2, heart: 0, param: 0 };
    this.ready = true;
  },
  suspend() { this.ctx?.suspend(); },
  resume() { this.ctx?.resume(); },
  noise(type, secs) {
    const ctx = this.ctx, len = ctx.sampleRate * secs, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return buf;
  },
  impulse(secs, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * secs, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  },
  src(buf = this.white, loop = false) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; },
  filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },
  osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; },
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; },
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); },
  panner(pos, ref = 3) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = 400; p.rolloffFactor = 1.1;
    if (pos) this.setPos(p, pos);
    return p;
  },
  setPos(p, v) { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z); },
  // Output chain for one-shots: gain → (panner) → master (+ reverb send)
  out(pos, gain = 1, verb = 0.25) {
    const g = this.gain(gain); let tail = g;
    if (pos) { const p = this.panner(pos); g.connect(p); tail = p; }
    tail.connect(this.master);
    if (verb > 0) { const s = this.gain(verb); tail.connect(s); s.connect(this.verb); }
    return g;
  },

  // ---- Beds: wind, drone, stone hum ----
  startWind() {
    const ctx = this.ctx;
    const s = this.src(this.brown, true), lp = this.filter('lowpass', 520, 0.4);
    this.windGain = this.gain(0.32);
    s.connect(lp).connect(this.windGain).connect(this.master);
    const l1 = this.osc('sine', 0.06), l1g = this.gain(260); l1.connect(l1g).connect(lp.frequency); l1.start();
    const s2 = this.src(this.white, true), bp = this.filter('bandpass', 820, 7), pan = ctx.createStereoPanner();
    this.whistleGain = this.gain(0.025);
    s2.connect(bp).connect(this.whistleGain).connect(pan).connect(this.master);
    const vs = this.gain(0.4); this.whistleGain.connect(vs).connect(this.verb);
    const l2 = this.osc('sine', 0.043), l2g = this.gain(380); l2.connect(l2g).connect(bp.frequency); l2.start();
    const l3 = this.osc('sine', 0.031), l3g = this.gain(0.8); l3.connect(l3g).connect(pan.pan); l3.start();
    s.start(); s2.start();
  },
  startDrone() {
    this.droneGain = this.gain(0.05);
    this.droneLP = this.filter('lowpass', 140, 4);
    this.droneLP.connect(this.droneGain).connect(this.master);
    const vs = this.gain(0.35); this.droneGain.connect(vs).connect(this.verb);
    [[43.65, 'sawtooth', 0.5], [43.95, 'sawtooth', 0.5], [65.4, 'triangle', 0.3], [21.8, 'sine', 0.9]].forEach(([f, t, v]) => { const o = this.osc(t, f), g = this.gain(v); o.connect(g).connect(this.droneLP); o.start(); });
    this.dissGain = this.gain(0);
    const d1 = this.osc('sawtooth', 61.7), d2 = this.osc('sawtooth', 92.5);
    d1.connect(this.dissGain); d2.connect(this.dissGain); this.dissGain.connect(this.droneLP); d1.start(); d2.start();
    this.whineGain = this.gain(0);
    const w = this.osc('sine', 1244), wl = this.osc('sine', 0.3), wlg = this.gain(18);
    wl.connect(wlg).connect(w.frequency); w.connect(this.whineGain).connect(this.master); w.start(); wl.start();
    const lfo = this.osc('sine', 0.09), lg = this.gain(40); lfo.connect(lg).connect(this.droneLP.frequency); lfo.start();
  },
  startHum() {
    this.humPanner = this.panner(null, 2.5);
    this.humGain = this.gain(0);
    const trem = this.gain(0.7), lfo = this.osc('sine', 3.1), lg = this.gain(0.3);
    lfo.connect(lg).connect(trem.gain); lfo.start();
    [[220, 0.5], [329.6, 0.28], [440.8, 0.12]].forEach(([f, v]) => { const o = this.osc('sine', f), g = this.gain(v); o.connect(g).connect(this.humGain); o.start(); });
    this.humGain.connect(trem).connect(this.humPanner).connect(this.master);
    const vs = this.gain(0.3); this.humPanner.connect(vs).connect(this.verb);
  },
  setHum(pos, level) {
    if (!this.ready) return;
    if (pos) this.setPos(this.humPanner, pos);
    this.humGain.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.4);
  },

  // Per-frame: listener, drone intensity, ambient scheduling
  update(dt, threat) {
    if (!this.ready) return;
    const L = this.ctx.listener, p = camera.position;
    camera.getWorldDirection(_fwd);
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = _fwd.x; L.forwardY.value = _fwd.y; L.forwardZ.value = _fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(_fwd.x, _fwd.y, _fwd.z, 0, 1, 0); }
    const tm = this.timers, now = this.ctx.currentTime;
    if ((tm.param -= dt) <= 0 && !this.muted) {
      tm.param = 0.12;
      this.droneGain.gain.setTargetAtTime(0.05 + threat * 0.38, now, 0.5);
      this.droneLP.frequency.setTargetAtTime(130 + threat * threat * 1100, now, 0.5);
      this.dissGain.gain.setTargetAtTime(threat * threat * 0.7, now, 0.5);
      this.whineGain.gain.setTargetAtTime(threat > 0.55 ? (threat - 0.55) * 0.06 : 0, now, 0.6);
    }
    if ((tm.gust -= dt) <= 0) {
      tm.gust = R(4, 10); const g = R(0.16, 0.55);
      this.windGain.gain.setTargetAtTime(g, now, R(1, 3)); this.whistleGain.gain.setTargetAtTime(g * 0.1, now, R(1, 3));
    }
    const around = (dmin, dmax, y = 1) => { const a = Math.random() * Math.PI * 2, d = R(dmin, dmax); return _t.set(p.x + Math.cos(a) * d, p.y + y, p.z + Math.sin(a) * d); };
    if ((tm.howl -= dt) <= 0) { tm.howl = R(25, 55); this.howl(around(70, 110, 4)); }
    if ((tm.twig -= dt) <= 0) { tm.twig = R(6, 16); this.twig(around(7, 22, -1.5)); }
    if ((tm.hoot -= dt) <= 0) { tm.hoot = R(25, 55); this.hoot(around(40, 70, 8)); }
    if (threat > 0.5 && (tm.heart -= dt) <= 0) { tm.heart = 60 / (58 + threat * 70); this.heartbeat(threat); }
  },
  fadeBeds(to = 0) { if (!this.ready) return; this.muted = to === 0; const now = this.ctx.currentTime; this.droneGain.gain.setTargetAtTime(to, now, 1.2); this.dissGain.gain.setTargetAtTime(0, now, 1); this.whineGain.gain.setTargetAtTime(0, now, 0.5); this.setHum(null, 0); },

  // ---- One-shots ----
  twig(pos, loud = 1) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, 0.9 * loud, 0.35), n = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const t = now + i * R(0.05, 0.18), s = this.src(), f = this.filter('bandpass', R(1800, 3800), 1.5), g = this.gain(0);
      this.env(g, t, 0.002, R(0.5, 1), R(0.03, 0.08)); s.connect(f).connect(g).connect(o); s.start(t, Math.random() * 2, 0.15);
    }
    const b = this.osc('triangle', R(180, 260)), bg = this.gain(0);
    b.frequency.exponentialRampToValueAtTime(80, now + 0.06); this.env(bg, now, 0.002, 0.3, 0.06); b.connect(bg).connect(o); b.start(now); b.stop(now + 0.12);
  },
  step(run) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, run ? 0.24 : 0.16, 0.04);
    const s = this.src(), lp = this.filter('lowpass', R(500, 900), 0.7), g = this.gain(0);
    this.env(g, now, 0.006, 1, run ? 0.1 : 0.14); s.connect(lp).connect(g).connect(o); s.start(now, Math.random() * 2, 0.25);
    const s2 = this.src(), bp = this.filter('bandpass', R(2500, 4200), 1.2), g2 = this.gain(0);
    this.env(g2, now + 0.02, 0.01, 0.25, 0.08); s2.connect(bp).connect(g2).connect(o); s2.start(now, Math.random() * 2, 0.2);
  },
  breath() {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.1, 0);
    [0, 0.65].forEach((dt, i) => {
      const s = this.src(), bp = this.filter('bandpass', i ? 900 : 1300, 0.8), g = this.gain(0);
      g.gain.setValueAtTime(0.0001, now + dt); g.gain.exponentialRampToValueAtTime(0.9, now + dt + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.6);
      s.connect(bp).connect(g).connect(o); s.start(now + dt, Math.random() * 2, 0.7);
    });
  },
  click(on) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.2, 0);
    [0, 0.035].forEach((dt, i) => { const c = this.osc('square', (on ? 2400 : 1700) - i * 600), g = this.gain(0); this.env(g, now + dt, 0.001, 0.5, 0.018); c.connect(g).connect(o); c.start(now + dt); c.stop(now + dt + 0.04); });
  },
  howl(pos, pitch = 1) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, 0.55, 0.9);
    [1, 1.26].forEach((mul, i) => {
      const st = now + i * R(0.3, 0.9), f = 330 * pitch * mul * R(0.95, 1.05);
      const osc = this.osc('triangle', f * 0.7), lp = this.filter('lowpass', 1400, 0.7), g = this.gain(0);
      osc.frequency.setValueAtTime(f * 0.7, st); osc.frequency.linearRampToValueAtTime(f * 1.25, st + 0.7);
      osc.frequency.linearRampToValueAtTime(f * 1.15, st + 2.0); osc.frequency.linearRampToValueAtTime(f * 0.75, st + 3.0);
      const vib = this.osc('sine', 5.5), vg = this.gain(f * 0.02); vib.connect(vg).connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.5, st + 0.5); g.gain.setValueAtTime(0.5, st + 2.0); g.gain.exponentialRampToValueAtTime(0.0001, st + 3.2);
      osc.connect(lp).connect(g).connect(o); osc.start(st); osc.stop(st + 3.3); vib.start(st); vib.stop(st + 3.3);
    });
  },
  growl(pos, dur = R(1.2, 2), yelp = false) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, yelp ? 0.5 : 0.8, 0.2);
    const saw = this.osc('sawtooth', yelp ? 520 : R(70, 95)), n = this.src(this.brown), lp = this.filter('lowpass', yelp ? 1800 : 650, 1.5);
    saw.frequency.linearRampToValueAtTime(yelp ? 300 : saw.frequency.value * 0.85, now + dur);
    const am = this.gain(0.5), lfo = this.osc('square', R(18, 26)), lg = this.gain(0.5);
    lfo.connect(lg).connect(am.gain);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.8, now + 0.15); g.gain.setValueAtTime(0.8, now + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    saw.connect(lp); n.connect(lp); lp.connect(am).connect(g).connect(o);
    saw.start(now); saw.stop(now + dur + 0.05); n.start(now, Math.random() * 3, dur + 0.05); lfo.start(now); lfo.stop(now + dur + 0.05);
  },
  hoot(pos) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, 0.45, 0.6), base = R(360, 420);
    [[0, 0.32], [0.55, 0.16], [0.8, 0.16], [1.05, 0.5]].forEach(([dt, len]) => {
      const st = now + dt, osc = this.osc('sine', base * 1.05), g = this.gain(0);
      osc.frequency.setValueAtTime(base * 1.05, st); osc.frequency.exponentialRampToValueAtTime(base * 0.92, st + len);
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.6, st + 0.05); g.gain.setValueAtTime(0.6, st + len); g.gain.exponentialRampToValueAtTime(0.0001, st + len + 0.06);
      osc.connect(g).connect(o); osc.start(st); osc.stop(st + len + 0.1);
    });
  },
  snort(pos) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, 0.7, 0.3);
    [0, 0.2].forEach(dt => { const s = this.src(), bp = this.filter('bandpass', R(700, 1000), 1.3), g = this.gain(0); this.env(g, now + dt, 0.01, 1, 0.22); s.connect(bp).connect(g).connect(o); s.start(now + dt, Math.random() * 2, 0.3); });
  },
  flap(pos) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, 0.5, 0.2);
    for (let i = 0; i < 6; i++) { const t = now + i * 0.11, s = this.src(), lp = this.filter('lowpass', 520, 1), g = this.gain(0); this.env(g, t, 0.01, 0.8, 0.07); s.connect(lp).connect(g).connect(o); s.start(t, Math.random() * 2, 0.1); }
  },
  whisperLoop(pos) {
    if (!this.ready) return null;
    const p = this.panner(pos, 2), g = this.gain(0), am = this.gain(0.3);
    const s = this.src(this.white, true), bp1 = this.filter('bandpass', 2500, 4), bp2 = this.filter('bandpass', 1200, 5);
    const l1 = this.osc('sine', 4.3), l2 = this.osc('sine', 2.7), l1g = this.gain(0.4), l2g = this.gain(0.3);
    l1.connect(l1g).connect(am.gain); l2.connect(l2g).connect(am.gain);
    s.connect(bp1).connect(am); s.connect(bp2).connect(am); am.connect(g).connect(p).connect(this.master);
    const vs = this.gain(0.5); p.connect(vs).connect(this.verb);
    s.start(0, Math.random() * 2); l1.start(); l2.start();
    const ctx = this.ctx;
    return {
      setPos: v => this.setPos(p, v),
      setLevel: v => g.gain.setTargetAtTime(v, ctx.currentTime, 0.2),
      jitter: () => { bp1.frequency.setTargetAtTime(R(1800, 3800), ctx.currentTime, 0.05); bp2.frequency.setTargetAtTime(R(700, 1600), ctx.currentTime, 0.05); },
      stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => { try { s.stop(); l1.stop(); l2.stop(); } catch (e) { /* already stopped */ } p.disconnect(); }, 900); },
    };
  },
  ghostVanish(pos) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, 0.7, 0.9);
    const s = this.src(), bp = this.filter('bandpass', 4000, 3), g = this.gain(0);
    bp.frequency.exponentialRampToValueAtTime(300, now + 0.9); this.env(g, now, 0.05, 0.9, 0.85);
    s.connect(bp).connect(g).connect(o); s.start(now, Math.random() * 2, 1.0);
    const t = this.osc('sine', 900), tg = this.gain(0);
    t.frequency.exponentialRampToValueAtTime(180, now + 1.0); this.env(tg, now, 0.04, 0.25, 0.9); t.connect(tg).connect(o); t.start(now); t.stop(now + 1.1);
  },
  ghostScare() {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.8, 0.8);
    const s = this.src(), hp = this.filter('highpass', 1000, 0.7), g = this.gain(0);
    this.env(g, now, 0.01, 0.9, 0.6); s.connect(hp).connect(g).connect(o); s.start(now, Math.random() * 2, 0.8);
    [880, 932, 1245].forEach(f => { const c = this.osc('sine', f), cg = this.gain(0); this.env(cg, now, 0.02, 0.2, 1.2); c.connect(cg).connect(o); c.start(now); c.stop(now + 1.3); });
  },
  murmur(pos) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, 0.55, 0.3);
    const v = this.osc('sawtooth', 108), f1 = this.filter('bandpass', 600, 6), f2 = this.filter('bandpass', 1400, 8), am = this.gain(0);
    const syl = 13;
    for (let k = 0; k < syl; k++) {
      const t = now + k * 0.19;
      v.frequency.linearRampToValueAtTime(R(92, 124), t + 0.1);
      f1.frequency.setValueAtTime(R(350, 850), t); f2.frequency.setValueAtTime(R(900, 2200), t);
      am.gain.setValueAtTime(0.0001, t); am.gain.exponentialRampToValueAtTime(R(0.4, 1), t + 0.06); am.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    }
    v.connect(f1); v.connect(f2); f1.connect(am); f2.connect(am); am.connect(o);
    v.start(now); v.stop(now + syl * 0.19 + 0.1);
  },
  chime() {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.5, 0.8), base = 587;
    [[1, 0.5, 3.2], [2.01, 0.2, 2.2], [2.76, 0.22, 2.6], [5.4, 0.08, 1.4], [0.5, 0.3, 3.5]].forEach(([m, a, d]) => {
      const c = this.osc('sine', base * m), g = this.gain(0); this.env(g, now, 0.005, a, d); c.connect(g).connect(o); c.start(now); c.stop(now + d + 0.1);
    });
  },
  sting(pos, amt = 1) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, 0.45 * amt, 0.7);
    [987, 1046, 1108, 1480].forEach(f => {
      const c = this.osc('sawtooth', f * R(0.99, 1.01)), bp = this.filter('bandpass', f, 6), g = this.gain(0);
      const vib = this.osc('sine', R(6, 9)), vg = this.gain(f * 0.012); vib.connect(vg).connect(c.frequency);
      this.env(g, now, 0.015, 0.35, 1.3); c.connect(bp).connect(g).connect(o); c.start(now); c.stop(now + 1.4); vib.start(now); vib.stop(now + 1.4);
    });
    const b = this.osc('sine', 60), bg = this.gain(0);
    b.frequency.exponentialRampToValueAtTime(28, now + 1.2); this.env(bg, now, 0.02, 0.9, 1.5); b.connect(bg).connect(o); b.start(now); b.stop(now + 1.6);
  },
  scream() {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.95, 0.6);
    const ws = this.ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 4);
    ws.curve = curve; ws.connect(o);
    [1, 1.5, 2.13].forEach(m => {
      const c = this.osc('sawtooth', 180 * m), g = this.gain(0);
      c.frequency.exponentialRampToValueAtTime(900 * m, now + 0.25); c.frequency.linearRampToValueAtTime(760 * m, now + 1.3);
      const vib = this.osc('sine', 9), vg = this.gain(40 * m); vib.connect(vg).connect(c.frequency);
      this.env(g, now, 0.02, 0.35, 1.4); c.connect(g).connect(ws); c.start(now); c.stop(now + 1.6); vib.start(now); vib.stop(now + 1.6);
    });
    const s = this.src(), hp = this.filter('highpass', 1500, 0.7), g = this.gain(0);
    this.env(g, now, 0.01, 0.8, 1.2); s.connect(hp).connect(g).connect(ws); s.start(now, Math.random() * 2, 1.4);
    const b = this.osc('sine', 90), bg = this.gain(0);
    b.frequency.exponentialRampToValueAtTime(30, now + 1.2); this.env(bg, now, 0.01, 1, 1.5); b.connect(bg).connect(o); b.start(now); b.stop(now + 1.6);
  },
  heartbeat(t) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.45 + t * 0.5, 0);
    [0, 0.26].forEach((dt, i) => {
      const st = now + dt, c = this.osc('sine', i ? 62 : 70), g = this.gain(0);
      c.frequency.exponentialRampToValueAtTime(38, st + 0.15); this.env(g, st, 0.012, i ? 0.6 : 0.9, 0.2); c.connect(g).connect(o); c.start(st); c.stop(st + 0.3);
    });
  },
  dawn() {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.35, 0.9);
    [196, 246.9, 293.7, 392, 493.9].forEach((f, i) => {
      const c = this.osc('triangle', f), lp = this.filter('lowpass', 1600, 0.7), g = this.gain(0);
      g.gain.setValueAtTime(0.0001, now + i * 0.15); g.gain.exponentialRampToValueAtTime(0.22, now + 2.5); g.gain.exponentialRampToValueAtTime(0.0001, now + 9);
      c.connect(lp).connect(g).connect(o); c.start(now); c.stop(now + 9.2);
    });
  },
};
