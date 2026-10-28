// Línea "Castillo": Gótica: tronos, candelabros, gárgolas.
// Mismo formato que shared/hotelCatalog.js + line: 'castillo'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'castillo', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'castillo', ...o });

export default [
  F('castillo_trono', 'Trono gótico', 'sillas', { h: 2.2, sit: 0.75, price: 40, colors: ['#8a1428', '#4a1f6e', '#1f3a5c'] }),
  F('castillo_mesa', 'Mesa de banquete', 'mesas', { w: 2, h: 0.9, stack: true, price: 18 }),
  F('castillo_candelabro', 'Candelabro', 'luz', { h: 1.9, rots: [0], interact: 'toggle', states: 2, price: 16 }),
  F('castillo_gargola', 'Gárgola', 'deco', { h: 1.7, rots: [0, 6], interact: 'toggle', states: 2, price: 26 }),
  F('castillo_armadura', 'Armadura', 'deco', { h: 2.1, price: 30 }),
  F('castillo_cofre', 'Cofre del tesoro', 'deco', { h: 0.6, interact: 'toggle', states: 2, price: 20 }),
  F('castillo_alfombra', 'Alfombra real', 'pisos', { w: 1, l: 3, h: 0.02, walk: true, rots: [0, 2], price: 10, colors: ['#8a1428', '#4a1f6e', '#1f3a5c'] }),
  W('castillo_vitral', 'Vitral gótico', 'pared', { price: 14 }),
  W('castillo_antorcha', 'Antorcha de pared', 'pared', { interact: 'toggle', states: 2, price: 8 }),
];
