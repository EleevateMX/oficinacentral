// Placas (badges) estilo hotel clásico. Une en un solo sistema:
//  · los logros de la oficina (server/achievements.js) — se ganan solos,
//  · las placas que otorga un admin (roles, eventos, especiales),
//  · las de streamer (se ganan cuando un admin verifica tu canal),
//  · las de fan (gratis: cada quien se las pone),
//  · y las personalizadas que crean los admins (badges_custom).
// Cada persona lleva puestas hasta 5, en orden. El Hotel (server/hotelSocial.js) lee de aquí.
// También guarda los canales de streamer y el "🔴 En vivo" manual (se apaga solo a las 6 h).
import { db, now } from './db.js';
import { emitAll, emitToUser } from './realtime.js';
import { audit } from './security.js';
import { hubEmit } from './hubEvents.js'; // avisos a Discord
import {
  BADGE_BY_ID, MAX_WORN, isFanBadge, isGrantable, cleanArt, NAME_MAX, DESC_MAX, PLATFORM_BY_ID,
  STREAM_BADGE_FOR, parseChannel, LIVE_HOURS,
} from '../shared/badges.js';
import { ACHIEVEMENT_BY_ID } from '../shared/achievements.js';

db.exec(`
CREATE TABLE IF NOT EXISTS badges_custom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  art TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_badges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'grant',
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);
CREATE TABLE IF NOT EXISTS user_badge_selection (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ids TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS streamer_channels (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  url TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, platform)
);
CREATE TABLE IF NOT EXISTS streamer_live (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`);

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const userName = (id) => db.prepare('SELECT display_name FROM users WHERE id = ?').get(Number(id))?.display_name || `#${id}`;
const userExists = (id) => !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(Number(id));

// Quien quiera enterarse de que cambiaron las placas puestas de alguien (el Hotel)
const listeners = new Set();
export const onWornChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = (uid) => {
  for (const fn of listeners) { try { fn(uid); } catch (e) { console.error('[placas]', e.message); } }
  emitAll('badges:worn', { userId: uid, ids: wornIds(uid) });
};

// ---------- Catálogo ----------
const customRow = (r) => ({ id: `custom:${r.id}`, name: r.name, desc: r.description, category: 'custom', art: parse(r.art, {}), createdAt: r.created_at });
export const customBadges = () => db.prepare('SELECT * FROM badges_custom ORDER BY id').all().map(customRow);
const customById = (id) => {
  const m = /^custom:(\d+)$/.exec(String(id));
  const r = m && db.prepare('SELECT * FROM badges_custom WHERE id = ?').get(Number(m[1]));
  return r ? customRow(r) : null;
};
export const badgeExists = (id) => !!BADGE_BY_ID[id] || !!customById(id);
const badgeName = (id) => BADGE_BY_ID[id]?.name || customById(id)?.name || id;

// ---------- Placas que tiene cada quien ----------
// [{ id, tier, source: 'achievement'|'grant'|'claim'|'verify', grantedBy, grantedAt, note }]
export function ownedBadges(uid) {
  const out = [];
  for (const r of db.prepare('SELECT badge, tier, earned_at FROM achievements WHERE user_id = ? AND tier > 0').all(uid)) {
    if (ACHIEVEMENT_BY_ID[r.badge]) out.push({ id: r.badge, tier: r.tier, source: 'achievement', grantedAt: r.earned_at, grantedBy: null, note: '' });
  }
  for (const r of db.prepare('SELECT * FROM user_badges WHERE user_id = ? ORDER BY granted_at').all(uid)) {
    if (badgeExists(r.badge_id)) out.push({ id: r.badge_id, tier: 0, source: r.source, grantedAt: r.granted_at, grantedBy: r.granted_by, note: r.note });
  }
  return out;
}
const ownsBadge = (uid, id) => ownedBadges(uid).some((b) => b.id === id);

