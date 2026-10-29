// Seguridad: verificación en dos pasos (TOTP, como Google Authenticator) y
// registro de actividad de administración.
import crypto from 'node:crypto';
import { db, now, getSetting } from './db.js';

// ---------- TOTP (RFC 6238) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totp(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = (h.readUInt32BE(off) & 0x7fffffff) % 1e6;
  return String(code).padStart(6, '0');
}

export const currentStep = (t = Date.now()) => Math.floor(t / 30000);

// Devuelve el paso usado si el código es válido (±1 paso de tolerancia), si no null
export function checkTotp(secret, code, lastStep = -1, t = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const s = currentStep(t);
  for (const d of [0, -1, 1]) {
    const step = s + d;
    if (step <= lastStep) continue; // no reutilizar un código
    const expected = totp(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return step;
  }
  return null;
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function otpauthUrl(secret, account, issuer) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const hashCode = (c) => crypto.createHash('sha256').update(String(c).replace(/[\s-]/g, '').toLowerCase()).digest('hex');

export function newRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashCode) };
}

// Usa un código de respaldo (cada uno sirve una vez). Devuelve la lista restante o null.
export function useRecoveryCode(hashesJson, code) {
  let list = [];
  try { list = JSON.parse(hashesJson || '[]'); } catch { list = []; }
  const h = hashCode(code);
  const i = list.indexOf(h);
  if (i < 0) return null;
  list.splice(i, 1);
  return list;
}

export const requireAdmin2fa = () => getSetting('require_admin_2fa') === '1';

// Tickets de inicio de sesión pendientes del segundo paso
const tickets = new Map();
export function newLoginTicket(userId) {
  const t = crypto.randomBytes(24).toString('base64url');
  tickets.set(t, { userId, exp: Date.now() + 5 * 60e3, tries: 0 });
  return t;
}
export function readLoginTicket(t) {
  const x = tickets.get(String(t || ''));
  if (!x || x.exp < Date.now() || x.tries >= 5) { tickets.delete(String(t || '')); return null; }
  x.tries++;
  return x;
}
export const dropLoginTicket = (t) => tickets.delete(String(t || ''));

// ---------- Registro de actividad ----------
const SECRET_KEYS = /password|dataUrl|token|code|secret/i;

function clean(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.test(k)) continue;
    out[k] = typeof v === 'object' ? clean(v) : typeof v === 'string' ? v.slice(0, 200) : v;
  }
  return out;
}

