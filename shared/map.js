// Mapas de la oficina, compartidos entre servidor y cliente.
//
// Un piso se compone de:
//  - una plantilla fija (suelos, muros y puertas)
//  - áreas editables (departamentos, salas, zonas comunes) guardadas en la base de datos
//  - objetos editables (muebles y decoraciones) guardados en la base de datos
// La plantilla también trae áreas y objetos por defecto que se copian a la base
// de datos al crear el piso; a partir de ahí todo se puede mover.

import { CATALOG, objSize } from './catalog.js';
import { stageLink } from './stage.js';

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
  { id: 'blue', name: 'Alfombra azul' },
  { id: 'green', name: 'Verde' },
  { id: 'terra', name: 'Terracota' },
  { id: 'slate', name: 'Pizarra' },
  { id: 'concrete', name: 'Cemento pulido' },
  { id: 'hex', name: 'Hexágonos (GTAHUB)' },
  { id: 'redRug', name: 'Roja ornamental' },
  { id: 'diamond', name: 'Rombos gris azulado' },
];

// Forma de la alfombra de un área (para que el mapa no se vea tan cuadrado)
export const AREA_SHAPES = [
  { id: 'soft', name: 'Esquinas redondeadas' },
  { id: 'round', name: 'Ovalada' },
  { id: 'square', name: 'Recta' },
];

function grid(w, h, v) {
  return Array.from({ length: h }, () => Array(w).fill(v));
}

