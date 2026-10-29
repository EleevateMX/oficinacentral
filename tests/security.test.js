// Verificación en dos pasos, registro de actividad y protecciones contra abuso
// (límites de velocidad, tamaños, XSS, moderación, bloqueos y rutas de admin).
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { startServer, Client, adminClient, createMember, ADMIN } from './helpers/server.js';

// TOTP propio de la prueba (RFC 6238), independiente del servidor
function b32decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, v = 0; const out = [];
  for (const ch of s.replace(/[^A-Z2-7]/g, '')) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function code(secret, offset = 0) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

let srv;
let admin;
before(async () => { srv = await startServer(); admin = await adminClient(srv.url); });
after(async () => { await srv?.stop(); });

test('activar 2FA y entrar en dos pasos (código, sin reutilizarlo, y código de respaldo)', async () => {
  const m = await createMember(srv.url, admin, 'Segura');
  const setup = await m.post('/me/2fa/setup');
  assert.equal(setup.status, 200);
  assert.match(setup.data.otpauth, /^otpauth:\/\/totp\//);
  assert.equal((await m.post('/me/2fa/enable', { code: '000000' })).status, 400);
  const en = await m.post('/me/2fa/enable', { code: code(setup.data.secret) });
  assert.equal(en.status, 200);
  assert.equal(en.data.recoveryCodes.length, 10);

  // Primer paso: contraseña → ticket, sin sesión todavía
  const c = new Client(srv.url);
  const r1 = await c.login(m.user.username, 'secreto123');
  assert.equal(r1.data.needs2fa, true);
  assert.equal(c.cookies.has('oc_sid'), false);
  assert.equal((await c.post('/auth/2fa', { ticket: r1.data.ticket, code: '123456' })).status, 401);
  // El código usado al activar no se puede reutilizar; el siguiente sí
  const r2 = await c.post('/auth/2fa', { ticket: r1.data.ticket, code: code(setup.data.secret, 1) });
  assert.equal(r2.status, 200);
  assert.ok(c.cookies.has('oc_sid'));

  // Código de respaldo: sirve una sola vez
  const d = new Client(srv.url);
  const t = (await d.login(m.user.username, 'secreto123')).data.ticket;
  assert.equal((await d.post('/auth/2fa', { ticket: t, code: en.data.recoveryCodes[0] })).status, 200);
  const e = new Client(srv.url);
  const t2 = (await e.login(m.user.username, 'secreto123')).data.ticket;
  assert.equal((await e.post('/auth/2fa', { ticket: t2, code: en.data.recoveryCodes[0] })).status, 401);
});

test('el ticket se invalida tras 5 intentos', async () => {
  const m = await createMember(srv.url, admin, 'Intentos');
  const s = (await m.post('/me/2fa/setup')).data.secret;
  await m.post('/me/2fa/enable', { code: code(s) });
  const c = new Client(srv.url);
  const t = (await c.login(m.user.username, 'secreto123')).data.ticket;
  for (let i = 0; i < 5; i++) await c.post('/auth/2fa', { ticket: t, code: '999999' });
  const r = await c.post('/auth/2fa', { ticket: t, code: code(s, 1) });
  assert.equal(r.status, 401);
});

test('exigir 2FA a admins bloquea la administración hasta activarla', async () => {
  // Otro admin sin 2FA
  const other = await createMember(srv.url, admin, 'OtroJefe');
  await admin.patch(`/admin/users/${other.user.id}`, { role: 'admin' });
  // No se puede exigir si el propio admin no la tiene
  assert.equal((await admin.patch('/admin/office', { requireAdmin2fa: true })).status, 400);
  const s = (await admin.post('/me/2fa/setup')).data.secret;
  assert.equal((await admin.post('/me/2fa/enable', { code: code(s) })).status, 200);
  assert.equal((await admin.patch('/admin/office', { requireAdmin2fa: true })).status, 200);
  const blocked = await other.get('/admin/invites');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'need2fa');
  assert.equal((await admin.get('/admin/invites')).status, 200);
  // Un admin puede quitarle 2FA a otra persona
  assert.equal((await admin.post(`/admin/users/${other.user.id}/reset-2fa`)).status, 200);
  await admin.patch('/admin/office', { requireAdmin2fa: false });
});

