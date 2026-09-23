/* UI
   HUD (foxfire pips, stamina, subtitles, messages), screen flashes,
   the threat vignette, and the start / pause / end screens.
*/
import { game } from './state.js';

export const $ = id => document.getElementById(id);
export const UI = {
  start: $('start'), pause: $('pause'), end: $('end'), hud: $('hud'),
  show(screen) { for (const s of [this.start, this.pause, this.end]) s.hidden = s !== screen; },
  setStones(n) { [...$('pips').children].forEach((p, i) => p.classList.toggle('on', i < n)); $('stoneCount').textContent = `${n} / 5`; },
  stamina(v, tired) {
    $('staminaFill').style.transform = `scaleX(${v.toFixed(3)})`;
    const bar = $('stamina'); bar.classList.toggle('tired', tired); bar.style.opacity = v > 0.995 && !tired ? 0 : 1;
  },
  subtitle(text, dur = 6) {
    const el = $('subtitle'); clearInterval(this._tw); clearTimeout(this._st);
    let i = 0; el.textContent = ''; el.classList.add('on');
    this._tw = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(this._tw); }, 34);
    this._st = setTimeout(() => el.classList.remove('on'), dur * 1000);
  },
  message(text, dur = 3) {
    const el = $('message'); clearTimeout(this._mt);
    el.textContent = text; el.classList.add('on');
    this._mt = setTimeout(() => el.classList.remove('on'), dur * 1000);
  },
  clearText() { clearInterval(this._tw); $('subtitle').classList.remove('on'); $('message').classList.remove('on'); },
  flash(color, peak, dur) {
    const el = $('flash'); el.style.transition = 'none'; el.style.background = color; el.style.opacity = peak;
    void el.offsetWidth; el.style.transition = `opacity ${dur}s ease-out`; el.style.opacity = 0;
  },
  setThreat(t) { document.documentElement.style.setProperty('--threat', t.toFixed(3)); },
  showEnd(win) {
    const mins = 134 + Math.floor(game.time / 12), hh = Math.floor(mins / 60), mm = String(mins % 60).padStart(2, '0');
    this.end.classList.toggle('win', win); this.end.classList.toggle('lose', !win);
    $('endEyebrow').textContent = win ? 'Hollow Pines · first light' : `Hollow Pines · ${hh}:${mm} a.m.`;
    $('endTitle').textContent = win ? 'You escaped.' : 'It found you.';
    $('endText').textContent = win
      ? 'The fifth stone went cold in your palm, and the fog opened onto a gravel road. You didn’t look back.'
      : 'You looked away one time too many. Somewhere behind you, a twig snapped — and then nothing did.';
    $('statStones').textContent = `${game.found} / 5`;
    $('statTime').textContent = `${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
    this.hud.hidden = true; this.clearText(); this.show(this.end);
    setTimeout(() => $('restart').focus({ preventScroll: true }), 50);
  },
};
// Film grain texture, generated once
{
  const c = document.createElement('canvas'); c.width = c.height = 180; const g = c.getContext('2d'), img = g.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.random() * 110; }
  g.putImageData(img, 0, 0); $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) $('touchNote').hidden = false;