function makeBuilder(W, H) {
  const floor = grid(W, H, 'grass');
  const walls = grid(W, H, false);
  const objects = [];
  const areas = [];
  const decals = []; // formas suaves que el cliente dibuja encima del suelo
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const b = {
    floor, walls, objects, areas, decals,
    fill(x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inB(i, j)) floor[j][i] = t; },
    wall(x, y) { if (inB(x, y)) walls[y][x] = true; },
    hWall(x, y, w) { for (let i = x; i < x + w; i++) b.wall(i, y); },
    vWall(x, y, h) { for (let j = y; j < y + h; j++) b.wall(x, j); },
    thick(x, y, w) { b.hWall(x, y, w); b.hWall(x, y + 1, w); },
    door(x, y, t) { if (!inB(x, y)) return; walls[y][x] = false; if (t) floor[y][x] = t; },
    glass(x, y, w = 1, h = 1) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inB(i, j)) walls[j][i] = 'glass'; },
    // Elipse de suelo (estanques, plazas, caminos curvos)
    // Elipse suave: marca el suelo por casillas y además guarda la curva para dibujarla
    blob(cx, cy, rx, ry, t, opts = {}) {
      const cells = [];
      b.ellipse(cx, cy, rx, ry, (i, j) => {
        if (t === 'water') { b.walls[j][i] = 'water'; cells.push([i, j]); }
        else if (!opts.only || opts.only.includes(b.floor[j][i])) { b.floor[j][i] = t; cells.push([i, j]); }
      });
      decals.push({ cx, cy, rx, ry, t, under: opts.under || 'grass', cells });
    },
    // Camino recto con puntas redondeadas
    lane(x, y, w, h, t) {
      b.fill(x, y, w, h, t);
      decals.push({ rect: [x, y, w, h], t });
    },
    ellipse(cx, cy, rx, ry, fn) {
      for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
        const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && inB(i, j)) fn(i, j);
      }
    },
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
    // Escritorios en posiciones libres: xs = lista de x
    deskRow(xs, y, opts = {}) {
      xs.forEach((x, k) => {
        const col = Array.isArray(opts.color) ? opts.color[k % opts.color.length] : opts.color;
        const cc = Array.isArray(opts.chairColor) ? opts.chairColor[k % opts.chairColor.length] : opts.chairColor;
        b.o(opts.type || 'desk', x, y, { color: col || null });
        b.o(opts.chairType || 'chair', x + 1, y + 1, { color: cc || null });
      });
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
  b.o('painting', 7, 11); b.o('watercooler', 11, 13); b.o('coffee', 13, 13); b.o('fridge', 16, 13);
  b.o('clock', 20, 11); b.o('plant', 24, 13); b.o('plant', 28, 13);
  b.o('window', 31, 11); b.o('coatRack', 43, 13); b.o('easel', 45, 13); b.o('bookshelf', 48, 13);
  b.o('plant', 52, 13); b.o('window', 55, 11); b.o('plant', 61, 13);

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


// ---------------- Plantilla HQ (todas las salas, formas más orgánicas) ----------------
// Pseudoaleatorio fijo para que el mapa salga igual siempre
function seeded(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function templateHQ() {
  const W = 100, H = 68;
  const b = makeBuilder(W, H);
  const X0 = 5, X1 = 94, Y0 = 10, Y1 = 57, C = 3;

  // Edificio con esquinas recortadas
  const inside = (x, y) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1 &&
    (x - X0) + (y - Y0) >= C && (X1 - x) + (y - Y0) >= C && (x - X0) + (Y1 - y) >= C && (X1 - x) + (Y1 - y) >= C;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) b.floor[y][x] = 'wood';
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (inside(x, y)) continue;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) near = true;
    if (near) { b.wall(x, y); if (inside(x, y + 1) && !inside(x, y - 1)) b.wall(x, y - 1); }
  }
  // Acera alrededor
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (b.walls[y][x] || inside(x, y)) continue;
    let d = 9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (b.walls[y + dy]?.[x + dx] === true) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
    if (d <= 1) b.floor[y][x] = 'path';
  }

  const room = (x, y, w, h, t) => b.fill(x, y, w, h, t);

  // ===== Fila superior (y 10..19), frente de cristal en y 20 =====
  for (const x of [25, 42, 56, 70]) b.vWall(x, Y0, 11);
  b.glass(X0, 20, X1 - X0 + 1, 1);

  // Sala de reuniones
  room(X0, Y0, 20, 10, 'blue');
  for (const x of [14, 15]) b.door(x, 20, 'wood');
  b.o('bigScreen', 12, 10);
  b.o('confTable', 8, 14, { w: 12 });
  for (let i = 8; i < 20; i += 2) { b.chair(i, 13, 2, '#101010'); b.chair(i, 16, 0, '#101010'); }
  b.chair(7, 14, 1, '#101010'); b.chair(20, 14, 3, '#101010');
  b.o('plant', 23, 10); b.o('plant', 23, 18); b.o('tallPlant', 6, 18); b.o('cabinet', 20, 10);
  b.o('window', 7, 9); b.o('window', 17, 9);
  b.area('reuniones', 'Sala de reuniones', X0, Y0, 20, 10, { private: true });

  // Jardín interior con estanque ovalado y camino curvo
  room(26, Y0, 16, 10, 'grass2');
  for (let x = 26; x <= 41; x++) b.door(x, 20, 'grass2');
  for (let x = 26; x <= 41; x++) if (x < 32 || x > 35) b.o('hedge', x, 20 - 1 + 0);
  b.blob(33.5, 13.6, 5.4, 4.3, 'path', { only: ['grass2'], under: 'grass2' });
  b.blob(33.5, 13.4, 3.4, 2.2, 'water', { under: 'path' });
  b.lane(33, 17, 2, 3, 'path');
  b.o('bench', 27, 13, { rot: 1 }); b.o('bench', 40, 13, { rot: 1 });
  b.o('tree2', 27, 10); b.o('tree2', 39, 10); b.o('flowers', 30, 11); b.o('flowers', 37, 11);
  b.o('flowers', 29, 16); b.o('flowers', 38, 16); b.o('bush', 28, 17); b.o('bush', 39, 17);
  b.area('jardin', 'Jardín', 26, Y0, 16, 10, { shape: 'round' });

  // Salas de staff
  for (const [x0, key, name, col] of [[43, 'staffO', 'Sala Staff Oeste', '#FE3377'], [57, 'staffE', 'Sala Staff Este', '#3a86ff']]) {
    room(x0, Y0, 13, 10, 'blue');
    b.door(x0 + 6, 20, 'wood');
    b.o('tv', x0 + 5, Y0);
    b.o('meetingTable', x0 + 3, 13, { w: 7 });
    for (let i = x0 + 3; i < x0 + 10; i += 2) { b.chair(i, 12, 2, col); b.chair(i, 16, 0, col); }
    b.chair(x0 + 2, 14, 1, col); b.chair(x0 + 10, 14, 3, col);
    b.o('plant', x0, Y0); b.o('plant', x0 + 12, 18); b.o('window', x0 + 8, 9);
    b.area(key, name, x0, Y0, 13, 10, { private: true });
  }

  // Cocina
  room(71, Y0, 24, 10, 'kitchen');
  for (let x = 76; x <= 81; x++) b.door(x, 20, 'kitchen');
  b.o('fridge', 72, Y0); b.o('counter', 73, Y0, { w: 7 }); b.o('coffee', 80, Y0);
  b.o('vending', 83, Y0); b.o('vending', 84, Y0, { color: '#FFCC00' }); b.o('watercooler', 86, Y0);
  b.o('counter', 74, 14, { w: 5 });
  for (let i = 74; i < 79; i++) b.o('stool', i, 15, { color: '#FE3377' });
  for (const [tx, ty] of [[84, 13], [84, 17]]) {
    b.o('roundTable', tx, ty, { w: 3, color: '#ffffff' });
    b.chair(tx - 1, ty, 1, '#c99c72'); b.chair(tx + 3, ty, 3, '#c99c72');
  }
  b.o('tallPlant', 72, 18); b.o('plant', 92, 18); b.o('window', 88, 9);
  b.area('cocina', 'Cocina', 71, Y0, 24, 10);

  // ===== Centro izquierdo: departamentos en planta abierta =====
  b.area('direccion', 'Dirección', 6, 24, 14, 8, { color: 'terra' });
  b.deskRow([7, 11, 15], 26, { type: 'woodDesk', chairType: 'officeChair' });
  b.o('sofaSmall', 7, 30, { color: '#101010' }); b.o('armchair', 11, 30, { rot: 3 });
  b.o('bookshelf', 15, 30); b.o('tallPlant', 19, 24); b.o('plant', 6, 24);

  b.area('design', 'Mapping / Design', 22, 24, 24, 8, { color: 'purple' });
  b.deskRow([23, 26, 29, 35, 38, 41], 26, { type: 'glassDesk', chairColor: ['#8B7BFF', '#FE3377'] });
  b.deskRow([23, 26, 29, 35, 38, 41], 29, { type: 'glassDesk', chairColor: ['#FE3377', '#8B7BFF'] });
  b.o('tallPlant', 33, 25); b.o('easel', 33, 28); b.o('tallPlant', 33, 30);

  b.area('engineering', 'Engineering', 6, 33, 18, 6, { color: 'mint' });
  b.deskRow([7, 10, 13, 16, 19], 34, { type: 'gamingDesk', chairType: 'gamingChair', chairColor: ['#157A6E', '#d9454f'] });
  b.o('serverRack', 22, 33); b.o('robotArm', 22, 36);

  b.area('marketing', 'Marketing', 27, 33, 19, 6, { color: 'rose' });
  b.deskRow([28, 31, 34, 37, 40], 34, { type: 'standingDesk', chairColor: ['#FE3377', '#FFCC00'] });
  b.o('tallPlant', 44, 36); b.o('whiteboard', 43, 33);

  for (const y of [33, 36]) b.o('tallPlant', 25, y);

  // Gameplay / LiveOps / Testing: una fila larga de puestos gamer
  b.area('gameplay', 'Gameplay / LiveOps / Testing', 6, 40, 40, 5, { color: 'blue' });
  b.deskRow([7, 10, 13, 16, 19, 22, 28, 31, 34, 37, 40, 43], 41, { type: 'gamingDesk', chairType: 'gamingChair', chairColor: ['#3a86ff', '#FE3377', '#06a77d'] });
  b.o('tallPlant', 25, 41);

  // ===== Columna central: salas chicas de cristal =====
  b.glass(48, 23, 1, 20); b.glass(57, 23, 1, 20);
  for (const y of [23, 29, 35, 42]) b.glass(49, y, 8, 1);
  const pods = [
    ['rosa', 'Sala 1:1 Rosa', 24, 5, 'rose', '#FE3377'],
    ['pequena', 'Sala pequeña', 30, 5, 'blue', '#3f4652'],
    ['azul', 'Sala 1:1 Azul', 36, 6, 'blue', '#3a86ff'],
  ];
  for (const [key, name, y0, h, t, col] of pods) {
    room(49, y0, 8, h, t);
    const my = y0 + Math.floor(h / 2);
    b.door(48, my, t); b.door(57, my, t);
    if (key === 'pequena') {
      b.o('tv', 51, y0);
      b.o('roundTable', 51, my, { w: 3, color: '#ffffff' });
      b.chair(51, my - 1, 2, col); b.chair(53, my - 1, 2, col); b.chair(51, my + 1, 0, col); b.chair(53, my + 1, 0, col);
    } else {
      b.o('roundTable', 52, my, { color: '#ffffff' });
      b.o('armchair', 51, my, { rot: 1, color: col }); b.o('armchair', 54, my, { rot: 3, color: col });
      b.o('plant', 55, y0); b.o('lamp', 49.5, y0 + 0.25);
    }
    b.area(key, name, 49, y0, 8, h, { private: true });
  }

  // ===== Centro derecho: Staff / Orgs (40 lugares) y lounge =====
  b.area('staff', 'Staff / Orgs', 59, 24, 36, 17, { color: 'lilac' });
  const left = [60, 63, 66, 69, 72], right = [78, 81, 84, 87, 90];
  for (const y of [26, 30, 34, 38]) {
    b.deskRow(left, y, { type: 'desk', color: '#e8e8ee', chairColor: ['#101010', '#FE3377'] });
    b.deskRow(right, y, { type: 'desk', color: '#e8e8ee', chairColor: ['#FE3377', '#101010'] });
    b.o('planter', 75, y, { color: '#101010' });
  }
  b.area('lounge', 'Lounge', 60, 41, 34, 4, { color: 'rug', shape: 'round' });
  for (const lx of [63, 85]) {
    b.o('sofa', lx, 41, { color: '#101010' });
    b.o('sofa', lx, 43, { rot: 2, color: '#FE3377' });
  }
  // Escenario para juntas de staff: lo oye toda el área Staff / Orgs
  for (const [type, x, y, extra] of STAGE_EXTRAS) b.o(type, x, y, extra);
  b.o('tallPlant', 61, 42); b.o('tallPlant', 72, 42); b.o('tallPlant', 92, 42); b.o('coffee', 80, 41);

  // ===== Fila inferior (y 47..57), frente de cristal en y 46 =====
  b.glass(X0, 46, X1 - X0 + 1, 1);
  for (const x of [17, 34, 51, 64, 78]) b.vWall(x, 46, 12);

  for (const [x0, key, name] of [[5, 'devO', 'Dev Oeste'], [52, 'devE', 'Dev Este']]) {
    room(x0, 47, 12, 11, 'blue');
    b.door(x0 + 6, 46, 'wood'); b.door(x0 + 7, 46, 'wood');
    b.o('whiteboard', x0 + 1, 47); b.o('plant', x0 + 10, 47);
    b.o('table', x0 + 4, 50, { w: 4, color: '#e8e8ee' });
    for (let i = x0 + 4; i < x0 + 8; i += 2) { b.chair(i, 49, 2); b.chair(i + 1, 52, 0); }
    b.o('tallPlant', x0 + 10, 55);
    b.area(key, name, x0, 47, 12, 11, { private: true });
  }

  room(18, 47, 16, 11, 'blue');
  for (const x of [20, 21]) b.door(x, 46, 'wood');
  b.o('bigScreen', 23, 47);
  b.o('meetingTable', 22, 50, { w: 8 });
  for (let i = 22; i < 30; i += 2) { b.chair(i, 49, 2, '#101010'); b.chair(i + 1, 53, 0, '#101010'); }
  b.chair(21, 51, 1, '#101010'); b.chair(30, 51, 3, '#101010');
  b.o('plant', 18, 47); b.o('plant', 33, 47); b.o('tallPlant', 18, 56); b.o('tallPlant', 33, 56);
  b.area('reunionesSur', 'Sala de reuniones Sur', 18, 47, 16, 11, { private: true });

  // Recepción y entrada
  room(35, 46, 16, 12, 'hex');
  for (let x = 35; x <= 50; x++) b.door(x, 46, 'hex');
  for (const x of [41, 42, 43, 44]) b.door(x, 58, 'path');
  // Recepción centrada en la sala (35..50 → centro en x 43)
  b.o('reception', 40.5, 49);
  b.o('officeChair', 42.5, 48, { rot: 2 });
  b.o('cubeLogo', 42.75, 49.1); b.o('hexLamp', 40.7, 48.9); b.o('monitor', 44, 48.9);
  b.o('hotelElevator', HOTEL_ELEVATOR_SPOT.x, HOTEL_ELEVATOR_SPOT.y); // elevador al Hotel
  b.o('sofaSmall', 36, 51, { rot: 1, color: '#FE3377' }); b.o('sofaSmall', 49, 51, { rot: 3, color: '#FE3377' });
  b.o('tallPlant', 35, 47); b.o('tallPlant', 50, 47); b.o('plant', 36, 56); b.o('plant', 49, 56);
  b.area('recepcion', 'Recepción', 35, 47, 16, 11, { color: 'none' });

  // Zona de descanso
  room(65, 47, 13, 11, 'wood2');
  for (let x = 68; x <= 74; x++) b.door(x, 46, 'wood2');
  b.o('tv', 69, 47); b.o('bookshelf', 74, 47); b.o('plant', 65, 47);
  b.o('jukebox', 66, 47); // rocola: música compartida en la zona
  b.o('sofa', 67, 50, { color: '#3a86ff' });
  b.o('roundTable', 68, 52, { w: 3 });
  for (const [x, y, c] of [[66, 55, '#FE3377'], [68, 56, '#FFCC00'], [71, 55, '#9b5de5'], [74, 54, '#06d6a0']]) b.o('beanBag', x, y, { color: c });
  b.o('tallPlant', 76, 56);
  b.area('descanso', 'Zona de descanso', 65, 47, 13, 11, { color: 'green', shape: 'round' });

  // Sala de juegos
  room(79, 47, 16, 11, 'slate');
  for (let x = 84; x <= 88; x++) b.door(x, 46, 'slate');
  b.o('arcade', 79, 47, { color: '#FE3377' }); b.o('arcade', 80, 47, { color: '#FFCC00' }); b.o('arcade', 81, 47, { color: '#3a86ff' });
  b.o('bigScreen', 89, 47);
  b.o('poolTable', 81, 50); b.o('pingPong', 88, 50);
  b.o('foosball', 81, 54);
  for (const [x, y, c] of [[87, 54, '#FE3377'], [89, 55, '#3a86ff'], [91, 54, '#FFCC00']]) b.o('beanBag', x, y, { color: c });
  b.o('drum', 93, 50);
  b.o('trophyCase', 85, 56);
  b.area('juegos', 'Sala de juegos', 79, 47, 16, 11, { color: 'purple', shape: 'soft' });

  // Pasillos con plantas
  for (const x of [8, 20, 30, 38, 62, 72, 88]) b.o('plant', x, 21);
  for (const x of [10, 30, 62, 88]) b.o('tallPlant', x, 45);

  // ===== Marca: banderines, estandartes, neón, logo y luces (toman los colores del tema) =====
  for (let x = 6; x <= 90; x += 5) b.o('bunting', x, 20.75);
  for (let x = 6; x <= 90; x += 5) b.o('bunting', x, 45.25);
  b.o('neonLogo', 12.5, 9.15); b.o('wallBanner', 10.5, 10.1); b.o('wallBanner', 17.5, 10.1);
  for (const x0 of [43, 57]) { b.o('wallBanner', x0 + 1.5, 10.1); b.o('poster', x0 + 9.5, 10.1); }
  b.o('neonLogo', 75, 9.15); b.o('noticeBoard', 88, 10);
  b.o('fairyLights', 29.25, 10); b.o('fairyLights', 34.5, 10);
  b.o('floorLogo', 41.5, 51); b.o('balloons', 37, 47.2); b.o('balloons', 48, 47.2);
  for (const [type, x, y, extra] of RECEPTION_EXTRAS) b.o(type, x, y, extra);
  b.o('wavingFlag', 39, 59); b.o('wavingFlag', 46, 59);
  b.o('floorLogo', 74, 41.5, { h: 2.5 });
  for (const x0 of [5, 52]) b.o('poster', x0 + 8.6, 47);
  b.o('poster', 19.5, 47); b.o('poster', 31.5, 47);
  b.o('fairyLights', 68.5, 46.2); b.o('balloons', 76, 49);
  b.o('neonLogo', 83.5, 47.1); b.o('wallBanner', 87.2, 47.1);
  for (const [x, y] of [[6, 24], [22, 24], [6, 33], [27, 33], [6, 40], [59, 24]]) b.o('deskFlag', x + 0.2, y + 0.1);

  // ===== Exterior =====
  // Camino de entrada hasta una plaza redonda con fuente
  b.blob(42.5, 64, 5, 3.6, 'path');
  b.lane(41, 59, 4, 3, 'path');
  b.o('fountain', 42, 63);
  b.o('bench', 36, 63, { rot: 1 }); b.o('bench', 48, 63, { rot: 1 });
  for (const [x, y] of [[38, 61], [47, 61], [38, 66], [47, 66]]) b.o('flowers', x, y);
  // Jardines laterales
  b.blob(16, 63.5, 9, 3.2, 'grass2', { only: ['grass'] });
  b.blob(72, 63.5, 12, 3.2, 'grass2', { only: ['grass'] });
  b.blob(50, 3.6, 22, 2.8, 'grass2', { only: ['grass'] });
  for (const x of [10, 16, 22, 62, 68, 74, 80]) b.o('flowers', x, 63);
  // Árboles alrededor, sin cuadrícula
  const free = (x, y) => b.floor[y]?.[x] && !b.walls[y][x] && (b.floor[y][x] === 'grass' || b.floor[y][x] === 'grass2');
  const used = new Set();
  let n = 0;
  for (let k = 0; k < 400 && n < 70; k++) {
    const x = 1 + Math.floor(seeded(k * 2 + 1) * (W - 2));
    const y = 1 + Math.floor(seeded(k * 2 + 2) * (H - 2));
    const edge = x < X0 - 1 || x > X1 + 1 || y < Y0 - 3 || y > Y1 + 1;
    if (!edge || !free(x, y) || (y > 58 && x > 33 && x < 52)) continue;
    let ok = true;
    for (const u of used) { const [ux, uy] = u.split(',').map(Number); if (Math.abs(ux - x) < 3 && Math.abs(uy - y) < 3) ok = false; }
    if (!ok) continue;
    used.add(`${x},${y}`);
    b.o(seeded(k + 999) > 0.35 ? 'tree' : 'bush', x, y);
    n++;
  }

  return { W, H, spawn: { x: 42, y: 53 }, floor: b.floor, walls: b.walls, objects: b.objects, areas: b.areas, decals: b.decals };
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
  hq: { name: 'Oficina HQ (todas las salas)', build: templateHQ },
  main: { name: 'Oficina clásica', build: templateMain },
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

