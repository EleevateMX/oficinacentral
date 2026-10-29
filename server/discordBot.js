// Integración con un servidor de Discord (opcional: solo se activa con DISCORD_BOT_TOKEN y DISCORD_GUILD_ID).
//  1) Roles de Discord → HUB: cada rol (y el boost) puede dar placas, rol de admin, tema, VIP o "moderador".
//     Se leen por la API REST (al entrar y cada 15 min) y, si se activa DISCORD_GATEWAY=1, al momento por el Gateway.
//     Lo que da Discord queda marcado (discord_grants / source 'discord'): al quitar el rol solo se quita eso.
//  2) HUB → canales de Discord: en vivo, bienvenidas, cumpleaños, eventos, eventos del Hotel, placas y moderación.
//  3) Botones del canal de moderación (Sacar, Silenciar, Banear…) por el endpoint de Interacciones (firma Ed25519).
// El token del bot vive solo en el entorno: nunca se manda al navegador ni se escribe en los registros.
import crypto from 'node:crypto';
import { db, now, getSetting, setSetting } from './db.js';
import { audit, checkTotp } from './security.js';
import { emitToUser } from './realtime.js';
import { giveBadge, takeBadge, badgeExists, customBadges } from './badges.js';
import { isGrantable, BADGE_BY_ID, ROLE_BADGES, STREAMER_BADGES, EVENT_BADGES, PLATFORM_BY_ID } from '../shared/badges.js';
import { USER_THEME_IDS, themeList } from '../shared/uiThemes.js';
import { hub, hooks } from './hubEvents.js';
import { performModAction, whereIs } from './modActions.js';

