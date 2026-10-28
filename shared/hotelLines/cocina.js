// Línea "Cocina": Estufa, alacena, cafetera.
// Mismo formato que shared/hotelCatalog.js + line: 'cocina'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', line: 'cocina', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', line: 'cocina', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, ...o });

const CABINET = ['#f2efe8', '#7fb8a4', '#2b2d38', '#e8a33d'];

export default [
  F('cocina_counter', 'Gabinete con cubierta', 'mesas', { h: 1, stack: true, price: 10, colors: CABINET }),
  F('cocina_stove', 'Estufa', 'deco', { h: 1, interact: 'toggle', states: 2, price: 22, colors: ['#f2efe8', '#2b2d38', '#c0392b'] }),
  F('cocina_sink', 'Fregadero', 'deco', { h: 1, interact: 'toggle', states: 2, price: 16, colors: CABINET }),
  F('cocina_pantry', 'Alacena', 'deco', { h: 2.3, interact: 'toggle', states: 2, price: 20, colors: CABINET }),
  F('cocina_coffee', 'Cafetera', 'deco', { h: 0.55, interact: 'toggle', states: 2, price: 10, colors: ['#2b2d38', '#c0392b', '#c9ced6'] }),
  F('cocina_table', 'Mesa con mantel', 'mesas', { h: 0.9, stack: true, rots: [0], price: 12, colors: ['#c0392b', '#2f6fb0', '#2fb67c'] }),
  F('cocina_floor', 'Loseta de ajedrez', 'pisos', { h: 0.02, walk: true, rots: [0], price: 3, colors: ['#1e1e24', '#c0392b', '#2f6fb0'] }),
  W('cocina_spices', 'Repisa de especias', 'pared', { price: 8 }),
  W('cocina_utensils', 'Barra de utensilios', 'pared', { price: 8 }),
];