test('el registro guarda acciones de admin y logins fallidos, sin contraseñas', async () => {
  await new Client(srv.url).login(ADMIN.username, 'incorrecta');
  const m = await createMember(srv.url, admin, 'Auditada');
  await admin.patch(`/admin/users/${m.user.id}`, { disabled: true });
  await admin.post('/floors', { name: 'Piso Auditoría', template: 'open' });
  const { entries } = (await admin.get('/admin/audit')).data;
  const actions = entries.map((e) => e.action);
  assert.ok(actions.some((a) => a.includes('Desactivó la cuenta de Auditada')));
  assert.ok(actions.some((a) => a.includes('Creó el piso "Piso Auditoría"')));
  assert.ok(actions.some((a) => a.startsWith('Inicio de sesión fallido')));
  assert.ok(actions.some((a) => a.startsWith('Creó una invitación')));
  assert.ok(!JSON.stringify(entries).includes('incorrecta'), 'no guarda contraseñas');
  const filtered = (await admin.get('/admin/audit?q=Piso')).data.entries;
  assert.ok(filtered.length >= 1 && filtered.every((e) => /Piso/.test(e.action) || /Piso/.test(e.actorName)));
  assert.equal((await m.get('/admin/audit')).status, 401);
});


// ======================================================================
// Protecciones para la comunidad: un servidor aparte para no mezclar estados
// ======================================================================
describe('protecciones contra abuso', () => {
  let s2;
  let boss; // admin
  before(async () => { s2 = await startServer(); boss = await adminClient(s2.url); });
  after(async () => { await s2?.stop(); });

  const cookieOf = (c) => [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  const sock = (c, opts = {}) => io(s2.url, { extraHeaders: { cookie: cookieOf(c), ...(opts.headers || {}) }, transports: ['websocket'], reconnection: false, forceNew: true });
  const connect = (c, opts) => new Promise((resolve, reject) => {
    const s = sock(c, opts);
    s.on('hello', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
  const connectError = (c, opts) => new Promise((resolve) => {
    const s = sock(c, opts);
    s.on('hello', () => { s.close(); resolve(null); });
    s.on('connect_error', (e) => { s.close(); resolve(e.message); });
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const member = (name) => createMember(s2.url, boss, name);

  test('límite de velocidad: inundar con reacciones no llega a todos y termina en desconexión', async () => {
    const spam = await member('Spammer');
    const a = await connect(boss), b = await connect(spam);
    try {
      let got = 0;
      a.on('react', () => got++);
      const gone = new Promise((r) => b.on('disconnect', r));
      for (let i = 0; i < 600; i++) b.emit('react', { emoji: '🤡' });
      await gone; // abuso sostenido: el servidor corta el socket
      await sleep(200);
      assert.ok(got <= 6, `solo pasan unas pocas (${got})`);
      // Caminar rápido (como correr) sí pasa completo
      const c = await connect(spam);
      let moves = 0;
      a.on('move', (m) => { if (m.id === spam.user.id) moves++; });
      for (let i = 0; i < 14; i++) { c.emit('move', { floorId: 1, x: 40 + (i % 2), y: 21, dir: 'right' }); await sleep(70); }
      await sleep(200);
      assert.ok(moves >= 12, `caminar no se limita (${moves})`);
      c.close();
      // Quedó en el registro de actividad
      const log = (await boss.get('/admin/audit?q=exceso')).data.entries;
      assert.ok(log.some((e) => e.actorId === spam.user.id));
    } finally { a.close(); b.close(); }
  });

  test('cargas demasiado grandes: socket y REST las rechazan', async () => {
    const big = await member('Grandote');
    const s = await connect(big);
    const gone = new Promise((r) => s.on('disconnect', r));
    s.emit('room-msg', { text: 'x'.repeat(400_000) }); // más que maxHttpBufferSize
    assert.ok(await Promise.race([gone.then(() => true), sleep(3000).then(() => false)]), 'el servidor corta el socket');
    // REST: más de 1 MB de JSON
    const r = await fetch(`${s2.url}/api/messages`, { method: 'POST', headers: { cookie: cookieOf(big), 'content-type': 'application/json' }, body: JSON.stringify({ conv: 'c:1', body: 'x'.repeat(1_200_000) }) });
    assert.equal(r.status, 413);
    // Mensaje de chat: máximo 4000 caracteres
    assert.equal((await big.post('/messages', { conv: 'c:1', body: 'x'.repeat(4001) })).status, 400);
    // Login con campos enormes o que no son texto
    assert.equal((await new Client(s2.url).post('/auth/login', { username: { $gt: '' }, password: 'x' })).status, 400);
    assert.equal((await new Client(s2.url).post('/auth/login', { username: 'a'.repeat(5000), password: 'x' })).status, 400);
    // Cookie mal formada: 401 (antes era un error 500)
    const bad = await fetch(`${s2.url}/api/auth/me`, { headers: { cookie: 'oc_sid=%E0%A4%A' } });
    assert.equal(bad.status, 401);
  });

  test('XSS: el texto se guarda tal cual (nunca HTML), sin caracteres invisibles, y los archivos HTML no se muestran', async () => {
    const x = await member('Pícara');
    const evil = '<img src=x onerror=alert(1)>';
    const r = await x.patch('/me', { displayName: `${evil}‮`, statusText: '<script>alert(1)</script>​' });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.displayName, evil); // texto literal; React lo escapa al pintarlo
    assert.equal(r.data.user.statusText, '<script>alert(1)</script>');
    const res = await fetch(`${s2.url}/api/users`, { headers: { cookie: cookieOf(x) } });
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    // Hacerse pasar por el equipo
    assert.equal((await x.patch('/me', { displayName: 'Admin Oficial' })).status, 400);
    assert.equal((await x.patch('/me', { displayName: 'M0derador' })).status, 400);
    // Un archivo HTML o SVG subido se descarga (no se ejecuta en la página)
    for (const [type, body] of [['text/html', '<script>alert(1)</script>'], ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>']]) {
      const up = await fetch(`${s2.url}/api/files`, { method: 'POST', headers: { cookie: cookieOf(x), 'content-type': type, 'x-file-name': 'a.html' }, body });
      const f = (await up.json()).file;
      const g = await fetch(`${s2.url}${f.url}`, { headers: { cookie: cookieOf(x) } });
      assert.equal(g.headers.get('content-type'), 'application/octet-stream');
      assert.match(g.headers.get('content-disposition'), /^attachment/);
      assert.match(g.headers.get('content-security-policy'), /sandbox/);
    }
  });

  test('origen ajeno: ni escrituras REST ni WebSocket desde otra página (CSRF)', async () => {
    const o = await member('Origen');
    const r = await fetch(`${s2.url}/api/notices`, { method: 'POST', headers: { cookie: cookieOf(o), 'content-type': 'application/json', origin: 'https://malvado.example' }, body: JSON.stringify({ text: 'hola' }) });
    assert.equal(r.status, 403);
    const ok = await fetch(`${s2.url}/api/notices`, { method: 'POST', headers: { cookie: cookieOf(o), 'content-type': 'application/json', origin: s2.url }, body: JSON.stringify({ text: 'hola' }) });
    assert.equal(ok.status, 200);
    assert.equal(await connectError(o, { headers: { origin: 'https://malvado.example' } }), 'bad-origin');
  });

  test('el correo de cada quien solo lo ven esa persona y los admins', async () => {
    const a = await member('Correo');
    await a.patch('/me', { email: 'privado@ejemplo.mx' });
    const b = await member('Mirona');
    const seen = (await b.get('/users')).data.users.find((u) => u.id === a.user.id);
    assert.equal(seen.email, '');
    assert.equal((await boss.get('/users')).data.users.find((u) => u.id === a.user.id).email, 'privado@ejemplo.mx');
    assert.equal((await a.get('/auth/me')).data.user.email, 'privado@ejemplo.mx');
  });

  test('login: bloqueo por cuenta tras varios intentos fallidos', async () => {
    const v = await member('Victima');
    const c = new Client(s2.url);
    for (let i = 0; i < 6; i++) assert.equal((await c.login(v.user.username, 'mala-clave')).status, 401);
    const locked = await c.login(v.user.username, 'secreto123');
    assert.equal(locked.status, 429, 'incluso con la contraseña correcta hay que esperar');
    assert.match(locked.data.error, /Espera/);
  });

  test('un usuario suspendido no puede entrar ni conectarse; al levantarla, sí', async () => {
    const bad = await member('Troll');
    const s = await connect(bad);
    const notice = new Promise((r) => s.on('moderation', r));
    const gone = new Promise((r) => s.on('disconnect', r));
    const r = await boss.post(`/admin/moderation/${bad.user.id}`, { action: 'ban', minutes: 60, reason: 'spam' });
    assert.equal(r.status, 200);
    assert.equal((await notice).kind, 'ban');
    await gone;
    // La sesión vieja ya no sirve, ni para REST ni para el socket
    assert.equal((await bad.get('/auth/me')).status, 401);
    assert.equal(await connectError(bad), 'unauthorized');
    // Volver a iniciar sesión: rechazado con el motivo
    const c = new Client(s2.url);
    const l = await c.login(bad.user.username, 'secreto123');
    assert.equal(l.status, 403);
    assert.equal(l.data.code, 'banned');
    assert.match(l.data.error, /suspendida/);
    // Sesión creada de otra forma (p. ej. Discord): tampoco conecta
    // No se puede sancionar a un admin ni a uno mismo
    assert.equal((await boss.post(`/admin/moderation/${boss.user.id}`, { action: 'ban' })).status, 400);
    // Levantar la suspensión
    assert.equal((await boss.post(`/admin/moderation/${bad.user.id}`, { action: 'unban' })).status, 200);
    assert.equal((await c.login(bad.user.username, 'secreto123')).status, 200);
    const back = await connect(c);
    back.close();
    // Todo quedó en el registro
    const log = (await boss.get('/admin/audit?q=Troll')).data.entries.map((e) => e.action);
    assert.ok(log.some((a) => a.startsWith('Suspendió a Troll')));
    assert.ok(log.some((a) => a.startsWith('Levantó la suspensión de Troll')));
  });

  test('sacar de la oficina: se desconecta y no puede volver por unos minutos', async () => {
    const k = await member('Ruidoso');
    const s = await connect(k);
    const gone = new Promise((r) => s.on('disconnect', r));
    assert.equal((await boss.post(`/admin/moderation/${k.user.id}`, { action: 'kick' })).status, 200);
    await gone;
    assert.equal(await connectError(k), 'kicked');
    assert.equal((await k.get('/auth/me')).status, 200, 'su cuenta sigue activa');
  });

  test('un usuario silenciado no puede chatear ni prender el micrófono', async () => {
    const mu = await member('Gritón');
    const near = await member('Vecina');
    const a = await connect(mu), b = await connect(near);
    try {
      a.emit('move', { floorId: 1, x: 40, y: 21, dir: 'down', tp: true });
      b.emit('move', { floorId: 1, x: 41, y: 21, dir: 'down', tp: true });
      await sleep(200);
      // Antes del silencio sí llega
      const first = new Promise((r) => b.once('room-msg', r));
      a.emit('room-msg', { text: 'hola' });
      assert.equal((await first).text, 'hola');
      await sleep(300);
      const notice = new Promise((r) => a.on('moderation', r));
      assert.equal((await boss.post(`/admin/moderation/${mu.user.id}`, { action: 'mute', minutes: 30, reason: 'gritos' })).status, 200);
      assert.equal((await notice).kind, 'mute');
      let got = 0;
      b.on('room-msg', () => got++);
      const told = new Promise((r) => a.once('moderation:notice', r));
      a.emit('room-msg', { text: 'AAAAAAA' });
      assert.match((await told).text, /silenciado/);
      // Micrófono: el servidor lo anuncia apagado aunque el cliente diga que está prendido
      const pl = new Promise((r) => b.on('player', (p) => { if (p.id === mu.user.id) r(p); }));
      a.emit('state', { mic: true, cam: true });
      const p = await pl;
      assert.equal(p.mic, false);
      assert.equal(p.cam, true);
      // Tampoco puede escribir en el chat de texto
      assert.equal((await mu.post('/messages', { conv: 'c:1', body: 'spam' })).status, 403);
      await sleep(300);
      assert.equal(got, 0);
      // Quitar el silencio
      assert.equal((await boss.post(`/admin/moderation/${mu.user.id}`, { action: 'unmute' })).status, 200);
      assert.equal((await mu.post('/messages', { conv: 'c:1', body: 'perdón' })).status, 200);
      const active = (await boss.get('/admin/moderation')).data.sanctions;
      assert.ok(!active.some((x) => x.userId === mu.user.id));
    } finally { a.close(); b.close(); }
  });

  test('bloquear: no te llegan sus DMs, saludos, llamadas ni su chat de sala', async () => {
    const pest = await member('Molesto');
    const me = await member('Tranquila');
    const s = await connect(me);
    try {
      assert.equal((await me.put(`/me/blocks/${pest.user.id}`)).status, 200);
      assert.deepEqual((await me.get('/me/moderation')).data.blocked, [pest.user.id]);
      // No se puede bloquear a un admin
      assert.equal((await me.put(`/me/blocks/${boss.user.id}`)).status, 400);
      let live = 0;
      s.on('message', (m) => { if (m.userId === pest.user.id) live++; });
      s.on('notification', () => live++);
      assert.equal((await pest.post('/messages', { conv: `d:${me.user.id}`, body: 'contéstame' })).status, 200);
      assert.equal((await pest.post(`/wave/${me.user.id}`)).status, 200);
      assert.equal((await pest.post(`/call/${me.user.id}`)).status, 200);
      await sleep(300);
      assert.equal(live, 0);
      assert.equal((await me.get(`/messages?conv=d:${pest.user.id}`)).data.messages.length, 0);
      assert.ok(!(await me.get('/chat')).data.dms.some((d) => d.userId === pest.user.id));
      assert.equal((await me.get('/notifications')).data.notifications.length, 0);
      // Sus mensajes de canal tampoco aparecen al cargar la conversación
      await pest.post('/messages', { conv: 'c:1', body: 'mensaje del canal' });
      assert.ok(!(await me.get('/messages?conv=c:1')).data.messages.some((m) => m.userId === pest.user.id));
      // Chat de la sala: aunque esté a su lado, no le llega
      const ps = await connect(pest);
      s.emit('move', { floorId: 1, x: 40, y: 21, dir: 'down', tp: true });
      ps.emit('move', { floorId: 1, x: 41, y: 21, dir: 'down', tp: true });
      await sleep(200);
      let near = 0;
      s.on('room-msg', () => near++);
      ps.emit('room-msg', { text: 'oye' });
      await sleep(300);
      ps.close();
      assert.equal(near, 0);
      // Desbloquear: vuelve a ver la conversación (el saludo bloqueado nunca se guardó)
      await me.del(`/me/blocks/${pest.user.id}`);
      assert.equal((await me.get(`/messages?conv=d:${pest.user.id}`)).data.messages.length, 1);
    } finally { s.close(); }
  });

  test('reportar: llega a los admins con el mensaje como evidencia', async () => {
    const bad = await member('Grosero');
    const rep = await member('Testigo');
    const msg = (await bad.post('/messages', { conv: 'c:1', body: 'insulto feo' })).data.message;
    const a = await connect(boss);
    try {
      const live = new Promise((r) => a.on('moderation:report', r));
      const r = await rep.post('/reports', { userId: bad.user.id, messageId: msg.id, reason: 'acoso', text: 'me insultó' });
      assert.equal(r.status, 200);
      assert.equal((await live).targetId, bad.user.id);
      const list = (await boss.get('/admin/reports')).data.reports;
      const it = list.find((x) => x.id === r.data.id);
      assert.equal(it.snapshot.body, 'insulto feo');
      assert.equal(it.reasonLabel, 'Acoso o insultos');
      // Un miembro no ve los reportes; no se reporta un mensaje que no es de esa persona
      assert.equal((await rep.get('/admin/reports')).status, 403);
      assert.equal((await rep.post('/reports', { userId: boss.user.id, messageId: msg.id, reason: 'spam' })).status, 400);
      assert.equal((await boss.patch(`/admin/reports/${it.id}`, { status: 'revisado' })).status, 200);
    } finally { a.close(); }
  });

  test('tope de pestañas por persona', async () => {
    const t = await member('Pestañas');
    const open = [];
    try {
      for (let i = 0; i < 8; i++) open.push(await connect(t));
      assert.equal(await connectError(t), 'too-many-tabs');
    } finally { open.forEach((s) => s.close()); }
  });

  test('ningún miembro puede usar una ruta de admin (revisadas todas automáticamente)', async () => {
    // Se carga la API en este proceso (con una base temporal) solo para leer la lista de rutas
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-routes-'));
    const { api } = await import('../server/api.js');
    const routes = [];
    const isAdminMw = (l) => l?.handle?.name === 'requireAdmin';
    for (const layer of api.stack) {
      if (layer.route) {
        const adminOnly = layer.route.stack.some(isAdminMw) || /\/admin(\/|$)/.test(layer.route.path);
        if (adminOnly) for (const m of Object.keys(layer.route.methods)) routes.push([m.toUpperCase(), layer.route.path]);
      } else if (layer.handle?.stack && isAdminMw(layer.handle.stack[0])) {
        // El router /api/admin: todo lo de adentro
        for (const l of layer.handle.stack) if (l.route) for (const m of Object.keys(l.route.methods)) routes.push([m.toUpperCase(), `/admin${l.route.path}`]);
      }
    }
    // Rutas de admin que revisan el rol dentro de la función
    routes.push(['POST', '/hotel/gift'], ['PUT', '/hotel/promo']);
    assert.ok(routes.length > 40, `se encontraron ${routes.length} rutas de admin`);
    const m = await member('Curioso');
    const fill = (p) => p.replace(/\{[^}]*\}/g, '').replace(/:[a-zA-Z]+/g, '1');
    const leaks = [];
    for (const [method, p] of routes) {
      const r = await m.request(method, fill(p), method === 'GET' ? undefined : {});
      if (r.status !== 403) leaks.push(`${method} ${p} → ${r.status}`);
    }
    assert.deepEqual(leaks, []);
  });

  test('A*: el camino tiene tope de búsqueda aunque el destino sea inalcanzable en una sala enorme', async () => {
    const { findPath } = await import('../shared/hotelRoom.js');
    const { validateModel, MAX_MODEL_SIZE } = await import('../shared/hotel.js');
    // Una sala de 300×300 (mucho más grande que las permitidas) con el destino encerrado
    const N = 300;
    const heights = Array.from({ length: N }, () => Array(N).fill(0));
    for (let d = -1; d <= 1; d++) for (const [x, y] of [[250 + d, 249], [250 + d, 251], [249, 250 + d], [251, 250 + d]]) heights[y][x] = NaN;
    const room = { model: 'x', W: N, H: N, heights, door: { x: 0, y: 1 }, tiles: Array.from({ length: N }, () => Array.from({ length: N }, () => [])) };
    const t0 = performance.now();
    assert.equal(findPath(room, { x: 1, y: 1 }, { x: 250, y: 250 }), null);
    assert.ok(performance.now() - t0 < 500, 'se rinde rápido (tope de nodos)');
    // Destino fuera de la sala: ni se busca
    assert.equal(findPath(room, { x: 1, y: 1 }, { x: 1e9, y: -5 }), null);
    // Y no se pueden crear salas así de grandes
    const rows = ['x'.repeat(N), ...Array.from({ length: N - 1 }, () => `0${'0'.repeat(N - 1)}`)];
    assert.ok(validateModel({ map: rows, door: { x: 0, y: 1, rot: 2 } }));
    assert.ok(MAX_MODEL_SIZE <= 64);
  });
});
