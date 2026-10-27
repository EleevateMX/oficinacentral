// Mapas de la oficina, compartidos entre servidor y cliente.
//
// Un piso se compone de:
//  - una plantilla fija (suelos, muros y puertas)
//  - áreas editables (departamentos, salas, zonas comunes) guardadas en la base de datos
//  - objetos editables (muebles y decoraciones) guardados en la base de datos
// La plantilla también trae áreas y objetos por defecto que se copian a la base
// de datos al crear el piso; a partir de ahí todo se puede mover.

import { CATALOG, objSize } from './catalog.js';

export const TILE = 32;
export const PROXIMITY_RADIUS = 3;

export const AREA_COLORS = [
  { id: 'none', name: 'Sin alfombra' },
  { id: 'carpet', name: 'Gris' },
  { id: 'purple', name: 'Morado' },
  { id: 'lilac', name: 'Lila' },
  { id: 'rose', name: 'Rosa' },
  { id: 'rug', name: 'Azul' },
  { id: 'mint', name: 'Menta' },
  { id: 'sand', name: 'Arena' },
  { id: 'lavender', name: 'Lavanda' },
  { id: 'tile', name: 'Mosaico' },
  { id: 'wood2', name: 'Madera oscura' },
];

function grid(w, h, v) {
  return Array.from({ length: h }, () => Array(w).fill(v));
}

function makeBuilder(W, H) {
  const floor = grid(W, H, 'grass');
  const walls = grid(W, H, false);
  const objects = [];
  const areas = [];
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const b = {
    floor, walls, objects, areas,
    fill(x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inB(i, j)) floor[j][i] = t; },
    wall(x, y) { if (inB(x, y)) walls[y][x] = true; },
    hWall(x, y, w) { for (let i = x; i < x + w; i++) b.wall(i, y); },
    vWall(x, y, h) { for (let j = y; j < y + h; j++) b.wall(x, j); },
    thick(x, y, w) { b.hWall(x, y, w); b.hWall(x, y + 1, w); },
    door(x, y, t) { if (!inB(x, y)) return; walls[y][x] = false; if (t) floor[y][x] = t; },
    o(type, x, y, opts = {}) { objects.push({ type, x, y, rot: 0, color: null, ...opts }); },
    chair(x, y, rot = 0, color = null) { objects.push({ type: 'chair', x, y, rot, color }); },
    area(key, name, x, y, w, h, opts = {}) { areas.push({ key, name, x, y, w, h, color: 'none', private: false, ...opts }); },
    // Fila de escritorios con su silla
    desks(x, y, n, opts = {}) {
      for (let k = 0; k < n; k++) {
        b.o(opts.type || 'desk', x + k * 3, y, { color: opts.color || null });
        b.o(opts.chairType || 'chair', x + k * 3 + 1, y + 1, { color: opts.chairColor || null });
      }
    },
  };
  return b;
}

