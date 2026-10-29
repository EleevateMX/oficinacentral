// Hotel: mecánicas de la línea "Mecánica y Wired" (ver shared/hotelLines/mecanica.js).
//   · Rodillos: cada ~1 s mueven a quien está parado encima (o la pila de furnis de arriba) una casilla.
//   · Puerta de un sentido: se cruza solo entrando por el frente.
//   · Máquinas expendedoras → objeto en la mano (U.hand, 3 min o :tirar; se pasa con :dar o desde la tarjeta).
//   · Rueda de la fortuna, medidor de amor, marcador, trofeo con dedicatoria y regulador de luz.
//   · Bots en las salas oficiales (recepción en la Oficina Central y barra en Comedor / Sala de juegos).
// Se engancha a server/hotel.js por hotelCtx (ganchos chicos); el wired vive en server/hotelWired.js.
// No importa la base de datos directamente (la recibe en ctx), así las pruebas pueden importar lo puro.
import { MAX_STEP } from '../shared/hotel.js';
import { FURNI_BY_ID, footprint } from '../shared/hotelCatalog.js';
import { tileInfo, roomAddItem, roomRemoveItem, floorAt, findPath, canPlace, ROT_VEC, MAX_STACK_Z } from '../shared/hotelRoom.js';
import { STEP_MS, walkAt, walkEnd, dirToward } from '../shared/hotelWalk.js';
import { HAND_ITEMS, vendOf } from '../shared/hotelLines/mecanica.js';
import { OFFICIAL_ROOMS } from '../shared/hotelOfficialRooms.js';
import { initWired, wiredTick } from './hotelWired.js';

export const ROLL_MS = 1000; // cada cuánto avanzan los rodillos
export const HAND_MS = Number(process.env.HOTEL_HAND_MS) || 3 * 60e3; // cuánto dura un objeto en la mano
export const WHEEL_MS = 3000; // giro de la rueda
export const LOVE_MS = 2200; // "midiendo" del medidor de amor

// ---------- Azar (se puede inyectar para pruebas) ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = process.env.HOTEL_RNG_SEED ? mulberry32(Number(process.env.HOTEL_RNG_SEED)) : Math.random;
export function setMechRng(fn) { rng = typeof fn === 'function' ? fn : Math.random; }
export const spinResult = (r = rng) => 1 + Math.min(9, Math.floor(r() * 10)); // 1–10
export const loveResult = (r = rng) => Math.min(100, Math.floor(r() * 101)); // 0–100 %
// Estados: rueda 0 quieta · 1–10 resultado · 11 girando. Amor 0 nada · 1 midiendo · 2–102 = % + 2.
export const WHEEL_SPIN = 11, LOVE_MEASURING = 1, LOVE_BASE = 2;

const k2 = (x, y) => `${x},${y}`;
const defOf = (it) => FURNI_BY_ID[it?.type];
export const isRoller = (it) => defOf(it)?.interact === 'roller' && !it.wall && it.x != null;
const solo = (it) => { const f = footprint(defOf(it), it.rot); return f.w === 1 && f.l === 1; };
const stackable = (d, it) => !!(d && (d.stack || d.walk || (d.interact === 'gate' && it.state === 1)));
const PASS = new Set(['floor', 'walk']);
const r2 = (n) => Math.round(n * 100) / 100;

