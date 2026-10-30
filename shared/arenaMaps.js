// Mapas de "Arena HUB". Dos arenas hechas a mano con temática de oficina (simétricas para que
// ningún lado tenga ventaja) y "La Oficina", que se arma con el piso real alrededor de la sala de juegos.
//
// Cada arena se dibuja con un "pincel" de caracteres y luego se refleja de izquierda a derecha:
//   #  muro             g  cristal          .  piso
//   S  anaquel alto     X  cajas apiladas (altas: tapan)    x  caja (baja: tapa agachado)
//   =  pretil (bajo)    T  tinaco (alto)    U  clima (alto) v  ventila (bajo)    d  mesa de empaque (baja)
//   A / B  aparecer equipo Rosa / Azul       s  aparecer (todos contra todos)
//   H  dona (vida)      R  chaleco          M  munición     L  botín (Último en pie)
// Los recogibles y lugares de aparecer no estorban: se guardan aparte y la casilla queda como piso.
import { CELL, buildLevel, floodReach } from './zombies.js';
import { CATALOG, objSize } from './catalog.js';
import { arenaRay } from './arena.js';

const TALL_CH = new Set(['S', 'X', 'T', 'U']);
const LOW_CH = new Set(['x', '=', 'v', 'd']);
const MARKS = { A: 'spawnA', B: 'spawnB', s: 'spawn', H: 'health', R: 'armor', M: 'ammo', L: 'loot' };
// Muebles del catálogo que tapan de pie (las balas no pasan por encima)
export const TALL_TYPES = new Set(['bookshelf', 'shelf', 'cabinet', 'vending', 'fridge', 'serverRack', 'trophyCase', 'arcade', 'zombieArcade', 'kartArcade', 'arenaArcade', 'jukebox', 'tallPlant', 'tree2', 'robotArm', 'aquarium', 'hotelElevator', 'logoTotem', 'photocall', 'plantShelf', 'coatRack']);

class Brush {
  constructor(W, H, tile = 'concrete') {
    this.W = W; this.H = H;
    this.c = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')));
    this.t = Array.from({ length: H }, () => Array(W).fill(tile));
    this.signs = [];
  }
  put(ch, x, y, w = 1, h = 1) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < this.W && j < this.H) this.c[j][i] = ch; return this; }
  tile(t, x, y, w = 1, h = 1) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < this.W && j < this.H) this.t[j][i] = t; return this; }
  sign(text, x, y, w = 4) { this.signs.push({ text, x, y, w }); return this; }
  // Copia la mitad izquierda a la derecha (A <-> B)
  mirror() {
    const W = this.W;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < W >> 1; x++) {
      const ch = this.c[y][x];
      this.c[y][W - 1 - x] = ch === 'A' ? 'B' : ch === 'B' ? 'A' : ch;
      this.t[y][W - 1 - x] = this.t[y][x];
    }
    for (const s of [...this.signs]) if (s.x < W / 2 - 1) this.signs.push({ ...s, x: W - s.x });
    return this;
  }
  rows() { return this.c.map((r) => r.join('')); }
}

