// Salas cerradas: solo quien está dentro la cierra, nadie más entra caminando,
// tocar la puerta avisa a los de dentro y al quedar vacía se vuelve a abrir.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { composeFloor, isWalkable } from '../shared/map.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

const connect = (c) => new Promise((resolve, reject) => {
  const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('cerrar una sala, no dejar entrar y tocar la puerta', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'Ana');
  const payload = (await admin.get('/floors/1')).data.floor;
  const f = { ...payload, ...composeFloor(payload) };
  const room = f.areas.find((a) => a.private && a.w >= 6 && !/1\s*:\s*1/.test(a.name));
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (isWalkable(f, x, y)) cells.push({ x, y });
  const inside = cells[Math.floor(cells.length / 2)];
  // una casilla de afuera junto a la sala
  let outside = null;
  for (let x = room.x; x < room.x + room.w && !outside; x++) for (const y of [room.y - 1, room.y + room.h]) if (isWalkable(f, x, y)) { outside = { x, y }; break; }
  assert.ok(inside && outside);

  const a = await connect(admin);
  const b = await connect(ana);
  try {
    a.emit('move', { floorId: 1, x: inside.x, y: inside.y, tp: true });
    b.emit('move', { floorId: 1, x: outside.x, y: outside.y, tp: true });
    await wait(150);
    // Desde afuera no se puede cerrar
    b.emit('room:close', { areaId: room.id, closed: true });
    await wait(150);
    assert.equal((await admin.get('/floors/1')).data.floor.areas.find((x) => x.id === room.id).closed, false);
    // Desde adentro sí
    const floorMsg = new Promise((r) => b.once('floor', r));
    a.emit('room:close', { areaId: room.id, closed: true });
    const fp = await floorMsg;
    assert.equal(fp.areas.find((x) => x.id === room.id).closed, true);
    // Ana no puede entrar caminando: el servidor la regresa
    const back = new Promise((r) => b.once('player', r));
    b.emit('move', { floorId: 1, x: inside.x, y: inside.y });
    const pl = await back;
    assert.deepEqual([pl.x, pl.y], [outside.x, outside.y]);
    // Tocar la puerta le avisa al de adentro
    const knock = new Promise((r) => a.once('room:knock', r));
    b.emit('room:knock', { areaId: room.id });
    const k = await knock;
    assert.equal(k.areaId, room.id);
    // Quien está dentro la deja pasar: ahora sí puede entrar caminando y la sala sigue cerrada
    const admittedMsg = new Promise((r) => b.once('room:admitted', r));
    a.emit('room:admit', { areaId: room.id, userId: k.from });
    assert.equal((await admittedMsg).areaId, room.id);
    const moved = new Promise((r) => a.once('move', r));
    b.emit('move', { floorId: 1, x: inside.x, y: inside.y });
    const mv = await moved;
    assert.deepEqual([mv.x, mv.y], [inside.x, inside.y]);
    assert.equal((await admin.get('/floors/1')).data.floor.areas.find((x) => x.id === room.id).closed, true);
    b.emit('move', { floorId: 1, x: outside.x, y: outside.y, tp: true });
    await wait(100);
    // Al salir el último, la sala se abre sola
    const reopened = new Promise((r) => b.on('floor', (p) => { if (!p.areas.find((x) => x.id === room.id).closed) r(); }));
    a.emit('move', { floorId: 1, x: outside.x, y: outside.y, tp: true });
    await reopened;
  } finally {
    a.close(); b.close();
  }
});

test('sala 1:1 se cierra sola cuando ya están los dos', async () => {
  const admin = await adminClient(srv.url);
  const beto = await createMember(srv.url, admin, 'Beto');
  const payload = (await admin.get('/floors/1')).data.floor;
  const f = { ...payload, ...composeFloor(payload) };
  const room = f.areas.find((a) => a.private && /1\s*:\s*1/.test(a.name));
  assert.ok(room, 'hay una sala 1:1 en la plantilla');
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (isWalkable(f, x, y)) cells.push({ x, y });
  const a = await connect(admin);
  const b = await connect(beto);
  try {
    a.emit('move', { floorId: 1, x: cells[0].x, y: cells[0].y, tp: true });
    await wait(150);
    // Con una sola persona sigue abierta
    assert.equal((await admin.get('/floors/1')).data.floor.areas.find((x) => x.id === room.id).closed, false);
    const closedMsg = new Promise((r) => a.on('room-state', (m) => { if (m.areaId === room.id && m.auto) r(m); }));
    b.emit('move', { floorId: 1, x: cells[1].x, y: cells[1].y, tp: true });
    await closedMsg;
    assert.equal((await admin.get('/floors/1')).data.floor.areas.find((x) => x.id === room.id).closed, true);
  } finally {
    a.close(); b.close();
  }
});
