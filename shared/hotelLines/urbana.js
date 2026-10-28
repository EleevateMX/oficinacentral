// Línea "Urbana": Metal y blanco-negro: elegante y moderna.
// Mismo formato que shared/hotelCatalog.js + line: 'urbana'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'urbana', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'urbana', ...o });

export default [
  F('urbana_chair', 'Silla Urbana', 'sillas', { h: 1, sit: 0.7, price: 6, colors: ['#141414', '#f4f4f6', '#FE3377'] }),
  F('urbana_sofa', 'Sofá Urbano', 'sillas', { w: 2, h: 0.9, sit: 0.55, price: 14, colors: ['#141414', '#f4f4f6', '#6b7280'] }),
  F('urbana_table', 'Mesa de cristal', 'mesas', { w: 2, h: 0.5, stack: true, price: 10 }),
  F('urbana_bed', 'Cama Urbana', 'camas', { w: 2, l: 2, h: 0.6, lay: true, price: 20, colors: ['#141414', '#f4f4f6'] }),
  F('urbana_lamp', 'Lámpara de arco', 'luz', { h: 2.3, interact: 'toggle', states: 2, price: 12 }),
  F('urbana_shelf', 'Estante de metal', 'deco', { h: 2.2, price: 12, colors: ['#141414', '#f4f4f6'] }),
  F('urbana_rug', 'Tapete de ajedrez', 'pisos', { w: 2, l: 2, h: 0.02, walk: true, rots: [0], price: 8 }),
  W('urbana_art', 'Cuadro abstracto', 'pared', { price: 6, colors: ['#FE3377', '#FFCC00', '#3a86ff'] }),
];
