// Resumen de reuniones con IA: se activa dentro de una sala, junta lo que dice cada quien,
// pide el resumen a la API de Claude (aquí un servidor falso) y lo deja en el chat.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { composeFloor, isWalkable } from '../shared/map.js';

// API de Claude falsa
const calls = [];
let failNext = false;
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    calls.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
    if (failNext) { failNext = false; res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"boom"}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'Junta de staff\n\nResumen\n• Se habló del evento\n\nAcuerdos\n• Evento el sábado\n\nPendientes\n— Beto: mandar el póster\n\nTemas abiertos\n• Ninguno' }] }));
  });
});

let srv, noKey;
before(async () => {
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  srv = await startServer({ env: { ANTHROPIC_API_KEY: 'sk-test-secreta', ANTHROPIC_BASE_URL: `http://127.0.0.1:${fake.address().port}`, AI_MODEL: 'modelo-prueba', NOTES_IDLE_MS: '600' } });
  noKey = await startServer({ env: { ANTHROPIC_API_KEY: '' } });
});
after(async () => { await srv?.stop(); await noKey?.stop(); fake.close(); });

const connect = (base, c) => new Promise((resolve, reject) => {
  const s = io(base, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev, pred = () => true) => new Promise((r) => { const f = (m) => { if (pred(m)) { s.off(ev, f); r(m); } }; s.on(ev, f); });

async function meetingRoom(admin) {
  const payload = (await admin.get('/floors/1')).data.floor;
  const f = { ...payload, ...composeFloor(payload) };
  const room = f.areas.find((a) => a.private && a.w >= 6 && !/1\s*:\s*1/.test(a.name));
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (isWalkable(f, x, y)) cells.push({ x, y });
  return { room, cells, outside: { ...f.spawn } };
}

test('config: disponible con llave y el admin lo puede desactivar', async () => {
  const admin = await adminClient(srv.url);
  let cfg = (await admin.get('/config')).data;
  assert.equal(cfg.aiNotes, true);
  assert.equal(cfg.aiNotesReady, true);
  assert.ok(!JSON.stringify(cfg).includes('sk-test'), 'la llave nunca sale al cliente');
  const ana = await createMember(srv.url, admin, 'Ana');
  assert.equal((await ana.patch('/admin/office', { aiNotes: false })).status, 403);
  cfg = (await admin.patch('/admin/office', { aiNotes: false })).data;
  assert.equal(cfg.aiNotes, false);
  cfg = (await admin.patch('/admin/office', { aiNotes: true })).data;
  assert.equal(cfg.aiNotes, true);
  // Sin llave en el servidor: la función no está lista
  const admin2 = await adminClient(noKey.url);
  assert.equal((await admin2.get('/config')).data.aiNotesReady, false);
});

test('tomar notas: junta fragmentos, pide el resumen y lo entrega por mensaje directo', async () => {
  const admin = await adminClient(srv.url);
  const beto = await createMember(srv.url, admin, 'Beto');
  const { room, cells, outside } = await meetingRoom(admin);
  const a = await connect(srv.url, admin), b = await connect(srv.url, beto);
  try {
    a.emit('move', { floorId: 1, x: cells[0].x, y: cells[0].y, tp: true });
    await wait(100);
    // Sola no se puede activar
    a.emit('notes:start', { areaId: room.id });
    await wait(150);
    b.emit('move', { floorId: 1, x: cells[1].x, y: cells[1].y, tp: true });
    a.emit('state', { mic: true });
    b.emit('state', { mic: true });
    await wait(100);
    // Ya con dos: todos ven el aviso
    const onB = once(b, 'notes:state', (m) => m.areaId === room.id && m.on);
    a.emit('notes:start', { areaId: room.id });
    const st = await onB;
    assert.equal(st.by, admin.user.id);
    // Llegan los fragmentos (uno sin texto se ignora)
    a.emit('notes:segment', { text: 'Hola equipo, hablemos del evento del sábado', at: Date.now() });
    b.emit('notes:segment', { text: 'Yo me encargo de mandar el póster', at: Date.now() });
    b.emit('notes:segment', { text: '   ' });
    await wait(150);
    // Beto lo apaga: se pide el resumen
    const sumA = once(a, 'notes:summary'), sumB = once(b, 'notes:summary');
    const msgB = once(b, 'message', (m) => m.kind === 'notes');
    const off = once(a, 'notes:state', (m) => m.areaId === room.id && !m.on);
    b.emit('notes:stop', { areaId: room.id });
    await off;
    const [sa, sb, mb] = await Promise.all([sumA, sumB, msgB]);
    assert.equal(sb.conv, `d:${admin.user.id}`);
    assert.equal(sa.conv, `d:${beto.user.id}`);
    assert.match(mb.body, /^📝 Resumen de la reunión en /);
    assert.match(mb.body, /Beto: mandar el póster/);
    // Petición a la API: modelo, encabezados, instrucciones y nombres de quién habló
    const c = calls.at(-1);
    assert.equal(c.url, '/v1/messages');
    assert.equal(c.headers['x-api-key'], 'sk-test-secreta');
    assert.equal(c.headers['anthropic-version'], '2023-06-01');
    assert.equal(c.body.model, 'modelo-prueba');
    assert.equal(c.body.max_tokens, 1500);
    assert.match(c.body.system, /Acuerdos/);
    assert.match(c.body.system, /Pendientes/);
    const transcript = c.body.messages[0].content;
    assert.equal(c.body.messages[0].role, 'user');
    assert.match(transcript, /Yamii: Hola equipo/);
    assert.match(transcript, /Beto: Yo me encargo/);
    assert.match(transcript, new RegExp(room.name));
    // Queda guardado en el chat de los dos
    const msgs = (await beto.get(`/messages?conv=d:${admin.user.id}`)).data.messages;
    assert.equal(msgs.at(-1).kind, 'notes');
    assert.equal(msgs.at(-1).userId, admin.user.id);

    // Sala vacía por más del tiempo límite: se cierra sola y resume
    a.emit('notes:start', { areaId: room.id });
    await once(b, 'notes:state', (m) => m.areaId === room.id && m.on);
    a.emit('notes:segment', { text: 'Segunda junta, revisamos los tickets pendientes' });
    await wait(100);
    failNext = true; // y la API falla: aviso a quien lo activó
    const err = once(a, 'notes:error');
    const ended = once(b, 'notes:state', (m) => m.areaId === room.id && !m.on && m.reason === 'empty');
    a.emit('move', { floorId: 1, x: outside.x, y: outside.y, tp: true });
    b.emit('move', { floorId: 1, x: outside.x, y: outside.y, tp: true });
    await ended;
    assert.equal((await err).message, 'No se pudo generar el resumen');
    assert.ok(!srv.output().includes('sk-test-secreta'), 'la llave nunca se registra');
  } finally {
    a.close(); b.close();
  }
});

test('fragmentos sin micrófono o fuera de la sala no cuentan; admin desactiva y se corta', async () => {
  const admin = await adminClient(srv.url);
  const caro = await createMember(srv.url, admin, 'Caro');
  const { room, cells, outside } = await meetingRoom(admin);
  const a = await connect(srv.url, admin), c = await connect(srv.url, caro);
  try {
    a.emit('move', { floorId: 1, x: cells[2].x, y: cells[2].y, tp: true });
    c.emit('move', { floorId: 1, x: cells[3].x, y: cells[3].y, tp: true });
    a.emit('state', { mic: false });
    await wait(100);
    a.emit('notes:start', { areaId: room.id });
    await once(c, 'notes:state', (m) => m.areaId === room.id && m.on);
    // Un nuevo socket recibe la lista de notas activas
    const c2 = io(srv.url, { extraHeaders: { cookie: [...caro.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
    const list = await once(c2, 'notes:list');
    assert.ok(list.sessions.some((x) => x.areaId === room.id));
    c2.close();
    a.emit('notes:segment', { text: 'Esto no debería guardarse porque tengo el micro apagado' });
    await wait(100);
    const n = calls.length;
    // Apagado sin nada que resumir: no se llama a la API
    const empty = once(a, 'notes:empty');
    a.emit('notes:stop', { areaId: room.id });
    await empty;
    assert.equal(calls.length, n);
    // El admin desactiva la función: se corta sin resumen y ya no se puede activar
    a.emit('notes:start', { areaId: room.id });
    await once(c, 'notes:state', (m) => m.areaId === room.id && m.on);
    const cut = once(c, 'notes:state', (m) => m.areaId === room.id && !m.on && m.reason === 'disabled');
    await admin.patch('/admin/office', { aiNotes: false });
    await cut;
    let started = false;
    c.on('notes:state', (m) => { if (m.on) started = true; });
    a.emit('notes:start', { areaId: room.id });
    await wait(200);
    assert.equal(started, false);
    await admin.patch('/admin/office', { aiNotes: true });
    a.emit('move', { floorId: 1, x: outside.x, y: outside.y, tp: true });
  } finally {
    a.close(); c.close();
  }
});

test('sin llave del servidor no se puede activar', async () => {
  const admin = await adminClient(noKey.url);
  const dani = await createMember(noKey.url, admin, 'Dani');
  const { room, cells } = await meetingRoom(admin);
  const a = await connect(noKey.url, admin), d = await connect(noKey.url, dani);
  try {
    a.emit('move', { floorId: 1, x: cells[0].x, y: cells[0].y, tp: true });
    d.emit('move', { floorId: 1, x: cells[1].x, y: cells[1].y, tp: true });
    await wait(100);
    let started = false;
    d.on('notes:state', () => { started = true; });
    a.emit('notes:start', { areaId: room.id });
    await wait(250);
    assert.equal(started, false);
  } finally {
    a.close(); d.close();
  }
});