// ---------- Rodillos (lógica pura) ----------
// Un paso de todos los rodillos de la sala. Mueve (en el grid) los furnis que van encima y regresa qué se movió.
//   users: [{ id, x, y, z, moving, dest? }] · occupied: ["x,y"] extra (bots)
// → { users: [{ id, from: [x,y,z], to: [x,y,z] }], items: [{ id, item, from: [x,y,z], to: [x,y,z] }] }
// Cadenas: se repite hasta que ya nada avanza (lo de adelante se mueve primero y deja lugar).
export function planRollers(grid, items, users, { occupied = [] } = {}) {
  const rollers = [...items].filter(isRoller).sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  const occ = new Map();
  for (const u of users) { occ.set(k2(u.x, u.y), u.id); if (u.dest) occ.set(k2(u.dest.x, u.dest.y), u.id); }
  for (const k of occupied) if (!occ.has(k)) occ.set(k, 'bot');
  const out = { users: [], items: [] };
  const movedUsers = new Set(), movedItems = new Set();
  const door = grid.door;
  const state = new Map(rollers.map((r) => [r, { items: false, user: false }]));
  let progress = true;
  while (progress) {
    progress = false;
    for (const r of rollers) {
      const st = state.get(r);
      if (st.items && st.user) continue;
      const def = defOf(r);
      const [dx, dy] = ROT_VEC[r.rot] || ROT_VEC[0];
      const tx = r.x + dx, ty = r.y + dy;
      const top = r.z + def.h;
      // Furnis encima (de 1×1) y quien está parado encima
      const riders = (grid.tiles[r.y]?.[r.x] || []).filter((it) => it !== r && !movedItems.has(it.id) && it.z >= top - 0.01 && !isRoller(it) && solo(it));
      if (!st.items) {
        if (!riders.length) st.items = true;
        else if (moveItemsTo(grid, riders, top, tx, ty, occ, door, out)) { st.items = true; progress = true; for (const it of riders) movedItems.add(it.id); }
      }
      if (!st.user) {
        const u = users.find((q) => !q.moving && !movedUsers.has(q.id) && q.x === r.x && q.y === r.y);
        const here = tileInfo(grid, r.x, r.y);
        if (!u || !here || !PASS.has(here.kind)) st.user = true;
        else {
          const t = tileInfo(grid, tx, ty);
          if (t && PASS.has(t.kind) && !occ.has(k2(tx, ty)) && Math.abs(t.z - u.z) <= MAX_STEP) {
            occ.delete(k2(u.x, u.y)); occ.set(k2(tx, ty), u.id);
            out.users.push({ id: u.id, from: [u.x, u.y, u.z], to: [tx, ty, t.z] });
            movedUsers.add(u.id); st.user = true; progress = true;
          }
        }
      }
    }
  }
  return out;
}

// Mueve una pila de furnis (de abajo hacia arriba, con la misma separación) a la casilla (tx, ty) si cabe.
function moveItemsTo(grid, riders, top, tx, ty, occ, door, out) {
  if (door && tx === door.x && ty === door.y) return false;
  const f = floorAt(grid, tx, ty);
  if (Number.isNaN(f) || occ.has(k2(tx, ty))) return false;
  let base = f;
  for (const it of grid.tiles[ty][tx]) {
    if (riders.includes(it)) continue;
    const d = defOf(it);
    if (!stackable(d, it)) return false;
    base = Math.max(base, it.z + (d?.h || 0));
  }
  const height = Math.max(...riders.map((it) => it.z - top + (defOf(it)?.h || 0)));
  if (base + height > MAX_STACK_Z) return false;
  for (const it of riders) {
    const from = [it.x, it.y, it.z];
    roomRemoveItem(grid, it);
    it.x = tx; it.y = ty; it.z = r2(base + (it.z - top));
    roomAddItem(grid, it);
    out.items.push({ id: it.id, item: it, from, to: [it.x, it.y, it.z] });
  }
  return true;
}

// Mover un furni una casilla (efecto wired): solo si no trae nada encima y cabe en el destino.
export function nudgeItem(grid, it, dx, dy, users = []) {
  const def = defOf(it);
  if (!def || it.wall || it.x == null) return null;
  const { w, l } = footprint(def, it.rot);
  for (let j = it.y; j < it.y + l; j++) for (let i = it.x; i < it.x + w; i++) {
    if ((grid.tiles[j]?.[i] || []).some((q) => q !== it && q.z >= it.z + def.h - 0.01)) return null; // algo encima
  }
  const v = canPlace(grid, def, it.x + dx, it.y + dy, it.rot, { ignoreId: it.id, users });
  if (!v.ok) return null;
  const from = [it.x, it.y, it.z];
  roomRemoveItem(grid, it);
  it.x += dx; it.y += dy; it.z = v.z;
  roomAddItem(grid, it);
  return { from, to: [it.x, it.y, it.z] };
}

// ---------- Puerta de un sentido (lógica pura) ----------
// Frente = casilla hacia donde mira (rot); se entra desde ahí y se sale por detrás.
export function onewayTiles(it) {
  const [vx, vy] = ROT_VEC[it.rot] || ROT_VEC[0];
  return { front: { x: it.x + vx, y: it.y + vy }, back: { x: it.x - vx, y: it.y - vy } };
}
// ¿Puede cruzar quien está en (x, y)? → { ok, path?, reason? }
export function onewayCheck(grid, it, from, occupied = new Set()) {
  const { front, back } = onewayTiles(it);
  if (from.x !== front.x || from.y !== front.y) return { ok: false, reason: 'front' };
  const t = tileInfo(grid, back.x, back.y);
  if (!t || !PASS.has(t.kind) || occupied.has(k2(back.x, back.y))) return { ok: false, reason: 'blocked' };
  const gz = floorAt(grid, it.x, it.y);
  if (Math.abs(t.z - gz) > MAX_STEP) return { ok: false, reason: 'blocked' };
  return { ok: true, path: [[it.x, it.y, gz], [back.x, back.y, t.z]] };
}

