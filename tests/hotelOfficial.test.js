// Hotel: salas oficiales (Oficina Central y compañía). Modelos propios válidos, acomodo válido,
// siembra idempotente, permisos (solo admins decoran; nadie borra), listado primero y toggles para todos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { ROOM_MODELS, PUBLIC_MODELS, validateModel, parseModel, OFFICIAL_CAPACITY } from '../shared/hotel.js';
import { FURNI_BY_ID } from '../shared/hotelCatalog.js';
import { buildRoom, canPlace, canPlaceWall, findPath, tileInfo } from '../shared/hotelRoom.js';
import { OFFICIAL_ROOMS, planOfficialRoom } from '../shared/hotelOfficialRooms.js';

// ---------- Lógica pura ----------
test('hotel oficiales: modelos válidos (a–f intactos) y acomodo sin errores', () => {
  for (const [k, m] of Object.entries(ROOM_MODELS)) assert.equal(validateModel(m), null, `modelo ${k}`);
  assert.deepEqual(PUBLIC_MODELS, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(parseModel('a').W, 7);
  const hq = parseModel('hq');
  assert.ok(hq.W >= 25 && hq.H >= 21, 'Oficina Central es grande');
  assert.ok(hq.heights.flat().some((h) => h === 2) && hq.heights.flat().some((h) => h === 0), 'tarima y lounge hundido');
  // Validación de modelos inválidos
  assert.ok(validateModel({ map: ['xxx', 'x00', 'x00'], door: { x: 1, y: 1, rot: 2 } }));
  assert.ok(validateModel({ map: ['xxx', '000', 'x00'], door: { x: 0, y: 1, rot: 3 } }));
  assert.ok(validateModel({ map: ['x'.repeat(50), ...Array(5).fill(`0${'0'.repeat(49)}`)], door: { x: 0, y: 1, rot: 2 } }));

  for (const spec of OFFICIAL_ROOMS) {
    const p = planOfficialRoom(spec);
    assert.deepEqual(p.errors, [], `sala ${spec.key}`);
    assert.ok(p.items.length >= 30, `sala ${spec.key} con furnis`);
    for (const it of p.items) assert.ok(FURNI_BY_ID[it.type], it.type);
    // Desde la puerta se llega a cualquier casilla libre (nada encerrado)
    const g = p.grid, d = g.door;
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
      const t = tileInfo(g, x, y);
      if (!t || t.kind === 'block' || (x === d.x && y === d.y)) continue;
      assert.ok(findPath(g, { x: d.x, y: d.y }, { x, y }), `${spec.key}: (${x},${y}) alcanzable`);
    }
  }
});

// ---------- Servidor ----------
let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

