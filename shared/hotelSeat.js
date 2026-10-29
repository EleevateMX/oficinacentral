// Hotel: dónde se acomoda quien se acuesta en una cama (lo usan el servidor y el motor).
import { FURNI_BY_ID, footprint } from './hotelCatalog.js';
import { tileInfo } from './hotelRoom.js';

// Vector hacia donde mira el frente del furni (pie de la cama): rot 0 → +y, 2 → −x, 4 → −y, 6 → +x
const FRONT = { 0: [0, 1], 2: [-1, 0], 4: [0, -1], 6: [1, 0] };
export const frontOf = (rot) => FRONT[rot] || FRONT[0];

// Casilla de la almohada de una cama para alguien que llega a (x, y): misma fila/columna a lo ancho,
// pegada a la cabecera. null si no es cama.
export function bedHeadTile(item, x, y) {
  const def = FURNI_BY_ID[item?.type];
  if (!def?.lay) return null;
  const { w, l } = footprint(def, item.rot);
  const [fx, fy] = frontOf(item.rot);
  const hx = fx > 0 ? item.x : fx < 0 ? item.x + w - 1 : x;
  const hy = fy > 0 ? item.y : fy < 0 ? item.y + l - 1 : y;
  return { x: hx, y: hy };
}

// Si el destino es una cama, regresa la casilla de la almohada (si está libre); si no, null
export function layHeadTile(room, to, occupied = new Set()) {
  const t = tileInfo(room, to.x, to.y);
  if (t?.kind !== 'lay') return null;
  const h = bedHeadTile(t.item, to.x, to.y);
  if (!h || (h.x === to.x && h.y === to.y)) return null;
  const th = tileInfo(room, h.x, h.y);
  if (th?.kind !== 'lay' || th.item.id !== t.item.id || occupied.has(`${h.x},${h.y}`)) return null;
  return h;
}

// Largo de la cama desde la almohada hacia el pie (en casillas)
export function bedLength(item) {
  const def = FURNI_BY_ID[item?.type];
  if (!def) return 2;
  const { w, l } = footprint(def, item.rot);
  return item.rot === 2 || item.rot === 6 ? w : l;
}
