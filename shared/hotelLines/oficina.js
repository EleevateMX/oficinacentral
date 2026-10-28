// Línea "Oficina": Escritorios, archiveros y sillas de trabajo.
// Mismo formato que shared/hotelCatalog.js + line: 'oficina'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'oficina', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'oficina', ...o });

export default [
  F('oficina_silla', 'Silla de oficina', 'sillas', { h: 1.3, sit: 0.7, price: 10, colors: ['#2b2d38', '#3a86ff', '#FE3377', '#2fb67c'] }),
  F('oficina_escritorio', 'Escritorio de trabajo', 'mesas', { w: 2, h: 0.9, stack: true, price: 14, colors: ['#c79a6b', '#f1efe9', '#3a3e4c'] }),
  F('oficina_laptop', 'Laptop', 'deco', { h: 0.3, interact: 'toggle', states: 2, price: 12 }),
  F('oficina_archivero', 'Archivero', 'deco', { h: 1.5, stack: true, interact: 'toggle', states: 2, price: 9, colors: ['#9aa3ad', '#e8e3d8', '#FE3377'] }),
  F('oficina_copiadora', 'Copiadora', 'deco', { h: 1.05, interact: 'toggle', states: 2, price: 18 }),
  F('oficina_garrafon', 'Garrafón de agua', 'deco', { h: 1.6, interact: 'toggle', states: 2, price: 10 }),
  F('oficina_mampara', 'Mampara de cubículo', 'deco', { w: 2, h: 1.3, rots: [0, 2], price: 6, colors: ['#5b6b8a', '#7d8f6e', '#b8656f'] }),
  F('oficina_planta', 'Planta de oficina', 'plantas', { h: 1.5, rots: [0], price: 6 }),
  W('oficina_pizarron', 'Pizarrón blanco', 'pared', { w: 2, price: 8 }),
];