// ---------------- Plantilla principal ----------------
function templateMain() {
  const W = 80, H = 56;
  const b = makeBuilder(W, H);

  // Jardín superior con estanque
  b.fill(30, 1, 20, 9, 'grass2');
  b.fill(36, 2, 8, 5, 'water');
  for (let j = 2; j < 7; j++) for (let i = 36; i < 44; i++) b.wall(i, j), (b.walls[j][i] = 'water');
  for (let i = 30; i < 50; i++) if (i < 38 || i > 41) b.o('hedge', i, 9);
  for (let j = 1; j < 9; j++) { b.o('hedge', 30, j); b.o('hedge', 49, j); }
  b.o('bench', 32, 4, { rot: 1 }); b.o('bench', 47, 4, { rot: 1 });
  b.o('flowers', 33, 2); b.o('flowers', 46, 7); b.o('flowers', 34, 7); b.o('bush', 45, 2);
  b.area('jardin', 'Jardín', 31, 1, 18, 8);

  // Sala de conferencias (arriba izquierda)
  b.fill(2, 1, 24, 9, 'tile');
  b.thick(2, 0, 24);
  b.vWall(1, 0, 10); b.vWall(26, 0, 10);
  b.door(26, 6, 'tile'); b.door(26, 7, 'tile');
  b.o('confTable', 7, 3, { w: 12 });
  for (let i = 7; i < 19; i += 2) b.chair(i, 5, 0, '#c2553a');
  b.o('tv', 22, 2); b.o('plant', 3, 2); b.o('plant', 24, 8);
  b.area('conferencias', 'Sala de conferencias', 2, 2, 24, 8, { private: true });

  // Árboles del perímetro
  for (let y = 12; y < H - 2; y += 3) { b.o('tree', 0, y); b.o('tree', 79, y); }
  for (let x = 52; x < 78; x += 3) b.o('tree', x, 2);

  // Edificio principal
  b.fill(1, 12, 78, 37, 'wood');
  b.thick(1, 11, 78);
  b.hWall(1, 48, 78);
  b.vWall(1, 11, 38); b.vWall(78, 11, 38);
  b.door(39, 11, 'wood'); b.door(40, 11, 'wood'); b.door(39, 12, 'wood'); b.door(40, 12, 'wood');
  b.fill(38, 10, 4, 1, 'path');
  for (const x of [28, 29, 30]) b.door(x, 48, 'wood');

  // Columna derecha de salas
  b.vWall(63, 13, 35);
  b.thick(64, 25, 14);
  b.thick(64, 37, 14);
  for (const y of [18, 19, 31, 32, 42, 43]) b.door(63, y, 'wood');

  b.fill(64, 13, 14, 12, 'lavender');
  b.o('meetingTable', 67, 17, { w: 7 });
  for (let i = 67; i < 74; i += 2) { b.chair(i, 16, 2, '#d9454f'); b.chair(i, 20, 0, '#d9454f'); }
  b.chair(66, 18, 1, '#d9454f'); b.chair(74, 18, 3, '#d9454f');
  b.o('serverRack', 64, 13); b.o('tv', 69, 13); b.o('watercooler', 76, 13); b.o('plant', 76, 23);
  b.area('juntas', 'Sala de juntas', 64, 13, 14, 12, { private: true });

  b.fill(64, 27, 14, 10, 'tile');
  b.o('whiteboard', 69, 27); b.o('bookshelf', 74, 27);
  b.o('easel', 66, 31); b.o('table', 70, 31);
  b.chair(70, 30, 2); b.chair(73, 30, 2); b.chair(70, 33, 0); b.chair(73, 33, 0);
  b.o('plant', 76, 35);
  b.area('creativa', 'Sala creativa', 64, 27, 14, 10, { private: true });

  b.fill(64, 39, 14, 9, 'wood2');
  b.o('table', 67, 42, { w: 7 });
  for (let i = 67; i < 74; i += 2) { b.chair(i, 41, 2, '#7a4a2b'); b.chair(i, 44, 0, '#7a4a2b'); }
  b.o('plant', 76, 39); b.o('plant', 64, 46);
  b.area('comedor', 'Comedor', 64, 39, 14, 9);

  // Pared superior
  b.o('painting', 7, 11); b.o('watercooler', 11, 12); b.o('coffee', 13, 12); b.o('fridge', 16, 12);
  b.o('clock', 20, 11); b.o('plant', 24, 12); b.o('plant', 28, 12);
  b.o('window', 31, 11); b.o('coatRack', 43, 12); b.o('easel', 45, 12); b.o('bookshelf', 48, 12);
  b.o('plant', 52, 12); b.o('window', 55, 11); b.o('plant', 61, 12);

  // Departamentos
  b.area('admin', 'Admin', 3, 15, 8, 10, { color: 'carpet' });
  b.o('desk', 4, 17); b.chair(5, 18); b.o('desk', 4, 21); b.chair(5, 22);
  b.o('tree2', 8, 15); b.o('plant', 9, 23);

  b.area('engineering', 'Engineering', 13, 15, 15, 10, { color: 'purple' });
  b.desks(14, 17, 4, { color: '#8a5a3c' });
  b.desks(14, 21, 4, { color: '#8a5a3c' });
  b.o('robotArm', 26, 15); b.o('plant', 13, 24);

  b.area('gameplay', 'Gameplay / LiveOps / Testing', 33, 15, 24, 10, { color: 'carpet' });
  b.desks(34, 17, 7, { chairType: 'gamingChair' });
  b.desks(34, 21, 7, { chairType: 'gamingChair' });
  b.o('plant', 33, 15); b.o('plant', 56, 15);

  b.area('staff', 'STAFF / ORGS', 3, 27, 22, 6, { color: 'lilac' });
  b.desks(4, 28, 3, { color: '#9b6fb0' });
  for (let k = 0; k < 2; k++) { b.o('cubicle', 14 + k * 5, 28); b.chair(15 + k * 5 + 1, 29); }
  b.o('robotArm', 13, 27);

  b.area('focus', 'Zona de enfoque', 33, 27, 24, 6, { color: 'rose' });
  b.o('standingDesk', 34, 28); b.chair(35, 29);
  for (let k = 0; k < 4; k++) { b.o('cubicle', 38 + k * 5, 28); b.chair(39 + k * 5 + 1, 29); }

  // Coworking
  b.area('coworking', 'Coworking', 3, 35, 23, 8);
  for (let k = 0; k < 3; k++) {
    const bx = 3 + k * 8;
    b.fill(bx, 35, 6, 8, 'sand');
    b.o('roundTable', bx + 2, 38);
    b.chair(bx + 1, 38, 1, '#6b4fb8'); b.chair(bx + 4, 38, 3, '#6b4fb8');
    b.chair(bx + 2, 37, 2, '#6b4fb8'); b.chair(bx + 3, 39, 0, '#6b4fb8');
    if (k < 2) for (let j = 35; j < 43; j += 2) b.o('tallPlant', bx + 6, j);
  }

  // Lounges y juegos
  for (const [lx, key] of [[33, 'lounge1'], [49, 'lounge2']]) {
    b.area(key, 'Lounge', lx, 35, 9, 8, { color: 'rug' });
    for (let i = lx; i < lx + 9; i++) { if (i !== lx + 4) { b.o('hedge', i, 35); b.o('hedge', i, 42); } }
    b.o('flowers', lx + 4, 35); b.o('flowers', lx + 4, 42);
    b.o('sofa', lx + 2, 37);
    b.o('roundTable', lx + 3, 38, { w: 3 });
    b.o('sofa', lx + 2, 40, { rot: 2 });
  }
  b.o('arcade', 43, 35); b.o('arcade', 45, 35, { color: '#e63946' }); b.o('arcade', 47, 35, { color: '#3a86ff' });
  b.o('foosball', 43, 39); b.o('drum', 46, 40);

  // Fila inferior
  b.fill(3, 45, 12, 3, 'kitchen');
  b.o('fridge', 3, 45); b.o('counter', 4, 45, { w: 5 }); b.o('watercooler', 10, 45); b.o('tv', 12, 45, { w: 2 });
  b.area('cocina', 'Cocina', 3, 45, 12, 3);
  b.fill(16, 45, 9, 3, 'pattern');
  b.o('sofa', 18, 47, { w: 4, rot: 2, color: '#3b82f6' });
  b.o('bikeRack', 34, 45); b.o('shelf', 38, 45); b.o('bookshelf', 42, 45);
  b.o('plant', 33, 45); b.o('plant', 46, 45);

  // Jardín inferior
  b.fill(46, 49, 32, 7, 'grass2');
  for (let i = 46; i < 78; i++) if (i % 6 !== 0) b.o('hedge', i, 49);
  for (const x of [50, 58, 66, 74]) b.o('bench', x, 52);
  for (const x of [48, 54, 62, 70, 76]) b.o('flowers', x, 51);
  b.o('fountain', 60, 53);
  b.fill(27, 49, 5, 7, 'path');

  return { W, H, spawn: { x: 30, y: 33 }, floor: b.floor, walls: b.walls, objects: b.objects, areas: b.areas };
}

