// Línea "Pura Vida": Moderna en colores: refris, lámparas, camas.
// Mismo formato que shared/hotelCatalog.js + line: 'puravida'.
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'puravida', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'puravida', ...o });

const POP = ['#3ccfb4', '#ff6b5e', '#ffd84d', '#4aa8ff', '#b48cff'];

export default [
  F('puravida_chair', 'Silla Concha', 'sillas', { h: 1.3, sit: 0.62, price: 6, colors: [POP[1], POP[0], POP[2], POP[3], POP[4]] }),
  F('puravida_sofa', 'Sofá Pura Vida', 'sillas', { w: 2, h: 0.95, sit: 0.58, price: 14, colors: [POP[0], POP[1], POP[2], POP[3]] }),
  F('puravida_table', 'Mesa redonda Pura Vida', 'mesas', { h: 0.76, stack: true, rots: [0], price: 7, colors: [POP[1], POP[0], POP[2], POP[3]] }),
  F('puravida_bed', 'Cama Pura Vida', 'camas', { w: 2, l: 2, h: 0.55, lay: true, price: 20, colors: [POP[1], POP[0], POP[3], POP[4]] }),
  F('puravida_lamp', 'Lámpara globo', 'luz', { h: 1.8, rots: [0], interact: 'toggle', states: 2, price: 9, colors: [POP[1], POP[0], POP[2], POP[4]] }),
  F('puravida_fridge', 'Refri retro', 'deco', { h: 1.85, interact: 'toggle', states: 2, price: 22, colors: [POP[0], POP[1], POP[2], POP[3]] }),
  F('puravida_cubes', 'Librero de cubos', 'deco', { w: 2, h: 1.6, stack: true, price: 13 }),
  W('puravida_poster', 'Póster atardecer', 'pared', { price: 5 }),
];
