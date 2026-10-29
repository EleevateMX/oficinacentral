// Sonidos generados con WebAudio (sin archivos).
let ctx = null;
let noiseBuf = null;

const SOUNDS = {
  message: [[880, 0, 0.08], [1320, 0.09, 0.12]],
  wave: [[660, 0, 0.1], [880, 0.1, 0.1], [1100, 0.2, 0.14]],
  reminder: [[784, 0, 0.15], [988, 0.18, 0.15], [784, 0.36, 0.2]],
  join: [[523, 0, 0.08], [784, 0.08, 0.12]],
  // Juegos
  hit: [[440, 0, 0.05]],
  wall: [[300, 0, 0.04]],
  score: [[660, 0, 0.08], [990, 0.08, 0.14]],
  win: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.25]],
  lose: [[392, 0, 0.15], [330, 0.15, 0.15], [262, 0.3, 0.3]],
  pocket: [[220, 0, 0.08], [165, 0.06, 0.12]],
  eat: [[880, 0, 0.03]],
  power: [[523, 0, 0.06], [784, 0.06, 0.06], [1047, 0.12, 0.1]],
  die: [[600, 0, 0.1], [450, 0.1, 0.1], [300, 0.2, 0.1], [150, 0.3, 0.3]],
  cake: [[523, 0, 0.12], [523, 0.14, 0.12], [587, 0.28, 0.25], [523, 0.55, 0.25], [698, 0.82, 0.25], [659, 1.1, 0.45]],
};

export function audioCtx() {
  try {
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// ---------- Recetas procedurales ----------
// tone: { f, f2 (glissando), type, at, dur, vol }  ·  hiss: ruido filtrado { at, dur, vol, freq, freq2, q, type }
function tone(c, out, t0, { f, f2 = f, type = 'sine', at = 0, dur = 0.1, vol = 1, attack = 0.005 }) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0 + at);
  if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + at + dur);
  g.gain.setValueAtTime(0, t0 + at);
  g.gain.linearRampToValueAtTime(vol, t0 + at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
  o.connect(g).connect(out);
  o.start(t0 + at); o.stop(t0 + at + dur + 0.03);
}
function hiss(c, out, t0, { at = 0, dur = 0.1, vol = 1, freq = 1800, freq2 = freq, q = 0.8, type = 'bandpass', attack = 0.002 }) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise(c);
  s.playbackRate.value = 0.7 + Math.random() * 0.6;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0 + at);
  if (freq2 !== freq) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t0 + at + dur);
  g.gain.setValueAtTime(0, t0 + at);
  g.gain.linearRampToValueAtTime(vol, t0 + at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t0 + at, Math.random() * 0.5); s.stop(t0 + at + dur + 0.03);
}

