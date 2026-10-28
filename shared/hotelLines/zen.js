// Línea "Zen": Japonesa: tatami, biombos, bonsái.
// Mismo formato que shared/hotelCatalog.js + line: 'zen'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', line: 'zen', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', line: 'zen', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, ...o });

export default [
  F('zen_tatami', 'Tatami', 'pisos', { w: 1, l: 2, h: 0.04, walk: true, rots: [0, 2], price: 6 }),
  F('zen_zabuton', 'Cojín zabutón', 'sillas', { h: 0.22, sit: 0.2, rots: [0], price: 4, colors: ['#9b2f3f', '#2f4f74', '#5f6f3a', '#d9a441'] }),
  F('zen_table', 'Mesa baja de té', 'mesas', { w: 2, h: 0.42, stack: true, rots: [0, 2], price: 12, colors: ['#6b3f26', '#2b2320'] }),
  F('zen_futon', 'Futón', 'camas', { w: 1, l: 2, h: 0.28, lay: true, price: 16, colors: ['#2f4f74', '#9b2f3f', '#e9e2d2'] }),
  F('zen_screen', 'Biombo de cerezos', 'deco', { w: 2, h: 1.7, price: 20 }),
  F('zen_bonsai', 'Bonsái', 'plantas', { h: 0.9, rots: [0, 4], price: 14 }),
  F('zen_lantern', 'Farol de papel', 'luz', { h: 1.3, rots: [0], interact: 'toggle', states: 2, price: 12 }),
  F('zen_fountain', 'Fuente de bambú', 'deco', { h: 0.9, interact: 'toggle', states: 2, price: 22 }),
  W('zen_scroll', 'Pergamino de montaña', 'pared', { price: 8 }),
];
