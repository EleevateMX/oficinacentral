// Ambiente: luz según la hora, música suave en zonas de descanso y pasos.
// Todo se genera con WebAudio (sin archivos) y se puede apagar en Preferencias.

let ctx = null;
const audio = () => {
  ctx ||= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

// ---------- Luz del día ----------
// Devuelve el tinte a aplicar sobre el mapa según la hora local
export function daylight(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 8 && h < 17.5) return null; // día
  if (h >= 17.5 && h < 19.5) { const k = (h - 17.5) / 2; return { color: `rgba(255,140,60,${0.04 + k * 0.06})`, night: k > 0.7 ? (k - 0.7) / 0.3 * 0.5 : 0 }; } // atardecer
  if (h >= 6 && h < 8) { const k = 1 - (h - 6) / 2; return { color: `rgba(255,190,120,${0.03 + k * 0.05})`, night: k * 0.4 }; } // amanecer
  return { color: 'rgba(18,28,70,.15)', night: 1 }; // noche
}

// Objetos que brillan de noche
export const GLOWS = { floorLamp: '#ffd27a', lamp: '#ffd27a', hexLamp: null, neonLogo: null, hexNeon: null, fairyLights: '#ffe7a3', ringLight: '#ffffff', arcade: null, vending: '#bfe3ff', bigScreen: '#8fb4ff', tv: '#8fb4ff', fountain: '#9fe0ff' };

// ---------- Música ambiente ----------
// Acordes lentos tipo lo-fi con filtro suave
const CHORDS = [
  [220.0, 261.63, 329.63, 392.0], // Am7
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [196.0, 246.94, 293.66, 349.23], // G7
  [164.81, 207.65, 246.94, 293.66], // E7
];
let music = null;

export function setMusic(on, volume = 0.25) {
  if (on && !music) {
    const ac = audio();
    const master = ac.createGain();
    master.gain.value = 0;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    master.connect(filter).connect(ac.destination);
    master.gain.linearRampToValueAtTime(volume * 0.18, ac.currentTime + 2.5);
    let step = 0;
    const play = () => {
      const t = ac.currentTime;
      const chord = CHORDS[step % CHORDS.length];
      step++;
      chord.forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = i === 0 ? f / 2 : f;
        o.detune.value = (Math.random() - 0.5) * 8;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(i === 0 ? 0.5 : 0.22, t + 0.6 + i * 0.12);
        g.gain.linearRampToValueAtTime(0, t + 3.9);
        o.connect(g).connect(master);
        o.start(t + i * 0.12);
        o.stop(t + 4);
      });
      // notita de melodía
      if (Math.random() > 0.35) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = chord[1 + Math.floor(Math.random() * 3)] * 2;
        const at = t + 1 + Math.random() * 2;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.12, at + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, at + 1.2);
        o.connect(g).connect(master);
        o.start(at);
        o.stop(at + 1.3);
      }
    };
    play();
    const timer = setInterval(play, 4000);
    music = { master, timer };
  } else if (!on && music) {
    const m = music;
    music = null;
    const ac = audio();
    m.master.gain.cancelScheduledValues(ac.currentTime);
    m.master.gain.setValueAtTime(m.master.gain.value, ac.currentTime);
    m.master.gain.linearRampToValueAtTime(0, ac.currentTime + 1.5);
    setTimeout(() => { clearInterval(m.timer); m.master.disconnect(); }, 1600);
  } else if (on && music) {
    music.master.gain.linearRampToValueAtTime(volume * 0.18, audio().currentTime + 0.5);
  }
}

// ---------- Pasos ----------
let lastStep = 0;
export function footstep(volume = 0.3) {
  const now = performance.now();
  if (now - lastStep < 200 || !volume) return;
  lastStep = now;
  try {
    const ac = audio();
    const t = ac.currentTime;
    const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500 + Math.random() * 300;
    const g = ac.createGain();
    g.gain.value = 0.25 * volume;
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t);
  } catch { /* sin audio */ }
}

// Zonas donde suena la música (por nombre del área)
export const MUSIC_AREAS = /lounge|cocina|descanso|juegos|jard[ií]n|caf[eé]/i;