const rnd = (a, b) => a + Math.random() * (b - a);
const PROC = {
  // Juegos de mesa: golpes con cuerpo (clic + tono corto), en vez de un pitido
  paddle: (c, o, t) => { hiss(c, o, t, { dur: 0.03, vol: 0.9, freq: 3500, q: 1.5 }); tone(c, o, t, { f: rnd(520, 600), f2: 380, type: 'triangle', dur: 0.09, vol: 0.9 }); },
  bounce: (c, o, t) => { hiss(c, o, t, { dur: 0.025, vol: 0.5, freq: 2400, q: 2 }); tone(c, o, t, { f: 260, f2: 200, type: 'triangle', dur: 0.06, vol: 0.5 }); },
  clack: (c, o, t) => { hiss(c, o, t, { dur: 0.02, vol: 1, freq: 5000, q: 3 }); tone(c, o, t, { f: 1900, f2: 1500, type: 'square', dur: 0.03, vol: 0.18 }); },
  kick: (c, o, t) => { hiss(c, o, t, { dur: 0.05, vol: 0.9, freq: 900, q: 1 }); tone(c, o, t, { f: 180, f2: 90, dur: 0.12, vol: 1 }); },
  goal: (c, o, t) => {
    hiss(c, o, t, { dur: 1.3, vol: 0.35, freq: 900, freq2: 1500, q: 0.5, attack: 0.25 });
    for (const [f, at] of [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]]) tone(c, o, t, { f, at, dur: 0.25, type: 'triangle', vol: 0.5 });
  },
  tick: (c, o, t) => tone(c, o, t, { f: 880, dur: 0.08, type: 'square', vol: 0.25 }),
  go: (c, o, t) => { tone(c, o, t, { f: 1320, dur: 0.35, type: 'square', vol: 0.28 }); tone(c, o, t, { f: 660, dur: 0.35, type: 'triangle', vol: 0.4 }); },
  // Zombis en la oficina
  stapler: (c, o, t) => { hiss(c, o, t, { dur: 0.07, vol: 1, freq: 2600, freq2: 900, q: 0.9 }); tone(c, o, t, { f: 340, f2: 90, type: 'square', dur: 0.08, vol: 0.35 }); tone(c, o, t, { f: 2400, at: 0.04, dur: 0.03, type: 'square', vol: 0.12 }); },
  shotgun: (c, o, t) => { hiss(c, o, t, { dur: 0.32, vol: 1.2, freq: 1400, freq2: 200, q: 0.6, type: 'lowpass' }); tone(c, o, t, { f: 130, f2: 40, dur: 0.3, vol: 1 }); hiss(c, o, t, { at: 0.38, dur: 0.06, vol: 0.4, freq: 3000, q: 2 }); },
  nail: (c, o, t) => { hiss(c, o, t, { dur: 0.045, vol: 0.8, freq: 4200, freq2: 1800, q: 1.2 }); tone(c, o, t, { f: 620, f2: 180, type: 'sawtooth', dur: 0.05, vol: 0.22 }); },
  empty: (c, o, t) => tone(c, o, t, { f: 1800, dur: 0.025, type: 'square', vol: 0.18 }),
  reload: (c, o, t) => { hiss(c, o, t, { dur: 0.05, vol: 0.5, freq: 3000, q: 3 }); hiss(c, o, t, { at: 0.32, dur: 0.06, vol: 0.7, freq: 2000, q: 3 }); tone(c, o, t, { f: 700, at: 0.33, dur: 0.05, type: 'square', vol: 0.15 }); },
  zhit: (c, o, t) => { hiss(c, o, t, { dur: 0.09, vol: 0.8, freq: 600, freq2: 300, q: 1 }); tone(c, o, t, { f: 160, f2: 80, dur: 0.09, vol: 0.5 }); },
  hitmark: (c, o, t) => tone(c, o, t, { f: 2200, dur: 0.035, type: 'square', vol: 0.12 }),
  splat: (c, o, t) => { hiss(c, o, t, { dur: 0.22, vol: 0.9, freq: 500, freq2: 120, q: 0.7, type: 'lowpass' }); tone(c, o, t, { f: 220, f2: 60, dur: 0.2, type: 'triangle', vol: 0.5 }); },
  groan: (c, o, t) => {
    const f = rnd(70, 110);
    tone(c, o, t, { f, f2: f * rnd(0.7, 0.85), type: 'sawtooth', dur: rnd(0.6, 1), vol: 0.2, attack: 0.12 });
    hiss(c, o, t, { dur: 0.8, vol: 0.18, freq: 500, freq2: 300, q: 4, attack: 0.15 });
  },
  hurt: (c, o, t) => { tone(c, o, t, { f: 200, f2: 90, type: 'square', dur: 0.18, vol: 0.4 }); hiss(c, o, t, { dur: 0.15, vol: 0.6, freq: 800, q: 0.8 }); },
  pick: (c, o, t) => { for (const [f, at] of [[880, 0], [1175, 0.06], [1568, 0.12]]) tone(c, o, t, { f, at, dur: 0.12, type: 'triangle', vol: 0.4 }); },
  buy: (c, o, t) => { for (const [f, at] of [[660, 0], [990, 0.07]]) tone(c, o, t, { f, at, dur: 0.16, type: 'square', vol: 0.18 }); hiss(c, o, t, { at: 0.05, dur: 0.2, vol: 0.2, freq: 6000, q: 2 }); },
  horn: (c, o, t) => { tone(c, o, t, { f: 196, f2: 185, type: 'sawtooth', dur: 1.1, vol: 0.32, attack: 0.08 }); tone(c, o, t, { f: 294, f2: 277, type: 'sawtooth', dur: 1.1, vol: 0.2, attack: 0.08 }); },
  clear: (c, o, t) => { for (const [f, at] of [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]]) tone(c, o, t, { f, at, dur: 0.3, type: 'triangle', vol: 0.45 }); },
  roar: (c, o, t) => { tone(c, o, t, { f: 90, f2: 45, type: 'sawtooth', dur: 1.2, vol: 0.5, attack: 0.1 }); hiss(c, o, t, { dur: 1.2, vol: 0.5, freq: 400, freq2: 150, q: 1.5, attack: 0.1 }); },
  slam: (c, o, t) => { tone(c, o, t, { f: 70, f2: 30, dur: 0.6, vol: 1 }); hiss(c, o, t, { dur: 0.5, vol: 0.9, freq: 300, freq2: 80, q: 0.5, type: 'lowpass' }); },
  spit: (c, o, t) => { hiss(c, o, t, { dur: 0.16, vol: 0.5, freq: 1500, freq2: 500, q: 2 }); },
  paper: (c, o, t) => { hiss(c, o, t, { dur: 0.25, vol: 0.45, freq: 5000, freq2: 2500, q: 1 }); tone(c, o, t, { f: 300, at: 0.02, dur: 0.15, type: 'square', vol: 0.06 }); },
  bossdie: (c, o, t) => { tone(c, o, t, { f: 120, f2: 30, type: 'sawtooth', dur: 1.6, vol: 0.5 }); hiss(c, o, t, { dur: 1.6, vol: 0.6, freq: 1200, freq2: 100, q: 0.6, type: 'lowpass' }); },
  gameover: (c, o, t) => { for (const [f, at] of [[392, 0], [330, 0.3], [262, 0.6], [196, 0.9]]) tone(c, o, t, { f, at, dur: 0.45, type: 'triangle', vol: 0.4 }); },
};

