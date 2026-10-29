// Sonido de Zombies en la oficina.
// - Todo suena en 3D (PannerNode): los zombis se oyen de donde vienen y más bajito si están lejos.
// - Recetas procedurales (WebAudio): quejidos con formantes y voz que tiembla, rugidos de jefe,
//   pasos, clic de recarga, latido y zumbido de fondo en las hordas de jefe.
// - Paquete opcional de archivos: si /sounds/zombies/sounds.json enlista archivos (mp3/ogg/wav),
//   se usan en lugar de las recetas. Si no hay, se sigue con las recetas sin decir nada.
//   Ver client/public/sounds/zombies/LEEME.md.
import { audioCtx, playSoundTo } from '../../lib/sounds.js';

const BASE = '/sounds/zombies/';
const rnd = (a, b) => a + Math.random() * (b - a);
let packPromise = null; // el paquete se carga una sola vez por página
const packBuffers = {}; // nombre -> [AudioBuffer]

function loadPack() {
  if (packPromise) return packPromise;
  packPromise = (async () => {
    const c = audioCtx();
    if (!c || typeof fetch === 'undefined') return;
    let man;
    try {
      const r = await fetch(`${BASE}sounds.json`, { cache: 'no-cache' });
      if (!r.ok) return;
      man = await r.json();
    } catch { return; }
    const jobs = [];
    for (const [name, files] of Object.entries(man || {})) {
      if (name.startsWith('_')) continue; // comentarios
      for (const f of [].concat(files || [])) {
        if (typeof f !== 'string' || !/^[\w.-]+\.(mp3|ogg|wav|m4a|webm)$/i.test(f)) continue;
        jobs.push(fetch(BASE + f).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => ab && c.decodeAudioData(ab)).then((buf) => { if (buf) (packBuffers[name] ||= []).push(buf); }).catch(() => {}));
      }
    }
    await Promise.all(jobs);
  })();
  return packPromise;
}

// Distorsión suave (para la voz rasposa de los zombis)
const curves = new Map();
function rasp(c, k) {
  const sh = c.createWaveShaper();
  if (!curves.has(k)) {
    const n = 1024, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    curves.set(k, cv);
  }
  sh.curve = curves.get(k);
  return sh;
}
let noiseBuf = null;
function noise(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function env(g, t, { a = 0.01, peak = 1, hold = 0, r = 0.2 }) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  return t + a + hold + r;
}

// Voz de zombi: pulso de sierra + aire, por filtros de formantes (vocal "oa" → "u") con la voz temblando
function voice(c, out, t, { f0, dur, formants, wobble = 6, depth = 0.06, grit = 4, air = 0.35, vol = 1, glide = 0.8 }) {
  const end = t + dur + 0.1;
  const src = c.createGain();
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * glide, t + dur);
  const o2 = c.createOscillator(); o2.type = 'square';
  o2.frequency.setValueAtTime(f0 * 0.5 * rnd(0.98, 1.02), t);
  o2.frequency.exponentialRampToValueAtTime(f0 * 0.5 * glide, t + dur);
  const g2 = c.createGain(); g2.gain.value = 0.25;
  // temblor de la voz
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.value = wobble * rnd(0.8, 1.25); lg.gain.value = f0 * depth;
  lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  o.connect(src); o2.connect(g2).connect(src);
  // aire / respiración
  const n = c.createBufferSource(); n.buffer = noise(c); n.playbackRate.value = rnd(0.8, 1.1);
  const ng = c.createGain(); ng.gain.value = air;
  n.connect(ng).connect(src);
  const sh = rasp(c, grit);
  src.connect(sh);
  const mix = c.createGain();
  for (const [f, q, gain, f2] of formants) {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f, t);
    if (f2) bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const fg = c.createGain(); fg.gain.value = gain;
    sh.connect(bp).connect(fg).connect(mix);
  }
  const g = c.createGain();
  env(g, t, { a: Math.min(0.2, dur * 0.25), peak: vol, hold: dur * 0.35, r: dur * 0.5 });
  mix.connect(g).connect(out);
  for (const s of [o, o2, lfo, n]) { s.start(t); s.stop(end); }
}

const SYN = {
  groan(c, out, t) {
    const f0 = rnd(70, 125);
    voice(c, out, t, { f0, dur: rnd(0.8, 1.5), formants: [[rnd(420, 560), 6, 1, 330], [rnd(820, 980), 8, 0.6, 700], [2500, 10, 0.15]], wobble: rnd(4, 7), depth: rnd(0.04, 0.09), vol: 0.9, glide: rnd(0.7, 0.9) });
  },
  roar(c, out, t) {
    voice(c, out, t, { f0: rnd(52, 66), dur: 1.7, formants: [[650, 4, 1.2, 420], [1100, 5, 0.7, 800], [2800, 8, 0.25]], wobble: 9, depth: 0.12, grit: 12, air: 0.8, vol: 1.3, glide: 0.62 });
    // golpe grave debajo
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(48, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.5);
    env(g, t, { a: 0.08, peak: 0.9, hold: 0.4, r: 1.1 });
    o.connect(g).connect(out); o.start(t); o.stop(t + 1.8);
  },
  step(c, out, t) {
    const n = c.createBufferSource(); n.buffer = noise(c); n.playbackRate.value = rnd(0.5, 0.8);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = rnd(320, 520);
    const g = c.createGain(); env(g, t, { a: 0.004, peak: 0.9, r: 0.09 });
    n.connect(lp).connect(g).connect(out); n.start(t, Math.random()); n.stop(t + 0.15);
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
    env(og, t, { a: 0.003, peak: 0.5, r: 0.07 });
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.1);
  },
  reload(c, out, t) {
    // sacar el cargador, meterlo y el clic final
    for (const [at, f, v] of [[0, 2600, 0.6], [0.3, 1800, 0.9], [0.42, 4200, 0.7]]) {
      const n = c.createBufferSource(); n.buffer = noise(c);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6;
      const g = c.createGain(); env(g, t + at, { a: 0.002, peak: v, r: 0.05 });
      n.connect(bp).connect(g).connect(out); n.start(t + at, Math.random()); n.stop(t + at + 0.08);
    }
    const o = c.createOscillator(), g = c.createGain(); o.type = 'square';
    o.frequency.value = 1450; env(g, t + 0.42, { a: 0.002, peak: 0.12, r: 0.06 });
    o.connect(g).connect(out); o.start(t + 0.42); o.stop(t + 0.5);
  },
  heartbeat(c, out, t) {
    for (const [at, v] of [[0, 1], [0.2, 0.7]]) {
      const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 120;
      o.frequency.setValueAtTime(62, t + at); o.frequency.exponentialRampToValueAtTime(38, t + at + 0.14);
      env(g, t + at, { a: 0.008, peak: v, r: 0.16 });
      o.connect(lp).connect(g).connect(out); o.start(t + at); o.stop(t + at + 0.2);
    }
  },
};