// ---------- Entorno ----------
const API = () => `${(process.env.DISCORD_API_BASE || 'https://discord.com/api').replace(/\/$/, '')}/v10`;
const TOKEN = () => process.env.DISCORD_BOT_TOKEN || '';
const GUILD = () => process.env.DISCORD_GUILD_ID || '';
export const SNOWFLAKE = /^\d{17,20}$/;
export const isSnowflake = (s) => typeof s === 'string' && SNOWFLAKE.test(s);
export const botEnabled = () => !!(TOKEN() && isSnowflake(GUILD()));
const publicKey = () => (/^[0-9a-f]{64}$/i.test(process.env.DISCORD_PUBLIC_KEY || '') ? process.env.DISCORD_PUBLIC_KEY : '');
export const publicBase = () => (process.env.PUBLIC_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const SYNC_MINUTES = () => Math.max(5, Number(process.env.DISCORD_SYNC_MINUTES) || 15);

// Colores Eleevate / HUB
export const COLORS = { navy: 0x222640, steel: 0x9CBED9, live: 0xE2524A, ok: 0x4CAF7A, warn: 0xE0B15A };

// ---------- Permisos de Discord ----------
const P = {
  ADMINISTRATOR: 1n << 3n, MANAGE_CHANNELS: 1n << 4n, VIEW_CHANNEL: 1n << 10n, SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n, EMBED_LINKS: 1n << 14n, READ_MESSAGE_HISTORY: 1n << 16n, PIN_MESSAGES: 1n << 51n,
};
const PERM_NAMES = {
  VIEW_CHANNEL: 'Ver canales', SEND_MESSAGES: 'Enviar mensajes', EMBED_LINKS: 'Insertar enlaces',
  MANAGE_MESSAGES: 'Gestionar mensajes (fijar)', MANAGE_CHANNELS: 'Gestionar canales (tema)', READ_MESSAGE_HISTORY: 'Leer el historial',
};
export const INVITE_PERMISSIONS = (P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS | P.MANAGE_MESSAGES | P.READ_MESSAGE_HISTORY | P.MANAGE_CHANNELS | P.PIN_MESSAGES).toString();

// Permisos efectivos del bot en un canal (algoritmo de Discord: @everyone + roles, luego overwrites)
export function channelPermissions({ guildId, ownerId, roles, memberRoles, userId, channel }) {
  if (userId && ownerId === userId) return P.ADMINISTRATOR | (1n << 52n) - 1n;
  const byId = new Map(roles.map((r) => [r.id, BigInt(r.permissions || '0')]));
  let perms = byId.get(guildId) || 0n;
  for (const r of memberRoles) perms |= byId.get(r) || 0n;
  if (perms & P.ADMINISTRATOR) return (1n << 52n) - 1n;
  const ow = channel?.permission_overwrites || [];
  const apply = (o) => { if (o) perms = (perms & ~BigInt(o.deny || '0')) | BigInt(o.allow || '0'); };
  apply(ow.find((o) => o.id === guildId));
  let allow = 0n, deny = 0n;
  for (const o of ow) if (o.type === 0 && o.id !== guildId && memberRoles.includes(o.id)) { allow |= BigInt(o.allow || '0'); deny |= BigInt(o.deny || '0'); }
  perms = (perms & ~deny) | allow;
  apply(ow.find((o) => o.type === 1 && o.id === userId));
  return perms;
}
// Lo que falta para cada uso: post (mandar avisos), pin (fijar), topic (cambiar el tema)
export function missingFor(perms, needs = ['post']) {
  const out = new Set();
  const need = (k) => { if (!(perms & P[k])) out.add(k); };
  if (needs.includes('post')) { need('VIEW_CHANNEL'); need('SEND_MESSAGES'); need('EMBED_LINKS'); }
  if (needs.includes('pin')) { need('VIEW_CHANNEL'); if (!(perms & P.MANAGE_MESSAGES) && !(perms & P.PIN_MESSAGES)) out.add('MANAGE_MESSAGES'); need('READ_MESSAGE_HISTORY'); }
  if (needs.includes('topic')) { need('VIEW_CHANNEL'); need('MANAGE_CHANNELS'); }
  return [...out].map((k) => ({ id: k, name: PERM_NAMES[k] || k }));
}

// ---------- Cliente REST con límites de velocidad ----------
export class DiscordError extends Error {
  constructor(status, body) {
    super(`Discord ${status}${body?.message ? `: ${body.message}` : ''}`);
    this.status = status;
    this.code = body?.code;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buckets = new Map(); // ruta -> { remaining, resetAt }
let globalUntil = 0;
// Ruta para los límites: el primer ID (canal/servidor) cuenta, los demás no
const routeKey = (method, path) => `${method} ${path.replace(/^(\/(?:channels|guilds|webhooks)\/\d+)|\/\d{17,20}/g, (m, major) => major || '/:id')}`;
export const stats = { requests: 0, retries: 0, rateLimited: 0, errors: 0 };

export async function dapi(method, path, body, { retries = 3, reason = null } = {}) {
  if (!TOKEN()) throw new DiscordError(0, { message: 'El bot no está configurado' });
  const key = routeKey(method, path);
  for (let attempt = 0; ; attempt++) {
    const t = Date.now();
    if (globalUntil > t) await sleep(globalUntil - t);
    const b = buckets.get(key);
    if (b && b.remaining <= 0 && b.resetAt > Date.now()) await sleep(Math.min(b.resetAt - Date.now(), 60e3));
    let r;
    stats.requests++;
    try {
      const headers = { Authorization: `Bot ${TOKEN()}`, 'User-Agent': 'DiscordBot (https://github.com/EleevateMX/oficinacentral, 1.0)' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(reason).slice(0, 400);
      r = await fetch(`${API()}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
    } catch (e) {
      if (attempt < retries) { stats.retries++; await sleep(500 * 2 ** attempt); continue; }
      stats.errors++;
      throw new DiscordError(0, { message: e.name === 'TimeoutError' ? 'Discord tardó demasiado' : 'No se pudo conectar con Discord' });
    }
    const rem = r.headers.get('x-ratelimit-remaining');
    const after = r.headers.get('x-ratelimit-reset-after');
    if (rem != null && after != null) buckets.set(key, { remaining: Number(rem), resetAt: Date.now() + Number(after) * 1000 });
    if (r.status === 429) {
      stats.rateLimited++;
      const j = await r.json().catch(() => ({}));
      const wait = Math.min(Math.max(Number(j.retry_after ?? r.headers.get('retry-after') ?? 1), 0.05), 60) * 1000;
      if (j.global || r.headers.get('x-ratelimit-global')) globalUntil = Date.now() + wait;
      else buckets.set(key, { remaining: 0, resetAt: Date.now() + wait });
      if (attempt < retries) { stats.retries++; await sleep(wait); continue; }
      stats.errors++;
      throw new DiscordError(429, { message: 'Demasiadas peticiones a Discord' });
    }
    if (r.status >= 500 && attempt < retries) { stats.retries++; await sleep(500 * 2 ** attempt); continue; }
    if (!r.ok) {
      stats.errors++;
      throw new DiscordError(r.status, await r.json().catch(() => ({})));
    }
    if (r.status === 204) return null;
    return r.json().catch(() => null);
  }
}

// ---------- Configuración (Preferencias → Discord) ----------
export const AUTOMATIONS = [
  { id: 'live', name: 'Streamer en vivo', desc: 'Cuando alguien activa "🔴 En vivo" en sus placas, con botón para ver la transmisión.', def: true },
  { id: 'welcome', name: 'Bienvenidas', desc: 'Cuando alguien nuevo entra al HUB con su invitación.', def: true },
  { id: 'birthdays', name: 'Cumpleaños', desc: 'El aviso diario de cumpleaños (si no se configura, sigue el webhook BIRTHDAY_WEBHOOK_URL).', def: true },
  { id: 'events', name: 'Eventos de la oficina', desc: 'Eventos nuevos del calendario, con hora local y enlace para confirmar.', def: true },
  { id: 'hotel', name: 'Eventos del Hotel', desc: 'Cuando una sala de MeDed Friends promociona un evento, con botón "Ir a la sala".', def: true },
  { id: 'badges', name: 'Logros y placas', desc: 'Cuando alguien gana un logro o recibe una placa. Puede ser mucho: apagado por defecto.', def: false },
  { id: 'modlog', name: 'Registro de moderación', desc: 'Reportes y sanciones a un canal PRIVADO del equipo (solo nombres y motivos), con botones para actuar.', def: true },
];
const AUTO_IDS = AUTOMATIONS.map((a) => a.id);
const OFFICE_ROLES = ['', 'member', 'admin'];
const DEFAULT_CONFIG = () => ({
  roleMap: { booster: { office: '', badges: ['role:booster'], theme: null, vip: true, mod: false } },
  automations: Object.fromEntries(AUTOMATIONS.map((a) => [a.id, { on: false, channel: null }])),
  requireMember: false,
});
export function botConfig() {
  let c = null;
  try { c = JSON.parse(getSetting('discord_bot_config') || 'null'); } catch { c = null; }
  const d = DEFAULT_CONFIG();
  if (!c) return d;
  return { ...d, ...c, automations: { ...d.automations, ...(c.automations || {}) }, roleMap: c.roleMap || d.roleMap };
}
const saveConfig = (c) => setSetting('discord_bot_config', JSON.stringify(c));

// Valida una entrada del mapeo (lo que da un rol de Discord)
function cleanMapping(m) {
  const office = OFFICE_ROLES.includes(m?.office) ? m.office : '';
  const badges = [...new Set((Array.isArray(m?.badges) ? m.badges : []).map(String))].filter((b) => isGrantable(b) && badgeExists(b) && !b.startsWith('fan:')).slice(0, 10);
  const theme = m?.theme && USER_THEME_IDS.includes(m.theme) ? m.theme : null;
  return { office, badges, theme, vip: !!m?.vip, mod: !!m?.mod };
}
const emptyMapping = (m) => !m.office && !m.badges.length && !m.theme && !m.vip && !m.mod;

// ---------- Lo que dio Discord ----------
db.exec(`
CREATE TABLE IF NOT EXISTS discord_grants (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, value)
);
CREATE TABLE IF NOT EXISTS discord_members (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_guild INTEGER NOT NULL DEFAULT 0,
  roles TEXT NOT NULL DEFAULT '[]',
  booster INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL
);
`);
const grantsOf = (uid) => db.prepare('SELECT kind, value FROM discord_grants WHERE user_id = ?').all(uid);
const addGrant = (uid, kind, value) => db.prepare('INSERT OR IGNORE INTO discord_grants (user_id, kind, value, granted_at) VALUES (?, ?, ?, ?)').run(uid, kind, value, now());
const dropGrant = (uid, kind, value) => db.prepare('DELETE FROM discord_grants WHERE user_id = ? AND kind = ? AND value = ?').run(uid, kind, value);
export const isModerator = (uid) => !!uid && !!db.prepare("SELECT 1 FROM discord_grants WHERE user_id = ? AND kind = 'mod'").get(Number(uid));
export const isDiscordVip = (uid) => !!uid && !!db.prepare("SELECT 1 FROM discord_grants WHERE user_id = ? AND kind = 'vip'").get(Number(uid));

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
const badgeName = (id) => BADGE_BY_ID[id]?.name || customBadges().find((b) => b.id === id)?.name || id;

// Primer admin / dueño de la oficina: Discord nunca le quita el admin
export function protectedAdmin(uid) {
  const u = getUser(uid);
  if (!u) return false;
  const owner = process.env.ADMIN_USERNAME || 'admin';
  const first = db.prepare('SELECT MIN(id) AS id FROM users').get().id;
  const firstAdmin = db.prepare("SELECT MIN(id) AS id FROM users WHERE role = 'admin'").get().id;
  const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get().n;
  return u.username === owner || u.id === first || u.id === firstAdmin || admins <= 1;
}

let deps = { broadcastUser: () => {} };

// Aplica los roles de Discord de una persona (member = respuesta de /guilds/{g}/members/{u}, o null si no está)
export function applyMember(uid, member) {
  const u = getUser(uid);
  if (!u) return [];
  const map = botConfig().roleMap || {};
  const ids = member ? [...(member.roles || [])] : [];
  if (member?.premium_since) ids.push('booster');
  const want = { badges: new Set(), admin: false, theme: null, vip: false, mod: false };
  for (const rid of ids) {
    const m = map[rid];
    if (!m) continue;
    for (const b of m.badges || []) want.badges.add(b);
    if (m.office === 'admin') want.admin = true;
    if (m.theme && !want.theme) want.theme = m.theme;
    if (m.vip) want.vip = true;
    if (m.mod) want.mod = true;
  }
  const have = grantsOf(uid);
  const has = (k, v) => have.some((g) => g.kind === k && g.value === v);
  const changes = [];
  const log = (text, data = {}) => {
    changes.push(text);
    audit({ actor: null, action: `Discord: ${text}`, target: `user:${uid}`, data: { source: 'discord', ...data } });
  };
  const name = u.display_name;

  // Placas
  for (const b of want.badges) {
    if (has('badge', b) || !badgeExists(b)) continue;
    const fresh = giveBadge(uid, b, { source: 'discord', note: 'Por tu rol en Discord' });
    const row = db.prepare('SELECT source FROM user_badges WHERE user_id = ? AND badge_id = ?').get(uid, b);
    if (fresh || row?.source === 'discord') { addGrant(uid, 'badge', b); if (fresh) log(`dio la placa "${badgeName(b)}" a ${name}`, { badge: b }); }
  }
  for (const g of have.filter((x) => x.kind === 'badge' && !want.badges.has(x.value))) {
    const row = db.prepare('SELECT source FROM user_badges WHERE user_id = ? AND badge_id = ?').get(uid, g.value);
    if (row?.source === 'discord') { takeBadge(uid, g.value); log(`quitó la placa "${badgeName(g.value)}" a ${name}`, { badge: g.value }); }
    dropGrant(uid, 'badge', g.value);
  }

  // Rol de la oficina
  let roleChanged = false;
  if (want.admin && u.role !== 'admin' && !u.disabled) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(uid);
    addGrant(uid, 'role', 'admin');
    roleChanged = true;
    log(`hizo admin a ${name} por su rol de Discord`);
  } else if (!want.admin && has('role', 'admin')) {
    if (u.role === 'admin' && protectedAdmin(uid)) {
      log(`NO quitó el admin a ${name}: es el primer admin, el dueño o el último admin`, { protected: true });
    } else if (u.role === 'admin') {
      db.prepare("UPDATE users SET role = 'member' WHERE id = ?").run(uid);
      roleChanged = true;
      log(`quitó el admin a ${name} (ya no tiene el rol en Discord)`);
    }
    dropGrant(uid, 'role', 'admin');
  }

  // Tema (solo si la persona no eligió otro)
  const themeGrant = have.find((g) => g.kind === 'theme');
  if (want.theme && themeGrant?.value !== want.theme && (!u.ui_theme || u.ui_theme === themeGrant?.value)) {
    if (themeGrant) dropGrant(uid, 'theme', themeGrant.value);
    db.prepare('UPDATE users SET ui_theme = ? WHERE id = ?').run(want.theme, uid);
    addGrant(uid, 'theme', want.theme);
    emitToUser(uid, 'ui-theme', { theme: want.theme });
    log(`puso el tema "${want.theme}" a ${name}`);
  } else if (!want.theme && themeGrant) {
    if (u.ui_theme === themeGrant.value) { db.prepare('UPDATE users SET ui_theme = NULL WHERE id = ?').run(uid); emitToUser(uid, 'ui-theme', { theme: null }); }
    dropGrant(uid, 'theme', themeGrant.value);
    log(`quitó el tema de Discord a ${name}`);
  }

  // VIP y moderador
  for (const [kind, on, label] of [['vip', want.vip, 'VIP'], ['mod', want.mod, 'Moderador de HUB']]) {
    if (on && !has(kind, '1')) { addGrant(uid, kind, '1'); log(`marcó a ${name} como ${label}`); }
    else if (!on && has(kind, '1')) { dropGrant(uid, kind, '1'); log(`quitó ${label} a ${name}`); }
  }

  db.prepare(`INSERT INTO discord_members (user_id, in_guild, roles, booster, synced_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET in_guild = excluded.in_guild, roles = excluded.roles, booster = excluded.booster, synced_at = excluded.synced_at`)
    .run(uid, member ? 1 : 0, JSON.stringify(member?.roles || []), member?.premium_since ? 1 : 0, now());
  if (roleChanged) { try { deps.broadcastUser(uid); } catch { /* sin sockets */ } }
  return changes;
}

// Pide a Discord los roles de alguien (null = no está en el servidor; lanza si Discord falla)
export async function fetchMember(discordId) {
  if (!isSnowflake(discordId)) return null;
  try {
    return await dapi('GET', `/guilds/${GUILD()}/members/${discordId}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

const lastSync = new Map();
export async function syncUser(uid, { force = false } = {}) {
  if (!botEnabled()) return null;
  const u = getUser(uid);
  if (!u) return null;
  if (!force && Date.now() - (lastSync.get(uid) || 0) < 60e3) return null;
  lastSync.set(uid, Date.now());
  if (!u.discord_id) return grantsOf(uid).length ? applyMember(uid, null) : [];
  const member = await fetchMember(u.discord_id);
  return applyMember(uid, member);
}

let syncing = false;
const syncState = { at: null, users: 0, changes: 0, error: null, running: false };
export async function syncAll() {
  if (!botEnabled() || syncing) return syncState;
  syncing = true;
  syncState.running = true;
  let users = 0, changes = 0;
  try {
    const rows = db.prepare('SELECT id FROM users WHERE discord_id IS NOT NULL OR id IN (SELECT user_id FROM discord_grants)').all();
    for (let i = 0; i < rows.length; i += 25) {
      for (const r of rows.slice(i, i + 25)) {
        try { changes += (await syncUser(r.id, { force: true }))?.length || 0; users++; } catch (e) { syncState.error = e.message; }
      }
      await sleep(250); // pausa entre lotes
    }
    syncState.error = users || !rows.length ? null : syncState.error;
  } finally {
    Object.assign(syncState, { at: now(), users, changes, running: false });
    syncing = false;
  }
  return syncState;
}

// Puerta opcional: solo miembros del servidor de Discord entran o se registran con Discord.
// Si Discord no responde, se deja pasar (que una caída de Discord no deje a todos fuera).
export async function guildGateAllows(discordId) {
  if (!botEnabled() || !botConfig().requireMember) return true;
  try { return !!(await fetchMember(String(discordId))); } catch (e) {
    console.warn('[discord] No se pudo revisar la membresía:', e.message);
    return true;
  }
}

// ---------- Datos del servidor (roles, canales, bot) ----------
let guildCache = { at: 0, data: null };
export async function guildInfo({ fresh = false } = {}) {
  if (!fresh && guildCache.data && Date.now() - guildCache.at < 60e3) return guildCache.data;
  const g = GUILD();
  const [guild, roles, channels, me] = await Promise.all([
    dapi('GET', `/guilds/${g}`), dapi('GET', `/guilds/${g}/roles`), dapi('GET', `/guilds/${g}/channels`), dapi('GET', '/users/@me'),
  ]);
  const botMember = await dapi('GET', `/guilds/${g}/members/${me.id}`).catch(() => ({ roles: [] }));
  const ctx = { guildId: g, ownerId: guild.owner_id, roles, memberRoles: botMember.roles || [], userId: me.id };
  const data = {
    guild: { id: guild.id, name: guild.name, icon: guild.icon || null },
    bot: { id: me.id, username: me.username },
    roles: roles.filter((r) => r.id !== g && !r.managed).sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null, position: r.position })),
    channels: channels.filter((c) => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position).map((c) => {
      const perms = channelPermissions({ ...ctx, channel: c });
      return {
        id: c.id, name: c.name, type: c.type, parent: channels.find((x) => x.id === c.parent_id)?.name || null, topic: c.topic || '',
        missing: missingFor(perms, ['post']), missingPin: missingFor(perms, ['pin']), missingTopic: missingFor(perms, ['topic']),
      };
    }),
  };
  guildCache = { at: Date.now(), data };
  return data;
}

// ---------- Mensajes: cola, embeds y registro ----------
const sendLog = []; // últimos envíos (sin datos sensibles)
const logSend = (e) => { sendLog.unshift({ at: now(), ...e }); sendLog.length = Math.min(sendLog.length, 40); };
let chain = Promise.resolve();
let pending = 0;
function enqueue(job) {
  if (pending > 200) return Promise.resolve(null); // Discord caído mucho rato: no se acumula sin fin
  pending++;
  const p = chain.then(job).catch((e) => { console.warn('[discord] envío fallido:', e.message); return null; }).finally(() => { pending--; });
  chain = p;
  return p;
}

// Texto del HUB → Discord: sin controles, @everyone/@here neutralizados y con tope de largo
export const clean = (s, max = 1000) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/@(everyone|here)/gi, '@​$1').trim().slice(0, max);
const logoUrl = () => (publicBase() ? `${publicBase()}/themes/eleevate/logo.png` : null);
export function embed({ title, description, url, fields, color = COLORS.navy, footer }) {
  const e = { title: clean(title, 250), color, footer: { text: clean(footer || 'HUB · Eleevate', 200) }, timestamp: new Date().toISOString() };
  if (description) e.description = clean(description, 3500);
  if (url && /^https?:\/\//.test(url)) e.url = url;
  if (fields?.length) e.fields = fields.filter((f) => f && f.value).slice(0, 20).map((f) => ({ name: clean(f.name, 250), value: clean(f.value, 1000), inline: !!f.inline }));
  if (logoUrl()) e.thumbnail = { url: logoUrl() };
  return e;
}
const linkButton = (label, url) => (url && /^https?:\/\//.test(url) ? { type: 2, style: 5, label: clean(label, 80), url } : null);
const row = (buttons) => { const b = buttons.filter(Boolean); return b.length ? { type: 1, components: b.slice(0, 5) } : null; };

// Siempre sin menciones: nadie puede hacer @everyone desde el HUB
export function postToChannel(channelId, { content = '', embeds = [], components = [] }, kind = 'manual') {
  if (!botEnabled() || !isSnowflake(channelId)) return Promise.resolve(null);
  const body = { content: clean(content, 1900), embeds, components: components.filter(Boolean), allowed_mentions: { parse: [] } };
  return enqueue(async () => {
    try {
      const m = await dapi('POST', `/channels/${channelId}/messages`, body);
      logSend({ kind, channelId, ok: true });
      return m;
    } catch (e) {
      logSend({ kind, channelId, ok: false, error: e.message });
      throw e;
    }
  });
}

// Automatización encendida y con canal
export function automationChannel(id) {
  if (!botEnabled()) return null;
  const a = botConfig().automations?.[id];
  return a?.on && isSnowflake(a.channel) ? a.channel : null;
}
function automate(id, message) {
  const ch = automationChannel(id);
  if (!ch) return Promise.resolve(null);
  return postToChannel(ch, message, id);
}

const ts = (ms, style = 'F') => `<t:${Math.floor(ms / 1000)}:${style}>`;
const officeName = () => getSetting('office_name') || process.env.OFFICE_NAME || 'HUB';
const link = (q = '') => (publicBase() ? `${publicBase()}/${q}` : null);

// Cumpleaños (lo llama server/birthdays.js); true si salió por el bot
export async function postBirthdays(people) {
  if (!automationChannel('birthdays') || !people?.length) return false;
  const names = people.map((p) => `**${clean(p.name, 60)}**`);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  const m = await automate('birthdays', {
    embeds: [embed({ title: '🎂 ¡Hoy hay cumpleaños!', description: `Hoy ${people.length === 1 ? 'cumple años' : 'cumplen años'} ${who}. Entra al ${officeName()} y mándale tu felicitación 🎉`, color: COLORS.steel })],
    components: [row([linkButton('Felicitar en el HUB', link('?view=birthdays'))])],
  });
  return !!m;
}

Object.assign(hooks, { postBirthdays, botEnabled, birthdayChannel: () => automationChannel('birthdays') });

// Mensaje del canal de moderación (reporte) con botones si hay endpoint de Interacciones
export function reportMessage(r, { withButtons = !!publicKey() } = {}) {
  const where = whereIs(r.targetId);
  const evidence = [r.snapshot?.body ? `> ${clean(r.snapshot.body, 500).replace(/\n/g, '\n> ')}` : '', r.text ? clean(r.text, 500) : ''].filter(Boolean).join('\n');
  const e = embed({
    title: `🚩 Reporte contra ${r.targetName}`, color: COLORS.warn,
    fields: [
      { name: 'Reportado', value: r.targetName, inline: true },
      { name: 'Lo reportó', value: r.reporterName, inline: true },
      { name: 'Dónde está ahora', value: where.label, inline: true },
      { name: 'Motivo', value: r.reasonLabel || r.reason },
      { name: 'Evidencia', value: evidence || 'Sin texto' },
    ],
    footer: `Reporte #${r.id} · HUB · Eleevate`,
  });
  const k = (a) => `hm:${a}:${r.targetId}:${r.id}`;
  const components = withButtons ? [
    row([{ type: 2, style: 2, label: 'Sacar', custom_id: k('kick') }, { type: 2, style: 1, label: 'Silenciar 15 min', custom_id: k('mute15') }, { type: 2, style: 1, label: 'Silenciar voz', custom_id: k('vmute') }]),
    row([{ type: 2, style: 4, label: 'Banear 1 día', custom_id: k('ban1d') }, { type: 2, style: 4, label: 'Banear + IP', custom_id: k('ipban') }, { type: 2, style: 2, label: 'Descartar', custom_id: k('dismiss') }, linkButton('Abrir panel', link('?view=moderation'))]),
  ] : [row([linkButton('Abrir panel', link('?view=moderation'))])];
  return { embeds: [e], components };
}

// Sin bot (o sin canal): webhook simple MOD_WEBHOOK_URL, sin botones
async function modWebhook(message) {
  const url = process.env.MOD_WEBHOOK_URL || '';
  if (!/^https?:\/\//.test(url)) return false;
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ username: 'Moderación HUB', embeds: message.embeds, components: [], allowed_mentions: { parse: [] } }),
    });
    logSend({ kind: 'modlog-webhook', channelId: null, ok: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` });
    return r.ok;
  } catch (e) {
    logSend({ kind: 'modlog-webhook', channelId: null, ok: false, error: e.message });
    return false;
  }
}
function modlog(message) {
  if (automationChannel('modlog')) return automate('modlog', message);
  return modWebhook({ ...message, components: [] });
}

// ---------- Escuchas del HUB ----------
hub.on('streamer:live', (m) => {
  const plat = PLATFORM_BY_ID[m.platform]?.name || m.platform;
  automate('live', {
    embeds: [embed({ title: `🔴 ${m.name} está en vivo`, description: `Transmitiendo ahora en **${plat}**. ¡Cáele y apoya a la comunidad!`, url: m.url, color: COLORS.live })],
    components: [row([linkButton(`Ver en ${plat}`, m.url), linkButton('Abrir HUB', link())])],
  });
});
hub.on('member:joined', (m) => {
  const u = getUser(m.userId);
  if (!u) return;
  automate('welcome', {
    embeds: [embed({ title: `👋 ¡Bienvenido al ${officeName()}, ${u.display_name}!`, description: 'Ya es parte de la oficina. Salúdalo cuando lo veas por ahí. Vincula tu Discord en Preferencias → Cuenta para que tus roles se reflejen en el HUB.', color: COLORS.steel })],
    components: [row([linkButton('Entrar al HUB', link())])],
  });
});
hub.on('office:event', (e) => {
  const by = getUser(e.createdBy)?.display_name;
  automate('events', {
    embeds: [embed({
      title: `📅 ${e.title}`, description: e.description ? clean(e.description, 600) : null, color: COLORS.navy,
      fields: [
        { name: 'Cuándo', value: `${ts(e.startsAt)} (${ts(e.startsAt, 'R')})`, inline: true },
        { name: 'Termina', value: ts(e.endsAt, 't'), inline: true },
        { name: 'Dónde', value: e.location || null, inline: true },
        { name: 'Organiza', value: by || null, inline: true },
      ],
    })],
    components: [row([linkButton('Confirmar asistencia', link('?view=calendar'))])],
  });
});
hub.on('hotel:event', (e) => {
  automate('hotel', {
    embeds: [embed({
      title: `🏨 ${e.title}`, description: e.description || `Evento en la sala **${e.roomName}** de MeDed Friends.`, color: COLORS.steel,
      fields: [{ name: 'Sala', value: e.roomName, inline: true }, { name: 'Hasta', value: e.endsAt ? ts(e.endsAt, 't') : null, inline: true }, { name: 'Organiza', value: e.byName || null, inline: true }],
      footer: 'MeDed Friends · HUB',
    })],
    components: [row([linkButton('Ir a la sala', link(`?view=hotel&room=${Number(e.roomId)}`))])],
  });
});
hub.on('badge:earned', (b) => {
  const u = getUser(b.userId);
  if (!u) return;
  automate('badges', {
    embeds: [embed({ title: `🏅 ${u.display_name} ganó "${b.name || badgeName(b.id)}"`, description: b.achievement ? 'Logro de la oficina' : 'Placa del HUB', color: COLORS.steel })],
  });
});
hub.on('mod:report', (r) => { modlog(reportMessage(r)); });
hub.on('mod:sanction', (s) => {
  modlog({ embeds: [embed({ title: `🛡️ ${clean(s.text, 240)}`, description: s.reason ? `Motivo: ${s.reason}` : null, color: COLORS.navy, fields: [{ name: 'Por', value: `${s.actorName}${s.source === 'discord' ? ' (Discord)' : ''}`, inline: true }], footer: 'Moderación · HUB' })] });
});
hub.on('user:login', ({ userId }) => { syncUser(userId).catch((e) => console.warn('[discord] sincronización:', e.message)); });
hub.on('user:linked', ({ userId }) => { syncUser(userId, { force: true }).catch((e) => console.warn('[discord] sincronización:', e.message)); });

// ---------- Interacciones (botones del canal de moderación) ----------
function verifyKey(hex) {
  return crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });
}
const seenSigs = new Map();
export function verifyInteraction(raw, sig, stamp, t = Date.now()) {
  const pk = publicKey();
  if (!pk || !/^[0-9a-f]{128}$/i.test(String(sig || '')) || !/^\d{1,12}$/.test(String(stamp || ''))) return false;
  if (Math.abs(t - Number(stamp) * 1000) > 5 * 60e3) return false; // viejo o del futuro: posible repetición
  let ok = false;
  try { ok = crypto.verify(null, Buffer.concat([Buffer.from(String(stamp)), raw]), verifyKey(pk), Buffer.from(sig, 'hex')); } catch { ok = false; }
  if (!ok) return false;
  for (const [k, exp] of seenSigs) if (exp < t) seenSigs.delete(k);
  if (seenSigs.has(sig)) return false; // la misma petición dos veces
  seenSigs.set(sig, t + 10 * 60e3);
  return true;
}

const ACTIONS = {
  kick: { action: 'kick', label: 'Sacar' },
  mute15: { action: 'mute', minutes: 15, label: 'Silenciar 15 min' },
  vmute: { action: 'vmute', minutes: 60, label: 'Silenciar voz' },
  ban1d: { action: 'ban', minutes: 1440, label: 'Banear 1 día' },
  ipban: { action: 'ipban', minutes: 1440, label: 'Banear + IP', adminOnly: true },
  dismiss: { action: 'dismiss', label: 'Descartar' },
};
const ephemeral = (content) => ({ type: 4, data: { content: clean(content, 1800), flags: 64, allowed_mentions: { parse: [] } } });

export function handleComponent(i) {
  const m = /^hm:([a-z0-9]+):(\d+):(\d+)$/.exec(String(i?.data?.custom_id || ''));
  const spec = m && ACTIONS[m[1]];
  if (!spec) return ephemeral('Botón desconocido.');
  if (GUILD() && i.guild_id && i.guild_id !== GUILD()) return ephemeral('Este botón es de otro servidor.');
  const du = i.member?.user || i.user;
  if (!du || !isSnowflake(du.id)) return ephemeral('No se pudo identificar quién eres.');
  const roles = Array.isArray(i.member?.roles) ? i.member.roles.map(String) : [];
  const linked = db.prepare('SELECT * FROM users WHERE discord_id = ? AND disabled = 0').get(du.id);
  const map = botConfig().roleMap || {};
  let role = null;
  if (linked?.role === 'admin') role = 'admin';
  else if (roles.some((r) => map[r]?.mod) || (linked && isModerator(linked.id))) role = 'moderator';
  const actorName = linked?.display_name || du.global_name || du.username || 'Discord';
  if (!role) {
    audit({ actor: linked?.id || null, action: `Discord: ${actorName} intentó "${spec.label}" sin permiso`, target: `user:${m[2]}`, data: { source: 'discord', discordId: du.id } });
    return ephemeral('⛔ No tienes permiso. Solo admins del HUB (con Discord vinculado) o el rol "Moderador de HUB".');
  }
  if (spec.adminOnly && role !== 'admin') return ephemeral('⛔ Solo un admin del HUB puede bloquear IPs.');
  const r = performModAction({
    actor: { id: linked?.id || null, name: actorName, role, discordId: du.id },
    targetId: Number(m[2]), action: spec.action, minutes: spec.minutes ?? null, reason: `Reporte #${m[3]}`, source: 'discord', reportId: Number(m[3]) || null,
  });
  if (r.error) return ephemeral(`No se pudo: ${r.error}`);
  // Se actualiza el mensaje: quién actuó, el resultado y los botones desactivados
  const embeds = (i.message?.embeds || []).slice(0, 1).map((e) => ({
    ...e, color: spec.action === 'dismiss' ? COLORS.navy : COLORS.ok,
    fields: [...(e.fields || []).slice(0, 20), { name: spec.action === 'dismiss' ? 'Descartado' : 'Acción tomada', value: clean(`${r.text} — por ${actorName}`, 1000) }],
  }));
  const components = (i.message?.components || []).map((rw) => ({ ...rw, components: (rw.components || []).map((c) => (c.style === 5 ? c : { ...c, disabled: true })) }));
  return { type: 7, data: { embeds, components, allowed_mentions: { parse: [] } } };
}

// Montado en server/index.js ANTES del parser JSON (la firma se calcula sobre el cuerpo crudo)
export function interactionsHandler(req, res) {
  if (!publicKey()) return res.status(404).json({ error: 'Interacciones no configuradas' });
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!verifyInteraction(raw, req.get('x-signature-ed25519'), req.get('x-signature-timestamp'))) return res.status(401).send('invalid request signature');
  let i;
  try { i = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'JSON inválido' }); }
  if (i.type === 1) return res.json({ type: 1 });
  if (i.type === 3) {
    try { return res.json(handleComponent(i)); } catch (e) {
      console.error('[discord] interacción:', e.message);
      return res.json(ephemeral('Ocurrió un error al aplicar la acción.'));
    }
  }
  return res.json(ephemeral('Tipo de interacción no soportado.'));
}