// Recepción renovada: letrero con el logo detrás del mostrador, alfombra de bienvenida
// y sillones de espera. También se agregan una vez a las oficinas ya creadas (server/world.js).
export const RECEPTION_EXTRAS = [
  ['neonLogo', 41.5, 47.1, {}],
  ['carpetRunner', 42, 54, { h: 4 }],
  ['armchair', 40, 55, { rot: 1, color: '#2a2a30' }],
  ['armchair', 45, 55, { rot: 3, color: '#2a2a30' }],
  ['hexLamp', 39.1, 55.1, {}],
  ['hexLamp', 46.15, 55.1, {}],
];

// Escenario de Staff / Orgs (arriba del área, asomado al pasillo). También se agrega una vez
// a las oficinas ya creadas si el lugar está libre (server/world.js).
// Elevador al Hotel en la recepción (también se agrega una vez a oficinas ya creadas, ver server/world.js)
export const HOTEL_ELEVATOR_SPOT = { x: 38, y: 46 };

export const STAGE_EXTRAS = [
  ['stage', 72, 22, {}],
];

// Donde va la decoración de un escritorio: encima del mueble y la fila de atrás (no donde va la silla)
export function deskDecorZone(o) {
  const { w, h } = objSize(o);
  return { x: Math.floor(o.x), y: Math.floor(o.y) - 1, w: Math.ceil(w), h: Math.ceil(h) + 1.5 };
}

