import crypto from 'node:crypto';
import express from 'express';
import { db, now, tx, getSetting, setSetting } from './db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, destroyUserSessions, userFromToken,
  parseCookies, sessionCookie, SESSION_COOKIE, loginRateLimited, clearLoginAttempts,
  validateNewAccount, defaultAvatar, randomToken,
} from './auth.js';
import { presenceFor, emitAll, emitToUser, presence, relocate, disconnectUser, emitFloors, emitFloor, evictNonAdmins } from './realtime.js';
import * as world from './world.js';
import { alert } from './alerts.js';
import * as sec from './security.js';
import { registerFileRoutes, getFiles } from './files.js';
import { registerDiscordRoutes, discordEnabled } from './discord.js';
import { openShift, shiftReport } from './shifts.js';
import { backupStatus } from './backup.js';
import { SPEC_KEYS } from '../shared/sprite.js';
import { PET_IDS, cleanPetName } from '../shared/pets.js';
import { addScore, topScores, SCORE_GAMES } from './games.js';
import { activeSeason, SEASON_SETTINGS, validMD } from '../shared/seasons.js';
import { registerSantaRoutes } from './santa.js';
import { registerPushRoutes, pushNotification, pushMessage } from './push.js';
import { notesConfig, stopAllNotes } from './notes.js';
import { registerStatsRoutes } from './stats.js';
import { registerAchievementRoutes } from './achievements.js';
import { registerHotelRoutes } from './hotel.js';
import { THEME_IDS, officeTheme, userTheme, registerThemeRoutes } from './themes.js';
import { registerBadgeRoutes } from './badges.js';
import { getIO } from './realtime.js';
import { restRateLimit, perUser } from './ratelimit.js';
import * as mod from './moderation.js'; // silenciar, sacar, suspender, bloquear y reportes
import * as voice from './voiceGate.js'; // quién puede tener voz con quién (llamadas, LiveKit)

export const api = express.Router();
api.use(restRateLimit); // tope de peticiones por sesión o IP (server/ratelimit.js)
api.use(sec.checkOrigin); // escrituras solo desde la propia oficina (CSRF)
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

// viewer: quien pide los datos (si no es admin, no ve a nadie dentro de un piso archivado)
export function publicUser(u, viewer = null) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    // El correo es privado: solo lo ven la propia persona y los admins
    email: viewer && (viewer.role === 'admin' || viewer.id === u.id) ? u.email || '' : '',
    role: u.role,
    avatar: parseJSON(u.avatar, {}),
    photoUrl: u.photo ? `/api/users/${u.id}/photo?v=${u.photo_v}` : null,
    petPhotoUrl: u.pet_photo ? `/api/users/${u.id}/pet-photo?v=${u.pet_photo_v}` : null,
    timezone: u.timezone,
    statusText: u.status_text || '',
    shift: u.shift || null,
    twoFactor: !!u.totp_enabled,
    discordName: u.discord_name || null,
    shiftAt: u.shift_at || null,
    birthday: u.birthday || null,
    disabled: !!u.disabled,
    lastActive: u.last_active,
    createdAt: u.created_at,
    ...presenceFor(u.id, viewer?.role === 'admin'),
  };
}

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

function broadcastUser(id) {
  const u = getUser(id);
  if (!u) return;
  const io = getIO();
  if (!io) return;
  io.to('role:admin').emit('user', publicUser(u, { role: 'admin' }));
  io.to('role:member').except(`user:${id}`).emit('user', publicUser(u));
  if (u.role !== 'admin') io.to(`user:${id}`).emit('user', publicUser(u, u));
}

function broadcastFloor(floorId) {
  emitFloor(floorId); // los pisos archivados solo les llegan a los admins
}

// Piso que esta persona puede ver (los archivados, solo admins): si no, 404
function visibleFloor(req, res, id) {
  if (world.canSeeFloor(req.user, id)) return true;
  fail(res, 404, 'Piso no encontrado');
  return false;
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
  // Si la oficina lo exige, un admin sin verificación en dos pasos no puede administrar
  if (sec.requireAdmin2fa() && !req.user.totp_enabled) return res.status(403).json({ error: 'Activa la verificación en dos pasos (Preferencias → Cuenta) para usar las funciones de administrador.', code: 'need2fa' });
  next();
}

function notify(userId, type, actorId, data = {}) {
  if (actorId && mod.hasBlocked(userId, actorId)) return;
  const id = Number(db.prepare('INSERT INTO notifications (user_id, type, actor_id, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, type, actorId, JSON.stringify(data), now()).lastInsertRowid);
  emitToUser(userId, 'notification', notificationRow(db.prepare('SELECT * FROM notifications WHERE id = ?').get(id)));
  pushNotification(userId, type, actorId, data);
}

const notificationRow = (r) => ({ id: r.id, type: r.type, actorId: r.actor_id, data: parseJSON(r.data, {}), read: !!r.read, createdAt: r.created_at });

// ---------- Configuración pública ----------
api.get('/health', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true, uptime: Math.round(process.uptime()), online: presence.size });
});

// Marca de la oficina: Nuvora es el producto; cada oficina elige nombre, tema, color y logo.
const THEMES = THEME_IDS; // Eleevate (predeterminado), Nuvora, HUB clásico, Personalizado y los de juegos

