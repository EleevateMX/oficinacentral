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
