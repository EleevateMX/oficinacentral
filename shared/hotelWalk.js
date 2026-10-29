// Hotel: caminar casilla por casilla, como en el hotel clásico.
// Cada paso de una casilla a la siguiente dura STEP_MS (también en diagonal). El servidor y todos los
// clientes calculan la posición con la misma función (walkAt), así que todos ven la misma casilla.
//
// Una caminata: { from: [x, y, z], path: [[x, y, z], …], t0, n0 }
//   from = casilla donde empieza el primer paso · path = casillas que va pisando (sin incluir from)
//   t0 = cuando empieza el primer paso (ms) · n0 = pasos dados antes (para que el ciclo de piernas siga igual al cambiar de rumbo)
//
// Direcciones (8, como en el original): número 0–7 según la casilla vecina a la que se mira
//   0 −y (arriba-derecha) · 1 +x−y (derecha) · 2 +x (abajo-derecha) · 3 +x+y (abajo, hacia ti)
//   4 +y (abajo-izquierda) · 5 −x+y (izquierda) · 6 −x (arriba-izquierda) · 7 −x−y (arriba, de espaldas)
export const STEP_MS = 500;
export const DIR_VEC = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
// Rotación de un furni (hacia dónde mira su frente) → dirección de quien se sienta / acuesta
export const ROT_DIR8 = { 0: 4, 2: 6, 4: 0, 6: 2 };
const LEGACY = { up: 0, right: 2, down: 4, left: 6 };

export function dir8(dx, dy) {
  const sx = Math.sign(Math.round(dx * 1000)), sy = Math.sign(Math.round(dy * 1000));
  if (!sx && !sy) return null;
  return DIR_VEC.findIndex(([a, b]) => a === sx && b === sy);
}
// Acepta números 0–7 y los nombres viejos ('down', 'left', 'up', 'right')
export function toDir8(d, fallback = 4) {
  if (typeof d === 'number' && Number.isInteger(d)) return ((d % 8) + 8) % 8;
  if (typeof d === 'string' && d in LEGACY) return LEGACY[d];
  return fallback;
}
// Dirección hacia un punto (cualquier ángulo), redondeada a la más cercana de las 8
export function dirToward(fx, fy, tx, ty) {
  const dx = tx - fx, dy = ty - fy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;
  const a = Math.atan2(dy, dx); // 0 = +x (dir 2), π/2 = +y (dir 4)
  return ((Math.round(a / (Math.PI / 4)) + 2) % 8 + 8) % 8;
}

// Dónde va una caminata en el momento t
//   → { done, i, k, from, to, x, y, z (interpolados), dir, steps (pasos dados, con fracción) }
//   i = paso en curso (0…path.length-1), k = avance del paso (0…1). from/to = casillas del paso.
export function walkAt(w, t) {
  const n = w.path.length;
  const e = Math.max(0, (t - w.t0) / STEP_MS);
  const n0 = w.n0 || 0;
  if (!n || e >= n) {
    const end = n ? w.path[n - 1] : w.from;
    const prev = n > 1 ? w.path[n - 2] : w.from;
    return { done: true, i: n, k: 1, from: prev, to: end, x: end[0], y: end[1], z: end[2], dir: dir8(end[0] - prev[0], end[1] - prev[1]), steps: n0 + n };
  }
  const i = Math.floor(e), k = e - i;
  const a = i ? w.path[i - 1] : w.from, b = w.path[i];
  return {
    done: false, i, k, from: a, to: b,
    x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k,
    dir: dir8(b[0] - a[0], b[1] - a[1]), steps: n0 + e,
  };
}
export const walkEnd = (w) => w.t0 + w.path.length * STEP_MS;

// Cambiar de rumbo a media caminata: se termina el paso en curso y el nuevo camino sale de la casilla
// a la que ya iba. rest = camino desde esa casilla (como lo da findPath, sin incluirla).
// Si no va caminando, el nuevo camino empieza ya, desde donde está parado.
export function rerouteFrom(w, t) {
  if (!w) return null;
  const p = walkAt(w, t);
  if (p.done) return null;
  return { from: p.from, next: p.to, t0: w.t0 + p.i * STEP_MS, n0: (w.n0 || 0) + p.i };
}