// ---------------- Plantilla de piso nuevo (planta abierta) ----------------
function templateOpen() {
  const W = 64, H = 44;
  const b = makeBuilder(W, H);
  b.fill(1, 3, 62, 38, 'wood');
  b.thick(1, 2, 62);
  b.hWall(1, 40, 62);
  b.vWall(1, 2, 39); b.vWall(62, 2, 39);
  for (const x of [30, 31, 32]) b.door(x, 40, 'wood');
  b.fill(29, 41, 5, 3, 'path');

  // Sala de juntas
  b.vWall(47, 4, 14); b.thick(48, 17, 14);
  b.door(47, 10, 'wood'); b.door(47, 11, 'wood');
  b.fill(48, 4, 14, 13, 'lavender');
  b.o('meetingTable', 51, 8, { w: 7 });
  for (let i = 51; i < 58; i += 2) { b.chair(i, 7, 2); b.chair(i, 11, 0); }
  b.o('tv', 53, 4); b.o('plant', 60, 4);
  b.area('juntas', 'Sala de juntas', 48, 4, 14, 13, { private: true });

  // Lounge
  b.area('lounge', 'Lounge', 49, 28, 11, 10, { color: 'rug' });
  b.o('sofa', 51, 30); b.o('roundTable', 53, 32, { w: 3 }); b.o('sofa', 51, 34, { rot: 2 });
  b.o('plant', 49, 28); b.o('plant', 59, 28);

  b.o('window', 8, 2); b.o('window', 20, 2); b.o('window', 32, 2);
  b.o('watercooler', 3, 4); b.o('coffee', 5, 4); b.o('plant', 45, 4);
  for (let y = 4; y < H - 2; y += 3) { b.o('tree', 0, y); b.o('tree', 63, y); }

  return { W, H, spawn: { x: 31, y: 38 }, floor: b.floor, walls: b.walls, objects: b.objects, areas: b.areas };
}

