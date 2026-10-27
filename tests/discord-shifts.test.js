// Entrar con Discord (con un Discord simulado) y reporte de turnos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, Client, adminClient, createMember } from './helpers/server.js';

let fake;
let srv;
let admin;
let nextProfile = { id: '111', username: 'kevin_gh', global_name: 'Kevin GH' };

before(async () => {
  // Discord falso: token y perfil
  fake = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/oauth2/token') return res.end(JSON.stringify({ access_token: 'tok' }));
    if (req.url === '/api/users/@me') return res.end(JSON.stringify(nextProfile));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${fake.address().port}`;
  srv = await startServer({ env: { DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'csecret', DISCORD_API_BASE: `${base}/api`, DISCORD_AUTHORIZE_URL: `${base}/authorize` } });
  admin = await adminClient(srv.url);
});
after(async () => { await srv?.stop(); fake?.close(); });

// Hace el ida y vuelta de OAuth sin navegador; devuelve la URL final de regreso
async function oauth(client, query) {
  const headers = client?.cookies?.size ? { cookie: [...client.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {};
  const start = await fetch(`${srv.url}/api/auth/discord?${query}`, { headers, redirect: 'manual' });
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location'));
  assert.equal(loc.searchParams.get('scope'), 'identify');
  const state = loc.searchParams.get('state');
  const stateCookie = start.headers.getSetCookie().find((c) => c.startsWith('oc_dstate=')).split(';')[0];
  const cb = await fetch(`${srv.url}/api/auth/discord/callback?code=abc&state=${state}`, { headers: { cookie: [headers.cookie, stateCookie].filter(Boolean).join('; ') }, redirect: 'manual' });
  const sid = cb.headers.getSetCookie().find((c) => c.startsWith('oc_sid='));
  return { location: cb.headers.get('location'), sid: sid && sid.split(';')[0].slice(7) };
}

test('la configuración anuncia el botón de Discord', async () => {
  assert.equal((await admin.get('/config')).data.discordLogin, true);
});

test('un Discord sin vincular no entra', async () => {
  const r = await oauth(null, 'mode=login');
  assert.equal(r.location, '/?discord=nolink');
  assert.equal(r.sid, undefined);
});

test('vincular y luego entrar con Discord', async () => {
  const m = await createMember(srv.url, admin, 'Kevin');
  const link = await oauth(m, 'mode=link');
  assert.equal(link.location, '/?discord=linked');
  assert.equal((await m.get('/auth/me')).data.user.discordName, 'kevin_gh');
  const login = await oauth(null, 'mode=login');
  assert.equal(login.location, '/?discord=ok');
  const c = new Client(srv.url);
  c.cookies.set('oc_sid', login.sid);
  assert.equal((await c.get('/auth/me')).data.user.id, m.user.id);
  // Otro usuario no puede vincular el mismo Discord
  const other = await createMember(srv.url, admin, 'Otro');
  assert.equal((await oauth(other, 'mode=link')).location, '/?discord=taken');
});

test('un state inventado se rechaza', async () => {
  const cb = await fetch(`${srv.url}/api/auth/discord/callback?code=abc&state=inventado`, { redirect: 'manual' });
  assert.equal(cb.headers.get('location'), '/?discord=error');
});

test('aceptar una invitación con Discord crea la cuenta vinculada', async () => {
  const inv = (await admin.post('/admin/invites/batch', { rows: [{ name: 'Ana Pérez' }] })).data.invites[0];
  nextProfile = { id: '222', username: 'ana.gh', global_name: 'Ana' };
  const r = await oauth(null, `mode=invite&invite=${inv.token}`);
  assert.equal(r.location, '/?discord=welcome');
  const c = new Client(srv.url);
  c.cookies.set('oc_sid', r.sid);
  const me = (await c.get('/auth/me')).data.user;
  assert.equal(me.displayName, 'Ana');
  assert.equal(me.discordName, 'ana.gh');
  // La invitación ya no sirve
  assert.equal((await new Client(srv.url).get(`/invites/${inv.token}`)).status, 404);
});

test('reporte de turnos suma horas por persona y turno, recortadas al rango', async () => {
  const m = await createMember(srv.url, admin, 'Turnera');
  assert.equal((await m.put('/me/shift', { shift: 'Andromeda' })).status, 200);
  const db = new DatabaseSync(path.join(srv.dataDir, 'office.db'));
  const H = 3600e3;
  const t0 = Date.now() - 10 * H;
  db.prepare('INSERT INTO shift_log (user_id, shift, started_at, ended_at) VALUES (?, ?, ?, ?)').run(m.user.id, 'Soporte', t0, t0 + 2 * H);
  db.prepare('INSERT INTO shift_log (user_id, shift, started_at, ended_at) VALUES (?, ?, ?, ?)').run(m.user.id, 'Soporte', t0 + 3 * H, t0 + 4 * H);
  db.close();
  const r = await admin.get(`/admin/shifts/report?from=${t0 + H}&to=${Date.now()}`);
  const sop = r.data.rows.find((x) => x.userId === m.user.id && x.shift === 'Soporte');
  assert.equal(sop.minutes, 120, '1 h recortada + 1 h completa');
  assert.equal(sop.sessions, 2);
  assert.equal((await m.get('/admin/shifts/report')).status, 403);
  // Salir de turno cierra el periodo abierto
  await m.put('/me/shift', { shift: null });
  const db2 = new DatabaseSync(path.join(srv.dataDir, 'office.db'));
  assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM shift_log WHERE user_id = ? AND ended_at IS NULL').get(m.user.id).n, 0);
  db2.close();
});

test('app instalada en el celular: entra con un pase tras confirmar el código en el navegador', async () => {
  nextProfile = { id: '111', username: 'kevin_gh', global_name: 'Kevin GH' };
  const app = new Client(srv.url);
  const st = await app.post('/auth/discord/start', { mode: 'login', handoff: true });
  assert.equal(st.status, 200);
  assert.match(st.data.code, /^[0-9A-F]{4}$/);
  const state = new URL(st.data.url).searchParams.get('state');
  assert.equal((await app.get(`/auth/discord/handoff/${st.data.hid}`)).data.status, 'pending');

  // Discord regresa a otro navegador (sin la cookie de la app): pide confirmar el código
  const cb = await fetch(`${srv.url}/api/auth/discord/callback?code=abc&state=${state}`, { redirect: 'manual' });
  assert.equal(cb.status, 200);
  const html = await cb.text();
  assert.ok(html.includes(st.data.code));
  assert.equal(cb.headers.getSetCookie().some((c) => c.startsWith('oc_sid=')), false);
  assert.equal((await app.get(`/auth/discord/handoff/${st.data.hid}`)).data.status, 'pending');

  // Un token de confirmación falso no sirve
  const bad = await fetch(`${srv.url}/api/auth/discord/handoff/confirm`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `h=${st.data.hid}&t=falso` });
  assert.ok((await bad.text()).includes('ya no es válido'));

  const t = html.match(/name="t" value="([^"]+)"/)[1];
  const ok = await fetch(`${srv.url}/api/auth/discord/handoff/confirm`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `h=${st.data.hid}&t=${t}` });
  assert.ok((await ok.text()).includes('Listo'));

  // La app recoge la sesión una sola vez
  const done = await app.get(`/auth/discord/handoff/${st.data.hid}`);
  assert.equal(done.data.status, 'done');
  assert.equal(done.data.query, 'discord=ok');
  assert.equal((await app.get('/auth/me')).data.user.discordName, 'kevin_gh');
  assert.equal((await app.get(`/auth/discord/handoff/${st.data.hid}`)).status, 404);
});

test('mismo navegador con pase: entra ahí y la app también recibe la sesión', async () => {
  nextProfile = { id: '111', username: 'kevin_gh', global_name: 'Kevin GH' };
  const app = new Client(srv.url);
  const st = await app.post('/auth/discord/start', { mode: 'login', handoff: true });
  const state = new URL(st.data.url).searchParams.get('state');
  const cb = await fetch(`${srv.url}/api/auth/discord/callback?code=abc&state=${state}`, { headers: { cookie: `oc_dstate=${app.cookies.get('oc_dstate')}` }, redirect: 'manual' });
  assert.equal(cb.headers.get('location'), '/?discord=ok');
  assert.equal((await app.get(`/auth/discord/handoff/${st.data.hid}`)).data.status, 'done');
  assert.equal((await app.get('/auth/me')).status, 200);
});
