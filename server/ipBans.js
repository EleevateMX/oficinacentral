// Baneo por IP. Nunca se guarda la IP tal cual: solo un hash con sal (IP_HASH_SALT o una sal
// aleatoria guardada en la base) y, para que el admin se ubique, los dos primeros bloques
// (p. ej. "189.203.*.*"). También se anota qué hashes usa cada persona para ver IPs compartidas.
// La IP del cliente se calcula igual que en server/ratelimit.js (TRUST_PROXY / TRUST_CF).
import crypto from 'node:crypto';
import { db, now, getSetting, setSetting } from './db.js';
import { clientIp } from './ratelimit.js';

db.exec(`
CREATE TABLE IF NOT EXISTS ip_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  masked TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  until INTEGER,
  note TEXT NOT NULL DEFAULT '',
  by_id INTEGER,
  created_at INTEGER NOT NULL,
  lifted_at INTEGER,
  lifted_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ip_bans_hash ON ip_bans(ip_hash, lifted_at);
CREATE TABLE IF NOT EXISTS user_ips (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  masked TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (user_id, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_user_ips_hash ON user_ips(ip_hash);
`);

function salt() {
  if (process.env.IP_HASH_SALT) return process.env.IP_HASH_SALT;
  let s = getSetting('ip_hash_salt');
  if (!s) { s = crypto.randomBytes(24).toString('base64url'); setSetting('ip_hash_salt', s); }
  return s;
}

const normIp = (ip) => String(ip || '').trim().replace(/^::ffff:/, '').toLowerCase();
export const hashIp = (ip) => crypto.createHash('sha256').update(`${salt()}|${normIp(ip)}`).digest('hex').slice(0, 32);

// "189.203.*.*" / "2806:10a6:…" — nunca la IP completa
export function maskIp(ip) {
  const s = normIp(ip);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.split('.').slice(0, 2).join('.') + '.*.*';
  if (s.includes(':')) return s.split(':').slice(0, 2).join(':') + ':…';
  return '';
}

export const reqIp = (req) => clientIp(req.headers, req.socket?.remoteAddress || req.ip || '');

// ---------- Baneos activos (en memoria; se recarga al cambiar) ----------
let active = null; // hash -> fila
function load() {
  if (active) return active;
  active = new Map();
  for (const r of db.prepare('SELECT * FROM ip_bans WHERE lifted_at IS NULL AND (until IS NULL OR until > ?)').all(now())) active.set(r.ip_hash, r);
  return active;
}
const reset = () => { active = null; };

export function ipBanOfHash(hash) {
  const r = load().get(hash);
  if (!r) return null;
  if (r.until != null && r.until <= now()) { active.delete(hash); return null; }
  return r;
}
export const ipBanOf = (ip) => (ip ? ipBanOfHash(hashIp(ip)) : null);
export const isIpBanned = (ip) => !!ipBanOf(ip);

// Anota la IP de una persona (al conectarse)
const seen = new Map(); // `${uid}:${hash}` -> última escritura (para no escribir en cada pestaña)
export function recordUserIp(uid, ip) {
  if (!uid || !ip) return;
  const h = hashIp(ip), k = `${uid}:${h}`, t = now();
  if (t - (seen.get(k) || 0) < 10 * 60e3) return;
  seen.set(k, t);
  try {
    db.prepare(`INSERT INTO user_ips (user_id, ip_hash, masked, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, ip_hash) DO UPDATE SET last_seen = excluded.last_seen, masked = excluded.masked`).run(uid, h, maskIp(ip), t, t);
  } catch { /* persona borrada */ }
}

