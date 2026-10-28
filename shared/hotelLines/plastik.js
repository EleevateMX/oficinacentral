// Línea "Plastik": Plástico de colores, divertida.
// Mismo formato que shared/hotelCatalog.js + line: 'plastik'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'plastik', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'plastik', ...o });

const RED = '#ff3b5c', BLUE = '#2d7dff', YEL = '#ffd21f', GRN = '#22c55e', PNK = '#ff7ad9', ORG = '#ff8a1f';

export default [
  F('plastik_chair', 'Silla Plastik', 'sillas', { h: 1.2, sit: 0.6, price: 4, colors: [RED, BLUE, YEL, GRN, PNK] }),
  F('plastik_inflable', 'Sillón inflable', 'sillas', { h: 0.85, sit: 0.42, price: 8, colors: [PNK, BLUE, GRN, ORG] }),
  F('plastik_table', 'Mesa tulipán', 'mesas', { h: 0.78, stack: true, rots: [0], price: 6, colors: [YEL, RED, BLUE, '#f4f4f6'] }),
  F('plastik_cube', 'Cubo apilable', 'mesas', { h: 0.5, stack: true, rots: [0], price: 3, colors: [BLUE, RED, YEL, GRN, PNK, ORG] }),
  F('plastik_bed', 'Cama Plastik', 'camas', { l: 2, h: 0.55, lay: true, price: 12, colors: [BLUE, RED, GRN, PNK] }),
  F('plastik_lamp', 'Lámpara hongo', 'luz', { h: 1.25, rots: [0], interact: 'toggle', states: 2, price: 8, colors: [RED, ORG, GRN, BLUE] }),
  F('plastik_tv', 'Tele burbuja', 'diversion', { h: 1.4, interact: 'toggle', states: 2, price: 18, colors: ['#f4f4f6', RED, YEL] }),
  W('plastik_mirror', 'Espejo burbuja', 'pared', { price: 5, colors: [ORG, PNK, BLUE, GRN] }),
];