export function officeConfig() {
  const logoV = getSetting('logo_v');
  return {
    officeName: getSetting('office_name') || process.env.OFFICE_NAME || 'Mi oficina',
    theme: officeTheme(),
    accent: getSetting('accent') || null,
    logoUrl: getSetting('logo') ? `/api/office/logo?v=${logoV}` : null,
    shifts: parseJSON(getSetting('shifts') || 'null', null) || DEFAULT_SHIFTS,
    // Servidor de medios: LiveKit si está configurado; si no, conexión directa (P2P)
    livekitUrl: livekitEnabled() ? process.env.LIVEKIT_URL : null,
    requireAdmin2fa: sec.requireAdmin2fa(),
    discordLogin: discordEnabled(),
    // Decoración de temporada (Halloween…): lo que eligió el admin y la que toca hoy
    seasonSetting: getSetting('season') || 'auto',
    season: activeSeason(getSetting('season') || 'auto', new Date(), { anniversary: getSetting('anniversary_date') }),
    // Aniversario de la comunidad: fecha 'MM-DD' y año de fundación (para "N años")
    anniversary: { date: getSetting('anniversary_date') || null, year: Number(getSetting('anniversary_year')) || null },
    // Resumen de reuniones con IA: si el admin lo permite y si el servidor tiene llave
    ...notesConfig(),
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
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 120 || password.length > 200) return fail(res, 400, 'Usuario o contraseña incorrectos');
  const wait = sec.loginLockedFor(username, ip);
  if (wait) return fail(res, 429, `Demasiados intentos con esa cuenta. Espera ${wait > 90 ? `${Math.ceil(wait / 60)} min` : `${wait} s`}.`);
  if (!sec.loginCapacityOk()) return fail(res, 429, 'Hay muchos inicios de sesión ahora mismo. Intenta en unos segundos.');
  const u = db.prepare('SELECT * FROM users WHERE username = ? OR (email != \'\' AND email = ?)').get(String(username || '').trim(), String(username || '').trim().toLowerCase());
  // Con o sin cuenta se calcula la contraseña (mismo tiempo de respuesta: no revela qué usuarios existen)
  const okPass = verifyPassword(String(password || ''), u?.password_hash || DUMMY_HASH);
  if (!u || !okPass) {
    sec.recordLoginFailure(username, ip);
    sec.audit({ actor: u?.id ?? null, action: `Inicio de sesión fallido (${String(username || '').slice(0, 40)})`, ip });
    return fail(res, 401, 'Usuario o contraseña incorrectos');
  }
  if (u.disabled) return fail(res, 403, 'Tu cuenta está desactivada. Habla con un administrador.');
  const ban = mod.banOf(u.id);
  if (ban) return res.status(403).json({ error: mod.banMessage(ban), code: 'banned', until: ban.until });
  clearLoginAttempts(ip);
  sec.clearLoginFailures(username, ip);
  // Segundo paso: código de la app de autenticación
  if (u.totp_enabled) return res.json({ needs2fa: true, ticket: sec.newLoginTicket(u.id) });
  finishLogin(req, res, u);
}));

const DUMMY_HASH = hashPassword(randomToken(12));

function finishLogin(req, res, u) {
  if (u.role === 'admin') sec.audit({ actor: u.id, action: 'Inició sesión (admin)', ip: req.ip });
  const token = createSession(u.id);
  res.setHeader('Set-Cookie', sessionCookie(token));
  res.json({ user: publicUser(u, u) });
}

api.post('/auth/2fa', wrap((req, res) => {
  if (loginRateLimited(req.ip)) return fail(res, 429, 'Demasiados intentos. Espera unos minutos.');
  const t = sec.readLoginTicket(req.body?.ticket);
  if (!t) return fail(res, 401, 'El inicio de sesión expiró. Vuelve a escribir tu contraseña.');
  const u = getUser(t.userId);
  if (!u || u.disabled || !u.totp_enabled) return fail(res, 401, 'No se pudo verificar');
  if (mod.isBanned(u.id)) return res.status(403).json({ error: mod.banMessage(mod.banOf(u.id)), code: 'banned' });
  const code = String(req.body?.code || '').trim();
  const step = sec.checkTotp(u.totp_secret, code, u.totp_last);
  if (step != null) {
    db.prepare('UPDATE users SET totp_last = ? WHERE id = ?').run(step, u.id);
  } else {
    const rest = sec.useRecoveryCode(u.totp_recovery, code);
    if (!rest) {
      sec.audit({ actor: u.id, action: 'Código de verificación incorrecto', ip: req.ip });
      return fail(res, 401, 'Código incorrecto');
    }
    db.prepare('UPDATE users SET totp_recovery = ? WHERE id = ?').run(JSON.stringify(rest), u.id);
    sec.audit({ actor: u.id, action: `Entró con un código de respaldo (quedan ${rest.length})`, ip: req.ip });
  }
  sec.dropLoginTicket(req.body?.ticket);
  finishLogin(req, res, getUser(u.id));
}));

api.post('/auth/logout', (req, res) => {
  destroySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }));
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: { ...publicUser(req.user, req.user), uiTheme: userTheme(req.user) }, prefs: parseJSON(req.user.prefs, {}) });
});

// ---------- Invitaciones (públicas) ----------
function validInvite(token) {
  const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(String(token));
  if (!inv || inv.revoked || inv.used_by || inv.expires_at < now()) return null;
  return inv;
}

registerDiscordRoutes(api, {
  validInvite,
  userFromReq: (req) => userFromToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]),
  publicUser: (u) => publicUser(u, u),
  broadcastUser: (id) => broadcastUser(id),
});

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
  const displayName = mod.cleanDisplayText(req.body?.displayName);
  const password = String(req.body?.password || '');
  if (inv.role !== 'admin' && mod.impersonates(displayName)) return fail(res, 400, 'Ese nombre está reservado para el equipo de administración.');
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
  res.json({ user: publicUser(getUser(userId), { id: userId }) });
}));

