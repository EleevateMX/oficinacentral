// Línea "Exclusivo HUB": Solo admins: rarezas de la marca.
// Mismo formato que shared/hotelCatalog.js + line: 'hub'. Todas son exclusivas (solo admins las compran).
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'hub', exclusive: true, ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'hub', exclusive: true, ...o });

export default [
  F('hub_throne', 'Trono dorado del logo', 'gtahub', { h: 2.6, sit: 0.8, price: 1200 }),
  F('hub_sofa_vip', 'Sofá VIP de terciopelo', 'gtahub', { w: 2, h: 1.2, sit: 0.6, price: 600, colors: ['#FE3377', '#141414', '#7b2cbf'] }),
  F('hub_arch', 'Arco de neón HUB', 'gtahub', { w: 3, h: 3, interact: 'toggle', states: 2, price: 900 }),
  F('hub_holo', 'Pedestal holográfico', 'gtahub', { h: 1.9, rots: [0], interact: 'toggle', states: 2, price: 1000 }),
  F('hub_crown_lamp', 'Lámpara corona', 'gtahub', { h: 1.9, rots: [0], interact: 'toggle', states: 2, price: 350 }),
  F('hub_trophy', 'Trofeo de oro legendario', 'gtahub', { h: 1.4, rots: [0], price: 500 }),
  F('hub_dragon', 'Dragón guardián dorado', 'gtahub', { h: 2.4, price: 1500 }),
  F('hub_rope', 'Cordón VIP', 'gtahub', { h: 1, rots: [0, 2], interact: 'gate', states: 2, price: 200 }),
  F('hub_teleport', 'Teletransportador HUB', 'gtahub', { h: 2.4, rots: [0], interact: 'teleport', states: 2, price: 800 }),
  F('hub_flag', 'Bandera pixel HUB', 'gtahub', { h: 2.7, rots: [0, 2], price: 150 }),
  F('hub_rug', 'Alfombra roja VIP', 'gtahub', { w: 1, l: 3, h: 0.02, walk: true, rots: [0, 2], price: 250 }),
  W('hub_neon_wall', 'Neón de pared HUB', 'gtahub', { w: 2, interact: 'toggle', states: 2, price: 300 }),
];
