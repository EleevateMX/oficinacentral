import crypto from 'node:crypto';
import { db, now } from './db.js';

const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'oc_sid';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split(':');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function createSession(userId) {
  const token = randomToken();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, now() + SESSION_DAYS * 864e5);
  return token;
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function destroyUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.disabled = 0`).get(token, now());
  return row || null;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1' ? '; Secure' : '';
  const maxAge = clear ? 0 : SESSION_DAYS * 86400;
  return `${SESSION_COOKIE}=${clear ? '' : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Límite simple de intentos de login por IP
const attempts = new Map();
export function loginRateLimited(ip) {
  const t = now();
  const a = attempts.get(ip) || { count: 0, reset: t + 15 * 60e3 };
  if (t > a.reset) { a.count = 0; a.reset = t + 15 * 60e3; }
  a.count++;
  attempts.set(ip, a);
  return a.count > 20;
}
export function clearLoginAttempts(ip) {
  attempts.delete(ip);
}

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

export function validateNewAccount({ username, password, displayName }) {
  if (!USERNAME_RE.test(username || '')) return 'El usuario debe tener 3–24 caracteres (letras, números, punto, guion o guion bajo).';
  if (!password || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!displayName || !displayName.trim() || displayName.trim().length > 40) return 'El nombre debe tener entre 1 y 40 caracteres.';
  return null;
}

const PALETTE = ['#e63946', '#f4a261', '#2a9d8f', '#3a86ff', '#8338ec', '#ff006e', '#06d6a0', '#118ab2', '#ef476f', '#ffd166'];
export function defaultAvatar(seed = '') {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  const hairs = ['#2c1b10', '#5a3825', '#a0522d', '#e6c07b', '#111111', '#7b3fbf'];
  return {
    skin: skins[h % skins.length],
    hair: hairs[(h >> 3) % hairs.length],
    hairStyle: ['short', 'long', 'spiky', 'bun', 'bald'][(h >> 5) % 4],
    shirt: PALETTE[(h >> 7) % PALETTE.length],
    pants: ['#2b2d42', '#3d405b', '#1d3557', '#6b705c'][(h >> 9) % 4],
    accessory: 'none',
  };
}
