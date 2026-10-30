// Ayudantes de red y de bucle para los juegos de la sala de juegos.
//
// - SnapBuffer: el invitado y los espectadores guardan los estados que manda el anfitrión y dibujan
//   ~100 ms en el pasado, interpolando entre dos estados. Así el movimiento se ve parejo a 60 fps
//   aunque los estados lleguen a 20–30 por segundo, con retraso variable o se pierda alguno.
// - gameLoop: el anfitrión simula con paso fijo (la física no depende de los Hz del monitor) y el
//   dibujo va aparte con requestAnimationFrame. Se pausa sola cuando la pestaña se oculta.
// - crispCanvas: el lienzo usa la densidad de pixeles de la pantalla (nítido en pantallas retina).
// - Juice: sacudida de pantalla y partículas sencillas.
//
// Sin dependencias del DOM al importar (se prueba en Node).

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Marca de tiempo del anfitrión (su reloj; el que recibe calcula la diferencia)
export function stamp(d, t = now()) { d._t = Math.round(t); return d; }

const lerp = (a, b, k) => a + (b - a) * k;

// Interpola en profundidad números de a → b. `keys`: solo esas llaves de primer nivel (las demás
// se toman del estado más reciente que ya pasó). `jump`: diferencia a partir de la cual no se
// interpola (teletransporte, reinicio de la pelota…). `angles`: llaves que son ángulos.
export function lerpState(a, b, k, { keys = null, jump = Infinity, angles = null } = {}) {
  if (!a) return b;
  if (!b) return a;
  const out = Array.isArray(b) ? [] : {};
  for (const key of Object.keys(b)) {
    if (key === '_t') continue;
    if (keys && !keys.includes(key)) out[key] = a[key] !== undefined ? a[key] : b[key];
    else out[key] = deep(a[key], b[key], k, jump, angles?.includes(key));
  }
  return out;
}

function deep(a, b, k, jump, ang) {
  if (typeof b === 'number' && typeof a === 'number') {
    if (ang) {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + d * k;
    }
    return Math.abs(b - a) > jump ? (k < 0.5 ? a : b) : lerp(a, b, k);
  }
  if (Array.isArray(b)) {
    if (!Array.isArray(a) || a.length !== b.length) return b;
    return b.map((v, i) => deep(a[i], v, k, jump, ang));
  }
  if (b && typeof b === 'object') {
    if (!a || typeof a !== 'object') return b;
    const o = {};
    for (const key of Object.keys(b)) o[key] = deep(a[key], b[key], k, jump, ang);
    return o;
  }
  return k < 1 ? (a !== undefined ? a : b) : b;
}

// Búfer de estados con reloj adaptable. (adaptive: true = el retraso nuevo que se adapta al vaivén;
// por omisión se queda la fórmula de antes, que usan los demás juegos)
// El retraso con el que se dibuja se adapta a la red: sube rápido cuando los estados llegan tarde
// o con vaivén (para no quedarse sin estado y "congelarse") y baja despacio cuando la red mejora.
export class SnapBuffer {
  constructor({ delay = 100, maxDelay = 250, keep = 1500, extrapolate = 80, adaptive = false } = {}) {
    this.base = delay;
    this.maxDelay = maxDelay;
    this.keep = keep;
    this.extra = extrapolate;
    this.adaptive = adaptive;
    this.snaps = []; // { t (reloj del anfitrión), d }
    this.offset = null; // recibido - enviado (ms), se ajusta poco a poco
    this.interval = 33; // promedio entre estados (ms)
    this.jitter = 0; // vaivén: qué tan tarde llegan los estados respecto al más puntual (p90, ms)
    this.lastRecv = 0;
    this.lastT = null;
    this._delay = delay;
    this.late = new Float32Array(120); // retrasos recientes respecto al mejor (ms, ~6 s)
    this.lateN = 0;
    this.stats = { samples: 0, holds: 0, extra: 0, late: 0 }; // cuadros: total, congelados (sin estado nuevo), extrapolados
  }

  get delay() {
    if (!this.adaptive) return Math.min(this.maxDelay, Math.max(this.base, this.interval * 1.6 + this.jitter * 2));
    return this._delay;
  }

