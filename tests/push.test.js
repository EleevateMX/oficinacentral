// Notificaciones push: envío con VAPID y cifrado, limpieza de suscripciones vencidas,
// recordatorios del calendario (una sola vez), rutas y avisos al llegar mensajes.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { startServer, Client, adminClient, createMember, ROOT } from './helpers/server.js';
import { makeCert, startPushService, browserKeys, subscription, decrypt, parseVapid } from './helpers/push.js';

let cert;
before(() => { cert = makeCert(); });
after(() => { fs.rmSync(cert.dir, { recursive: true, force: true }); });

function verifyVapid(req, origin) {
  const v = parseVapid(req.headers.authorization);
  assert.ok(v, `Falta la cabecera VAPID: ${req.headers.authorization}`);
  assert.equal(v.header.alg, 'ES256');
  assert.equal(v.claims.aud, origin);
  assert.match(v.claims.sub, /^(mailto:|https:)/);
  assert.ok(v.claims.exp * 1000 > Date.now());
  // Firma válida con la llave pública que se anuncia en k=
  const raw = Buffer.from(v.k, 'base64url');
  const key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') } });
  const [h, p, s] = v.jwt.split('.');
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'Firma VAPID inválida');
  return v;
}

// ---------- Módulo push.js dentro de este mismo proceso ----------
describe('server/push.js', () => {
  let dataDir;
  let push;
  let dbm;
  let svc;
  const users = {};

  before(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-push-unit-'));
    process.env.DATA_DIR = dataDir;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    process.env.VAPID_SUBJECT = 'mailto:pruebas@example.com';
    dbm = await import('../server/db.js');
    push = await import('../server/push.js');
    push.configurePush({ agent: new https.Agent({ ca: cert.cert }) });
    svc = await startPushService(cert);
    const add = (username, prefs = {}) => {
      const id = Number(dbm.db.prepare(`INSERT INTO users (username, display_name, password_hash, prefs, created_at) VALUES (?, ?, 'x', ?, ?)`)
        .run(username, username.toUpperCase(), JSON.stringify(prefs), Date.now()).lastInsertRowid);
      users[username] = id;
      return id;
    };
    add('ana');
    add('beto', { notifications: { remind5: false } });
    add('caro');
  });

  after(async () => {
    await svc?.close();
    dbm?.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const keysByEndpoint = new Map();
  function subscribe(userId) {
    const keys = browserKeys();
    const s = subscription(svc.base, keys);
    keysByEndpoint.set(new URL(s.endpoint).pathname, keys);
    dbm.db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, s.endpoint, s.keys.p256dh, s.keys.auth, Date.now());
    return s;
  }
  const payloadOf = (req) => decrypt(req.body, keysByEndpoint.get(req.url));

  test('las llaves VAPID se generan una vez y se guardan en settings', () => {
    const k = push.vapidKeys();
    assert.match(k.publicKey, /^[A-Za-z0-9_-]{87}$/);
    assert.equal(dbm.getSetting('vapid_public_key'), k.publicKey);
    assert.equal(dbm.getSetting('vapid_private_key'), k.privateKey);
    assert.equal(k.subject, 'mailto:pruebas@example.com');
  });

  test('envío: cabecera VAPID firmada y cuerpo cifrado (aes128gcm)', async () => {
    const s = subscribe(users.ana);
    const results = await push.sendToUser(users.ana, { title: 'Hola', body: 'Prueba', tag: 'conv-d-2', url: '/?conv=d:2' });
    assert.deepEqual(results, [{ ok: true }]);
    const [req] = await svc.waitFor(1);
    assert.equal(req.method, 'POST');
    assert.equal(req.url, new URL(s.endpoint).pathname);
    assert.equal(req.headers['content-encoding'], 'aes128gcm');
    assert.equal(req.headers['content-type'], 'application/octet-stream');
    assert.ok(Number(req.headers.ttl) > 0);
    assert.equal(req.headers.urgency, 'high');
    const v = verifyVapid(req, svc.base);
    assert.equal(v.k, push.vapidKeys().publicKey);
    assert.ok(req.body.length > 86, 'el cuerpo debe venir cifrado');
    assert.ok(!req.body.includes(Buffer.from('Prueba')), 'el cuerpo no debe ir en claro');
    assert.deepEqual(payloadOf(req), { title: 'Hola', body: 'Prueba', tag: 'conv-d-2', url: '/?conv=d:2' });
    const row = dbm.db.prepare('SELECT last_ok FROM push_subscriptions WHERE endpoint = ?').get(s.endpoint);
    assert.ok(row.last_ok > 0);
  });

  test('410 y 404 borran la suscripción; otros errores no', async () => {
    const gone = subscribe(users.caro);
    const missing = subscribe(users.caro);
    const busy = subscribe(users.caro);
    const code = { [new URL(gone.endpoint).pathname]: 410, [new URL(missing.endpoint).pathname]: 404, [new URL(busy.endpoint).pathname]: 503 };
    svc.setStatus((r) => code[r.url] || 201);
    const results = await push.sendToUser(users.caro, { title: 'x' });
    svc.setStatus(() => 201);
    assert.equal(results.filter((r) => r.gone).length, 2);
    const left = dbm.db.prepare('SELECT endpoint FROM push_subscriptions WHERE user_id = ?').all(users.caro).map((r) => r.endpoint);
    assert.deepEqual(left, [busy.endpoint]);
    dbm.db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(users.caro);
  });

  test('recordatorio 5 minutos antes: una sola vez, respetando preferencias, también tras reiniciar', async () => {
    subscribe(users.beto); // beto apagó "5 minutos antes"
    const t0 = Date.now();
    const startsAt = t0 + 5 * 60e3;
    const eid = Number(dbm.db.prepare('INSERT INTO events (title, location, starts_at, ends_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('Junta semanal', 'Sala 1', startsAt, startsAt + 30 * 60e3, users.beto, t0).lastInsertRowid);
    dbm.db.prepare('INSERT INTO event_attendees (event_id, user_id) VALUES (?, ?)').run(eid, users.ana);
    const before = svc.requests.length;

    await Promise.all(push.runReminders(t0));
    await Promise.all(push.runReminders(t0 + 30e3));
    await Promise.all(push.runReminders(t0 + 60e3));
    push._resetReminderMemory(); // como si el servidor se reiniciara
    await Promise.all(push.runReminders(t0 + 90e3));
    await new Promise((r) => setTimeout(r, 100));

    const got = svc.requests.slice(before);
    assert.equal(got.length, 1, 'solo ana (invitada) recibe el aviso de 5 minutos, una vez');
    const p = payloadOf(got[0]);
    assert.equal(p.title, '📅 Junta semanal');
    assert.match(p.body, /^Empieza en 5 minutos · Sala 1$/);
    assert.equal(p.url, '/?view=calendar');

    // Al empezar: ana y beto (quien lo creó) reciben "Está empezando", una vez
    await Promise.all(push.runReminders(startsAt + 5e3));
    await Promise.all(push.runReminders(startsAt + 35e3));
    const started = svc.requests.slice(before + 1);
    assert.equal(started.length, 2);
    for (const r of started) assert.match(payloadOf(r).body, /^Está empezando/);
    // Ya pasó el minuto: nada más
    await Promise.all(push.runReminders(startsAt + 90e3));
    assert.equal(svc.requests.length, before + 3);
  });

  test('no se manda push si la persona tiene la app visible; sí si todas sus pestañas están ocultas', async () => {
    const { presence } = await import('../server/realtime.js');
    const tab = { data: { hidden: false } };
    presence.set(users.ana, { sockets: new Set([tab]) });
    const before = svc.requests.length;
    push.pushNotification(users.ana, 'wave', users.beto, {});
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(svc.requests.length, before);
    tab.data.hidden = true;
    push.pushNotification(users.ana, 'wave', users.beto, {});
    const reqs = await svc.waitFor(before + 1);
    const p = payloadOf(reqs[before]);
    assert.equal(p.title, 'BETO te saludó 👋');
    assert.equal(p.url, `/?conv=d:${users.beto}`);
    presence.delete(users.ana);
  });
});

// ---------- Servidor completo ----------
describe('rutas /api/push y avisos de chat', () => {
  let srv;
  let svc;
  let admin;
  let member;
  let other;

  before(async () => {
    svc = await startPushService(cert);
    // El servidor confía en el certificado del servicio push falso
    srv = await startServer({ env: { NODE_EXTRA_CA_CERTS: cert.certPath, VAPID_SUBJECT: 'mailto:pruebas@example.com', PUSH_ALLOWED_HOSTS: '127.0.0.1' } });
    admin = await adminClient(srv.url);
    member = await createMember(srv.url, admin, 'Lupita');
    other = await createMember(srv.url, admin, 'Ramon');
  });

  after(async () => {
    await srv?.stop();
    await svc?.close();
  });

  test('GET /push/key: requiere sesión y es estable', async () => {
    assert.equal((await new Client(srv.url).get('/push/key')).status, 401);
    const a = await member.get('/push/key');
    assert.equal(a.status, 200);
    assert.match(a.data.publicKey, /^[A-Za-z0-9_-]{87}$/);
    assert.equal((await admin.get('/push/key')).data.publicKey, a.data.publicKey);
  });

  test('subscribe / unsubscribe', async () => {
    const keys = browserKeys();
    const s = subscription(svc.base, keys);
    assert.equal((await new Client(srv.url).post('/push/subscribe', { subscription: s })).status, 401);
    assert.equal((await member.post('/push/subscribe', { subscription: { endpoint: 'http://inseguro/x', keys: s.keys } })).status, 400);
    // Solo servicios push conocidos (nada de direcciones internas: SSRF)
    assert.equal((await member.post('/push/subscribe', { subscription: { endpoint: 'https://169.254.169.254/latest/meta-data', keys: s.keys } })).status, 400);
    assert.equal((await member.post('/push/subscribe', { subscription: { endpoint: s.endpoint, keys: { p256dh: 'x', auth: 'y' } } })).status, 400);
    const r = await member.post('/push/subscribe', { subscription: s });
    assert.equal(r.status, 200);
    assert.equal(r.data.devices, 1);
    // Repetir no duplica
    assert.equal((await member.post('/push/subscribe', { subscription: s })).data.devices, 1);
    // Otra cuenta no puede borrar la suscripción ajena
    assert.equal((await other.post('/push/unsubscribe', { endpoint: s.endpoint })).data.removed, 0);
    assert.equal((await member.post('/push/unsubscribe', { endpoint: s.endpoint })).data.removed, 1);
    assert.equal((await member.post('/push/unsubscribe', { endpoint: s.endpoint })).data.removed, 0);
  });

  test('mensaje directo y @mención llegan por push si no hay app abierta; con la app visible, no', async () => {
    const keys = browserKeys();
    const s = subscription(svc.base, keys);
    assert.equal((await member.post('/push/subscribe', { subscription: s })).status, 200);
    const mine = () => svc.requests.filter((r) => r.url === new URL(s.endpoint).pathname);

    // DM: Lupita no tiene la app abierta
    await admin.post('/messages', { conv: `d:${member.user.id}`, body: 'Hola Lupita, ¿tienes un minuto?' });
    await svc.waitFor(1);
    let p = decrypt(mine()[0].body, keys);
    assert.equal(p.title, 'Yamii');
    assert.equal(p.body, 'Hola Lupita, ¿tienes un minuto?');
    assert.equal(p.url, `/?conv=d:${admin.user.id}`);
    verifyVapid(mine()[0], svc.base);

    // Mención en un canal
    await admin.post('/messages', { conv: 'c:1', body: `@${member.user.username} revisa esto` });
    await svc.waitFor(2);
    p = decrypt(mine()[1].body, keys);
    assert.equal(p.title, 'Yamii te mencionó en #general');
    assert.equal(p.url, '/?conv=c:1');

    // Mensaje de canal sin mención: con la preferencia "dms" no se avisa
    await admin.post('/messages', { conv: 'c:1', body: 'aviso general' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(mine().length, 2);

    // Con la app visible no hay push; al ocultarla, sí
    const sock = io(srv.url, { extraHeaders: { cookie: [...member.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
    await new Promise((resolve, reject) => { sock.once('hello', resolve); sock.once('connect_error', reject); });
    sock.emit('visibility', { hidden: false });
    await new Promise((r) => setTimeout(r, 100));
    await admin.post('/messages', { conv: `d:${member.user.id}`, body: 'estás aquí' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(mine().length, 2);
    sock.emit('visibility', { hidden: true });
    await new Promise((r) => setTimeout(r, 100));
    await admin.post('/messages', { conv: `d:${member.user.id}`, body: 'ya te fuiste' });
    await svc.waitFor(3);
    assert.equal(decrypt(mine()[2].body, keys).body, 'ya te fuiste');
    sock.close();

    // "Todos los mensajes": los mensajes del canal también llegan
    await member.put('/me/prefs', { notifications: { chat: 'all' } });
    await admin.post('/messages', { conv: 'c:1', body: 'para todos' });
    await svc.waitFor(4);
    p = decrypt(mine()[3].body, keys);
    assert.equal(p.title, '#general · Yamii');
    assert.equal(p.body, 'para todos');

    // "Nada": ni DMs
    await member.put('/me/prefs', { notifications: { chat: 'none' } });
    await admin.post('/messages', { conv: `d:${member.user.id}`, body: 'silencio' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(mine().length, 4);
  });

  test('saludo e invitación a evento llegan por push', async () => {
    const keys = browserKeys();
    const s = subscription(svc.base, keys);
    await other.post('/push/subscribe', { subscription: s });
    const mine = () => svc.requests.filter((r) => r.url === new URL(s.endpoint).pathname);
    await admin.post(`/wave/${other.user.id}`);
    await new Promise((r) => setTimeout(r, 50));
    const startsAt = Date.now() + 864e5;
    await admin.post('/events', { title: 'Revisión', startsAt, endsAt: startsAt + 36e5, attendees: [other.user.id] });
    const end = Date.now() + 5000;
    while (mine().length < 2 && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    const titles = mine().map((r) => decrypt(r.body, keys).title).sort();
    assert.deepEqual(titles, ['Yamii te saludó 👋', '📅 Yamii te invitó a un evento']);
  });

  test('sw.js y manifest: tipo correcto y sin caché agresiva', async (t) => {
    if (!fs.existsSync(path.join(ROOT, 'dist', 'sw.js'))) return t.skip('Falta dist/: corre `npm run build`');
    const sw = await fetch(`${srv.url}/sw.js`);
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get('content-type'), /javascript/);
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    const mf = await fetch(`${srv.url}/manifest.webmanifest`);
    assert.equal(mf.status, 200);
    assert.match(mf.headers.get('content-type'), /^application\/manifest\+json/);
    assert.equal(mf.headers.get('cache-control'), 'no-cache');
    const m = await mf.json();
    assert.equal(m.display, 'standalone');
    assert.equal(m.start_url, '/');
    for (const icon of m.icons) {
      const r = await fetch(`${srv.url}${icon.src}`);
      assert.equal(r.status, 200, icon.src);
    }
    assert.ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));
    const apple = await fetch(`${srv.url}/icons/apple-touch-icon.png`);
    assert.equal(apple.status, 200);
  });
});
