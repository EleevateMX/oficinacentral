// Enlace público para unirse con Discord (/unete/<clave>), con un Discord falso (OAuth + bot).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { startServer, Client, adminClient, createMember } from './helpers/server.js';
import { startFakeDiscord, waitFor, IDS } from './helpers/fakeDiscord.js';

let fake, srv, admin;
let ipSeq = 10;
const newIp = () => `198.51.100.${++ipSeq}`;
// Id de Discord creado hace `days` días (la fecha va dentro del id)
const snowAgo = (days, n = 0) => String((BigInt(Date.now() - days * 864e5 - 1420070400000) << 22n) + BigInt(n));
let uniq = 0;
const profile = (over = {}) => ({ id: snowAgo(400, ++uniq), username: `persona${uniq}`, global_name: `Persona ${uniq}`, ...over });

before(async () => {
  fake = await startFakeDiscord();
  srv = await startServer({
    env: {
      DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'csecret', DISCORD_API_BASE: fake.apiBase, DISCORD_AUTHORIZE_URL: `${fake.base}/authorize`,
      DISCORD_BOT_TOKEN: 'test-bot-token', DISCORD_GUILD_ID: IDS.guild, TRUST_PROXY: '1', DISCORD_SYNC_MINUTES: '600',
    },
  });
  admin = await adminClient(srv.url);
});
after(async () => { await srv?.stop(); await fake?.close(); });

const cfg = (patch) => admin.put('/admin/public-join', patch);

// Ida y vuelta de OAuth sin navegador desde una IP; devuelve { location, sid, pend, start }
async function join(query, { ip = newIp(), prof } = {}) {
  if (prof) fake.state.profile = prof;
  const h = { 'x-forwarded-for': ip };
  const start = await fetch(`${srv.url}/api/auth/discord?mode=join&${query}`, { headers: h, redirect: 'manual' });
  const loc = start.headers.get('location');
  if (!loc.startsWith(fake.base)) return { start: loc };
  const state = new URL(loc).searchParams.get('state');
  const sc = start.headers.getSetCookie().find((c) => c.startsWith('oc_dstate=')).split(';')[0];
  const cb = await fetch(`${srv.url}/api/auth/discord/callback?code=abc&state=${state}`, { headers: { ...h, cookie: sc }, redirect: 'manual' });
  const ck = (n) => cb.headers.getSetCookie().find((c) => c.startsWith(`${n}=`))?.split(';')[0].slice(n.length + 1);
  return { location: cb.headers.get('location'), sid: ck('oc_sid'), pend: ck('oc_jpend') };
}
const reasonOf = (r) => new URL(r.location, 'http://x').searchParams.get('reason');
const withSid = (sid) => { const c = new Client(srv.url); c.cookies.set('oc_sid', sid); return c; };

test('el enlace público está apagado por defecto', async () => {
  const st = (await admin.get('/admin/public-join')).data;
  assert.equal(st.config.enabled, false);
  assert.equal(st.oauth, true);
  assert.equal(st.config.requireGuild, true, 'con el bot configurado, solo miembros del servidor por defecto');
  assert.equal(st.config.minAgeDays, 7);
  const info = (await new Client(srv.url).get(`/join/info?slug=${st.config.slug}`)).data;
  assert.equal(info.available, false);
  assert.equal(info.reason, 'off');
  const r = await join(`slug=${st.config.slug}`);
  assert.equal(r.start, '/?join=error&reason=slug');
  // Un miembro no puede tocar la configuración
  const m = await createMember(srv.url, admin, 'Curioso');
  assert.equal((await m.get('/admin/public-join')).status, 403);
});

