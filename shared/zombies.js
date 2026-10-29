// "Zombies en la oficina": reglas puras del juego (sin navegador ni three.js).
// Las usan el cliente (simulación del anfitrión y dibujo) y las pruebas.
//
// - Hordas: cada horda trae más zombis y más rápidos; cada 5 hordas sale un jefe.
// - Nivel: se arma con el piso real de la oficina (muros, objetos que estorban, puertas
//   y nombres de las salas), recortado alrededor de la sala de juegos.

import { CATALOG, objSize } from './catalog.js';

// Metros por casilla del mapa (la simulación trabaja en casillas; el dibujo 3D en metros)
export const TILE_M = 1.25;
// Techo alto (antes 2.7 m): los jefes, con los brazos arriba o saltando, no lo atraviesan.
// tests/zombies.test.js revisa que el modelo más alto quepa con margen (CEIL_MARGIN).
export const WALL_H = 5.4; // altura de los muros y del techo (m): el doble de antes
export const CEIL_MARGIN = 0.3; // espacio mínimo libre entre lo más alto de un jefe y el techo (m)
export const EYE_H = 1.6; // altura de los ojos (m)
export const PLAYER_R = 0.26; // radio del jugador (casillas)

// ---------- Zombis ----------
// speed en casillas por segundo; dmg por golpe; r = radio (casillas); h = altura (m)
export const ZOMBIE_TYPES = {
  normal: { name: 'Godín zombi', hp: 60, speed: 1.35, dmg: 10, r: 0.27, h: 1.8, pts: 60, scale: 1 },
  runner: { name: 'Becario veloz', hp: 38, speed: 2.7, dmg: 7, r: 0.24, h: 1.7, pts: 80, scale: 0.92 },
  tank: { name: 'Contador blindado', hp: 280, speed: 0.9, dmg: 22, r: 0.4, h: 2.15, pts: 220, scale: 1.3 },
  spitter: { name: 'Escupe-café', hp: 75, speed: 1.15, dmg: 8, r: 0.28, h: 1.75, pts: 130, scale: 1.05, ranged: { range: 7, every: 2.6, speed: 6, dmg: 12 } },
};
export const ZOMBIE_TYPE_IDS = Object.keys(ZOMBIE_TYPES);

// ---------- Jefes ----------
export const BOSSES = {
  gerente: {
    name: 'El Gerente Regional', title: '¡Junta de emergencia!', hp: 2600, speed: 1.25, dmg: 26, r: 0.6, h: 3.1, pts: 2500,
    // embiste en línea recta y llama refuerzos
    attacks: ['charge', 'summon'],
  },
  impresora: {
    name: 'La Impresora Poseída', title: 'Atasco de papel…', hp: 2300, speed: 0.8, dmg: 20, r: 0.7, h: 2.4, pts: 2500,
    // ráfagas de hojas y un anillo de papel
    attacks: ['volley', 'ring'],
  },
  becario: {
    name: 'El Becario Gigante', title: '¿Le traigo su café?', hp: 3200, speed: 1.05, dmg: 30, r: 0.75, h: 3.6, pts: 3000,
    // azota el piso (onda) y avienta cafés
    attacks: ['slam', 'toss'],
  },
};
export const BOSS_ORDER = ['gerente', 'impresora', 'becario'];
export const BOSS_MAX_H = Math.max(...Object.values(BOSSES).map((b) => b.h)); // el jefe más alto (de pie)

export const isBossWave = (n) => n > 0 && n % 5 === 0;

// Jefe de una horda (o null). Se repiten en orden y cada vuelta tienen más vida.
export function bossForWave(n) {
  if (!isBossWave(n)) return null;
  const k = n / 5 - 1;
  const id = BOSS_ORDER[k % BOSS_ORDER.length];
  const lap = Math.floor(k / BOSS_ORDER.length);
  return { id, ...BOSSES[id], hp: Math.round(BOSSES[id].hp * (1 + lap * 0.6)), lap };
}