// Todo lo de abajo requiere sesión
api.use(requireAuth);
api.use(sec.auditMiddleware);

// ---------- LiveKit (servidor de medios / SFU) ----------
function livekitEnabled() {
  return !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// Token de acceso (JWT HS256) solo para la sala de su ámbito: su piso, su sala cerrada o su sala del Hotel
// (server/voiceGate.js: así nadie se suscribe a quien está en otro piso o en una sala cerrada)
function livekitToken(user) {
  const nowS = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = {
    iss: process.env.LIVEKIT_API_KEY,
    sub: String(user.id),
    name: user.display_name,
    nbf: nowS - 10,
    exp: nowS + (mod.isMuted(user.id) ? 3600 : 6 * 3600),
    video: {
      room: voice.lkIssue(user.id), roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false,
      // Silenciado por un admin: puede ver y oír, pero no publicar micrófono
      ...(mod.isMuted(user.id) ? { canPublishSources: ['camera', 'screen_share'] } : {}),
    },
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = crypto.createHmac('sha256', process.env.LIVEKIT_API_SECRET).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

api.get('/livekit/token', (req, res) => {
  if (!livekitEnabled()) return fail(res, 404, 'LiveKit no está configurado');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ url: process.env.LIVEKIT_URL, token: livekitToken(req.user) });
});

// Errores del navegador: se registran y, si se repiten, avisan al webhook
const clientErrRate = new Map();
api.post('/client-errors', (req, res) => {
  const now_ = Date.now();
  const list = (clientErrRate.get(req.user.id) || []).filter((t) => now_ - t < 60e3);
  if (list.length >= 5) return res.json({ ok: true });
  list.push(now_);
  clientErrRate.set(req.user.id, list);
  const msg = String(req.body?.message || '').slice(0, 300);
  const stack = String(req.body?.stack || '').slice(0, 1500);
  const where = String(req.body?.url || '').slice(0, 200);
  const ua = String(req.headers['user-agent'] || '').slice(0, 160);
  const mode = req.body?.mode === 'app' ? 'app instalada' : 'navegador';
  // El mensaje va también en el detalle: al copiar el aviso no se pierde
  if (msg) alert(`Error en el navegador: ${msg}`, `Error: ${msg}\n${req.user.display_name} · ${where} · ${mode}\n${ua}${stack ? `\n${stack}` : ''}`, { level: 'warn', key: `client:${msg}` });
  res.json({ ok: true });
});

api.get('/ice', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const servers = iceServersFor(req.user.id);
  const cf = await cloudflareIce();
  res.json({ iceServers: cf ? [...servers, ...cf] : servers });
}));

// ---------- Usuarios y perfil ----------
api.get('/users', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY display_name COLLATE NOCASE').all();
  res.json({ users: rows.map((u) => publicUser(u, req.user)) });
});

function sendDataUrl(res, dataUrl) {
  const m = dataUrl?.match(/^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(Buffer.from(m[3], 'base64'));
}
// Foto de la mascota real
api.get('/users/:id/pet-photo', (req, res) => {
  const u = db.prepare('SELECT pet_photo FROM users WHERE id = ?').get(Number(req.params.id));
  sendDataUrl(res, u?.pet_photo);
});

api.get('/users/:id/photo', (req, res) => {
  const u = db.prepare('SELECT photo FROM users WHERE id = ?').get(Number(req.params.id));
  const m = u?.photo?.match(/^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(Buffer.from(m[3], 'base64'));
});

const AVATAR_KEYS = [...SPEC_KEYS, 'pet', 'petColor', 'petName'];

api.patch('/me', perUser('profile', 20, 60e3), wrap((req, res) => {
  const b = req.body || {};
  const u = req.user;
  const displayName = b.displayName !== undefined ? mod.cleanDisplayText(b.displayName, 41) : u.display_name;
  if (!displayName || displayName.length > 40) return fail(res, 400, 'El nombre debe tener entre 1 y 40 caracteres.');
  if (b.displayName !== undefined && u.role !== 'admin' && displayName !== u.display_name && mod.impersonates(displayName)) return fail(res, 400, 'Ese nombre está reservado para el equipo de administración.');
  let timezone = u.timezone;
  if (b.timezone !== undefined) {
    try { new Intl.DateTimeFormat('es', { timeZone: b.timezone }); timezone = b.timezone; } catch { return fail(res, 400, 'Zona horaria inválida'); }
  }
  const statusText = b.statusText !== undefined ? mod.cleanDisplayText(b.statusText, 80) : u.status_text;
  let avatar = parseJSON(u.avatar, {});
  if (b.avatar && typeof b.avatar === 'object') {
    // El avatar se reemplaza completo: ficha generada o personaje subido (sprite)
    avatar = {};
    for (const k of AVATAR_KEYS) if (typeof b.avatar[k] === 'string') avatar[k] = b.avatar[k].slice(0, 40);
    if (avatar.pet && !PET_IDS.includes(avatar.pet)) delete avatar.pet;
    if (avatar.petName !== undefined) avatar.petName = cleanPetName(avatar.petName) || undefined;
    if (avatar.petColor && !/^#[0-9a-fA-F]{6}$/.test(avatar.petColor)) delete avatar.petColor;
    if (avatar.sprite && !db.prepare('SELECT 1 FROM characters WHERE id = ?').get(avatar.sprite)) return fail(res, 400, 'Ese personaje ya no existe');
  }
  const email = b.email !== undefined ? String(b.email).trim().toLowerCase().slice(0, 120) : u.email;
  let birthday = u.birthday || null;
  if (b.birthday !== undefined) {
    birthday = cleanBirthday(b.birthday);
    if (birthday === false) return fail(res, 400, 'Fecha de cumpleaños inválida');
  }
  db.prepare('UPDATE users SET display_name = ?, timezone = ?, status_text = ?, avatar = ?, email = ?, birthday = ? WHERE id = ?')
    .run(displayName, timezone, statusText, JSON.stringify(avatar), email, birthday, u.id);
  broadcastUser(u.id);
  res.json({ user: publicUser(getUser(u.id), u) });
}));

// ---------- Cumpleaños ----------
// 'MM-DD' válido, null para borrarlo, false si no es una fecha
export function cleanBirthday(v) {
  if (v == null || v === '') return null;
  const m = /^(\d{2})-(\d{2})$/.exec(String(v));
  if (!m) return false;
  const mo = Number(m[1]), d = Number(m[2]);
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1] ? `${m[1]}-${m[2]}` : false;
}

// El admin puede poner el cumpleaños de alguien (por ejemplo al importar al equipo)
api.put('/users/:id/birthday', requireAdmin, wrap((req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) return fail(res, 404, 'No existe');
  const birthday = cleanBirthday(req.body?.birthday);
  if (birthday === false) return fail(res, 400, 'Fecha de cumpleaños inválida');
  db.prepare('UPDATE users SET birthday = ? WHERE id = ?').run(birthday, id);
  broadcastUser(id);
  res.json({ ok: true });
}));

// Felicitaciones de este año para alguien
api.get('/birthdays/:userId/wishes', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const rows = db.prepare('SELECT from_id AS fromId, text, created_at AS at FROM birthday_wishes WHERE user_id = ? AND year = ? ORDER BY created_at').all(Number(req.params.userId), year);
  res.json({ wishes: rows });
});

