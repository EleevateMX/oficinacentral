// Hotel (parte social): consola de amigos (solicitudes, mensajes privados con entrega diferida),
// seguir a un amigo / invitar a tu sala, navegador con categorías, etiquetas, likes, favoritas,
// eventos y búsqueda (owner:, #etiqueta), y perfil del hotel (lema, insignias, respetos).
// Se engancha a server/hotel.js con pocas líneas (initHotelSocial, registerHotelSocialRoutes,
// roomSocialOut, userSocialOut, saveRoomSocial) y usa su `hotelCtx`.
import { db, now } from './db.js';
import { hotelCtx, ensureOfficialRooms, ensureStarter } from './hotel.js';
import { hubEmit } from './hubEvents.js';
import { MAX_ROOMS_PER_USER } from '../shared/hotel.js';
import { presence } from './realtime.js';
import { localParts } from './stats.js';
import { wornIds, wornBadges, ownedBadges, setWorn, onWornChange } from './badges.js'; // placas (server/badges.js)
import {
  CATEGORY_BY_ID, DEFAULT_CATEGORY, cleanTags, parseSearch, popularScore, eventActive,
  MOTTO_MAX, MAX_BADGES, RESPECTS_PER_DAY, EVENT_HOURS, EVENT_TITLE_MAX, EVENT_DESC_MAX,
  MAX_FRIENDS, MAX_FAVORITES, PM_MAX,
} from '../shared/hotelSocial.js';

db.exec(`
CREATE TABLE IF NOT EXISTS hotel_friends (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS hotel_friend_requests (
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_hotel_freq_to ON hotel_friend_requests(to_id);
CREATE TABLE IF NOT EXISTS hotel_pms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hotel_pms_pair ON hotel_pms(from_id, to_id, id);
CREATE INDEX IF NOT EXISTS idx_hotel_pms_unread ON hotel_pms(to_id, read_at);
CREATE TABLE IF NOT EXISTS hotel_room_info (
  room_id INTEGER PRIMARY KEY REFERENCES hotel_rooms(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'otros',
  tags TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS hotel_room_likes (
  room_id INTEGER NOT NULL REFERENCES hotel_rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS hotel_room_favs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id INTEGER NOT NULL REFERENCES hotel_rooms(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, room_id)
);
CREATE TABLE IF NOT EXISTS hotel_events (
  room_id INTEGER PRIMARY KEY REFERENCES hotel_rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hotel_social_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  motto TEXT NOT NULL DEFAULT '',
  badges TEXT NOT NULL DEFAULT '[]',
  respects INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS hotel_respects (
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hotel_respects_from ON hotel_respects(from_id, day);
`);

let IO = null;
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const userRow = (id) => db.prepare('SELECT id, username, display_name, avatar, role, disabled FROM users WHERE id = ?').get(Number(id));
const online = (id) => presence.has(id);
const toUser = (id, ev, m) => IO?.to(`user:${id}`).emit(ev, m);
const limiter = () => { const m = new Map(); return (uid, n, ms) => { const t = Date.now(); const ts = (m.get(uid) || []).filter((x) => t - x < ms); if (ts.length >= n) return false; ts.push(t); m.set(uid, ts); return true; }; };
const clean = (s, max) => hotelCtx.cleanText(s).slice(0, max);

// ---------- Perfil del hotel (lema, insignias, respetos) ----------
const profCache = new Map();
export function profileOf(uid) {
  let p = profCache.get(uid);
  if (!p) {
    const r = db.prepare('SELECT motto, badges, respects FROM hotel_social_profiles WHERE user_id = ?').get(uid);
    p = { motto: r?.motto || '', badges: wornIds(uid).slice(0, MAX_BADGES), respects: r?.respects || 0 };
    profCache.set(uid, p);
  }
  return p;
}
const ensureProfile = (uid) => db.prepare('INSERT OR IGNORE INTO hotel_social_profiles (user_id) VALUES (?)').run(uid);
// Campos del contrato de avatar en salas (hotel:room / hotel:user:join)
export function userSocialOut(uid) {
  const p = profileOf(uid);
  return { motto: p.motto, badges: p.badges, respects: p.respects };
}
// Placas que tiene (logros, roles, streamer, fan…: server/badges.js)
const earnedBadges = (uid) => ownedBadges(uid).map((b) => ({ id: b.id, tier: b.tier }));
const respectsLeft = (uid) => RESPECTS_PER_DAY - db.prepare('SELECT COUNT(*) AS n FROM hotel_respects WHERE from_id = ? AND day = ?').get(uid, localParts().day).n;