test('encendido: Discord crea un miembro y la segunda vez entra a la misma cuenta', async () => {
  const st = (await cfg({ enabled: true, requireGuild: false, perIpHour: 50 })).data;
  const slug = st.config.slug;
  const info = (await new Client(srv.url).get(`/join/info?slug=${slug}`)).data;
  assert.equal(info.available, true);
  const p = profile({ username: 'nuevo_gh', global_name: 'Admin​ Oficial' }); // nombre reservado con invisible: se limpia
  const r = await join(`slug=${slug}`, { prof: p });
  assert.equal(r.location, '/?discord=welcome');
  assert.ok(r.sid);
  const me = (await withSid(r.sid).get('/auth/me')).data.user;
  assert.equal(me.role, 'member');
  assert.equal(me.discordName, 'nuevo_gh');
  assert.equal(me.displayName, 'nuevo_gh', 'el nombre reservado se cambia por el usuario de Discord');
  // Segunda vez: misma cuenta
  const again = await join(`slug=${slug}`, { prof: p });
  assert.equal(again.location, '/?discord=ok');
  assert.equal((await withSid(again.sid).get('/auth/me')).data.user.id, me.id);
  // Un solo HUB por Discord
  const d = new DatabaseSync(path.join(srv.dataDir, 'office.db'));
  d.exec('PRAGMA busy_timeout = 5000'); // el servidor puede estar escribiendo (auditoría) al mismo tiempo
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM users WHERE discord_id = ?').get(p.id).n, 1);
  assert.throws(() => d.prepare('UPDATE users SET discord_id = ? WHERE id = 1').run(p.id), /UNIQUE/);
  // Registro de auditoría con su origen
  const log = d.prepare("SELECT * FROM audit_log WHERE target = 'public-link' AND actor_id = ?").get(me.id);
  d.close();
  assert.ok(log);
  assert.match(log.data, /public-link/);
  assert.equal((await admin.get('/admin/public-join')).data.counts.today >= 1, true);
});

test('una clave equivocada o regenerada se rechaza', async () => {
  const old = (await admin.get('/admin/public-join')).data.config.slug;
  assert.equal((await join('slug=inventada')).start, '/?join=error&reason=slug');
  assert.equal((await new Client(srv.url).get('/join/info?slug=inventada')).data.reason, 'slug');
  assert.equal((await new Client(srv.url).get('/join/info')).data.reason, 'slug', '/unete sin clave está apagado por defecto');
  const fresh = (await admin.post('/admin/public-join/rotate')).data.config.slug;
  assert.notEqual(fresh, old);
  assert.equal((await join(`slug=${old}`)).start, '/?join=error&reason=slug');
  assert.equal((await new Client(srv.url).get(`/join/info?slug=${fresh}`)).data.available, true);
  // Clave bonita y /unete sin clave
  assert.equal((await cfg({ slug: 'no válida!' })).status, 400);
  assert.equal((await cfg({ slug: 'hub' })).data.config.slug, 'hub');
  assert.equal((await new Client(srv.url).get('/join/info?slug=hub')).data.available, true);
  await cfg({ allowBare: true });
  assert.equal((await new Client(srv.url).get('/join/info')).data.available, true);
  const r = await join('', { prof: profile() });
  assert.equal(r.location, '/?discord=welcome');
  await cfg({ allowBare: false });
});

test('cuentas de Discord muy nuevas no entran', async () => {
  const r = await join('slug=hub', { prof: profile({ id: snowAgo(2, 1) }) });
  assert.equal(reasonOf(r), 'young');
  assert.equal(r.sid, undefined);
  await cfg({ minAgeDays: 1 });
  const ok = await join('slug=hub', { prof: profile({ id: snowAgo(2, 2) }) });
  assert.equal(ok.location, '/?discord=welcome');
  await cfg({ minAgeDays: 7 });
});

test('topes por IP y global, y pausa de registros', async () => {
  await cfg({ perIpHour: 2 });
  const ip = newIp();
  assert.equal((await join('slug=hub', { ip, prof: profile() })).location, '/?discord=welcome');
  assert.equal((await join('slug=hub', { ip, prof: profile() })).location, '/?discord=welcome');
  assert.equal(reasonOf(await join('slug=hub', { ip, prof: profile() })), 'iplimit');
  assert.equal((await join('slug=hub', { prof: profile() })).location, '/?discord=welcome', 'desde otra IP sí');
  await cfg({ perIpHour: 50 });
  // Tope global
  const hour = (await admin.get('/admin/public-join')).data.counts.hour;
  await cfg({ globalHour: hour });
  assert.equal(reasonOf(await join('slug=hub', { prof: profile() })), 'busy');
  await cfg({ globalHour: 1000 });
  // Pausa: nadie nuevo, pero quien ya tiene cuenta sí entra
  const p = profile();
  assert.equal((await join('slug=hub', { prof: p })).location, '/?discord=welcome');
  await cfg({ paused: true });
  assert.equal((await new Client(srv.url).get('/join/info?slug=hub')).data.reason, 'paused');
  assert.equal(reasonOf(await join('slug=hub', { prof: profile() })), 'paused');
  assert.equal((await join('slug=hub', { prof: p })).location, '/?discord=ok');
  await cfg({ paused: false });
});

