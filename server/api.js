import crypto from 'node:crypto';
import express from 'express';
import { db, now, tx, getSetting, setSetting } from './db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, destroyUserSessions, userFromToken,
  parseCookies, sessionCookie, SESSION_COOKIE, loginRateLimited, clearLoginAttempts,
  validateNewAccount, defaultAvatar, randomToken,
} from './auth.js';
import { publicPresence, emitAll, emitToUser, presence, relocate, disconnectUser } from './realtime.js';
import * as world from './world.js';
import { SPEC_KEYS } from '../shared/sprite.js';

export const api = express.Router();
api.use(express.json({ limit: '1mb' }));

// ---------- Utilidades ----------
const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) {
    next(e);
  }
};

const fail = (res, status, error) => res.status(status).json({ error });

function parseJSON(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email || '',
    role: u.role,
    avatar: parseJSON(u.avatar, {}),
    photoUrl: u.photo ? `/api/users/${u.id}/photo?v=${u.photo_v}` : null,
    timezone: u.timezone,
    statusText: u.status_text || '',
    shift: u.shift || null,
    shiftAt: u.shift_at || null,
    disabled: !!u.disabled,
    lastActive: u.last_active,
    createdAt: u.created_at,
    ...publicPresence(u.id),
  };
}

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

function broadcastUser(id) {
  const u = getUser(id);
  if (u) emitAll('user', publicUser(u));
}

function broadcastFloor(floorId) {
  const payload = world.floorPayload(floorId);
  if (payload) emitAll('floor', payload);
}

function requireAuth(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const user = userFromToken(token);
  if (!user) return fail(res, 401, 'No has iniciado sesión');
  req.user = user;
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return fail(res, 403, 'Solo para administradores');
  next();
}

function notify(userId, type, actorId, data = {}) {
  const id = Number(db.prepare('INSERT INTO notifications (user_id, type, actor_id, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, type, actorId, JSON.stringify(data), now()).lastInsertRowid);
  emitToUser(userId, 'notification', notificationRow(db.prepare('SELECT * FROM notifications WHERE id = ?').get(id)));
}

const notificationRow = (r) => ({ id: r.id, type: r.type, actorId: r.actor_id, data: parseJSON(r.data, {}), read: !!r.read, createdAt: r.created_at });

// ---------- Configuración pública ----------
api.get('/health', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

// Marca de la oficina: Nuvora es el producto; cada oficina elige nombre, tema, color y logo.
const THEMES = ['nuvora', 'gtahub', 'custom'];

function officeConfig() {
  const logoV = getSetting('logo_v');
  return {
    officeName: getSetting('office_name') || process.env.OFFICE_NAME || 'Mi oficina',
    theme: getSetting('theme') || process.env.OFFICE_THEME || 'nuvora',
    accent: getSetting('accent') || null,
    logoUrl: getSetting('logo') ? `/api/office/logo?v=${logoV}` : null,
    shifts: parseJSON(getSetting('shifts') || 'null', null) || DEFAULT_SHIFTS,
  };
}

// Turnos: servidores o guardias donde alguien puede estar "En turno"
const DEFAULT_SHIFTS = ['Andromeda', 'Soporte', 'Moderación', 'Eventos'];

api.get('/config', (req, res) => {
  res.json(officeConfig());
});

api.get('/office/logo', (req, res) => {
  const m = /^data:(image\/(png|jpeg|webp|svg\+xml));base64,(.+)$/.exec(getSetting('logo') || '');
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (m[2] === 'svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.send(Buffer.from(m[3], 'base64'));
});

// Servidores ICE para WebRTC. Con TURN_SECRET se generan credenciales temporales
// (formato "TURN REST API" que entiende coturn con use-auth-secret).
// TURN de Cloudflare (para hostings sin UDP, como Railway): credenciales de corta vida
let cfIce = { at: 0, servers: null };
async function cloudflareIce() {
  const id = process.env.CF_TURN_KEY_ID;
  const token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return null;
  if (cfIce.servers && Date.now() - cfIce.at < 6 * 3600e3) return cfIce.servers;
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 24 * 3600 }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const servers = Array.isArray(j.iceServers) ? j.iceServers : [j.iceServers];
    cfIce = { at: Date.now(), servers };
    return servers;
  } catch (e) {
    console.warn('No se pudieron pedir credenciales TURN a Cloudflare:', e.message);
    return cfIce.servers;
  }
}

function iceServersFor(userId) {
  if (process.env.ICE_SERVERS) return parseJSON(process.env.ICE_SERVERS, []);
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const secret = process.env.TURN_SECRET;
  const urls = (process.env.TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (secret && urls.length) {
    const username = `${Math.floor(Date.now() / 1000) + 24 * 3600}:${userId}`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
    servers.push({ urls, username, credential });
  }
  return servers;
}

// ---------- Autenticación ----------
api.post('/auth/login', wrap((req, res) => {
  const ip = req.ip;
  if (loginRateLimited(ip)) return fail(res, 429, 'Demasiados intentos. Espera unos minutos.');
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username = ? OR (email != \'\' AND email = ?)').get(String(username || '').trim(), String(username || '').trim().toLowerCase());
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) return fail(res, 401, 'Usuario o contraseña incorrectos');
  if (u.disabled) return fail(res, 403, 'Tu cuenta está desactivada. Habla con un administrador.');
  clearLoginAttempts(ip);
  const token = createSession(u.id);
  res.setHeader('Set-Cookie', sessionCookie(token));
  res.json({ user: publicUser(u) });
}));

api.post('/auth/logout', (req, res) => {
  destroySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }));
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), prefs: parseJSON(req.user.prefs, {}) });
});