// Avisar a la sala donde está la persona (si está en una) que cambió su perfil
function pushProfile(uid) {
  const w = hotelCtx.where.get(uid);
  if (w) IO?.to(hotelCtx.key(w.roomId)).emit('hotel:social:user', { id: uid, ...userSocialOut(uid) });
}
onWornChange((uid) => { profCache.delete(uid); pushProfile(uid); }); // cambió sus placas puestas

// ---------- Salas: categoría, etiquetas, likes, favoritas, eventos ----------
const roomInfo = (id) => db.prepare('SELECT category, tags FROM hotel_room_info WHERE room_id = ?').get(id);
const eventOf = (id) => {
  const e = db.prepare('SELECT * FROM hotel_events WHERE room_id = ?').get(id);
  if (!e) return null;
  const ev = { title: e.title, description: e.description, startsAt: e.starts_at, endsAt: e.ends_at, by: e.user_id };
  return eventActive(ev) ? ev : null;
};
const likesOf = (id) => db.prepare('SELECT COUNT(*) AS n FROM hotel_room_likes WHERE room_id = ?').get(id).n;
export function roomSocialOut(r, uid) {
  const info = roomInfo(r.id);
  return {
    category: info?.category || DEFAULT_CATEGORY,
    tags: parse(info?.tags, []),
    likes: likesOf(r.id),
    liked: !!db.prepare('SELECT 1 FROM hotel_room_likes WHERE room_id = ? AND user_id = ?').get(r.id, uid),
    fav: !!db.prepare('SELECT 1 FROM hotel_room_favs WHERE room_id = ? AND user_id = ?').get(r.id, uid),
    event: eventOf(r.id),
  };
}
// Al crear / editar una sala (body de POST/PATCH /hotel/rooms)
export function saveRoomSocial(roomId, b, { partial = false } = {}) {
  if (partial && b.category === undefined && b.tags === undefined) return;
  const cur = roomInfo(roomId);
  const category = b.category !== undefined && CATEGORY_BY_ID[b.category] ? b.category : cur?.category || DEFAULT_CATEGORY;
  const tags = b.tags !== undefined ? cleanTags(b.tags) : parse(cur?.tags, []);
  db.prepare('INSERT INTO hotel_room_info (room_id, category, tags) VALUES (?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET category = excluded.category, tags = excluded.tags')
    .run(roomId, category, JSON.stringify(tags));
}
const refreshLive = (roomId) => { const R = hotelCtx.live.get(roomId); if (R) hotelCtx.broadcastRoom(R); };

