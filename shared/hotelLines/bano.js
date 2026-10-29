// Línea "Baño": Tina, regadera, lavabo.
// Mismo formato que shared/hotelCatalog.js + line: 'bano'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', line: 'bano', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', line: 'bano', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, ...o });

export default [
  F('bano_tub', 'Tina con patas', 'deco', { w: 1, l: 2, h: 0.7, sit: 0.3, soak: 0.73, interact: 'toggle', states: 2, price: 28, colors: ['#f6f5f2', '#FE3377', '#7fb8a4', '#2b2d38'] }),
  F('bano_shower', 'Regadera', 'deco', { h: 2.3, interact: 'toggle', states: 2, price: 24 }),
  F('bano_sink', 'Lavabo con espejo', 'deco', { h: 1, interact: 'toggle', states: 2, price: 16 }),
  F('bano_toilet', 'Inodoro', 'sillas', { h: 0.9, sit: 0.42, price: 12, colors: ['#f6f5f2', '#2b2d38', '#FE3377'] }),
  F('bano_towel', 'Toallero', 'deco', { h: 1.4, price: 8, colors: ['#FE3377', '#3a86ff', '#FFCC00', '#2fb67c'] }),
  F('bano_mat', 'Tapete de baño', 'pisos', { h: 0.03, walk: true, rots: [0, 2], price: 4, colors: ['#7fc8e8', '#FE3377', '#FFCC00', '#f6f5f2'] }),
  F('bano_tile', 'Azulejo de baño', 'pisos', { h: 0.02, walk: true, rots: [0], price: 3, colors: ['#bfe3ef', '#f6f5f2', '#ffc2d6', '#2b2d38'] }),
  W('bano_mirror', 'Espejo redondo', 'pared', { price: 8 }),
  W('bano_cabinet', 'Botiquín', 'pared', { price: 10 }),
];
