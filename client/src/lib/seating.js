// Cómo se acomoda el personaje en cada asiento (silla, sillón, sofá, banca, banco, puff).
// Devuelve el desplazamiento del personaje respecto a donde estaría parado y, si hace falta,
// la franja del mueble que se vuelve a pintar ENCIMA (respaldo visto por detrás, brazo
// del sillón del lado de la cámara, el frente del puff…), como en Gather.
import { TILE as T } from '@shared/map.js';
import { objSize } from '@shared/catalog.js';

// Acciones que te ponen de pie aunque estés sentado (las demás se hacen sentado)
export const STAND_EMOTES = new Set(['dance', 'jump', 'spin', 'hug', 'highfive']);

// Sillas con respaldo alto (en render.js el respaldo visto por detrás empieza en y+8; las bajas en y+10)
const TALL = { officeChair: true, gamingChair: true };
const CHAIRS = { chair: true, gamingChair: true, officeChair: true, confChair: true };
const SOFAS = { sofa: true, sofaSmall: true, armchair: true };

// seat: { dir, obj } de seatAt(); tx, ty: casilla donde está el personaje.
// → { dx, dy, front: {x, y, w, h} | null } en píxeles del mundo
export function seatPose(seat, tx, ty) {
  const o = seat?.obj;
  if (!o) return { dx: 0, dy: 0, front: null };
  const dir = seat.dir;
  const { w, h } = objSize(o);
  const X = o.x * T, Y = ty * T;
  const side = dir === 'left' || dir === 'right';
  const toBack = dir === 'right' ? -1 : 1; // hacia dónde queda el respaldo en x
  const full = (y0, hh = T) => ({ x: X - 6, y: y0, w: w * T + 12, h: hh });
  if (CHAIRS[o.type]) {
    if (dir === 'up') return TALL[o.type] ? { dx: 0, dy: -14, front: full(Y + 7, T) } : { dx: 0, dy: -12, front: full(Y + 9, T) };
    if (dir === 'down') return { dx: 0, dy: -4, front: null };
    // de lado: espalda pegada al respaldo; el brazo cercano y la base quedan delante de las piernas
    return { dx: toBack, dy: -12, front: full(Y + 15, 20) };
  }
  if (SOFAS[o.type]) {
    if (dir === 'down') return { dx: 0, dy: -8, front: null };
    if (dir === 'up') return { dx: 0, dy: -12, front: full(Y + 8, T) };
    // de lado: solo la última casilla tiene el brazo del lado de la cámara
    const last = ty === o.y + h - 1;
    return { dx: -toBack, dy: -12, front: last ? full((o.y + h) * T - 13, 16) : null };
  }
  if (o.type === 'bench') {
    if (side) return { dx: 0, dy: -10, front: null };
    return { dx: 0, dy: dir === 'up' ? -12 : -7, front: null };
  }
  if (o.type === 'stool') {
    if (dir === 'down') return { dx: 0, dy: -11, front: null };
    return { dx: 0, dy: -14, front: null };
  }
  if (o.type === 'beanBag') {
    // se hunde: el frente del puff tapa los pies
    if (dir === 'up') return { dx: 0, dy: -8, front: full(Y + 20, 14) };
    return { dx: 0, dy: -3, front: full(Y + 21, 14) };
  }
  return { dx: 0, dy: 0, front: null };
}