// ---------- Bodega de Papelería ----------
// Tres carriles: el muelle de carga (arriba, cajas bajas), los pasillos de anaqueles (en medio) y la
// oficina de la bodega (abajo, mesas de empaque y cristales). Cada equipo sale de su zona de carga.
function bodega() {
  const b = new Brush(46, 30, 'concrete');
  // zonas de piso
  b.tile('slate', 1, 1, 22, 7).tile('concrete', 1, 9, 22, 12).tile('blue', 8, 22, 15, 7).tile('tile', 1, 1, 5, 28);
  // zona de salida (izquierda): paredes que dejan tres bocas
  b.put('#', 6, 1, 1, 3).put('#', 6, 6, 1, 6).put('#', 6, 18, 1, 6).put('#', 6, 26, 1, 3);
  b.put('A', 2, 3).put('A', 3, 9).put('A', 2, 14).put('A', 3, 20).put('A', 2, 26).put('A', 4, 12).put('A', 4, 17);
  b.put('M', 4, 6).put('H', 4, 23);
  // separaciones entre carriles (con huecos para cruzar)
  b.put('#', 7, 8, 4, 1).put('#', 13, 8, 4, 1).put('#', 19, 8, 3, 1);
  b.put('#', 7, 21, 4, 1).put('#', 13, 21, 4, 1).put('#', 19, 21, 3, 1);
  // muelle de carga: cajas bajas y una pila alta
  b.put('x', 9, 3, 2, 1).put('x', 14, 5, 1, 2).put('X', 17, 2, 2, 2).put('x', 21, 5, 2, 1).put('x', 11, 6);
  b.put('s', 8, 2).put('s', 15, 3).put('L', 12, 2).put('L', 20, 3).put('R', 21, 2);
  b.sign('MUELLE DE CARGA', 14, 1.2, 5);
  // pasillos de anaqueles
  for (const y of [10, 13, 16, 19]) b.put('S', 9, y, 6, 1);
  b.put('x', 17, 11).put('x', 18, 17).put('X', 20, 14, 2, 2);
  b.put('s', 16, 9).put('s', 16, 20).put('s', 8, 14).put('L', 12, 11).put('L', 12, 17).put('L', 19, 12).put('M', 12, 14);
  b.sign('PASILLOS', 12, 9.2, 4);
  // oficina de la bodega: cristales y mesas de empaque
  b.put('g', 8, 23, 4, 1).put('g', 14, 23, 3, 1).put('g', 16, 24, 1, 2);
  b.put('d', 9, 25, 3, 1).put('d', 13, 27, 2, 1).put('x', 19, 26, 1, 1).put('X', 21, 23, 1, 1);
  b.put('s', 8, 27).put('s', 18, 23).put('L', 10, 27).put('L', 20, 24).put('H', 21, 27);
  b.sign('EMPAQUE', 12, 22.2, 4);
  return b.mirror();
}

// ---------- Azotea HUB ----------
// Al aire libre, de noche, con la ciudad abajo. La caseta de escaleras al centro, climas y tinacos
// para cubrirse y un helipuerto abierto en cada orilla.
function azotea() {
  const b = new Brush(44, 34, 'concrete');
  for (let y = 0; y < b.H; y++) for (let x = 0; x < b.W; x++) if (x === 0 || y === 0 || x === b.W - 1 || y === b.H - 1) b.c[y][x] = '=';
  b.tile('slate', 1, 1, 21, 32).tile('concrete', 14, 10, 8, 14).tile('hex', 2, 12, 8, 10);
  // helipuerto (salida del equipo) y sus marcas
  b.put('A', 4, 14).put('A', 6, 17).put('A', 4, 20).put('A', 7, 13).put('A', 7, 21).put('A', 3, 17);
  b.put('v', 9, 11).put('v', 9, 23);
  // climas (altos) y ventilas (bajas)
  b.put('U', 4, 3, 3, 2).put('U', 4, 29, 3, 2).put('v', 10, 6, 2, 1).put('v', 10, 27, 2, 1);
  b.put('T', 15, 3, 2, 2).put('T', 15, 29, 2, 2).put('x', 19, 6).put('x', 19, 27);
  b.put('U', 12, 15, 1, 4).put('x', 12, 12).put('x', 12, 21);
  // caseta de escaleras (centro) con puertas
  b.put('#', 18, 12, 4, 1).put('#', 18, 21, 4, 1).put('#', 18, 13, 1, 2).put('#', 18, 19, 1, 2);
  b.put('X', 21, 16, 1, 2);
  b.put('s', 3, 6).put('s', 3, 27).put('s', 12, 9).put('s', 12, 24).put('s', 20, 2).put('s', 20, 31).put('s', 16, 17);
  b.put('H', 13, 2).put('H', 13, 31).put('R', 20, 14).put('M', 8, 8).put('M', 8, 26);
  b.put('L', 6, 6).put('L', 6, 27).put('L', 17, 8).put('L', 17, 25).put('L', 10, 17).put('L', 20, 19).put('L', 2, 10).put('L', 2, 24);
  b.sign('CASETA', 22, 11.4, 3);
  return b.mirror();
}