// ---------- Amigos ----------
const areFriends = (a, b) => !!db.prepare('SELECT 1 FROM hotel_friends WHERE user_id = ? AND friend_id = ?').get(a, b);
const friendCount = (uid) => db.prepare('SELECT COUNT(*) AS n FROM hotel_friends WHERE user_id = ?').get(uid).n;
function personOut(u) {
  return { id: u.id, name: u.display_name, username: u.username, avatar: parse(u.avatar, {}), motto: profileOf(u.id).motto };
}
function friendOut(u, uid) {
  const w = hotelCtx.where.get(u.id);
  const row = w && hotelCtx.roomRow(w.roomId);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM hotel_pms WHERE from_id = ? AND to_id = ? AND read_at IS NULL').get(u.id, uid).n;
  const last = db.prepare('SELECT text, created_at, from_id FROM hotel_pms WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 1').get(u.id, uid, uid, u.id);
  return {
    ...personOut(u), online: online(u.id),
    room: row ? { id: row.id, name: row.name } : null,
    unread, last: last ? { text: last.text, at: last.created_at, mine: last.from_id === uid } : null,
  };
}
function makeFriends(a, b) {
  const t = now();
  db.prepare('INSERT OR IGNORE INTO hotel_friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(a, b, t);
  db.prepare('INSERT OR IGNORE INTO hotel_friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(b, a, t);
  db.prepare('DELETE FROM hotel_friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(a, b, b, a);
  toUser(a, 'hotel:social', { type: 'friend', user: friendOut(userRow(b), a) });
  toUser(b, 'hotel:social', { type: 'friend', user: friendOut(userRow(a), b) });
}
export function consoleState(uid) {
  const friends = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar FROM hotel_friends f JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ? AND u.disabled = 0`).all(uid).map((u) => friendOut(u, uid));
  friends.sort((a, b) => (b.unread > 0) - (a.unread > 0) || b.online - a.online || a.name.localeCompare(b.name, 'es'));
  const requests = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar, r.created_at FROM hotel_friend_requests r JOIN users u ON u.id = r.from_id
    WHERE r.to_id = ? AND u.disabled = 0 ORDER BY r.created_at DESC`).all(uid).map((u) => ({ ...personOut(u), at: u.created_at }));
  const sent = db.prepare('SELECT to_id FROM hotel_friend_requests WHERE from_id = ?').all(uid).map((r) => r.to_id);
  const unread = friends.reduce((n, f) => n + f.unread, 0);
  return { friends, requests, sent, unread, maxFriends: MAX_FRIENDS };
}

// ---------- Mensajes privados ----------
const pmOut = (r) => ({ id: r.id, from: r.from_id, to: r.to_id, text: r.text, at: r.created_at, read: !!r.read_at });

// ---------- Navegador ----------
function navRooms(uid, tab, q, category) {
  const t = now();
  let rows;
  const S = (sql, ...a) => db.prepare(sql).all(...a);
  if (tab === 'official') rows = S('SELECT * FROM hotel_rooms WHERE official > 0 ORDER BY official');
  else if (tab === 'mine') rows = S('SELECT * FROM hotel_rooms WHERE owner_id = ? AND official = 0 ORDER BY updated_at DESC', uid);
  else if (tab === 'favorites') rows = S('SELECT r.* FROM hotel_room_favs f JOIN hotel_rooms r ON r.id = f.room_id WHERE f.user_id = ? ORDER BY f.created_at DESC', uid);
  else if (tab === 'events') rows = S('SELECT r.* FROM hotel_events e JOIN hotel_rooms r ON r.id = e.room_id WHERE e.ends_at > ? ORDER BY e.ends_at ASC', t);
  else if (tab === 'search') {
    const p = parseSearch(q);
    const where = [], args = [];
    const esc = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
    if (p.owner) { where.push("(LOWER(u.username) = ? OR LOWER(u.display_name) LIKE ? ESCAPE '\\')"); args.push(p.owner, `%${esc(p.owner)}%`); }
    for (const tg of p.tags) { where.push("i.tags LIKE ? ESCAPE '\\'"); args.push(`%"${esc(tg)}"%`); }
    if (p.text) { where.push("(r.name LIKE ? ESCAPE '\\' OR r.description LIKE ? ESCAPE '\\' OR i.tags LIKE ? ESCAPE '\\')"); const l = `%${esc(p.text)}%`; args.push(l, l, `%${esc(p.text.toLowerCase())}%`); }
    rows = S(`SELECT r.* FROM hotel_rooms r JOIN users u ON u.id = r.owner_id LEFT JOIN hotel_room_info i ON i.room_id = r.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.updated_at DESC LIMIT 100`, ...args);
  } else {
    // Populares: gente dentro ahora + likes
    rows = S('SELECT * FROM hotel_rooms ORDER BY updated_at DESC LIMIT 300');
  }
  let out = rows.map((r) => hotelCtx.roomOut(r, uid));
  if (category && CATEGORY_BY_ID[category]) out = out.filter((r) => r.category === category);
  if (tab === 'popular') {
    out.sort((a, b) => popularScore(b.users, b.likes) - popularScore(a.users, a.likes) || b.updatedAt - a.updatedAt);
    out = out.slice(0, 60);
  }
  return out;
}

// ---------- REST ----------
export function registerHotelSocialRoutes(api, { fail, wrap }) {
  const reqOk = limiter(), pmOk = limiter(), likeOk = limiter(), evOk = limiter();
  const MINE = 'SELECT COUNT(*) AS n FROM hotel_rooms WHERE owner_id = ? AND official = 0';

  api.get('/hotel/nav', wrap((req, res) => {
    const uid = req.user.id;
    ensureStarter(uid);
    ensureOfficialRooms();
    const tab = ['official', 'popular', 'events', 'favorites', 'mine', 'search'].includes(req.query.tab) ? req.query.tab : 'popular';
    const q = String(req.query.q || '').slice(0, 80);
    const rooms = navRooms(uid, tab, q, String(req.query.category || ''));
    res.json({ rooms, mine: db.prepare(MINE).get(uid).n, maxRooms: MAX_ROOMS_PER_USER });
  }));

  // --- Consola ---
  api.get('/hotel/social', wrap((req, res) => res.json(consoleState(req.user.id))));

  api.get('/hotel/social/search', wrap((req, res) => {
    const uid = req.user.id;
    const q = String(req.query.q || '').trim().replace(/^@/, '').slice(0, 30);
    if (q.length < 1) return res.json({ users: [] });
    const l = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = db.prepare(`SELECT id, username, display_name, avatar FROM users WHERE disabled = 0 AND id != ?
      AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') ORDER BY display_name LIMIT 20`).all(uid, l, l);
    const sent = new Set(db.prepare('SELECT to_id FROM hotel_friend_requests WHERE from_id = ?').all(uid).map((r) => r.to_id));
    const got = new Set(db.prepare('SELECT from_id FROM hotel_friend_requests WHERE to_id = ?').all(uid).map((r) => r.from_id));
    res.json({ users: rows.map((u) => ({ ...personOut(u), online: online(u.id), friend: areFriends(uid, u.id), sent: sent.has(u.id), received: got.has(u.id) })) });
  }));

  api.post('/hotel/social/requests', wrap((req, res) => {
    const uid = req.user.id;
    const to = Number(req.body?.userId);
    const u = userRow(to);
    if (!u || u.disabled) return fail(res, 404, 'Esa persona no existe');
    if (to === uid) return fail(res, 400, 'No puedes agregarte a ti');
    if (areFriends(uid, to)) return fail(res, 400, 'Ya son amigos');
    if (!reqOk(uid, 20, 60e3)) return fail(res, 429, 'Vas muy rápido: espera un minuto');
    if (friendCount(uid) >= MAX_FRIENDS) return fail(res, 400, `Ya tienes ${MAX_FRIENDS} amigos (el máximo)`);
    // Si la otra persona ya te había mandado solicitud: quedan como amigos de una vez
    if (db.prepare('SELECT 1 FROM hotel_friend_requests WHERE from_id = ? AND to_id = ?').get(to, uid)) {
      makeFriends(uid, to);
      return res.json({ ok: true, friends: true });
    }
    const r = db.prepare('INSERT OR IGNORE INTO hotel_friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)').run(uid, to, now());
    if (r.changes) toUser(to, 'hotel:social', { type: 'request', user: personOut(userRow(uid)) });
    res.json({ ok: true, friends: false });
  }));

  api.post('/hotel/social/requests/:userId/accept', wrap((req, res) => {
    const uid = req.user.id, from = Number(req.params.userId);
    if (!db.prepare('SELECT 1 FROM hotel_friend_requests WHERE from_id = ? AND to_id = ?').get(from, uid)) return fail(res, 404, 'Esa solicitud ya no existe');
    if (friendCount(uid) >= MAX_FRIENDS || friendCount(from) >= MAX_FRIENDS) return fail(res, 400, 'La lista de amigos está llena');
    makeFriends(uid, from);
    res.json({ ok: true });
  }));

  api.post('/hotel/social/requests/:userId/decline', wrap((req, res) => {
    const uid = req.user.id, from = Number(req.params.userId);
    db.prepare('DELETE FROM hotel_friend_requests WHERE from_id = ? AND to_id = ?').run(from, uid);
    res.json({ ok: true });
  }));

  api.delete('/hotel/social/friends/:userId', wrap((req, res) => {
    const uid = req.user.id, other = Number(req.params.userId);
    db.prepare('DELETE FROM hotel_friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').run(uid, other, other, uid);
    db.prepare('DELETE FROM hotel_friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(uid, other, other, uid);
    toUser(other, 'hotel:social', { type: 'removed', userId: uid });
    toUser(uid, 'hotel:social', { type: 'removed', userId: other });
    res.json({ ok: true });
  }));

  // Conversación: últimos 60 mensajes; al abrirla se marcan como leídos (los que llegaron sin estar)
  api.get('/hotel/social/messages/:userId', wrap((req, res) => {
    const uid = req.user.id, other = Number(req.params.userId);
    const rows = db.prepare(`SELECT * FROM hotel_pms WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 60`).all(uid, other, other, uid).reverse();
    const r = db.prepare('UPDATE hotel_pms SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL').run(now(), other, uid);
    if (r.changes) toUser(uid, 'hotel:pm:read', { userId: other });
    res.json({ messages: rows.map(pmOut), friend: areFriends(uid, other) });
  }));

  api.post('/hotel/social/messages', wrap((req, res) => {
    const uid = req.user.id, to = Number(req.body?.to);
    const text = clean(req.body?.text, PM_MAX);
    if (!text) return fail(res, 400, 'Escribe un mensaje');
    if (!areFriends(uid, to)) return fail(res, 403, 'Solo puedes escribirle a tus amigos del Hotel');
    if (!pmOk(uid, 10, 10e3)) return fail(res, 429, 'Vas muy rápido');
    const id = Number(db.prepare('INSERT INTO hotel_pms (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)').run(uid, to, text, now()).lastInsertRowid);
    const m = pmOut(db.prepare('SELECT * FROM hotel_pms WHERE id = ?').get(id));
    const me = userRow(uid);
    toUser(to, 'hotel:pm', { ...m, name: me.display_name });
    toUser(uid, 'hotel:pm', { ...m, name: me.display_name }); // otras pestañas
    res.json({ message: m, delivered: online(to) });
  }));

  api.post('/hotel/social/messages/:userId/read', wrap((req, res) => {
    db.prepare('UPDATE hotel_pms SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL').run(now(), Number(req.params.userId), req.user.id);
    res.json({ ok: true });
  }));

  // --- Perfil ---
  api.get('/hotel/social/profile/:userId', wrap((req, res) => {
    const uid = req.user.id, id = Number(req.params.userId);
    const u = userRow(id);
    if (!u) return fail(res, 404, 'Esa persona no existe');
    const p = profileOf(id);
    const earned = earnedBadges(id);
    const w = hotelCtx.where.get(id);
    const out = {
      ...personOut(u), respects: p.respects, online: online(id),
      badges: wornBadges(id),
      friend: areFriends(uid, id),
      sent: !!db.prepare('SELECT 1 FROM hotel_friend_requests WHERE from_id = ? AND to_id = ?').get(uid, id),
      received: !!db.prepare('SELECT 1 FROM hotel_friend_requests WHERE from_id = ? AND to_id = ?').get(id, uid),
      roomId: w && areFriends(uid, id) ? w.roomId : null,
      friends: friendCount(id),
    };
    if (id === uid) Object.assign(out, { earned, respectsLeft: respectsLeft(uid) });
    else out.respectsLeft = respectsLeft(uid);
    res.json(out);
  }));

  api.patch('/hotel/social/profile', wrap((req, res) => {
    const uid = req.user.id, b = req.body || {};
    ensureProfile(uid);
    if (b.motto !== undefined) db.prepare('UPDATE hotel_social_profiles SET motto = ? WHERE user_id = ?').run(clean(b.motto, MOTTO_MAX), uid);
    if (b.badges !== undefined) {
      if (!Array.isArray(b.badges)) return fail(res, 400, 'Insignias inválidas');
      setWorn(uid, b.badges.slice(0, MAX_BADGES)); // se guardan en server/badges.js
    }
    profCache.delete(uid);
    pushProfile(uid);
    res.json(userSocialOut(uid));
  }));

  // --- Salas: like, favorita, evento ---
  const roomOr404 = (req, res) => { const r = hotelCtx.roomRow(req.params.id); if (!r) fail(res, 404, 'Esa sala ya no existe'); return r; };
  api.post('/hotel/social/rooms/:id/like', wrap((req, res) => {
    const r = roomOr404(req, res); if (!r) return;
    if (r.owner_id === req.user.id && !r.official) return fail(res, 400, 'No puedes darle like a tu propia sala');
    if (!likeOk(req.user.id, 20, 60e3)) return fail(res, 429, 'Vas muy rápido');
    const x = db.prepare('INSERT OR IGNORE INTO hotel_room_likes (room_id, user_id, created_at) VALUES (?, ?, ?)').run(r.id, req.user.id, now());
    if (x.changes) refreshLive(r.id);
    res.json({ likes: likesOf(r.id), liked: true, already: !x.changes });
  }));
  api.delete('/hotel/social/rooms/:id/like', wrap((req, res) => {
    const r = roomOr404(req, res); if (!r) return;
    const x = db.prepare('DELETE FROM hotel_room_likes WHERE room_id = ? AND user_id = ?').run(r.id, req.user.id);
    if (x.changes) refreshLive(r.id);
    res.json({ likes: likesOf(r.id), liked: false });
  }));
  api.post('/hotel/social/rooms/:id/fav', wrap((req, res) => {
    const r = roomOr404(req, res); if (!r) return;
    const n = db.prepare('SELECT COUNT(*) AS n FROM hotel_room_favs WHERE user_id = ?').get(req.user.id).n;
    if (n >= MAX_FAVORITES) return fail(res, 400, `Máximo ${MAX_FAVORITES} favoritas`);
    db.prepare('INSERT OR IGNORE INTO hotel_room_favs (user_id, room_id, created_at) VALUES (?, ?, ?)').run(req.user.id, r.id, now());
    res.json({ fav: true });
  }));
  api.delete('/hotel/social/rooms/:id/fav', wrap((req, res) => {
    db.prepare('DELETE FROM hotel_room_favs WHERE user_id = ? AND room_id = ?').run(req.user.id, Number(req.params.id));
    res.json({ fav: false });
  }));

  const canPromote = (r, user) => (r.official ? user.role === 'admin' : r.owner_id === user.id || user.role === 'admin');
  api.post('/hotel/social/rooms/:id/event', wrap((req, res) => {
    const r = roomOr404(req, res); if (!r) return;
    if (!canPromote(r, req.user)) return fail(res, 403, 'Solo quien es dueño de la sala puede promocionarla');
    const title = clean(req.body?.title, EVENT_TITLE_MAX);
    const description = clean(req.body?.description, EVENT_DESC_MAX);
    const hours = Number(req.body?.hours);
    if (!title) return fail(res, 400, 'Ponle título a tu evento');
    if (!EVENT_HOURS.includes(hours)) return fail(res, 400, 'El evento dura de 1 a 3 horas');
    if (!evOk(req.user.id, 5, 10 * 60e3)) return fail(res, 429, 'Espera un rato antes de promocionar otra vez');
    const t = now();
    db.prepare(`INSERT INTO hotel_events (room_id, user_id, title, description, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET user_id = excluded.user_id, title = excluded.title, description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at`)
      .run(r.id, req.user.id, title, description, t, t + hours * 3600e3);
    refreshLive(r.id);
    // Aviso para quien está en el Hotel ahora
    const ev = eventOf(r.id);
    for (const [uid, w] of hotelCtx.where) if (w.roomId !== r.id && uid !== req.user.id) w.socket.emit('hotel:event', { roomId: r.id, roomName: r.name, ...ev });
    hubEmit('hotel:event', { roomId: r.id, roomName: r.name, ...ev, byName: req.user.display_name }); // aviso en Discord
    res.json({ event: ev });
  }));
  api.delete('/hotel/social/rooms/:id/event', wrap((req, res) => {
    const r = roomOr404(req, res); if (!r) return;
    if (!canPromote(r, req.user)) return fail(res, 403, 'Solo quien es dueño de la sala puede terminar el evento');
    db.prepare('DELETE FROM hotel_events WHERE room_id = ?').run(r.id);
    refreshLive(r.id);
    res.json({ ok: true });
  }));
}

// Limpieza de eventos vencidos (las consultas ya los ignoran; esto solo libera filas)
setInterval(() => { try { db.prepare('DELETE FROM hotel_events WHERE ends_at < ?').run(now() - 3600e3); } catch { /* sin tabla aún */ } }, 10 * 60e3).unref();

// ---------- Tiempo real ----------
export function initHotelSocial(io, socket, userId) {
  IO = io;
  const ok = limiter();
  const ack = (cb, m) => { if (typeof cb === 'function') cb(m); };
  const myRoom = () => { const w = hotelCtx.where.get(userId); return w && w.socket === socket ? hotelCtx.live.get(w.roomId) : null; };

  // Seguir a un amigo a su sala. El acceso se respeta: aquí se avisa qué pasará y luego
  // el cliente entra con hotel:enter (que vuelve a revisar contraseña, timbre, cupo y vetos).
  socket.on('hotel:follow', (m, cb) => {
    const target = Number(m?.userId);
    if (!areFriends(userId, target)) return ack(cb, { error: 'Solo puedes seguir a tus amigos' });
    const w = hotelCtx.where.get(target);
    if (!w) return ack(cb, { error: online(target) ? 'Tu amigo no está en ninguna sala ahora' : 'Tu amigo no está conectado' });
    const row = hotelCtx.roomRow(w.roomId);
    if (!row) return ack(cb, { error: 'Esa sala ya no existe' });
    const R = hotelCtx.live.get(row.id);
    const owner = row.owner_id === userId, admin = hotelCtx.isAdmin(userId), rights = !!R?.rights.has(userId);
    const free = owner || admin || rights;
    if (!free && hotelCtx.isBanned(row.id, userId)) return ack(cb, { error: 'No puedes entrar a esa sala por un rato' });
    if (!free && R && R.users.size >= hotelCtx.capOf(row)) return ack(cb, { error: 'La sala de tu amigo está llena' });
    if (!free && row.access === 'closed') return ack(cb, { error: 'La sala de tu amigo está cerrada' });
    ack(cb, { ok: true, roomId: row.id, roomName: row.name, access: free ? 'open' : row.access });
  });

  // Invitar amigos a tu sala actual: les llega un aviso con "Ir"
  socket.on('hotel:invite', (m, cb) => {
    const R = myRoom();
    if (!R) return ack(cb, { error: 'Entra a una sala para invitar' });
    if (!ok(userId, 5, 30e3)) return ack(cb, { error: 'Espera un momento antes de invitar otra vez' });
    const ids = [...new Set((Array.isArray(m?.userIds) ? m.userIds : []).map(Number))].slice(0, 50).filter((id) => id !== userId && areFriends(userId, id));
    if (!ids.length) return ack(cb, { error: 'Elige a quién invitar' });
    const me = userRow(userId);
    const text = clean(m?.text, 120);
    let sent = 0;
    for (const id of ids) {
      if (!online(id)) continue;
      if (hotelCtx.where.get(id)?.roomId === R.id) continue;
      toUser(id, 'hotel:invite', { fromId: userId, name: me.display_name, roomId: R.id, roomName: R.row.name, text });
      sent++;
    }
    ack(cb, { ok: true, sent });
  });

  // Dar respeto: 3 al día, no a ti, a alguien de tu misma sala
  socket.on('hotel:respect', (m, cb) => {
    const R = myRoom();
    const target = Number(m?.userId);
    if (!R || !R.users.has(target)) return ack(cb, { error: 'Esa persona no está en la sala' });
    if (target === userId) return ack(cb, { error: 'No puedes darte respeto a ti' });
    const left = respectsLeft(userId);
    if (left <= 0) return ack(cb, { error: 'Ya diste tus 3 respetos de hoy. ¡Mañana hay más!', left: 0 });
    db.prepare('INSERT INTO hotel_respects (from_id, to_id, day, created_at) VALUES (?, ?, ?, ?)').run(userId, target, localParts().day, now());
    ensureProfile(target);
    db.prepare('UPDATE hotel_social_profiles SET respects = respects + 1 WHERE user_id = ?').run(target);
    profCache.delete(target);
    const respects = profileOf(target).respects;
    IO.to(hotelCtx.key(R.id)).emit('hotel:respect', { from: userId, to: target, name: userRow(userId).display_name, respects });
    ack(cb, { ok: true, left: left - 1, respects });
  });
}

export const _social = { profCache };