// Casillas junto a un furni (para usar máquinas): ordenadas con la de enfrente primero
export function besideTiles(it) {
  const def = defOf(it);
  const { w, l } = footprint(def, it.rot);
  const out = [];
  for (let j = it.y - 1; j <= it.y + l; j++) for (let i = it.x - 1; i <= it.x + w; i++) {
    if (i >= it.x && i < it.x + w && j >= it.y && j < it.y + l) continue;
    out.push({ x: i, y: j });
  }
  const [fx, fy] = ROT_VEC[it.rot] || ROT_VEC[0];
  const cx = it.x + (w - 1) / 2 + fx * (w / 2 + 0.5), cy = it.y + (l - 1) / 2 + fy * (l / 2 + 0.5);
  return out.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}
export function isBeside(it, x, y) {
  const def = defOf(it);
  const { w, l } = footprint(def, it.rot);
  const inside = x >= it.x && x < it.x + w && y >= it.y && y < it.y + l;
  return !inside && x >= it.x - 1 && x <= it.x + w && y >= it.y - 1 && y <= it.y + l;
}

// ---------- Texto ----------
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const hasWord = (text, words) => words.some((w) => new RegExp(`(^|[^a-z0-9ñ])${w}([^a-z0-9ñ]|$)`).test(text));

// ---------- Bots de las salas oficiales ----------
const RECEPTION_AVATAR = { preset: 'gh-presentadora', hair: '#1b1720', shirt: '#FE3377', accent: '#141414', audio: 'headset', mouth: 'smile' };
const BAR_AVATAR = { preset: 'cafe', hairStyle: 'short', top: 'shirt', shirt: '#f4f4f6', accent: '#141414', pants: '#151519', shoes: '#1d1d22', facialHair: 'mustache', mouth: 'smile', extra: 'none' };
export const BOT_SPECS = {
  hq: [{ role: 'reception', name: 'Rita · Recepción', avatar: RECEPTION_AVATAR, home: [7, 20], area: [7, 18, 8, 22], dir: 6 }],
  comedor: [{ role: 'bartender', name: 'Beto · Barra', avatar: BAR_AVATAR, home: [6, 2], area: [4, 2, 9, 2], dir: 4 }],
  juegos: [{ role: 'bartender', name: 'Beto · Barra', avatar: BAR_AVATAR, home: [15, 10], area: [14, 10, 16, 10], dir: 4 }],
};
const DRINKS = [
  [['cafe', 'cafecito', 'expreso', 'capuchino'], 'cafe'],
  [['refresco', 'refre', 'soda', 'coca'], 'refresco'],
  [['agua', 'agüita', 'aguita'], 'agua'],
  [['helado', 'nieve', 'helad'], 'helado'],
  [['palomitas', 'palomita'], 'palomitas'],
  [['rosa', 'flor'], 'rosa'],
];
const ARTICLE = { cafe: 'un café', refresco: 'un refresco', agua: 'un vaso de agua', helado: 'un helado', palomitas: 'unas palomitas', rosa: 'una rosa' };
export function drinkRequest(text) {
  const t = norm(text);
  for (const [words, id] of DRINKS) if (hasWord(t, words.map(norm))) return id;
  return null;
}
export function receptionReply(text) {
  const t = norm(text);
  if (hasWord(t, ['ayuda', 'help', 'ayudame', 'ayudenme'])) return 'Con gusto 😊 Haz clic en el piso para caminar y doble clic en un furni para usarlo. Escribe :sentar, :bailar o :saludar. Pregúntame por: hotel, juegos o salas.';
  if (hasWord(t, ['hotel'])) return 'Este es el Hotel GTAHUB 🏨 Crea tu propia sala en el Navegador, decórala con la Tienda e invita a tu equipo.';
  if (hasWord(t, ['juegos', 'juego', 'jugar'])) return 'En la Sala de juegos hay maquinitas, dados, pista de baile y DJ 🎮 Y con la línea Mecánica puedes armar rodillos, la rueda de la fortuna y wired.';
  if (hasWord(t, ['salas', 'sala'])) return `Salas oficiales: ${OFFICIAL_ROOMS.map((r) => r.name).join(', ')}. Las encuentras en el Navegador → Oficiales.`;
  return null;
}
export const greeting = (name) => `¡Bienvenido a la Oficina Central, ${name}!`;

