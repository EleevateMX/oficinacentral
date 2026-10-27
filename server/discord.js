// Entrar con Discord (OAuth2). La oficina sigue siendo solo por invitación:
// Discord sirve para vincular una cuenta existente, entrar con ella, o
// aceptar una invitación sin crear contraseña.
import crypto from 'node:crypto';
import { db, now, tx } from './db.js';
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

export function registerDiscordRoutes(api, { validInvite, userFromReq, publicUser, broadcastUser }) {
  // Inicio: mode = login | link | invite
  api.get('/auth/discord', (req, res) => {
    if (!discordEnabled()) return res.status(404).send('Discord no está configurado');
    const mode = ['login', 'link', 'invite'].includes(req.query.mode) ? req.query.mode : 'login';
    const st = { mode, exp: Date.now() + 10 * 60e3 };
    if (mode === 'link') {
      const u = userFromReq(req);
      if (!u) return back(res, { discord: 'error' });
      st.userId = u.id;
    }
    if (mode === 'invite') {
      if (!validInvite(req.query.invite)) return back(res, { discord: 'invite' });
      st.invite = String(req.query.invite);
    }
    const state = crypto.randomBytes(18).toString('base64url');
    states.set(state, st);
    const secure = process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/api/auth/discord; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
    const q = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify', redirect_uri: redirectUri(req), state, prompt: 'none' });
    res.redirect(`${AUTHORIZE()}?${q}`);
  });

  api.get('/auth/discord/callback', async (req, res) => {
    const state = String(req.query.state || '');
    const st = states.get(state);
    states.delete(state);
    if (!st || st.exp < Date.now() || parseCookies(req.headers.cookie)[STATE_COOKIE] !== state) return back(res, { discord: 'error' });
    if (req.query.error || !req.query.code) return back(res, { discord: 'cancel' });
    let profile;
    try { profile = await exchange(req, String(req.query.code)); } catch (e) {
      console.error('Discord:', e.message);
      return back(res, { discord: 'error' });
    }
    const did = String(profile.id);
    const dname = String(profile.username || '').slice(0, 40);
    const linked = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(did);

    if (st.mode === 'link') {
      if (linked && linked.id !== st.userId) return back(res, { discord: 'taken' });
      db.prepare('UPDATE users SET discord_id = ?, discord_name = ? WHERE id = ?').run(did, dname, st.userId);
      audit({ actor: st.userId, action: `Vinculó su cuenta de Discord (${dname})`, ip: req.ip });
      broadcastUser(st.userId);
      return back(res, { discord: 'linked' });
    }

    if (st.mode === 'invite') {
      if (linked) return back(res, { discord: 'taken' });
      const inv = validInvite(st.invite);
      if (!inv) return back(res, { discord: 'invite' });
      const username = freeUsername(profile.username);
      const display = String(profile.global_name || inv.note || profile.username || username).slice(0, 40);
      const id = tx(() => {
        const uid = Number(db.prepare(`INSERT INTO users (username, email, display_name, password_hash, role, avatar, created_at, discord_id, discord_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, inv.email || '', display, hashPassword(randomToken(24)), inv.role, JSON.stringify(defaultAvatar(username)), now(), did, dname).lastInsertRowid);
        db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE token = ?').run(uid, now(), inv.token);
        return uid;
      });
      broadcastUser(id);
      res.setHeader('Set-Cookie', sessionCookie(createSession(id)));
      return back(res, { discord: 'welcome' });
    }

    // login
    if (!linked) return back(res, { discord: 'nolink' });
    if (linked.disabled) return back(res, { discord: 'disabled' });
    if (linked.totp_enabled) return back(res, { login2fa: newLoginTicket(linked.id) });
    if (linked.role === 'admin') audit({ actor: linked.id, action: 'Inició sesión con Discord (admin)', ip: req.ip });
    res.setHeader('Set-Cookie', sessionCookie(createSession(linked.id)));
    return back(res, { discord: 'ok' });
  });

  api.post('/me/discord/unlink', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'Inicia sesión' });
    db.prepare('UPDATE users SET discord_id = NULL, discord_name = NULL WHERE id = ?').run(u.id);
    broadcastUser(u.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
  });
}
