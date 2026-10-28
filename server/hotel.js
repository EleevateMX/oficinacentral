// Hotel: salas personales isométricas con furnis, caminar con A* y chat con globitos.
// REST bajo /api/hotel (lista de salas, crear/editar/borrar, inventario, tienda, permisos)
// y tiempo real con Socket.IO (entrar, caminar, chat, colocar/mover/usar furnis, timbre, moderación).
// No toca la presencia de la oficina: es una capa aparte.
import { db, now } from './db.js';
import { hashPassword, verifyPassword } from './auth.js';
import { audit } from './security.js';
import { ROOM_MODELS, ROT_DIR, ACCESS, CHAT_MODES, MAX_ROOMS_PER_USER, MAX_FURNI_PER_ROOM, MAX_INVENTORY, ROOM_CAPACITY, WALK_SPEED } from '../shared/hotel.js';
import { FURNI_BY_ID, STARTER_INVENTORY } from '../shared/hotelCatalog.js';
import { buildRoom, tileInfo, findPath, canPlace, canPlaceWall, roomAddItem, roomRemoveItem, wallBase, dirOf } from '../shared/hotelRoom.js';

db.exec(`
CREATE TABLE IF NOT EXISTS hotel_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  access TEXT NOT NULL DEFAULT 'open',
  password_hash TEXT,
  wall_color TEXT,
  floor_color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_owner ON hotel_rooms(owner_id);
CREATE TABLE IF NOT EXISTS hotel_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id INTEGER REFERENCES hotel_rooms(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  x INTEGER, y INTEGER, z REAL NOT NULL DEFAULT 0,
  rot INTEGER NOT NULL DEFAULT 0,
  state INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  wall_pos TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hotel_items_room ON hotel_items(room_id);
CREATE INDEX IF NOT EXISTS idx_hotel_items_owner ON hotel_items(owner_id, room_id);
CREATE TABLE IF NOT EXISTS hotel_rights (
  room_id INTEGER NOT NULL REFERENCES hotel_rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS hotel_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  starter_at INTEGER
);
`);

let IO = null;
const HEX = /^#[0-9a-fA-F]{6}$/;
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const getUser = (id) => db.prepare('SELECT id, display_name, avatar, role FROM users WHERE id = ?').get(id);
const isAdmin = (uid) => getUser(uid)?.role === 'admin';
const key = (id) => `hotel:${id}`;

// ---------- Filas → objetos ----------
function itemOut(r) {
  return {
    id: r.id, ownerId: r.owner_id, roomId: r.room_id, type: r.type,
    x: r.x, y: r.y, z: r.z, rot: r.rot, state: r.state, color: r.color,
    wall: r.wall_pos ? parse(r.wall_pos, null) : null, extra: parse(r.extra, {}),
  };
}
function roomOut(r, uid) {
  const owner = getUser(r.owner_id);
  const L = live.get(r.id);
  return {
    id: r.id, name: r.name, description: r.description, model: r.model, access: r.access,
    ownerId: r.owner_id, ownerName: owner?.display_name || '¿?', ownerAvatar: parse(owner?.avatar, {}),
    wallColor: r.wall_color, floorColor: r.floor_color,
    users: L ? L.users.size : 0, capacity: ROOM_CAPACITY, isOwner: r.owner_id === uid,
    hasPassword: !!r.password_hash, updatedAt: r.updated_at,
  };
}
const roomRow = (id) => db.prepare('SELECT * FROM hotel_rooms WHERE id = ?').get(Number(id));
const inventory = (uid) => db.prepare('SELECT * FROM hotel_items WHERE owner_id = ? AND room_id IS NULL ORDER BY id').all(uid).map(itemOut);
const invCount = (uid) => db.prepare('SELECT COUNT(*) AS n FROM hotel_items WHERE owner_id = ? AND room_id IS NULL').get(uid).n;

