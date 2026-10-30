// Calidad automática para los juegos 3D (Zombies y Karts). Puro: sin DOM ni three.js (se prueba en Node).
//
// AdaptiveQuality mira cuánto tarda cada cuadro y mueve un "nivel" en una escalera de ajustes
// (0 = lo mejor … n-1 = lo más ligero). Cada juego decide qué cambia en cada escalón (primero la
// resolución, luego las sombras, luego los efectos).
//  - Baja un escalón si los cuadros van lentos de forma sostenida (no por un tirón suelto).
//  - Sube un escalón solo si sobra tiempo de verdad durante varios segundos.
//  - Histéresis: si al subir se vuelve a trabar, ese escalón queda bloqueado un rato (cada vez más
//    largo), así no parpadea entre dos calidades.

export const QUALITY_MODES = [
  { id: 'auto', name: 'Auto' },
  { id: 'alta', name: 'Alta' },
  { id: 'media', name: 'Media' },
  { id: 'baja', name: 'Baja' },
];
export const isQualityMode = (q) => QUALITY_MODES.some((m) => m.id === q);

export class AdaptiveQuality {
  // levels: cuántos escalones · start: escalón inicial · min: el mejor permitido (0)
  // budgetMs: lo que debe durar un cuadro (60 fps) · workMs del cuadro (CPU) opcional en sample()
  constructor({ levels, start = 0, min = 0, budgetMs = 1000 / 60, downAfter = 1.5, upAfter = 6, cooldown = 2.5, lockFor = 20, warmup = 2 } = {}) {
    this.levels = levels;
    this.level = Math.max(min, Math.min(levels - 1, start));
    this.min = min;
    this.budget = budgetMs;
    this.downAfter = downAfter;
    this.upAfter = upAfter;
    this.cooldown = cooldown;
    this.lockFor = lockFor;
    this.t = 0; // segundos desde el inicio
    this.warm = warmup;
    this.slowT = 0; // segundos seguidos con cuadros lentos
    this.fastT = 0; // segundos seguidos con tiempo de sobra
    this.lastChange = -1e9;
    this.ceil = min; // mejor escalón al que se puede subir ahora
    this.ceilUntil = 0;
    this.fails = 0;
    this.upAt = -1e9; // cuándo se subió por última vez (para detectar que subir no funcionó)
    this.ms = budgetMs; // promedio suave del cuadro
    this.work = 0; // promedio suave del trabajo del cuadro (si se da)
    this.history = [];
  }

  // Un cuadro: dtMs = tiempo desde el anterior; workMs = cuánto trabajó el cuadro (opcional).
  // Devuelve el nuevo nivel si cambió, o null.
  sample(dtMs, workMs = null) {
    if (!(dtMs > 0)) return null;
    const dt = Math.min(dtMs, 250) / 1000;
    this.t += dt;
    // un tirón suelto (GC, pestaña) no cuenta de más: se recorta a 3 cuadros
    const ms = Math.min(dtMs, this.budget * 3);
    this.ms += (ms - this.ms) * 0.08;
    if (workMs != null) this.work += (workMs - this.work) * 0.08;
    if (this.t < this.warm) return null;
    if (this.ceilUntil && this.t > this.ceilUntil) { this.ceil = this.min; this.ceilUntil = 0; }
    const load = this.ms / this.budget;
    if (load > 1.22) { this.slowT += dt; this.fastT = 0; }
    else if (load < 1.06 && (workMs == null || this.work < this.budget * 0.55)) { this.fastT += dt; this.slowT = Math.max(0, this.slowT - dt * 2); }
    else { this.slowT = Math.max(0, this.slowT - dt); this.fastT = 0; }
    if (this.t - this.lastChange < this.cooldown) return null;
    if (this.slowT >= this.downAfter && this.level < this.levels - 1) {
      // si se acaba de subir y se trabó: ese escalón no sirve por un rato (cada vez más tiempo)
      if (this.t - this.upAt < this.upAfter + this.cooldown) {
        this.fails++;
        this.ceil = this.level + 1;
        this.ceilUntil = this.t + this.lockFor * Math.min(8, 2 ** (this.fails - 1));
      }
      return this.set(this.level + 1, 'down');
    }
    if (this.fastT >= this.upAfter && this.level > Math.max(this.min, this.ceil)) {
      this.upAt = this.t;
      return this.set(this.level - 1, 'up');
    }
    return null;
  }

  set(level, why = 'set') {
    level = Math.max(this.min, Math.min(this.levels - 1, level));
    if (level === this.level) return null;
    this.level = level;
    this.lastChange = this.t;
    this.slowT = 0; this.fastT = 0;
    this.ms = this.budget; // se vuelve a medir con el ajuste nuevo
    this.history.push({ t: Math.round(this.t * 10) / 10, level, why });
    if (this.history.length > 20) this.history.shift();
    return level;
  }

  get fps() { return 1000 / this.ms; }
}

// Densidad de pixeles para el 3D: dpr de la pantalla, con tope y un factor (resolución dinámica)
export function pixelRatio(dpr, cap, scale = 1) {
  return Math.max(0.35, Math.min(dpr || 1, cap) * scale);
}
