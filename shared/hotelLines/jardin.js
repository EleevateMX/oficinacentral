// Línea "Jardín": Exterior: fuente, bancas, flores, alberca.
// Mismo formato que shared/hotelCatalog.js + line: 'jardin'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'jardin', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'jardin', ...o });

export default [
  F('jardin_bench', 'Banca de parque', 'sillas', { w: 2, h: 1.05, sit: 0.55, price: 12, colors: ['#b5794a', '#2fb67c', '#f4f4f6'] }),
  F('jardin_lounger', 'Camastro', 'camas', { w: 1, l: 2, h: 0.4, lay: true, price: 14, colors: ['#f4f4f6', '#FE3377', '#3a86ff', '#FFCC00'] }),
  F('jardin_fountain', 'Fuente de piedra', 'deco', { w: 2, l: 2, h: 1.5, rots: [0], interact: 'toggle', states: 2, price: 45 }),
  F('jardin_pool', 'Alberca', 'diversion', { w: 3, l: 3, h: 0.02, walk: true, rots: [0], price: 60 }),
  F('jardin_flowerbed', 'Jardinera con flores', 'plantas', { w: 2, h: 0.75, rots: [0, 2], price: 10, colors: ['#FE3377', '#FFCC00', '#8e5cf7', '#f4f4f6'] }),
  F('jardin_umbrella', 'Sombrilla', 'deco', { h: 2.3, rots: [0], price: 15, colors: ['#FE3377', '#FFCC00', '#2fb67c', '#3a86ff'] }),
  F('jardin_lamp', 'Farol de jardín', 'luz', { h: 2.1, rots: [0], interact: 'toggle', states: 2, price: 16 }),
  F('jardin_grass', 'Pasto', 'pisos', { h: 0.02, walk: true, rots: [0], price: 2, colors: ['#4caf50', '#7cbf4a', '#2e8b57'] }),
  W('jardin_birdhouse', 'Casita de pájaros', 'pared', { price: 8, colors: ['#e8743b', '#3a86ff', '#FE3377'] }),
];
