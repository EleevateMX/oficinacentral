// Línea "Cabaña": Madera rústica: chimenea, barra, libreros.
// Mismo formato que shared/hotelCatalog.js + line: 'cabana'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'cabana', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'cabana', ...o });

export default [
  F('cabana_fireplace', 'Chimenea de piedra', 'deco', { w: 2, h: 2.3, interact: 'toggle', states: 2, price: 35 }),
  F('cabana_bar', 'Barra de troncos', 'mesas', { w: 2, h: 1.1, stack: true, price: 16 }),
  F('cabana_stool', 'Banco de tronco', 'sillas', { h: 0.55, sit: 0.55, rots: [0], price: 3 }),
  F('cabana_rocker', 'Mecedora', 'sillas', { h: 1.3, sit: 0.66, price: 10 }),
  F('cabana_table', 'Mesa de tablones', 'mesas', { w: 2, h: 0.85, stack: true, price: 12 }),
  F('cabana_bookshelf', 'Librero rústico', 'deco', { w: 2, h: 2.3, price: 15 }),
  F('cabana_bed', 'Cama de troncos', 'camas', { w: 2, l: 2, h: 0.6, lay: true, price: 22, colors: ['#b8322a', '#2f6b43', '#2f5a8a'] }),
  F('cabana_rug', 'Tapete trenzado', 'pisos', { w: 2, l: 2, h: 0.02, walk: true, rots: [0], price: 7, colors: ['#b8322a', '#2f6b43', '#c9a46a'] }),
  W('cabana_lantern', 'Farol de pared', 'pared', { interact: 'toggle', states: 2, price: 7 }),
];
