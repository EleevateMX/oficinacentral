// Hotel (agente D): acciones del personaje que se piden por el chat.
//   :cartel N / :sign N   → levanta un cartel con un número (0–10) por 5 s
//   :efecto nombre        → brillos, fuego, fantasma, neon, reflector (solo admin); ":efecto" solo lo quita
//   :sentarse / :sit      → sentarse en el piso donde estás (otra vez = pararse)
//   :mano objeto          → (staff) algo en la mano: refresco, cafe, agua, helado, palomitas, rosa
//   :dormir               → Zzz (también solito tras 5 min sin hacer nada; cualquier acción lo despierta)
// Los campos `sign`, `effect` y `act: 'sleep'` viajan en los eventos `hotel:user` (ver userState en hotel.js).
import { chatCommands, hotelCtx } from './hotel.js';
import { HAND_ITEMS } from '../shared/sprite.js';

export const SIGN_MS = Number(process.env.HOTEL_SIGN_MS) || 5000;
export const AFK_MS = Number(process.env.HOTEL_AFK_MS) || 5 * 60 * 1000;
export const EFFECTS = ['brillos', 'fuego', 'fantasma', 'neon', 'reflector'];
const ADMIN_EFFECTS = new Set(['reflector']);
const EFFECT_ALIAS = { sparkles: 'brillos', fire: 'fuego', ghost: 'fantasma', spotlight: 'reflector', luz: 'reflector' };
const OFF = new Set(['', 'no', 'ninguno', 'nada', 'quitar', 'off', 'none']);

const effects = new Map(); // uid → efecto (se conserva al cambiar de sala)
const lastActive = new Map(); // uid → ms
let ready = false;
let sweeper = null;

const roomOf = (uid) => {
  const w = hotelCtx.where.get(uid);
  const R = w && hotelCtx.live.get(w.roomId);
  const U = R?.users.get(uid);
  return U ? { R, U } : null;
};

function setup() {
  if (ready) return;
  ready = true;
  hotelCtx.userInit.push((U) => {
    lastActive.set(U.id, Date.now());
    U.effect = effects.get(U.id) ?? null;
    U.sign = null;
  });

  const sign = ({ R, U, args, err }) => {
    const n = Number(args[0]);
    if (!Number.isInteger(n) || n < 0 || n > 10) { err('Usa :cartel y un número del 0 al 10'); return true; }
    clearTimeout(U.signTimer);
    U.sign = n;
    if (U.act === 'sleep' || U.act === 'dance') U.act = null;
    hotelCtx.emitUser(R, U);
    U.signTimer = setTimeout(() => {
      if (U.sign == null || R.users.get(U.id) !== U) return;
      U.sign = null;
      hotelCtx.emitUser(R, U);
    }, SIGN_MS);
    return true;
  };
  chatCommands.set(':cartel', sign);
  chatCommands.set(':sign', sign);

  const effect = ({ R, U, args, userId, err }) => {
    let name = String(args[0] || '').toLowerCase();
    name = EFFECT_ALIAS[name] || name;
    if (OFF.has(name)) name = null;
    else if (!EFFECTS.includes(name)) { err(`Efectos: ${EFFECTS.filter((e) => !ADMIN_EFFECTS.has(e) || hotelCtx.isAdmin(userId)).join(', ')} (o ":efecto" para quitarlo)`); return true; }
    else if (ADMIN_EFFECTS.has(name) && !hotelCtx.isAdmin(userId)) { err('Ese efecto es solo para el staff'); return true; }
    if (name === U.effect || (!name && !U.effect)) name = null; // repetirlo lo quita
    U.effect = name;
    if (name) effects.set(userId, name); else effects.delete(userId);
    hotelCtx.emitUser(R, U);
    return true;
  };
  chatCommands.set(':efecto', effect);
  chatCommands.set(':effect', effect);

  const sit = ({ R, U }) => {
    if (U.path || U.lay) return true;
    const t = hotelCtx.tileInfo(R.grid, U.x, U.y);
    if (t?.kind === 'sit') return true;
    U.sit = U.sit ? null : { floor: true };
    if (U.act !== 'sleep') U.act = null;
    hotelCtx.emitUser(R, U);
    return true;
  };
  for (const c of [':sentarse', ':sentar', ':sit']) chatCommands.set(c, sit);

  const sleep = ({ R, U }) => {
    if (U.act === 'sleep') return true;
    U.act = 'sleep';
    U.sign = null;
    hotelCtx.emitUser(R, U);
    return true;
  };
  for (const c of [':dormir', ':sleep', ':afk']) chatCommands.set(c, sleep);

  // Staff: ponerse algo en la mano (para probar o para eventos); las máquinas de la sala también lo hacen
  const hand = ({ R, U, args, userId, err }) => {
    if (!hotelCtx.isAdmin(userId)) return false;
    const item = String(args[0] || '').toLowerCase();
    if (item && !HAND_ITEMS.includes(item)) { err(`Objetos: ${HAND_ITEMS.join(', ')}`); return true; }
    U.hand = item || null;
    hotelCtx.emitUser(R, U);
    return true;
  };
  chatCommands.set(':mano', hand);

  // Quien no hace nada por un rato se queda dormido
  sweeper = setInterval(() => sweepAfk(), Math.max(1000, Math.min(30000, AFK_MS / 3)));
  sweeper.unref?.();
}

export function sweepAfk(t = Date.now()) {
  for (const R of hotelCtx.live.values()) {
    for (const U of R.users.values()) {
      if (U.act || U.path) continue;
      const last = lastActive.get(U.id) ?? t;
      if (t - last >= AFK_MS) { U.act = 'sleep'; U.sign = null; hotelCtx.emitUser(R, U); }
    }
  }
}

const SLEEP_CMDS = /^:(dormir|sleep|afk)\b/i;
export function initHotelAvatar(socket, userId) {
  setup();
  const awake = () => {
    lastActive.set(userId, Date.now());
    const r = roomOf(userId);
    if (r && r.U.act === 'sleep') { r.U.act = null; hotelCtx.emitUser(r.R, r.U); }
  };
  for (const ev of ['hotel:walk', 'hotel:act', 'hotel:look', 'hotel:sit', 'hotel:use']) socket.on(ev, awake);
  socket.on('hotel:typing', (on) => { if (on) awake(); });
  socket.on('hotel:chat', (m) => { if (!SLEEP_CMDS.test(String(m?.text || '').trim())) awake(); });
}
