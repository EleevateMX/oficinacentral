// Hotel: lógica de una sala (alturas, dónde se puede pararse, A*, validar dónde va un furni).
// Funciones puras: las usa el servidor (autoridad) y el cliente (vista previa al colocar).
import { parseModel, ROOM_MODELS, MAX_STEP, WALL_H } from './hotel.js';
import { FURNI_BY_ID, footprint } from './hotelCatalog.js';

// Hacia dónde ve cada rotación de furni en la cuadrícula (rot 0 → +y, 2 → −x, 4 → −y, 6 → +x),
// coherente con ROT_DIR (0 'down', 2 'left', 4 'up', 6 'right').
export const ROT_VEC = { 0: [0, 1], 2: [-1, 0], 4: [0, -1], 6: [1, 0] };

// Dirección de sprite (como se ve en pantalla) para un paso (dx, dy) en la cuadrícula
export function dirOf(dx, dy) {
  const sx = (dx - dy) * 2, sy = dx + dy; // vector en pantalla (proporción 2:1)
  if (!sx && !sy) return null;
  const a = Math.atan2(sy, sx) * 180 / Math.PI;
  if (a > -13.3 && a <= 58.3) return 'right'; // +x (abajo-derecha) y derecha
  if (a > 58.3 && a <= 166.7) return 'down'; // abajo y +y (abajo-izquierda)
  if (a > -121.7 && a <= -13.3) return 'up'; // arriba y −y (arriba-derecha)
  return 'left'; // izquierda y −x (arriba-izquierda)
}

export const MAX_STACK_Z = 30; // altura máxima a la que se puede apilar

// Bandera de cada furni: qué pasa al pararse encima
export function furniKind(def, item) {
  if (!def) return 'block';
  if (def.walk) return 'walk';
  if (def.interact === 'gate') return item?.state === 1 ? 'walk' : 'block';
  if (def.sit) return 'sit';
  if (def.lay) return 'lay';
  if (def.interact === 'teleport') return 'teleport';
  return 'block';
}

const stackable = (def, item) => !!(def && (def.stack || def.walk || (def.interact === 'gate' && item?.state === 1)));

// Arma la sala: alturas del modelo + furnis por casilla (ordenados de abajo hacia arriba)
export function buildRoom(model, items = []) {
  const { W, H, heights } = parseModel(model);
  const door = (ROOM_MODELS[model] || ROOM_MODELS.a).door;
  const tiles = Array.from({ length: H }, () => Array.from({ length: W }, () => []));
  for (const it of items) addToTiles({ W, H, tiles }, it);
  return { model, W, H, heights, door, tiles };
}

function addToTiles(room, it) {
  const def = FURNI_BY_ID[it.type];
  if (!def || def.kind !== 'floor' || it.x == null || it.wall) return;
  const { w, l } = footprint(def, it.rot);
  for (let j = it.y; j < it.y + l; j++) for (let i = it.x; i < it.x + w; i++) {
    const list = room.tiles[j]?.[i];
    if (!list) continue;
    list.push(it);
    list.sort((a, b) => a.z - b.z || (FURNI_BY_ID[a.type]?.h || 0) - (FURNI_BY_ID[b.type]?.h || 0));
  }
}

export function roomAddItem(room, it) { addToTiles(room, it); }
export function roomRemoveItem(room, it) {
  for (const row of room.tiles) for (const list of row) {
    const k = list.findIndex((q) => q.id === it.id);
    if (k >= 0) list.splice(k, 1);
  }
}

export const floorAt = (room, x, y) => {
  const h = room.heights[y]?.[x];
  return h === undefined ? NaN : h;
};

// Qué hay en una casilla para caminar: { kind, z, item } (null = vacío)
//   kind: 'floor' | 'walk' (se pasa) · 'sit' | 'lay' | 'teleport' (solo para terminar ahí) · 'block'
export function tileInfo(room, x, y) {
  const f = floorAt(room, x, y);
  if (Number.isNaN(f)) return null;
  const list = room.tiles[y][x];
  if (!list.length) return { kind: 'floor', z: f, item: null };
  const top = list[list.length - 1];
  const def = FURNI_BY_ID[top.type];
  const kind = furniKind(def, top);
  if (kind === 'walk') return { kind, z: def.walk ? top.z + def.h : top.z, item: top };
  if (kind === 'sit') return { kind, z: top.z + def.sit, item: top };
  if (kind === 'lay') return { kind, z: top.z + def.h, item: top };
  if (kind === 'teleport') return { kind, z: top.z, item: top };
  return { kind: 'block', z: top.z + (def?.h || 1), item: top };
}

const PASS = new Set(['floor', 'walk']);
const DEST = new Set(['floor', 'walk', 'sit', 'lay', 'teleport']);
export const isDestKind = (k) => DEST.has(k);

