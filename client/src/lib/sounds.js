// Sonidos generados con WebAudio (sin archivos).
let ctx = null;

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

export function playSound(name, volume = 0.6) {
  if (!volume) return;
  try {
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
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