export const TEMPLATES = {
  main: { name: 'Oficina principal', build: templateMain },
  open: { name: 'Planta abierta', build: templateOpen },
};

const templateCache = new Map();
export function getTemplate(id) {
  if (!templateCache.has(id)) templateCache.set(id, (TEMPLATES[id] || TEMPLATES.open).build());
  return templateCache.get(id);
}

// Zona privada de un escritorio: la fila de arriba, el escritorio y la fila de la silla.
export function deskZone(o) {
  const { w, h } = objSize(o);
  return { x: Math.floor(o.x), y: Math.floor(o.y) - 1, w: Math.ceil(w), h: Math.ceil(h) + 2 };
}

// Combina plantilla + áreas + objetos en el estado jugable de un piso.
export function composeFloor({ template, areas = [], objects = [] }) {
  const t = getTemplate(template);
  const { W, H } = t;
  const floor = t.floor.map((r) => r.slice());
  const walls = t.walls;
  const solid = walls.map((r) => r.map(Boolean));

  for (const a of areas) {
    if (!a.color || a.color === 'none') continue;
    for (let j = a.y; j < a.y + a.h; j++) for (let i = a.x; i < a.x + a.w; i++) {
      if (j >= 0 && i >= 0 && j < H && i < W && !walls[j][i]) floor[j][i] = a.color;
    }
  }

  const desks = [];
  for (const o of objects) {
    const c = CATALOG[o.type];
    if (!c) continue;
    const { w, h } = objSize(o);
    if (c.solid) {
      for (let j = Math.floor(o.y); j < Math.ceil(o.y + h); j++) for (let i = Math.floor(o.x); i < Math.ceil(o.x + w); i++) {
        if (j >= 0 && i >= 0 && j < H && i < W) solid[j][i] = true;
      }
    }
    if (c.claimable) desks.push({ id: o.id, object: o, zone: deskZone(o) });
  }

  return { template, W, H, spawn: t.spawn, floor, walls, solid, areas, objects, desks };
}

export const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function isWalkable(f, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < f.W && y < f.H && !f.solid[y][x];
}

export function areaAt(f, x, y) {
  // El área más pequeña que contiene el punto (las salas dentro de áreas grandes ganan)
  let best = null;
  for (const a of f.areas) if (inRect(a, x, y) && (!best || a.w * a.h < best.w * best.h)) best = a;
  return best;
}

export function deskAt(f, x, y) {
  return f.desks.find((d) => inRect(d.zone, x, y)) || null;
}

// Clave del "espacio de conversación" donde está una persona:
// escritorio > área privada > pasillo (null = proximidad por distancia).
export function talkSpace(f, x, y) {
  const d = deskAt(f, x, y);
  if (d) return `desk:${d.id}`;
  const a = areaAt(f, x, y);
  if (a && a.private) return `area:${a.id}`;
  return null;
}

export function canTalk(f, a, b) {
  if (!a || !b || a.floorId !== b.floorId) return false;
  const sa = talkSpace(f, a.x, a.y);
  const sb = talkSpace(f, b.x, b.y);
  if (sa || sb) return sa === sb;
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= PROXIMITY_RADIUS;
}

export function nearestWalkable(f, x, y) {
  if (isWalkable(f, x, y)) return { x, y };
  for (let r = 1; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (isWalkable(f, x + dx, y + dy)) return { x: x + dx, y: y + dy };
    }
  }
  return { ...f.spawn };
}

export function findPath(f, from, to, maxNodes = 12000) {
  to = nearestWalkable(f, to.x, to.y);
  const key = (p) => p.y * f.W + p.x;
  const prev = new Map([[key(from), null]]);
  const queue = [from];
  let head = 0;
  while (head < queue.length && head < maxNodes) {
    const cur = queue[head++];
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      for (let n = cur; n; n = prev.get(key(n))) path.unshift(n);
      return path.slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (isWalkable(f, n.x, n.y) && !prev.has(key(n))) {
        prev.set(key(n), cur);
        queue.push(n);
      }
    }
  }
  return [];
}