api.post('/birthdays/:userId/wish', perUser('wish', 10, 60e3), wrap((req, res) => {
  const to = Number(req.params.userId);
  const target = getUser(to);
  if (!target || to === req.user.id) return fail(res, 400, 'No puedes felicitar a esa persona');
  if (!target.birthday) return fail(res, 400, 'Esa persona no tiene cumpleaños registrado');
  const text = String(req.body?.text || '¡Feliz cumpleaños! 🎉').trim().slice(0, 280) || '¡Feliz cumpleaños! 🎉';
  const year = Number(req.body?.year) || new Date().getFullYear();
  const prev = db.prepare('SELECT 1 FROM birthday_wishes WHERE user_id = ? AND from_id = ? AND year = ?').get(to, req.user.id, year);
  db.prepare('INSERT INTO birthday_wishes (user_id, from_id, year, text, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, from_id, year) DO UPDATE SET text = excluded.text')
    .run(to, req.user.id, year, text, now());
  if (!prev) notify(to, 'birthday', req.user.id, { text });
  emitAll('birthday:wish', { userId: to, fromId: req.user.id, text, year });
  res.json({ ok: true });
}));

// ---------- Juegos: puntuaciones ----------
api.get('/games/:game/top', (req, res) => {
  if (!SCORE_GAMES.includes(req.params.game)) return fail(res, 404, 'No existe');
  res.json({ top: topScores(req.params.game) });
});

let scoreTimes = new Map();
api.post('/games/arcade/score', wrap((req, res) => {
  const score = Math.trunc(Number(req.body?.score));
  if (!Number.isFinite(score) || score <= 0 || score > 1e6) return fail(res, 400, 'Puntuación inválida');
  const t = Date.now();
  if (t - (scoreTimes.get(req.user.id) || 0) < 5000) return fail(res, 429, 'Espera un momento');
  scoreTimes.set(req.user.id, t);
  addScore(req.user.id, 'arcade', score);
  res.json({ ok: true, top: topScores('arcade') });
}));

// Entrar o salir de turno
api.put('/me/shift', wrap((req, res) => {
  const raw = req.body?.shift;
  const shift = raw == null || raw === '' ? null : String(raw).trim().slice(0, 30);
  if (shift && !officeConfig().shifts.includes(shift)) return fail(res, 400, 'Ese turno no existe');
  db.prepare('UPDATE users SET shift = ?, shift_at = ? WHERE id = ?').run(shift, shift ? now() : null, req.user.id);
  openShift(req.user.id, shift);
  broadcastUser(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id), req.user) });
}));

api.put('/me/photo', wrap((req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl)) return fail(res, 400, 'Imagen inválida');
  if (dataUrl.length > 700_000) return fail(res, 413, 'La imagen es muy grande');
  db.prepare('UPDATE users SET photo = ?, photo_v = photo_v + 1 WHERE id = ?').run(dataUrl, req.user.id);
  broadcastUser(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id), req.user) });
}));

api.put('/me/pet-photo', wrap((req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl)) return fail(res, 400, 'Imagen inválida');
  if (dataUrl.length > 700_000) return fail(res, 413, 'La imagen es muy grande');
  db.prepare('UPDATE users SET pet_photo = ?, pet_photo_v = pet_photo_v + 1 WHERE id = ?').run(dataUrl, req.user.id);
  broadcastUser(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id), req.user) });
}));

api.delete('/me/pet-photo', (req, res) => {
  db.prepare('UPDATE users SET pet_photo = NULL, pet_photo_v = pet_photo_v + 1 WHERE id = ?').run(req.user.id);
  broadcastUser(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id), req.user) });
});