// ---------- Gateway (opcional, DISCORD_GATEWAY=1): cambios de roles al momento ----------
// Necesita el intent privilegiado "Server Members" activado en el Developer Portal.
const gateway = { status: 'off', error: null };
function startGateway() {
  if (process.env.DISCORD_GATEWAY !== '1' || !botEnabled() || typeof WebSocket === 'undefined') return;
  let ws = null, hb = null, seq = null, backoff = 2000, stop = false;
  const url = process.env.DISCORD_GATEWAY_URL || 'wss://gateway.discord.gg/?v=10&encoding=json';
  const send = (o) => { try { ws?.send(JSON.stringify(o)); } catch { /* cerrado */ } };
  const onMember = (d, gone = false) => {
    if (d?.guild_id !== GUILD() || !isSnowflake(d?.user?.id)) return;
    const u = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(d.user.id);
    if (u) { try { applyMember(u.id, gone ? null : { roles: d.roles || [], premium_since: d.premium_since || null }); } catch (e) { console.warn('[discord] gateway:', e.message); } }
  };
  const connect = () => {
    if (stop) return;
    gateway.status = 'connecting';
    ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      let p;
      try { p = JSON.parse(ev.data); } catch { return; }
      if (p.s != null) seq = p.s;
      if (p.op === 10) {
        clearInterval(hb);
        hb = setInterval(() => send({ op: 1, d: seq }), p.d.heartbeat_interval);
        hb.unref?.();
        send({ op: 2, d: { token: TOKEN(), intents: (1 << 0) | (1 << 1), properties: { os: 'linux', browser: 'hub', device: 'hub' } } });
      } else if (p.op === 1) send({ op: 1, d: seq });
      else if (p.op === 7 || p.op === 9) ws.close(4000);
      else if (p.op === 0) {
        if (p.t === 'READY') { gateway.status = 'online'; gateway.error = null; backoff = 2000; }
        if (p.t === 'GUILD_MEMBER_UPDATE' || p.t === 'GUILD_MEMBER_ADD') onMember(p.d);
        if (p.t === 'GUILD_MEMBER_REMOVE') onMember(p.d, true);
      }
    };
    ws.onclose = (ev) => {
      clearInterval(hb);
      if (ev.code === 4014) { gateway.status = 'error'; gateway.error = 'Falta activar "Server Members Intent" en el Developer Portal'; stop = true; console.warn('[discord] Gateway: activa "Server Members Intent" en el Developer Portal (Bot → Privileged Gateway Intents).'); return; }
      if (ev.code === 4004) { gateway.status = 'error'; gateway.error = 'Token del bot inválido'; stop = true; return; }
      gateway.status = 'reconnecting';
      setTimeout(connect, backoff).unref?.();
      backoff = Math.min(backoff * 2, 5 * 60e3);
    };
    ws.onerror = () => { gateway.error = 'No se pudo conectar al Gateway'; };
  };
  connect();
}

