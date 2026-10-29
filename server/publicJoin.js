// Enlace público para unirse al HUB (siempre con Discord). Apagado por defecto.
// Quien abre /unete/<clave> ve una portada con un solo botón "Entrar con Discord"; si no tiene cuenta,
// se crea una de miembro con su nombre de Discord (limpio). No hay registro con contraseña por aquí.
// Frenos: clave secreta que se puede regenerar, solo miembros del servidor de Discord (opcional),
// antigüedad mínima de la cuenta de Discord, IP bloqueada, tope por IP y tope global por hora,
// pausa de emergencia y cola de aprobación opcional (la cuenta queda en espera hasta que un admin la aprueba).
import crypto from 'node:crypto';
import { db, now, tx, getSetting, setSetting } from './db.js';
import { createSession, sessionCookie, hashPassword, defaultAvatar, randomToken, parseCookies } from './auth.js';
import { audit } from './security.js';
import { hubEmit } from './hubEvents.js';
import { cleanDisplayText, impersonates } from './moderation.js';
import { isIpBanned, hashIp, reqIp } from './ipBans.js';
import { botEnabled, fetchMember, guildInfo } from './discordBot.js';

db.exec(`
CREATE TABLE IF NOT EXISTS public_joins (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  ticket TEXT,
  created_at INTEGER NOT NULL,
  decided_by INTEGER,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_public_joins_time ON public_joins(created_at);
`);
// Un HUB por Discord: el id de Discord no se repite (si ya hubiera duplicados viejos, no se fuerza)
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_unique ON users(discord_id) WHERE discord_id IS NOT NULL'); } catch { /* datos viejos duplicados */ }

const PENDING_COOKIE = 'oc_jpend';
const DISCORD_EPOCH = 1420070400000;
const HOUR = 3600e3;
const newSlug = () => crypto.randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10).padEnd(10, '7');
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

const DEFAULTS = () => ({
  enabled: false,
  slug: newSlug(),
  allowBare: false, // /unete sin clave
  requireGuild: null, // null = sí, si el bot está configurado
  minAgeDays: 7,
  perIpHour: 3,
  globalHour: 30,
  paused: false,
  approval: false,
});

export function joinConfig() {
  let c = null;
  try { c = JSON.parse(getSetting('public_join') || 'null'); } catch { c = null; }
  if (!c) { c = DEFAULTS(); setSetting('public_join', JSON.stringify(c)); }
  return { ...DEFAULTS(), ...c };
}
const save = (c) => setSetting('public_join', JSON.stringify(c));
export const guildGateOn = (c = joinConfig()) => botEnabled() && (c.requireGuild ?? true);
const oauthOn = () => !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

// Fecha de creación de una cuenta de Discord (va dentro del id)
export function discordCreatedAt(id) {
  if (!/^\d{15,20}$/.test(String(id))) return null;
  return Number(BigInt(String(id)) >> 22n) + DISCORD_EPOCH;
}

// ¿La clave abre la portada? Devuelve null si sí, o el motivo
export function slugProblem(slug, c = joinConfig()) {
  if (!c.enabled) return 'off';
  const s = String(slug || '').toLowerCase();
  if (!s) return c.allowBare ? null : 'slug';
  return s === c.slug ? null : 'slug';
}

// ---------- Cuentas ----------
function displayFrom(profile) {
  for (const cand of [profile.global_name, profile.username]) {
    const n = cleanDisplayText(cand, 40);
    if (n.length >= 2 && !impersonates(n)) return n;
  }
  return 'Miembro nuevo';
}
function usernameFrom(profile, freeUsername) {
  const base = impersonates(profile.username || '') ? 'miembro' : profile.username;
  return freeUsername(base || 'miembro');
}

const countSince = (t, ipHash = null) => (ipHash
  ? db.prepare('SELECT COUNT(*) AS n FROM public_joins WHERE created_at > ? AND ip_hash = ?').get(t, ipHash).n
  : db.prepare('SELECT COUNT(*) AS n FROM public_joins WHERE created_at > ?').get(t).n);

function pendingCookie(ticket, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1' ? '; Secure' : '';
  return `${PENDING_COOKIE}=${clear ? '' : ticket}; Path=/api/join; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 30 * 86400}${secure}`;
}
function newTicket(uid) {
  const t = randomToken(24);
  db.prepare('UPDATE public_joins SET ticket = ? WHERE user_id = ?').run(sha(t), uid);
  return t;
}

