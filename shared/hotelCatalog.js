import { HOTEL_LINES, LINE_FURNI } from './hotelLines/index.js';
// Catálogo de furnis del Hotel (contrato compartido).
//   kind: 'floor' | 'wall'
//   w, l: huella en casillas con rot 0 (en rot 2/6 se intercambian)
//   h: altura de la superficie de arriba en unidades (para apilar otro furni encima o sentarse)
//   sit: altura del asiento (te sientas al pararte encima) · lay: cama (te acuestas)
//   walk: se puede caminar encima (tapetes, pisos) · stack: se le puede poner algo encima
//   rots: rotaciones permitidas · states: cuántos estados tiene (encendido/apagado…)
//   interact: 'toggle' (cambia de estado) | 'dice' (tira 1–6) | 'teleport' (enlazado en pares) | 'gate' (abre/cierra el paso)
//   colors: variantes de color (la primera es la de fábrica)
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, ...o });

export const HOTEL_CATS = [
  { id: 'sillas', name: 'Sillas y sofás' },
  { id: 'mesas', name: 'Mesas' },
  { id: 'camas', name: 'Camas' },
  { id: 'luz', name: 'Iluminación' },
  { id: 'deco', name: 'Decoración' },
  { id: 'plantas', name: 'Plantas' },
  { id: 'pisos', name: 'Pisos y tapetes' },
  { id: 'pared', name: 'Pared' },
  { id: 'gtahub', name: 'GTAHUB' },
  { id: 'diversion', name: 'Diversión' },
];