// Qué trae la horda n (1, 2, 3…) para `players` jugadores
export function waveSpec(n, players = 1) {
  n = Math.max(1, Math.floor(n));
  const coop = players > 1 ? 1.6 : 1;
  const boss = bossForWave(n);
  let count = Math.floor((5 + 3 * n + 0.15 * n * n) * coop);
  if (boss) count = Math.floor(count * 0.45);
  const runner = n >= 3 ? Math.min(0.3, 0.08 + (n - 3) * 0.025) : 0;
  const spitter = n >= 4 ? Math.min(0.15, 0.05 + (n - 4) * 0.012) : 0;
  const tank = n >= 6 ? Math.min(0.12, 0.04 + (n - 6) * 0.01) : 0;
  const mix = { normal: 1 - runner - spitter - tank, runner, spitter, tank };
  return {
    wave: n,
    count,
    mix,
    speedMul: 1 + Math.min(0.6, (n - 1) * 0.04),
    hpMul: 1 + (n - 1) * 0.12,
    spawnEvery: Math.max(0.35, 1.6 - n * 0.08),
    maxAlive: Math.min(26, 8 + n * 2) + (players > 1 ? 4 : 0),
    boss,
    breakTime: boss ? 25 : 20,
  };
}

// Lista ordenada de tipos para una horda (determinista con la semilla)
export function waveRoster(spec, seed = 1) {
  const out = [];
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < spec.count; i++) {
    const r = rnd();
    let acc = 0, pick = 'normal';
    for (const t of ['tank', 'spitter', 'runner', 'normal']) { acc += spec.mix[t]; if (r < acc) { pick = t; break; } }
    out.push(pick);
  }
  return out;
}

// ---------- Armas ----------
// dmg por bala; every = segundos entre disparos; mag = cargador; reserve = balas extra (Infinity = sin fin)
export const WEAPONS = [
  { id: 'grapadora', name: 'Grapadora', short: 'Grapadora', dmg: 24, every: 0.26, mag: 12, reserve: Infinity, reload: 1.0, spread: 0.012, pellets: 1, auto: false, kick: 0.5 },
  { id: 'cafetera', name: 'Escopeta de café', short: 'Escopeta', dmg: 15, every: 0.85, mag: 6, reserve: 24, reload: 1.6, spread: 0.09, pellets: 8, auto: false, kick: 1.2, cost: 750 },
  { id: 'clavadora', name: 'Clavadora', short: 'Clavadora', dmg: 13, every: 0.085, mag: 40, reserve: 160, reload: 1.8, spread: 0.035, pellets: 1, auto: true, kick: 0.35, cost: 1200 },
];
export const WEAPON_IDS = WEAPONS.map((w) => w.id);

// ---------- Tienda (entre hordas) ----------
export const SHOP = [
  { id: 'ammo', name: 'Caja de grapas', desc: 'Llena las balas de todas tus armas', cost: 300 },
  { id: 'heal', name: 'Dona y café', desc: '+60 de vida', cost: 250 },
  { id: 'armor', name: 'Chaleco reflectante', desc: '+50 de armadura', cost: 400 },
  { id: 'cafetera', name: 'Escopeta de café', desc: 'Escopeta: 8 granos por tiro', cost: 750, weapon: 1 },
  { id: 'clavadora', name: 'Clavadora', desc: 'Automática: muchos clavos', cost: 1200, weapon: 2 },
  { id: 'upgrade', name: 'Grapas de titanio', desc: '+25% de daño (hasta 3)', cost: 1500 },
];
export const upgradeCost = (lvl) => 1500 + lvl * 1000;

// Botín que sueltan los zombis
export const DROPS = { ammo: { name: 'Grapas', chance: 0.09 }, health: { name: 'Dona', chance: 0.06 }, points: { name: 'Bono', chance: 0.05 } };

// ---------- Nivel desde el piso de la oficina ----------
// Celdas del nivel
export const CELL = { EMPTY: 0, WALL: 1, GLASS: 2, SOLID: 3, PORTAL: 4 };
export const blocks = (c) => c !== CELL.EMPTY;

const AREA_NAMES_FOR_GAMES = /juegos/i;