// Revisión que necesita a Discord (antes de crear la cuenta): solo miembros del servidor
export async function joinPrecheck(profile) {
  if (db.prepare('SELECT 1 FROM users WHERE discord_id = ?').get(String(profile.id))) return null; // ya tiene cuenta: solo entra
  if (!guildGateOn()) return null;
  try {
    if (!(await fetchMember(String(profile.id)))) return 'notmember';
  } catch (e) {
    console.warn('[unete] No se pudo revisar la membresía:', e.message);
    return 'guildcheck'; // enlace público: si Discord no responde, mejor no dejar pasar
  }
  return null;
}

// Resultado de Discord en modo "join": { query, session?, cookie? }
export function resolveJoin(st, profile, req, { freeUsername, broadcastUser }) {
  const did = String(profile.id);
  const dname = String(profile.username || '').slice(0, 40);
  const fail = (reason) => ({ query: { join: 'error', reason, ...(st.slug ? { s: st.slug } : {}) } });
  const linked = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(did);
  const ip = reqIp(req);

  // Ya tiene cuenta: entra a la misma (o vuelve a la pantalla de espera)
  if (linked) {
    const pj = db.prepare('SELECT * FROM public_joins WHERE user_id = ?').get(linked.id);
    if (pj?.status === 'pending' || pj?.status === 'rejected') {
      return { query: { join: pj.status }, cookie: pendingCookie(newTicket(linked.id)) };
    }
    return { login: linked };
  }

  const c = joinConfig();
  const p = slugProblem(st.slug, c);
  if (p) return fail(p);
  if (!oauthOn()) return fail('oauth');
  if (c.paused) return fail('paused');
  if (isIpBanned(ip)) return fail('ipbanned');
  const born = discordCreatedAt(did);
  if (!born) return fail('error');
  if (c.minAgeDays > 0 && now() - born < c.minAgeDays * 864e5) return fail('young');
  const ipHash = ip ? hashIp(ip) : '';
  if (ipHash && countSince(now() - HOUR, ipHash) >= c.perIpHour) return fail('iplimit');
  if (countSince(now() - HOUR) >= c.globalHour) return fail('busy');

  const username = usernameFrom(profile, freeUsername);
  const display = displayFrom(profile);
  const pending = !!c.approval;
  let uid;
  try {
    uid = tx(() => {
      const id = Number(db.prepare(`INSERT INTO users (username, email, display_name, password_hash, role, avatar, created_at, discord_id, discord_name, disabled)
        VALUES (?, '', ?, ?, 'member', ?, ?, ?, ?, ?)`).run(username, display, hashPassword(randomToken(24)), JSON.stringify(defaultAvatar(username)), now(), did, dname, pending ? 1 : 0).lastInsertRowid);
      db.prepare('INSERT INTO public_joins (user_id, discord_id, ip_hash, status, created_at) VALUES (?, ?, ?, ?, ?)').run(id, did, ipHash, pending ? 'pending' : 'active', now());
      return id;
    });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return { query: { discord: 'taken' } };
    throw e;
  }
  audit({ actor: uid, action: `Se unió con el enlace público (Discord: ${dname})${pending ? ' — espera aprobación' : ''}`, target: 'public-link', data: { source: 'public-link', discordId: did }, ip: req.ip });
  if (pending) return { query: { join: 'pending' }, cookie: pendingCookie(newTicket(uid)) };
  broadcastUser(uid);
  hubEmit('member:joined', { userId: uid, source: 'public-link' });
  return { query: { discord: 'welcome' }, session: uid };
}

// ---------- Rutas ----------
export function joinUrls(req) {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const c = joinConfig();
  return { base, link: `${base}/unete/${c.slug}`, bare: `${base}/unete`, redirectUri: `${base}/api/auth/discord/callback` };
}

// Públicas (antes de pedir sesión)
export function registerPublicJoinRoutes(api, { officeName }) {
  api.get('/join/info', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const c = joinConfig();
    let reason = slugProblem(req.query.slug, c);
    if (!reason && !oauthOn()) reason = 'oauth';
    if (!reason && c.paused) reason = 'paused';
    const out = { available: !reason, reason, officeName: officeName() };
    if (!reason) {
      Object.assign(out, { slug: req.query.slug ? c.slug : '', requireGuild: guildGateOn(c), minAgeDays: c.minAgeDays, approval: c.approval });
      if (out.requireGuild) { try { out.guildName = (await guildInfo()).guild?.name || null; } catch { out.guildName = null; } }
    }
    res.json(out);
  });

  // Pantalla de espera: ¿ya me aprobaron?
  api.get('/join/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const t = parseCookies(req.headers.cookie)[PENDING_COOKIE];
    const pj = t && db.prepare('SELECT * FROM public_joins WHERE ticket = ?').get(sha(t));
    if (!pj) return res.json({ status: 'none' });
    const u = db.prepare('SELECT display_name, disabled FROM users WHERE id = ?').get(pj.user_id);
    if (pj.status === 'active' && u && !u.disabled) {
      db.prepare('UPDATE public_joins SET ticket = NULL WHERE user_id = ?').run(pj.user_id);
      res.setHeader('Set-Cookie', [pendingCookie('', { clear: true }), sessionCookie(createSession(pj.user_id))]);
      return res.json({ status: 'approved' });
    }
    res.json({ status: pj.status === 'rejected' ? 'rejected' : 'pending', name: u?.display_name || '' });
  });
}

