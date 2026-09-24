/* Audio
   Everything is synthesized with the Web Audio API — no sound files.
   Beds: wind, a threat-driven drone, the foxfire hum. Score: a slowly shifting
   dissonant pad, a low two-note pulse as danger closes in, a winding-down music
   box, a ghost choir and bowed metal. One-shots: twigs, howls, growls, hoots,
   whispers, moans, knocks, footsteps that aren't yours, stings, heartbeat and more.
*/
import * as THREE from 'three';
import { R } from './config.js';
import { camera } from './scene.js';
import { GRAVEYARD } from './world.js';

const _fwd = new THREE.Vector3(), _t = new THREE.Vector3();
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
// Pad voicings around D2: minor seconds and tritones, never resolving
const VOICINGS = [[38, 39, 45], [37, 43, 50], [38, 44, 51], [36, 42, 49], [39, 45, 50], [38, 41, 44], [34, 40, 47]];

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
    this.music = this.gain(1); this.music.connect(this.master);   // the score, faded as one
    this.startWind(); this.startDrone(); this.startHum(); this.startScore();
    this.timers = {
      howl: R(10, 22), twig: R(5, 12), hoot: R(20, 40), gust: 2, heart: 0, param: 0,
      chord: R(14, 24), pulse: 0, box: R(35, 70), choir: R(70, 140), metal: R(30, 60), knock: R(40, 80), follow: R(70, 140), scream: R(150, 300),
    };
    this.pulseI = 0; this.follow = null;
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
  // Output chain for one-shots: gain → (panner) → master or the music bus (+ reverb send)
  out(pos, gain = 1, verb = 0.25, bus = this.master) {
    const g = this.gain(gain); let tail = g;
    if (pos) { const p = this.panner(pos); g.connect(p); tail = p; }
    tail.connect(bus);
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
  startScore() {
    this.padGain = this.gain(0); this.padLP = this.filter('lowpass', 340, 0.7);
    const trem = this.gain(0.8), tl = this.osc('sine', 0.11), tg = this.gain(0.2); tl.connect(tg).connect(trem.gain); tl.start();
    this.padLP.connect(trem).connect(this.padGain).connect(this.music);
    const vs = this.gain(0.6); this.padGain.connect(vs).connect(this.verb);
    this.padVoices = [0, 1, 2].map(() => {
      const g = this.gain(0.3), a = this.osc('sawtooth', 73.4), b = this.osc('sawtooth', 73.4);
      a.detune.value = -8; b.detune.value = 7; a.connect(g); b.connect(g); g.connect(this.padLP); a.start(); b.start();
      return [a, b];
    });
    this.chordI = 0; this.setChord(0.05);
  },
  // Slide the pad to another cluster; the long glide is what makes it feel wrong
  setChord(glide = 3) {
    this.chordI = (this.chordI + 1 + ((Math.random() * (VOICINGS.length - 1)) | 0)) % VOICINGS.length;
    const now = this.ctx.currentTime;
    VOICINGS[this.chordI].forEach((n, i) => this.padVoices[i].forEach(o => o.frequency.setTargetAtTime(midi(n), now, glide)));
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
      this.music.gain.setTargetAtTime(1, now, 1);
      this.padGain.gain.setTargetAtTime(0.03 + threat * 0.1, now, 1.2);
      this.padLP.frequency.setTargetAtTime(340 + threat * 1100, now, 1);
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
    // Knocks on wood, sometimes answered from the other side of you
    if ((tm.knock -= dt) <= 0) {
      tm.knock = R(50, 110); const k = around(40, 80, 1), x = k.x, z = k.z; this.knock(k);
      if (Math.random() < 0.5) this.knock(_t.set(2 * p.x - x, p.y + 1, 2 * p.z - z), R(2, 4));
    }
    // Footsteps behind you that keep time with yours
    if ((tm.follow -= dt) <= 0) { tm.follow = R(80, 160); if (threat < 0.3) this.follow = { n: 4 + ((Math.random() * 4) | 0), yaw: Math.atan2(_fwd.x, _fwd.z) }; }
    if ((tm.scream -= dt) <= 0) { tm.scream = R(160, 320); if (threat < 0.4) this.scream(around(90, 130, 3), 3); }
    if (this.muted) return;
    // The score
    const graves = Math.hypot(p.x - GRAVEYARD.x, p.z - GRAVEYARD.z) < 45;
    if ((tm.chord -= dt) <= 0) { tm.chord = R(14, 24) * (1 - threat * 0.5); this.setChord(R(2, 4.5)); }
    if (threat > 0.2 && (tm.pulse -= dt) <= 0) { tm.pulse = 1.6 - (threat - 0.2) / 0.8 * 1.18; this.pulseHit(this.pulseI++ % 2, threat); }
    if ((tm.box -= dt) <= 0) { tm.box = R(70, 140); if (threat < 0.35) this.musicBox(graves ? _t.set(GRAVEYARD.x, p.y, GRAVEYARD.z) : around(25, 40, 0)); }
    if ((tm.choir -= dt * (graves ? 3 : 1)) <= 0) { tm.choir = R(90, 180); this.choir(R(7, 11), graves ? 1 : 0.7); }
    if ((tm.metal -= dt) <= 0) { tm.metal = R(25, 50); if (threat > 0.3 && threat < 0.75) this.bowedMetal(around(20, 40, 3)); }
  },
  fadeBeds(to = 0) {
    if (!this.ready) return;
    this.muted = to === 0; const now = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(to, now, 1.2); this.dissGain.gain.setTargetAtTime(0, now, 1); this.whineGain.gain.setTargetAtTime(0, now, 0.5); this.setHum(null, 0);
    this.music.gain.setTargetAtTime(to, now, 1.2); this.follow = null;
  },

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
  // Your footstep (a swish through tall grass in the fields) — and sometimes, a beat
  // later and a few meters behind you, someone else's. It stops when you turn around.
  step(run, grass = false) {
    if (!this.ready) return;
    this.footstep(null, run, grass);
    const f = this.follow;
    if (!f) return;
    camera.getWorldDirection(_fwd);
    const turn = Math.atan2(_fwd.x, _fwd.z) - f.yaw;
    if (f.n-- <= 0 || Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 1.2) { this.follow = null; return; }
    const p = camera.position;
    this.footstep(_t.set(p.x - Math.sin(f.yaw) * 5, p.y - 1.5, p.z - Math.cos(f.yaw) * 5), run, grass, R(0.12, 0.17), 0.8);
  },
  footstep(pos, run, grass, delay = 0, loud = 1) {
    const now = this.ctx.currentTime + delay, o = this.out(pos, (pos ? 0.9 : run ? 0.24 : 0.16) * loud, pos ? 0.25 : 0.04);
    const s = this.src(), lp = this.filter('lowpass', R(500, 900), 0.7), g = this.gain(0);
    this.env(g, now, 0.006, 1, run ? 0.1 : 0.14); s.connect(lp).connect(g).connect(o); s.start(now, Math.random() * 2, 0.25);
    const s2 = this.src(), bp = this.filter('bandpass', R(2500, 4200), 1.2), g2 = this.gain(0);
    this.env(g2, now + 0.02, 0.01, 0.25, 0.08); s2.connect(bp).connect(g2).connect(o); s2.start(now, Math.random() * 2, 0.2);
    if (grass) {
      const s3 = this.src(), bp3 = this.filter('bandpass', R(1800, 3200), 0.7), g3 = this.gain(0);
      g3.gain.setValueAtTime(0.0001, now); g3.gain.exponentialRampToValueAtTime(0.35, now + 0.04); g3.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      s3.connect(bp3).connect(g3).connect(o); s3.start(now, Math.random() * 2, 0.35);
    }
  },
  // Something small (or not) running off through the undergrowth
  scurry(pos) {
    if (!this.ready) return;
    for (let k = 0; k < 5; k++) this.footstep(pos, true, true, k * R(0.12, 0.18), 1 - k * 0.15);
    this.twig(pos, 0.6);
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
  shaper(k) {
    const ws = this.ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * k);
    ws.curve = curve; return ws;
  },
  // A ghost in your face: a distorted, falling shriek over a thud
  shriek() {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.7, 0.7), ws = this.shaper(3);
    ws.connect(o);
    [1, 1.34, 1.92].forEach(m => {
      const c = this.osc('sawtooth', 1500 * m), g = this.gain(0), vib = this.osc('sine', 13), vg = this.gain(70 * m);
      c.frequency.setValueAtTime(1500 * m, now); c.frequency.exponentialRampToValueAtTime(620 * m, now + 0.7);
      vib.connect(vg).connect(c.frequency);
      this.env(g, now, 0.004, 0.3, 0.75); c.connect(g).connect(ws); c.start(now); vib.start(now); c.stop(now + 0.85); vib.stop(now + 0.85);
    });
    const s = this.src(), hp = this.filter('highpass', 2200, 0.7), g = this.gain(0);
    this.env(g, now, 0.003, 0.9, 0.5); s.connect(hp).connect(g).connect(ws); s.start(now, Math.random() * 2, 0.6);
    const b = this.osc('sine', 110), bg = this.gain(0);
    b.frequency.setValueAtTime(110, now); b.frequency.exponentialRampToValueAtTime(35, now + 0.5); this.env(bg, now, 0.005, 0.9, 0.6); b.connect(bg).connect(o); b.start(now); b.stop(now + 0.7);
  },
  // A drifting ghost's moan: a voice sliding down from "aah" to "ooh"
  moan(pos) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, dur = R(2.2, 3.6), o = this.out(pos, 1.1, 0.8), f = R(140, 200);
    const s = this.osc('sawtooth', f), vib = this.osc('sine', R(4.5, 5.5)), vg = this.gain(f * 0.025);
    s.frequency.setValueAtTime(f * 1.08, now); s.frequency.exponentialRampToValueAtTime(f * 0.78, now + dur);
    vib.connect(vg).connect(s.frequency);
    const f1 = this.filter('bandpass', 620, 5), f2 = this.filter('bandpass', 950, 7), g = this.gain(0);
    f1.frequency.setValueAtTime(620, now); f1.frequency.linearRampToValueAtTime(380, now + dur);
    s.connect(f1).connect(g); s.connect(f2).connect(g);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.9, now + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    g.connect(o); s.start(now); vib.start(now); s.stop(now + dur + 0.05); vib.stop(now + dur + 0.05);
    const n = this.src(this.white, true), bp = this.filter('bandpass', 1300, 1), ng = this.gain(0);
    ng.gain.setValueAtTime(0.0001, now); ng.gain.exponentialRampToValueAtTime(0.12, now + dur * 0.3); ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    n.connect(bp).connect(ng).connect(o); n.start(now, Math.random()); n.stop(now + dur);
  },
  // Wood struck on wood, two to four times, somewhere out in the trees
  knock(pos, delay = 0) {
    if (!this.ready) return;
    const now = this.ctx.currentTime + delay, o = this.out(pos, 1.4, 0.8), n = 2 + ((Math.random() * 3) | 0), gap = R(0.18, 0.4);
    for (let k = 0; k < n; k++) {
      const t = now + k * gap * R(0.9, 1.1), f = R(170, 230), c = this.osc('sine', f), g = this.gain(0);
      c.frequency.setValueAtTime(f, t); c.frequency.exponentialRampToValueAtTime(95, t + 0.06);
      this.env(g, t, 0.002, 1, 0.14); c.connect(g).connect(o); c.start(t); c.stop(t + 0.2);
      const s = this.src(), bp = this.filter('bandpass', R(700, 1100), 2), sg = this.gain(0);
      this.env(sg, t, 0.001, 0.6, 0.035); s.connect(bp).connect(sg).connect(o); s.start(t, Math.random() * 2, 0.06);
    }
  },
  // The scarecrow turning on its post: a slow stick-slip creak of dry wood
  creak(pos) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, dur = R(0.7, 1.2), o = this.out(pos, 1.3, 0.5), f = R(85, 110);
    const s = this.osc('sawtooth', f), bp = this.filter('bandpass', R(600, 900), 3), am = this.gain(0.5), lfo = this.osc('square', 30), lg = this.gain(0.5), g = this.gain(0);
    s.frequency.setValueAtTime(f, now); s.frequency.linearRampToValueAtTime(f * 0.8, now + dur);
    lfo.frequency.setValueAtTime(30, now); lfo.frequency.linearRampToValueAtTime(12, now + dur);
    lfo.connect(lg).connect(am.gain);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.7, now + 0.08); g.gain.setValueAtTime(0.7, now + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(bp).connect(am).connect(g).connect(o);
    for (const x of [s, lfo]) { x.start(now); x.stop(now + dur + 0.05); }
  },

  // ---- Score one-shots (on the music bus) ----
  // The pulse: two low notes a semitone apart, closer together as danger closes in
  pulseHit(i, amt) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.08 + amt * 0.2, 0.3, this.music), f = i ? 77.8 : 73.4;
    const c = this.osc('sine', f), h = this.osc('triangle', f * 2), g = this.gain(0), hg = this.gain(0);
    c.frequency.setValueAtTime(f, now); c.frequency.exponentialRampToValueAtTime(f * 0.97, now + 1);
    this.env(g, now, 0.006, 1, 1.2); this.env(hg, now, 0.004, 0.35, 0.4);
    c.connect(g).connect(o); h.connect(hg).connect(o); c.start(now); h.start(now); c.stop(now + 1.3); h.stop(now + 0.5);
    const n = this.src(this.brown), lp = this.filter('lowpass', 160, 0.8), ng = this.gain(0);
    this.env(ng, now, 0.004, 0.9, 0.25); n.connect(lp).connect(ng).connect(o); n.start(now, Math.random() * 3, 0.35);
  },
  // A music box somewhere out in the dark, a little out of tune, winding down
  musicBox(pos) {
    if (!this.ready) return;
    const o = this.out(pos, pos ? 1.8 : 0.4, 0.8, this.music), tune = [76, 81, 84, 83, 81, 76, 77, 76, 75, 76, 72, 69];
    let t = this.ctx.currentTime + 0.1, step = 0.46, sag = 0;
    tune.forEach((n, i) => {
      if (i > 7) { step *= 1.1; sag -= 12; }
      const f = midi(n) * Math.pow(2, (sag + R(-12, 12)) / 1200);
      const c = this.osc('sine', f), m = this.osc('sine', f * 3.5), mg = this.gain(0), g = this.gain(0), p = this.osc('sine', f * 4.07), pg = this.gain(0);
      mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + 0.35);
      m.connect(mg).connect(c.frequency);
      this.env(g, t, 0.003, 0.5, 1.3); this.env(pg, t, 0.002, 0.12, 0.25);
      c.connect(g).connect(o); p.connect(pg).connect(o);
      for (const x of [c, m, p]) { x.start(t); x.stop(t + 1.5); }
      t += step * R(0.95, 1.12);
    });
  },
  // A far-off choir holding a cluster chord, swelling and fading
  choir(dur = 9, amt = 1) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(null, 0.3 * amt, 0.9, this.music), shift = [0, -2, 1, -5][(Math.random() * 4) | 0];
    [57, 58, 64, 65].forEach((n, i) => {
      const f = midi(n + shift) * R(0.996, 1.004), s = this.osc('sawtooth', f), vib = this.osc('sine', R(4.6, 5.8)), vg = this.gain(f * 0.011);
      vib.connect(vg).connect(s.frequency);
      const f1 = this.filter('bandpass', 750, 5), f2 = this.filter('bandpass', 1150, 7), f3 = this.filter('bandpass', 2700, 9), g3 = this.gain(0.4), g = this.gain(0);
      s.connect(f1).connect(g); s.connect(f2).connect(g); s.connect(f3).connect(g3).connect(g);
      const st = now + i * R(0.2, 0.8);
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.5, st + dur * 0.35); g.gain.setValueAtTime(0.5, now + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      g.connect(o); s.start(st); vib.start(st); s.stop(now + dur + 0.1); vib.stop(now + dur + 0.1);
    });
  },
  // Bowed metal: inharmonic partials trembling over a resonant scrape
  bowedMetal(pos, amt = 1) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, dur = R(4, 6.5), o = this.out(pos, (pos ? 2 : 0.14) * amt, 0.9, this.music), base = R(420, 720);
    [1, 1.47, 2.09, 2.56, 3.39].forEach((m, i) => {
      const f = base * m, c = this.osc('sine', f), trem = this.gain(0.6), lfo = this.osc('sine', R(5, 9)), lg = this.gain(0.4), g = this.gain(0);
      c.frequency.setValueAtTime(f, now); c.frequency.linearRampToValueAtTime(f * R(0.97, 1.03), now + dur);
      lfo.connect(lg).connect(trem.gain);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.5 / (i + 1), now + dur * R(0.35, 0.55)); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      c.connect(trem).connect(g).connect(o);
      c.start(now); lfo.start(now); c.stop(now + dur + 0.05); lfo.stop(now + dur + 0.05);
    });
    const s = this.src(this.white, true), bp = this.filter('bandpass', base * 2.09, 25), g = this.gain(0);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.8, now + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(bp).connect(g).connect(o); s.start(now, Math.random()); s.stop(now + dur);
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
  // Up close when it catches you; or (with a position) someone else, far away in the woods
  scream(pos = null, gain = 0.95) {
    if (!this.ready) return;
    const now = this.ctx.currentTime, o = this.out(pos, gain, pos ? 1 : 0.6), ws = this.shaper(4);
    if (pos) { const lp = this.filter('lowpass', 1400, 0.5); ws.connect(lp).connect(o); } else ws.connect(o);
    [1, 1.5, 2.13].forEach(m => {
      const c = this.osc('sawtooth', 180 * m), g = this.gain(0);
      c.frequency.exponentialRampToValueAtTime(900 * m, now + 0.25); c.frequency.linearRampToValueAtTime(760 * m, now + 1.3);
      const vib = this.osc('sine', 9), vg = this.gain(40 * m); vib.connect(vg).connect(c.frequency);
      this.env(g, now, 0.02, 0.35, 1.4); c.connect(g).connect(ws); c.start(now); c.stop(now + 1.6); vib.start(now); vib.stop(now + 1.6);
    });
    const s = this.src(), hp = this.filter('highpass', 1500, 0.7), g = this.gain(0);
    this.env(g, now, 0.01, 0.8, 1.2); s.connect(hp).connect(g).connect(ws); s.start(now, Math.random() * 2, 1.4);
    if (pos) return;
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