  // Retraso que haría falta para tener casi siempre un estado más nuevo que el que se dibuja
  target() {
    return Math.min(this.maxDelay, Math.max(this.base, this.interval * 1.15 + this.jitter + 12));
  }

  push(d, recv = now()) {
    const t = Number.isFinite(d?._t) ? d._t : recv;
    if (this.lastT != null && t <= this.lastT) {
      // repetido o fuera de orden: se ignora (o se reinicia si el anfitrión cambió de reloj)
      if (this.lastT - t < 5000) return false;
      this.snaps.length = 0; this.offset = null;
    }
    const off = recv - t;
    if (this.offset == null || off < this.offset) this.offset = off; // baja rápido
    else this.offset += (off - this.offset) * 0.02; // sube despacio (red más lenta)
    if (!this.adaptive) {
      // fórmula de siempre (la usan los demás juegos): intervalo y vaivén entre llegadas
      if (this.lastRecv) {
        const gap = recv - this.lastRecv;
        if (gap < 1000) {
          this.jitter += (Math.abs(gap - this.interval) - this.jitter) * 0.1;
          this.interval += (gap - this.interval) * 0.1;
        }
      }
    } else {
      // el intervalo es el del anfitrión (no el de llegada, que trae el vaivén)
      if (this.lastT != null) { const sent = t - this.lastT; if (sent < 1000) this.interval += (sent - this.interval) * 0.1; }
      // vaivén: qué tan tarde llegó este respecto al más puntual que hemos visto (p96 de ~6 s)
      this.late[this.lateN++ % this.late.length] = Math.max(0, off - this.offset);
      const n = Math.min(this.lateN, this.late.length);
      if (n >= 4) {
        const tmp = this._tmp || (this._tmp = new Float32Array(this.late.length));
        for (let i = 0; i < n; i++) tmp[i] = this.late[i];
        const view = tmp.subarray(0, n).sort();
        this.jitter = view[Math.min(n - 1, Math.floor(n * 0.96))];
      }
      const tg = this.target();
      this._delay += (tg - this._delay) * (tg > this._delay ? 0.3 : 0.015);
    }
    this.lastRecv = recv;
    this.lastT = t;
    this.snaps.push({ t, d });
    while (this.snaps.length > 2 && this.snaps[1].t < t - this.keep) this.snaps.shift();
    return true;
  }

  get latest() { return this.snaps[this.snaps.length - 1]?.d || null; }
  get size() { return this.snaps.length; }

  // Hora del anfitrión que se debe dibujar ahora
  renderTime(at = now()) { return this.offset == null ? 0 : at - this.offset - this.delay; }

  // { a, b, k } con a ≤ rt ≤ b (k de 0 a 1). Si faltan estados (se perdieron), extrapola un poco
  // (k > 1, hasta `extrapolate` ms) y luego se queda en el último.
  sample(at = now()) {
    const s = this.snaps;
    if (!s.length) return null;
    if (s.length === 1) return { a: s[0].d, b: s[0].d, k: 1, rt: s[0].t };
    const rt = this.renderTime(at);
    if (rt <= s[0].t) return { a: s[0].d, b: s[0].d, k: 0, rt };
    for (let i = 1; i < s.length; i++) {
      if (rt <= s[i].t) {
        const a = s[i - 1], b = s[i];
        this.stats.samples++;
        return { a: a.d, b: b.d, k: (rt - a.t) / Math.max(1, b.t - a.t), rt };
      }
    }
    const a = s[s.length - 2], b = s[s.length - 1];
    const over = Math.min(this.extra, rt - b.t);
    this.stats.samples++;
    if (rt - b.t > this.extra) this.stats.holds++; else this.stats.extra++;
    // nos quedamos sin estados: dibujar un poco más en el pasado (hasta el tope)
    if (this.adaptive && rt - b.t > 0) this._delay = Math.min(this.maxDelay, this._delay + 2);
    return { a: a.d, b: b.d, k: 1 + over / Math.max(1, b.t - a.t), rt };
  }

  // Estado interpolado listo para dibujar (ver lerpState). La extrapolación solo aplica a números.
  state(opts, at = now()) {
    const p = this.sample(at);
    if (!p) return null;
    if (p.k <= 0) return p.a;
    if (p.k >= 1 && !(opts?.extrapolate && p.k > 1)) return p.b;
    return lerpState(p.a, p.b, Math.min(p.k, 1.5), opts);
  }
}