export const ARENA_MAPS = {
  bodega: { id: 'bodega', name: 'Bodega de Papelería', short: 'Bodega', desc: 'Tres carriles: muelle, anaqueles y empaque. Buena para todos los modos.', brush: bodega, sky: false, size: '46×30' },
  azotea: { id: 'azotea', name: 'Azotea HUB', short: 'Azotea', desc: 'De noche y al aire libre. Líneas largas para el láser y climas para cubrirse.', brush: azotea, sky: true, size: '44×34' },
  oficina: { id: 'oficina', name: 'La Oficina', short: 'Oficina', desc: 'El piso real alrededor de la sala de juegos: tus escritorios, tus salas.', office: true, size: 'real' },
};
export const MAP_IDS = Object.keys(ARENA_MAPS);

// Piso "de mentiras" (como composeFloor) para que el 3D de Zombies lo dibuje igual que la oficina
export function arenaFloor(id) {
  const def = ARENA_MAPS[id];
  if (!def?.brush) return null;
  const b = def.brush();
  const rows = b.rows();
  const W = b.W, H = b.H;
  const walls = rows.map((r) => [...r].map((ch) => (ch === '#' ? true : ch === 'g' ? 'glass' : false)));
  const solid = rows.map((r) => [...r].map((ch) => ch === '#' || ch === 'g' || TALL_CH.has(ch) || LOW_CH.has(ch)));
  const floor = b.t.map((r) => r.slice());
  return { template: `arena-${id}`, W, H, spawn: { x: 3, y: H >> 1 }, floor, walls, solid, areas: [], objects: [], desks: [], decals: [], rows, signs: b.signs };
}

// Bloques conectados de un mismo carácter (tinacos, climas, pilas de cajas): su rectángulo
function blocks(rows, ch) {
  const H = rows.length, W = rows[0].length, seen = new Set(), out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (rows[y][x] !== ch || seen.has(y * W + x)) continue;
    let x0 = x, x1 = x, y0 = y, y1 = y;
    const q = [[x, y]]; seen.add(y * W + x);
    while (q.length) {
      const [i, j] = q.pop();
      x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + dx, b = j + dy;
        if (a < 0 || b < 0 || a >= W || b >= H || rows[b][a] !== ch || seen.has(b * W + a)) continue;
        seen.add(b * W + a); q.push([a, b]);
      }
    }
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}
// Corridas horizontales de un mismo carácter (para dibujar anaqueles largos de una pieza)
function runs(rows, ch) {
  const out = [];
  rows.forEach((r, y) => {
    let x = 0;
    while (x < r.length) {
      if (r[x] !== ch) { x++; continue; }
      let e = x;
      while (e < r.length && r[e] === ch) e++;
      out.push({ x, y, w: e - x });
      x = e;
    }
  });
  return out;
}
const PROP_OF = { S: 'arenaRack', X: 'arenaStack', x: 'arenaCrate', '=': 'arenaParapet', T: 'arenaTank', U: 'arenaAC', v: 'arenaVent', d: 'arenaTable' };

