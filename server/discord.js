// Entrar con Discord (OAuth2). La oficina sigue siendo solo por invitación:
// Discord sirve para vincular una cuenta existente, entrar con ella, o
// aceptar una invitación sin crear contraseña.
import crypto from 'node:crypto';
import express from 'express';
import { db, now, tx } from './db.js';
import { isBanned } from './moderation.js';
import { createSession, sessionCookie, hashPassword, defaultAvatar, randomToken, parseCookies } from './auth.js';
import { newLoginTicket, audit } from './security.js';

const API = () => process.env.DISCORD_API_BASE || 'https://discord.com/api';
const AUTHORIZE = () => process.env.DISCORD_AUTHORIZE_URL || 'https://discord.com/oauth2/authorize';
export const discordEnabled = () => !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

const STATE_COOKIE = 'oc_dstate';
const states = new Map(); // state -> { mode, invite, userId, exp }

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}
const redirectUri = (req) => `${baseUrl(req)}/api/auth/discord/callback`;

function back(res, query) {
  res.redirect(`/?${new URLSearchParams(query)}`);
}

async function exchange(req, code) {
  const r = await fetch(`${API()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code', code, redirect_uri: redirectUri(req),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const { access_token: token } = await r.json();
  const me = await fetch(`${API()}/users/@me`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!me.ok) throw new Error(`perfil ${me.status}`);
  return me.json();
}

// Nombre de usuario libre a partir del de Discord
function freeUsername(base) {
  let u = String(base || 'usuario').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_.-]/g, '').slice(0, 20) || 'usuario';
  if (u.length < 3) u = `${u}usr`;
  let cand = u;
  for (let i = 2; db.prepare('SELECT 1 FROM users WHERE username = ?').get(cand); i++) cand = `${u}${i}`;
  return cand;
}

// Celular con la app instalada (sobre todo iPhone): Discord regresa al navegador, que no
// comparte la sesión con la app. La app espera con un "pase" (handoff) y, cuando quien
// autorizó lo confirma en el navegador, la app recibe la sesión.
const handoffs = new Map(); // hid -> { st, profile, confirm, ready, result, exp }
const HANDOFF_TTL = 10 * 60e3;
function sweep() {
  const t = Date.now();
  for (const [k, v] of states) if (v.exp < t) states.delete(k);
  for (const [k, v] of handoffs) if (v.exp < t) handoffs.delete(k);
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function page(res, title, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101010;color:#fff;font:16px/1.45 system-ui,-apple-system,sans-serif;padding:20px;box-sizing:border-box}
.card{max-width:360px;width:100%;background:#1c1c21;border-radius:18px;padding:26px 22px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}
h1{font-size:20px;margin:0 0 8px}p{color:#c9c9d1;margin:0 0 14px}.code{font:800 30px/1 ui-monospace,monospace;letter-spacing:6px;background:#26262d;border-radius:12px;padding:14px;margin:6px 0 16px;color:#FFCC00}
button{width:100%;border:0;border-radius:12px;padding:14px;font:700 16px system-ui,sans-serif;background:#5865F2;color:#fff;cursor:pointer}.muted{font-size:13px;color:#8d8d96;margin-top:14px}
</style></head><body><div class="card">${body}</div></body></html>`);
}