// Busca hacia afuera (±reach) la fila o columna con más muro, para que el recorte coincida con
// las paredes de verdad (y sus puertas queden como salidas de donde vienen los zombis).
function snapEdge(f, from, to, isRow, start, reach) {
  let best = start, bestN = -1, bestK = 0;
  for (let k = -reach; k <= reach; k++) {
    const p = start + k;
    if (isRow ? p < 0 || p >= f.H : p < 0 || p >= f.W) continue;
    let n = 0;
    for (let q = from; q < to; q++) {
      const w = isRow ? f.walls[p]?.[q] : f.walls[q]?.[p];
      if (w === true || w === 'glass') n++;
    }
    if (n > bestN || (n === bestN && Math.abs(k) < Math.abs(bestK))) { bestN = n; best = p; bestK = k; }
  }
  // Solo si de verdad hay un muro largo ahí
  return bestN >= (to - from) * 0.5 ? best : start;
}

// f = piso compuesto (composeFloor); focus = {x,y} (casilla del gabinete)
export function buildLevel(f, focus, { maxW = 46, maxH = 30 } = {}) {
  const fx = Math.floor(focus?.x ?? f.spawn.x), fy = Math.floor(focus?.y ?? f.spawn.y);
  // Área de juegos (o la que contiene el gabinete)
  let area = null;
  for (const a of f.areas || []) if (fx >= a.x && fx < a.x + a.w && fy >= a.y && fy < a.y + a.h && (!area || a.w * a.h < area.w * area.h)) area = a;
  const games = (f.areas || []).find((a) => AREA_NAMES_FOR_GAMES.test(a.name) && fx >= a.x - 2 && fx < a.x + a.w + 2 && fy >= a.y - 2 && fy < a.y + a.h + 2);
  if (games) area = games;
  const base = area || { x: fx - 8, y: fy - 6, w: 16, h: 12 };
  let x0 = Math.max(0, base.x - 6), x1 = Math.min(f.W, base.x + base.w + 6);
  let y0 = Math.max(0, base.y - 4), y1 = Math.min(f.H, base.y + base.h + 13);
  // Pegar los bordes a las paredes cercanas
  y0 = snapEdge(f, x0, x1, true, y0, 4);
  y1 = snapEdge(f, x0, x1, true, y1 - 1, 4) + 1;
  x0 = snapEdge(f, y0, y1, false, x0, 4);
  x1 = snapEdge(f, y0, y1, false, x1 - 1, 4) + 1;
  // Tamaño máximo (centrado en el gabinete)
  if (x1 - x0 > maxW) { x0 = Math.max(0, Math.min(fx - (maxW >> 1), f.W - maxW)); x1 = x0 + maxW; }
  if (y1 - y0 > maxH) { y0 = Math.max(0, Math.min(fy - (maxH >> 1), f.H - maxH)); y1 = y0 + maxH; }
  let L = buildRect(f, x0, y0, x1, y1, fx, fy, area);
  // Recortar lo que sobra (filas y columnas a las que no se llega)
  let bx0 = L.W, by0 = L.H, bx1 = -1, by1 = -1;
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
    const c = L.grid[y * L.W + x];
    if (c !== CELL.EMPTY && c !== CELL.PORTAL) continue;
    bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
  }
  const nx0 = x0 + Math.max(0, bx0 - 1), ny0 = y0 + Math.max(0, by0 - 1), nx1 = x0 + Math.min(L.W, bx1 + 2), ny1 = y0 + Math.min(L.H, by1 + 2);
  if (bx1 >= 0 && (nx0 > x0 || ny0 > y0 || nx1 < x1 || ny1 < y1)) L = buildRect(f, nx0, ny0, nx1, ny1, fx, fy, area);
  return L;
}