export class ZAudio {
  constructor() {
    this.drone = null;
    this.heartT = 0;
    this.c = null;
    loadPack();
  }
  ctx() { return (this.c ||= audioCtx()); }
  get pack() { return packBuffers; }

  // Oído en la cámara: x, z en metros; yaw = hacia dónde mira (radianes en el plano)
  listener(x, z, yaw) {
    const c = this.ctx();
    if (!c) return;
    const L = c.listener, fx = Math.cos(yaw), fz = Math.sin(yaw);
    try {
      if (L.positionX) {
        const t = c.currentTime;
        L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(1.6, t); L.positionZ.setValueAtTime(z, t);
        L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(0, t); L.forwardZ.setValueAtTime(fz, t);
        L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
      } else { L.setPosition?.(x, 1.6, z); L.setOrientation?.(fx, 0, fz, 0, 1, 0); }
    } catch { /* navegador viejo */ }
  }

  // Un sonido. Con x, z (metros) suena desde ahí; si no, "en la cabeza"
  play(name, { x = null, z = null, vol = 0.6, y = 1.2 } = {}) {
    if (!vol) return;
    const c = this.ctx();
    if (!c) return;
    try {
      let dest = c.destination;
      if (x != null && z != null) {
        const p = c.createPanner();
        p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
        p.refDistance = 2.5; p.rolloffFactor = 1.1; p.maxDistance = 45;
        if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
        p.connect(c.destination);
        dest = p;
      }
      const bufs = packBuffers[name];
      if (bufs?.length) {
        const s = c.createBufferSource(); s.buffer = bufs[(Math.random() * bufs.length) | 0];
        s.playbackRate.value = rnd(0.94, 1.06);
        const g = c.createGain(); g.gain.value = vol;
        s.connect(g).connect(dest); s.start();
        return;
      }
      if (SYN[name]) { const g = c.createGain(); g.gain.value = 0.3 * vol; g.connect(dest); SYN[name](c, g, c.currentTime + 0.005); return; }
      playSoundTo(name, vol, dest);
    } catch { /* sin audio */ }
  }

  // Fondo: zumbido grave (más tenso en las hordas de jefe) y latido en las de jefe
  update(dt, { on = true, boss = false, vol = 0.6 } = {}) {
    const c = this.ctx();
    if (!c) return;
    const target = on ? (boss ? 0.5 : 0.22) * vol : 0;
    if (target > 0 && !this.drone) this.startDrone(c);
    if (this.drone) {
      const t = c.currentTime;
      this.drone.g.gain.setTargetAtTime(target * (this.drone.file ? 1.6 : 1), t, 0.6);
      if (this.drone.lp) this.drone.lp.frequency.setTargetAtTime(boss ? 420 : 200, t, 1);
    }
    if (on && boss) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 0.85; this.play('heartbeat', { vol: vol * 1.1 }); }
    } else this.heartT = 0;
  }
  startDrone(c) {
    const g = c.createGain(); g.gain.value = 0.0001; g.connect(c.destination);
    const nodes = [];
    const amb = packBuffers.ambient;
    if (amb?.length) {
      const s = c.createBufferSource(); s.buffer = amb[0]; s.loop = true; s.connect(g); s.start(); nodes.push(s);
      this.drone = { g, nodes, file: true };
      return;
    }
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 3;
    lp.connect(g);
    for (const f of [41, 41.6, 61.7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const og = c.createGain(); og.gain.value = 0.22; o.connect(og).connect(lp); o.start(); nodes.push(o); }
    const n = c.createBufferSource(); n.buffer = noise(c); n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.value = 0.18;
    n.connect(bp).connect(ng).connect(g); n.start(); nodes.push(n);
    // el filtro "respira" despacio
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 60; lfo.connect(lg).connect(lp.frequency); lfo.start(); nodes.push(lfo);
    this.drone = { g, nodes, lp };
  }

  dispose() {
    if (!this.drone) return;
    const { g, nodes } = this.drone;
    this.drone = null;
    try {
      const c = this.ctx();
      g.gain.setTargetAtTime(0.0001, c.currentTime, 0.15);
      setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch { /* ya paró */ } } g.disconnect(); }, 600);
    } catch { /* sin audio */ }
  }
}