// Nivel de una arena hecha a mano (mismo formato que buildLevel de Zombies, con más datos)
export function arenaLevel(id) {
  const f = arenaFloor(id);
  if (!f) return null;
  const { W, H, rows } = f;
  const grid = new Uint8Array(W * H), tall = new Uint8Array(W * H);
  const marks = { spawnA: [], spawnB: [], spawn: [], health: [], armor: [], ammo: [], loot: [] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y][x];
    const i = y * W + x;
    if (ch === '#') grid[i] = CELL.WALL;
    else if (ch === 'g') grid[i] = CELL.GLASS;
    else if (TALL_CH.has(ch)) { grid[i] = CELL.SOLID; tall[i] = 1; }
    else if (LOW_CH.has(ch)) grid[i] = CELL.SOLID;
    else grid[i] = CELL.EMPTY;
    if (MARKS[ch]) marks[MARKS[ch]].push({ x: x + 0.5, y: y + 0.5 });
  }
  // muebles de la arena (se dibujan con los modelos de client/src/games/arena/props.js)
  const objects = [];
  let oid = -1;
  for (const [ch, type] of Object.entries(PROP_OF)) {
    const list = ch === 'S' || ch === '=' || ch === 'd' ? runs(rows, ch) : 'TUX'.includes(ch) ? blocks(rows, ch) : runs(rows, ch).flatMap((r) => Array.from({ length: r.w }, (_, k) => ({ x: r.x + k, y: r.y, w: 1 })));
    for (const r of list) objects.push({ id: oid--, type, x: r.x, y: r.y, w: r.w, h: r.h || 1, rot: 0, color: '#9aa3ad', solid: true, under: false, decor: false });
  }
  const start = marks.spawnA[0] || { x: 3, y: H / 2 };
  const level = {
    W, H, ox: 0, oy: 0, grid, tall, start, startA: 0, portals: [], doors: [], objects, rises: [], area: ARENA_MAPS[id].name, template: f.template,
    signs: f.signs.map((s) => ({ text: s.text, x: s.x, y: s.y, w: s.w })),
    sky: !!ARENA_MAPS[id].sky, map: id,
  };
  return finishLevel(level, marks);
}

// "La Oficina": el piso real recortado (como en Zombies), sin salidas, con muebles altos que tapan
// y lugares para aparecer y recogibles repartidos solos.
export function officeArenaLevel(floor, focus) {
  const L = buildLevel(floor, focus, { maxW: 48, maxH: 32 });
  for (let i = 0; i < L.grid.length; i++) if (L.grid[i] === CELL.PORTAL) L.grid[i] = CELL.WALL;
  L.portals = [];
  L.rises = [];
  L.tall = new Uint8Array(L.W * L.H);
  for (const o of L.objects) {
    if (!TALL_TYPES.has(o.type) || !o.solid) continue;
    for (let j = Math.floor(o.y); j < Math.ceil(o.y + o.h); j++) for (let i = Math.floor(o.x); i < Math.ceil(o.x + o.w); i++) {
      if (i >= 0 && j >= 0 && i < L.W && j < L.H && L.grid[j * L.W + i] === CELL.SOLID) L.tall[j * L.W + i] = 1;
    }
  }
  L.map = 'oficina';
  L.area = 'La Oficina';
  const marks = { spawnA: [], spawnB: [], spawn: [], health: [], armor: [], ammo: [], loot: [] };
  return finishLevel(L, marks);
}

