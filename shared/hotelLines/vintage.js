// Línea "Vintage": Francesa antigua: piano, reloj de pie.
// Mismo formato que shared/hotelCatalog.js + line: 'vintage'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'vintage', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'vintage', ...o });

const PASTEL = ['#e9b8c4', '#a9c6e8', '#efe0b0', '#b7d3b0'];

export default [
  F('vintage_sillon', 'Sillón de época', 'sillas', { h: 1.35, sit: 0.6, price: 16, colors: PASTEL }),
  F('vintage_canape', 'Canapé', 'sillas', { w: 2, h: 1.35, sit: 0.6, price: 22, colors: PASTEL }),
  F('vintage_mesita', 'Mesita de té', 'mesas', { h: 0.72, stack: true, rots: [0], price: 12, colors: ['#7a4a2b', '#f3ead8'] }),
  F('vintage_cama', 'Cama con dosel', 'camas', { w: 2, l: 2, h: 0.6, lay: true, price: 48, colors: PASTEL }),
  F('vintage_lampara', 'Lámpara de flecos', 'luz', { h: 1.7, rots: [0], interact: 'toggle', states: 2, price: 14, colors: PASTEL }),
  F('vintage_piano', 'Piano antiguo', 'diversion', { w: 2, h: 1.45, interact: 'toggle', states: 2, price: 45, colors: ['#4a2618', '#1b1b1f', '#f3ead8'] }),
  F('vintage_reloj', 'Reloj de pie', 'deco', { h: 2.5, price: 28 }),
  F('vintage_gramofono', 'Gramófono', 'diversion', { h: 1.3, rots: [0, 6], interact: 'toggle', states: 2, price: 24 }),
  W('vintage_retrato', 'Retrato antiguo', 'pared', { price: 12, colors: PASTEL }),
];