function buildRect(f, x0, y0, x1, y1, fx, fy, area) {
  const W = x1 - x0, H = y1 - y0;
  const grid = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const w = f.walls[y + y0][x + x0];
    let c = CELL.EMPTY;
    if (w === true || w === 'water') c = CELL.WALL;
    else if (w === 'glass') c = CELL.GLASS;
    else if (f.solid[y + y0][x + x0]) c = CELL.SOLID;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if (edge && c === CELL.EMPTY) c = CELL.PORTAL; // salida al resto de la oficina: de ahí salen
    else if (edge && c === CELL.SOLID) c = CELL.WALL;
    grid[idx(x, y)] = c;
  }
  // Puertas de la oficina (huecos entre dos muros) dentro del recorte
  const doors = [];
  const tw = (x, y) => { const w = f.walls[y + y0]?.[x + x0]; return w === true || w === 'glass'; };
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (grid[idx(x, y)] !== CELL.EMPTY || tw(x, y)) continue;
    const h = tw(x - 1, y) && !tw(x, y - 1) && !tw(x, y + 1) && (tw(x + 1, y) || tw(x + 2, y) || tw(x + 3, y));
    const v = tw(x, y - 1) && !tw(x - 1, y) && !tw(x + 1, y) && (tw(x, y + 1) || tw(x, y + 2) || tw(x, y + 3));
    if (h || v) doors.push({ x, y, axis: h ? 'h' : 'v' });
  }
  // Punto de partida: junto al gabinete
  let start = nearestOpen(grid, W, H, fx - x0, fy - y0 + 2);
  // Lo que no se alcanza caminando desde el inicio no cuenta
  const reach = floodReach(grid, W, H, start);
  for (let i = 0; i < grid.length; i++) if (grid[i] === CELL.EMPTY && !reach[i]) grid[i] = CELL.SOLID;
  // Portales: solo los que tienen una casilla jugable al lado
  const portals = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[idx(x, y)] !== CELL.PORTAL) continue;
    const ins = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).find(([ix, iy]) => ix >= 0 && iy >= 0 && ix < W && iy < H && grid[idx(ix, iy)] === CELL.EMPTY && reach[idx(ix, iy)]);
    if (ins) portals.push({ x, y, ix: ins[0], iy: ins[1] });
    else grid[idx(x, y)] = CELL.WALL;
  }
  // Muebles y decoración dentro del recorte (coordenadas locales)
  const objects = [];
  for (const o of f.objects || []) {
    const c = CATALOG[o.type];
    if (!c) continue;
    const { w, h } = objSize(o);
    if (o.x + w <= x0 || o.x >= x1 || o.y + h <= y0 || o.y >= y1) continue;
    objects.push({ id: o.id, type: o.type, x: o.x - x0, y: o.y - y0, w, h, rot: o.rot || 0, color: o.color || c.color || null, solid: !!c.solid, under: !!c.under, decor: c.kind === 'decor' });
  }
  // Letreros con el nombre de cada sala
  const signs = [];
  for (const a of f.areas || []) {
    const ax0 = Math.max(a.x, x0), ax1 = Math.min(a.x + a.w, x1), ay0 = Math.max(a.y, y0), ay1 = Math.min(a.y + a.h, y1);
    if (ax1 - ax0 < 3 || ay1 - ay0 < 3) continue;
    signs.push({ text: a.name, x: (ax0 + ax1) / 2 - x0, y: ay0 - y0 + 0.6, w: Math.min(6, Math.max(3, a.name.length * 0.33)) });
  }
  // Lugares donde pueden "salir del piso" (lejos del inicio)
  const rises = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (grid[idx(x, y)] !== CELL.EMPTY) continue;
    if (Math.hypot(x - start.x, y - start.y) < 6) continue;
    rises.push({ x, y });
  }
  return { W, H, ox: x0, oy: y0, grid, start: { x: start.x + 0.5, y: start.y + 0.5 }, startA: Math.atan2(start.y + 0.5 - (fy - y0 + 0.5), start.x + 0.5 - (fx - x0 + 0.5)) || Math.PI / 2, portals, doors, objects, signs, rises, area: area?.name || null, template: f.template };
}

function nearestOpen(grid, W, H, x, y) {
  const ok = (i, j) => i > 0 && j > 0 && i < W - 1 && j < H - 1 && grid[j * W + i] === CELL.EMPTY;
  if (ok(x, y)) return { x, y };
  for (let r = 1; r < Math.max(W, H); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  }
  return { x: W >> 1, y: H >> 1 };
}

export function floodReach(grid, W, H, s) {
  const seen = new Uint8Array(W * H);
  const q = [s.y * W + s.x];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen[j] || grid[j] !== CELL.EMPTY) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}

