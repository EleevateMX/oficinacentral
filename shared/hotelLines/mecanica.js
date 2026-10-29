// Línea "Mecánica y Wired": rodillos, puerta de un sentido, máquinas expendedoras (objetos en la mano),
// rueda de la fortuna, medidor de amor, marcador, trofeo con dedicatoria, regulador de luz y wired.
// Mismo formato que shared/hotelCatalog.js + line: 'mecanica'. La lógica vive en server/hotelMechanics.js
// y server/hotelWired.js.
//   interact propios: 'roller' · 'oneway' · 'vend' (vend: id del objeto en la mano) · 'wheel' · 'love' ·
//                     'score' · 'trophy' · 'dimmer' · 'wired' (wired: { kind: 'trigger' | 'effect', type })
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0, 2, 4, 6], states: 1, line: 'mecanica', ...o });
const W = (id, name, cat, o) => ({ id, name, cat, kind: 'wall', w: 1, l: 1, h: 0, rots: [2, 4], states: 1, line: 'mecanica', ...o });
const WF = (type, name, o = {}) => F(`mecanica_wf_${type}`, name, 'diversion', { h: 0.45, stack: true, rots: [0], interact: 'wired', states: 2, price: 8, wired: { kind: 'trigger', type }, ...o });
const WE = (type, name, o = {}) => F(`mecanica_we_${type}`, name, 'diversion', { h: 0.45, stack: true, rots: [0], interact: 'wired', states: 2, price: 8, wired: { kind: 'effect', type }, ...o });

export default [
  // Mecánica
  F('mecanica_roller', 'Rodillo', 'diversion', { h: 0.35, walk: true, interact: 'roller', states: 1, price: 15, colors: ['#3a3f4a', '#FE3377', '#FFCC00'] }),
  F('mecanica_oneway', 'Puerta de un sentido', 'diversion', { h: 2.2, interact: 'oneway', states: 2, price: 20, colors: ['#2b2d38', '#FE3377', '#3a86ff'] }),
  // Máquinas expendedoras: dan un objeto para la mano
  F('mecanica_vending_soda', 'Expendedora de refrescos', 'deco', { h: 2.1, interact: 'vend', vend: 'refresco', states: 2, price: 24, colors: ['#e63946', '#3a86ff', '#141414'] }),
  F('mecanica_vending_coffee', 'Máquina de café', 'deco', { h: 1.9, interact: 'vend', vend: 'cafe', states: 2, price: 22, colors: ['#2b2d38', '#7a4a2b', '#f4f4f6'] }),
  F('mecanica_icecream', 'Carrito de helados', 'deco', { w: 2, h: 1.5, interact: 'vend', vend: 'helado', states: 2, price: 26, colors: ['#ffb3cf', '#9fe3ff', '#fff1a8'] }),
  F('mecanica_popcorn', 'Máquina de palomitas', 'deco', { h: 1.8, interact: 'vend', vend: 'palomitas', states: 2, price: 20, colors: ['#e63946', '#FFCC00'] }),
  F('mecanica_roses', 'Cubeta de rosas', 'deco', { h: 0.9, rots: [0], interact: 'vend', vend: 'rosa', states: 2, price: 12, colors: ['#e63946', '#FE3377', '#f4f4f6'] }),
  // Diversión
  F('mecanica_wheel', 'Rueda de la fortuna', 'diversion', { h: 2.3, rots: [0, 6], interact: 'wheel', states: 12, price: 30 }),
  F('mecanica_love', 'Medidor de amor', 'diversion', { w: 2, h: 1, sit: 0.55, interact: 'love', states: 103, price: 30, colors: ['#FE3377', '#8e5cf7', '#e63946'] }),
  F('mecanica_scoreboard', 'Marcador', 'diversion', { h: 1.7, interact: 'score', states: 100, price: 18, colors: ['#141414', '#2b4a8a', '#7a1f2b'] }),
  F('mecanica_trophy', 'Trofeo con dedicatoria', 'deco', { h: 1.1, rots: [0, 6], interact: 'trophy', states: 1, price: 14, colors: ['#FFCC00', '#c0c6cf', '#d08a4a'] }),
  W('mecanica_dimmer', 'Regulador de luz', 'luz', { interact: 'dimmer', states: 2, price: 25 }),
  // Wired: disparadores
  WF('say', 'Wired: al decir una palabra'),
  WF('walk', 'Wired: al pisar un furni'),
  WF('enter', 'Wired: al entrar a la sala'),
  WF('timer', 'Wired: cada N segundos'),
  // Wired: efectos
  WE('toggle', 'Wired: cambiar estado de furnis'),
  WE('tele', 'Wired: teletransportar a un furni'),
  WE('msg', 'Wired: mostrar mensaje'),
  WE('move', 'Wired: mover furni'),
  WE('hand', 'Wired: dar objeto en la mano'),
];

// Objetos que se pueden traer en la mano (contrato con el dibujo del personaje)
export const HAND_ITEMS = {
  refresco: { name: 'Refresco', emoji: '🥤' },
  cafe: { name: 'Café', emoji: '☕' },
  agua: { name: 'Agua', emoji: '💧' },
  helado: { name: 'Helado', emoji: '🍦' },
  palomitas: { name: 'Palomitas', emoji: '🍿' },
  rosa: { name: 'Rosa', emoji: '🌹' },
};
// Furnis de otras líneas que también dan algo en la mano (sin tocar sus definiciones)
export const VEND_EXTRA = { fiesta_soda: 'refresco', fiesta_icecream: 'helado', cocina_coffee: 'cafe', oficina_garrafon: 'agua' };
export const vendOf = (def) => (def ? def.vend || VEND_EXTRA[def.id] || null : null);
export const WIRED_NAMES = {
  say: 'Al decir una palabra', walk: 'Al pisar un furni', enter: 'Al entrar a la sala', timer: 'Cada N segundos',
  toggle: 'Cambiar estado de furnis', tele: 'Teletransportar a un furni', msg: 'Mostrar mensaje', move: 'Mover furni', hand: 'Dar objeto en la mano',
};