// A* con 8 direcciones, sin cortar esquinas. occupied: Set de "x,y" donde no se puede terminar.
// Devuelve [[x, y, z], …] sin incluir la casilla de salida, o null si no hay camino.
export function findPath(room, from, to, { occupied = new Set(), maxNodes = 6000 } = {}) {
  const { W, H } = room;
  const dest = tileInfo(room, to.x, to.y);
  if (!dest || !DEST.has(dest.kind)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  if (occupied.has(`${to.x},${to.y}`)) return null;
  const idx = (x, y) => y * W + x;
  const startInfo = tileInfo(room, from.x, from.y);
  const startZ = from.z ?? startInfo?.z ?? 0;
  const g = new Map([[idx(from.x, from.y), 0]]);
  const prev = new Map();
  const zOf = new Map([[idx(from.x, from.y), startZ]]);
  const h = (x, y) => { const dx = Math.abs(x - to.x), dy = Math.abs(y - to.y); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
  // Montículo binario simple
  const heap = [];
  const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a].f < heap[m].f) m = a; if (b < heap.length && heap[b].f < heap[m].f) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
    return top;
  };
  push({ x: from.x, y: from.y, f: h(from.x, from.y) });
  const closed = new Set();
  let n = 0;
  const passInfo = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const t = tileInfo(room, x, y);
    if (!t) return null;
    if (x === to.x && y === to.y) return DEST.has(t.kind) ? t : null;
    return PASS.has(t.kind) ? t : null;
  };
  while (heap.length && n++ < maxNodes) {
    const cur = pop();
    const ci = idx(cur.x, cur.y);
    if (closed.has(ci)) continue;
    closed.add(ci);
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      let k = ci;
      while (k !== idx(from.x, from.y)) { const x = k % W, y = (k - x) / W; path.push([x, y, zOf.get(k)]); k = prev.get(k); }
      return path.reverse();
    }
    const cz = zOf.get(ci);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cur.x + dx, ny = cur.y + dy;
      const t = passInfo(nx, ny);
      if (!t || Math.abs(t.z - cz) > MAX_STEP) continue;
      if (dx && dy) {
        // Diagonal: las dos casillas de al lado tienen que estar libres (no se corta esquina)
        const a = passInfo(cur.x + dx, cur.y), b = passInfo(cur.x, cur.y + dy);
        const okA = a && PASS.has(a.kind), okB = b && PASS.has(b.kind);
        if (!okA || !okB) continue;
      }
      const ni = idx(nx, ny);
      if (closed.has(ni)) continue;
      const ng = g.get(ci) + (dx && dy ? 1.41 : 1);
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng); prev.set(ni, ci); zOf.set(ni, t.z);
        push({ x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}

// ¿Se puede poner este furni aquí? → { ok, z, reason }
//   users: [{x, y}] personas paradas (no se pone un furni sólido encima de alguien)
export function canPlace(room, def, x, y, rot, { ignoreId = null, users = [] } = {}) {
  if (!def || def.kind !== 'floor') return { ok: false, reason: 'Ese furni no va en el piso' };
  if (!def.rots.includes(rot)) return { ok: false, reason: 'No se puede girar así' };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: 'Posición inválida' };
  const { w, l } = footprint(def, rot);
  let base = null;
  let z = -Infinity;
  for (let j = y; j < y + l; j++) for (let i = x; i < x + w; i++) {
    const f = floorAt(room, i, j);
    if (Number.isNaN(f)) return { ok: false, reason: 'Fuera de la sala' };
    if (i === room.door.x && j === room.door.y) return { ok: false, reason: 'No tapes la puerta' };
    if (base === null) base = f;
    else if (base !== f) return { ok: false, reason: 'El piso no está parejo' };
    z = Math.max(z, f);
    for (const it of room.tiles[j][i]) {
      if (it.id === ignoreId) continue;
      const d = FURNI_BY_ID[it.type];
      if (!stackable(d, it)) return { ok: false, reason: 'No se puede poner encima de eso' };
      z = Math.max(z, it.z + (d?.h || 0));
    }
  }
  const soft = def.walk || def.sit || def.lay;
  if (!soft && users.some((u) => u.x >= x && u.x < x + w && u.y >= y && u.y < y + l)) return { ok: false, reason: 'Hay alguien ahí' };
  z = Math.round(z * 100) / 100;
  if (z + def.h > MAX_STACK_Z) return { ok: false, reason: 'Está demasiado alto' };
  return { ok: true, z };
}

// Paredes: la izquierda corre por x = 1 (a lo largo de +y) y la derecha por y = 1 (a lo largo de +x).
export function wallTiles(room, wall) {
  const out = [];
  if (wall === 'l') { for (let y = 1; y < room.H; y++) if (!Number.isNaN(floorAt(room, 1, y))) out.push(y); }
  else for (let x = 1; x < room.W; x++) if (!Number.isNaN(floorAt(room, x, 1))) out.push(x);
  return out;
}
export const WALL_ITEM_MAX_H = WALL_H - 1.6;

export function canPlaceWall(room, def, wall, pos, h) {
  if (!def || def.kind !== 'wall') return { ok: false, reason: 'Ese furni no va en la pared' };
  if (wall !== 'l' && wall !== 'r') return { ok: false, reason: 'Pared inválida' };
  if (!Number.isInteger(pos)) return { ok: false, reason: 'Posición inválida' };
  if (typeof h !== 'number' || !Number.isFinite(h) || h < 0 || h > WALL_ITEM_MAX_H) return { ok: false, reason: 'Altura inválida' };
  const tiles = new Set(wallTiles(room, wall));
  for (let k = pos; k < pos + def.w; k++) {
    if (!tiles.has(k)) return { ok: false, reason: 'Fuera de la pared' };
    if (wall === 'l' && k === room.door.y) return { ok: false, reason: 'Ahí está la puerta' };
  }
  return { ok: true };
}

// Altura del piso donde arranca cada tramo de pared (para dibujar y para la altura de los cuadros)
export function wallBase(room, wall, pos) {
  return wall === 'l' ? floorAt(room, 1, pos) : floorAt(room, pos, 1);
}

export function maxFloorHeight(room) {
  let m = 0;
  for (const r of room.heights) for (const h of r) if (!Number.isNaN(h) && h > m) m = h;
  return m;
}