export function audit({ actor = null, action, target = '', data = null, ip = '' }) {
  db.prepare('INSERT INTO audit_log (actor_id, action, target, data, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(actor, action, String(target).slice(0, 120), data ? JSON.stringify(clean(data)).slice(0, 2000) : null, String(ip || '').slice(0, 60), now());
}

// Qué peticiones se registran y cómo se describen
const name = (id) => db.prepare('SELECT display_name FROM users WHERE id = ?').get(Number(id))?.display_name || `#${id}`;
const RULES = [
  ['POST', /^\/admin\/invites$/, () => 'Creó una invitación'],
  ['POST', /^\/admin\/invites\/batch$/, (r) => `Invitó en lote a ${r.body?.rows?.length || 0} personas`],
  ['DELETE', /^\/admin\/invites\/[^/]+$/, () => 'Revocó una invitación'],
  ['PATCH', /^\/admin\/users\/(\d+)$/, (r, m) => {
    const b = r.body || {};
    if (b.disabled !== undefined) return `${b.disabled ? 'Desactivó' : 'Reactivó'} la cuenta de ${name(m[1])}`;
    if (b.role) return `Cambió el rol de ${name(m[1])} a ${b.role === 'admin' ? 'admin' : 'miembro'}`;
    return `Editó a ${name(m[1])}`;
  }],
  ['POST', /^\/admin\/users\/(\d+)\/reset-password$/, (r, m) => `Restableció la contraseña de ${name(m[1])}`],
  ['POST', /^\/admin\/users\/(\d+)\/reset-2fa$/, (r, m) => `Quitó la verificación en dos pasos de ${name(m[1])}`],
  ['PATCH', /^\/admin\/office$/, () => 'Cambió la configuración de la oficina'],
  ['PUT', /^\/admin\/office\/logo$/, () => 'Cambió el logo de la oficina'],
  ['DELETE', /^\/admin\/office\/logo$/, () => 'Quitó el logo de la oficina'],
  ['POST', /^\/characters$/, () => 'Subió un personaje'],
  ['DELETE', /^\/characters\/[^/]+$/, () => 'Borró un personaje'],
  ['POST', /^\/floors$/, (r) => `Creó el piso "${r.body?.name || ''}"`],
  ['PATCH', /^\/floors\/\d+$/, (r) => `Renombró un piso a "${r.body?.name || ''}"`],
  ['DELETE', /^\/floors\/\d+$/, () => 'Borró un piso'],
  ['POST', /^\/floors\/\d+\/areas$/, (r) => `Creó el área "${r.body?.name || ''}"`],
  ['PATCH', /^\/areas\/\d+$/, () => 'Editó un área'],
  ['DELETE', /^\/areas\/\d+$/, () => 'Borró un área'],
  ['PUT', /^\/areas\/\d+\/leaders$/, (r) => `Cambió los líderes de un área (${(r.body?.userIds || []).map(name).join(', ') || 'ninguno'})`],
  ['DELETE', /^\/objects\/\d+$/, () => 'Borró un objeto del mapa', { adminOnly: true }],
  ['DELETE', /^\/notices\/\d+$/, () => 'Borró un anuncio', { adminOnly: true }],
  ['PATCH', /^\/notices\/\d+$/, (r) => (r.body?.pinned ? 'Fijó un anuncio' : 'Desfijó un anuncio')],
  ['POST', /^\/me\/2fa\/enable$/, () => 'Activó la verificación en dos pasos'],
  ['POST', /^\/me\/2fa\/disable$/, () => 'Desactivó la verificación en dos pasos'],
  ['POST', /^\/me\/password$/, () => 'Cambió su contraseña'],
];

export function auditMiddleware(req, res, next) {
  if (req.method === 'GET') return next();
  // La ruta se guarda ahora: dentro de un router de Express req.path cambia
  const path = req.path;
  const rule = RULES.find(([m, re]) => m === req.method && re.test(path));
  if (!rule) return next();
  const [, re, describe, opts = {}] = rule;
  const match = path.match(re);
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    if (opts.adminOnly && req.user.role !== 'admin') return;
    try {
      audit({ actor: req.user.id, action: describe(req, match), target: path, data: req.body, ip: req.ip });
    } catch (e) { console.error('auditoría:', e.message); }
  });
  next();
}

export function auditList({ limit = 100, before = null, q = '' } = {}) {
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const rows = db.prepare(`SELECT a.*, u.display_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
    WHERE (? IS NULL OR a.id < ?) AND (? = '' OR a.action LIKE ? OR u.display_name LIKE ?)
    ORDER BY a.id DESC LIMIT ?`).all(before, before, q, `%${q}%`, `%${q}%`, lim);
  return rows.map((r) => ({ id: r.id, actorId: r.actor_id, actorName: r.actor_name, action: r.action, target: r.target, data: r.data ? JSON.parse(r.data) : null, ip: r.ip, createdAt: r.created_at }));
}

// ---------- Inicio de sesión: bloqueo por cuenta y freno global ----------
// Por cuenta: tras varios intentos fallidos se espera cada vez más (hasta 15 min).
// La llave combina cuenta + IP (así un atacante desde otra red no deja fuera a la persona real)
// y además hay un tope alto por cuenta desde cualquier IP (ataques repartidos).
const failures = new Map(); // llave -> { n, until, last }
const ACCOUNT_FREE_TRIES = 5;
const ACCOUNT_GLOBAL_TRIES = 40;
const acct = (username) => String(username || '').trim().toLowerCase().slice(0, 80);
const lockKey = (username, ip) => `${acct(username)}|${ip}`;
const globalKey = (username) => `${acct(username)}|*`;