// Cuántos pasos fijos tocan con el tiempo acumulado `acc` (s), sin pasar de `maxSteps`.
// Si aun así queda atraso (la compu no da), se tira: la simulación va más lenta un momento en vez
// de "espiralear" (cada cuadro con más pasos, cada vez más lento). Devuelve { steps, acc, dropped }.
export function catchUp(acc, dt, maxSteps) {
  const want = Math.floor((acc + 1e-9) / dt);
  const steps = Math.min(maxSteps, want);
  acc -= steps * dt;
  let dropped = 0;
  if (want > maxSteps) { dropped = acc - (acc % dt); acc %= dt; }
  return { steps, acc: Math.max(0, acc), dropped };
}

// Bucle con paso fijo. step(dt) corre `hz` veces por segundo (con tope de pasos por cuadro y de
// milisegundos por cuadro, `budgetMs`, para no "espiralear"); frame(dt, alpha) dibuja una vez por
// cuadro. Se pausa con la pestaña oculta.
export function gameLoop({ step, frame, hz = 120, maxSteps = 12, budgetMs = Infinity, now: clock = now, raf = globalThis.requestAnimationFrame?.bind(globalThis), caf = globalThis.cancelAnimationFrame?.bind(globalThis) }) {
  const dt = 1 / hz;
  let acc = 0, last = null, id = 0, stopped = false, paused = false;
  const stats = { steps: 0, dropped: 0, frames: 0 };
  const tick = (t) => {
    if (stopped) return;
    if (last == null) last = t;
    const real = Math.min(0.25, Math.max(0, (t - last) / 1000));
    last = t;
    if (step) {
      acc += real;
      const plan = catchUp(acc, dt, maxSteps);
      acc = plan.acc;
      stats.dropped += plan.dropped;
      const t0 = budgetMs < Infinity ? clock() : 0;
      for (let n = 0; n < plan.steps; n++) {
        step(dt); stats.steps++;
        // se acabó el tiempo de este cuadro: lo que falta se tira (no se acumula)
        if (budgetMs < Infinity && n < plan.steps - 1 && clock() - t0 > budgetMs) { stats.dropped += (plan.steps - 1 - n) * dt; break; }
      }
    }
    stats.frames++;
    frame?.(Math.min(0.05, real), step ? acc / dt : 1);
    id = raf(tick);
  };
  const vis = () => {
    if (typeof document === 'undefined') return;
    if (document.hidden) { paused = true; caf(id); }
    else if (paused && !stopped) { paused = false; last = null; acc = 0; id = raf(tick); }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', vis);
  id = raf(tick);
  return {
    get paused() { return paused; },
    stats,
    stop() {
      stopped = true;
      caf(id);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', vis);
    },
  };
}

// Salud de la conexión: ping (ida y vuelta al servidor), estados perdidos (por número de secuencia)
// y si lo que se siente trabado es la red o la compu. Puro (se prueba en Node).
export class NetStats {
  constructor({ window = 4000 } = {}) {
    this.win = window;
    this.ping = null; // ms (promedio suave)
    this.pingMax = 0;
    this.lastSeq = null;
    this.got = 0; this.lost = 0; // ventana actual
    this.loss = 0; // 0..1 (última ventana completa, suavizado)
    this.t0 = null;
  }
  addPing(ms) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 10000) return;
    this.ping = this.ping == null ? ms : this.ping + (ms - this.ping) * 0.25;
    this.pingMax = Math.max(this.pingMax * 0.9, ms);
  }
  // número de secuencia de cada estado que llega (los que faltan se cuentan como perdidos)
  addSeq(sq, at = now()) {
    if (!Number.isFinite(sq)) return;
    if (this.t0 == null) this.t0 = at;
    if (this.lastSeq != null) {
      const gap = sq - this.lastSeq;
      if (gap === 0) return; // repetido
      // llegó tarde (desordenado): ya se había contado como perdido
      if (gap < 0 && gap > -200) { if (this.lost > 0) this.lost--; this.got++; return; }
      if (gap > 0 && gap < 200) this.lost += gap - 1;
    }
    this.lastSeq = sq;
    this.got++;
    if (at - this.t0 >= this.win) this.roll(at);
  }
  roll(at = now()) {
    const tot = this.got + this.lost;
    const l = tot ? this.lost / tot : 0;
    this.loss = this.loss * 0.4 + l * 0.6;
    this.got = 0; this.lost = 0; this.t0 = at;
  }
  // frameMs: tiempo por cuadro (promedio). holds: fracción de cuadros sin estado nuevo (invitado).
  // → { level: 'ok'|'net'|'device', text }
  diagnose({ frameMs = 16.7, budgetMs = 16.7, holds = 0 } = {}) {
    const badNet = (this.ping != null && this.ping > 220) || this.loss > 0.05 || holds > 0.12;
    const badDev = frameMs > budgetMs * 1.6;
    if (badNet) return { level: 'net', text: 'Conexión inestable' };
    if (badDev) return { level: 'device', text: 'Tu equipo va lento' };
    return { level: 'ok', text: '' };
  }
}

