// Sonido de los karts: motor generado (el tono sube con la velocidad), derrape, turbo, golpes,
// cuenta regresiva y un ambiente de oficina sin música. Si alguien deja archivos en
// client/public/sounds/karts/ (ver el README de esa carpeta), se usan esos en lugar de los generados.
import { audioCtx } from '../../lib/sounds.js';

const PACK_URL = '/sounds/karts/sounds.json';
let pack = null; // { name: AudioBuffer }
let packTried = false;

async function loadPack(c) {
  if (packTried) return;
  packTried = true;
  try {
    const r = await fetch(PACK_URL, { cache: 'force-cache' });
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return;
    const list = await r.json();
    const out = {};
    await Promise.all(Object.entries(list || {}).map(async ([name, file]) => {
      if (typeof file !== 'string' || !/^[\w.-]+\.(ogg|mp3|wav|m4a)$/i.test(file)) return;
      try {
        const a = await fetch(`/sounds/karts/${file}`);
        if (!a.ok || !/audio|ogg|mpeg|wav|octet/.test(a.headers.get('content-type') || '')) return;
        out[name] = await c.decodeAudioData(await a.arrayBuffer());
      } catch { /* ese archivo no sirve: se queda el generado */ }
    }));
    pack = out;
  } catch { /* sin paquete de sonidos */ }
}

export class KartAudio {
  constructor(volume = 0.6) {
    this.vol = volume;
    this.c = null;
    this.engine = null;
    this.muted = false;
  }
  start() {
    if (this.c) return;
    const c = audioCtx();
    if (!c) return;
    this.c = c;
    loadPack(c);
    this.master = c.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(c.destination);
    // ruido para derrape, viento y golpes
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
    this.noise = nb;
    // motor: dos osciladores + filtro + "putt-putt" (modulación de volumen)
    const e = {};
    e.o1 = c.createOscillator(); e.o1.type = 'sawtooth';
    e.o2 = c.createOscillator(); e.o2.type = 'square';
    e.f = c.createBiquadFilter(); e.f.type = 'lowpass'; e.f.frequency.value = 600; e.f.Q.value = 3;
    e.g = c.createGain(); e.g.gain.value = 0;
    e.am = c.createGain(); e.am.gain.value = 0.7;
    e.lfo = c.createOscillator(); e.lfo.type = 'square'; e.lfo.frequency.value = 18;
    e.lfoG = c.createGain(); e.lfoG.gain.value = 0.3;
    e.lfo.connect(e.lfoG); e.lfoG.connect(e.am.gain);
    const g2 = c.createGain(); g2.gain.value = 0.5;
    e.o1.connect(e.f); e.o2.connect(g2); g2.connect(e.f);
    e.f.connect(e.am); e.am.connect(e.g); e.g.connect(this.master);
    for (const o of [e.o1, e.o2, e.lfo]) o.start();
    this.engine = e;
    // derrape: ruido filtrado
    const sk = {};
    sk.src = c.createBufferSource(); sk.src.buffer = nb; sk.src.loop = true;
    sk.f = c.createBiquadFilter(); sk.f.type = 'bandpass'; sk.f.frequency.value = 2400; sk.f.Q.value = 6;
    sk.g = c.createGain(); sk.g.gain.value = 0;
    sk.src.connect(sk.f); sk.f.connect(sk.g); sk.g.connect(this.master); sk.src.start();
    this.skid = sk;
    // ambiente: zumbido de oficina (o viento en la azotea)
    const am = {};
    am.src = c.createBufferSource(); am.src.buffer = nb; am.src.loop = true; am.src.playbackRate.value = 0.5;
    am.f = c.createBiquadFilter(); am.f.type = 'lowpass'; am.f.frequency.value = 260;
    am.g = c.createGain(); am.g.gain.value = 0.05;
    am.src.connect(am.f); am.f.connect(am.g); am.g.connect(this.master); am.src.start();
    this.amb = am;
    this.ambT = 2;
    this.engineLoop = null;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; }

