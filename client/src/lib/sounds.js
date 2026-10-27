// Sonidos generados con WebAudio (sin archivos).
let ctx = null;

const SOUNDS = {
  message: [[880, 0, 0.08], [1320, 0.09, 0.12]],
  wave: [[660, 0, 0.1], [880, 0.1, 0.1], [1100, 0.2, 0.14]],
  reminder: [[784, 0, 0.15], [988, 0.18, 0.15], [784, 0.36, 0.2]],
  join: [[523, 0, 0.08], [784, 0.08, 0.12]],
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
