// Hotel — Economía: monedero de créditos HUB, compras en la tienda, regalos, códigos de canje,
// monedas canjeables e intercambio seguro entre dos personas en la misma sala.
// Todo se valida aquí (el cliente solo pide); cada movimiento de créditos queda en hotel_credit_log
// y los ajustes de admins además en la bitácora de seguridad (audit).
//
// Reglas (ver shared/hotelEconomy.js):
//   · Bienvenida 500 · premio diario 50 (una vez por día de oficina, OFFICE_TIMEZONE) · 10 por cada 15 min dentro del Hotel.
//   · Los furnis cuestan su `price` (o uno por categoría). Los exclusivos solo los compran admins, sin costo.
//   · Intercambio: los dos aceptan → los dos confirman; cualquier cambio quita los "Aceptar". Se ejecuta en una transacción.
//     Los exclusivos SÍ se pueden intercambiar (son las rarezas del Hotel) y también los regalos sin abrir.
import crypto from 'node:crypto';
import { db, now, tx } from './db.js';
import { audit } from './security.js';
import { FURNI_BY_ID } from '../shared/hotelCatalog.js';
import { MAX_INVENTORY, MAX_FURNI_PER_ROOM, OFFICIAL_MAX_FURNI } from '../shared/hotel.js';
import { canPlace, roomAddItem, roomRemoveItem } from '../shared/hotelRoom.js';
import * as E from '../shared/hotelEconomy.js';
import { hotelCtx as H } from './hotel.js';