// IPs (en hash) de una persona, con con quién las comparte
export function userIps(uid) {
  return db.prepare('SELECT * FROM user_ips WHERE user_id = ? ORDER BY last_seen DESC LIMIT 20').all(Number(uid)).map((r) => ({
    hash: r.ip_hash.slice(0, 10), masked: r.masked, firstSeen: r.first_seen, lastSeen: r.last_seen,
    shared: db.prepare('SELECT user_id FROM user_ips WHERE ip_hash = ? AND user_id != ?').all(r.ip_hash, Number(uid)).map((x) => x.user_id),
    banned: !!ipBanOfHash(r.ip_hash),
  }));
}
// Cuántas personas comparten alguna IP con esta (para mostrar en la tarjeta)
export function sharedIpCount(uid) {
  return db.prepare(`SELECT COUNT(DISTINCT b.user_id) AS n FROM user_ips a JOIN user_ips b ON a.ip_hash = b.ip_hash AND b.user_id != a.user_id WHERE a.user_id = ?`).get(Number(uid)).n;
}

// Banea las IPs recientes de una persona (las de los últimos 7 días, máximo 3)
export function banUserIps(uid, { minutes = null, note = '', by = null } = {}) {
  const rows = db.prepare('SELECT * FROM user_ips WHERE user_id = ? AND last_seen > ? ORDER BY last_seen DESC LIMIT 3').all(Number(uid), now() - 7 * 864e5);
  const until = minutes == null ? null : now() + Math.round(minutes * 60e3);
  const ids = [];
  for (const r of rows) {
    db.prepare('UPDATE ip_bans SET lifted_at = ?, lifted_by = ? WHERE ip_hash = ? AND lifted_at IS NULL').run(now(), by, r.ip_hash);
    ids.push(Number(db.prepare('INSERT INTO ip_bans (ip_hash, masked, user_id, until, note, by_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(r.ip_hash, r.masked, Number(uid), until, String(note || '').slice(0, 200), by, now()).lastInsertRowid));
  }
  reset();
  return ids;
}

export function liftIpBan(id, by = null) {
  const r = db.prepare('UPDATE ip_bans SET lifted_at = ?, lifted_by = ? WHERE id = ? AND lifted_at IS NULL').run(now(), by, Number(id));
  reset();
  return r.changes > 0;
}
export function liftUserIpBans(uid, by = null) {
  const r = db.prepare('UPDATE ip_bans SET lifted_at = ?, lifted_by = ? WHERE user_id = ? AND lifted_at IS NULL').run(now(), by, Number(uid));
  reset();
  return r.changes;
}

export function ipBanList() {
  return db.prepare('SELECT * FROM ip_bans WHERE lifted_at IS NULL AND (until IS NULL OR until > ?) ORDER BY id DESC LIMIT 300').all(now()).map((r) => ({
    id: r.id, hash: r.ip_hash.slice(0, 10), masked: r.masked, userId: r.user_id, until: r.until, permanent: r.until == null,
    note: r.note, byId: r.by_id, createdAt: r.created_at,
    users: db.prepare('SELECT user_id FROM user_ips WHERE ip_hash = ?').all(r.ip_hash).map((x) => x.user_id),
  }));
}

export const IP_BAN_MESSAGE = 'Tu conexión está bloqueada por un administrador. Si crees que es un error, habla con el equipo en Discord.';

// Middleware: entrar, registrarse, aceptar invitación o entrar con Discord desde una IP baneada
const GATED = /^\/(auth\/login|auth\/2fa|auth\/discord(\/.*)?|invites\/[^/]+\/accept)$/;
export function ipBanGate(req, res, next) {
  if (!GATED.test(req.path)) return next();
  if (!isIpBanned(reqIp(req))) return next();
  // Un admin no se queda fuera por compartir red con alguien bloqueado (su contraseña igual se revisa)
  if (req.path === '/auth/login' && typeof req.body?.username === 'string') {
    const u = db.prepare("SELECT role FROM users WHERE username = ? AND disabled = 0").get(req.body.username.trim());
    if (u?.role === 'admin') return next();
  }
  if (req.method === 'GET') return res.redirect('/?discord=ipbanned');
  return res.status(403).json({ error: IP_BAN_MESSAGE, code: 'ip-banned' });
}

export const _ipBans = { reset };
