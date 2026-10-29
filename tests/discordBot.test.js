// Integración con Discord (con un Discord falso): roles → placas/admin/VIP, automatizaciones a canales,
// "Personalizar canal", botones de moderación (Interacciones con firma Ed25519), baneo por IP y silencio de voz.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { startServer, Client, adminClient, createMember } from './helpers/server.js';
import { startFakeDiscord, waitFor, IDS } from './helpers/fakeDiscord.js';

// TOTP propio de la prueba (RFC 6238)
function b32decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, v = 0; const out = [];
  for (const ch of s.replace(/[^A-Z2-7]/g, '')) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, offset = 0) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

// Llaves Ed25519 de la "aplicación" de Discord
const keys = crypto.generateKeyPairSync('ed25519');
const PUBLIC_HEX = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const sign = (body, stamp) => crypto.sign(null, Buffer.from(stamp + body), keys.privateKey).toString('hex');

let fake, srv, admin, adminSecret, totpStep = 0;
const dbOpen = () => new DatabaseSync(path.join(srv.dataDir, 'office.db'));
const link = (uid, discordId) => { const d = dbOpen(); d.prepare('UPDATE users SET discord_id = ?, discord_name = ? WHERE id = ?').run(discordId, `d${discordId.slice(-3)}`, uid); d.close(); };
const cookieOf = (c) => [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
const sock = (c, headers = {}) => io(srv.url, { extraHeaders: { cookie: cookieOf(c), ...headers }, transports: ['websocket'], reconnection: false, forceNew: true });
const connect = (c, headers) => new Promise((resolve, reject) => { const s = sock(c, headers); s.on('hello', () => resolve(s)); s.on('connect_error', reject); });
const connectError = (c, headers) => new Promise((resolve) => { const s = sock(c, headers); s.on('hello', () => { s.close(); resolve(null); }); s.on('connect_error', (e) => { s.close(); resolve(e.message); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msgsTo = (ch) => fake.state.messages.filter((m) => m.channelId === ch);

async function interact(payload, { stamp = String(Math.floor(Date.now() / 1000)), sig } = {}) {
  const body = JSON.stringify(payload);
  const r = await fetch(`${srv.url}/api/discord/interactions`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-signature-ed25519': sig || sign(body, stamp), 'x-signature-timestamp': stamp }, body,
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

before(async () => {
  fake = await startFakeDiscord();
  srv = await startServer({
    env: {
      DISCORD_BOT_TOKEN: 'test-bot-token', DISCORD_GUILD_ID: IDS.guild, DISCORD_API_BASE: fake.apiBase, DISCORD_PUBLIC_KEY: PUBLIC_HEX,
      DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'csecret', DISCORD_AUTHORIZE_URL: `${fake.base}/authorize`,
      PUBLIC_URL: 'https://hub.example.com', TRUST_PROXY: '1', DISCORD_SYNC_MINUTES: '600',
    },
  });
  admin = await adminClient(srv.url);
  adminSecret = (await admin.post('/me/2fa/setup')).data.secret;
  assert.equal((await admin.post('/me/2fa/enable', { code: totp(adminSecret) })).status, 200);
});
after(async () => { await srv?.stop(); await fake?.close(); });
const nextCode = () => totp(adminSecret, ++totpStep);

test('el estado del bot no expone el token y lista roles y canales del servidor', async () => {
  const st = await admin.get('/admin/discord');
  assert.equal(st.status, 200);
  assert.equal(st.data.enabled, true);
  assert.ok(!JSON.stringify(st.data).includes('test-bot-token'));
  assert.match(st.data.inviteUrl, /scope=bot&permissions=\d+/);
  const g = await admin.get('/admin/discord/guild');
  assert.equal(g.status, 200);
  assert.equal(g.data.guild.name, 'MeDed Friends');
  assert.ok(g.data.roles.some((r) => r.id === IDS.vipRole));
  assert.ok(!g.data.roles.some((r) => r.id === IDS.botRole), 'los roles administrados (bots) no se mapean');
  assert.ok(!g.data.channels.some((c) => c.type === 2), 'solo canales de texto');
  const anuncios = g.data.channels.find((c) => c.id === IDS.anuncios);
  assert.deepEqual(anuncios.missing, []);
  assert.ok(anuncios.missingTopic.some((p) => p.id === 'MANAGE_CHANNELS'));
  assert.ok(anuncios.missingPin.some((p) => p.id === 'MANAGE_MESSAGES'));
  assert.ok(fake.state.requests.every((r) => !r.path.startsWith('/api/v10') || r.auth === 'Bot test-bot-token'));
});

test('los que no son admin reciben 403 en la configuración de Discord', async () => {
  const m = await createMember(srv.url, admin, 'Curioso');
  assert.equal((await m.get('/admin/discord')).status, 403);
  assert.equal((await m.get('/admin/discord/guild')).status, 403);
  assert.equal((await m.put('/admin/discord/roles', { roleMap: {} })).status, 403);
  assert.equal((await m.put('/admin/discord/automations', { automations: {} })).status, 403);
  assert.equal((await m.post('/admin/discord/customize', { channelId: IDS.general })).status, 403);
  assert.equal((await m.post('/admin/discord/sync')).status, 403);
  assert.equal((await m.get('/admin/ipbans')).status, 403);
  assert.equal((await m.post(`/mod/${admin.user.id}`, { action: 'kick' })).status, 403);
});

test('IDs inválidos se rechazan', async () => {
  assert.equal((await admin.put('/admin/discord/roles', { roleMap: { '123': { badges: ['role:vip'] } } })).status, 400);
  assert.equal((await admin.put('/admin/discord/automations', { automations: { live: { on: true, channel: 'abc' } } })).status, 400);
  assert.equal((await admin.post('/admin/discord/customize', { channelId: '1; DROP' })).status, 400);
});

describe('roles de Discord → HUB', () => {
  test('un rol que da admin pide confirmar y la verificación en dos pasos', async () => {
    const map = { [IDS.adminRole]: { office: 'admin' } };
    assert.equal((await admin.put('/admin/discord/roles', { roleMap: map })).data.code, 'confirm-admin');
    assert.equal((await admin.put('/admin/discord/roles', { roleMap: map, confirmAdmin: true, code: '000000' })).status, 401);
    const ok = await admin.put('/admin/discord/roles', {
      roleMap: {
        ...map,
        [IDS.vipRole]: { badges: ['role:vip'], vip: true },
        [IDS.staffRole]: { badges: ['role:staff'] },
        [IDS.modRole]: { mod: true, badges: ['role:moderador'] },
        booster: { badges: ['role:booster'] },
      },
      confirmAdmin: true, code: nextCode(),
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.config.roleMap[IDS.adminRole].office, 'admin');
    const audit = (await admin.get('/admin/audit?q=mapeo')).data.entries;
    assert.ok(audit.some((e) => /mapeo de roles de Discord/.test(e.action)));
  });

  test('da y quita solo lo que vino de Discord (las placas manuales se quedan) y detecta boosters', async () => {
    const m = await createMember(srv.url, admin, 'Vipsito');
    link(m.user.id, '700000000000000010');
    // Placa manual de Staff antes de Discord
    assert.equal((await admin.post('/admin/badges/grant', { userId: m.user.id, badgeId: 'role:staff' })).status, 200);
    fake.state.members['700000000000000010'] = { roles: [IDS.vipRole, IDS.staffRole], premium_since: '2025-01-01T00:00:00Z' };
    await admin.post('/admin/discord/sync');
    let owned = (await admin.get(`/badges/user/${m.user.id}`)).data.owned;
    const src = (id) => owned.find((b) => b.id === id)?.source;
    assert.equal(src('role:vip'), 'discord');
    assert.equal(src('role:booster'), 'discord');
    assert.equal(src('role:staff'), 'grant');
    assert.equal((await m.get('/discord/me')).data.vip, true);
    // Le quitan los roles y el boost en Discord
    fake.state.members['700000000000000010'] = { roles: [], premium_since: null };
    await admin.post('/admin/discord/sync');
    owned = (await admin.get(`/badges/user/${m.user.id}`)).data.owned;
    assert.equal(src('role:vip'), undefined);
    assert.equal(src('role:booster'), undefined);
    assert.equal(src('role:staff'), 'grant', 'la placa manual se queda');
    assert.equal((await m.get('/discord/me')).data.vip, false);
    const audit = (await admin.get('/admin/audit?q=Discord')).data.entries;
    assert.ok(audit.some((e) => /Discord: dio la placa "VIP"/.test(e.action)));
    assert.ok(audit.some((e) => /Discord: quitó la placa "VIP"/.test(e.action)));
  });

  test('un rol de Discord da admin y quitarlo lo regresa a miembro', async () => {
    const m = await createMember(srv.url, admin, 'Promovido');
    link(m.user.id, '700000000000000011');
    fake.state.members['700000000000000011'] = { roles: [IDS.adminRole] };
    await admin.post('/admin/discord/sync');
    assert.equal((await m.get('/auth/me')).data.user.role, 'admin');
    fake.state.members['700000000000000011'] = { roles: [] };
    await admin.post('/admin/discord/sync');
    assert.equal((await m.get('/auth/me')).data.user.role, 'member');
  });

  test('Discord nunca le quita el admin al primer admin (dueño)', async () => {
    link(admin.user.id, '700000000000000012');
    const d = dbOpen();
    d.prepare("INSERT OR IGNORE INTO discord_grants (user_id, kind, value, granted_at) VALUES (?, 'role', 'admin', ?)").run(admin.user.id, Date.now());
    d.close();
    fake.state.members['700000000000000012'] = { roles: [] };
    await admin.post('/admin/discord/sync');
    assert.equal((await admin.get('/auth/me')).data.user.role, 'admin');
    const audit = (await admin.get('/admin/audit?q=NO quit')).data.entries;
    assert.ok(audit.some((e) => /primer admin/.test(e.action)));
  });

  test('"solo miembros del Discord": quien no está en el servidor no entra con Discord', async () => {
    assert.equal((await admin.put('/admin/discord/options', { requireMember: true })).status, 200);
    const m = await createMember(srv.url, admin, 'Fuera');
    link(m.user.id, '700000000000000013');
    fake.state.profile = { id: '700000000000000013', username: 'fuera', global_name: 'Fuera' };
    const start = await fetch(`${srv.url}/api/auth/discord?mode=login`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const sc = start.headers.getSetCookie().find((c) => c.startsWith('oc_dstate=')).split(';')[0];
    const cb = await fetch(`${srv.url}/api/auth/discord/callback?code=x&state=${state}`, { headers: { cookie: sc }, redirect: 'manual' });
    assert.equal(cb.headers.get('location'), '/?discord=notmember');
    // Ya en el servidor: entra
    fake.state.members['700000000000000013'] = { roles: [] };
    const s2 = await fetch(`${srv.url}/api/auth/discord?mode=login`, { redirect: 'manual' });
    const st2 = new URL(s2.headers.get('location')).searchParams.get('state');
    const sc2 = s2.headers.getSetCookie().find((c) => c.startsWith('oc_dstate=')).split(';')[0];
    const cb2 = await fetch(`${srv.url}/api/auth/discord/callback?code=x&state=${st2}`, { headers: { cookie: sc2 }, redirect: 'manual' });
    assert.equal(cb2.headers.get('location'), '/?discord=ok');
    await admin.put('/admin/discord/options', { requireMember: false });
  });
});

describe('automatizaciones HUB → Discord', () => {
  before(async () => {
    const r = await admin.put('/admin/discord/automations', {
      automations: {
        live: { on: true, channel: IDS.live }, events: { on: true, channel: IDS.events },
        welcome: { on: false, channel: IDS.welcome }, badges: { on: false, channel: IDS.general }, modlog: { on: true, channel: IDS.mods },
      },
    });
    assert.equal(r.status, 200);
  });

  test('en vivo y eventos llegan a su canal, sin menciones', async () => {
    const m = await createMember(srv.url, admin, 'Streamer');
    assert.equal((await m.put('/badges/channels/twitch', { value: 'streamer_hub' })).status, 200);
    assert.equal((await m.post('/badges/live', { platform: 'twitch' })).status, 200);
    const live = await waitFor(() => msgsTo(IDS.live)[0]);
    assert.ok(live, 'se publicó en #en-vivo');
    assert.deepEqual(live.body.allowed_mentions, { parse: [] });
    assert.match(live.body.embeds[0].title, /Streamer está en vivo/);
    assert.equal(live.body.embeds[0].color, 0xE2524A);
    assert.equal(live.body.embeds[0].thumbnail.url, 'https://hub.example.com/themes/eleevate/logo.png');
    assert.ok(live.body.components[0].components.some((b) => b.style === 5 && /twitch\.tv\/streamer_hub/.test(b.url)));

    const t = Date.now() + 3600e3;
    assert.equal((await m.post('/events', { title: '@everyone Torneo', startsAt: t, endsAt: t + 3600e3 })).status, 200);
    const ev = await waitFor(() => msgsTo(IDS.events)[0]);
    assert.ok(ev);
    assert.deepEqual(ev.body.allowed_mentions, { parse: [] });
    assert.ok(!/@everyone/.test(ev.body.embeds[0].title), 'el @everyone se neutraliza');
    assert.match(JSON.stringify(ev.body.embeds[0].fields), /<t:\d+:F>/);
    assert.equal(msgsTo(IDS.live).length, 1, 'cada cosa a su canal');
  });

  test('las automatizaciones apagadas no publican', async () => {
    const before = fake.state.messages.length;
    const m = await createMember(srv.url, admin, 'Nuevo');
    await admin.post('/admin/badges/grant', { userId: m.user.id, badgeId: 'role:beta' });
    await sleep(400);
    assert.equal(msgsTo(IDS.welcome).length, 0);
    assert.equal(msgsTo(IDS.general).length, 0);
    assert.equal(fake.state.messages.length, before);
  });

  test('un 429 de Discord se respeta y se reintenta', async () => {
    fake.state.rateLimitNext = 2;
    const n = msgsTo(IDS.general).length;
    const r = await admin.post('/admin/discord/test', { channelId: IDS.general });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(msgsTo(IDS.general).length, n + 1, 'se entregó una sola vez');
    assert.equal(fake.state.rateLimitNext, 0);
    assert.ok((await admin.get('/admin/discord')).data.stats.rateLimited >= 2);
  });

  test('Discord caído no rompe nada (se reintenta y la oficina sigue)', async () => {
    fake.state.failNext = 1;
    const t = Date.now() + 7200e3;
    assert.equal((await admin.post('/events', { title: 'Junta', startsAt: t, endsAt: t + 600e3 })).status, 200);
    assert.ok(await waitFor(() => msgsTo(IDS.events).find((x) => /Junta/.test(x.body.embeds[0].title))));
    assert.equal((await admin.get('/health')).status, 200);
  });

  test('personalizar canal: revisa permisos, pone el tema, publica y fija', async () => {
    const bad = await admin.post('/admin/discord/customize', { channelId: IDS.anuncios, topic: 'Avisos del HUB', post: true, pin: true });
    assert.equal(bad.status, 409);
    assert.equal(bad.data.code, 'missing-perms');
    assert.ok(bad.data.missing.some((p) => p.id === 'MANAGE_CHANNELS'));
    assert.equal(fake.state.patches.length, 0);
    const ok = await admin.post('/admin/discord/customize', { channelId: IDS.general, topic: 'Bienvenidos al HUB · @everyone', post: true, pin: true, rules: 'Sé buena onda @here' });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.deepEqual(ok.data.steps, ['topic', 'post', 'pin']);
    assert.ok(!/@everyone/.test(fake.state.patches[0].body.topic));
    const info = msgsTo(IDS.general).at(-1);
    assert.deepEqual(info.body.allowed_mentions, { parse: [] });
    assert.match(JSON.stringify(info.body.embeds[0].fields), /Vincular Discord/);
    assert.equal(fake.state.pins[0].messageId, info.id);
  });
});

describe('moderación: botones de Discord, IP y voz', () => {
  let target, reporter, reportMsg;
  before(async () => {
    target = await createMember(srv.url, admin, 'Troll');
    reporter = await createMember(srv.url, admin, 'Testigo');
  });

  test('un reporte llega al canal de moderación con dónde está, evidencia y botones', async () => {
    const r = await reporter.post('/reports', { userId: target.user.id, reason: 'acoso', text: 'me insultó @everyone' });
    assert.equal(r.status, 200);
    reportMsg = await waitFor(() => msgsTo(IDS.mods).find((m) => /Reporte contra Troll/.test(m.body.embeds?.[0]?.title || '')));
    assert.ok(reportMsg);
    assert.deepEqual(reportMsg.body.allowed_mentions, { parse: [] });
    const f = JSON.stringify(reportMsg.body.embeds[0].fields);
    assert.match(f, /Testigo/);
    assert.match(f, /Dónde está ahora/);
    assert.ok(!/@everyone/.test(f));
    const ids = reportMsg.body.components.flatMap((row) => row.components).map((b) => b.custom_id).filter(Boolean);
    assert.deepEqual(ids.map((x) => x.split(':')[1]), ['kick', 'mute15', 'vmute', 'ban1d', 'ipban', 'dismiss']);
  });

  test('el endpoint de Interacciones rechaza firmas malas y repetidas; responde el PING', async () => {
    assert.equal((await interact({ type: 1 }, { sig: '0'.repeat(128) })).status, 401);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    assert.equal((await interact({ type: 1 }, { stamp: old })).status, 401);
    const stamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 1 });
    const sig = sign(body, stamp);
    const ok = await interact({ type: 1 }, { stamp, sig });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data, { type: 1 });
    assert.equal((await interact({ type: 1 }, { stamp, sig })).status, 401, 'la misma firma no sirve dos veces');
  });

  const click = (customId, member, message = reportMsg.body) => interact({
    type: 3, guild_id: IDS.guild, data: { custom_id: customId, component_type: 2 },
    member: { user: { id: member.id, username: member.name || 'x' }, roles: member.roles || [] },
    message: { id: '1', embeds: message.embeds, components: message.components },
  });

  test('alguien de Discord sin permiso no puede moderar', async () => {
    const r = await click(`hm:kick:${target.user.id}:1`, { id: '700000000000000099', roles: [] });
    assert.equal(r.data.type, 4);
    assert.equal(r.data.data.flags, 64);
    assert.match(r.data.data.content, /No tienes permiso/);
  });

  test('un moderador (rol mapeado) no puede actuar sobre un admin', async () => {
    const r = await click(`hm:kick:${admin.user.id}:0`, { id: '700000000000000098', roles: [IDS.modRole] });
    assert.equal(r.data.type, 4);
    assert.match(r.data.data.content, /moderador no puede/i);
    // Pero sí silenciar en voz a un miembro
    const ok = await click(`hm:vmute:${reporter.user.id}:0`, { id: '700000000000000098', roles: [IDS.modRole], name: 'mod_dc' });
    assert.equal(ok.data.type, 7);
    // Y no puede bloquear IPs
    const ip = await click(`hm:ipban:${reporter.user.id}:0`, { id: '700000000000000098', roles: [IDS.modRole] });
    assert.match(ip.data.data.content, /Solo un admin/);
    await admin.post(`/mod/${reporter.user.id}`, { action: 'unvmute' });
  });

  test('un clic firmado de un admin vinculado saca al reportado de donde esté', async () => {
    const s = await connect(target);
    const gone = new Promise((r) => s.on('disconnect', r));
    // El admin ya está vinculado a 700000000000000012
    const r = await click(reportMsg.body.components[0].components[0].custom_id, { id: '700000000000000012', roles: [] });
    assert.equal(r.status, 200);
    assert.equal(r.data.type, 7, JSON.stringify(r.data));
    assert.ok(r.data.data.components.flatMap((x) => x.components).filter((b) => b.custom_id).every((b) => b.disabled));
    assert.match(JSON.stringify(r.data.data.embeds[0].fields), /Sacó de la oficina a Troll/);
    await gone;
    assert.equal(await connectError(target), 'kicked');
    const mods = (await admin.get('/admin/moderation')).data;
    assert.ok(mods.kicked.some((k) => k.userId === target.user.id));
    const audit = (await admin.get('/admin/audit?q=desde Discord')).data.entries;
    assert.ok(audit.some((e) => /Sacó de la oficina a Troll/.test(e.action)));
    const rep = (await admin.get('/admin/reports?status=revisado')).data.reports;
    assert.ok(rep.some((x) => x.targetId === target.user.id), 'el reporte queda revisado');
  });

  test('silenciar en voz: corta el micrófono y la señalización WebRTC, el chat sigue', async () => {
    const a = await createMember(srv.url, admin, 'Ruidoso');
    const b = await createMember(srv.url, admin, 'Oyente');
    const sa = await connect(a), sb = await connect(b);
    const got = [];
    sb.on('rtc', (m) => got.push(m));
    sa.emit('rtc', { to: b.user.id, data: { hola: 1 } });
    await waitFor(() => got.length, 1500);
    assert.equal(got.length, 1, 'antes del silencio sí pasa');
    const micOff = new Promise((r) => sa.on('moderation:mic-off', r));
    const r = await admin.post(`/mod/${a.user.id}`, { action: 'vmute', minutes: 30 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    await micOff;
    sa.emit('rtc', { to: b.user.id, data: { hola: 2 } });
    sa.emit('state', { mic: true });
    await sleep(400);
    assert.equal(got.length, 1, 'la señalización ya no pasa');
    sa.close(); sb.close();
  });

  test('banear + IP: bloquea login y sockets desde esa IP; desbanear lo levanta', async () => {
    const bad = await createMember(srv.url, admin, 'Evasor');
    const IP = '203.0.113.7';
    const s = await connect(bad, { 'x-forwarded-for': IP });
    s.close();
    const r = await admin.post(`/mod/${bad.user.id}`, { action: 'ipban', minutes: 1440, reason: 'evade' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.ipBans, 1);
    const list = (await admin.get('/admin/ipbans')).data.bans;
    assert.equal(list.length, 1);
    assert.ok(!JSON.stringify(list).includes(IP), 'nunca la IP completa');
    assert.equal(list[0].masked, '203.0.*.*');
    // Otra cuenta desde la misma IP no entra ni conecta
    const alt = await createMember(srv.url, admin, 'Cuenta2');
    const login = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': IP }, body: JSON.stringify({ username: alt.user.username, password: 'secreto123' }) });
    assert.equal(login.status, 403);
    assert.equal((await login.json()).code, 'ip-banned');
    assert.equal(await connectError(alt, { 'x-forwarded-for': IP }), 'ip-banned');
    assert.equal(await connectError(alt, { 'x-forwarded-for': '198.51.100.2' }), null, 'desde otra IP sí');
    // Desde otra IP sí entra
    const login2 = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.2' }, body: JSON.stringify({ username: alt.user.username, password: 'secreto123' }) });
    assert.equal(login2.status, 200);
    // Un admin que comparte esa red sí entra (su contraseña igual se revisa)
    const adm = await fetch(`${srv.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': IP }, body: JSON.stringify({ username: 'admin', password: 'mala' }) });
    assert.equal(adm.status, 401);
    // Desbanear
    assert.equal((await admin.post(`/mod/${bad.user.id}`, { action: 'unban' })).status, 200);
    assert.equal((await admin.get('/admin/ipbans')).data.bans.length, 0);
    assert.equal(await connectError(alt, { 'x-forwarded-for': IP }), null);
    const audit = (await admin.get('/admin/audit?q=IP')).data.entries;
    assert.ok(audit.some((e) => /bloqueó su IP/.test(e.action)));
  });

  test('IPs compartidas: se ve cuántas personas usan la misma IP (en hash)', async () => {
    const a = await createMember(srv.url, admin, 'Hermano1');
    const b = await createMember(srv.url, admin, 'Hermano2');
    (await connect(a, { 'x-forwarded-for': '192.0.2.50' })).close();
    (await connect(b, { 'x-forwarded-for': '192.0.2.50' })).close();
    const r = await admin.get(`/admin/ips/${a.user.id}`);
    assert.equal(r.data.shared, 1);
    assert.deepEqual(r.data.ips[0].shared, [b.user.id]);
    assert.equal(r.data.ips[0].masked, '192.0.*.*');
    // Ban por IP desde Preferencias (1 día) y levantarlo
    const ban = await admin.post('/admin/ipbans', { userId: a.user.id, days: 1, note: 'multicuenta' });
    assert.equal(ban.status, 200);
    assert.equal(await connectError(b, { 'x-forwarded-for': '192.0.2.50' }), 'ip-banned');
    assert.equal((await admin.del(`/admin/ipbans/${ban.data.bans[0].id}`)).status, 200);
    assert.equal(await connectError(b, { 'x-forwarded-for': '192.0.2.50' }), null);
  });

});

describe('sin token: todo inerte', () => {
  let s0, a0, fake0;
  before(async () => {
    fake0 = await startFakeDiscord();
    s0 = await startServer({ env: { DISCORD_API_BASE: fake0.apiBase, MOD_WEBHOOK_URL: `${fake0.base}/webhooks/mod`, PUBLIC_URL: 'https://hub.example.com' } });
    a0 = await adminClient(s0.url);
  });
  after(async () => { await s0?.stop(); await fake0?.close(); });

  test('la integración no hace nada sin DISCORD_BOT_TOKEN', async () => {
    const st = await a0.get('/admin/discord');
    assert.equal(st.data.enabled, false);
    assert.equal((await a0.get('/admin/discord/guild')).status, 409);
    assert.equal((await a0.post('/admin/discord/sync')).status, 409);
    // Aunque se guarden automatizaciones, nada sale
    await a0.put('/admin/discord/automations', { automations: { events: { on: true, channel: IDS.events } } });
    const t = Date.now() + 3600e3;
    await a0.post('/events', { title: 'Sin bot', startsAt: t, endsAt: t + 60e3 });
    const m = await createMember(s0.url, a0, 'Alguien');
    await m.post('/reports', { userId: a0.user.id, reason: 'spam' });
    await sleep(400);
    assert.equal(fake0.state.requests.filter((r) => r.path.startsWith('/api/')).length, 0, 'ni una llamada a la API de Discord');
    // Interacciones sin llave pública: 404
    const r = await fetch(`${s0.url}/api/discord/interactions`, { method: 'POST', body: '{"type":1}' });
    assert.equal(r.status, 404);
  });

  test('sin bot, el reporte sale por MOD_WEBHOOK_URL (sin botones ni menciones)', async () => {
    const hook = await waitFor(() => fake0.state.requests.find((r) => r.path === '/webhooks/mod'));
    assert.ok(hook, 'llegó al webhook');
    assert.deepEqual(hook.body.allowed_mentions, { parse: [] });
    assert.deepEqual(hook.body.components, []);
    assert.match(hook.body.embeds[0].title, /Reporte contra/);
  });
});