// ---------- Arranque ----------
export function startDiscordBot() {
  if (!botEnabled()) return;
  const t = setInterval(() => { syncAll().catch(() => {}); }, SYNC_MINUTES() * 60e3);
  t.unref?.();
  setTimeout(() => { syncAll().catch(() => {}); }, 20e3).unref?.();
  startGateway();
}

// ---------- Rutas ----------
const DEFAULT_RULES = [
  '1. Respeto ante todo: nada de insultos, acoso ni discriminación.',
  '2. Nada de spam ni publicidad sin permiso.',
  '3. Contenido apto para todos en los canales públicos.',
  '4. Si ves algo raro, repórtalo desde la tarjeta de la persona en el HUB.',
].join('\n');

export function infoMessage({ rules, title } = {}) {
  return {
    embeds: [embed({
      title: title ? clean(title, 200) : `Bienvenidos al ${officeName()}`,
      description: clean(rules || DEFAULT_RULES, 3000), color: COLORS.navy,
      fields: [
        { name: '🏢 HUB', value: publicBase() ? `La oficina virtual de la comunidad: ${link()}` : 'La oficina virtual de la comunidad.' },
        { name: '🏨 MeDed Friends', value: publicBase() ? `El Hotel del HUB: ${link('?view=hotel')}` : 'El Hotel del HUB: entra desde el elevador de la oficina.' },
        { name: '🔗 Vincula tu Discord', value: 'En el HUB: Preferencias → Cuenta → "Vincular Discord". Así tus roles de aquí se reflejan allá (placas, permisos y más).' },
      ],
    })],
    components: [row([linkButton('Entrar al HUB', link()), linkButton('MeDed Friends', link('?view=hotel'))])],
  };
}