// ---------- Servidor ----------
let ctx = null;
export function initHotelMechanics(c) {
  ctx = c;
  const H = c.hooks;
  H.use.push((R, U, it, m, socket) => (vendOf(defOf(it)) ? onUse(R, U, it, m, socket) : false));
  for (const k of ['roller', 'oneway', 'vend', 'wheel', 'love', 'score', 'trophy', 'dimmer', 'wired']) c.useHandlers.set(k, ({ R, it, U, socket, m }) => onUse(R, U, it, m, socket));
  H.walk.push(onWalk);
  H.place.push(onPlace);
  H.enter.push(onEnter);
  H.leave.push(onLeave);
  H.chat.push(onChat);
  H.users.push((R) => (R.mech?.bots || []).map(botOut));
  H.occupied.push((R) => (R.mech?.bots || []).flatMap((B) => { const d = botDest(B); return [k2(B.x, B.y), k2(d.x, d.y)]; }));
  c.chatCommands.set(':tirar', ({ R, U }) => { if (U?.hand) setHand(R, U, null); });
  c.chatCommands.set(':dar', ({ R, U, args, err }) => giveTo(R, U, findByName(R, args.join(' ')), err));
  c.socketInits.push(socketInit);
  const api = { setHand, nudge, say: roomSay, flashState, persistExtra, mech, randomFn: () => rng };
  initWired(c, api);
  const timer = setInterval(tick, ROLL_MS);
  timer.unref?.();
}

