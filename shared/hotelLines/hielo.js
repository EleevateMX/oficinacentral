// Línea "Hielo": Beige y suave: sillones y bancas.
// Mismo formato que shared/hotelCatalog.js + line: 'hielo'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'hielo', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'hielo', ...o });

const CREAM = '#efe6d6', BEIGE = '#d9c7a7', ICE = '#cfe3ea', SAGE = '#c7d3bf', TAUPE = '#b8a58a';

export default [
  F('hielo_armchair', 'Sillón Hielo', 'sillas', { h: 1, sit: 0.55, price: 9, colors: [CREAM, BEIGE, ICE, SAGE] }),
  F('hielo_sofa', 'Sofá Hielo', 'sillas', { w: 3, h: 1, sit: 0.55, price: 18, colors: [BEIGE, CREAM, ICE, SAGE] }),
  F('hielo_bench', 'Banca acolchada', 'sillas', { w: 2, h: 0.5, sit: 0.5, price: 8, colors: [CREAM, TAUPE, ICE, SAGE] }),
  F('hielo_pouf', 'Puf tejido', 'sillas', { h: 0.42, sit: 0.4, rots: [0], price: 4, colors: [CREAM, BEIGE, ICE, SAGE] }),
  F('hielo_table', 'Mesa de travertino', 'mesas', { w: 2, h: 0.45, stack: true, price: 11 }),
  F('hielo_lamp', 'Lámpara de buró', 'luz', { h: 0.85, rots: [0], interact: 'toggle', states: 2, price: 6, colors: [CREAM, ICE, SAGE] }),
  F('hielo_rug', 'Tapete peludo', 'pisos', { w: 2, l: 2, h: 0.03, walk: true, rots: [0], price: 9, colors: [CREAM, ICE, SAGE, BEIGE] }),
  W('hielo_mirror', 'Espejo de arco', 'pared', { price: 7 }),
];