// Las que lleva puestas (orden elegido). Si nunca eligió aquí pero sí en el Hotel, se migran.
export function wornIds(uid) {
  let row = db.prepare('SELECT ids FROM user_badge_selection WHERE user_id = ?').get(uid);
  if (!row) {
    let legacy = [];
    try { legacy = parse(db.prepare('SELECT badges FROM hotel_social_profiles WHERE user_id = ?').get(uid)?.badges, []); } catch { /* sin Hotel */ }
    if (!Array.isArray(legacy) || !legacy.length) return [];
    const mine = new Set(ownedBadges(uid).map((b) => b.id));
    const ids = [...new Set(legacy.map(String))].filter((x) => mine.has(x)).slice(0, MAX_WORN);
    db.prepare('INSERT OR IGNORE INTO user_badge_selection (user_id, ids, updated_at) VALUES (?, ?, ?)').run(uid, JSON.stringify(ids), now());
    row = { ids: JSON.stringify(ids) };
  }
  const mine = new Set(ownedBadges(uid).map((b) => b.id));
  return parse(row.ids, []).filter((x) => mine.has(x)).slice(0, MAX_WORN);
}
// Para la tarjeta del Hotel: [{ id, tier }]
export function wornBadges(uid) {
  const owned = new Map(ownedBadges(uid).map((b) => [b.id, b]));
  return wornIds(uid).map((id) => ({ id, tier: owned.get(id)?.tier || 0 }));
}

export function setWorn(uid, list) {
  if (!Array.isArray(list)) return { error: 'Placas inválidas' };
  const mine = new Set(ownedBadges(uid).map((b) => b.id));
  const ids = [...new Set(list.map(String))].filter((x) => mine.has(x)).slice(0, MAX_WORN);
  db.prepare(`INSERT INTO user_badge_selection (user_id, ids, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET ids = excluded.ids, updated_at = excluded.updated_at`).run(uid, JSON.stringify(ids), now());
  changed(uid);
  return { ids };
}

// Dar una placa (admin, verificación o fan). Avisa a la persona (aviso + Actividad).
let notifyFn = () => {};
export function giveBadge(uid, badgeId, { by = null, source = 'grant', note = '', quiet = false } = {}) {
  const r = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, source, granted_by, granted_at, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uid, badgeId, source, by, now(), String(note || '').slice(0, 140));
  if (!r.changes) return false;
  // Si todavía tiene lugar, se la pone sola
  const worn = wornIds(uid);
  if (worn.length < MAX_WORN && source !== 'claim') setWorn(uid, [...worn, badgeId]);
  if (!quiet) notifyFn(uid, 'badge', by, { id: badgeId, name: badgeName(badgeId), source, note: String(note || '').slice(0, 140) });
  if (source !== 'claim' && source !== 'discord') hubEmit('badge:earned', { userId: uid, id: badgeId, name: badgeName(badgeId) });
  emitToUser(uid, 'badges:mine', { userId: uid });
  return true;
}
export function takeBadge(uid, badgeId) {
  const r = db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').run(uid, badgeId);
  if (r.changes) { changed(uid); emitToUser(uid, 'badges:mine', { userId: uid }); }
  return r.changes > 0;
}

// ---------- Canales y "En vivo" ----------
const channelRow = (r) => ({ platform: r.platform, handle: r.handle, url: r.url, verified: !!r.verified, verifiedAt: r.verified_at || null });
export const channelsOf = (uid) => db.prepare('SELECT * FROM streamer_channels WHERE user_id = ? ORDER BY platform').all(uid).map(channelRow);

export function liveOf(uid, at = now()) {
  const r = db.prepare('SELECT * FROM streamer_live WHERE user_id = ? AND expires_at > ?').get(uid, at);
  if (!r) return null;
  const ch = db.prepare('SELECT url, handle FROM streamer_channels WHERE user_id = ? AND platform = ?').get(uid, r.platform);
  if (!ch) return null;
  return { userId: uid, platform: r.platform, url: ch.url, handle: ch.handle, startedAt: r.started_at, expiresAt: r.expires_at };
}
export function liveList(at = now()) {
  return db.prepare('SELECT user_id FROM streamer_live WHERE expires_at > ?').all(at).map((r) => liveOf(r.user_id, at)).filter(Boolean);
}
function stopLive(uid) {
  const r = db.prepare('DELETE FROM streamer_live WHERE user_id = ?').run(uid);
  if (r.changes) emitAll('badges:live', { userId: uid, live: null });
  return r.changes > 0;
}
// Se apaga solo: cada minuto quita los que pasaron de 6 h
export function expireLive(at = now()) {
  const gone = db.prepare('SELECT user_id FROM streamer_live WHERE expires_at <= ?').all(at);
  for (const g of gone) stopLive(g.user_id);
  return gone.length;
}