test('cola de aprobación: la cuenta espera hasta que un admin la aprueba', async () => {
  await cfg({ approval: true });
  const p = profile({ global_name: 'Esperanza' });
  const r = await join('slug=hub', { prof: p });
  assert.equal(r.location, '/?join=pending');
  assert.equal(r.sid, undefined);
  assert.ok(r.pend);
  const waiting = new Client(srv.url);
  waiting.cookies.set('oc_jpend', r.pend);
  assert.equal((await waiting.get('/join/status')).data.status, 'pending');
  const st = (await admin.get('/admin/public-join')).data;
  const person = st.pending.find((x) => x.name === 'Esperanza');
  assert.ok(person);
  assert.equal((await admin.post(`/admin/public-join/${person.userId}/approve`)).status, 200);
  const done = await waiting.get('/join/status');
  assert.equal(done.data.status, 'approved');
  assert.ok(waiting.cookies.get('oc_sid'));
  assert.equal((await waiting.get('/auth/me')).data.user.displayName, 'Esperanza');
  // Rechazo
  const q = profile({ global_name: 'Troll' });
  const r2 = await join('slug=hub', { prof: q });
  const id2 = (await admin.get('/admin/public-join')).data.pending.find((x) => x.name === 'Troll').userId;
  await admin.post(`/admin/public-join/${id2}/reject`);
  const c2 = new Client(srv.url);
  c2.cookies.set('oc_jpend', r2.pend);
  assert.equal((await c2.get('/join/status')).data.status, 'rejected');
  assert.equal((await join('slug=hub', { prof: q })).location, '/?join=rejected');
  assert.equal((await admin.post(`/admin/public-join/${id2}/approve`)).status, 404);
  await cfg({ approval: false });
});

test('una IP bloqueada no puede unirse', async () => {
  const bad = await createMember(srv.url, admin, 'Baneable');
  const IP = '203.0.113.50';
  await new Promise((resolve, reject) => {
    const s = io(srv.url, { extraHeaders: { cookie: `oc_sid=${bad.cookies.get('oc_sid')}`, 'x-forwarded-for': IP }, transports: ['websocket'], reconnection: false, forceNew: true });
    s.on('hello', () => { s.close(); resolve(); });
    s.on('connect_error', reject);
  });
  assert.equal((await admin.post('/admin/ipbans', { userId: bad.user.id, days: 1 })).status, 200);
  const r = await join('slug=hub', { ip: IP, prof: profile() });
  assert.equal(r.start, '/?discord=ipbanned');
});

test('solo miembros del servidor de Discord (con el bot)', async () => {
  await cfg({ requireGuild: true });
  assert.equal((await admin.put('/admin/discord/automations', { automations: { welcome: { on: true, channel: IDS.welcome } } })).status, 200);
  assert.equal((await new Client(srv.url).get('/join/info?slug=hub')).data.requireGuild, true);
  const outsider = profile();
  assert.equal(reasonOf(await join('slug=hub', { prof: outsider })), 'notmember');
  const member = profile();
  fake.state.members[member.id] = { roles: [] };
  assert.equal((await join('slug=hub', { prof: member })).location, '/?discord=welcome');
  // Bienvenida automática en Discord (member:joined)
  assert.ok(await waitFor(() => fake.state.messages.some((x) => x.channelId === IDS.welcome && JSON.stringify(x.body).includes(member.global_name))));
});

test('las invitaciones y el login con Discord siguen igual', async () => {
  fake.state.profile = profile();
  const start = await fetch(`${srv.url}/api/auth/discord?mode=login`, { headers: { 'x-forwarded-for': newIp() }, redirect: 'manual' });
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const sc = start.headers.getSetCookie().find((c) => c.startsWith('oc_dstate=')).split(';')[0];
  const cb = await fetch(`${srv.url}/api/auth/discord/callback?code=abc&state=${state}`, { headers: { cookie: sc }, redirect: 'manual' });
  assert.equal(cb.headers.get('location'), '/?discord=nolink', 'el login normal no crea cuentas');
  const m = await createMember(srv.url, admin, 'Invitada');
  assert.equal(m.user.role, 'member');
});
