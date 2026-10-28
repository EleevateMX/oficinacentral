// Línea "Cristal": Transparente y brillante.
// Mismo formato que shared/hotelCatalog.js + line: 'cristal'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'cristal', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'cristal', ...o });

const TINTS = ['#9ee7ff', '#ffb3d1', '#d6c8ff', '#b8ffd9'];

export default [
  F('cristal_silla', 'Silla de cristal', 'sillas', { h: 1.2, sit: 0.6, price: 12, colors: TINTS }),
  F('cristal_banca', 'Banca de cristal', 'sillas', { w: 2, h: 0.55, sit: 0.52, rots: [0, 2], price: 14, colors: TINTS }),
  F('cristal_mesa', 'Mesa de cristal', 'mesas', { w: 2, h: 0.8, stack: true, rots: [0, 2], price: 16, colors: TINTS }),
  F('cristal_cubo', 'Bloque de cristal', 'deco', { h: 0.9, stack: true, rots: [0], price: 4, colors: TINTS }),
  F('cristal_piso', 'Piso de cristal', 'pisos', { h: 0.02, walk: true, rots: [0], price: 3, colors: TINTS }),
  F('cristal_lampara', 'Lámpara de cristal', 'luz', { h: 1.8, rots: [0], interact: 'toggle', states: 2, price: 18, colors: TINTS }),
  F('cristal_geoda', 'Geoda brillante', 'deco', { h: 1.1, rots: [0], interact: 'toggle', states: 2, price: 22, colors: ['#c48bff', '#7fe0ff', '#ff7fb6', '#ffd75e'] }),
  W('cristal_espejo', 'Espejo de cristal', 'pared', { price: 10, colors: TINTS }),
];