// ---------- Invitaciones (públicas) ----------
function validInvite(token) {
  const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(String(token));
  if (!inv || inv.revoked || inv.used_by || inv.expires_at < now()) return null;
  return inv;
}

api.get('/invites/:token', (req, res) => {
  const inv = validInvite(req.params.token);
  if (!inv) return fail(res, 404, 'La invitación no es válida o ya expiró.');
  const by = inv.created_by ? getUser(inv.created_by) : null;
  res.json({ email: inv.email, name: inv.note || '', role: inv.role, invitedBy: by?.display_name || null, expiresAt: inv.expires_at });
});

api.post('/invites/:token/accept', wrap((req, res) => {
  const inv = validInvite(req.params.token);
  if (!inv) return fail(res, 404, 'La invitación no es válida o ya expiró.');
  const username = String(req.body?.username || '').trim();
  const displayName = String(req.body?.displayName || '').trim();
  const password = String(req.body?.password || '');
  const email = String(req.body?.email || inv.email || '').trim().toLowerCase().slice(0, 120);
  const err = validateNewAccount({ username, password, displayName });
  if (err) return fail(res, 400, err);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return fail(res, 409, 'Ese usuario ya existe.');
  const userId = tx(() => {
    const id = Number(db.prepare(`INSERT INTO users (username, email, display_name, password_hash, role, avatar, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(username, email, displayName, hashPassword(password), inv.role, JSON.stringify(defaultAvatar(username)), now()).lastInsertRowid);
    db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE token = ?').run(id, now(), inv.token);
    return id;
  });
  const token = createSession(userId);
  res.setHeader('Set-Cookie', sessionCookie(token));
  broadcastUser(userId);
  res.json({ user: publicUser(getUser(userId)) });
}));

// Todo lo de abajo requiere sesión
api.use(requireAuth);

api.get('/ice', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const servers = iceServersFor(req.user.id);
  const cf = await cloudflareIce();
  res.json({ iceServers: cf ? [...servers, ...cf] : servers });
}));

// ---------- Usuarios y perfil ----------
api.get('/users', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY display_name COLLATE NOCASE').all();
  res.json({ users: rows.map(publicUser) });
});

api.get('/users/:id/photo', (req, res) => {
  const u = db.prepare('SELECT photo FROM users WHERE id = ?').get(Number(req.params.id));
  const m = u?.photo?.match(/^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(Buffer.from(m[3], 'base64'));
});

const AVATAR_KEYS = SPEC_KEYS;

api.patch('/me', wrap((req, res) => {
  const b = req.body || {};
  const u = req.user;
  const displayName = b.displayName !== undefined ? String(b.displayName).trim() : u.display_name;
  if (!displayName || displayName.length > 40) return fail(res, 400, 'El nombre debe tener entre 1 y 40 caracteres.');
  let timezone = u.timezone;
  if (b.timezone !== undefined) {
    try { new Intl.DateTimeFormat('es', { timeZone: b.timezone }); timezone = b.timezone; } catch { return fail(res, 400, 'Zona horaria inválida'); }
  }
  const statusText = b.statusText !== undefined ? String(b.statusText).slice(0, 80) : u.status_text;
  let avatar = parseJSON(u.avatar, {});
  if (b.avatar && typeof b.avatar === 'object') {
    // El avatar se reemplaza completo: ficha generada o personaje subido (sprite)
    avatar = {};
    for (const k of AVATAR_KEYS) if (typeof b.avatar[k] === 'string') avatar[k] = b.avatar[k].slice(0, 40);
    if (avatar.sprite && !db.prepare('SELECT 1 FROM characters WHERE id = ?').get(avatar.sprite)) return fail(res, 400, 'Ese personaje ya no existe');
  }
  const email = b.email !== undefined ? String(b.email).trim().toLowerCase().slice(0, 120) : u.email;
  db.prepare('UPDATE users SET display_name = ?, timezone = ?, status_text = ?, avatar = ?, email = ? WHERE id = ?')
    .run(displayName, timezone, statusText, JSON.stringify(avatar), email, u.id);
  broadcastUser(u.id);
  res.json({ user: publicUser(getUser(u.id)) });
}));

// Entrar o salir de turno
api.put('/me/shift', wrap((req, res) => {
  const raw = req.body?.shift;
  const shift = raw == null || raw === '' ? null : String(raw).trim().slice(0, 30);
  if (shift && !officeConfig().shifts.includes(shift)) return fail(res, 400, 'Ese turno no existe');
  db.prepare('UPDATE users SET shift = ?, shift_at = ? WHERE id = ?').run(shift, shift ? now() : null, req.user.id);
  broadcastUser(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id)) });
}));

api.put('/me/photo', wrap((req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl)) return fail(res, 400, 'Imagen inválida');
  if (dataUrl.length > 700_000) return fail(res, 413, 'La imagen es muy grande');
  db.prepare('UPDATE users SET photo = ?, photo_v = photo_v + 1 WHERE id = ?').run(dataUrl, req.user.id);
  broadcastUser(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id)) });
}));

api.delete('/me/photo', (req, res) => {
  db.prepare('UPDATE users SET photo = NULL, photo_v = photo_v + 1 WHERE id = ?').run(req.user.id);
  broadcastUser(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id)) });
});

api.put('/me/prefs', (req, res) => {
  const prefs = req.body && typeof req.body === 'object' ? req.body : {};
  const s = JSON.stringify(prefs);
  if (s.length > 20_000) return fail(res, 413, 'Preferencias demasiado grandes');
  db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(s, req.user.id);
  res.json({ prefs });
});

api.post('/me/password', wrap((req, res) => {
  const { current, password } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) return fail(res, 400, 'La contraseña actual no es correcta');
  if (!password || String(password).length < 8) return fail(res, 400, 'La nueva contraseña debe tener al menos 8 caracteres');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.token);
  res.json({ ok: true });
}));

// ---------- Personajes subidos (hojas de sprites PNG 96×192) ----------
const SHEET_W = 96;
const SHEET_H = 192;

function pngSize(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== sig || buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

api.get('/characters', (req, res) => {
  const rows = db.prepare('SELECT id, name, created_at FROM characters ORDER BY created_at').all();
  res.json({ characters: rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })) });
});

api.get('/characters/:id.png', (req, res) => {
  const r = db.prepare('SELECT png FROM characters WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).end();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(r.png));
});

api.post('/characters', requireAdmin, wrap((req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl || ''));
  if (!name) return fail(res, 400, 'Ponle un nombre al personaje');
  if (!m) return fail(res, 400, 'Sube un archivo PNG');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 300_000) return fail(res, 413, 'El PNG es demasiado grande');
  const size = pngSize(buf);
  if (!size) return fail(res, 400, 'El archivo no es un PNG válido');
  if (size.w !== SHEET_W || size.h !== SHEET_H) {
    return fail(res, 400, `La hoja debe medir ${SHEET_W}×${SHEET_H} px (3 cuadros × 4 direcciones de 32×48). La tuya mide ${size.w}×${size.h}.`);
  }
  const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'personaje';
  let id = base;
  for (let n = 2; db.prepare('SELECT 1 FROM characters WHERE id = ?').get(id); n++) id = `${base}-${n}`;
  db.prepare('INSERT INTO characters (id, name, png, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, buf, req.user.id, now());
  emitAll('characters', {});
  res.json({ character: { id, name } });
}));

api.delete('/characters/:id', requireAdmin, wrap((req, res) => {
  const id = String(req.params.id);
  // Quien lo usaba vuelve a su ficha generada
  for (const u of db.prepare("SELECT id, avatar FROM users WHERE avatar LIKE ?").all(`%"sprite":"${id}"%`)) {
    const av = parseJSON(u.avatar, {});
    if (av.sprite === id) {
      delete av.sprite;
      db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(JSON.stringify(av), u.id);
      broadcastUser(u.id);
    }
  }
  db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  emitAll('characters', {});
  res.json({ ok: true });
}));

// ---------- Administración ----------
const admin = express.Router();
admin.use(requireAdmin);

const inviteRow = (r) => ({
  token: r.token, email: r.email, role: r.role, note: r.note, createdAt: r.created_at, expiresAt: r.expires_at,
  createdBy: r.created_by, usedBy: r.used_by, usedAt: r.used_at, revoked: !!r.revoked,
  status: r.revoked ? 'revoked' : r.used_by ? 'used' : r.expires_at < now() ? 'expired' : 'pending',
});

admin.patch('/office', (req, res) => {
  const b = req.body || {};
  if (b.officeName !== undefined) {
    const name = String(b.officeName).trim().slice(0, 40);
    if (!name) return fail(res, 400, 'La oficina necesita un nombre');
    setSetting('office_name', name);
  }
  if (b.theme !== undefined) {
    if (!THEMES.includes(b.theme)) return fail(res, 400, 'Tema inválido');
    setSetting('theme', b.theme);
  }
  if (b.accent !== undefined) {
    if (b.accent !== null && !/^#[0-9a-fA-F]{6}$/.test(b.accent)) return fail(res, 400, 'Color inválido');
    setSetting('accent', b.accent);
  }
  if (b.shifts !== undefined) {
    if (!Array.isArray(b.shifts)) return fail(res, 400, 'Lista de turnos inválida');
    const list = [...new Set(b.shifts.map((x) => String(x).trim().slice(0, 30)).filter(Boolean))].slice(0, 30);
    setSetting('shifts', JSON.stringify(list));
  }
  emitAll('office', officeConfig());
  res.json(officeConfig());
});

admin.put('/office/logo', (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(dataUrl)) return fail(res, 400, 'Sube un PNG, JPG, WEBP o SVG');
  if (dataUrl.length > 400_000) return fail(res, 413, 'El logo es muy grande (máx. ~300 KB)');
  setSetting('logo', dataUrl);
  setSetting('logo_v', Date.now());
  emitAll('office', officeConfig());
  res.json(officeConfig());
});

admin.delete('/office/logo', (req, res) => {
  setSetting('logo', null);
  emitAll('office', officeConfig());
  res.json(officeConfig());
});

admin.get('/invites', (req, res) => {
  res.json({ invites: db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all().map(inviteRow) });
});

admin.post('/invites', (req, res) => {
  const role = req.body?.role === 'admin' ? 'admin' : 'member';
  const days = Math.min(30, Math.max(1, Number(req.body?.days) || 7));
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 120);
  const note = String(req.body?.note || '').slice(0, 120);
  const token = randomToken(24);
  db.prepare('INSERT INTO invites (token, email, role, note, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(token, email, role, note, req.user.id, now(), now() + days * 864e5);
  res.json({ invite: inviteRow(db.prepare('SELECT * FROM invites WHERE token = ?').get(token)) });
});

// Invitaciones en lote: una por persona (nombre, correo opcional, rol opcional)
admin.post('/invites/batch', wrap((req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 300) : [];
  if (!rows.length) return fail(res, 400, 'La lista está vacía');
  const days = Math.min(30, Math.max(1, Number(req.body?.days) || 14));
  const ins = db.prepare('INSERT INTO invites (token, email, role, note, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const out = tx(() => rows.map((r) => {
    const name = String(r?.name || '').trim().slice(0, 40);
    const email = String(r?.email || '').trim().toLowerCase().slice(0, 120);
    const role = r?.role === 'admin' ? 'admin' : 'member';
    const token = randomToken(24);
    ins.run(token, email, role, name, req.user.id, now(), now() + days * 864e5);
    return { name, email, role, token };
  }));
  res.json({ invites: out });
}));

admin.delete('/invites/:token', (req, res) => {
  db.prepare('UPDATE invites SET revoked = 1 WHERE token = ? AND used_by IS NULL').run(req.params.token);
  res.json({ ok: true });
});

admin.patch('/users/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const u = getUser(id);
  if (!u) return fail(res, 404, 'Usuario no encontrado');
  const role = req.body?.role !== undefined ? (req.body.role === 'admin' ? 'admin' : 'member') : u.role;
  const disabled = req.body?.disabled !== undefined ? (req.body.disabled ? 1 : 0) : u.disabled;
  if (id === req.user.id && (role !== 'admin' || disabled)) return fail(res, 400, 'No puedes quitarte tu propio acceso de administrador.');
  if (u.role === 'admin' && (role !== 'admin' || disabled)) {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get().n;
    if (admins <= 1) return fail(res, 400, 'Debe quedar al menos un administrador.');
  }
  db.prepare('UPDATE users SET role = ?, disabled = ? WHERE id = ?').run(role, disabled, id);
  if (disabled) { destroyUserSessions(id); disconnectUser(id); }
  broadcastUser(id);
  res.json({ user: publicUser(getUser(id)) });
}));

admin.post('/users/:id/reset-password', wrap((req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) return fail(res, 404, 'Usuario no encontrado');
  const password = randomToken(9);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  destroyUserSessions(id);
  disconnectUser(id);
  res.json({ password });
}));

api.use('/admin', admin);

// ---------- Chat ----------
const dmKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function parseConv(conv, userId) {
  const m = /^([cd]):(\d+)$/.exec(String(conv || ''));
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === 'c') return db.prepare('SELECT 1 FROM channels WHERE id = ?').get(id) ? { channelId: id, key: `c:${id}` } : null;
  if (id === userId || !getUser(id)) return null;
  return { dm: dmKey(userId, id), otherId: id, key: `d:${dmKey(userId, id)}` };
}

const messageRow = (r) => ({
  id: r.id, userId: r.user_id, kind: r.kind, body: r.body, createdAt: r.created_at,
  conv: r.channel_id ? `c:${r.channel_id}` : null, dm: r.dm_key,
});

function lastRead(userId, key) {
  return db.prepare('SELECT last_read_id FROM reads WHERE user_id = ? AND conv = ?').get(userId, key)?.last_read_id || 0;
}

api.get('/chat', (req, res) => {
  const uid = req.user.id;
  const channels = db.prepare('SELECT * FROM channels ORDER BY id').all().map((c) => {
    const key = `c:${c.id}`;
    const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND id > ? AND user_id != ?').get(c.id, lastRead(uid, key), uid).n;
    return { conv: key, id: c.id, name: c.name, unread };
  });
  const dms = db.prepare(`
    SELECT dm_key, MAX(id) AS last_id FROM messages
    WHERE dm_key IS NOT NULL AND (dm_key LIKE ? OR dm_key LIKE ?)
    GROUP BY dm_key ORDER BY last_id DESC`).all(`${uid}:%`, `%:${uid}`).map((r) => {
    const [a, b] = r.dm_key.split(':').map(Number);
    const otherId = a === uid ? b : a;
    const key = `d:${r.dm_key}`;
    const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE dm_key = ? AND id > ? AND user_id != ?').get(r.dm_key, lastRead(uid, key), uid).n;
    return { conv: `d:${otherId}`, userId: otherId, lastId: r.last_id, unread };
  });
  res.json({ channels, dms });
});

api.get('/messages', (req, res) => {
  const c = parseConv(req.query.conv, req.user.id);
  if (!c) return fail(res, 400, 'Conversación inválida');
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = c.channelId
    ? db.prepare('SELECT * FROM messages WHERE channel_id = ? AND id < ? ORDER BY id DESC LIMIT 60').all(c.channelId, before)
    : db.prepare('SELECT * FROM messages WHERE dm_key = ? AND id < ? ORDER BY id DESC LIMIT 60').all(c.dm, before);
  res.json({ messages: rows.reverse().map(messageRow), hasMore: rows.length === 60 });
});

function postMessage(user, c, body, kind = 'text') {
  const id = Number(db.prepare('INSERT INTO messages (channel_id, dm_key, user_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.channelId ?? null, c.dm ?? null, user.id, kind, body, now()).lastInsertRowid);
  const msg = messageRow(db.prepare('SELECT * FROM messages WHERE id = ?').get(id));
  if (c.channelId) {
    emitAll('message', msg);
    // Menciones
    const names = new Set([...body.matchAll(/@([a-zA-Z0-9_.-]{3,24})/g)].map((m) => m[1].toLowerCase()));
    for (const n of names) {
      const target = db.prepare('SELECT id FROM users WHERE username = ?').get(n);
      if (target && target.id !== user.id) notify(target.id, 'mention', user.id, { conv: c.key, messageId: id, preview: body.slice(0, 140) });
    }
  } else {
    emitToUser(user.id, 'message', msg);
    emitToUser(c.otherId, 'message', msg);
  }
  db.prepare('INSERT INTO reads (user_id, conv, last_read_id) VALUES (?, ?, ?) ON CONFLICT(user_id, conv) DO UPDATE SET last_read_id = excluded.last_read_id')
    .run(user.id, c.key, id);
  return msg;
}

api.post('/messages', wrap((req, res) => {
  const c = parseConv(req.body?.conv, req.user.id);
  if (!c) return fail(res, 400, 'Conversación inválida');
  const body = String(req.body?.body || '').trim();
  if (!body) return fail(res, 400, 'Mensaje vacío');
  if (body.length > 4000) return fail(res, 400, 'Mensaje demasiado largo');
  res.json({ message: postMessage(req.user, c, body) });
}));

api.post('/reads', (req, res) => {
  const c = parseConv(req.body?.conv, req.user.id);
  if (!c) return fail(res, 400, 'Conversación inválida');
  const lastId = Number(req.body?.lastId) || 0;
  db.prepare('INSERT INTO reads (user_id, conv, last_read_id) VALUES (?, ?, ?) ON CONFLICT(user_id, conv) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)')
    .run(req.user.id, c.key, lastId);
  res.json({ ok: true });
});

api.post('/channels', requireAdmin, (req, res) => {
  const name = String(req.body?.name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 30);
  if (!name) return fail(res, 400, 'Nombre inválido');
  try {
    db.prepare('INSERT INTO channels (name) VALUES (?)').run(name);
  } catch {
    return fail(res, 409, 'Ese canal ya existe');
  }
  emitAll('channels', {});
  res.json({ ok: true });
});

// Saludar (wave)
api.post('/wave/:userId', wrap((req, res) => {
  const c = parseConv(`d:${req.params.userId}`, req.user.id);
  if (!c) return fail(res, 400, 'Usuario inválido');
  postMessage(req.user, c, 'wave', 'wave');
  notify(c.otherId, 'wave', req.user.id, {});
  res.json({ ok: true });
}));

// ---------- Notificaciones ----------
api.get('/notifications', (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(req.user.id);
  res.json({ notifications: rows.map(notificationRow) });
});

api.post('/notifications/read', (req, res) => {
  if (req.body?.id) db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?').run(req.user.id, Number(req.body.id));
  else db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ---------- Calendario ----------
const eventRow = (r) => ({
  id: r.id, title: r.title, description: r.description, location: r.location,
  startsAt: r.starts_at, endsAt: r.ends_at, createdBy: r.created_by, areaId: r.area_id ?? null,
  attendees: db.prepare('SELECT user_id FROM event_attendees WHERE event_id = ?').all(r.id).map((a) => a.user_id),
});

api.get('/events', (req, res) => {
  const from = Number(req.query.from) || now() - 7 * 864e5;
  const to = Number(req.query.to) || now() + 30 * 864e5;
  const rows = db.prepare('SELECT * FROM events WHERE ends_at > ? AND starts_at < ? ORDER BY starts_at').all(from, to);
  res.json({ events: rows.map(eventRow) });
});

function readEventBody(b) {
  const title = String(b?.title || '').trim().slice(0, 120);
  const startsAt = Number(b?.startsAt);
  const endsAt = Number(b?.endsAt);
  if (!title) return { error: 'El evento necesita un título' };
  if (!startsAt || !endsAt || endsAt <= startsAt) return { error: 'Revisa las horas del evento' };
  const attendees = Array.isArray(b?.attendees) ? [...new Set(b.attendees.map(Number).filter((id) => getUser(id)))] : [];
  return {
    title, startsAt, endsAt, attendees,
    description: String(b?.description || '').slice(0, 2000),
    location: String(b?.location || '').slice(0, 120),
    areaId: b?.areaId && db.prepare('SELECT 1 FROM areas WHERE id = ?').get(Number(b.areaId)) ? Number(b.areaId) : null,
  };
}

api.post('/events', wrap((req, res) => {
  const e = readEventBody(req.body);
  if (e.error) return fail(res, 400, e.error);
  const id = tx(() => {
    const eid = Number(db.prepare('INSERT INTO events (title, description, location, starts_at, ends_at, created_by, created_at, area_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.title, e.description, e.location, e.startsAt, e.endsAt, req.user.id, now(), e.areaId).lastInsertRowid);
    for (const a of e.attendees) db.prepare('INSERT OR IGNORE INTO event_attendees (event_id, user_id) VALUES (?, ?)').run(eid, a);
    return eid;
  });
  for (const a of e.attendees) if (a !== req.user.id) notify(a, 'event', req.user.id, { eventId: id, title: e.title, startsAt: e.startsAt });
  emitAll('events', {});
  res.json({ event: eventRow(db.prepare('SELECT * FROM events WHERE id = ?').get(id)) });
}));

api.patch('/events/:id', wrap((req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id));
  if (!row) return fail(res, 404, 'Evento no encontrado');
  if (row.created_by !== req.user.id && req.user.role !== 'admin') return fail(res, 403, 'Solo quien creó el evento puede editarlo');
  const e = readEventBody({ ...eventRow(row), ...req.body });
  if (e.error) return fail(res, 400, e.error);
  tx(() => {
    db.prepare('UPDATE events SET title = ?, description = ?, location = ?, starts_at = ?, ends_at = ?, area_id = ? WHERE id = ?')
      .run(e.title, e.description, e.location, e.startsAt, e.endsAt, e.areaId, row.id);
    db.prepare('DELETE FROM event_attendees WHERE event_id = ?').run(row.id);
    for (const a of e.attendees) db.prepare('INSERT OR IGNORE INTO event_attendees (event_id, user_id) VALUES (?, ?)').run(row.id, a);
  });
  emitAll('events', {});
  res.json({ event: eventRow(db.prepare('SELECT * FROM events WHERE id = ?').get(row.id)) });
}));

api.delete('/events/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id));
  if (!row) return fail(res, 404, 'Evento no encontrado');
  if (row.created_by !== req.user.id && req.user.role !== 'admin') return fail(res, 403, 'Solo quien creó el evento puede borrarlo');
  db.prepare('DELETE FROM events WHERE id = ?').run(row.id);
  emitAll('events', {});
  res.json({ ok: true });
});

// ---------- Tablero de anuncios ----------
const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'white'];
const noticeRow = (r) => ({ id: r.id, authorId: r.author_id, text: r.text, color: r.color, pinned: !!r.pinned, createdAt: r.created_at });

api.get('/notices', (req, res) => {
  const rows = db.prepare('SELECT * FROM notices ORDER BY pinned DESC, created_at DESC LIMIT 60').all();
  res.json({ notices: rows.map(noticeRow) });
});

api.post('/notices', wrap((req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!text) return fail(res, 400, 'Escribe el anuncio');
  const color = NOTE_COLORS.includes(req.body?.color) ? req.body.color : 'yellow';
  const id = Number(db.prepare('INSERT INTO notices (author_id, text, color, created_at) VALUES (?, ?, ?, ?)').run(req.user.id, text, color, now()).lastInsertRowid);
  // Más de 200 anuncios: se borran los más viejos sin fijar
  db.prepare('DELETE FROM notices WHERE pinned = 0 AND id NOT IN (SELECT id FROM notices ORDER BY created_at DESC LIMIT 200)').run();
  const row = noticeRow(db.prepare('SELECT * FROM notices WHERE id = ?').get(id));
  emitAll('notice', row);
  res.json({ notice: row });
}));

function ownNotice(req, res) {
  const r = db.prepare('SELECT * FROM notices WHERE id = ?').get(Number(req.params.id));
  if (!r) { fail(res, 404, 'Anuncio no encontrado'); return null; }
  if (r.author_id !== req.user.id && req.user.role !== 'admin') { fail(res, 403, 'Solo quien lo publicó o un admin'); return null; }
  return r;
}

api.patch('/notices/:id', wrap((req, res) => {
  const r = ownNotice(req, res);
  if (!r) return;
  if (req.body?.pinned !== undefined) {
    if (req.user.role !== 'admin') return fail(res, 403, 'Solo un admin puede fijar anuncios');
    db.prepare('UPDATE notices SET pinned = ? WHERE id = ?').run(req.body.pinned ? 1 : 0, r.id);
  }
  emitAll('notices', {});
  res.json({ ok: true });
}));

api.delete('/notices/:id', wrap((req, res) => {
  const r = ownNotice(req, res);
  if (!r) return;
  db.prepare('DELETE FROM notices WHERE id = ?').run(r.id);
  emitAll('notices', {});
  res.json({ ok: true });
}));

// ---------- Mundo: pisos, objetos, áreas, escritorios ----------
api.get('/floors', (req, res) => res.json({ floors: world.listFloors() }));

api.get('/floors/:id', (req, res) => {
  const p = world.floorPayload(Number(req.params.id));
  if (!p) return fail(res, 404, 'Piso no encontrado');
  res.json({ floor: p });
});

api.post('/floors', requireAdmin, wrap((req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40) || `Piso ${world.listFloors().length + 1}`;
  const f = world.createFloor(name, req.body?.template || 'open');
  emitAll('floors', { floors: world.listFloors() });
  res.json({ floor: world.floorPayload(f.id) });
}));

api.patch('/floors/:id', requireAdmin, wrap((req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40);
  if (!name) return fail(res, 400, 'Nombre inválido');
  world.renameFloor(Number(req.params.id), name);
  emitAll('floors', { floors: world.listFloors() });
  res.json({ ok: true });
}));

api.delete('/floors/:id', requireAdmin, wrap((req, res) => {
  const id = Number(req.params.id);
  world.deleteFloor(id);
  const fallback = world.defaultFloorId();
  for (const [uid, p] of presence) if (p.floorId === id) relocate(uid, fallback);
  db.prepare('UPDATE users SET floor_id = NULL, pos_x = NULL, pos_y = NULL WHERE floor_id = ?').run(id);
  emitAll('floors', { floors: world.listFloors() });
  res.json({ ok: true });
}));

// Si un objeto sólido cae encima de alguien, lo movemos a la casilla libre más cercana.
function unstickPlayers(floorId) {
  const f = world.getFloor(floorId)?.state;
  if (!f) return;
  for (const [uid, p] of presence) if (p.floorId === floorId && f.solid[p.y]?.[p.x]) relocate(uid, floorId, p.x, p.y);
}

api.post('/floors/:id/objects', wrap((req, res) => {
  const floorId = Number(req.params.id);
  const id = world.addObject(req.user, floorId, req.body || {});
  broadcastFloor(floorId);
  unstickPlayers(floorId);
  res.json({ id });
}));

api.patch('/objects/:id', wrap((req, res) => {
  const floorId = world.updateObject(req.user, Number(req.params.id), req.body || {});
  broadcastFloor(floorId);
  unstickPlayers(floorId);
  res.json({ ok: true });
}));

api.delete('/objects/:id', wrap((req, res) => {
  const floorId = world.deleteObject(req.user, Number(req.params.id));
  broadcastFloor(floorId);
  res.json({ ok: true });
}));

api.post('/floors/:id/areas', requireAdmin, wrap((req, res) => {
  const floorId = world.addArea(Number(req.params.id), req.body || {});
  broadcastFloor(floorId);
  res.json({ ok: true });
}));

api.patch('/areas/:id', requireAdmin, wrap((req, res) => {
  const floorId = world.updateArea(Number(req.params.id), req.body || {});
  broadcastFloor(floorId);
  res.json({ ok: true });
}));

// Líder del departamento (o admin): alfombra, forma y decoración abierta para el equipo
api.patch('/areas/:id/style', wrap((req, res) => {
  const floorId = world.styleArea(req.user, Number(req.params.id), req.body || {});
  broadcastFloor(floorId);
  res.json({ ok: true });
}));

api.put('/areas/:id/leaders', requireAdmin, wrap((req, res) => {
  const floorId = world.setAreaLeaders(Number(req.params.id), req.body?.userIds);
  broadcastFloor(floorId);
  res.json({ ok: true });
}));

api.delete('/areas/:id', requireAdmin, wrap((req, res) => {
  const floorId = world.deleteArea(Number(req.params.id));
  broadcastFloor(floorId);
  res.json({ ok: true });
}));

api.post('/desks/:id/claim', wrap((req, res) => {
  const changed = world.claimDesk(req.user.id, Number(req.params.id));
  changed.forEach(broadcastFloor);
  res.json({ ok: true });
}));

api.post('/desks/:id/release', wrap((req, res) => {
  const changed = world.releaseDesk(Number(req.params.id), req.user);
  changed.forEach(broadcastFloor);
  res.json({ ok: true });
}));

// ---------- Errores ----------
api.use((err, req, res, next) => {
  if (err instanceof world.WorldError) return fail(res, err.status, err.message);
  if (err?.type === 'entity.too.large') return fail(res, 413, 'El contenido es demasiado grande');
  console.error(err);
  fail(res, 500, 'Error interno del servidor');
});
