// Línea "Economía HUB": monedas que se canjean por créditos y la caja de regalo.
// Mismo formato que shared/hotelCatalog.js + line: 'economia'.
//   coin: créditos que da al canjearla (doble clic o "Canjear"; el furni desaparece)
//   noShop: no se vende suelta (la caja de regalo solo envuelve a otro furni)
const F = (id, name, cat, o) => ({ id, name, cat, kind: 'floor', w: 1, l: 1, h: 1, rots: [0], states: 1, line: 'economia', ...o });

export default [
  F('economia_moneda', 'Moneda HUB', 'diversion', { h: 0.12, price: 10, coin: 10, interact: 'coin' }),
  F('economia_monedas', 'Pila de monedas HUB', 'diversion', { h: 0.4, price: 50, coin: 50, interact: 'coin' }),
  F('economia_lingote', 'Lingote HUB', 'diversion', { h: 0.3, rots: [0, 2], price: 100, coin: 100, interact: 'coin' }),
  F('economia_cofre', 'Cofre de lingotes HUB', 'diversion', { h: 0.75, rots: [0, 2, 4, 6], price: 500, coin: 500, interact: 'coin' }),
  F('economia_regalo', 'Regalo', 'diversion', { h: 0.8, price: 0, interact: 'present', noShop: true, colors: ['#FE3377', '#FFCC00', '#3a86ff', '#2fb67c', '#141414'] }),
];