api.delete('/me/photo', (req, res) => {
  db.prepare('UPDATE users SET photo = NULL, photo_v = photo_v + 1 WHERE id = ?').run(req.user.id);
  broadcastUser(req.user.id);
  res.json({ user: publicUser(getUser(req.user.id), req.user) });
});

api.put('/me/prefs', (req, res) => {
  const prefs = req.body && typeof req.body === 'object' ? req.body : {};
  const s = JSON.stringify(prefs);
  if (s.length > 20_000) return fail(res, 413, 'Preferencias demasiado grandes');
  db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(s, req.user.id);
  res.json({ prefs });
});

api.post('/me/password', perUser('password', 8, 15 * 60e3, 'Demasiados intentos. Espera unos minutos.'), wrap((req, res) => {
  const { current, password } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) return fail(res, 400, 'La contraseña actual no es correcta');
  if (!password || String(password).length < 8) return fail(res, 400, 'La nueva contraseña debe tener al menos 8 caracteres');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.token);
  res.json({ ok: true });
}));

registerFileRoutes(api, { fail });

// ---------- Comentarios del equipo (ideas y fallas) ----------
const FEEDBACK_KINDS = { idea: '💡 Idea', bug: '🐞 Algo no funciona', other: '💬 Comentario' };
const feedbackRow = (r) => ({
  id: r.id, userId: r.user_id, kind: r.kind, text: r.text, status: r.status, createdAt: r.created_at,
  meta: parseJSON(r.meta, {}), file: r.file_id ? { id: r.file_id, url: `/api/files/${r.file_id}/captura.jpg` } : null,
});