// Nombres de juegos que suenan mejor con receta (se siguen pudiendo pedir con el nombre de siempre)
const ALIAS = { hit: 'paddle', wall: 'bounce' };

export function playSound(name, volume = 0.6) {
  if (!volume) return;
  try {
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const proc = PROC[name] || PROC[ALIAS[name]];
    if (proc) {
      const g = ctx.createGain();
      g.gain.value = 0.3 * volume;
      g.connect(ctx.destination);
      proc(ctx, g, t0);
      return;
    }
    for (const [freq, at, dur] of SOUNDS[name] || []) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + at);
      gain.gain.linearRampToValueAtTime(0.18 * volume, t0 + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.02);
    }
  } catch { /* sin audio */ }
}

// Sonido con posición (izquierda/derecha y distancia) para los juegos en 3D. pan de -1 a 1.
export function playSpatial(name, volume = 0.6, pan = 0) {
  if (!volume) return;
  const c = audioCtx();
  const proc = PROC[name];
  if (!c || !proc) return;
  try {
    const g = c.createGain();
    g.gain.value = 0.3 * volume;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(c.destination); } else g.connect(c.destination);
    proc(c, g, c.currentTime);
  } catch { /* sin audio */ }
}

// Receta procedural hacia un nodo cualquiera (p. ej. un PannerNode de los juegos en 3D).
// Devuelve false si no hay receta con ese nombre.
export function playSoundTo(name, volume = 0.6, dest = null) {
  if (!volume) return true;
  const c = audioCtx();
  const proc = PROC[name] || PROC[ALIAS[name]];
  if (!c || !proc) return false;
  try {
    const g = c.createGain();
    g.gain.value = 0.3 * volume;
    g.connect(dest || c.destination);
    proc(c, g, c.currentTime);
  } catch { /* sin audio */ }
  return true;
}