// Lienzo nítido: el tamaño interno sigue al tamaño en pantalla × devicePixelRatio, y el juego
// sigue dibujando en sus coordenadas lógicas (W × H). Llamar begin() al inicio de cada cuadro.
export function crispCanvas(canvas, W, H, { max = 2.5 } = {}) {
  const g = canvas.getContext('2d');
  let k = 1;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(max, globalThis.devicePixelRatio || 1);
    const want = Math.max(1, Math.min(3, (r.width || W) * dpr / W));
    if (Math.abs(want - k) > 0.01 || canvas.width !== Math.round(W * want)) {
      k = want;
      canvas.width = Math.round(W * k);
      canvas.height = Math.round(H * k);
    }
  };
  fit();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(canvas);
  return {
    g,
    get scale() { return k; },
    begin() { g.setTransform(k, 0, 0, k, 0, 0); },
    destroy() { ro?.disconnect(); canvas.width = W; canvas.height = H; },
  };
}

// ---------- Juice ----------
export class Shake {
  constructor() { this.t = 0; this.amp = 0; }
  kick(amp = 8, t = 0.35) { this.amp = Math.max(this.amp, amp); this.t = Math.max(this.t, t); this.dur = Math.max(this.dur || 0, t); }
  offset(dt) {
    if (this.t <= 0) return [0, 0];
    this.t = Math.max(0, this.t - dt);
    const a = this.amp * (this.t / (this.dur || 1));
    if (this.t <= 0) { this.amp = 0; this.dur = 0; }
    return [(Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a];
  }
}

export class Particles {
  constructor(max = 300) { this.p = []; this.max = max; }
  burst(x, y, n, { colors = ['#fff'], speed = [60, 260], life = [0.4, 1], size = [2, 4], gravity = 0, spread = Math.PI * 2, dir = 0 } = {}) {
    for (let i = 0; i < n && this.p.length < this.max; i++) {
      const a = dir + (Math.random() - 0.5) * spread, sp = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.p.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life[0] + Math.random() * (life[1] - life[0]), max: 1, c: colors[i % colors.length], r: size[0] + Math.random() * (size[1] - size[0]), g: gravity });
    }
  }
  draw(g, dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) { this.p.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy = q.vy * 0.96 + q.g * dt;
      g.globalAlpha = Math.min(1, q.life * 2);
      g.fillStyle = q.c;
      g.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r);
    }
    g.globalAlpha = 1;
  }
}

// Cuenta regresiva grande ("3, 2, 1, ¡Ya!"). t = segundos que faltan.
export function drawCountdown(g, cx, cy, t, { size = 96, go = '¡Ya!', color = '#FFCC00' } = {}) {
  if (t > 3.2 || t < -0.6) return;
  const n = Math.ceil(t);
  const label = n > 0 ? String(n) : go;
  const frac = n > 0 ? t - Math.floor(t) : 1 + t / 0.6;
  const sc = 0.7 + 0.5 * Math.max(0, frac);
  g.save();
  g.translate(cx, cy);
  g.scale(sc, sc);
  g.globalAlpha = Math.max(0, Math.min(1, n > 0 ? 0.35 + frac : frac));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${size}px system-ui, sans-serif`;
  g.lineWidth = size / 9; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.55)';
  g.strokeText(label, 0, 0);
  g.fillStyle = n > 0 ? '#fff' : color;
  g.fillText(label, 0, 0);
  g.restore();
}
