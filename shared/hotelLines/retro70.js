// Línea "Retro 70s": Hippie: lámparas de lava, sofá redondo.
// Mismo formato que shared/hotelCatalog.js + line: 'retro70'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', line: 'retro70', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', line: 'retro70', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, ...o });

const GROOVY = ['#e8772e', '#d9a62b', '#7a8f3a', '#b8452f'];

export default [
  F('retro70_sofa_round', 'Sofá redondo', 'sillas', { w: 2, l: 2, h: 0.95, sit: 0.45, price: 34, colors: GROOVY }),
  F('retro70_egg', 'Silla huevo', 'sillas', { h: 1.5, sit: 0.5, price: 24, colors: GROOVY }),
  F('retro70_table', 'Mesa de azulejos', 'mesas', { h: 0.5, stack: true, rots: [0], price: 10, colors: ['#e8772e', '#d9a62b', '#7a8f3a'] }),
  F('retro70_lava', 'Lámpara de lava gigante', 'luz', { h: 1.6, rots: [0], interact: 'toggle', states: 2, price: 18, colors: ['#ff6a2b', '#c23bd4', '#2fb67c'] }),
  F('retro70_rug', 'Tapete peludo de flor', 'pisos', { w: 2, l: 2, h: 0.03, walk: true, rots: [0], price: 10, colors: ['#e8772e', '#d9a62b', '#c23bd4', '#7a8f3a'] }),
  F('retro70_record', 'Tocadiscos de consola', 'diversion', { w: 2, h: 0.95, interact: 'toggle', states: 2, price: 26 }),
  W('retro70_poster', 'Póster de paz y flores', 'pared', { price: 6 }),
  W('retro70_macrame', 'Macramé de pared', 'pared', { price: 8 }),
];