function addItem(uid, type, color, extra = {}) {
  const id = Number(db.prepare('INSERT INTO hotel_items (owner_id, type, color, extra, state, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(uid, type, color, JSON.stringify(extra), now()).lastInsertRowid);
  return id;
}
function buy(uid, type, color) {
  const def = FURNI_BY_ID[type];
  if (!def) throw new Error('Ese furni no existe');
  const c = color && def.colors?.includes(color) ? color : (def.colors?.[0] || null);
  const ids = [];
  if (def.interact === 'teleport') {
    // Los teletransportadores vienen en par y quedan enlazados entre sí
    const a = addItem(uid, type, c), b = addItem(uid, type, c, { link: a });
    db.prepare('UPDATE hotel_items SET extra = ? WHERE id = ?').run(JSON.stringify({ link: b }), a);
    ids.push(a, b);
  } else ids.push(addItem(uid, type, c));
  return ids.map((id) => itemOut(db.prepare('SELECT * FROM hotel_items WHERE id = ?').get(id)));
}
// Regalo de bienvenida (una vez por persona)
export function ensureStarter(uid) {
  const p = db.prepare('SELECT starter_at FROM hotel_profiles WHERE user_id = ?').get(uid);
  if (p?.starter_at) return false;
  db.prepare('INSERT INTO hotel_profiles (user_id, starter_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET starter_at = excluded.starter_at').run(uid, now());
  for (const t of STARTER_INVENTORY) buy(uid, t, null);
  return true;
}

// ---------- Salas en vivo ----------
// roomId -> { id, row, grid, items: Map, users: Map<uid, U>, rights: Set, chat: [], bans: Map }
const live = new Map();
const sessionBans = new Map(); // roomId -> Map(uid -> hasta cuándo)
const where = new Map(); // uid -> { roomId, socket }
const pendingBell = new Map(); // uid -> { roomId, socket, at }

function loadRoom(id) {
  let R = live.get(id);
  if (R) return R;
  const row = roomRow(id);
  if (!row) return null;
  const items = db.prepare('SELECT * FROM hotel_items WHERE room_id = ?').all(id).map(itemOut);
  R = {
    id, row, items: new Map(items.map((i) => [i.id, i])), grid: buildRoom(row.model, items.filter((i) => !i.wall)),
    users: new Map(), rights: new Set(db.prepare('SELECT user_id FROM hotel_rights WHERE room_id = ?').all(id).map((r) => r.user_id)), chat: [],
  };
  live.set(id, R);
  return R;
}
function unloadIfEmpty(R) {
  if (!R.users.size) live.delete(R.id);
}
const canEdit = (R, uid) => R.row.owner_id === uid || R.rights.has(uid) || isAdmin(uid);

// Posición lógica de alguien que camina (la casilla en la que va)
function logical(U, t = Date.now()) {
  if (!U.path) return { x: U.x, y: U.y, z: U.z, moving: false, i: 0 };
  const i = Math.floor(((t - U.t0) / 1000) * WALK_SPEED);
  if (i >= U.path.length) { const [x, y, z] = U.path[U.path.length - 1]; return { x, y, z, moving: false, i: U.path.length }; }
  if (i <= 0) return { x: U.x, y: U.y, z: U.z, moving: true, i: 0 };
  const [x, y, z] = U.path[i - 1];
  return { x, y, z, moving: true, i };
}
const destOf = (U) => (U.path ? { x: U.path[U.path.length - 1][0], y: U.path[U.path.length - 1][1] } : { x: U.x, y: U.y });

function userOut(U) {
  const p = logical(U);
  return {
    id: U.id, name: U.name, avatar: U.avatar, x: p.x, y: p.y, z: p.z, dir: U.dir, sit: U.sit, lay: U.lay,
    path: U.path && p.moving ? U.path.slice(p.i) : null,
  };
}
const userState = (U) => ({ id: U.id, x: U.x, y: U.y, z: U.z, dir: U.dir, sit: U.sit, lay: U.lay });

function snapshot(R, uid) {
  const m = ROOM_MODELS[R.row.model] || ROOM_MODELS.a;
  return {
    room: roomOut(R.row, uid), heightmap: m.map, door: m.door,
    items: [...R.items.values()], users: [...R.users.values()].map(userOut),
    rights: [...R.rights], isOwner: R.row.owner_id === uid, admin: isAdmin(uid),
    chat: R.chat.slice(-50),
  };
}

function leaveRoom(uid, reason = null) {
  const w = where.get(uid);
  const bell = pendingBell.get(uid);
  if (bell) pendingBell.delete(uid);
  if (!w) return;
  where.delete(uid);
  const R = live.get(w.roomId);
  w.socket.leave(key(w.roomId));
  if (reason) w.socket.emit('hotel:left', { roomId: w.roomId, reason });
  if (!R) return;
  const U = R.users.get(uid);
  if (U?.timer) clearTimeout(U.timer);
  R.users.delete(uid);
  IO?.to(key(R.id)).emit('hotel:user:leave', { id: uid });
  unloadIfEmpty(R);
}

function enterRoom(socket, uid, R, { spawn = null } = {}) {
  if (where.has(uid)) leaveRoom(uid, where.get(uid).socket !== socket ? 'elsewhere' : null);
  pendingBell.delete(uid);
  const u = getUser(uid);
  const door = R.grid.door;
  const s = spawn || { x: door.x, y: door.y, z: tileInfo(R.grid, door.x, door.y)?.z ?? 0, dir: ROT_DIR[door.rot] || 'down' };
  const U = { id: uid, name: u.display_name, avatar: parse(u.avatar, {}), x: s.x, y: s.y, z: s.z, dir: s.dir || 'down', sit: null, lay: null, path: null, t0: 0, timer: null, socket };
  R.users.set(uid, U);
  where.set(uid, { roomId: R.id, socket });
  socket.join(key(R.id));
  socket.emit('hotel:room', snapshot(R, uid));
  socket.to(key(R.id)).emit('hotel:user:join', userOut(U));
  return U;
}

// Volver a calcular altura/sentado de quien está parado sobre casillas que cambiaron
function refreshUsers(R, tiles = null) {
  for (const U of R.users.values()) {
    if (U.path) continue;
    if (tiles && !tiles.some(([x, y]) => x === U.x && y === U.y)) continue;
    const t = tileInfo(R.grid, U.x, U.y);
    if (!t) continue;
    const before = JSON.stringify(userState(U));
    U.z = t.z;
    applySeat(U, t);
    if (JSON.stringify(userState(U)) !== before) IO?.to(key(R.id)).emit('hotel:user', userState(U));
  }
}
function applySeat(U, t) {
  const wasFloorSit = U.sit?.floor;
  U.sit = null; U.lay = null;
  if (t.kind === 'sit') { U.sit = { z: t.z }; U.dir = ROT_DIR[t.item.rot] || U.dir; }
  else if (t.kind === 'lay') { U.lay = { z: t.z }; U.dir = ROT_DIR[t.item.rot] || U.dir; }
  else if (wasFloorSit) U.sit = { floor: true };
}
function footTiles(it) {
  const def = FURNI_BY_ID[it.type];
  if (!def || it.wall || it.x == null) return [];
  const w = it.rot === 2 || it.rot === 6 ? def.l : def.w, l = it.rot === 2 || it.rot === 6 ? def.w : def.l;
  const out = [];
  for (let j = it.y; j < it.y + l; j++) for (let i = it.x; i < it.x + w; i++) out.push([i, j]);
  return out;
}

function startWalk(R, U, to, { onArrive = null } = {}) {
  const t = Date.now();
  const cur = logical(U, t);
  // Si va caminando, el nuevo camino sale de la casilla a la que ya se dirige
  const from = cur.moving && U.path[cur.i] ? { x: U.path[cur.i][0], y: U.path[cur.i][1], z: U.path[cur.i][2] } : { x: cur.x, y: cur.y, z: cur.z };
  const occupied = new Set();
  for (const V of R.users.values()) if (V !== U) { const d = destOf(V); occupied.add(`${d.x},${d.y}`); }
  const rest = findPath(R.grid, from, to, { occupied });
  if (!rest) return false;
  const path = cur.moving && U.path[cur.i] ? [[from.x, from.y, from.z], ...rest] : rest;
  if (U.timer) clearTimeout(U.timer);
  if (!path.length) { U.path = null; return true; }
  U.x = cur.x; U.y = cur.y; U.z = cur.z;
  U.path = path; U.t0 = t; U.sit = null; U.lay = null;
  U.onArrive = onArrive;
  IO?.to(key(R.id)).emit('hotel:path', { id: U.id, from: [U.x, U.y, U.z], path });
  U.timer = setTimeout(() => arrive(R, U), (path.length / WALK_SPEED) * 1000 + 20);
  return true;
}

function arrive(R, U) {
  if (!U.path || R.users.get(U.id) !== U) return;
  const last = U.path[U.path.length - 1];
  const prev = U.path.length > 1 ? U.path[U.path.length - 2] : [U.x, U.y];
  const d = dirOf(last[0] - prev[0], last[1] - prev[1]);
  if (d) U.dir = d;
  [U.x, U.y, U.z] = last;
  U.path = null; U.timer = null;
  const t = tileInfo(R.grid, U.x, U.y);
  if (t) { U.z = t.z; applySeat(U, t); }
  IO?.to(key(R.id)).emit('hotel:user', userState(U));
  const cb = U.onArrive; U.onArrive = null;
  // Pisar la puerta = salir de la sala
  if (U.x === R.grid.door.x && U.y === R.grid.door.y) { leaveRoom(U.id, 'door'); return; }
  if (t?.kind === 'teleport') teleport(R, U, t.item);
  cb?.();
}

// Teletransportador: te lleva al otro del par (aunque esté en otra sala)
function teleport(R, U, item) {
  const linkId = Number(item.extra?.link);
  const other = linkId && db.prepare('SELECT * FROM hotel_items WHERE id = ?').get(linkId);
  if (!other || other.room_id == null || other.wall_pos) {
    U.socket.emit('hotel:notice', { text: 'El otro teletransportador no está colocado en ninguna sala' });
    return;
  }
  flash(R, item);
  setTimeout(() => {
    if (R.users.get(U.id) !== U || U.path || U.x !== item.x || U.y !== item.y) return;
    const o = itemOut(other);
    if (o.roomId === R.id) {
      U.x = o.x; U.y = o.y; U.z = o.z; U.dir = ROT_DIR[o.rot] || U.dir; U.sit = null; U.lay = null;
      IO?.to(key(R.id)).emit('hotel:user', { ...userState(U), tp: true });
      flash(R, R.items.get(o.id) || o);
      return;
    }
    const R2 = loadRoom(o.roomId);
    if (!R2) return;
    if (isBanned(R2.id, U.id) || (R2.users.size >= ROOM_CAPACITY && !isAdmin(U.id) && R2.row.owner_id !== U.id)) {
      unloadIfEmpty(R2);
      U.socket.emit('hotel:notice', { text: 'No se pudo: la otra sala está llena o no puedes entrar' });
      return;
    }
    const sock = U.socket;
    enterRoom(sock, U.id, R2, { spawn: { x: o.x, y: o.y, z: o.z, dir: ROT_DIR[o.rot] } });
    flash(R2, R2.items.get(o.id) || o);
  }, 700);
}
function flash(R, item) {
  const it = R.items.get(item.id);
  if (!it) return;
  it.state = 1;
  IO?.to(key(R.id)).emit('hotel:item', { op: 'update', item: it });
  setTimeout(() => { if (R.items.get(it.id) === it) { it.state = 0; IO?.to(key(R.id)).emit('hotel:item', { op: 'update', item: it }); } }, 1200);
}

function isBanned(roomId, uid) {
  const b = sessionBans.get(roomId)?.get(uid);
  return !!b && b > Date.now();
}

// Limpia texto del chat
const ch = (c) => String.fromCharCode(c);
const BAD_CHARS = new RegExp(`[${ch(0)}-${ch(31)}${ch(127)}${ch(0x200b)}-${ch(0x200f)}${ch(0x2028)}-${ch(0x202e)}]`, 'g');
export function cleanText(s) {
  return String(s ?? '').replace(BAD_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

const persist = (it) => db.prepare('UPDATE hotel_items SET room_id = ?, x = ?, y = ?, z = ?, rot = ?, state = ?, wall_pos = ? WHERE id = ?')
  .run(it.roomId ?? null, it.x ?? null, it.y ?? null, it.z ?? 0, it.rot ?? 0, it.state ?? 0, it.wall ? JSON.stringify(it.wall) : null, it.id);

// ---------- Tiempo real ----------
export function initHotel(io, socket, userId) {
  IO = io;
  const limiter = (n, ms) => { let ts = []; return () => { const t = Date.now(); ts = ts.filter((x) => t - x < ms); if (ts.length >= n) return false; ts.push(t); return true; }; };
  const walkOk = limiter(12, 1000), chatOk = limiter(6, 5000), furniOk = limiter(12, 1000), bellOk = limiter(3, 15000);
  const mine = () => { const w = where.get(userId); return w && w.socket === socket ? live.get(w.roomId) : null; };
  const err = (text) => socket.emit('hotel:notice', { text, error: true });

  socket.on('hotel:enter', (m) => {
    const roomId = Number(m?.roomId);
    const row = roomRow(roomId);
    if (!row) return socket.emit('hotel:enter:fail', { roomId, reason: 'missing' });
    const R = loadRoom(roomId);
    const owner = row.owner_id === userId, admin = isAdmin(userId), rights = R.rights.has(userId);
    const fail = (reason) => { unloadIfEmpty(R); socket.emit('hotel:enter:fail', { roomId, reason }); };
    if (!owner && !admin && isBanned(roomId, userId)) return fail('banned');
    if (!owner && !admin && R.users.size >= ROOM_CAPACITY) return fail('full');
    if (owner || admin || rights || row.access === 'open') return enterRoom(socket, userId, R);
    if (row.access === 'closed') return fail('closed');
    if (row.access === 'password') {
      if (!row.password_hash || !verifyPassword(String(m?.password || ''), row.password_hash)) return fail('password');
      return enterRoom(socket, userId, R);
    }
    // Timbre: les llega a quienes pueden abrir y están dentro
    const openers = [...R.users.values()].filter((U) => canEdit(R, U.id));
    if (!openers.length) return fail('nobody');
    if (!bellOk()) return fail('wait');
    pendingBell.set(userId, { roomId, socket, at: Date.now() });
    const u = getUser(userId);
    for (const U of openers) U.socket.emit('hotel:bell', { roomId, userId, name: u.display_name });
    socket.emit('hotel:waiting', { roomId });
  });

  socket.on('hotel:bell:answer', (m) => {
    const R = mine();
    const guest = Number(m?.userId);
    const p = pendingBell.get(guest);
    if (!R || !p || p.roomId !== R.id || !canEdit(R, userId)) return;
    pendingBell.delete(guest);
    for (const U of R.users.values()) if (canEdit(R, U.id) && U.id !== userId) U.socket.emit('hotel:bell:done', { userId: guest });
    if (m.allow) {
      if (R.users.size >= ROOM_CAPACITY) return p.socket.emit('hotel:enter:fail', { roomId: R.id, reason: 'full' });
      enterRoom(p.socket, guest, R);
    } else p.socket.emit('hotel:enter:fail', { roomId: R.id, reason: 'denied' });
  });

  socket.on('hotel:leave', () => {
    const w = where.get(userId);
    if (w?.socket === socket) leaveRoom(userId);
    if (pendingBell.get(userId)?.socket === socket) pendingBell.delete(userId);
  });

  socket.on('hotel:walk', (m) => {
    const R = mine();
    if (!R || !walkOk()) return;
    const U = R.users.get(userId);
    const x = Math.trunc(Number(m?.x)), y = Math.trunc(Number(m?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!startWalk(R, U, { x, y })) socket.emit('hotel:nopath', { x, y });
  });

  // Sentarse en el piso (":sit") / pararse
  socket.on('hotel:sit', () => {
    const R = mine();
    const U = R?.users.get(userId);
    if (!U || U.path || U.lay) return;
    const t = tileInfo(R.grid, U.x, U.y);
    if (t?.kind === 'sit') return;
    U.sit = U.sit ? null : { floor: true };
    IO.to(key(R.id)).emit('hotel:user', userState(U));
  });

  socket.on('hotel:look', (m) => {
    const R = mine();
    const U = R?.users.get(userId);
    if (!U || U.path || U.sit || U.lay) return;
    const d = dirOf(Math.sign(Number(m?.x) - U.x) || 0, Math.sign(Number(m?.y) - U.y) || 0);
    if (!d || d === U.dir) return;
    U.dir = d;
    IO.to(key(R.id)).emit('hotel:user', userState(U));
  });

  socket.on('hotel:chat', (m) => {
    const R = mine();
    if (!R) return;
    const text = cleanText(m?.text);
    const mode = CHAT_MODES.includes(m?.mode) ? m.mode : 'say';
    if (!text || !chatOk()) return;
    const U = R.users.get(userId);
    const msg = { id: `${userId}-${Date.now()}`, from: userId, name: U.name, text, mode, at: Date.now() };
    if (mode === 'whisper') {
      const to = R.users.get(Number(m?.to));
      if (!to || to.id === userId) return err('Esa persona no está en la sala');
      msg.to = to.id;
      socket.emit('hotel:chat', msg);
      to.socket.emit('hotel:chat', msg);
      return;
    }
    R.chat.push(msg);
    if (R.chat.length > 50) R.chat.shift();
    IO.to(key(R.id)).emit('hotel:chat', msg);
  });

  // Escribiendo… (globito de puntos)
  socket.on('hotel:typing', (on) => {
    const R = mine();
    if (R) socket.to(key(R.id)).emit('hotel:typing', { id: userId, on: !!on });
  });

  // ---------- Furnis ----------
  const placeCommon = (R, it, m) => {
    const def = FURNI_BY_ID[it.type];
    if (def.kind === 'wall') {
      const wall = m.wall === 'l' || m.wall === 'r' ? m.wall : null;
      const pos = Math.trunc(Number(m.pos)), h = Math.round(Number(m.h) * 4) / 4;
      const v = canPlaceWall(R.grid, def, wall, pos, h);
      if (!v.ok) return v;
      return { ok: true, patch: { wall: { wall, pos, h }, x: null, y: null, z: wallBase(R.grid, wall, pos) + h, rot: wall === 'l' ? 2 : 4 } };
    }
    const x = Math.trunc(Number(m.x)), y = Math.trunc(Number(m.y));
    const rot = m.rot == null ? it.rot ?? def.rots[0] : Number(m.rot);
    const users = [...R.users.values()].map((U) => { const p = logical(U); return { x: p.x, y: p.y }; });
    const v = canPlace(R.grid, def, x, y, rot, { ignoreId: it.id, users });
    if (!v.ok) return v;
    return { ok: true, patch: { x, y, z: v.z, rot, wall: null } };
  };

  socket.on('hotel:place', (m) => {
    const R = mine();
    if (!R || !furniOk()) return;
    if (!canEdit(R, userId)) return err('No tienes permiso para decorar esta sala');
    const row = db.prepare('SELECT * FROM hotel_items WHERE id = ? AND owner_id = ? AND room_id IS NULL').get(Number(m?.itemId), userId);
    if (!row) return err('Ese furni no está en tu inventario');
    if (R.items.size >= MAX_FURNI_PER_ROOM) return err(`La sala ya tiene el máximo de ${MAX_FURNI_PER_ROOM} furnis`);
    const it = itemOut(row);
    if (!FURNI_BY_ID[it.type]) return err('Ese furni ya no existe');
    const v = placeCommon(R, it, m);
    if (!v.ok) return err(v.reason);
    Object.assign(it, v.patch, { roomId: R.id, state: FURNI_BY_ID[it.type].interact === 'dice' ? 1 : 0 });
    persist(it);
    R.items.set(it.id, it);
    if (!it.wall) roomAddItem(R.grid, it);
    IO.to(key(R.id)).emit('hotel:item', { op: 'add', item: it });
    socket.emit('hotel:inv', { remove: [it.id] });
    if (!it.wall) refreshUsers(R, footTiles(it));
  });

  socket.on('hotel:move', (m) => {
    const R = mine();
    if (!R || !furniOk()) return;
    const it = R.items.get(Number(m?.itemId));
    if (!it) return;
    if (!canEdit(R, userId)) return err('No tienes permiso para mover furnis aquí');
    const v = placeCommon(R, it, m);
    if (!v.ok) return err(v.reason);
    const before = footTiles(it);
    if (!it.wall) roomRemoveItem(R.grid, it);
    Object.assign(it, v.patch);
    if (!it.wall) roomAddItem(R.grid, it);
    persist(it);
    IO.to(key(R.id)).emit('hotel:item', { op: 'update', item: it });
    refreshUsers(R, [...before, ...footTiles(it)]);
  });

  socket.on('hotel:rotate', (m) => {
    const R = mine();
    if (!R || !furniOk()) return;
    const it = R.items.get(Number(m?.itemId));
    if (!it || it.wall) return;
    if (!canEdit(R, userId)) return err('No tienes permiso para girar furnis aquí');
    const def = FURNI_BY_ID[it.type];
    if (def.rots.length < 2) return;
    const before = footTiles(it);
    roomRemoveItem(R.grid, it);
    let done = false;
    for (let k = 1; k < def.rots.length && !done; k++) {
      const rot = def.rots[(def.rots.indexOf(it.rot) + k) % def.rots.length];
      const users = [...R.users.values()].map((U) => logical(U));
      const v = canPlace(R.grid, def, it.x, it.y, rot, { ignoreId: it.id, users: users.filter((u) => !before.some(([x, y]) => x === u.x && y === u.y)) });
      if (v.ok) { it.rot = rot; it.z = v.z; done = true; }
    }
    roomAddItem(R.grid, it);
    if (!done) return err('No hay espacio para girarlo');
    persist(it);
    IO.to(key(R.id)).emit('hotel:item', { op: 'update', item: it });
    refreshUsers(R, [...before, ...footTiles(it)]);
  });

  socket.on('hotel:pickup', (m) => {
    const R = mine();
    if (!R || !furniOk()) return;
    const it = R.items.get(Number(m?.itemId));
    if (!it) return;
    if (!canEdit(R, userId)) return err('No tienes permiso para recoger furnis aquí');
    const tiles = footTiles(it);
    if (!it.wall) roomRemoveItem(R.grid, it);
    R.items.delete(it.id);
    Object.assign(it, { roomId: null, x: null, y: null, z: 0, wall: null, state: 0 });
    persist(it);
    IO.to(key(R.id)).emit('hotel:item', { op: 'remove', id: it.id });
    // Regresa al inventario de quien es dueño del furni
    IO.to(`user:${it.ownerId}`).emit('hotel:inv', { add: [it] });
    refreshUsers(R, tiles);
  });

  socket.on('hotel:use', (m) => {
    const R = mine();
    if (!R || !furniOk()) return;
    const it = R.items.get(Number(m?.itemId));
    if (!it) return;
    const def = FURNI_BY_ID[it.type];
    const U = R.users.get(userId);
    if (def.interact === 'dice') {
      if (it.state === 0) return; // ya está rodando
      it.state = 0;
      IO.to(key(R.id)).emit('hotel:item', { op: 'update', item: it });
      setTimeout(() => {
        if (R.items.get(it.id) !== it) return;
        it.state = 1 + Math.floor(Math.random() * 6);
        persist(it);
        IO.to(key(R.id)).emit('hotel:item', { op: 'update', item: it, roll: { by: userId } });
      }, 1100);
      return;
    }
    if (def.interact === 'teleport') {
      if (it.wall) return;
      const p = logical(U);
      if (!p.moving && p.x === it.x && p.y === it.y) return teleport(R, U, it);
      if (!startWalk(R, U, { x: it.x, y: it.y })) err('No se puede llegar al teletransportador');
      return;
    }
    if (!def.interact || def.states < 2) return;
    if (!canEdit(R, userId)) return err('Solo quien tiene permisos puede usar esto');
    if (def.interact === 'gate' && it.state === 1) {
      // No se cierra con alguien encima
      const tiles = footTiles(it);
      if ([...R.users.values()].some((V) => { const p = logical(V); return tiles.some(([x, y]) => x === p.x && y === p.y); })) return err('Hay alguien en la reja');
    }
    it.state = (it.state + 1) % def.states;
    persist(it);
    IO.to(key(R.id)).emit('hotel:item', { op: 'update', item: it });
  });

  // ---------- Moderación ----------
  socket.on('hotel:kick', (m) => {
    const R = mine();
    const target = Number(m?.userId);
    if (!R || !R.users.has(target) || target === userId || !canEdit(R, userId)) return;
    if (target === R.row.owner_id || isAdmin(target)) return err('No puedes sacar a esa persona');
    if (m?.ban) {
      if (R.row.owner_id !== userId && !isAdmin(userId)) return err('Solo quien es dueño puede vetar');
      if (!sessionBans.has(R.id)) sessionBans.set(R.id, new Map());
      sessionBans.get(R.id).set(target, Date.now() + 60 * 60e3);
    }
    leaveRoom(target, m?.ban ? 'ban' : 'kick');
  });

  socket.on('disconnect', () => {
    const w = where.get(userId);
    if (w?.socket === socket) leaveRoom(userId);
    if (pendingBell.get(userId)?.socket === socket) pendingBell.delete(userId);
  });
}

// Avisar a la sala que cambió algo de sus ajustes
function broadcastRoom(R) {
  if (!R) return;
  for (const U of R.users.values()) U.socket.emit('hotel:room:update', { room: roomOut(R.row, U.id), rights: [...R.rights] });
}

// ---------- REST ----------
export function registerHotelRoutes(api, { fail, wrap, notify = null }) {
  const roomLimiter = new Map();
  const buyTimes = new Map();

  api.get('/hotel/rooms', wrap((req, res) => {
    const uid = req.user.id;
    ensureStarter(uid);
    const tab = String(req.query.tab || 'popular');
    const q = String(req.query.q || '').trim().slice(0, 40);
    let rows;
    if (tab === 'mine') rows = db.prepare('SELECT * FROM hotel_rooms WHERE owner_id = ? ORDER BY updated_at DESC').all(uid);
    else if (tab === 'all' || q) rows = db.prepare("SELECT * FROM hotel_rooms WHERE name LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 100").all(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    else {
      rows = db.prepare('SELECT * FROM hotel_rooms ORDER BY updated_at DESC LIMIT 200').all();
      rows.sort((a, b) => (live.get(b.id)?.users.size || 0) - (live.get(a.id)?.users.size || 0) || b.updated_at - a.updated_at);
      rows = rows.slice(0, 50);
    }
    res.json({ rooms: rows.map((r) => roomOut(r, uid)), mine: db.prepare('SELECT COUNT(*) AS n FROM hotel_rooms WHERE owner_id = ?').get(uid).n, maxRooms: MAX_ROOMS_PER_USER });
  }));

  api.get('/hotel/rooms/:id', wrap((req, res) => {
    const r = roomRow(req.params.id);
    if (!r) return fail(res, 404, 'Esa sala ya no existe');
    const rights = db.prepare('SELECT user_id FROM hotel_rights WHERE room_id = ?').all(r.id).map((x) => x.user_id);
    res.json({ room: roomOut(r, req.user.id), rights });
  }));

  const validRoom = (b, { partial = false, row = null } = {}) => {
    const out = {};
    if (!partial || b.name !== undefined) {
      const name = cleanText(b.name).slice(0, 40);
      if (!name) return { error: 'Ponle nombre a tu sala' };
      out.name = name;
    }
    if (b.description !== undefined) out.description = cleanText(b.description).slice(0, 200);
    if (!partial) {
      if (!ROOM_MODELS[b.model]) return { error: 'Elige un modelo de sala' };
      out.model = b.model;
    }
    if (!partial || b.access !== undefined) {
      const access = b.access ?? 'open';
      if (!ACCESS.includes(access)) return { error: 'Tipo de acceso inválido' };
      out.access = access;
      if (access === 'password') {
        const pw = typeof b.password === 'string' ? b.password : '';
        if (pw) {
          if (pw.length < 3 || pw.length > 64) return { error: 'La contraseña debe tener entre 3 y 64 caracteres' };
          out.password_hash = hashPassword(pw);
        } else if (!row?.password_hash) return { error: 'Escribe una contraseña para la sala' };
      }
    }
    for (const [k, col] of [['wallColor', 'wall_color'], ['floorColor', 'floor_color']]) {
      if (b[k] === undefined) continue;
      if (b[k] !== null && !HEX.test(b[k])) return { error: 'Color inválido' };
      out[col] = b[k];
    }
    return { out };
  };

  api.post('/hotel/rooms', wrap((req, res) => {
    const uid = req.user.id;
    const t = Date.now();
    if (t - (roomLimiter.get(uid) || 0) < 1500) return fail(res, 429, 'Espera un momento');
    const n = db.prepare('SELECT COUNT(*) AS n FROM hotel_rooms WHERE owner_id = ?').get(uid).n;
    if (n >= MAX_ROOMS_PER_USER) return fail(res, 400, `Ya tienes ${MAX_ROOMS_PER_USER} salas (el máximo)`);
    const v = validRoom(req.body || {});
    if (v.error) return fail(res, 400, v.error);
    roomLimiter.set(uid, t);
    const o = v.out;
    const id = Number(db.prepare(`INSERT INTO hotel_rooms (owner_id, name, description, model, access, password_hash, wall_color, floor_color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(uid, o.name, o.description || '', o.model, o.access, o.password_hash || null, o.wall_color || null, o.floor_color || null, now(), now()).lastInsertRowid);
    res.json({ room: roomOut(roomRow(id), uid) });
  }));

  const ownerOrAdmin = (req, res) => {
    const r = roomRow(req.params.id);
    if (!r) { fail(res, 404, 'Esa sala ya no existe'); return null; }
    if (r.owner_id !== req.user.id && req.user.role !== 'admin') { fail(res, 403, 'Solo quien es dueño de la sala puede hacer esto'); return null; }
    return r;
  };

  api.patch('/hotel/rooms/:id', wrap((req, res) => {
    const r = ownerOrAdmin(req, res);
    if (!r) return;
    const v = validRoom(req.body || {}, { partial: true, row: r });
    if (v.error) return fail(res, 400, v.error);
    const o = v.out;
    if (o.access && o.access !== 'password') o.password_hash = null;
    const cols = Object.keys(o);
    if (cols.length) db.prepare(`UPDATE hotel_rooms SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map((c) => o[c]), now(), r.id);
    const R = live.get(r.id);
    if (R) { R.row = roomRow(r.id); broadcastRoom(R); }
    res.json({ room: roomOut(roomRow(r.id), req.user.id) });
  }));

  api.delete('/hotel/rooms/:id', wrap((req, res) => {
    const r = ownerOrAdmin(req, res);
    if (!r) return;
    const R = live.get(r.id);
    if (R) for (const uid of [...R.users.keys()]) leaveRoom(uid, 'deleted');
    live.delete(r.id);
    const owners = db.prepare('SELECT DISTINCT owner_id FROM hotel_items WHERE room_id = ?').all(r.id).map((x) => x.owner_id);
    db.prepare('UPDATE hotel_items SET room_id = NULL, x = NULL, y = NULL, z = 0, wall_pos = NULL, state = 0 WHERE room_id = ?').run(r.id);
    db.prepare('DELETE FROM hotel_rooms WHERE id = ?').run(r.id);
    sessionBans.delete(r.id);
    for (const o of owners) IO?.to(`user:${o}`).emit('hotel:inv', { refresh: true });
    res.json({ ok: true });
  }));

  api.post('/hotel/rooms/:id/rights', wrap((req, res) => {
    const r = ownerOrAdmin(req, res);
    if (!r) return;
    const target = Number(req.body?.userId);
    if (!getUser(target) || target === r.owner_id) return fail(res, 400, 'Persona inválida');
    db.prepare('INSERT OR IGNORE INTO hotel_rights (room_id, user_id) VALUES (?, ?)').run(r.id, target);
    const R = live.get(r.id);
    if (R) { R.rights.add(target); broadcastRoom(R); }
    res.json({ ok: true });
  }));

  api.delete('/hotel/rooms/:id/rights/:userId', wrap((req, res) => {
    const r = ownerOrAdmin(req, res);
    if (!r) return;
    const target = Number(req.params.userId);
    db.prepare('DELETE FROM hotel_rights WHERE room_id = ? AND user_id = ?').run(r.id, target);
    const R = live.get(r.id);
    if (R) { R.rights.delete(target); broadcastRoom(R); }
    res.json({ ok: true });
  }));

  api.get('/hotel/inventory', wrap((req, res) => {
    ensureStarter(req.user.id);
    res.json({ items: inventory(req.user.id), max: MAX_INVENTORY });
  }));

  // Tienda (por ahora todo es gratis)
  api.post('/hotel/buy', wrap((req, res) => {
    const uid = req.user.id;
    const def = FURNI_BY_ID[req.body?.type];
    if (!def) return fail(res, 400, 'Ese furni no existe');
    const t = Date.now();
    const times = (buyTimes.get(uid) || []).filter((x) => t - x < 60e3);
    if (times.length >= 30) return fail(res, 429, 'Vas muy rápido: espera un minuto');
    if (def.exclusive && req.user.role !== 'admin') return fail(res, 403, 'Este furni es exclusivo HUB: solo los admins pueden obtenerlo');
    const need = def.interact === 'teleport' ? 2 : 1;
    if (invCount(uid) + need > MAX_INVENTORY) return fail(res, 400, `Tu inventario está lleno (máximo ${MAX_INVENTORY})`);
    times.push(t);
    buyTimes.set(uid, times);
    const color = typeof req.body?.color === 'string' ? req.body.color : null;
    res.json({ items: buy(uid, def.id, color) });
  }));

  // Regalar un furni (solo admins; incluye exclusivos): llega al inventario de la persona con aviso
  const giftTimes = new Map();
  api.post('/hotel/gift', wrap((req, res) => {
    if (req.user.role !== 'admin') return fail(res, 403, 'Solo los admins pueden regalar furnis');
    const def = FURNI_BY_ID[req.body?.type];
    if (!def) return fail(res, 400, 'Ese furni no existe');
    const to = Number(req.body?.userId);
    const target = db.prepare('SELECT id, display_name, disabled FROM users WHERE id = ?').get(to);
    if (!target || target.disabled) return fail(res, 400, 'Esa persona no existe');
    const t = Date.now();
    const times = (giftTimes.get(req.user.id) || []).filter((x) => t - x < 60e3);
    if (times.length >= 20) return fail(res, 429, 'Vas muy rápido: espera un minuto');
    const need = def.interact === 'teleport' ? 2 : 1;
    if (invCount(to) + need > MAX_INVENTORY) return fail(res, 400, 'El inventario de esa persona está lleno');
    times.push(t);
    giftTimes.set(req.user.id, times);
    const color = typeof req.body?.color === 'string' ? req.body.color : null;
    const items = buy(to, def.id, color);
    IO?.to(`user:${to}`).emit('hotel:inv', { add: items });
    try { audit({ actor: req.user.id, action: `Regaló el furni "${def.name}" a ${target.display_name}`, target: `hotel:gift:${to}`, data: { type: def.id, color }, ip: req.ip }); } catch { /* sin bitácora */ }
    notify?.(to, 'hotel_gift', req.user.id, { type: def.id, name: def.name, text: `🎁 Te regalaron ${def.name}` });
    res.json({ items });
  }));
}

// Para pruebas
export const _hotel = { live, where };