// Segundos que faltan para poder intentar de nuevo (0 = puede intentar)
export function loginLockedFor(username, ip, t = Date.now()) {
  const a = failures.get(lockKey(username, ip));
  const g = failures.get(globalKey(username));
  const until = Math.max(a?.until || 0, g?.until || 0);
  return until > t ? Math.ceil((until - t) / 1000) : 0;
}
export function recordLoginFailure(username, ip, t = Date.now()) {
  for (const [k, free] of [[lockKey(username, ip), ACCOUNT_FREE_TRIES], [globalKey(username), ACCOUNT_GLOBAL_TRIES]]) {
    const a = failures.get(k) || { n: 0, until: 0, last: t };
    if (t - a.last > 30 * 60e3) a.n = 0; // media hora sin intentos: se olvida
    a.n++;
    a.last = t;
    // 15 s, 30 s, 1 min, 2 min… hasta 15 min
    if (a.n > free) a.until = t + Math.min(15 * 60e3, 2 ** Math.min(16, a.n - free - 1) * 15e3);
    failures.set(k, a);
  }
}
export function clearLoginFailures(username, ip) {
  failures.delete(lockKey(username, ip));
}
// Freno global: scrypt ocupa el proceso unos milisegundos; sin esto, muchas IPs a la vez lo saturan.
const loginBucket = { tokens: null, at: Date.now() };
export function loginCapacityOk(t = Date.now()) {
  const perSec = Number(process.env.LOGIN_PER_SEC) || 10;
  const cap = perSec * 4;
  if (loginBucket.tokens == null) loginBucket.tokens = cap;
  loginBucket.tokens = Math.min(cap, loginBucket.tokens + ((t - loginBucket.at) / 1000) * perSec);
  loginBucket.at = t;
  if (loginBucket.tokens < 1) return false;
  loginBucket.tokens -= 1;
  return true;
}
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of failures) if (t - v.last > 60 * 60e3) failures.delete(k);
}, 10 * 60e3).unref();

// ---------- Encabezados de seguridad ----------
// CSP compatible con la app: YouTube (rocola), LiveKit (medios), Google Fonts y RNNoise (WebAssembly).
function wsOrigins(url) {
  try {
    const u = new URL(url);
    const secure = u.protocol === 'wss:' || u.protocol === 'https:';
    return [`${secure ? 'https' : 'http'}://${u.host}`, `${secure ? 'wss' : 'ws'}://${u.host}`];
  } catch { return []; }
}
export function contentSecurityPolicy(host = '') {
  const lk = process.env.LIVEKIT_URL ? wsOrigins(process.env.LIVEKIT_URL) : [];
  // 'self' ya cubre el WebSocket en navegadores nuevos; Safari viejo necesita el host explícito
  const self = host && /^[a-zA-Z0-9.:[\]-]+$/.test(host) ? [`wss://${host}`, `ws://${host}`] : [];
  const extra = String(process.env.CSP_CONNECT_EXTRA || '').split(/[\s,]+/).filter((s) => /^(https|wss):\/\/[a-zA-Z0-9.*:-]+$/.test(s));
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://i.ytimg.com https://*.ytimg.com https://cdn.discordapp.com",
    "media-src 'self' data: blob:",
    `connect-src 'self' ${[...self, ...lk, ...extra, 'https://www.youtube.com'].join(' ')}`,
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()');
  if (process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
}

// Página principal: la CSP solo importa en documentos HTML. CSP_MODE=report-only|off para depurar.
export function setPageCsp(req, res) {
  const mode = process.env.CSP_MODE || 'enforce';
  if (mode === 'off') return;
  res.setHeader(mode === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', contentSecurityPolicy(req.headers.host));
}

// ---------- Origen de las peticiones (CSRF y secuestro del WebSocket) ----------
// Con cookie de sesión, solo se aceptan escrituras y sockets desde la propia oficina.
export function originAllowed(origin, host) {
  if (!origin) return true; // sin cabecera Origin no es un navegador en otra página (curl, pruebas)
  if (origin === 'null') return false;
  let o;
  try { o = new URL(origin); } catch { return false; }
  if (host && o.host === host) return true;
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(/[\s,]+/).filter(Boolean);
  return extra.includes(`${o.protocol}//${o.host}`);
}
const reqHost = (headers) => (process.env.TRUST_PROXY === '1' && headers['x-forwarded-host'] ? String(headers['x-forwarded-host']).split(',')[0].trim() : headers.host);
export const requestHost = reqHost;

export function checkOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!originAllowed(req.headers.origin, reqHost(req.headers))) return res.status(403).json({ error: 'Origen no permitido' });
  return next();
}
