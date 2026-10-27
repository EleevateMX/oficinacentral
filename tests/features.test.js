// API: turnos, anuncios, salas apartadas, invitaciones en lote y pizarrón.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, Client, adminClient, createMember } from './helpers/server.js';

let srv;
let admin;
let member;

before(async () => {
  srv = await startServer();
  admin = await adminClient(srv.url);
  member = await createMember(srv.url, admin, 'Kevin');
});

after(async () => {
  await srv?.stop();
});

test('turnos: lista por omisión, entrar y salir de turno', async () => {
  const cfg = await member.get('/config');
  assert.ok(Array.isArray(cfg.data.shifts) && cfg.data.shifts.length > 0);
  const on = await member.put('/me/shift', { shift: cfg.data.shifts[0] });
  assert.equal(on.status, 200);
  assert.equal(on.data.user.shift, cfg.data.shifts[0]);
  assert.ok(on.data.user.shiftAt > 0);
  assert.equal((await member.put('/me/shift', { shift: 'No existe' })).status, 400);
  const off = await member.put('/me/shift', { shift: null });
  assert.equal(off.data.user.shift, null);
});

test('turnos: solo el admin cambia la lista', async () => {
  assert.equal((await member.patch('/admin/office', { shifts: ['X'] })).status, 403);
  const r = await admin.patch('/admin/office', { shifts: ['Andromeda', ' Soporte ', 'Andromeda', ''] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.shifts, ['Andromeda', 'Soporte']);
});

test('anuncios: publicar, fijar (solo admin) y borrar (autor o admin)', async () => {
  const other = await createMember(srv.url, admin, 'Wodiw');
  const p = await member.post('/notices', { text: 'Junta a las 5', color: 'pink' });
  assert.equal(p.status, 200);
  const id = p.data.notice.id;
  assert.equal((await member.post('/notices', { text: '   ' })).status, 400);
  assert.equal((await member.patch(`/notices/${id}`, { pinned: true })).status, 403);
  assert.equal((await admin.patch(`/notices/${id}`, { pinned: true })).status, 200);
  const list = await other.get('/notices');
  assert.equal(list.data.notices[0].id, id);
  assert.equal(list.data.notices[0].pinned, true);
  assert.equal((await other.del(`/notices/${id}`)).status, 403);
  assert.equal((await member.del(`/notices/${id}`)).status, 200);
});

test('reuniones: apartan una sala existente', async () => {
  const floor = (await admin.get('/floors/1')).data.floor;
  const sala = floor.areas.find((a) => a.private);
  const r = await member.post('/events', { title: 'Revisión', startsAt: Date.now(), endsAt: Date.now() + 3600e3, areaId: sala.id });
  assert.equal(r.status, 200);
  assert.equal(r.data.event.areaId, sala.id);
  const bad = await member.post('/events', { title: 'X', startsAt: Date.now(), endsAt: Date.now() + 60e3, areaId: 999999 });
  assert.equal(bad.data.event.areaId, null);
});

test('invitaciones en lote: un enlace por persona con su nombre', async () => {
  assert.equal((await member.post('/admin/invites/batch', { rows: [{ name: 'A' }] })).status, 403);
  const r = await admin.post('/admin/invites/batch', { rows: [{ name: 'Ana López', email: 'ana@x.mx' }, { name: 'Beto', role: 'admin' }] });
  assert.equal(r.status, 200);
  assert.equal(r.data.invites.length, 2);
  const info = await new Client(srv.url).get(`/invites/${r.data.invites[0].token}`);
  assert.equal(info.data.name, 'Ana López');
  assert.equal(info.data.email, 'ana@x.mx');
  assert.equal(r.data.invites[1].role, 'admin');
  assert.equal((await admin.post('/admin/invites/batch', { rows: [] })).status, 400);
});

test('pizarrón: los trazos llegan en vivo y se guardan', async () => {
  const floor = (await admin.get('/floors/1')).data.floor;
  const wb = floor.objects.find((o) => o.type === 'whiteboard');
  assert.ok(wb, 'la plantilla debe traer un pizarrón');
  const connect = (c) => new Promise((resolve, reject) => {
    const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
  const a = await connect(admin);
  const b = await connect(member);
  try {
    const state = (s) => new Promise((r) => s.once('board:state', r));
    const sa = state(a); a.emit('board:join', wb.id); await sa;
    const sb = state(b); b.emit('board:join', wb.id); await sb;
    const got = new Promise((r) => b.once('board:stroke', r));
    a.emit('board:stroke', { id: wb.id, stroke: { c: '#FE3377', w: 4, p: [[0.1, 0.1], [0.5, 2]] } });
    const m = await got;
    assert.equal(m.id, wb.id);
    assert.deepEqual(m.stroke.p, [[0.1, 0.1], [0.5, 1]], 'los puntos se limitan a 0..1');
    // Un objeto que no es pizarrón no se puede abrir
    const desk = floor.objects.find((o) => o.type === 'desk' || o.type === 'glassDesk');
    let leaked = false;
    a.once('board:state', (x) => { if (x.id === desk.id) leaked = true; });
    a.emit('board:join', desk.id);
    // Al volver a entrar, el trazo sigue ahí
    const again = state(b); b.emit('board:join', wb.id);
    const st = await again;
    assert.equal(st.strokes.length, 1);
    assert.equal(leaked, false);
  } finally {
    a.close(); b.close();
  }
});
