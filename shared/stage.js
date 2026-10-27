// Escenario con micrófono: quien está arriba del escenario (o en un micrófono de escenario)
// es "ponente" y lo oye todo el público del área donde está el escenario. Si el escenario
// no está dentro de un área, lo oye quien esté en el piso a menos de STAGE_RADIUS casillas
// (fuera de salas privadas). El público entre sí sigue con la proximidad normal.
// Compartido entre servidor (chat de la sala, fila de manos) y cliente (audio y video).

import { CATALOG, objSize } from './catalog.js';

export const STAGE_RADIUS = 25;

const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function smallestArea(areas, x, y) {
  let best = null;
  for (const a of areas || []) if (inRect(a, x, y) && (!best || a.w * a.h < best.w * best.h)) best = a;
  return best;
}

// Escenarios del piso (en caché por lista de objetos y de áreas: se recalcula al editar)
const cache = new WeakMap();
export function floorStages(f) {
  if (!f?.objects) return [];
  const hit = cache.get(f.objects);
  if (hit && hit.areas === f.areas) return hit.stages;
  const stages = [];
  for (const o of f.objects) {
    if (!CATALOG[o.type]?.stage) continue;
    const { w, h } = objSize(o);
    const rect = { x: Math.floor(o.x), y: Math.floor(o.y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
    // El área del escenario es la de su borde de enfrente (puede asomarse a un pasillo)
    const cx = rect.x + Math.floor(rect.w / 2), cy = rect.y + rect.h - 1;
    const area = smallestArea(f.areas, cx, cy);
    stages.push({ id: o.id ?? `${o.type}@${o.x},${o.y}`, obj: o, rect, cx, cy, area, key: null });
  }
  // Varios escenarios en la misma área comparten fila de manos (la clave es el área)
  for (const s of stages) s.key = s.area ? `area:${s.area.id ?? s.area.key}` : `stage:${s.id}`;
  cache.set(f.objects, { areas: f.areas, stages });
  return stages;
}

// Escenario sobre el que está parada la persona (o null)
export function stageAt(f, x, y) {
  for (const s of floorStages(f)) if (inRect(s.rect, x, y)) return s;
  return null;
}

// ¿La casilla (x, y) está dentro del alcance del escenario?
export function inStageScope(f, s, x, y) {
  if (inRect(s.rect, x, y)) return true;
  const a = smallestArea(f.areas, x, y);
  if (s.area) return !!a && (a === s.area || (a.id != null && a.id === s.area.id));
  if (a && (a.private || a.closed)) return false;
  return Math.max(Math.abs(x - s.cx), Math.abs(y - s.cy)) <= STAGE_RADIUS;
}

// Escenario cuyo alcance incluye la casilla (para el botón "Levantar la mano")
export function stageScopeAt(f, x, y) {
  const all = floorStages(f);
  if (!all.length) return null;
  for (const s of all) if (inRect(s.rect, x, y)) return s;
  for (const s of all) if (inStageScope(f, s, x, y)) return s;
  return null;
}

// Regla extra de "quién oye a quién": un ponente y su público se oyen (en los dos sentidos)
export function stageLink(f, a, b) {
  const all = floorStages(f);
  if (!all.length) return false;
  const sa = stageAt(f, a.x, a.y);
  if (sa && inStageScope(f, sa, b.x, b.y)) return true;
  const sb = stageAt(f, b.x, b.y);
  return !!sb && inStageScope(f, sb, a.x, a.y);
}

// Casilla libre arriba del escenario para quien recibe la palabra
export function guestSpot(f, s, taken = []) {
  const busy = new Set(taken.map((p) => `${p.x},${p.y}`));
  const { x, y, w, h } = s.rect;
  const cells = [];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells.push({ x: i, y: j });
  // Primero la fila de enfrente, cerca del centro
  cells.sort((p, q) => (q.y - p.y) || (Math.abs(p.x - s.cx) - Math.abs(q.x - s.cx)));
  const ok = (p) => !f.solid?.[p.y]?.[p.x];
  // Mejor con un espacio de por medio para que no se encimen los nombres
  const roomy = (p) => !taken.some((q) => Math.abs(q.x - p.x) <= 1 && Math.abs(q.y - p.y) <= 1);
  return cells.find((p) => ok(p) && roomy(p)) || cells.find((p) => ok(p) && !busy.has(`${p.x},${p.y}`)) || cells.find(ok) || { x: s.cx, y: s.cy };
}