const io = () => ctx.io;
const room = (R) => io()?.to(ctx.key(R.id));
const mech = (R) => (R.mech ||= { bots: [], gateBusy: new Map(), greeted: new Map(), lastBot: new Map() });
function persistExtra(it) { ctx.db.prepare('UPDATE hotel_items SET extra = ? WHERE id = ?').run(JSON.stringify(it.extra || {}), it.id); }
const emitItem = (R, it, extra = {}) => room(R)?.emit('hotel:item', { op: 'update', item: it, ...extra });
const flashTimers = new WeakMap(); // fuera del item para que no viaje en los eventos
function flashState(R, it, ms = 900) {
  // Destello sin guardar (máquinas que despachan, wired que se dispara)
  if (R.items.get(it.id) !== it) return;
  const prev = it.state;
  it.state = 1;
  emitItem(R, it);
  clearTimeout(flashTimers.get(it));
  flashTimers.set(it, setTimeout(() => { if (R.items.get(it.id) === it && it.state === 1) { it.state = prev === 1 ? 0 : prev; emitItem(R, it); } }, ms));
}
function roomSay(R, from, name, text, extra = {}) {
  const msg = { id: `m${from}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, from, name, text, mode: 'say', at: Date.now(), ...extra };
  R.chat.push(msg);
  if (R.chat.length > 50) R.chat.shift();
  room(R)?.emit('hotel:chat', msg);
  return msg;
}
const notice = (U, text, error = false) => U?.socket?.emit('hotel:notice', error ? { text, error: true } : { text });

// ----- Objetos en la mano -----
function setHand(R, U, id) {
  if (!U || R.users.get(U.id) !== U) return;
  const hand = id && HAND_ITEMS[id] ? id : null;
  clearTimeout(U.handTimer);
  U.hand = hand;
  if (hand) U.handTimer = setTimeout(() => { if (U.hand === hand && R.users.get(U.id) === U) setHand(R, U, null); }, HAND_MS);
  room(R)?.emit('hotel:user', ctx.userState(U));
}
function findByName(R, name) {
  const n = norm(name).trim();
  if (!n) return null;
  const list = [...R.users.values()];
  return list.find((V) => norm(V.name) === n) || list.find((V) => norm(V.name).startsWith(n)) || null;
}
function giveTo(R, U, V, err = (t) => notice(U, t, true)) {
  if (!U?.hand) return err('No traes nada en la mano');
  if (!V) return err('Esa persona no está en la sala');
  if (V.id === U.id) return err('Ya lo traes tú 😄');
  const id = U.hand, it = HAND_ITEMS[id];
  setHand(R, U, null);
  setHand(R, V, id);
  notice(V, `${U.name} te dio ${it.emoji} ${it.name.toLowerCase()}`);
  notice(U, `Le diste ${it.emoji} ${it.name.toLowerCase()} a ${V.name}`);
  return true;
}

// ----- Usar furnis -----
function onUse(R, U, it, m, socket) {
  if (!U) return false;
  const def = defOf(it);
  const hand = vendOf(def);
  // Las máquinas de otras líneas (con interruptor) se siguen prendiendo/apagando desde la tarjeta
  if (hand && !(m?.toggle && def.interact === 'toggle')) return vend(R, U, it, def, hand), true;
  switch (def?.interact) {
    case 'roller': return true;
    case 'oneway': onewayGo(R, U, it); return true;
    case 'wheel': spin(R, U, it); return true;
    case 'love': love(R, U, it); return true;
    case 'score': score(R, U, it, m?.op); return true;
    case 'trophy':
      if (it.ownerId === U.id || ctx.isAdmin(U.id)) socket.emit('hotel:mech:open', { kind: 'trophy', itemId: it.id });
      return true;
    case 'dimmer':
      if (!ctx.canEdit(R, U.id)) notice(U, 'Solo quien tiene permisos cambia la luz de la sala', true);
      else socket.emit('hotel:mech:open', { kind: 'dimmer', itemId: it.id });
      return true;
    case 'wired':
      if (!ctx.canEdit(R, U.id)) notice(U, 'Solo quien tiene permisos puede configurar el wired', true);
      else socket.emit('hotel:mech:open', { kind: 'wired', itemId: it.id });
      return true;
    default: return false;
  }
}

// Ir junto a la máquina (si no estás ya) y recibir el objeto
function vend(R, U, it, def, hand) {
  if (it.wall || it.x == null) return;
  const give = () => {
    if (R.users.get(U.id) !== U || R.items.get(it.id) !== it) return;
    const p = ctx.logical(U);
    if (p.moving || !isBeside(it, p.x, p.y)) return;
    const d = dirToward(p.x, p.y, it.x + 0.5 * (footprint(def, it.rot).w - 1), it.y + 0.5 * (footprint(def, it.rot).l - 1));
    if (d != null && !U.sit && !U.lay) U.dir = d;
    if (def.interact === 'vend') flashState(R, it);
    setHand(R, U, hand);
  };
  const p = ctx.logical(U);
  if (!p.moving && isBeside(it, p.x, p.y)) return give();
  const taken = new Set();
  for (const V of R.users.values()) if (V !== U) { const q = ctx.logical(V); taken.add(k2(q.x, q.y)); }
  for (const t of besideTiles(it)) {
    const ti = tileInfo(R.grid, t.x, t.y);
    if (!ti || !PASS.has(ti.kind) || taken.has(k2(t.x, t.y))) continue;
    if (ctx.startWalk(R, U, t, { onArrive: give })) return;
  }
  notice(U, 'No se puede llegar a la máquina', true);
}

// ----- Puerta de un sentido -----
function onWalk(R, U, to) {
  const t = tileInfo(R.grid, to.x, to.y);
  if (t?.kind === 'block' && defOf(t.item)?.interact === 'oneway') { onewayGo(R, U, t.item); return true; }
  return false;
}
function onewayGo(R, U, it, retry = true) {
  const M = mech(R);
  const p = ctx.logical(U);
  const { front } = onewayTiles(it);
  if (p.moving || p.x !== front.x || p.y !== front.y) {
    if (!retry) return;
    if (!ctx.startWalk(R, U, front, { onArrive: () => onewayGo(R, U, it, false) })) notice(U, 'Solo se cruza entrando por el frente', true);
    return;
  }
  if ((M.gateBusy.get(it.id) || 0) > Date.now()) return;
  const occupied = new Set();
  for (const V of R.users.values()) if (V !== U) { const q = ctx.logical(V); occupied.add(k2(q.x, q.y)); if (V.path) { const e = V.path[V.path.length - 1]; occupied.add(k2(e[0], e[1])); } }
  for (const B of M.bots) occupied.add(k2(B.x, B.y));
  const v = onewayCheck(R.grid, it, p, occupied);
  if (!v.ok) return notice(U, 'Hay algo del otro lado de la puerta', true);
  M.gateBusy.set(it.id, Date.now() + 2 * STEP_MS + 200);
  ctx.flash(R, it);
  scriptPath(R, U, v.path);
}
// Camino ya decidido (sin A*): mismo formato que una caminata normal
function scriptPath(R, U, path, { slide = false } = {}) {
  const t = Date.now();
  clearTimeout(U.timer);
  U.path = path; U.t0 = t; U.n0 = 0; U.onArrive = null;
  U.sit = null; U.lay = null; U.act = null; U.sliding = slide;
  room(R)?.emit('hotel:path', { id: U.id, from: [U.x, U.y, U.z], path, t0: t, n0: 0, now: t, ...(slide ? { slide: true } : {}) });
  U.timer = setTimeout(() => ctx.arrive(R, U), path.length * STEP_MS + 15);
}

// ----- Rueda, amor, marcador -----
function spin(R, U, it) {
  if (it.state === WHEEL_SPIN) return;
  it.state = WHEEL_SPIN;
  emitItem(R, it);
  setTimeout(() => {
    if (R.items.get(it.id) !== it) return;
    const n = spinResult();
    it.state = n;
    ctx.persist(it);
    emitItem(R, it, { roll: { by: U.id } });
    roomSay(R, U.id, '🎡 Rueda de la fortuna', `¡${U.name} giró la rueda y cayó en ${n}!`, { system: true });
  }, WHEEL_MS);
}
// Quiénes están sentados en el furni (en cualquiera de sus casillas)
function sittersOn(R, it) {
  const { w, l } = footprint(defOf(it), it.rot);
  return [...R.users.values()].filter((V) => !V.path && V.sit && !V.sit.floor && V.x >= it.x && V.x < it.x + w && V.y >= it.y && V.y < it.y + l);
}
function love(R, U, it) {
  if (it.state === LOVE_MEASURING) return;
  const seated = sittersOn(R, it);
  if (seated.length < 2) return notice(U, 'Se necesitan dos personas sentadas en el medidor 💘', true);
  const [a, b] = seated.sort((p, q) => p.x - q.x || p.y - q.y);
  it.state = LOVE_MEASURING;
  emitItem(R, it);
  setTimeout(() => {
    if (R.items.get(it.id) !== it) return;
    const pct = loveResult();
    it.state = LOVE_BASE + pct;
    ctx.persist(it);
    emitItem(R, it);
    const tag = pct >= 90 ? '¡Almas gemelas! 💞' : pct >= 70 ? '¡Hay química! 💗' : pct >= 40 ? 'Buena amistad 💛' : 'Mejor como compas 🤝';
    roomSay(R, U.id, '💘 Medidor de amor', `${a.name} + ${b.name}: ${pct}% de amor. ${tag}`, { system: true });
  }, LOVE_MS);
}
function score(R, U, it, op = 'inc') {
  if (!ctx.canEdit(R, U.id) && !R.row.official) return notice(U, 'Solo quien tiene permisos mueve el marcador', true);
  const n = it.state || 0;
  it.state = op === 'reset' ? 0 : op === 'dec' ? Math.max(0, n - 1) : Math.min(99, n + 1);
  if (it.state === n) return;
  ctx.persist(it);
  emitItem(R, it);
}

// ----- Colocar: un regulador por sala y dedicatoria del trofeo -----
function onPlace(R, it, m, uid) {
  const def = defOf(it);
  if (def?.interact === 'dimmer' && [...R.items.values()].some((q) => q.id !== it.id && defOf(q)?.interact === 'dimmer')) return 'Solo puede haber un regulador de luz por sala';
  if (def?.interact === 'trophy' && typeof m?.inscription === 'string' && !it.extra?.inscription && it.ownerId === uid) {
    const text = ctx.cleanText(m.inscription).slice(0, 80);
    if (text) { it.extra = { ...(it.extra || {}), inscription: text, by: ctx.getUser(uid)?.display_name || '', at: Date.now() }; persistExtra(it); }
  }
  return null;
}

// ----- Eventos propios del socket -----
const HEX = /^#[0-9a-fA-F]{6}$/;
function socketInit(socket, uid) {
  let ts = [];
  const ok = () => { const t = Date.now(); ts = ts.filter((x) => t - x < 3000); if (ts.length >= 12) return false; ts.push(t); return true; };
  const here = () => { const w = ctx.where.get(uid); if (!w || w.socket !== socket) return null; const R = ctx.live.get(w.roomId); const U = R?.users.get(uid); return U ? { R, U } : null; };
  const err = (text) => socket.emit('hotel:notice', { text, error: true });

  socket.on('hotel:mech:give', (m) => {
    const h = here();
    if (!h || !ok()) return;
    giveTo(h.R, h.U, h.R.users.get(Number(m?.to)), err);
  });
  socket.on('hotel:mech:drop', () => { const h = here(); if (h?.U.hand && ok()) setHand(h.R, h.U, null); });
  socket.on('hotel:mech:engrave', (m) => {
    const h = here();
    if (!h || !ok()) return;
    const it = h.R.items.get(Number(m?.itemId));
    if (!it || defOf(it)?.interact !== 'trophy') return;
    if (it.ownerId !== uid && !ctx.isAdmin(uid)) return err('Solo quien es dueño del trofeo escribe la dedicatoria');
    const text = ctx.cleanText(m?.text).slice(0, 80);
    it.extra = { ...(it.extra || {}), inscription: text, by: text ? h.U.name : '', at: Date.now() };
    persistExtra(it);
    emitItem(h.R, it);
  });
  socket.on('hotel:mech:dimmer', (m) => {
    const h = here();
    if (!h || !ok()) return;
    const it = h.R.items.get(Number(m?.itemId));
    if (!it || defOf(it)?.interact !== 'dimmer') return;
    if (!ctx.canEdit(h.R, uid)) return err('Solo quien tiene permisos cambia la luz de la sala');
    const color = HEX.test(m?.color) ? m.color : (it.extra?.dimmer?.color || '#2b1f4a');
    const alpha = Math.max(0.05, Math.min(0.8, Number(m?.alpha) || 0.35));
    it.extra = { ...(it.extra || {}), dimmer: { color, alpha: Math.round(alpha * 100) / 100 } };
    it.state = m?.on === false ? 0 : 1;
    persistExtra(it);
    ctx.persist(it);
    emitItem(h.R, it);
  });
}

// ----- Bots -----
function botArea(R, spec) {
  const [x0, y0, x1, y1] = spec.area;
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = tileInfo(R.grid, x, y); if (t && PASS.has(t.kind)) out.push({ x, y, z: t.z }); }
  return out;
}
function ensureBots(R) {
  const M = mech(R);
  if (M.botsReady) return;
  M.botsReady = true;
  const specs = BOT_SPECS[R.row.official_key] || [];
  specs.forEach((spec, i) => {
    const area = botArea(R, spec);
    if (!area.length) return;
    const home = area.find((a) => a.x === spec.home[0] && a.y === spec.home[1]) || area[0];
    const B = { id: -1 - i, bot: spec.role, name: spec.name, avatar: spec.avatar, spec, area, x: home.x, y: home.y, z: home.z, dir: spec.dir ?? 4, sit: null, lay: null, act: null, hand: null, path: null, t0: 0, n0: 0, timer: null, next: Date.now() + 4000 + Math.random() * 4000, busyUntil: 0 };
    M.bots.push(B);
    room(R)?.emit('hotel:user:join', botOut(B));
  });
}
const botDest = (B) => (B.path ? { x: B.path[B.path.length - 1][0], y: B.path[B.path.length - 1][1] } : { x: B.x, y: B.y });
function botOut(B) {
  const t = Date.now();
  const out = { id: B.id, bot: B.bot, name: B.name, avatar: B.avatar, x: B.x, y: B.y, z: B.z, dir: B.dir, sit: null, lay: null, act: B.act, hand: B.hand, path: null };
  if (B.path) {
    const p = walkAt({ from: [B.x, B.y, B.z], path: B.path, t0: B.t0, n0: 0 }, t);
    if (!p.done) Object.assign(out, { x: p.from[0], y: p.from[1], z: p.from[2], path: B.path.slice(p.i), from: p.from, t0: B.t0 + p.i * STEP_MS, n0: p.i, now: t });
  }
  return out;
}
const botState = (B) => ({ id: B.id, x: B.x, y: B.y, z: B.z, dir: B.dir, sit: null, lay: null, act: B.act, hand: B.hand });
function botWander(R, B) {
  const t = Date.now();
  if (B.path || t < B.next || t < B.busyUntil) return;
  B.next = t + 7000 + Math.random() * 9000;
  const occupied = new Set();
  for (const V of R.users.values()) { const q = ctx.logical(V); occupied.add(k2(q.x, q.y)); if (V.path) { const e = V.path[V.path.length - 1]; occupied.add(k2(e[0], e[1])); } }
  for (const O of mech(R).bots) if (O !== B) { const d = botDest(O); occupied.add(k2(d.x, d.y)); }
  const choices = B.area.filter((a) => (a.x !== B.x || a.y !== B.y) && !occupied.has(k2(a.x, a.y)));
  if (!choices.length) return;
  const to = choices[Math.floor(Math.random() * choices.length)];
  const path = findPath(R.grid, { x: B.x, y: B.y, z: B.z }, to, { occupied });
  if (!path?.length || path.length > 8) return;
  B.path = path; B.t0 = t; B.act = null;
  room(R)?.emit('hotel:path', { id: B.id, from: [B.x, B.y, B.z], path, t0: t, n0: 0, now: t });
  B.timer = setTimeout(() => {
    if (!mech(R).bots.includes(B) || !B.path) return;
    const end = walkAt({ from: [B.x, B.y, B.z], path: B.path, t0: B.t0, n0: 0 }, Infinity);
    [B.x, B.y, B.z] = B.path[B.path.length - 1];
    B.path = null;
    // Al terminar regresa a ver hacia el frente (la puerta / la barra)
    B.dir = Math.random() < 0.5 ? (B.spec.dir ?? end.dir ?? B.dir) : (end.dir ?? B.dir);
    room(R)?.emit('hotel:user', botState(B));
  }, walkEnd({ path, t0: t }) - Date.now() + 15);
}
function botFace(R, B, U) {
  if (B.path) return;
  const p = ctx.logical(U);
  const d = dirToward(B.x, B.y, p.x, p.y);
  if (d != null && d !== B.dir) { B.dir = d; room(R)?.emit('hotel:user', botState(B)); }
}
function botSay(R, B, text, delay = 900) {
  B.busyUntil = Date.now() + delay + 3000;
  setTimeout(() => { if (mech(R).bots.includes(B) && ctx.live.get(R.id) === R) roomSay(R, B.id, B.name, text, { bot: true }); }, delay);
}
function botWave(R, B) {
  B.act = 'wave';
  room(R)?.emit('hotel:user', botState(B));
  setTimeout(() => { if (B.act === 'wave') { B.act = null; room(R)?.emit('hotel:user', botState(B)); } }, 2400);
}

function onEnter(R, U) {
  if (!BOT_SPECS[R.row.official_key] || !R.row.official) return;
  ensureBots(R);
  const M = mech(R);
  const rec = M.bots.find((B) => B.bot === 'reception');
  if (!rec) return;
  const last = M.greeted.get(U.id) || 0;
  if (Date.now() - last < 60e3) return;
  M.greeted.set(U.id, Date.now());
  setTimeout(() => {
    if (R.users.get(U.id) !== U) return;
    botFace(R, rec, U);
    botWave(R, rec);
    botSay(R, rec, greeting(U.name), 0);
  }, 1300);
}
function onLeave(R) {
  if (R.users.size || !R.mech) return;
  for (const B of R.mech.bots) clearTimeout(B.timer);
  R.mech.bots = [];
  R.mech.botsReady = false;
}
function onChat(R, U, msg) {
  const M = R.mech;
  if (!M?.bots.length || msg.mode === 'whisper') return;
  const t = Date.now();
  if (t - (M.lastBot.get(U.id) || 0) < 2500) return;
  for (const B of M.bots) {
    let reply = null, give = null;
    if (B.bot === 'reception') reply = receptionReply(msg.text);
    else if (B.bot === 'bartender') {
      give = drinkRequest(msg.text);
      if (give) reply = `¡Marchando ${ARTICLE[give]} para ${U.name}! ${HAND_ITEMS[give].emoji}`;
      else if (hasWord(norm(msg.text), ['hola', 'buenas', 'barman', 'beto'])) reply = `¡Hola, ${U.name}! ¿Qué te sirvo? Tengo café, refresco, agua, helado y palomitas.`;
    }
    if (!reply) continue;
    M.lastBot.set(U.id, t);
    botFace(R, B, U);
    botSay(R, B, reply);
    if (give) setTimeout(() => setHand(R, U, give), 1500);
    return;
  }
}

// ----- Reloj: rodillos, bots y wired -----
function tick() {
  for (const R of ctx.live.values()) {
    try {
      rollRoom(R);
      for (const B of R.mech?.bots || []) botWander(R, B);
      wiredTick(R);
    } catch (e) { console.error('[hotel] mecánicas:', e); }
  }
}
function rollRoom(R) {
  let any = false;
  for (const it of R.items.values()) if (isRoller(it)) { any = true; break; }
  if (!any) return;
  const users = [...R.users.values()].map((U) => {
    const p = ctx.logical(U);
    const dest = U.path ? { x: U.path[U.path.length - 1][0], y: U.path[U.path.length - 1][1] } : null;
    return { id: U.id, x: p.x, y: p.y, z: p.z, moving: !!U.path || !!U.lay, dest };
  });
  const occupied = (R.mech?.bots || []).flatMap((B) => { const d = botDest(B); return [k2(B.x, B.y), k2(d.x, d.y)]; });
  const plan = planRollers(R.grid, R.items.values(), users, { occupied });
  for (const mv of plan.items) {
    ctx.persist(mv.item);
    emitItem(R, mv.item, { slide: { from: mv.from, ms: STEP_MS } });
  }
  for (const mv of plan.users) {
    const U = R.users.get(mv.id);
    if (!U) continue;
    [U.x, U.y, U.z] = mv.from;
    scriptPath(R, U, [mv.to], { slide: true });
  }
}

// Mover un furni una casilla (wired): con animación de deslizar
function nudge(R, it, dx, dy) {
  const users = [...R.users.values()].map((U) => ctx.logical(U));
  const mv = nudgeItem(R.grid, it, dx, dy, users);
  if (!mv) return false;
  ctx.persist(it);
  emitItem(R, it, { slide: { from: mv.from, ms: STEP_MS } });
  return true;
}

export const _mech = { planRollers, onewayCheck, spinResult, loveResult, drinkRequest, receptionReply };