db.exec(`
CREATE TABLE IF NOT EXISTS hotel_wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 0,
  daily_day TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hotel_credit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hotel_credit_log_user ON hotel_credit_log(user_id, id);
CREATE TABLE IF NOT EXISTS hotel_presents (
  item_id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  color TEXT,
  from_id INTEGER,
  message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hotel_vouchers (
  code TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0,
  furni TEXT,
  furni_color TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hotel_voucher_uses (
  code TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (code, user_id)
);
CREATE TABLE IF NOT EXISTS hotel_trade_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id INTEGER NOT NULL, b_id INTEGER NOT NULL,
  a_items TEXT NOT NULL, b_items TEXT NOT NULL,
  a_credits INTEGER NOT NULL DEFAULT 0, b_credits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

const TZ = () => process.env.OFFICE_TIMEZONE || 'America/Mexico_City';
const envMs = (k, d, min) => Math.max(min, Number(process.env[k]) || d);
const ONLINE_EVERY = envMs('HOTEL_ONLINE_EVERY_MS', E.ONLINE_EVERY_MS, 500);
const ONLINE_TICK = envMs('HOTEL_ONLINE_TICK_MS', 60e3, 100);
const TRADE_SWEEP = envMs('HOTEL_TRADE_SWEEP_MS', 1500, 100);
let clock = () => now();

class EcoError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const fmt = (n) => Number(n || 0).toLocaleString('es-MX');
const nameOf = (uid) => H.getUser(uid)?.display_name || `#${uid}`;
const rl = (map, k, n, ms) => {
  const t = Date.now();
  const a = (map.get(k) || []).filter((x) => t - x < ms);
  map.set(k, a);
  if (a.length >= n) return false;
  a.push(t);
  return true;
};

// ---------- Monedero ----------
const walletRow = (uid) => db.prepare('SELECT * FROM hotel_wallets WHERE user_id = ?').get(uid);
function logMove(uid, delta, balance, reason, note = '', actor = null) {
  db.prepare('INSERT INTO hotel_credit_log (user_id, delta, balance, reason, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uid, delta, balance, reason, String(note).slice(0, 120), actor, now());
}
export function ensureWallet(uid) {
  let w = walletRow(uid);
  if (w) return w;
  if (!H.getUser(uid)) throw new EcoError('Esa persona no existe', 404);
  db.prepare('INSERT OR IGNORE INTO hotel_wallets (user_id, credits, created_at) VALUES (?, ?, ?)').run(uid, E.START_CREDITS, now());
  logMove(uid, E.START_CREDITS, E.START_CREDITS, 'start', 'Regalo de bienvenida');
  return walletRow(uid);
}
export const balanceOf = (uid) => ensureWallet(uid).credits;
// Suma o resta créditos (dentro de una transacción si va junto con otros cambios). Nunca deja saldo negativo.
function move(uid, delta, reason, note = '', actor = null) {
  const d = Math.trunc(delta);
  if (!d) return balanceOf(uid);
  const w = ensureWallet(uid);
  const next = w.credits + d;
  if (next < 0) throw new EcoError(d < 0 && reason !== 'admin' ? `Te faltan ${fmt(-next)} créditos HUB` : `Solo tiene ${fmt(w.credits)} créditos HUB`, 402);
  if (next > E.MAX_CREDITS) throw new EcoError('Se pasa del máximo de créditos');
  db.prepare('UPDATE hotel_wallets SET credits = ? WHERE user_id = ?').run(next, uid);
  logMove(uid, d, next, reason, note, actor);
  return next;
}
function pushWallet(uid, extra = {}) {
  H.IO?.to(`user:${uid}`).emit('hotel:wallet', { credits: balanceOf(uid), ...extra });
}
const logOf = (uid, n = 25) => db.prepare('SELECT id, delta, balance, reason, note, created_at FROM hotel_credit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(uid, n)
  .map((r) => ({ id: r.id, delta: r.delta, balance: r.balance, reason: r.reason, note: r.note, at: r.created_at }));

// Premio diario (una vez por día de oficina)
export function claimDaily(uid, t = clock()) {
  const w = ensureWallet(uid);
  if (!E.dailyDue(w.daily_day, t, TZ())) return 0;
  tx(() => {
    db.prepare('UPDATE hotel_wallets SET daily_day = ? WHERE user_id = ?').run(E.officeDay(t, TZ()), uid);
    move(uid, E.DAILY_CREDITS, 'daily', 'Premio diario');
  });
  return E.DAILY_CREDITS;
}

// Tiempo dentro del Hotel: +10 cada 15 minutos (se revisa cada minuto)
const online = new Map(); // uid → { last, acc }
export function onlineTick(t = clock()) {
  for (const uid of H.where.keys()) {
    const r = E.accrueOnline(online.get(uid), t, { every: ONLINE_EVERY, cap: Math.max(ONLINE_TICK * 3, 5 * 60e3) });
    online.set(uid, r.state);
    try {
      const daily = claimDaily(uid, t);
      if (daily) pushWallet(uid, { delta: daily, reason: 'daily' });
      if (r.pay) { move(uid, r.pay * E.ONLINE_CREDITS, 'online', 'Tiempo en el Hotel'); pushWallet(uid, { delta: r.pay * E.ONLINE_CREDITS, reason: 'online' }); }
    } catch (e) { console.error('[hotel] economía:', e.message); }
  }
  for (const [uid, s] of online) if (!H.where.has(uid)) s.last = null; // al volver a entrar se cuenta desde ahí
}

// ---------- Furnis ----------
const itemRow = (id) => db.prepare('SELECT * FROM hotel_items WHERE id = ?').get(Number(id));
const colorFor = (def, c) => (typeof c === 'string' && def.colors?.includes(c) ? c : def.colors?.[0] || null);
function presentOf(itemId) {
  const p = db.prepare('SELECT p.*, u.display_name AS from_name FROM hotel_presents p LEFT JOIN users u ON u.id = p.from_id WHERE item_id = ?').get(itemId);
  return p ? { type: p.type, color: p.color, fromId: p.from_id, fromName: p.from_name || 'Alguien', message: p.message } : null;
}
function makePresent(to, from, type, color, wrap, message) {
  const id = H.addItem(to, E.PRESENT_TYPE, wrap, {});
  db.prepare('INSERT INTO hotel_presents (item_id, type, color, from_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, type, color, from, message, now());
  return H.itemOut(itemRow(id));
}

// ---------- Intercambios ----------
const trades = new Map(); // uid → T (los dos lados apuntan al mismo)
const invites = new Map(); // destino → { from, at }
let tradeSeq = 0;
const otherOf = (T, uid) => (uid === T.a ? T.b : T.a);
const roomOf = (uid) => H.where.get(uid)?.roomId ?? null;
const sockOf = (uid) => H.where.get(uid)?.socket || null;
function offerItems(ids) {
  return ids.map((id) => itemRow(id)).filter(Boolean).map(H.itemOut);
}
function tradeView(T, uid) {
  const o = otherOf(T, uid);
  return {
    id: T.id, phase: T.phase, v: T.v,
    other: { id: o, name: nameOf(o) },
    mine: { items: offerItems(T.offers[uid].items), credits: T.offers[uid].credits },
    theirs: { items: offerItems(T.offers[o].items), credits: T.offers[o].credits },
    accepted: { mine: T.accepted[uid], theirs: T.accepted[o] },
    confirmed: { mine: T.confirmed[uid], theirs: T.confirmed[o] },
  };
}
function sendTrade(T) {
  for (const uid of [T.a, T.b]) sockOf(uid)?.emit('hotel:trade', tradeView(T, uid));
}
function endTrade(T, reason, extra = {}) {
  if (trades.get(T.a) === T) trades.delete(T.a);
  if (trades.get(T.b) === T) trades.delete(T.b);
  T.phase = T.phase === 'done' ? 'done' : 'ended';
  for (const uid of [T.a, T.b]) H.IO?.to(`user:${uid}`).emit('hotel:trade:end', { id: T.id, reason, by: extra.by ?? null, ok: !!extra.ok, received: extra.received?.[uid] || null });
}
// ¿Siguen las dos personas en la misma sala y los furnis de cada oferta en su inventario?
function sweepTrades() {
  for (const T of new Set(trades.values())) {
    if (T.phase === 'ended' || T.phase === 'done') continue;
    const ra = roomOf(T.a), rb = roomOf(T.b);
    if (ra == null || rb == null || ra !== rb || ra !== T.roomId) { endTrade(T, 'left'); continue; }
    let changed = false;
    for (const uid of [T.a, T.b]) {
      const ok = T.offers[uid].items.filter((id) => { const r = itemRow(id); return r && r.owner_id === uid && r.room_id == null; });
      if (ok.length !== T.offers[uid].items.length) { E.tradeSetOffer(T, uid, { items: ok }); changed = true; }
    }
    if (changed) sendTrade(T);
  }
  for (const [to, inv] of invites) if (Date.now() - inv.at > 60e3) invites.delete(to);
}
// Ejecuta el intercambio en UNA transacción: o pasa todo o no pasa nada
function executeTrade(T) {
  const moved = { [T.a]: [], [T.b]: [] };
  tx(() => {
    for (const uid of [T.a, T.b]) {
      for (const id of T.offers[uid].items) {
        const r = itemRow(id);
        if (!r || r.owner_id !== uid || r.room_id != null) throw new EcoError('Uno de los furnis ya no está disponible: el intercambio se canceló');
        if (!FURNI_BY_ID[r.type]) throw new EcoError('Uno de los furnis ya no existe');
      }
      if (balanceOf(uid) < T.offers[uid].credits) throw new EcoError(`${nameOf(uid)} ya no tiene los créditos que ofreció`);
    }
    for (const uid of [T.a, T.b]) {
      const o = otherOf(T, uid);
      const after = H.invCount(uid) - T.offers[uid].items.length + T.offers[o].items.length;
      if (after > MAX_INVENTORY) throw new EcoError(`El inventario de ${nameOf(uid)} no tiene espacio`);
    }
    const up = db.prepare('UPDATE hotel_items SET owner_id = ? WHERE id = ? AND owner_id = ? AND room_id IS NULL');
    for (const uid of [T.a, T.b]) {
      const o = otherOf(T, uid);
      for (const id of T.offers[uid].items) {
        if (!up.run(o, id, uid).changes) throw new EcoError('Uno de los furnis ya no está disponible');
        moved[o].push(id);
      }
      const c = T.offers[uid].credits;
      if (c) { move(uid, -c, 'trade', `Intercambio con ${nameOf(o)}`); move(o, c, 'trade', `Intercambio con ${nameOf(uid)}`); }
    }
    db.prepare('INSERT INTO hotel_trade_log (a_id, b_id, a_items, b_items, a_credits, b_credits, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(T.a, T.b, JSON.stringify(T.offers[T.a].items), JSON.stringify(T.offers[T.b].items), T.offers[T.a].credits, T.offers[T.b].credits, now());
  });
  const received = {};
  for (const uid of [T.a, T.b]) {
    const o = otherOf(T, uid);
    const add = moved[uid].map((id) => H.itemOut(itemRow(id)));
    received[uid] = { items: add.map((i) => i.type), credits: T.offers[o].credits };
    H.IO?.to(`user:${uid}`).emit('hotel:inv', { remove: T.offers[uid].items, add });
    pushWallet(uid, T.offers[o].credits || T.offers[uid].credits ? { reason: 'trade' } : {});
  }
  endTrade(T, 'done', { ok: true, received });
}

// ---------- Tiempo real (por socket) ----------
// Se arranca una sola vez (no al importar: hotel.js y este módulo se importan entre sí)
let ready = false;
function setup() {
  if (ready) return;
  ready = true;
  H.useHandlers.set('coin', useCoin);
  H.useHandlers.set('present', usePresent);
  setInterval(() => { try { onlineTick(); } catch (e) { console.error('[hotel] créditos:', e); } }, ONLINE_TICK).unref();
  setInterval(() => { try { sweepTrades(); } catch (e) { console.error('[hotel] intercambios:', e); } }, TRADE_SWEEP).unref();
}
export function initHotelEconomy(io, socket, userId) {
  setup();
  const rate = new Map();
  const ok = (k, n, ms) => rl(rate, k, n, ms);
  const err = (text) => socket.emit('hotel:notice', { text, error: true });
  const guard = (fn) => (m) => { try { fn(m || {}); } catch (e) { if (e instanceof EcoError) err(e.message); else { console.error('[hotel] economía:', e); err('Algo falló, intenta de nuevo'); } } };
  const inHotel = () => H.where.get(userId)?.socket === socket;

  socket.on('hotel:trade:request', guard((m) => {
    if (!inHotel()) return;
    if (!ok('req', 4, 15e3)) return err('Espera un momento antes de pedir otro intercambio');
    const to = Number(m.userId);
    if (!to || to === userId) return;
    if (roomOf(to) == null || roomOf(to) !== roomOf(userId)) return err('Solo puedes intercambiar con alguien en tu misma sala');
    if (trades.has(userId)) return err('Ya estás en un intercambio');
    if (trades.has(to)) return err(`${nameOf(to)} ya está intercambiando con alguien`);
    invites.set(to, { from: userId, at: Date.now() });
    sockOf(to)?.emit('hotel:trade:invite', { from: userId, name: nameOf(userId) });
    socket.emit('hotel:notice', { text: `🤝 Le pediste un intercambio a ${nameOf(to)}` });
  }));

  socket.on('hotel:trade:answer', guard((m) => {
    const from = Number(m.from);
    const inv = invites.get(userId);
    if (!inv || inv.from !== from) return err('Esa solicitud ya no está vigente');
    invites.delete(userId);
    if (!m.accept) { sockOf(from)?.emit('hotel:notice', { text: `${nameOf(userId)} no quiso intercambiar ahora` }); return; }
    const room = roomOf(userId);
    if (room == null || room !== roomOf(from)) return err('Ya no están en la misma sala');
    if (trades.has(userId) || trades.has(from)) return err('Alguien ya está en otro intercambio');
    const T = Object.assign(E.newTrade(from, userId), { id: ++tradeSeq, roomId: room });
    trades.set(from, T); trades.set(userId, T);
    sendTrade(T);
  }));

  socket.on('hotel:trade:offer', guard((m) => {
    const T = trades.get(userId);
    if (!T) return;
    if (!ok('offer', 20, 5e3)) return err('Más despacio 🙂');
    const patch = {};
    if (Array.isArray(m.items)) {
      const ids = [...new Set(m.items.map(Number))].slice(0, E.MAX_TRADE_ITEMS + 1);
      for (const id of ids) {
        const r = itemRow(id);
        if (!r || r.owner_id !== userId || r.room_id != null) return err('Ese furni no está en tu inventario');
      }
      patch.items = ids;
    }
    if (m.credits != null) {
      const c = Math.trunc(Number(m.credits));
      if (!Number.isFinite(c) || c < 0) return err('Cantidad inválida');
      if (c > balanceOf(userId)) return err(`Solo tienes ${fmt(balanceOf(userId))} créditos HUB`);
      patch.credits = c;
    }
    const r = E.tradeSetOffer(T, userId, patch);
    if (r.error) return err(r.error);
    if (r.changed) sendTrade(T);
  }));

  socket.on('hotel:trade:accept', guard((m) => {
    const T = trades.get(userId);
    if (!T) return;
    const r = E.tradeAccept(T, userId, m.on !== false);
    if (r.error) return err(r.error);
    sendTrade(T);
  }));

  socket.on('hotel:trade:confirm', guard((m) => {
    const T = trades.get(userId);
    if (!T || (m.v != null && Number(m.v) !== T.v)) return err('El intercambio cambió: revísalo otra vez');
    const r = E.tradeConfirm(T, userId);
    if (r.error) return err(r.error);
    if (r.phase !== 'done') return sendTrade(T);
    try { executeTrade(T); } catch (e) {
      endTrade(T, 'failed');
      for (const uid of [T.a, T.b]) H.IO?.to(`user:${uid}`).emit('hotel:notice', { text: e instanceof EcoError ? e.message : 'El intercambio no se pudo completar', error: true });
      if (!(e instanceof EcoError)) console.error('[hotel] intercambio:', e);
    }
  }));

  socket.on('hotel:trade:cancel', guard(() => {
    const T = trades.get(userId);
    if (T) endTrade(T, 'cancel', { by: userId });
    for (const [to, inv] of invites) if (inv.from === userId) invites.delete(to);
  }));
  const later = () => setImmediate(() => { try { sweepTrades(); } catch { /* después */ } });
  socket.on('hotel:leave', later);
  socket.on('hotel:enter', later);
  socket.on('disconnect', later);
}

// Usar monedas y regalos dentro de la sala (doble clic / botón de la tarjeta). Llega desde hotel:use.
function roomRemove(R, it) {
  const tiles = H.footTiles(it);
  if (!it.wall) roomRemoveItem(R.grid, it);
  R.items.delete(it.id);
  H.IO?.to(H.key(R.id)).emit('hotel:item', { op: 'remove', id: it.id });
  H.refreshUsers(R, tiles);
}
function useCoin({ R, it, def, socket, userId }) {
  if (it.ownerId !== userId) return socket.emit('hotel:notice', { text: 'Solo quien es dueño de la moneda puede canjearla', error: true });
  const value = E.coinValue(def);
  if (!value) return;
  try {
    tx(() => {
      if (!db.prepare('DELETE FROM hotel_items WHERE id = ? AND owner_id = ? AND room_id = ?').run(it.id, userId, R.id).changes) throw new EcoError('Esa moneda ya no está');
      move(userId, value, 'coin', def.name);
    });
  } catch (e) { return socket.emit('hotel:notice', { text: e.message, error: true }); }
  roomRemove(R, it);
  H.IO?.to(H.key(R.id)).emit('hotel:coin', { itemId: it.id, x: it.x, y: it.y, z: it.z, amount: value, by: userId });
  pushWallet(userId, { delta: value, reason: 'coin' });
}
function usePresent({ R, it, socket, userId }) {
  const err = (text) => socket.emit('hotel:notice', { text, error: true });
  if (it.ownerId !== userId) return err('Este regalo no es tuyo: solo quien lo recibió puede abrirlo');
  const p = presentOf(it.id);
  const cdef = p && FURNI_BY_ID[p.type];
  if (!cdef) return err('Este regalo está vacío 😕');
  const count = cdef.interact === 'teleport' ? 2 : 1;
  // ¿Cabe justo donde estaba la caja?
  const maxFurni = R.row.official ? OFFICIAL_MAX_FURNI : MAX_FURNI_PER_ROOM;
  let spot = null;
  if (cdef.kind === 'floor' && !it.wall && H.canEdit(R, userId) && R.items.size - 1 < maxFurni) {
    roomRemoveItem(R.grid, it);
    const users = [...R.users.values()].map((U) => ({ x: U.x, y: U.y }));
    for (const rot of cdef.rots) { const v = canPlace(R.grid, cdef, it.x, it.y, rot, { users }); if (v.ok) { spot = { x: it.x, y: it.y, z: v.z, rot }; break; } }
    roomAddItem(R.grid, it);
  }
  if (H.invCount(userId) + count - (spot ? 1 : 0) > MAX_INVENTORY) return err('Tu inventario está lleno: haz espacio para abrir el regalo');
  let made;
  try {
    made = tx(() => {
      if (!db.prepare('DELETE FROM hotel_items WHERE id = ? AND owner_id = ? AND room_id = ?').run(it.id, userId, R.id).changes) throw new EcoError('Ese regalo ya no está');
      db.prepare('DELETE FROM hotel_presents WHERE item_id = ?').run(it.id);
      return H.buy(userId, cdef.id, p.color);
    });
  } catch (e) { return err(e.message); }
  roomRemove(R, it);
  let placedId = null;
  const inv = [];
  for (const m of made) {
    if (spot && placedId == null) {
      Object.assign(m, { roomId: R.id, x: spot.x, y: spot.y, z: spot.z, rot: spot.rot, wall: null, state: cdef.interact === 'dice' ? 1 : 0 });
      H.persist(m);
      R.items.set(m.id, m);
      roomAddItem(R.grid, m);
      H.IO?.to(H.key(R.id)).emit('hotel:item', { op: 'add', item: m });
      H.refreshUsers(R, H.footTiles(m));
      placedId = m.id;
    } else inv.push(m);
  }
  if (inv.length) socket.emit('hotel:inv', { add: inv });
  const reveal = { itemId: it.id, by: userId, x: it.x, y: it.y, z: it.z, type: cdef.id, color: p.color, placedId, wrap: it.color };
  socket.to(H.key(R.id)).emit('hotel:present:open', reveal);
  socket.emit('hotel:present:open', { ...reveal, mine: true, fromName: p.fromName, message: p.message, toInventory: inv.length > 0 });
}

// ---------- REST ----------
export function registerEconomyRoutes(api, { fail, wrap, notify = null }) {
  setImmediate(setup);
  const rates = new Map();
  const limited = (req, res, k, n, ms) => { if (rl(rates, `${k}:${req.user.id}`, n, ms)) return false; fail(res, 429, 'Vas muy rápido: espera un momento'); return true; };
  const isAdminReq = (req) => req.user.role === 'admin';
  const run = (res, fn) => {
    try { return fn(); } catch (e) { if (e instanceof EcoError) { fail(res, e.status, e.message); return undefined; } throw e; }
  };

  api.get('/hotel/wallet', wrap((req, res) => {
    const uid = req.user.id;
    const daily = claimDaily(uid);
    res.json({
      credits: balanceOf(uid), daily, dailyAmount: E.DAILY_CREDITS, onlineCredits: E.ONLINE_CREDITS, onlineEveryMs: ONLINE_EVERY,
      log: logOf(uid), trade: trades.has(uid) ? tradeView(trades.get(uid), uid) : null,
    });
  }));

  // Comprar (o regalar) furnis con créditos HUB
  api.post('/hotel/buy', wrap((req, res) => {
    const uid = req.user.id, admin = isAdminReq(req);
    const b = req.body || {};
    const def = FURNI_BY_ID[b.type];
    if (!def) return fail(res, 400, 'Ese furni no existe');
    if (limited(req, res, 'buy', 30, 60e3)) return;
    const gift = b.gift && typeof b.gift === 'object' ? b.gift : null;
    const q = E.quote(def, gift ? 1 : b.qty ?? 1, { admin });
    if (q.error) return fail(res, def.exclusive && !admin ? 403 : 400, q.error);
    const color = colorFor(def, b.color);
    if (gift) {
      const to = Number(gift.userId);
      const target = db.prepare('SELECT id, display_name, disabled FROM users WHERE id = ?').get(to);
      if (!target || target.disabled) return fail(res, 400, 'Esa persona no existe');
      if (to === uid) return fail(res, 400, 'No te puedes mandar un regalo a ti');
      if (H.invCount(to) + 1 > MAX_INVENTORY) return fail(res, 400, 'El inventario de esa persona está lleno');
      const message = H.cleanText(gift.message).slice(0, E.MAX_GIFT_MSG);
      const wrapC = E.PRESENT_WRAPS.includes(gift.wrap) ? gift.wrap : E.PRESENT_WRAPS[0];
      const present = run(res, () => tx(() => {
        move(uid, -q.total, 'gift', `Regalo para ${target.display_name}: ${def.name}`);
        return makePresent(to, uid, def.id, color, wrapC, message);
      }));
      if (!present) return;
      H.IO?.to(`user:${to}`).emit('hotel:inv', { add: [present] });
      notify?.(to, 'hotel_gift', uid, { type: E.PRESENT_TYPE, name: 'un regalo', text: `🎁 ${req.user.display_name || nameOf(uid)} te mandó un regalo. Colócalo en una sala y ábrelo` });
      pushWallet(uid, { delta: -q.total, reason: 'gift' });
      return res.json({ items: [], present: { id: present.id }, credits: balanceOf(uid), spent: q.total });
    }
    if (H.invCount(uid) + q.items > MAX_INVENTORY) return fail(res, 400, `Tu inventario está lleno (máximo ${MAX_INVENTORY})`);
    const items = run(res, () => tx(() => {
      move(uid, -q.total, 'buy', `${q.qty > 1 ? `${q.qty}× ` : ''}${def.name}`);
      const out = [];
      for (let i = 0; i < q.qty; i++) out.push(...H.buy(uid, def.id, color));
      return out;
    }));
    if (!items) return;
    if (q.total) pushWallet(uid, { delta: -q.total, reason: 'buy' });
    res.json({ items, credits: balanceOf(uid), spent: q.total });
  }));

  // Canjear monedas desde el inventario (todas o algunas)
  api.post('/hotel/coins/redeem', wrap((req, res) => {
    const uid = req.user.id;
    if (limited(req, res, 'coin', 20, 60e3)) return;
    const ids = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map(Number).slice(0, 500) : null;
    const rows = db.prepare('SELECT * FROM hotel_items WHERE owner_id = ? AND room_id IS NULL').all(uid)
      .filter((r) => E.coinValue(FURNI_BY_ID[r.type]) && (!ids || ids.includes(r.id)));
    if (!rows.length) return fail(res, 400, 'No tienes monedas para canjear');
    const total = rows.reduce((s, r) => s + E.coinValue(FURNI_BY_ID[r.type]), 0);
    run(res, () => tx(() => {
      const del = db.prepare('DELETE FROM hotel_items WHERE id = ? AND owner_id = ? AND room_id IS NULL');
      for (const r of rows) if (!del.run(r.id, uid).changes) throw new EcoError('Una moneda ya no está');
      move(uid, total, 'coin', `${rows.length} moneda${rows.length > 1 ? 's' : ''}`);
    }));
    if (res.headersSent) return;
    const removed = rows.map((r) => r.id);
    H.IO?.to(`user:${uid}`).emit('hotel:inv', { remove: removed });
    pushWallet(uid, { delta: total, reason: 'coin' });
    res.json({ credits: balanceOf(uid), amount: total, removed });
  }));

  // Canjear un código
  api.post('/hotel/vouchers/redeem', wrap((req, res) => {
    const uid = req.user.id;
    if (limited(req, res, 'voucher', 6, 60e3)) return;
    const code = E.normCode(req.body?.code);
    if (!E.validCode(code)) return fail(res, 400, 'Ese código no es válido');
    const out = run(res, () => tx(() => {
      const v = db.prepare('SELECT * FROM hotel_vouchers WHERE code = ?').get(code);
      if (!v) throw new EcoError('Ese código no existe', 404);
      if (v.expires_at && v.expires_at < clock()) throw new EcoError('Ese código ya expiró');
      if (v.uses >= v.max_uses) throw new EcoError('Ese código ya se usó todas las veces');
      if (db.prepare('SELECT 1 FROM hotel_voucher_uses WHERE code = ? AND user_id = ?').get(code, uid)) throw new EcoError('Ya canjeaste ese código');
      const def = v.furni ? FURNI_BY_ID[v.furni] : null;
      if (v.furni && !def) throw new EcoError('El furni de ese código ya no existe');
      if (def && H.invCount(uid) + (def.interact === 'teleport' ? 2 : 1) > MAX_INVENTORY) throw new EcoError('Tu inventario está lleno');
      db.prepare('UPDATE hotel_vouchers SET uses = uses + 1 WHERE code = ?').run(code);
      db.prepare('INSERT INTO hotel_voucher_uses (code, user_id, at) VALUES (?, ?, ?)').run(code, uid, now());
      if (v.credits) move(uid, v.credits, 'voucher', `Código ${code}`);
      const items = def ? H.buy(uid, def.id, colorFor(def, v.furni_color)) : [];
      return { credits: v.credits, items };
    }));
    if (!out) return;
    if (out.items.length) H.IO?.to(`user:${uid}`).emit('hotel:inv', { add: out.items });
    if (out.credits) pushWallet(uid, { delta: out.credits, reason: 'voucher' });
    res.json({ credits: out.credits, items: out.items, balance: balanceOf(uid) });
  }));

  // ---------- Admin ----------
  const adminOnly = (req, res) => { if (isAdminReq(req)) return true; fail(res, 403, 'Solo los admins pueden hacer esto'); return false; };

  api.get('/hotel/admin/wallets', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    const q = String(req.query.q || '').trim().slice(0, 40);
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = db.prepare(`SELECT u.id, u.display_name, u.username, w.credits FROM users u LEFT JOIN hotel_wallets w ON w.user_id = u.id
      WHERE u.disabled = 0 AND (u.display_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\') ORDER BY COALESCE(w.credits, -1) DESC, u.display_name LIMIT 50`).all(like, like);
    res.json({ users: rows.map((r) => ({ id: r.id, displayName: r.display_name, username: r.username, credits: r.credits })) });
  }));

  api.get('/hotel/admin/wallets/:userId', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    const uid = Number(req.params.userId);
    if (!H.getUser(uid)) return fail(res, 404, 'Esa persona no existe');
    res.json({ credits: balanceOf(uid), log: logOf(uid, 30) });
  }));

  // Dar o quitar créditos (queda en la bitácora)
  api.post('/hotel/admin/credits', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    if (limited(req, res, 'grant', 30, 60e3)) return;
    const to = Number(req.body?.userId);
    const delta = Math.trunc(Number(req.body?.delta));
    const target = db.prepare('SELECT id, display_name, disabled FROM users WHERE id = ?').get(to);
    if (!target || target.disabled) return fail(res, 400, 'Esa persona no existe');
    if (!Number.isFinite(delta) || !delta || Math.abs(delta) > 1e6) return fail(res, 400, 'Escribe una cantidad entre 1 y 1,000,000');
    const note = H.cleanText(req.body?.note).slice(0, 100);
    const balance = run(res, () => move(to, delta, 'admin', note || (delta > 0 ? 'Regalo de admin' : 'Ajuste de admin'), req.user.id));
    if (balance == null) return;
    try { audit({ actor: req.user.id, action: `${delta > 0 ? 'Dio' : 'Quitó'} ${fmt(Math.abs(delta))} créditos HUB ${delta > 0 ? 'a' : 'a'} ${target.display_name}`, target: `hotel:credits:${to}`, data: { delta, note, balance }, ip: req.ip }); } catch { /* sin bitácora */ }
    pushWallet(to, { delta, reason: 'admin' });
    if (delta > 0 && to !== req.user.id) notify?.(to, 'hotel_gift', req.user.id, { name: `${fmt(delta)} créditos HUB`, text: `💰 Te dieron ${fmt(delta)} créditos HUB${note ? `: ${note}` : ''}` });
    res.json({ credits: balance });
  }));

  // Códigos de canje
  const voucherOut = (v) => ({ code: v.code, credits: v.credits, furni: v.furni, furniColor: v.furni_color, maxUses: v.max_uses, uses: v.uses, expiresAt: v.expires_at, note: v.note, createdAt: v.created_at });
  api.get('/hotel/admin/vouchers', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    res.json({ vouchers: db.prepare('SELECT * FROM hotel_vouchers ORDER BY created_at DESC LIMIT 200').all().map(voucherOut) });
  }));
  api.post('/hotel/admin/vouchers', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    if (limited(req, res, 'mkvoucher', 30, 60e3)) return;
    const b = req.body || {};
    let code = E.normCode(b.code);
    if (!code) code = `HUB-${Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('')}`;
    if (!E.validCode(code)) return fail(res, 400, 'El código lleva de 4 a 24 letras, números o guiones');
    const credits = Math.trunc(Number(b.credits) || 0);
    if (credits < 0 || credits > 1e6) return fail(res, 400, 'Créditos inválidos');
    const def = b.furni ? FURNI_BY_ID[b.furni] : null;
    if (b.furni && (!def || !E.inShop(def))) return fail(res, 400, 'Ese furni no existe');
    if (!credits && !def) return fail(res, 400, 'El código debe dar créditos o un furni');
    const maxUses = Math.trunc(Number(b.maxUses) || 1);
    if (maxUses < 1 || maxUses > 10000) return fail(res, 400, 'Usos: de 1 a 10,000');
    const days = Number(b.expiresInDays) || 0;
    if (days < 0 || days > 3650) return fail(res, 400, 'Vigencia inválida');
    const expiresAt = b.expiresAt != null ? Number(b.expiresAt) || null : days ? now() + days * 864e5 : null;
    if (db.prepare('SELECT 1 FROM hotel_vouchers WHERE code = ?').get(code)) return fail(res, 409, 'Ya existe un código igual');
    const note = H.cleanText(b.note).slice(0, 80);
    db.prepare('INSERT INTO hotel_vouchers (code, credits, furni, furni_color, max_uses, uses, expires_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)')
      .run(code, credits, def?.id || null, def ? colorFor(def, b.furniColor) : null, maxUses, expiresAt, note, req.user.id, now());
    try { audit({ actor: req.user.id, action: `Creó el código del Hotel ${code}`, target: `hotel:voucher:${code}`, data: { credits, furni: def?.id || null, maxUses, expiresAt }, ip: req.ip }); } catch { /* sin bitácora */ }
    res.json({ voucher: voucherOut(db.prepare('SELECT * FROM hotel_vouchers WHERE code = ?').get(code)) });
  }));
  api.delete('/hotel/admin/vouchers/:code', wrap((req, res) => {
    if (!adminOnly(req, res)) return;
    const code = E.normCode(req.params.code);
    const r = db.prepare('DELETE FROM hotel_vouchers WHERE code = ?').run(code);
    if (!r.changes) return fail(res, 404, 'Ese código no existe');
    db.prepare('DELETE FROM hotel_voucher_uses WHERE code = ?').run(code);
    try { audit({ actor: req.user.id, action: `Borró el código del Hotel ${code}`, target: `hotel:voucher:${code}`, ip: req.ip }); } catch { /* sin bitácora */ }
    res.json({ ok: true });
  }));
}

// Para pruebas en el mismo proceso
export const _economy = { trades, invites, online, setClock: (fn) => { clock = fn || (() => now()); }, onlineTick, sweepTrades, claimDaily };