// Mapa de distancias (BFS desde varias casillas): los zombis bajan por él hacia el jugador más cercano
export function distanceField(level, sources, out) {
  const { W, H, grid } = level;
  const d = out || new Int16Array(W * H);
  d.fill(-1);
  const q = [];
  for (const s of sources) {
    const x = Math.floor(s.x), y = Math.floor(s.y);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (d[i] === 0) continue;
    d[i] = 0; q.push(i);
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (d[j] >= 0) continue;
      const c = grid[j];
      if (c !== CELL.EMPTY && c !== CELL.PORTAL) continue;
      d[j] = d[i] + 1; q.push(j);
    }
  }
  return d;
}

// ¿La casilla bloquea el paso? (los portales solo dejan pasar a los zombis que van saliendo)
export function cellAt(level, x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  if (i < 0 || j < 0 || i >= level.W || j >= level.H) return CELL.WALL;
  return level.grid[j * level.W + i];
}

// Mueve un círculo (x,y,r) por (dx,dy) chocando con las casillas que bloquean. Devuelve {x,y,hit}
export function moveCircle(level, x, y, r, dx, dy, passPortal = false) {
  const solidAt = (i, j) => {
    const c = cellAt(level, i, j);
    return passPortal ? c !== CELL.EMPTY && c !== CELL.PORTAL : c !== CELL.EMPTY;
  };
  let hit = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  // Se acepta un paso si no choca, o si al menos se encaja menos (para poder salir de una esquina)
  const ok = (ox, oy, nx, ny) => { const p = penetration(solidAt, nx, ny, r); return p <= 0 || p < penetration(solidAt, ox, oy, r) - 1e-6; };
  for (let s = 0; s < steps; s++) {
    const nx = x + dx / steps;
    if (ok(x, y, nx, y)) x = nx; else hit = true;
    const ny = y + dy / steps;
    if (ok(x, y, x, ny)) y = ny; else hit = true;
  }
  return { x, y, hit };
}

// Cuánto se encaja un círculo en las casillas que bloquean (0 = nada)
function penetration(solidAt, x, y, r) {
  const i0 = Math.floor(x - r), i1 = Math.floor(x + r), j0 = Math.floor(y - r), j1 = Math.floor(y + r);
  let p = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (!solidAt(i, j)) continue;
    const cx = Math.max(i, Math.min(x, i + 1)), cy = Math.max(j, Math.min(y, j + 1));
    const d = Math.hypot(x - cx, y - cy);
    if (d < r) p = Math.max(p, r - d);
  }
  return p;
}

// Rayo por la cuadrícula (DDA). t = distancia al primer muro (los portales también tapan);
// low = distancia al primer objeto que estorba (tapan solo hasta media altura: se dispara por encima).
export function rayCast(level, x, y, ang, max = 60) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let i = Math.floor(x), j = Math.floor(y);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = Math.abs(1 / (dx || 1e-9)), tdy = Math.abs(1 / (dy || 1e-9));
  let tx = (dx > 0 ? i + 1 - x : x - i) * tdx, ty = (dy > 0 ? j + 1 - y : y - j) * tdy;
  let t = 0, low = Infinity;
  while (t < max) {
    if (tx < ty) { t = tx; tx += tdx; i += sx; } else { t = ty; ty += tdy; j += sy; }
    const c = i < 0 || j < 0 || i >= level.W || j >= level.H ? CELL.WALL : level.grid[j * level.W + i];
    if (c === CELL.WALL || c === CELL.GLASS || c === CELL.PORTAL) return { t, low };
    if (c === CELL.SOLID && low === Infinity) low = t;
  }
  return { t: max, low };
}

// ¿Se ven dos puntos? (por encima de los muebles sí se ve)
export function lineOfSight(level, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  return rayCast(level, ax, ay, Math.atan2(by - ay, bx - ax), d + 0.01).t >= d;
}

// Puntos que da una muerte (con multiplicador de racha)
export function killPoints(type, streak = 0) {
  const base = ZOMBIE_TYPES[type]?.pts ?? BOSSES[type]?.pts ?? 50;
  return Math.round(base * (1 + Math.min(1, streak * 0.05)));
}