export function registerDiscordRoutes(api, { validInvite, userFromReq, publicUser, broadcastUser }) {
  // Crea el "state" de OAuth y la URL de Discord
  function begin(req, res, { mode, invite, handoff }) {
    sweep();
    mode = ['login', 'link', 'invite'].includes(mode) ? mode : 'login';
    const st = { mode, exp: Date.now() + HANDOFF_TTL };
    if (mode === 'link') {
      const u = userFromReq(req);
      if (!u) return { error: 'error' };
      st.userId = u.id;
    }
    if (mode === 'invite') {
      if (!validInvite(invite)) return { error: 'invite' };
      st.invite = String(invite);
    }
    const out = {};
    if (handoff) {
      st.hid = crypto.randomBytes(24).toString('base64url');
      st.code = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
      handoffs.set(st.hid, { ready: false, exp: st.exp });
      Object.assign(out, { hid: st.hid, code: st.code });
    }
    const state = crypto.randomBytes(18).toString('base64url');
    states.set(state, st);
    const secure = process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/api/auth/discord; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
    const q = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify', redirect_uri: redirectUri(req), state, prompt: 'none' });
    out.url = `${AUTHORIZE()}?${q}`;
    return out;
  }

  // Inicio (navegador): mode = login | link | invite
  api.get('/auth/discord', (req, res) => {
    if (!discordEnabled()) return res.status(404).send('Discord no está configurado');
    const r = begin(req, res, { mode: req.query.mode, invite: req.query.invite });
    if (r.error) return back(res, { discord: r.error });
    res.redirect(r.url);
  });

  // Inicio (celular): devuelve la URL para abrir la app de Discord y, si se pide, un pase para la app instalada
  api.post('/auth/discord/start', (req, res) => {
    if (!discordEnabled()) return res.status(404).json({ error: 'Discord no está configurado' });
    const b = req.body || {};
    const r = begin(req, res, { mode: b.mode, invite: b.invite, handoff: !!b.handoff });
    if (r.error) return res.status(400).json({ error: r.error });
    res.json(r);
  });

  // Aplica el resultado de Discord: devuelve { query, session } sin tocar la respuesta
  function resolve(st, profile, req) {
    const did = String(profile.id);
    const dname = String(profile.username || '').slice(0, 40);
    const linked = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(did);

    if (st.mode === 'link') {
      if (linked && linked.id !== st.userId) return { query: { discord: 'taken' } };
      db.prepare('UPDATE users SET discord_id = ?, discord_name = ? WHERE id = ?').run(did, dname, st.userId);
      audit({ actor: st.userId, action: `Vinculó su cuenta de Discord (${dname})`, ip: req.ip });
      broadcastUser(st.userId);
      return { query: { discord: 'linked' } };
    }

    if (st.mode === 'invite') {
      if (linked) return { query: { discord: 'taken' } };
      const inv = validInvite(st.invite);
      if (!inv) return { query: { discord: 'invite' } };
      const username = freeUsername(profile.username);
      const display = String(profile.global_name || inv.note || profile.username || username).slice(0, 40);
      const id = tx(() => {
        const uid = Number(db.prepare(`INSERT INTO users (username, email, display_name, password_hash, role, avatar, created_at, discord_id, discord_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, inv.email || '', display, hashPassword(randomToken(24)), inv.role, JSON.stringify(defaultAvatar(username)), now(), did, dname).lastInsertRowid);
        db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE token = ?').run(uid, now(), inv.token);
        return uid;
      });
      broadcastUser(id);
      return { query: { discord: 'welcome' }, session: id };
    }

    // login
    if (!linked) return { query: { discord: 'nolink' } };
    if (linked.disabled || isBanned(linked.id)) return { query: { discord: 'disabled' } };
    if (linked.totp_enabled) return { query: { login2fa: newLoginTicket(linked.id) } };
    if (linked.role === 'admin') audit({ actor: linked.id, action: 'Inició sesión con Discord (admin)', ip: req.ip });
    return { query: { discord: 'ok' }, session: linked.id };
  }

  api.get('/auth/discord/callback', async (req, res) => {
    const state = String(req.query.state || '');
    const st = states.get(state);
    states.delete(state);
    const cookieOk = parseCookies(req.headers.cookie)[STATE_COOKIE] === state;
    const ho = st?.hid && handoffs.get(st.hid);
    if (!st || st.exp < Date.now() || (!cookieOk && !ho)) return back(res, { discord: 'error' });
    if (req.query.error || !req.query.code) {
      if (ho) Object.assign(ho, { ready: true, result: { query: { discord: 'cancel' } } });
      return cookieOk ? back(res, { discord: 'cancel' }) : page(res, 'Cancelado', '<h1>Cancelado</h1><p>No se inició sesión. Puedes cerrar esta pestaña.</p>');
    }
    let profile;
    try { profile = await exchange(req, String(req.query.code)); } catch (e) {
      console.error('Discord:', e.message);
      if (ho) Object.assign(ho, { ready: true, result: { query: { discord: 'error' } } });
      return cookieOk ? back(res, { discord: 'error' }) : page(res, 'Error', '<h1>No se pudo conectar con Discord</h1><p>Vuelve a la app e inténtalo de nuevo.</p>');
    }

    if (cookieOk) {
      // Mismo navegador: se entra aquí y, si la app instalada está esperando, también allá
      const r = resolve(st, profile, req);
      if (r.session) res.setHeader('Set-Cookie', sessionCookie(createSession(r.session)));
      if (ho) Object.assign(ho, { ready: true, result: r });
      return back(res, r.query);
    }

    // Otro navegador (la app instalada espera): se pide confirmar con el código que muestra la app
    ho.st = st;
    ho.profile = profile;
    ho.confirm = crypto.randomBytes(18).toString('base64url');
    const who = esc(profile.global_name || profile.username || 'tu cuenta');
    return page(res, 'Confirmar inicio de sesión', `<h1>¿Entrar como ${who}?</h1>
<p>Confirma solo si en la app de la oficina ves este mismo código:</p><div class="code">${esc(st.code)}</div>
<form method="post" action="/api/auth/discord/handoff/confirm"><input type="hidden" name="t" value="${ho.confirm}"><input type="hidden" name="h" value="${esc(st.hid)}">
<button>Sí, es mi código</button></form><p class="muted">Si no pediste entrar, cierra esta página.</p>`);
  });

  api.post('/auth/discord/handoff/confirm', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    const b = req.body || {};
    const ho = handoffs.get(String(b.h || ''));
    if (!ho || !ho.confirm || ho.confirm !== String(b.t || '') || ho.exp < Date.now()) {
      return page(res, 'Expiró', '<h1>Este enlace ya no es válido</h1><p>Vuelve a la app e inténtalo de nuevo.</p>');
    }
    ho.confirm = null;
    Object.assign(ho, { ready: true, result: resolve(ho.st, ho.profile, req) });
    ho.st = null;
    ho.profile = null;
    return page(res, 'Listo', '<h1>¡Listo! ✅</h1><p>Regresa a la app de la oficina: ya entraste.</p><p class="muted">Puedes cerrar esta pestaña.</p>');
  });

  // La app instalada pregunta si ya terminó
  api.get('/auth/discord/handoff/:hid', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const ho = handoffs.get(String(req.params.hid));
    if (!ho || ho.exp < Date.now()) return res.status(404).json({ status: 'expired' });
    if (!ho.ready) return res.json({ status: 'pending' });
    handoffs.delete(String(req.params.hid));
    const r = ho.result || { query: { discord: 'error' } };
    if (r.session) res.setHeader('Set-Cookie', sessionCookie(createSession(r.session)));
    res.json({ status: 'done', query: new URLSearchParams(r.query).toString() });
  });

  api.post('/me/discord/unlink', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'Inicia sesión' });
    db.prepare('UPDATE users SET discord_id = NULL, discord_name = NULL WHERE id = ?').run(u.id);
    broadcastUser(u.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
  });
}
