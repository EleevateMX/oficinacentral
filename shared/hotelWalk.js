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
import { findPath, tileInfo } from './hotelRoom.js';

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
// Solo para dibujar: el primer paso arranca suave y el último frena suave. Las casillas se pisan en los
// mismos tiempos que en el servidor (cada paso empieza y termina igual); solo cambia el avance dentro del paso.
// (Un cambio de rumbo, n0 > 0, ya venía caminando: no vuelve a arrancar.)
export function walkVisual(w, t) {
  const p = walkAt(w, t);
  if (p.done || w.slide) return p;
  const n = w.path.length;
  let k = p.k;
  const first = p.i === 0 && !(w.n0 > 0), last = p.i === n - 1;
  if (first && last) k = k * k * (3 - 2 * k);
  else if (first) k = k * k * (2 - k);
  else if (last) { const u = 1 - k; k = 1 - u * u * (2 - u); }
  const a = p.from, b = p.to;
  return { ...p, k, x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k };
}
// Ciclo de caminar sincronizado con lo que avanza en pantalla (para que los pies no patinen):
// fase += distancia / zancada. dx, dy en casillas. Una zancada completa (dos pasos) ≈ 72 px de pantalla.
export const STRIDE_PX = 72;
export function strideAdvance(dx, dy) {
  const sx = (dx - dy) * 32, sy = (dx + dy) * 16; // TILE_W/2, TILE_H/2
  return Math.max(Math.hypot(sx, sy), Math.hypot(dx, dy) * 34) / STRIDE_PX;
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

// ---------- Como en el hotel clásico: girar, cabeza aparte, no atravesar a nadie ----------
// La cabeza gira como mucho `max` direcciones respecto al cuerpo
export function headWithin(body, d, max = 1) {
  const diff = ((d - body + 12) % 8) - 4;
  return (body + Math.max(-max, Math.min(max, diff)) + 8) % 8;
}

// Qué hace un clic en una casilla (lo decide el cliente; el servidor valida cada cosa):
//   me = { x, y, dir, moving, sit, lay } · tile = { x, y }
//   → { walk: true } caminar (si ya camina: cambia de rumbo desde la siguiente casilla)
//   → { face: d } solo voltear hacia esa casilla vecina (un 2.º clic, ya mirándola, da el paso)
//   → { look: true } clic en tu propia casilla: voltear hacia donde apuntas
export function clickIntent(me, tile) {
  if (!me || me.moving) return { walk: true };
  const dx = tile.x - me.x, dy = tile.y - me.y;
  if (!dx && !dy) return { look: true };
  if (me.sit || me.lay) return { walk: true }; // sentado o acostado: se levanta y camina
  if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) {
    const d = dir8(dx, dy);
    return d === me.dir ? { walk: true } : { face: d };
  }
  return { walk: true };
}

// Voltear hacia d según la postura → { dir (cuerpo), head (null = igual al cuerpo) } | null (no se puede)
//   de pie: gira todo · en una silla/sofá: el cuerpo no se mueve y la cabeza gira ±1
//   sentado en el piso: el cuerpo solo en las 4 direcciones rectas (pares), la cabeza ±1 · acostado: nada
export function lookDirs(st, d) {
  if (d == null || st.lay) return null;
  if (st.sit && !st.sit.floor) { const h = headWithin(st.dir, d); return { dir: st.dir, head: h === st.dir ? null : h }; }
  if (st.sit) {
    let body = d;
    if (d % 2) {
      const a = (d + 7) % 8, b = (d + 1) % 8;
      const far = (x) => Math.abs(((x - st.dir + 12) % 8) - 4);
      body = far(a) <= far(b) ? a : b;
    }
    return { dir: body, head: body === d ? null : d };
  }
  return { dir: d, head: null };
}

// Camino para un clic: no se atraviesa a nadie (salvo en la puerta) y, si la casilla está ocupada,
// se queda en la vecina libre más cercana. occupied = destinos de otros · blocked = donde están parados.
//   near: false → si el destino está ocupado no hay camino (para máquinas, rejas, etc.)
//   → { path, near } (near = se quedó al lado) | null
export function planWalk(grid, start, to, { occupied = new Set(), blocked = new Set(), door = null, near = true } = {}) {
  const k = (x, y) => `${x},${y}`;
  const dk = door ? k(door.x, door.y) : null;
  const bl = new Set([...blocked].filter((s) => s !== dk && s !== k(start.x, start.y)));
  const taken = (x, y) => k(x, y) !== dk && (occupied.has(k(x, y)) || bl.has(k(x, y)));
  if (start.x === to.x && start.y === to.y) return { path: [], near: false };
  if (!taken(to.x, to.y)) {
    const p = findPath(grid, start, to, { blocked: bl });
    return p ? { path: p, near: false } : null;
  }
  if (!near) return null;
  if (Math.max(Math.abs(start.x - to.x), Math.abs(start.y - to.y)) === 1) return { path: [], near: true };
  let best = null;
  for (const [dx, dy] of DIR_VEC) {
    const x = to.x + dx, y = to.y + dy;
    const t = tileInfo(grid, x, y);
    if (!t || (t.kind !== 'floor' && t.kind !== 'walk') || taken(x, y)) continue;
    const p = findPath(grid, start, { x, y }, { blocked: bl });
    if (p && (!best || p.length < best.length)) best = p;
  }
  return best ? { path: best, near: true } : null;
}
