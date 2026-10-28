// Línea "Fiesta": Máquinas de bebidas y helado, bola disco.
// Mismo formato que shared/hotelCatalog.js + line: 'fiesta'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'fiesta', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'fiesta', ...o });

export default [
  F('fiesta_soda', 'Máquina de refrescos', 'deco', { h: 2.1, interact: 'toggle', states: 2, price: 28, colors: ['#FE3377', '#3a86ff', '#141414'] }),
  F('fiesta_icecream', 'Máquina de helado', 'deco', { h: 1.8, interact: 'toggle', states: 2, price: 26, colors: ['#f4f4f6', '#ffb3cf', '#9fe3ff'] }),
  F('fiesta_discoball', 'Bola disco', 'luz', { h: 3.2, rots: [0], interact: 'toggle', states: 2, price: 35 }),
  F('fiesta_dancefloor', 'Pista de baile', 'pisos', { w: 2, l: 2, h: 0.04, walk: true, rots: [0], interact: 'toggle', states: 2, price: 40 }),
  F('fiesta_dj', 'Cabina de DJ', 'diversion', { w: 2, h: 1.25, interact: 'toggle', states: 2, price: 50 }),
  F('fiesta_speaker', 'Bocina grande', 'deco', { h: 1.7, interact: 'toggle', states: 2, price: 22 }),
  F('fiesta_balloons', 'Globos', 'deco', { h: 2.3, rots: [0], price: 6, colors: ['#FE3377', '#FFCC00', '#3a86ff', '#2fb67c'] }),
  F('fiesta_cake', 'Pastel de fiesta', 'deco', { h: 0.75, rots: [0], interact: 'toggle', states: 2, price: 12, colors: ['#ffb3cf', '#f4f4f6', '#6b3a22'] }),
  W('fiesta_papel', 'Papel picado', 'pared', { w: 2, price: 5, colors: ['#FE3377', '#FFCC00', '#2fb67c', '#8e5cf7'] }),
];