export function registerDiscordBotRoutes(api, admin, { fail, wrap, broadcastUser }) {
  deps = { broadcastUser: broadcastUser || (() => {}) };
  const off = (res) => fail(res, 409, 'El bot de Discord no está configurado (faltan DISCORD_BOT_TOKEN y DISCORD_GUILD_ID).');
  const discordFail = (res, e) => fail(res, 502, e.status === 403 ? 'Discord dice que el bot no tiene permiso para eso.' : e.status === 404 ? 'Discord no encontró eso (¿el bot está en el servidor?).' : `No se pudo hablar con Discord: ${e.message}`);
  const badgeOptions = () => [
    ...ROLE_BADGES, ...STREAMER_BADGES, ...EVENT_BADGES, ...customBadges(),
  ].map((b) => ({ id: b.id, name: b.name, category: b.category, art: b.art }));

  // Lo mío: VIP y moderador por Discord
  api.get('/discord/me', (req, res) => res.json({ enabled: botEnabled(), linked: !!req.user.discord_id, vip: isDiscordVip(req.user.id), moderator: isModerator(req.user.id) }));

  // Estado y configuración (nunca incluye el token)
  admin.get('/discord', (req, res) => {
    const cfg = botConfig();
    const linked = db.prepare('SELECT COUNT(*) AS n FROM users WHERE discord_id IS NOT NULL').get().n;
    const clientId = process.env.DISCORD_CLIENT_ID || null;
    res.json({
      enabled: botEnabled(),
      env: {
        token: !!TOKEN(), guild: isSnowflake(GUILD()), publicKey: !!publicKey(), gateway: process.env.DISCORD_GATEWAY === '1',
        modWebhook: !!process.env.MOD_WEBHOOK_URL, birthdayWebhook: !!process.env.BIRTHDAY_WEBHOOK_URL, oauth: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
        publicUrl: publicBase() || null,
      },
      interactionsUrl: publicBase() ? `${publicBase()}/api/discord/interactions` : '/api/discord/interactions',
      inviteUrl: clientId ? `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=${INVITE_PERMISSIONS}` : null,
      invitePermissions: INVITE_PERMISSIONS,
      config: cfg, automations: AUTOMATIONS, themes: themeList().filter((t) => USER_THEME_IDS.includes(t.id)), badges: badgeOptions(),
      linked, sync: syncState, gateway, stats, log: sendLog.slice(0, 15),
    });
  });

  admin.get('/discord/guild', wrap(async (req, res) => {
    if (!botEnabled()) return off(res);
    try { res.json(await guildInfo({ fresh: req.query.fresh === '1' })); } catch (e) { discordFail(res, e); }
  }));

  // Mapeo de roles. Dar "admin" por un rol pide confirmar y la verificación en dos pasos.
  admin.put('/discord/roles', wrap((req, res) => {
    const raw = req.body?.roleMap;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(res, 400, 'Mapeo inválido');
    const entries = Object.entries(raw);
    if (entries.length > 100) return fail(res, 400, 'Demasiados roles');
    const map = {};
    for (const [rid, m] of entries) {
      if (rid !== 'booster' && !isSnowflake(rid)) return fail(res, 400, `ID de rol inválido: ${String(rid).slice(0, 30)}`);
      const c = cleanMapping(m);
      if (!emptyMapping(c)) map[rid] = c;
    }
    const cfg = botConfig();
    const newAdmin = Object.entries(map).filter(([rid, m]) => m.office === 'admin' && cfg.roleMap?.[rid]?.office !== 'admin').map(([rid]) => rid);
    if (newAdmin.length) {
      if (req.body?.confirmAdmin !== true) return res.status(400).json({ error: 'Confirma que ese rol de Discord dará acceso total de administrador.', code: 'confirm-admin' });
      if (!req.user.totp_enabled) return res.status(403).json({ error: 'Para que un rol de Discord dé admin, activa primero tu verificación en dos pasos (Preferencias → Cuenta).', code: 'need2fa' });
      const u = getUser(req.user.id);
      const step = checkTotp(u.totp_secret, req.body?.code, u.totp_last);
      if (step == null) return res.status(401).json({ error: 'Código de verificación incorrecto', code: 'bad-2fa' });
      db.prepare('UPDATE users SET totp_last = ? WHERE id = ?').run(step, u.id);
    }
    saveConfig({ ...cfg, roleMap: map });
    audit({ actor: req.user.id, action: `Cambió el mapeo de roles de Discord (${Object.keys(map).length} roles${newAdmin.length ? `, ${newAdmin.length} dan admin` : ''})`, target: 'discord:roles', data: { roles: Object.keys(map), admin: newAdmin }, ip: req.ip });
    res.json({ config: botConfig() });
  }));

  admin.put('/discord/automations', wrap((req, res) => {
    const raw = req.body?.automations;
    if (!raw || typeof raw !== 'object') return fail(res, 400, 'Automatizaciones inválidas');
    const cfg = botConfig();
    const next = { ...cfg.automations };
    for (const [id, a] of Object.entries(raw)) {
      if (!AUTO_IDS.includes(id)) return fail(res, 400, 'Automatización desconocida');
      const channel = a?.channel == null || a.channel === '' ? null : String(a.channel);
      if (channel && !isSnowflake(channel)) return fail(res, 400, 'ID de canal inválido');
      next[id] = { on: !!a?.on && !!channel, channel };
    }
    saveConfig({ ...cfg, automations: next });
    audit({ actor: req.user.id, action: 'Cambió las automatizaciones de Discord', target: 'discord:automations', data: Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.on ? v.channel : 'off'])), ip: req.ip });
    res.json({ config: botConfig() });
  }));

  admin.put('/discord/options', wrap((req, res) => {
    const cfg = botConfig();
    const requireMember = !!req.body?.requireMember;
    saveConfig({ ...cfg, requireMember });
    audit({ actor: req.user.id, action: `${requireMember ? 'Activó' : 'Desactivó'} "solo miembros del Discord pueden entrar"`, target: 'discord:options', ip: req.ip });
    res.json({ config: botConfig() });
  }));

  admin.post('/discord/sync', wrap(async (req, res) => {
    if (!botEnabled()) return off(res);
    audit({ actor: req.user.id, action: 'Sincronizó los roles de Discord', target: 'discord:sync', ip: req.ip });
    res.json({ sync: await syncAll() });
  }));

  admin.post('/discord/test', wrap(async (req, res) => {
    if (!botEnabled()) return off(res);
    const ch = String(req.body?.channelId || '');
    if (!isSnowflake(ch)) return fail(res, 400, 'ID de canal inválido');
    try {
      await postToChannel(ch, { embeds: [embed({ title: '✅ Prueba del HUB', description: 'Si ves esto, el bot puede publicar en este canal.', color: COLORS.steel })] }, 'test')
        .then((m) => { if (!m) throw new Error(sendLog[0]?.error || 'No se pudo enviar'); });
    } catch (e) { return discordFail(res, e); }
    audit({ actor: req.user.id, action: 'Mandó un mensaje de prueba a Discord', target: `discord:channel:${ch}`, ip: req.ip });
    res.json({ ok: true });
  }));

  // "Personalizar canal": tema del canal y mensaje de bienvenida fijado. No crea ni borra canales o roles.
  admin.post('/discord/customize', wrap(async (req, res) => {
    if (!botEnabled()) return off(res);
    const ch = String(req.body?.channelId || '');
    if (!isSnowflake(ch)) return fail(res, 400, 'ID de canal inválido');
    const topic = req.body?.topic == null ? null : clean(req.body.topic, 1024);
    const post = req.body?.post !== false;
    const pin = post && req.body?.pin !== false;
    let info;
    try { info = await guildInfo({ fresh: true }); } catch (e) { return discordFail(res, e); }
    const c = info.channels.find((x) => x.id === ch);
    if (!c) return fail(res, 404, 'Ese canal no es de texto o no es de este servidor');
    const missing = [...(topic != null ? c.missingTopic : []), ...(post ? c.missing : []), ...(pin ? c.missingPin : [])]
      .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
    if (missing.length) return res.status(409).json({ error: `Al bot le faltan permisos en #${c.name}: ${missing.map((m) => m.name).join(', ')}`, code: 'missing-perms', missing });
    const steps = [];
    try {
      if (topic != null) { await dapi('PATCH', `/channels/${ch}`, { topic }, { reason: `HUB: ${req.user.display_name}` }); steps.push('topic'); }
      if (post) {
        const m = await postToChannel(ch, infoMessage({ rules: req.body?.rules, title: req.body?.title }), 'info');
        if (!m) throw new DiscordError(0, { message: sendLog[0]?.error || 'No se pudo publicar' });
        steps.push('post');
        if (pin) { await dapi('PUT', `/channels/${ch}/pins/${m.id}`, undefined, { reason: 'HUB: mensaje de bienvenida' }); steps.push('pin'); }
      }
    } catch (e) {
      audit({ actor: req.user.id, action: `Intentó personalizar #${c.name} en Discord (falló)`, target: `discord:channel:${ch}`, data: { steps, error: e.message }, ip: req.ip });
      return discordFail(res, e);
    }
    guildCache.at = 0;
    audit({ actor: req.user.id, action: `Personalizó el canal #${c.name} de Discord (${steps.join(', ')})`, target: `discord:channel:${ch}`, data: { steps }, ip: req.ip });
    res.json({ ok: true, steps });
  }));
}

// Para pruebas
export const _discordBot = { buckets, sendLog, syncState, reset: () => { buckets.clear(); globalUntil = 0; guildCache = { at: 0, data: null }; } };