export const HOTEL_FURNI = [
  // Sillas y sofás
  F('chair_basic', 'Silla de madera', 'sillas', { h: 1, sit: 0.7, colors: ['#b5794a', '#2b2b2f', '#f4f4f6'] }),
  F('chair_gamer', 'Silla gamer', 'sillas', { h: 1.2, sit: 0.75, colors: ['#FE3377', '#3a86ff', '#FFCC00', '#141414'] }),
  F('stool_bar', 'Banco de bar', 'sillas', { h: 1, sit: 0.9, rots: [0], colors: ['#c0c6cf', '#FE3377'] }),
  F('sofa_2', 'Sofá de dos', 'sillas', { w: 2, h: 1, sit: 0.6, colors: ['#FE3377', '#3a86ff', '#2fb67c', '#f2c94c', '#2b2d38'] }),
  F('sofa_3', 'Sofá grande', 'sillas', { w: 3, h: 1, sit: 0.6, colors: ['#2b2d38', '#FE3377', '#7d8471'] }),
  F('armchair', 'Sillón', 'sillas', { h: 1, sit: 0.6, colors: ['#e05ca5', '#3d7be0', '#7a4a2b'] }),
  F('beanbag', 'Puff', 'sillas', { h: 0.5, sit: 0.35, rots: [0], colors: ['#FE3377', '#FFCC00', '#3a86ff', '#2fb67c'] }),
  F('throne', 'Trono GTAHUB', 'sillas', { h: 1.6, sit: 0.8, colors: ['#FFCC00'] }),
  // Mesas
  F('table_small', 'Mesita', 'mesas', { h: 0.9, stack: true, rots: [0], colors: ['#b5794a', '#f4f4f6', '#2b2b2f'] }),
  F('table_dining', 'Mesa de comedor', 'mesas', { w: 2, l: 2, h: 0.9, stack: true, rots: [0], colors: ['#b5794a', '#2b2b2f'] }),
  F('table_coffee', 'Mesa de centro', 'mesas', { w: 2, h: 0.5, stack: true, colors: ['#b5794a', '#f4f4f6'] }),
  F('desk_pc', 'Escritorio con PC', 'mesas', { w: 2, h: 1, interact: 'toggle', states: 2 }),
  F('bar_counter', 'Barra', 'mesas', { w: 3, h: 1.1, stack: true, colors: ['#2b2d38', '#7a4a2b'] }),
  // Camas
  F('bed_single', 'Cama individual', 'camas', { w: 1, l: 2, h: 0.6, lay: true, colors: ['#3a86ff', '#FE3377', '#2fb67c'] }),
  F('bed_double', 'Cama matrimonial', 'camas', { w: 2, l: 2, h: 0.6, lay: true, colors: ['#f4f4f6', '#FE3377', '#2b2d38'] }),
  // Iluminación
  F('lamp_floor', 'Lámpara de pie', 'luz', { h: 2, rots: [0], interact: 'toggle', states: 2, colors: ['#f2c94c', '#FE3377'] }),
  F('lamp_lava', 'Lámpara de lava', 'luz', { h: 1.1, rots: [0], interact: 'toggle', states: 2, colors: ['#FE3377', '#3a86ff', '#2fb67c'] }),
  F('neon_hex', 'Neón hexagonal', 'luz', { h: 1.4, rots: [0], interact: 'toggle', states: 2, colors: ['#FE3377', '#FFCC00', '#3a86ff'] }),
  // Decoración
  F('bookshelf', 'Librero', 'deco', { w: 2, h: 2.4, colors: ['#7a4a2b', '#f4f4f6'] }),
  F('tv', 'Pantalla grande', 'deco', { w: 2, h: 1.6, interact: 'toggle', states: 2 }),
  F('fridge', 'Refri', 'deco', { h: 2.1, interact: 'toggle', states: 2, colors: ['#f4f4f6', '#FE3377'] }),
  F('arcade', 'Maquinita', 'deco', { h: 2.1, interact: 'toggle', states: 2, colors: ['#FE3377', '#FFCC00', '#3a86ff'] }),
  F('jukebox', 'Rocolita', 'deco', { h: 1.8, interact: 'toggle', states: 2 }),
  F('trophy', 'Trofeo', 'deco', { h: 0.8, rots: [0], colors: ['#FFCC00', '#c0c6cf', '#d08a4a'] }),
  // Plantas
  F('plant_big', 'Planta grande', 'plantas', { h: 1.8, rots: [0] }),
  F('plant_small', 'Maceta', 'plantas', { h: 0.8, rots: [0], colors: ['#f4f4f6', '#FE3377', '#b5794a'] }),
  F('cactus', 'Cactus', 'plantas', { h: 1.4, rots: [0] }),
  // Pisos y tapetes (se camina encima; no estorban)
  F('rug_round', 'Tapete redondo', 'pisos', { w: 2, l: 2, h: 0.02, walk: true, rots: [0], colors: ['#FE3377', '#3a86ff', '#FFCC00', '#2b2d38'] }),
  F('rug_long', 'Alfombra', 'pisos', { w: 1, l: 3, h: 0.02, walk: true, rots: [0, 2], colors: ['#c0392b', '#2b2d38', '#2fb67c'] }),
  F('floor_tile', 'Loseta', 'pisos', { h: 0.02, walk: true, rots: [0], colors: ['#f4f4f6', '#141414', '#FE3377', '#3a86ff', '#FFCC00', '#2fb67c'] }),
  // Pared
  W('poster_gtahub', 'Póster GTAHUB', 'pared'),
  W('window', 'Ventana', 'pared', { w: 2 }),
  W('clock', 'Reloj', 'pared'),
  W('shelf_wall', 'Repisa', 'pared', { w: 2 }),
  W('neon_sign', 'Letrero de neón GTAHUB', 'pared', { w: 2, interact: 'toggle', states: 2 }),
  W('frame_photo', 'Cuadro', 'pared', { colors: ['#FE3377', '#3a86ff', '#2fb67c'] }),
  // GTAHUB
  F('gtahub_rug', 'Tapete GTAHUB', 'gtahub', { w: 3, l: 3, h: 0.02, walk: true, rots: [0] }),
  F('gtahub_statue', 'Estatua del logo', 'gtahub', { h: 2.2, rots: [0] }),
  F('gtahub_car', 'Auto deportivo (decoración)', 'gtahub', { w: 2, l: 3, h: 1.1, colors: ['#FE3377', '#FFCC00', '#141414'] }),
  // Diversión
  F('dice', 'Dado', 'diversion', { h: 0.5, rots: [0], interact: 'dice', states: 7 }),
  F('teleport', 'Teletransportador', 'diversion', { h: 2.2, rots: [0, 2, 4, 6], interact: 'teleport', states: 2 }),
  F('gate', 'Rejita', 'diversion', { h: 1, rots: [0, 2], interact: 'gate', states: 2 }),
];

// Catálogo ampliado por líneas (ver shared/hotelLines/)
HOTEL_FURNI.push(...LINE_FURNI);
export { HOTEL_LINES };

export const FURNI_BY_ID = Object.fromEntries(HOTEL_FURNI.map((f) => [f.id, f]));

// Huella según rotación
export function footprint(def, rot = 0) {
  return rot === 2 || rot === 6 ? { w: def.l, l: def.w } : { w: def.w, l: def.l };
}

// Furnis con los que empieza una sala nueva (para que no se vea vacía) y regalo de bienvenida al inventario
export const STARTER_INVENTORY = ['chair_basic', 'chair_basic', 'table_small', 'sofa_2', 'lamp_floor', 'plant_big', 'rug_round', 'poster_gtahub', 'bed_single', 'tv'];

// Exclusivos HUB: solo los admins los obtienen (o los regalan). price = créditos HUB (por ahora solo se muestra).
//   Campos opcionales de cada def: exclusive: true, price: número, line: 'id de línea' (ver HOTEL_LINES si existe).
export const HOTEL_EXCLUSIVE_PRICES = { throne: 5000, gtahub_car: 3000, gtahub_statue: 2000, gtahub_rug: 1000 };
for (const f of HOTEL_FURNI) {
  if (f.cat === 'gtahub' || HOTEL_EXCLUSIVE_PRICES[f.id] != null) { f.exclusive = true; f.price ??= HOTEL_EXCLUSIVE_PRICES[f.id] ?? 500; }
}
