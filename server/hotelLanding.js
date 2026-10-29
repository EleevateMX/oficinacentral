// Hotel (agente D): la vista de llegada ("Hotel view") con el elevador.
// Guarda el aviso/promo que el staff edita (título, texto y botón que lleva a una sala) en settings.
import { getSetting, setSetting } from './db.js';
import { officialKey } from '../shared/hotelOfficialRooms.js';

const KEY = 'hotel_promo';
const CTRL = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g');
const clean = (s, n) => String(s ?? '').replace(CTRL, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const OLD_TITLE = '¡Bienvenido al Hotel GTA' + 'HUB!'; // el título de fábrica de antes (si alguien lo guardó tal cual)
export const DEFAULT_PROMO = {
  title: '¡Bienvenido a MeDed Friends!',
  text: 'Platica en Charla General, sube por el elevador a Roleplay, League of Legends y las demás salas, o decora la tuya.',
  button: 'Ir a League of Legends',
  roomKey: 'lol',
  roomId: null,
};

export function getPromo() {
  let v = null;
  try { v = JSON.parse(getSetting(KEY, 'null')); } catch { v = null; }
  const p = { ...DEFAULT_PROMO, ...(v || {}) };
  // Avisos guardados antes del cambio de salas: la clave vieja ('juegos', 'hq'…) apunta a la sala nueva
  if (p.roomKey) p.roomKey = officialKey(p.roomKey);
  if (p.title === OLD_TITLE) p.title = DEFAULT_PROMO.title;
  return p;
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