const connect = (c, url = srv.url) => new Promise((resolve, reject) => {
  const s = io(url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const once = (s, ev, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`timeout esperando ${ev}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});
const enter = async (s, roomId) => { const p = once(s, 'hotel:room'); s.emit('hotel:enter', { roomId }); return p; };

// Revisa que cada furni de la foto de la sala sea una colocación válida (mismas reglas que el servidor)
function assertValidItems(snap) {
  const floor = snap.items.filter((i) => !i.wall);
  const grid = buildRoom(snap.room.model, floor);
  for (const it of snap.items) {
    const def = FURNI_BY_ID[it.type];
    assert.ok(def, it.type);
    if (it.wall) { assert.ok(canPlaceWall(grid, def, it.wall.wall, it.wall.pos, it.wall.h).ok, `${it.type} en pared`); continue; }
    // Se valida sobre lo que está debajo: sin él mismo ni lo que va encima
    const below = floor.filter((o) => o.id !== it.id && o.z < it.z + 1e-6 && !(o.z === it.z && o.id > it.id));
    const v = canPlace(buildRoom(snap.room.model, below), def, it.x, it.y, it.rot);
    assert.ok(v.ok, `${it.type} (${it.x},${it.y}): ${v.reason}`);
    assert.ok(Math.abs(v.z - it.z) < 1e-6, `${it.type} (${it.x},${it.y}) flota: z ${it.z} ≠ ${v.z}`);
  }
}

test('hotel oficiales: listado primero, sembradas válidas y fuera de inventarios', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'AnaOf');
  await ana.post('/hotel/rooms', { name: 'Cuarto de Ana', model: 'b' });
  const off = (await ana.get('/hotel/rooms?tab=official')).data.rooms;
  assert.deepEqual(off.map((r) => r.officialKey), OFFICIAL_ROOMS.map((r) => r.key));
  assert.equal(off[0].name, 'Oficina Central');
  assert.ok(off.every((r) => r.official && r.access === 'open' && r.capacity === OFFICIAL_CAPACITY));
  for (const tab of ['popular', 'all']) {
    const rooms = (await ana.get(`/hotel/rooms?tab=${tab}`)).data.rooms;
    const firstNormal = rooms.findIndex((r) => !r.official);
    assert.ok(firstNormal >= OFFICIAL_ROOMS.length, `${tab}: oficiales primero`);
    assert.ok(rooms.slice(0, firstNormal).every((r) => r.official));
  }
  // No cuentan como salas del admin ni salen en "Mis salas"
  const am = (await admin.get('/hotel/rooms?tab=mine')).data;
  assert.equal(am.mine, 0);
  assert.equal(am.rooms.length, 0);
  // Nadie crea salas con modelos oficiales
  await new Promise((r) => setTimeout(r, 1600)); // límite de una sala nueva cada 1.5 s
  assert.equal((await ana.post('/hotel/rooms', { name: 'Copia', model: 'hq' })).status, 400);
  // Los furnis sembrados no están en el inventario del admin
  const inv = (await admin.get('/hotel/inventory')).data.items;
  assert.ok(inv.every((i) => !i.extra?.official));

  const s = await connect(admin);
  try {
    for (const r of off) {
      const snap = await enter(s, r.id);
      assert.equal(snap.items.length, planOfficialRoom(OFFICIAL_ROOMS.find((o) => o.key === r.officialKey)).items.length);
      assertValidItems(snap);
    }
  } finally { s.close(); }
});

test('hotel oficiales: solo admins editan; nadie borra; todos usan toggles', async () => {
  const admin = await adminClient(srv.url);
  const beto = await createMember(srv.url, admin, 'BetoOf');
  const hq = (await beto.get('/hotel/rooms?tab=official')).data.rooms.find((r) => r.officialKey === 'hq');
  // REST
  assert.equal((await beto.patch(`/hotel/rooms/${hq.id}`, { name: 'Mía' })).status, 403);
  assert.equal((await beto.del(`/hotel/rooms/${hq.id}`)).status, 403);
  assert.equal((await admin.del(`/hotel/rooms/${hq.id}`)).status, 403, 'ni los admins la borran');
  assert.equal((await admin.post(`/hotel/rooms/${hq.id}/rights`, { userId: beto.user.id })).status, 403);
  assert.equal((await admin.patch(`/hotel/rooms/${hq.id}`, { description: 'La oficina' })).status, 200);

  const sb = await connect(beto), sa = await connect(admin);
  try {
    const snap = await enter(sb, hq.id);
    await enter(sa, hq.id);
    const inv = (await beto.get('/hotel/inventory')).data.items;
    const chair = snap.items.find((i) => i.type === 'chair_gamer');
    // Colocar / mover / girar / recoger: no
    let n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:place', { itemId: inv[0].id, x: 20, y: 7, rot: 0 });
    assert.match((await n).text, /permiso/);
    n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:move', { itemId: chair.id, x: 20, y: 7 });
    assert.match((await n).text, /permiso/);
    n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:pickup', { itemId: chair.id });
    assert.match((await n).text, /permiso/);
    // Prender una lámpara: sí
    const lamp = snap.items.find((i) => i.type === 'lamp_floor');
    const upd = once(sa, 'hotel:item', (m) => m.item?.id === lamp.id);
    sb.emit('hotel:use', { itemId: lamp.id });
    assert.equal((await upd).item.state, lamp.state ? 0 : 1);
    // Admin sí recoge, y el furni sembrado no llega a ningún inventario
    const gone = once(sb, 'hotel:item', (m) => m.op === 'remove' && m.id === chair.id);
    sa.emit('hotel:pickup', { itemId: chair.id });
    await gone;
    const ainv = (await admin.get('/hotel/inventory')).data.items;
    assert.ok(!ainv.some((i) => i.id === chair.id));
  } finally { sb.close(); sa.close(); }
});

test('hotel oficiales: la siembra es idempotente al reiniciar', async () => {
  const admin = await adminClient(srv.url);
  const before = (await admin.get('/hotel/rooms?tab=official')).data.rooms;
  const s = await connect(admin);
  const counts = {};
  for (const r of before) counts[r.id] = (await enter(s, r.id)).items.length;
  s.close();
  // Reiniciar con la misma base de datos
  const dataDir = srv.dataDir;
  srv.child.kill('SIGTERM');
  await new Promise((r) => srv.child.once('exit', r));
  const again = await startServer({ env: { DATA_DIR: dataDir } });
  const oldStop = srv.stop;
  srv = { ...again, stop: async () => { await again.stop(); await oldStop(); } };
  const admin2 = await adminClient(srv.url);
  const after = (await admin2.get('/hotel/rooms?tab=official')).data.rooms;
  assert.deepEqual(after.map((r) => r.id), before.map((r) => r.id), 'mismas salas, sin duplicar');
  const s2 = await connect(admin2);
  try {
    for (const r of after) assert.equal((await enter(s2, r.id)).items.length, counts[r.id], `${r.officialKey}: mismos furnis`);
  } finally { s2.close(); }

  // Nueva versión del acomodo: vuelve a sembrar sin duplicar (y regresa lo que un admin recogió)
  srv.child.kill('SIGTERM');
  await new Promise((r) => srv.child.once('exit', r));
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(dataDir, 'office.db'));
  db.prepare("UPDATE settings SET value = '0' WHERE key = 'hotel_official_v'").run();
  db.close();
  const third = await startServer({ env: { DATA_DIR: dataDir } });
  const prevStop = srv.stop;
  srv = { ...third, stop: async () => { await third.stop(); await prevStop(); } };
  const admin3 = await adminClient(srv.url);
  const rooms3 = (await admin3.get('/hotel/rooms?tab=official')).data.rooms;
  assert.deepEqual(rooms3.map((r) => r.id), before.map((r) => r.id));
  const s3 = await connect(admin3);
  try {
    for (const r of rooms3) {
      const snap = await enter(s3, r.id);
      assert.equal(snap.items.length, planOfficialRoom(OFFICIAL_ROOMS.find((o) => o.key === r.officialKey)).items.length, `${r.officialKey}: resembrada`);
      assertValidItems(snap);
    }
  } finally { s3.close(); }
});