// Combina plantilla + áreas + objetos en el estado jugable de un piso.
export function composeFloor({ template, areas = [], objects = [] }) {
  const t = getTemplate(template);
  const { W, H } = t;
  const floor = t.floor.map((r) => r.slice());
  const walls = t.walls;
  const solid = walls.map((r) => r.map(Boolean));

  // Las alfombras de las áreas las dibuja el cliente con su forma (ver render.js)

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
    if (c.claimable) desks.push({ id: o.id, object: o, zone: deskZone(o), decorZone: deskDecorZone(o) });
  }

  return { template, W, H, spawn: t.spawn, floor, walls, solid, areas, objects, desks, decals: t.decals || [] };
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
  if (a && (a.private || a.closed)) return `area:${a.id}`;
  return null;
}

// Sala cerrada: solo entra quien ya estaba dentro (los demás pueden tocar la puerta)
export function closedRoomAt(f, from, to) {
  const a = areaAt(f, to.x, to.y);
  if (!a?.closed) return null;
  const cur = areaAt(f, from.x, from.y);
  return cur?.id === a.id ? null : a;
}

export function canTalk(f, a, b) {
  if (!a || !b || a.floorId !== b.floorId) return false;
  if (stageLink(f, a, b)) return true; // ponente en el escenario ↔ su público
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