// Admin: /api/admin/public-join…
export function registerPublicJoinAdmin(admin, { fail, wrap, broadcastUser }) {
  const state = (req) => {
    const c = joinConfig();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const pending = db.prepare(`SELECT p.user_id, p.created_at, u.display_name, u.username, u.discord_name, u.discord_id FROM public_joins p
      JOIN users u ON u.id = p.user_id WHERE p.status = 'pending' ORDER BY p.created_at`).all();
    return {
      config: { ...c, requireGuild: guildGateOn(c), requireGuildSetting: c.requireGuild },
      urls: joinUrls(req),
      oauth: oauthOn(),
      bot: botEnabled(),
      counts: {
        today: countSince(today.getTime()),
        hour: countSince(now() - HOUR),
        total: db.prepare('SELECT COUNT(*) AS n FROM public_joins').get().n,
        pending: pending.length,
      },
      pending: pending.map((p) => ({
        userId: p.user_id, name: p.display_name, username: p.username, discordName: p.discord_name,
        createdAt: p.created_at, discordCreatedAt: discordCreatedAt(p.discord_id),
      })),
    };
  };

  admin.get('/public-join', (req, res) => res.json(state(req)));

  admin.put('/public-join', wrap((req, res) => {
    const b = req.body || {};
    const c = joinConfig();
    const was = { ...c };
    for (const k of ['enabled', 'allowBare', 'paused', 'approval']) if (b[k] !== undefined) c[k] = !!b[k];
    if (b.requireGuild !== undefined) c.requireGuild = b.requireGuild === null ? null : !!b.requireGuild;
    if (b.minAgeDays !== undefined) c.minAgeDays = clampInt(b.minAgeDays, 0, 365, 7);
    if (b.perIpHour !== undefined) c.perIpHour = clampInt(b.perIpHour, 1, 50, 3);
    if (b.globalHour !== undefined) c.globalHour = clampInt(b.globalHour, 1, 1000, 30);
    if (b.slug !== undefined) {
      const s = String(b.slug).trim().toLowerCase();
      if (!SLUG_RE.test(s)) return fail(res, 400, 'La clave del enlace debe tener 3 a 32 letras, números o guiones.');
      c.slug = s;
    }
    save(c);
    const changes = Object.keys(c).filter((k) => c[k] !== was[k]).map((k) => (k === 'slug' ? 'clave del enlace' : `${k}: ${c[k]}`));
    if (changes.length) audit({ actor: req.user.id, action: `Cambió el registro abierto con Discord (${changes.join(', ')})`, target: 'public-link', ip: req.ip });
    res.json(state(req));
  }));

  admin.post('/public-join/rotate', wrap((req, res) => {
    const c = joinConfig();
    c.slug = newSlug();
    save(c);
    audit({ actor: req.user.id, action: 'Regeneró el enlace público para unirse (el anterior ya no sirve)', target: 'public-link', ip: req.ip });
    res.json(state(req));
  }));

  const decide = (approve) => wrap((req, res) => {
    const uid = Number(req.params.id);
    const pj = db.prepare("SELECT * FROM public_joins WHERE user_id = ? AND status = 'pending'").get(uid);
    if (!pj) return fail(res, 404, 'Esa solicitud ya no está pendiente.');
    db.prepare('UPDATE public_joins SET status = ?, decided_by = ?, decided_at = ? WHERE user_id = ?').run(approve ? 'active' : 'rejected', req.user.id, now(), uid);
    if (approve) db.prepare('UPDATE users SET disabled = 0 WHERE id = ?').run(uid);
    const name = db.prepare('SELECT display_name FROM users WHERE id = ?').get(uid)?.display_name || `#${uid}`;
    audit({ actor: req.user.id, action: `${approve ? 'Aprobó' : 'Rechazó'} a ${name} (enlace público)`, target: 'public-link', ip: req.ip });
    if (approve) {
      broadcastUser(uid);
      hubEmit('member:joined', { userId: uid, source: 'public-link' });
    }
    res.json(state(req));
  });
  admin.post('/public-join/:id/approve', decide(true));
  admin.post('/public-join/:id/reject', decide(false));
}

export const _publicJoin = { PENDING_COOKIE };
