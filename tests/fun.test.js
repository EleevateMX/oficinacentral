// Cumpleaños (guardar fecha, felicitar, avisar) y mesas de juego (asientos, controles, victorias).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

const connect = (c) => new Promise((resolve, reject) => {
  const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const once = (s, ev, pred = () => true) => new Promise((r) => { const f = (m) => { if (pred(m)) { s.off(ev, f); r(m); } }; s.on(ev, f); });

test('cumpleaños: guardar, validar y felicitar', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'Ana');
  assert.equal((await ana.patch('/me', { birthday: '02-30' })).status, 400);
  assert.equal((await ana.patch('/me', { birthday: 'hoy' })).status, 400);
  const r = await ana.patch('/me', { birthday: '02-29' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.birthday, '02-29');
  // El admin puede poner la fecha de alguien; un miembro no
  assert.equal((await ana.put(`/users/${admin.user.id}/birthday`, { birthday: '05-01' })).status, 403);
  assert.equal((await admin.put(`/users/${ana.user.id}/birthday`, { birthday: '07-15' })).status, 200);
  const users = (await admin.get('/users')).data.users;
  assert.equal(users.find((u) => u.id === ana.user.id).birthday, '07-15');
  // Felicitar: llega la notificación y queda en el muro (una por persona por año; se puede cambiar el texto)
  assert.equal((await ana.post(`/birthdays/${ana.user.id}/wish`, {})).status, 400);
  assert.equal((await admin.post(`/birthdays/${ana.user.id}/wish`, { text: '¡Felicidades!' })).status, 200);
  assert.equal((await admin.post(`/birthdays/${ana.user.id}/wish`, { text: '¡Feliz día!' })).status, 200);
  const wishes = (await ana.get(`/birthdays/${ana.user.id}/wishes`)).data.wishes;
  assert.equal(wishes.length, 1);
  assert.equal(wishes[0].text, '¡Feliz día!');
  const notifs = (await ana.get('/notifications')).data.notifications.filter((n) => n.type === 'birthday');
  assert.equal(notifs.length, 1);
  // Sin fecha no se puede felicitar
  assert.equal((await ana.post(`/birthdays/${admin.user.id}/wish`, {})).status, 400);
  // Borrar la fecha
  assert.equal((await ana.patch('/me', { birthday: null })).data.user.birthday, null);
});

test('mesa de juego: asientos, controles al anfitrión y victoria contada', async () => {
  const admin = await adminClient(srv.url);
  const beto = await createMember(srv.url, admin, 'Beto');
  const caro = await createMember(srv.url, admin, 'Caro');
  const floor = (await admin.get('/floors/1')).data.floor;
  const table = floor.objects.find((o) => o.type === 'pingPong');
  const arcade = floor.objects.find((o) => o.type === 'arcade');
  assert.ok(table && arcade, 'la plantilla tiene ping pong y arcade');
  const a = await connect(admin), b = await connect(beto), c = await connect(caro);
  try {
    a.emit('game:join', table.id);
    await once(a, 'game:room', (r) => r.objectId === table.id && r.seats[0] === admin.user.id);
    const both = once(a, 'game:room', (r) => r.seats[1] === beto.user.id);
    b.emit('game:join', table.id);
    await both;
    // Un tercero solo mira
    const third = once(c, 'game:room', (r) => r.watchers.includes(caro.user.id));
    c.emit('game:join', table.id);
    await third;
    // El invitado manda controles; le llegan al anfitrión
    const inp = once(a, 'game:input');
    b.emit('game:input', { objectId: table.id, data: { y: 120 } });
    assert.deepEqual((await inp).data, { y: 120 });
    // El que mira no puede mandar controles ni estado
    c.emit('game:input', { objectId: table.id, data: { y: 1 } });
    // El anfitrión manda estado; le llega a los demás
    const stB = once(b, 'game:state'), stC = once(c, 'game:state');
    a.emit('game:state', { objectId: table.id, data: { s: [1, 0] } });
    assert.deepEqual((await stB).data, { s: [1, 0] });
    assert.deepEqual((await stC).data, { s: [1, 0] });
    // Fin de partida: gana Beto y se cuenta
    const win = once(c, 'game:win');
    a.emit('game:event', { objectId: table.id, data: { type: 'end', winner: 1, score: '3-7' } });
    const w = await win;
    assert.equal(w.winner, beto.user.id);
    const top = (await admin.get('/games/pong/top')).data.top;
    assert.equal(top[0].userId, beto.user.id);
    // Si se va el anfitrión, Beto pasa al asiento 0 y Caro se sienta
    const re = once(b, 'game:room', (r) => r.seats[0] === beto.user.id && r.seats[1] === caro.user.id);
    a.emit('game:leave', table.id);
    await re;
    // Arcade: un solo asiento; las puntuaciones se guardan
    b.emit('game:join', arcade.id);
    await once(b, 'game:room', (r) => r.objectId === arcade.id && r.seats[0] === beto.user.id);
    const second = once(c, 'game:room', (r) => r.objectId === arcade.id && r.watchers.includes(caro.user.id));
    c.emit('game:join', arcade.id);
    await second;
    assert.equal((await beto.post('/games/arcade/score', { score: 1234 })).status, 200);
    assert.equal((await beto.post('/games/arcade/score', { score: 99 })).status, 429);
    assert.equal((await caro.post('/games/arcade/score', { score: -5 })).status, 400);
    const at = (await caro.get('/games/arcade/top')).data.top;
    assert.deepEqual(at.map((x) => [x.userId, x.score]), [[beto.user.id, 1234]]);
  } finally {
    a.close(); b.close(); c.close();
  }
});

test('aviso diario de cumpleaños al webhook', async () => {
  const http = await import('node:http');
  const got = [];
  const hook = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { got.push(JSON.parse(b)); res.end('ok'); }); });
  await new Promise((r) => hook.listen(0, r));
  const s2 = await startServer({ env: { BIRTHDAY_WEBHOOK_URL: `http://127.0.0.1:${hook.address().port}/hook`, OFFICE_TIMEZONE: 'UTC' } });
  try {
    const admin = await adminClient(s2.url);
    const d = new Date();
    const md = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    await admin.patch('/me', { birthday: md });
    // Llamar directo a la función con la misma base de datos del servidor de prueba
    process.env.DATA_DIR = s2.dataDir;
    process.env.BIRTHDAY_WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/hook`;
    process.env.OFFICE_TIMEZONE = 'UTC';
    const { announceBirthdays } = await import('../server/birthdays.js');
    const at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10));
    assert.equal(await announceBirthdays(at), true);
    assert.equal(await announceBirthdays(at), false); // solo una vez al día
    assert.match(got[0].text, /Hoy cumple años/);
  } finally {
    await s2.stop();
    hook.close();
  }
});

test('acciones del personaje: solo y entre dos (cerca)', async () => {
  const admin = await adminClient(srv.url);
  const dani = await createMember(srv.url, admin, 'Dani');
  const a = await connect(admin), d = await connect(dani);
  try {
    a.emit('move', { floorId: 1, x: 42, y: 56, tp: true });
    d.emit('move', { floorId: 1, x: 50, y: 56, tp: true });
    await new Promise((r) => setTimeout(r, 150));
    const got = once(d, 'emote', (m) => m.id === admin.user.id);
    a.emit('emote', { kind: 'dance', variant: 3 });
    const m = await got;
    assert.equal(m.kind, 'dance');
    assert.equal(m.variant, 3, 'la variante (qué baile) se reenvía a todos');
    // Lejos: no se puede abrazar
    let far = false;
    const onFar = (m) => { if (m.kind === 'hug') far = true; };
    d.on('emote', onFar);
    await new Promise((r) => setTimeout(r, 750));
    a.emit('emote', { kind: 'hug', target: dani.user.id });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(far, false);
    d.off('emote', onFar);
    // Cerca sí
    d.emit('move', { floorId: 1, x: 43, y: 56, tp: true });
    await new Promise((r) => setTimeout(r, 750));
    const hug = once(d, 'emote', (m) => m.kind === 'hug');
    a.emit('emote', { kind: 'hug', target: dani.user.id });
    const h = await hug;
    assert.equal(h.target, dani.user.id);
    // Variante inválida: la acción pasa, pero sin variante
    await new Promise((r) => setTimeout(r, 750));
    const odd = once(d, 'emote', (m) => m.kind === 'wave');
    a.emit('emote', { kind: 'wave', variant: 'hack' });
    assert.equal((await odd).variant, undefined);
    // Acción que no existe: se ignora
    let bad = false;
    d.on('emote', (m) => { if (m.kind === 'nope') bad = true; });
    await new Promise((r) => setTimeout(r, 750));
    a.emit('emote', { kind: 'nope' });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(bad, false);
  } finally {
    a.close(); d.close();
  }
});

test('temporada: Halloween en su fecha y el admin puede cambiarla', async () => {
  const { activeSeason } = await import('../shared/seasons.js');
  assert.equal(activeSeason('auto', new Date(2026, 9, 27)), 'halloween');
  assert.equal(activeSeason('auto', new Date(2026, 10, 2)), 'halloween');
  assert.equal(activeSeason('auto', new Date(2026, 6, 1)), null);
  assert.equal(activeSeason('none', new Date(2026, 9, 31)), null);
  assert.equal(activeSeason('halloween', new Date(2026, 6, 1)), 'halloween');
  const admin = await adminClient(srv.url);
  assert.equal((await admin.patch('/admin/office', { season: 'none' })).data.season, null);
  assert.equal((await admin.patch('/admin/office', { season: 'halloween' })).data.season, 'halloween');
  assert.equal((await admin.patch('/admin/office', { season: 'navidad-falsa' })).status, 400);
  await admin.patch('/admin/office', { season: 'auto' });
});