// Casillas abiertas (con aire alrededor) alcanzables desde el inicio
function openCells(L, pad = 1) {
  const st = { x: Math.floor(L.start.x), y: Math.floor(L.start.y) };
  const reach = floodReach(L.grid, L.W, L.H, st);
  const out = [];
  for (let y = pad; y < L.H - pad; y++) for (let x = pad; x < L.W - pad; x++) {
    if (!reach[y * L.W + x]) continue;
    let ok = true;
    for (let dy = -pad; dy <= pad && ok; dy++) for (let dx = -pad; dx <= pad && ok; dx++) if (L.grid[(y + dy) * L.W + x + dx] !== CELL.EMPTY) ok = false;
    if (ok) out.push({ x: x + 0.5, y: y + 0.5 });
  }
  return { cells: out, reach };
}
// Elige n lugares lo más separados posible (muestreo del punto más lejano), lejos también de `avoid`
export function spread(cands, n, avoid = [], seed = 7) {
  if (!cands.length) return [];
  const out = [];
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const pool = cands.slice();
  const dmin = (p, list) => list.reduce((m, q) => Math.min(m, Math.hypot(p.x - q.x, p.y - q.y)), Infinity);
  if (!avoid.length) out.push(pool.splice((rnd() * pool.length) | 0, 1)[0]);
  while (out.length < n && pool.length) {
    let best = -1, bv = -1;
    for (let i = 0; i < pool.length; i++) { const v = Math.min(dmin(pool[i], out), dmin(pool[i], avoid)) + rnd() * 0.3; if (v > bv) { bv = v; best = i; } }
    out.push(pool.splice(best, 1)[0]);
  }
  return out;
}

// El ángulo con la vista más larga desde p, un poco cargado hacia el centro del mapa
export function lookOut(L, p) {
  const toC = Math.atan2(L.H / 2 - p.y, L.W / 2 - p.x);
  let best = toC, bv = -1;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const free = Math.min(14, arenaRay(L, p.x, p.y, a, 14).t);
    const v = free + 3 * Math.cos(a - toC);
    if (v > bv) { bv = v; best = a; }
  }
  return best;
}

function finishLevel(L, marks) {
  const { cells, reach } = openCells(L, 1);
  const okCell = (p) => reach[Math.floor(p.y) * L.W + Math.floor(p.x)] && L.grid[Math.floor(p.y) * L.W + Math.floor(p.x)] === CELL.EMPTY;
  for (const k of Object.keys(marks)) marks[k] = marks[k].filter(okCell);
  // lugares para aparecer: los marcados, o repartidos solos (mitad izquierda = Rosa, derecha = Azul)
  let spawns = [...marks.spawn.map((p) => ({ ...p, team: null })), ...marks.spawnA.map((p) => ({ ...p, team: 0 })), ...marks.spawnB.map((p) => ({ ...p, team: 1 }))];
  if (spawns.length < 8) {
    const auto = spread(cells, 18, spawns, 11);
    spawns.push(...auto.map((p) => ({ ...p, team: null })));
    // los de cada orilla son de un equipo
    const byX = [...spawns].sort((a, b) => a.x - b.x);
    const k = Math.max(3, Math.floor(byX.length / 4));
    byX.slice(0, k).forEach((p) => { if (p.team == null) p.team = 0; });
    byX.slice(-k).forEach((p) => { if (p.team == null) p.team = 1; });
  }
  // mirando hacia donde hay más espacio (de preferencia, hacia el centro del mapa): nunca a la pared
  for (const s of spawns) s.a = lookOut(L, s);
  const used = [...spawns];
  const pick = (list, n) => { if (list.length) return list; const got = spread(cells, n, used, 23 + n); used.push(...got); return got; };
  const pickups = [
    ...pick(marks.health, 2).map((p) => ({ ...p, kind: 'health' })),
    ...pick(marks.armor, 2).map((p) => ({ ...p, kind: 'armor' })),
    ...pick(marks.ammo, 2).map((p) => ({ ...p, kind: 'ammo' })),
  ];
  const loot = marks.loot.length >= 10 ? [...marks.loot, ...pickups.map((p) => ({ x: p.x, y: p.y }))] : spread(cells, 26, [], 31);
  L.spawns = spawns;
  L.pickups = pickups;
  L.loot = loot;
  L.open = cells;
  L.start = spawns.find((s) => s.team === 0) || spawns[0] || L.start;
  L.startA = L.start.a ?? 0;
  return L;
}

// Para las pruebas y el menú: casillas con muebles del catálogo que tapan de pie
export function isTallObject(o) { return TALL_TYPES.has(o.type) && !!CATALOG[o.type]?.solid && objSize(o).w > 0; }