  // cada cuadro: velocidad (0..1+), acelerador, derrape (0/1/2 nivel), en el aire, viento (azotea)
  update(dt, { speed = 0, throttle = 0, drift = 0, tier = 0, air = false, boost = false, wind = 0, active = true }) {
    const c = this.c;
    if (!c) return;
    const t = c.currentTime;
    const e = this.engine;
    const sp = Math.max(0, Math.min(1.5, speed));
    const base = 46 + sp * 150 + (boost ? 30 : 0) + (air ? 25 : 0);
    if (pack?.engine && !this.engineLoop) {
      const s = c.createBufferSource(); s.buffer = pack.engine; s.loop = true;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.master); s.start();
      this.engineLoop = { s, g };
      e.g.gain.setTargetAtTime(0, t, 0.05);
    }
    if (this.engineLoop) {
      this.engineLoop.s.playbackRate.setTargetAtTime(0.6 + sp * 1.2, t, 0.05);
      this.engineLoop.g.gain.setTargetAtTime(active ? 0.35 + throttle * 0.15 : 0, t, 0.1);
    } else {
      e.o1.frequency.setTargetAtTime(base, t, 0.04);
      e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.04);
      e.f.frequency.setTargetAtTime(380 + sp * 1500 + throttle * 300, t, 0.05);
      e.lfo.frequency.setTargetAtTime(9 + sp * 30, t, 0.05);
      e.lfoG.gain.setTargetAtTime(Math.max(0.05, 0.35 - sp * 0.25), t, 0.1);
      e.g.gain.setTargetAtTime(active ? 0.06 + throttle * 0.05 + sp * 0.04 : 0, t, 0.08);
    }
    const sk = this.skid;
    sk.g.gain.setTargetAtTime(active && drift ? 0.07 + tier * 0.03 : 0, t, 0.05);
    sk.f.frequency.setTargetAtTime(1800 + tier * 900 + sp * 400, t, 0.05);
    this.amb.g.gain.setTargetAtTime(0.035 + wind * 0.08, t, 0.3);
    this.amb.f.frequency.setTargetAtTime(wind ? 700 : 240, t, 0.3);
    // clics de teclado y algún teléfono lejano (oficina viva)
    this.ambT -= dt;
    if (this.ambT <= 0 && active && !wind) {
      this.ambT = 0.4 + Math.random() * 2.2;
      const n = 2 + ((Math.random() * 5) | 0);
      for (let k = 0; k < n; k++) this.tick(t + k * (0.07 + Math.random() * 0.06), 0.012);
    }
  }
  tick(at, v) {
    const c = this.c;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    const g = c.createGain(); g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(at, Math.random()); s.stop(at + 0.05);
  }
  tone(f0, f1, dur, { type = 'square', vol = 0.15, at = 0 } = {}) {
    const c = this.c;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  hiss(dur, { f0 = 800, f1 = 3000, vol = 0.2, at = 0, type = 'bandpass', q = 1.5 } = {}) {
    const c = this.c;
    if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  // efectos con nombre (se usa el archivo del paquete si existe)
  play(name, v = 1) {
    if (!this.c) return;
    if (pack?.[name]) {
      const s = this.c.createBufferSource(); s.buffer = pack[name];
      const g = this.c.createGain(); g.gain.value = v;
      s.connect(g); g.connect(this.master); s.start();
      return;
    }
    switch (name) {
      case 'beep': this.tone(660, 660, 0.18, { vol: 0.12 * v }); break;
      case 'go': this.tone(990, 990, 0.45, { vol: 0.14 * v }); this.tone(1320, 1320, 0.45, { vol: 0.06 * v }); break;
      case 'boost': this.hiss(0.6, { f0: 400, f1: 3200, vol: 0.22 * v }); this.tone(220, 660, 0.4, { type: 'sawtooth', vol: 0.05 * v }); break;
      case 'mini1': this.hiss(0.35, { f0: 900, f1: 3500, vol: 0.18 * v }); this.tone(520, 1040, 0.15, { vol: 0.06 * v }); break;
      case 'mini2': this.hiss(0.55, { f0: 700, f1: 4200, vol: 0.24 * v }); this.tone(660, 1320, 0.2, { vol: 0.08 * v }); break;
      case 'tier': this.tone(1400, 1800, 0.08, { type: 'triangle', vol: 0.07 * v }); break;
      case 'wall': this.hiss(0.18, { f0: 300, f1: 120, vol: 0.35 * v, type: 'lowpass', q: 0.7 }); this.tone(120, 60, 0.12, { type: 'triangle', vol: 0.12 * v }); break;
      case 'bump': this.hiss(0.12, { f0: 500, f1: 200, vol: 0.25 * v, type: 'lowpass' }); this.tone(180, 90, 0.1, { type: 'triangle', vol: 0.08 * v }); break;
      case 'jump': this.tone(300, 600, 0.18, { type: 'triangle', vol: 0.06 * v }); break;
      case 'land': this.hiss(0.15, { f0: 250, f1: 90, vol: 0.3 * v, type: 'lowpass' }); break;
      case 'box': [784, 988, 1175, 1568].forEach((f, k) => this.tone(f, f, 0.08, { type: 'triangle', vol: 0.06 * v, at: k * 0.05 })); break;
      case 'roulette': this.tone(1200 + Math.random() * 400, 1200, 0.04, { type: 'triangle', vol: 0.03 * v }); break;
      case 'item': this.tone(880, 1320, 0.12, { type: 'triangle', vol: 0.08 * v }); break;
      case 'cafe': this.tone(400, 900, 0.25, { type: 'sawtooth', vol: 0.05 * v }); this.hiss(0.5, { f0: 600, f1: 3000, vol: 0.18 * v }); break;
      case 'grapa': this.tone(1800, 400, 0.12, { type: 'square', vol: 0.06 * v }); this.hiss(0.08, { f0: 4000, f1: 2000, vol: 0.2 * v }); break;
      case 'postit': this.hiss(0.15, { f0: 1500, f1: 600, vol: 0.12 * v }); break;
      case 'hit': this.tone(700, 160, 0.5, { type: 'sawtooth', vol: 0.08 * v }); this.hiss(0.3, { f0: 2000, f1: 400, vol: 0.2 * v }); break;
      case 'lap': [660, 880].forEach((f, k) => this.tone(f, f, 0.14, { type: 'triangle', vol: 0.09 * v, at: k * 0.12 })); break;
      case 'final': [660, 880, 1100].forEach((f, k) => this.tone(f, f, 0.14, { type: 'triangle', vol: 0.1 * v, at: k * 0.12 })); break;
      case 'finish': [523, 659, 784, 1047, 784, 1047].forEach((f, k) => this.tone(f, f, k > 3 ? 0.35 : 0.15, { type: 'triangle', vol: 0.11 * v, at: k * 0.13 })); break;
      case 'wrong': this.tone(300, 300, 0.2, { vol: 0.06 * v }); break;
      default: break;
    }
  }
  stop() {
    try {
      const e = this.engine;
      if (e) for (const o of [e.o1, e.o2, e.lfo]) o.stop();
      this.skid?.src.stop(); this.amb?.src.stop(); this.engineLoop?.s.stop();
      this.master?.disconnect();
    } catch { /* ya estaba parado */ }
    this.c = null;
  }
}
