// Hotel (agente D): la vista de llegada ("Hotel view") con el elevador.
// Guarda el aviso/promo que el staff edita (título, texto y botón que lleva a una sala) en settings.
import { getSetting, setSetting } from './db.js';

const KEY = 'hotel_promo';
const CTRL = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g');
const clean = (s, n) => String(s ?? '').replace(CTRL, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const DEFAULT_PROMO = {
  title: '¡Bienvenido al Hotel GTAHUB!',
  text: 'Sube por el elevador a las salas oficiales, decora tu propia sala y conoce a la comunidad.',
  button: 'Ir a la Sala de juegos',
  roomKey: 'juegos',
  roomId: null,
};

export function getPromo() {
  let v = null;
  try { v = JSON.parse(getSetting(KEY, 'null')); } catch { v = null; }
  return { ...DEFAULT_PROMO, ...(v || {}) };
}

export function cleanPromo(b = {}) {
  const roomId = Number(b.roomId);
  return {
    title: clean(b.title, 60),
    text: clean(b.text, 220),
    button: clean(b.button, 30),
    roomKey: /^[a-z0-9_-]{1,24}$/.test(String(b.roomKey || '')) ? String(b.roomKey) : null,
    roomId: Number.isInteger(roomId) && roomId > 0 ? roomId : null,
  };
}

export function registerHotelLanding(api, { fail, wrap }) {
  api.get('/hotel/promo', wrap((req, res) => res.json({ promo: getPromo() })));
  api.put('/hotel/promo', wrap((req, res) => {
    if (req.user?.role !== 'admin') return fail(res, 403, 'Solo el staff puede cambiar el aviso');
    const p = cleanPromo(req.body || {});
    if (!p.title) return fail(res, 400, 'Ponle un título al aviso');
    setSetting(KEY, JSON.stringify(p));
    res.json({ promo: getPromo() });
  }));
}
