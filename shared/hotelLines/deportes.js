// Línea "Deportes": Gym, porterías, aros de básquet.
// Mismo formato que shared/hotelCatalog.js + line: 'deportes'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'deportes', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'deportes', ...o });

export default [
  F('deportes_treadmill', 'Caminadora', 'diversion', { l: 2, h: 1.4, interact: 'toggle', states: 2, price: 30 }),
  F('deportes_bench', 'Banca de pesas', 'sillas', { l: 2, h: 1.3, sit: 0.5, price: 22, colors: ['#FE3377', '#141414', '#3a86ff'] }),
  F('deportes_dumbbells', 'Rack de mancuernas', 'deco', { w: 2, h: 0.95, price: 18 }),
  F('deportes_bag', 'Costal de box', 'diversion', { h: 2.5, rots: [0, 2], interact: 'toggle', states: 2, price: 20, colors: ['#d62839', '#141414', '#FE3377'] }),
  F('deportes_hoop', 'Aro de básquet', 'diversion', { h: 3.1, price: 35 }),
  F('deportes_goal', 'Portería', 'diversion', { w: 3, h: 1.6, price: 40 }),
  F('deportes_ball', 'Balón (fútbol / básquet)', 'diversion', { h: 0.45, rots: [0], interact: 'toggle', states: 2, price: 5 }),
  F('deportes_mat', 'Tapete de ejercicio', 'pisos', { l: 2, h: 0.03, walk: true, rots: [0, 2], price: 6, colors: ['#3a86ff', '#FE3377', '#2fb67c', '#8e5cf7'] }),
  W('deportes_scoreboard', 'Marcador', 'pared', { w: 2, interact: 'toggle', states: 2, price: 25 }),
];