// ---------- Rutas ----------
export function registerBadgeRoutes(api, { fail, notify, requireAdmin, wrap }) {
  notifyFn = notify;
  const t = setInterval(() => { try { expireLive(); } catch (e) { console.error('[placas]', e.message); } }, 60e3);
  t.unref?.();
  const isAdmin = (req) => req.user?.role === 'admin';
  const limiter = new Map();
  const slow = (uid, n, ms) => { const ts = (limiter.get(uid) || []).filter((x) => Date.now() - x < ms); if (ts.length >= n) return true; ts.push(Date.now()); limiter.set(uid, ts); return false; };

  api.get('/badges/catalog', (req, res) => res.json({ custom: customBadges() }));
  api.get('/badges/live', (req, res) => res.json({ live: liveList() }));

  api.get('/badges/user/:id', (req, res) => {
    const uid = Number(req.params.id);
    if (!userExists(uid)) return fail(res, 404, 'Esa persona no existe');
    const mine = uid === req.user.id || isAdmin(req);
    const owned = ownedBadges(uid).map((b) => ({ ...b, grantedByName: b.grantedBy ? userName(b.grantedBy) : null }));
    res.json({
      userId: uid, owned, worn: wornIds(uid), live: liveOf(uid),
      // Los canales verificados los ve cualquiera; los pendientes solo tú y los admins
      channels: channelsOf(uid).filter((c) => c.verified || mine),
    });
  });

  api.put('/badges/worn', wrap((req, res) => {
    const r = setWorn(req.user.id, req.body?.ids);
    if (r.error) return fail(res, 400, r.error);
    res.json({ worn: r.ids });
  }));

  // Fan: cada quien se las pone y se las quita
  api.post('/badges/claim', wrap((req, res) => {
    const id = String(req.body?.id || '');
    if (!isFanBadge(id)) return fail(res, 403, 'Esa placa no se puede pedir: la otorga un admin');
    if (slow(req.user.id, 20, 60e3)) return fail(res, 429, 'Vas muy rápido');
    const fresh = giveBadge(req.user.id, id, { source: 'claim', quiet: true });
    const worn = wornIds(req.user.id);
    if (fresh && worn.length < MAX_WORN) setWorn(req.user.id, [...worn, id]);
    res.json({ ok: true, owned: ownedBadges(req.user.id), worn: wornIds(req.user.id) });
  }));
  api.delete('/badges/claim/:id', wrap((req, res) => {
    const id = String(req.params.id);
    if (!isFanBadge(id)) return fail(res, 403, 'Solo puedes quitarte placas de fan');
    takeBadge(req.user.id, id);
    res.json({ ok: true, owned: ownedBadges(req.user.id), worn: wornIds(req.user.id) });
  }));

  // --- Canales ---
  api.put('/badges/channels/:platform', wrap((req, res) => {
    const platform = String(req.params.platform);
    if (!PLATFORM_BY_ID[platform]) return fail(res, 400, 'Plataforma desconocida');
    const p = parseChannel(platform, req.body?.value);
    if (p.error) return fail(res, 400, p.error);
    const uid = req.user.id;
    const old = db.prepare('SELECT * FROM streamer_channels WHERE user_id = ? AND platform = ?').get(uid, platform);
    if (old && old.handle.toLowerCase() === p.handle.toLowerCase()) return res.json({ channels: channelsOf(uid) });
    db.prepare(`INSERT INTO streamer_channels (user_id, platform, handle, url, verified, created_at) VALUES (?, ?, ?, ?, 0, ?)
      ON CONFLICT(user_id, platform) DO UPDATE SET handle = excluded.handle, url = excluded.url, verified = 0, verified_by = NULL, verified_at = NULL`).run(uid, platform, p.handle, p.url, now());
    // Cambió de canal: la verificación (y su placa) se pierde
    if (old?.verified && db.prepare("DELETE FROM user_badges WHERE user_id = ? AND badge_id = ? AND source = 'verify'").run(uid, STREAM_BADGE_FOR[platform]).changes) changed(uid);
    if (liveOf(uid)?.platform === platform) emitAll('badges:live', { userId: uid, live: liveOf(uid) });
    res.json({ channels: channelsOf(uid) });
  }));
  api.delete('/badges/channels/:platform', wrap((req, res) => {
    const platform = String(req.params.platform), uid = req.user.id;
    const x = db.prepare('DELETE FROM streamer_channels WHERE user_id = ? AND platform = ?').run(uid, platform);
    if (x.changes) {
      if (db.prepare("DELETE FROM user_badges WHERE user_id = ? AND badge_id = ? AND source = 'verify'").run(uid, STREAM_BADGE_FOR[platform]).changes) changed(uid);
      if (db.prepare('SELECT 1 FROM streamer_live WHERE user_id = ? AND platform = ?').get(uid, platform)) stopLive(uid);
    }
    res.json({ channels: channelsOf(uid) });
  }));

  // --- En vivo (manual, sin llaves de APIs externas) ---
  api.post('/badges/live', wrap((req, res) => {
    const uid = req.user.id, platform = String(req.body?.platform || '');
    const ch = db.prepare('SELECT * FROM streamer_channels WHERE user_id = ? AND platform = ?').get(uid, platform);
    if (!ch) return fail(res, 400, 'Primero agrega tu canal de esa plataforma');
    if (slow(uid, 6, 60e3)) return fail(res, 429, 'Vas muy rápido');
    const at = now();
    const was = liveOf(uid, at);
    db.prepare(`INSERT INTO streamer_live (user_id, platform, started_at, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET platform = excluded.platform, started_at = excluded.started_at, expires_at = excluded.expires_at`).run(uid, platform, was?.startedAt || at, at + LIVE_HOURS * 36e5);
    const live = liveOf(uid, at);
    emitAll('badges:live', { userId: uid, live });
    // Aviso opcional: a toda la oficina o solo a tus amigos del Hotel (una vez por transmisión)
    if (!was || was.platform !== platform) hubEmit('streamer:live', { userId: uid, platform, url: live.url, name: userName(uid) });
    const announce = ['office', 'friends'].includes(req.body?.announce) ? req.body.announce : null;
    if (announce && (!was || was.platform !== platform)) {
      const msg = { userId: uid, platform, url: live.url, name: userName(uid) };
      if (announce === 'office') emitAll('badges:live:announce', msg);
      else {
        let friends = [];
        try { friends = db.prepare('SELECT friend_id FROM hotel_friends WHERE user_id = ?').all(uid).map((r) => r.friend_id); } catch { /* sin Hotel */ }
        for (const f of friends) emitToUser(f, 'badges:live:announce', msg);
      }
    }
    res.json({ live });
  }));
  api.delete('/badges/live', wrap((req, res) => { stopLive(req.user.id); res.json({ live: null }); }));

  // ---------- Admin ----------
  const A = '/admin/badges';
  api.get(`${A}/holders/:badgeId`, requireAdmin, (req, res) => {
    const id = String(req.params.badgeId);
    const rows = BADGE_BY_ID[id]?.category === 'achievement'
      ? db.prepare('SELECT user_id, earned_at AS granted_at, NULL AS granted_by, \'\' AS note FROM achievements WHERE badge = ? AND tier > 0').all(id)
      : db.prepare('SELECT user_id, granted_at, granted_by, note FROM user_badges WHERE badge_id = ? ORDER BY granted_at DESC').all(id);
    res.json({ holders: rows.map((r) => ({ userId: r.user_id, grantedAt: r.granted_at, grantedBy: r.granted_by, note: r.note })) });
  });

  api.post(`${A}/grant`, requireAdmin, wrap((req, res) => {
    const uid = Number(req.body?.userId), id = String(req.body?.badgeId || '');
    if (!userExists(uid)) return fail(res, 404, 'Esa persona no existe');
    if (!isGrantable(id) || !badgeExists(id)) return fail(res, 400, 'Esa placa no se puede otorgar');
    const note = String(req.body?.note || '').trim().slice(0, 140);
    const fresh = giveBadge(uid, id, { by: req.user.id, source: 'grant', note });
    if (!fresh) return fail(res, 409, 'Ya tiene esa placa');
    audit({ actor: req.user.id, action: `Otorgó la placa "${badgeName(id)}" a ${userName(uid)}`, target: `badge:${id}`, data: { userId: uid, note }, ip: req.ip });
    res.json({ ok: true, owned: ownedBadges(uid) });
  }));

  api.delete(`${A}/grant/:userId/:badgeId`, requireAdmin, wrap((req, res) => {
    const uid = Number(req.params.userId), id = String(req.params.badgeId);
    if (!takeBadge(uid, id)) return fail(res, 404, 'No tiene esa placa');
    audit({ actor: req.user.id, action: `Quitó la placa "${badgeName(id)}" a ${userName(uid)}`, target: `badge:${id}`, data: { userId: uid }, ip: req.ip });
    res.json({ ok: true, owned: ownedBadges(uid) });
  }));

  const cleanCustom = (b) => {
    const name = String(b?.name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    if (name.length < 2) return { error: 'Ponle un nombre a la placa' };
    const desc = String(b?.desc ?? b?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, DESC_MAX);
    const a = cleanArt(b?.art);
    if (a.error) return { error: a.error };
    return { name, desc, art: a.art };
  };
  api.post(`${A}/custom`, requireAdmin, wrap((req, res) => {
    const c = cleanCustom(req.body);
    if (c.error) return fail(res, 400, c.error);
    if (db.prepare('SELECT COUNT(*) AS n FROM badges_custom').get().n >= 300) return fail(res, 400, 'Ya hay demasiadas placas personalizadas');
    const at = now();
    const id = Number(db.prepare('INSERT INTO badges_custom (name, description, art, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.name, c.desc, JSON.stringify(c.art), req.user.id, at, at).lastInsertRowid);
    audit({ actor: req.user.id, action: `Creó la placa "${c.name}"`, target: `badge:custom:${id}`, data: c.art, ip: req.ip });
    const badge = customById(`custom:${id}`);
    emitAll('badges:catalog', {});
    res.json({ badge });
  }));
  api.patch(`${A}/custom/:id`, requireAdmin, wrap((req, res) => {
    const cur = customById(`custom:${Number(req.params.id)}`);
    if (!cur) return fail(res, 404, 'Esa placa no existe');
    const c = cleanCustom({ name: req.body?.name ?? cur.name, desc: req.body?.desc ?? cur.desc, art: req.body?.art ?? cur.art });
    if (c.error) return fail(res, 400, c.error);
    db.prepare('UPDATE badges_custom SET name = ?, description = ?, art = ?, updated_at = ? WHERE id = ?').run(c.name, c.desc, JSON.stringify(c.art), now(), Number(req.params.id));
    audit({ actor: req.user.id, action: `Editó la placa "${c.name}"`, target: cur.id, data: c.art, ip: req.ip });
    emitAll('badges:catalog', {});
    res.json({ badge: customById(cur.id) });
  }));
  api.delete(`${A}/custom/:id`, requireAdmin, wrap((req, res) => {
    const cur = customById(`custom:${Number(req.params.id)}`);
    if (!cur) return fail(res, 404, 'Esa placa no existe');
    const holders = db.prepare('SELECT user_id FROM user_badges WHERE badge_id = ?').all(cur.id).map((r) => r.user_id);
    db.prepare('DELETE FROM user_badges WHERE badge_id = ?').run(cur.id);
    db.prepare('DELETE FROM badges_custom WHERE id = ?').run(Number(req.params.id));
    for (const h of holders) changed(h);
    audit({ actor: req.user.id, action: `Borró la placa "${cur.name}"`, target: cur.id, data: { holders: holders.length }, ip: req.ip });
    emitAll('badges:catalog', {});
    res.json({ ok: true });
  }));

  // Canales por verificar
  api.get(`${A}/channels`, requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT * FROM streamer_channels ORDER BY verified, created_at DESC LIMIT 300').all();
    res.json({ channels: rows.map((r) => ({ userId: r.user_id, ...channelRow(r) })) });
  });
  api.post(`${A}/channels/:userId/:platform/verify`, requireAdmin, wrap((req, res) => {
    const uid = Number(req.params.userId), platform = String(req.params.platform);
    const ch = db.prepare('SELECT * FROM streamer_channels WHERE user_id = ? AND platform = ?').get(uid, platform);
    if (!ch) return fail(res, 404, 'Ese canal no existe');
    const on = req.body?.verified !== false;
    db.prepare('UPDATE streamer_channels SET verified = ?, verified_by = ?, verified_at = ? WHERE user_id = ? AND platform = ?')
      .run(on ? 1 : 0, on ? req.user.id : null, on ? now() : null, uid, platform);
    const bid = STREAM_BADGE_FOR[platform];
    if (on) giveBadge(uid, bid, { by: req.user.id, source: 'verify', note: `Canal ${ch.handle}` });
    else if (db.prepare("DELETE FROM user_badges WHERE user_id = ? AND badge_id = ? AND source = 'verify'").run(uid, bid).changes) { changed(uid); emitToUser(uid, 'badges:mine', { userId: uid }); }
    audit({ actor: req.user.id, action: `${on ? 'Verificó' : 'Quitó la verificación de'} el canal de ${PLATFORM_BY_ID[platform]?.name || platform} de ${userName(uid)} (${ch.handle})`, target: `channel:${uid}:${platform}`, ip: req.ip });
    res.json({ channels: channelsOf(uid) });
  }));
}