api.post('/feedback', wrap((req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 3000);
  if (!text) return fail(res, 400, 'Cuéntanos qué pasó o qué se te ocurre');
  const kind = FEEDBACK_KINDS[req.body?.kind] ? req.body.kind : 'other';
  const recent = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at > ?').get(req.user.id, now() - 3600e3).n;
  if (recent >= 20) return fail(res, 429, 'Ya enviaste muchos comentarios en esta hora');
  const file = req.body?.fileId ? getFiles([req.body.fileId], req.user.id)[0] : null;
  const m = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
  const meta = {
    ua: String(req.headers['user-agent'] || '').slice(0, 300),
    screen: String(m.screen || '').slice(0, 40), view: String(m.view || '').slice(0, 30),
    where: String(m.where || '').slice(0, 80), media: String(m.media || '').slice(0, 20), url: String(m.url || '').slice(0, 200),
  };
  const id = Number(db.prepare('INSERT INTO feedback (user_id, kind, text, file_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, kind, text, file?.id || null, JSON.stringify(meta), now()).lastInsertRowid);
  alert(`${FEEDBACK_KINDS[kind]} de ${req.user.display_name}`, `${text}\n\n${meta.view} · ${meta.where} · ${meta.screen}\n${meta.ua}`, { level: kind === 'bug' ? 'warn' : 'info', key: `feedback:${id}` });
  emitAll('feedback', { id });
  res.json({ ok: true, id });
}));

// ---------- Verificación en dos pasos ----------
api.post('/me/2fa/setup', wrap((req, res) => {
  if (req.user.totp_enabled) return fail(res, 400, 'Ya tienes activada la verificación en dos pasos');
  const secret = sec.newTotpSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_last = -1 WHERE id = ?').run(secret, req.user.id);
  res.json({ secret, otpauth: sec.otpauthUrl(secret, req.user.username, officeConfig().officeName) });
}));

api.post('/me/2fa/enable', perUser('2fa-en', 10, 15 * 60e3, 'Demasiados intentos. Espera unos minutos.'), wrap((req, res) => {
  const u = getUser(req.user.id);
  if (u.totp_enabled) return fail(res, 400, 'Ya está activada');
  if (!u.totp_secret) return fail(res, 400, 'Primero genera el código QR');
  const step = sec.checkTotp(u.totp_secret, req.body?.code, u.totp_last);
  if (step == null) return fail(res, 400, 'El código no coincide. Revisa la hora de tu teléfono e inténtalo de nuevo.');
  const { codes, hashes } = sec.newRecoveryCodes();
  db.prepare('UPDATE users SET totp_enabled = 1, totp_last = ?, totp_recovery = ? WHERE id = ?').run(step, JSON.stringify(hashes), u.id);
  broadcastUser(u.id);
  res.json({ recoveryCodes: codes });
}));

api.post('/me/2fa/disable', perUser('2fa', 8, 15 * 60e3, 'Demasiados intentos. Espera unos minutos.'), wrap((req, res) => {
  const u = getUser(req.user.id);
  if (!u.totp_enabled) return fail(res, 400, 'No está activada');
  if (!verifyPassword(String(req.body?.password || ''), u.password_hash)) return fail(res, 400, 'La contraseña no es correcta');
  if (u.role === 'admin' && sec.requireAdmin2fa()) return fail(res, 400, 'La oficina exige la verificación en dos pasos a los administradores');
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_recovery = NULL, totp_last = -1 WHERE id = ?').run(u.id);
  broadcastUser(u.id);
  res.json({ ok: true });
}));

api.post('/me/2fa/recovery', perUser('2fa-rec', 8, 15 * 60e3, 'Demasiados intentos. Espera unos minutos.'), wrap((req, res) => {
  const u = getUser(req.user.id);
  if (!u.totp_enabled) return fail(res, 400, 'No está activada');
  if (!verifyPassword(String(req.body?.password || ''), u.password_hash)) return fail(res, 400, 'La contraseña no es correcta');
  const { codes, hashes } = sec.newRecoveryCodes();
  db.prepare('UPDATE users SET totp_recovery = ? WHERE id = ?').run(JSON.stringify(hashes), u.id);
  sec.audit({ actor: u.id, action: 'Generó códigos de respaldo nuevos', ip: req.ip });
  res.json({ recoveryCodes: codes });
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
  if (b.requireAdmin2fa !== undefined) {
    if (b.requireAdmin2fa && !req.user.totp_enabled) return fail(res, 400, 'Activa primero tu propia verificación en dos pasos');
    setSetting('require_admin_2fa', b.requireAdmin2fa ? '1' : '0');
  }
  if (b.season !== undefined) {
    if (!SEASON_SETTINGS.includes(b.season)) return fail(res, 400, 'Temporada inválida');
    setSetting('season', b.season);
  }
  if (b.aiNotes !== undefined) {
    setSetting('ai_notes', b.aiNotes ? '1' : '0');
    if (!b.aiNotes) stopAllNotes();
  }
  if (b.anniversaryDate !== undefined) {
    if (b.anniversaryDate && !validMD(b.anniversaryDate)) return fail(res, 400, 'Fecha de aniversario inválida (MM-DD)');
    setSetting('anniversary_date', b.anniversaryDate || null);
  }
  if (b.anniversaryYear !== undefined) {
    const y = Number(b.anniversaryYear) || null;
    if (y && (y < 1990 || y > new Date().getFullYear())) return fail(res, 400, 'Año de fundación inválido');
    setSetting('anniversary_year', y);
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

// Actualizar global: todos los que estén conectados recargan la app (para publicar cambios al instante)
let lastReload = 0;
admin.post('/reload-all', (req, res) => {
  if (Date.now() - lastReload < 30e3) return fail(res, 429, 'Espera unos segundos antes de volver a actualizar a todos.');
  lastReload = Date.now();
  const message = String(req.body?.message || '').trim().slice(0, 140);
  emitAll('force-reload', { by: req.user.display_name, message, in: 8 });
  res.json({ ok: true, online: presence.size });
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
  res.json({ user: publicUser(getUser(id), req.user) });
}));

admin.post('/users/:id/reset-2fa', wrap((req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) return fail(res, 404, 'Usuario no encontrado');
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_recovery = NULL, totp_last = -1 WHERE id = ?').run(id);
  broadcastUser(id);
  res.json({ ok: true });
}));

admin.get('/audit', (req, res) => {
  res.json({ entries: sec.auditList({ limit: req.query.limit, before: req.query.before ? Number(req.query.before) : null, q: String(req.query.q || '').slice(0, 60) }) });
});

admin.post('/users/:id/reset-password', wrap((req, res) => {
  const id = Number(req.params.id);
  if (!getUser(id)) return fail(res, 404, 'Usuario no encontrado');
  const password = randomToken(9);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  destroyUserSessions(id);
  disconnectUser(id);
  res.json({ password });
}));

// Estado de los respaldos (último respaldo local y copia fuera del servidor)
admin.get('/backups/status', (req, res) => res.json(backupStatus()));

// Reporte de turnos: horas por persona y turno en un rango de fechas
admin.get('/shifts/report', (req, res) => {
  const to = Number(req.query.to) || now();
  const from = Number(req.query.from) || to - 7 * 864e5;
  if (to <= from || to - from > 400 * 864e5) return fail(res, 400, 'Rango de fechas inválido');
  res.json({ from, to, rows: shiftReport(from, to) });
});

admin.get('/feedback', (req, res) => {
  const st = String(req.query.status || '');
  const rows = st ? db.prepare('SELECT * FROM feedback WHERE status = ? ORDER BY id DESC LIMIT 200').all(st) : db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 200').all();
  res.json({ feedback: rows.map(feedbackRow), counts: Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM feedback GROUP BY status').all().map((r) => [r.status, r.n])) });
});

admin.patch('/feedback/:id', (req, res) => {
  const status = ['nuevo', 'visto', 'resuelto'].includes(req.body?.status) ? req.body.status : null;
  if (!status) return fail(res, 400, 'Estado inválido');
  db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.json({ ok: true });
});

registerStatsRoutes(admin);
mod.registerModerationRoutes(api, admin, {
  fail, wrap, perUser, emitToUser, disconnectUser, destroyUserSessions, alert, onMute: voice.onMute,
  emitToAdmins: (ev, payload) => getIO()?.to('role:admin').emit(ev, payload),
});
api.use('/admin', admin);
registerAchievementRoutes(api);

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

function reactionsOf(messageId) {
  const map = new Map();
  for (const x of db.prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ? ORDER BY rowid').all(messageId)) {
    if (!map.has(x.emoji)) map.set(x.emoji, []);
    map.get(x.emoji).push(x.user_id);
  }
  return [...map].map(([emoji, users]) => ({ emoji, users }));
}

const messageRow = (r) => ({
  id: r.id, userId: r.user_id, kind: r.kind, body: r.body, createdAt: r.created_at,
  conv: r.channel_id ? `c:${r.channel_id}` : null, dm: r.dm_key,
  attachments: r.attachments ? parseJSON(r.attachments, []) : [],
  reactions: reactionsOf(r.id),
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
    if (mod.hasBlocked(uid, otherId)) return null;
    const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE dm_key = ? AND id > ? AND user_id != ?').get(r.dm_key, lastRead(uid, key), uid).n;
    return { conv: `d:${otherId}`, userId: otherId, lastId: r.last_id, unread };
  }).filter(Boolean);
  res.json({ channels, dms });
});

api.get('/messages', (req, res) => {
  const c = parseConv(req.query.conv, req.user.id);
  if (!c) return fail(res, 400, 'Conversación inválida');
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = c.channelId
    ? db.prepare('SELECT * FROM messages WHERE channel_id = ? AND id < ? ORDER BY id DESC LIMIT 60').all(c.channelId, before)
    : db.prepare('SELECT * FROM messages WHERE dm_key = ? AND id < ? ORDER BY id DESC LIMIT 60').all(c.dm, before);
  // Mensajes de personas que bloqueaste: no se muestran
  const blocked = mod.blocksOf(req.user.id);
  res.json({ messages: rows.reverse().filter((r) => !blocked.has(r.user_id)).map(messageRow), hasMore: rows.length === 60 });
});

export function postMessage(user, c, body, kind = 'text', attachments = []) {
  const id = Number(db.prepare('INSERT INTO messages (channel_id, dm_key, user_id, kind, body, created_at, attachments) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(c.channelId ?? null, c.dm ?? null, user.id, kind, body, now(), attachments.length ? JSON.stringify(attachments) : null).lastInsertRowid);
  const msg = messageRow(db.prepare('SELECT * FROM messages WHERE id = ?').get(id));
  if (c.channelId) {
    emitAll('message', msg);
    // Menciones
    // Máximo 15 menciones distintas por mensaje (cada una es una notificación y un push)
    const names = new Set([...body.matchAll(/@([a-zA-Z0-9_.-]{3,24})/g)].map((m) => m[1].toLowerCase()).slice(0, 15));
    for (const n of names) {
      const target = db.prepare('SELECT id FROM users WHERE username = ?').get(n);
      if (target && target.id !== user.id) notify(target.id, 'mention', user.id, { conv: c.key, messageId: id, preview: body.slice(0, 140) });
    }
  } else {
    emitToUser(user.id, 'message', msg);
    // Si te bloqueó, el mensaje se guarda pero no le llega (ni aviso ni push)
    if (!mod.hasBlocked(c.otherId, user.id)) emitToUser(c.otherId, 'message', msg);
  }
  if (!c.otherId || !mod.hasBlocked(c.otherId, user.id)) pushMessage(user, msg, { channelId: c.channelId, otherId: c.otherId });
  db.prepare('INSERT INTO reads (user_id, conv, last_read_id) VALUES (?, ?, ?) ON CONFLICT(user_id, conv) DO UPDATE SET last_read_id = excluded.last_read_id')
    .run(user.id, c.key, id);
  return msg;
}

api.post('/messages', perUser('messages', 12, 10e3, 'Vas muy rápido: espera unos segundos antes de seguir escribiendo.'), wrap((req, res) => {
  if (mod.isMuted(req.user.id)) return fail(res, 403, `🔇 Estás silenciado ${mod.fmtUntil(mod.muteOf(req.user.id).until)}.`);
  const c = parseConv(req.body?.conv, req.user.id);
  if (!c) return fail(res, 400, 'Conversación inválida');
  const body = String(req.body?.body || '').trim();
  const attachments = Array.isArray(req.body?.files) ? getFiles(req.body.files, req.user.id) : [];
  if (!body && !attachments.length) return fail(res, 400, 'Mensaje vacío');
  if (body.length > 4000) return fail(res, 400, 'Mensaje demasiado largo');
  res.json({ message: postMessage(req.user, c, body, 'text', attachments) });
}));

// Reacciones con emoji: tocar la misma quita la tuya
api.post('/messages/:id/react', perUser('react', 30, 10e3), wrap((req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.id));
  if (!m) return fail(res, 404, 'Mensaje no encontrado');
  const uid = req.user.id;
  if (m.dm_key && !m.dm_key.split(':').map(Number).includes(uid)) return fail(res, 403, 'No puedes ver ese mensaje');
  const emoji = String(req.body?.emoji || '').trim();
  if (!emoji || emoji.length > 16 || /[\s<>]/.test(emoji)) return fail(res, 400, 'Emoji inválido');
  const had = db.prepare('SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(m.id, uid, emoji);
  if (had) db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(m.id, uid, emoji);
  else {
    if (db.prepare('SELECT COUNT(DISTINCT emoji) AS n FROM message_reactions WHERE message_id = ?').get(m.id).n >= 20) return fail(res, 400, 'Demasiadas reacciones');
    db.prepare('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(m.id, uid, emoji);
  }
  const payload = { id: m.id, reactions: reactionsOf(m.id) };
  if (m.channel_id) emitAll('reaction', payload);
  else for (const id of m.dm_key.split(':').map(Number)) emitToUser(id, 'reaction', payload);
  res.json(payload);
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
const lastWave = new Map();
api.post('/wave/:userId', wrap((req, res) => {
  const c = parseConv(`d:${req.params.userId}`, req.user.id);
  if (!c) return fail(res, 400, 'Usuario inválido');
  const wk = `${req.user.id}:${c.otherId}`;
  if (Date.now() - (lastWave.get(wk) || 0) < 10e3) return fail(res, 429, 'Ya la saludaste, espera unos segundos');
  lastWave.set(wk, Date.now());
  if (mod.hasBlocked(c.otherId, req.user.id)) return res.json({ ok: true });
  postMessage(req.user, c, 'wave', 'wave');
  notify(c.otherId, 'wave', req.user.id, {});
  res.json({ ok: true });
}));

// Llamar a alguien: le suena una alerta para que venga contigo (o te conteste)
const lastCall = new Map();
api.post('/call/:userId', wrap((req, res) => {
  const to = Number(req.params.userId);
  if (!to || to === req.user.id || !getUser(to)) return fail(res, 400, 'Usuario inválido');
  const key = `${req.user.id}:${to}`;
  if (Date.now() - (lastCall.get(key) || 0) < 15e3) return fail(res, 429, 'Espera unos segundos antes de volver a llamar');
  lastCall.set(key, Date.now());
  notify(to, 'call', req.user.id, {}); // si te bloqueó, notify() no le avisa
  res.json({ ok: true, online: presence.has(to) });
}));
api.post('/call/:userId/answer', perUser('answer', 20, 60e3), wrap((req, res) => {
  const to = Number(req.params.userId);
  if (mod.eitherBlocked(to, req.user.id)) return res.json({ ok: true });
  // Llamada aceptada: la pareja puede conectarse aunque esté lejos (solo si de verdad te llamaron hace poco)
  if (req.body?.accept && Date.now() - (lastCall.get(`${to}:${req.user.id}`) || 0) < 60e3) voice.markCall(to, req.user.id);
  emitToUser(to, 'call:answer', { from: req.user.id, accept: !!req.body?.accept });
  res.json({ ok: true });
}));

// ---------- Notificaciones ----------
registerPushRoutes(api); // /push/key, /push/subscribe, /push/unsubscribe, /push/test
registerSantaRoutes(api, { fail, notify, requireAdmin, wrap }); // /santa… (amigo secreto)
registerHotelRoutes(api, { fail, wrap, notify }); // /hotel… (salas isométricas)
registerThemeRoutes(api, { fail }); // /themes y /me/theme (tema de cada persona)
registerBadgeRoutes(api, { fail, notify, requireAdmin, wrap }); // /badges… y /admin/badges… (placas)

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
  const attendees = Array.isArray(b?.attendees) ? [...new Set(b.attendees.slice(0, 300).map(Number).filter((id) => Number.isInteger(id) && getUser(id)))] : [];
  return {
    title, startsAt, endsAt, attendees,
    description: String(b?.description || '').slice(0, 2000),
    location: String(b?.location || '').slice(0, 120),
    areaId: b?.areaId && db.prepare('SELECT 1 FROM areas WHERE id = ?').get(Number(b.areaId)) ? Number(b.areaId) : null,
  };
}

api.post('/events', perUser('events', 20, 3600e3, 'Creaste muchos eventos en esta hora. Espera un poco.'), wrap((req, res) => {
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

api.patch('/events/:id', perUser('events-edit', 60, 3600e3), wrap((req, res) => {
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

api.post('/notices', perUser('notices', 5, 10 * 60e3, 'Publicaste varios anuncios seguidos. Espera unos minutos.'), wrap((req, res) => {
  if (mod.isMuted(req.user.id)) return fail(res, 403, '🔇 Estás silenciado: no puedes publicar anuncios por ahora.');
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
api.get('/floors', (req, res) => res.json({ floors: world.listFloors(req.user) }));

api.get('/floors/:id', (req, res) => {
  if (!visibleFloor(req, res, Number(req.params.id))) return;
  const p = world.floorPayload(Number(req.params.id));
  if (!p) return fail(res, 404, 'Piso no encontrado');
  res.json({ floor: p });
});

api.post('/floors', requireAdmin, wrap((req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40) || `Piso ${world.listFloors().length + 1}`;
  const f = world.createFloor(name, req.body?.template || 'open', { adminOnly: !!req.body?.adminOnly });
  emitFloors();
  res.json({ floor: world.floorPayload(f.id) });
}));

api.patch('/floors/:id', requireAdmin, wrap((req, res) => {
  const id = Number(req.params.id);
  const hasName = req.body?.name !== undefined;
  const name = String(req.body?.name || '').trim().slice(0, 40);
  if (hasName && !name) return fail(res, 400, 'Nombre inválido');
  if (!hasName && req.body?.adminOnly === undefined) return fail(res, 400, 'Nada que cambiar');
  if (!world.getFloor(id)) return fail(res, 404, 'Piso no encontrado');
  // Solo admins: el piso se archiva y quien no es admin sale a la entrada del piso principal
  if (req.body?.adminOnly !== undefined) {
    world.setFloorAdminOnly(id, !!req.body.adminOnly);
    if (req.body.adminOnly) evictNonAdmins(id);
  }
  if (hasName) world.renameFloor(id, name);
  emitFloors();
  res.json({ ok: true });
}));

// Renovar el mapa del piso con la plantilla más nueva (conserva escritorios reclamados)
api.post('/floors/:id/reset-layout', requireAdmin, wrap((req, res) => {
  const id = Number(req.params.id);
  const r = world.resetFloorLayout(id);
  for (const [uid, p] of presence) if (p.floorId === id) relocate(uid, id, p.x, p.y);
  broadcastFloor(id);
  res.json({ ok: true, kept: r.kept, moved: r.moved });
}));

api.delete('/floors/:id', requireAdmin, wrap((req, res) => {
  const id = Number(req.params.id);
  world.deleteFloor(id);
  const fallback = world.defaultFloorId();
  for (const [uid, p] of presence) if (p.floorId === id) relocate(uid, fallback);
  db.prepare('UPDATE users SET floor_id = NULL, pos_x = NULL, pos_y = NULL WHERE floor_id = ?').run(id);
  emitFloors();
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
  if (!visibleFloor(req, res, floorId)) return;
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
  const changed = world.claimDesk(req.user.id, Number(req.params.id), req.user);
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
  alert(`Error 500 en ${req.method} ${req.path}`, err?.stack || String(err), { key: `500:${req.path}:${err?.message}` });
  fail(res, 500, 'Error interno del servidor');
});
