// Hotel: salas, acceso (contraseña, timbre, cerrada), caminar con A*, sentarse, colocar y apilar
// furnis, recoger al inventario, permisos, chat (susurro solo a quien va) y teletransportadores.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { buildRoom, findPath, canPlace, tileInfo, canPlaceWall, dirOf } from '../shared/hotelRoom.js';
import { FURNI_BY_ID, STARTER_INVENTORY } from '../shared/hotelCatalog.js';
import { MAX_ROOMS_PER_USER } from '../shared/hotel.js';

// ---------- Lógica pura ----------
test('hotel A*: 8 direcciones, sin cortar esquinas, alturas y ocupadas', () => {
  const r = buildRoom('b', []);
  const p = findPath(r, { x: 0, y: 5 }, { x: 5, y: 1 });
  assert.ok(p && p.length >= 5);
  assert.deepEqual(p[p.length - 1].slice(0, 2), [5, 1]);
  // cada paso es a una casilla vecina
  let prev = [0, 5];
  for (const [x, y] of p) { assert.ok(Math.max(Math.abs(x - prev[0]), Math.abs(y - prev[1])) === 1); prev = [x, y]; }
  // Vacío ('x') no se pisa
  assert.equal(findPath(r, { x: 1, y: 1 }, { x: 0, y: 1 }), null);
  // Casilla ocupada: no se termina ahí
  assert.equal(findPath(r, { x: 1, y: 1 }, { x: 3, y: 3 }, { occupied: new Set(['3,3']) }), null);
  // No corta esquina: con bloques en (2,1) y (1,2), de (1,1) a (2,2) hay que rodear… y no se puede
  const blk = (id, x, y) => ({ id, type: 'bookshelf', x, y, z: 0, rot: 2 });
  const r2 = buildRoom('b', [blk(1, 2, 1), blk(2, 1, 2)]);
  const p2 = findPath(r2, { x: 1, y: 1 }, { x: 2, y: 4 });
  assert.equal(p2, null, 'encerrado en la esquina');
  // Tarima del modelo c: sube de 0 a 1 (escalón permitido) y el z del camino cambia
  const rc = buildRoom('c', []);
  const pc = findPath(rc, { x: 0, y: 5 }, { x: 2, y: 2 });
  assert.equal(pc[pc.length - 1][2], 1);
  assert.equal(dirOf(1, 0), 'right');
  assert.equal(dirOf(0, 1), 'down');
});

test('hotel: colocar, apilar y sentarse (lógica)', () => {
  const table = { id: 1, type: 'table_small', x: 3, y: 3, z: 0, rot: 0 };
  const r = buildRoom('b', [table]);
  // Lámpara encima de la mesa: z = altura de la mesa
  const lamp = canPlace(r, FURNI_BY_ID.lamp_floor, 3, 3, 0);
  assert.equal(lamp.ok, true);
  assert.equal(lamp.z, FURNI_BY_ID.table_small.h);
  // Encima de una silla no se puede
  const r2 = buildRoom('b', [{ id: 2, type: 'chair_basic', x: 4, y: 4, z: 0, rot: 0 }]);
  assert.equal(canPlace(r2, FURNI_BY_ID.plant_small, 4, 4, 0).ok, false);
  // Fuera de la sala / en la puerta / rotación inválida
  assert.equal(canPlace(r, FURNI_BY_ID.chair_basic, 0, 1, 0).ok, false);
  assert.equal(canPlace(r, FURNI_BY_ID.chair_basic, 0, 5, 0).ok, false);
  assert.equal(canPlace(r, FURNI_BY_ID.stool_bar, 2, 2, 2).ok, false);
  // Sofá de 2 en rot 2 ocupa 1×2
  assert.equal(canPlace(r, FURNI_BY_ID.sofa_2, 9, 10, 2).ok, false);
  assert.equal(canPlace(r, FURNI_BY_ID.sofa_2, 9, 8, 2).ok, true);
  // Silla = asiento para terminar el camino, no para pasar
  const t = tileInfo(r2, 4, 4);
  assert.equal(t.kind, 'sit');
  assert.ok(findPath(r2, { x: 1, y: 1 }, { x: 4, y: 4 }));
  // Alguien parado: no se pone un furni sólido encima
  assert.equal(canPlace(r, FURNI_BY_ID.chair_basic, 6, 6, 0, { users: [{ x: 6, y: 6 }] }).ok, true, 'silla sí (es asiento)');
  assert.equal(canPlace(r, FURNI_BY_ID.plant_big, 6, 6, 0, { users: [{ x: 6, y: 6 }] }).ok, false);
  // Pared: dentro de la pared y no en la puerta
  assert.equal(canPlaceWall(r, FURNI_BY_ID.poster_gtahub, 'l', 2, 1).ok, true);
  assert.equal(canPlaceWall(r, FURNI_BY_ID.poster_gtahub, 'l', 5, 1).ok, false);
  assert.equal(canPlaceWall(r, FURNI_BY_ID.window, 'r', 10, 1).ok, false);
});

// ---------- Servidor ----------
let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

const connect = (c) => new Promise((resolve, reject) => {
  const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const once = (s, ev, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`timeout esperando ${ev}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});
const nothing = (s, ev, ms = 400) => new Promise((resolve, reject) => {
  const f = (m) => { s.off(ev, f); reject(new Error(`no esperaba ${ev}: ${JSON.stringify(m)}`)); };
  s.on(ev, f);
  setTimeout(() => { s.off(ev, f); resolve(); }, ms);
});
const enter = async (s, roomId, extra = {}) => { const p = once(s, 'hotel:room'); s.emit('hotel:enter', { roomId, ...extra }); return p; };

test('hotel REST: crear, listar, límites, editar y regalo de bienvenida', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'AnaH');
  const inv = (await ana.get('/hotel/inventory')).data.items;
  assert.equal(inv.length, STARTER_INVENTORY.length, 'regalo de bienvenida');
  assert.equal((await ana.get('/hotel/inventory')).data.items.length, STARTER_INVENTORY.length, 'solo una vez');
  assert.equal((await ana.post('/hotel/rooms', { name: '', model: 'a' })).status, 400);
  assert.equal((await ana.post('/hotel/rooms', { name: 'X', model: 'zz' })).status, 400);
  assert.equal((await ana.post('/hotel/rooms', { name: 'X', model: 'a', access: 'password' })).status, 400, 'contraseña obligatoria');
  const r = await ana.post('/hotel/rooms', { name: 'Mi cuarto '.repeat(10), description: 'Hola', model: 'b' });
  assert.equal(r.status, 200);
  assert.equal(r.data.room.name.length, 40);
  const id = r.data.room.id;
  // Límite de salas por persona
  for (let i = 1; i < MAX_ROOMS_PER_USER; i++) {
    const rr = await ana.post('/hotel/rooms', { name: `Sala ${i}`, model: 'a' });
    if (rr.status === 429) { await new Promise((res) => setTimeout(res, 1600)); i--; continue; }
    assert.equal(rr.status, 200);
  }
  await new Promise((res) => setTimeout(res, 1600));
  assert.equal((await ana.post('/hotel/rooms', { name: 'Una más', model: 'a' })).status, 400);
  // Listas
  const mine = (await ana.get('/hotel/rooms?tab=mine')).data;
  assert.equal(mine.rooms.length, MAX_ROOMS_PER_USER);
  const search = (await admin.get('/hotel/rooms?tab=all&q=Sala%202')).data.rooms;
  assert.equal(search.length, 1);
  assert.ok((await admin.get('/hotel/rooms?tab=popular')).data.rooms.length >= MAX_ROOMS_PER_USER);
  // Editar: solo dueño (o admin)
  const beto = await createMember(srv.url, admin, 'BetoH');
  assert.equal((await beto.patch(`/hotel/rooms/${id}`, { name: 'Mía' })).status, 403);
  assert.equal((await ana.patch(`/hotel/rooms/${id}`, { wallColor: 'rojo' })).status, 400);
  const up = await ana.patch(`/hotel/rooms/${id}`, { name: 'Cuarto de Ana', wallColor: '#223344' });
  assert.equal(up.data.room.name, 'Cuarto de Ana');
  assert.equal(up.data.room.wallColor, '#223344');
  assert.equal((await admin.patch(`/hotel/rooms/${id}`, { description: 'editado por admin' })).status, 200);
  // Tienda gratis: el teletransportador viene en par y enlazado
  const tp = (await ana.post('/hotel/buy', { type: 'teleport' })).data.items;
  assert.equal(tp.length, 2);
  assert.equal(tp[0].extra.link, tp[1].id);
  assert.equal(tp[1].extra.link, tp[0].id);
  const ch = (await ana.post('/hotel/buy', { type: 'chair_gamer', color: '#FFCC00' })).data.items[0];
  assert.equal(ch.color, '#FFCC00');
  assert.equal((await ana.post('/hotel/buy', { type: 'nope' })).status, 400);
});

test('hotel: acceso con contraseña, timbre (sí/no) y sala cerrada', async () => {
  const admin = await adminClient(srv.url);
  const owner = await createMember(srv.url, admin, 'DuenaH');
  const guest = await createMember(srv.url, admin, 'InvitadoH');
  const room = (await owner.post('/hotel/rooms', { name: 'Secreta', model: 'a', access: 'password', password: 'abc123' })).data.room;
  const so = await connect(owner), sg = await connect(guest);
  try {
    const f1 = once(sg, 'hotel:enter:fail');
    sg.emit('hotel:enter', { roomId: room.id, password: 'mal' });
    assert.equal((await f1).reason, 'password');
    const snap = await enter(sg, room.id, { password: 'abc123' });
    assert.equal(snap.room.id, room.id);
    assert.equal(snap.isOwner, false);
    sg.emit('hotel:leave');
    // Timbre sin nadie dentro
    await owner.patch(`/hotel/rooms/${room.id}`, { access: 'bell' });
    const f2 = once(sg, 'hotel:enter:fail');
    sg.emit('hotel:enter', { roomId: room.id });
    assert.equal((await f2).reason, 'nobody');
    // La dueña entra; timbre → no
    await enter(so, room.id);
    let bell = once(so, 'hotel:bell');
    const waiting = once(sg, 'hotel:waiting');
    sg.emit('hotel:enter', { roomId: room.id });
    await waiting;
    let b = await bell;
    assert.equal(b.userId, guest.user.id);
    const denied = once(sg, 'hotel:enter:fail');
    so.emit('hotel:bell:answer', { userId: guest.user.id, allow: false });
    assert.equal((await denied).reason, 'denied');
    // Timbre → sí
    await new Promise((r) => setTimeout(r, 50));
    bell = once(so, 'hotel:bell');
    const joined = once(so, 'hotel:user:join', (u) => u.id === guest.user.id);
    const room2 = once(sg, 'hotel:room');
    // El límite de timbres es 3 cada 15 s
    sg.emit('hotel:enter', { roomId: room.id });
    b = await bell;
    so.emit('hotel:bell:answer', { userId: guest.user.id, allow: true });
    await room2; await joined;
    sg.emit('hotel:leave');
    // Cerrada: solo dueña / permisos / admin
    await owner.patch(`/hotel/rooms/${room.id}`, { access: 'closed' });
    const f3 = once(sg, 'hotel:enter:fail');
    sg.emit('hotel:enter', { roomId: room.id });
    assert.equal((await f3).reason, 'closed');
    await owner.post(`/hotel/rooms/${room.id}/rights`, { userId: guest.user.id });
    const s3 = await enter(sg, room.id);
    assert.ok(s3.rights.includes(guest.user.id));
  } finally { so.close(); sg.close(); }
});

test('hotel: caminar, sentarse, colocar/apilar, recoger y permisos', async () => {
  const admin = await adminClient(srv.url);
  const owner = await createMember(srv.url, admin, 'DecoH');
  const other = await createMember(srv.url, admin, 'OtroH');
  const room = (await owner.post('/hotel/rooms', { name: 'Deco', model: 'b' })).data.room;
  const inv = (await owner.get('/hotel/inventory')).data.items;
  const otherInv = (await other.get('/hotel/inventory')).data.items;
  const byType = (t) => inv.find((i) => i.type === t);
  const so = await connect(owner), sx = await connect(other);
  try {
    const snap = await enter(so, room.id);
    assert.equal(snap.isOwner, true);
    assert.deepEqual([snap.users[0].x, snap.users[0].y], [0, 5], 'aparece en la puerta');
    await enter(sx, room.id);
    // Colocar mesa y apilar lámpara encima
    const table = byType('table_small'), lamp = byType('lamp_floor'), chair = byType('chair_basic');
    let added = once(sx, 'hotel:item', (m) => m.op === 'add' && m.item.id === table.id);
    const invGone = once(so, 'hotel:inv', (m) => m.remove?.includes(table.id));
    so.emit('hotel:place', { itemId: table.id, x: 4, y: 4, rot: 0 });
    await added; await invGone;
    added = once(sx, 'hotel:item', (m) => m.op === 'add' && m.item.id === lamp.id);
    so.emit('hotel:place', { itemId: lamp.id, x: 4, y: 4, rot: 0 });
    assert.equal((await added).item.z, FURNI_BY_ID.table_small.h);
    // No se puede poner algo encima de la lámpara
    const no = once(so, 'hotel:notice');
    so.emit('hotel:place', { itemId: byType('plant_big').id, x: 4, y: 4, rot: 0 });
    assert.match((await no).text, /encima/);
    // Quien no tiene permisos no coloca
    const noPerm = once(sx, 'hotel:notice');
    sx.emit('hotel:place', { itemId: otherInv[0].id, x: 6, y: 6, rot: 0 });
    assert.match((await noPerm).text, /permiso/);
    // Pared
    const poster = byType('poster_gtahub');
    added = once(sx, 'hotel:item', (m) => m.op === 'add' && m.item.id === poster.id);
    so.emit('hotel:place', { itemId: poster.id, wall: 'l', pos: 2, h: 1 });
    assert.deepEqual((await added).item.wall, { wall: 'l', pos: 2, h: 1 });
    // Silla y caminar a ella → sentado
    added = once(sx, 'hotel:item', (m) => m.op === 'add' && m.item.id === chair.id);
    so.emit('hotel:place', { itemId: chair.id, x: 3, y: 6, rot: 2 });
    await added;
    const path = once(sx, 'hotel:path', (m) => m.id === owner.user.id);
    so.emit('hotel:walk', { x: 3, y: 6 });
    const pm = await path;
    assert.deepEqual(pm.path[pm.path.length - 1].slice(0, 2), [3, 6]);
    const sat = await once(sx, 'hotel:user', (u) => u.id === owner.user.id && u.sit, 6000);
    assert.equal(sat.dir, 6); // rot 2 → mira hacia −x
    assert.ok(Math.abs(sat.z - FURNI_BY_ID.chair_basic.sit) < 1e-9);
    // El otro no puede terminar en la casilla ocupada
    const np = once(sx, 'hotel:nopath');
    sx.emit('hotel:walk', { x: 3, y: 6 });
    await np;
    // Casilla bloqueada por la mesa
    const np2 = once(sx, 'hotel:nopath');
    sx.emit('hotel:walk', { x: 4, y: 4 });
    await np2;
    // Recoger la silla: se levanta y vuelve al inventario de su dueña
    const back = once(so, 'hotel:inv', (m) => m.add?.some((i) => i.id === chair.id));
    const stood = once(sx, 'hotel:user', (u) => u.id === owner.user.id && !u.sit);
    so.emit('hotel:pickup', { itemId: chair.id });
    await back; await stood;
    assert.ok((await owner.get('/hotel/inventory')).data.items.some((i) => i.id === chair.id));
    // El otro no puede recoger ni mover
    const n2 = once(sx, 'hotel:notice');
    sx.emit('hotel:pickup', { itemId: table.id });
    await n2;
    // Con permisos sí (y el furni regresa a su dueña, no a quien lo recoge)
    const upd = once(sx, 'hotel:room:update', (m) => m.rights.includes(other.user.id));
    await owner.post(`/hotel/rooms/${room.id}/rights`, { userId: other.user.id });
    await upd;
    const back2 = once(so, 'hotel:inv', (m) => m.add?.some((i) => i.id === lamp.id));
    sx.emit('hotel:pickup', { itemId: lamp.id });
    await back2;
    // Girar la mesa (solo tiene rot 0) no hace nada; girar sofá sí
    const sofa = byType('sofa_2');
    added = once(so, 'hotel:item', (m) => m.op === 'add' && m.item.id === sofa.id);
    so.emit('hotel:place', { itemId: sofa.id, x: 7, y: 2, rot: 0 });
    await added;
    const rot = once(so, 'hotel:item', (m) => m.op === 'update' && m.item.id === sofa.id);
    so.emit('hotel:rotate', { itemId: sofa.id });
    assert.equal((await rot).item.rot, 2);
    // Borrar la sala: todo regresa al inventario
    const left = once(sx, 'hotel:left');
    assert.equal((await owner.del(`/hotel/rooms/${room.id}`)).status, 200);
    assert.equal((await left).reason, 'deleted');
    const after = (await owner.get('/hotel/inventory')).data.items;
    assert.ok(after.some((i) => i.id === table.id) && after.some((i) => i.id === sofa.id) && after.some((i) => i.id === poster.id));
  } finally { so.close(); sx.close(); }
});

test('hotel: chat (decir, gritar, susurro solo a quien va), dado y sacar de la sala', async () => {
  const admin = await adminClient(srv.url);
  const a = await createMember(srv.url, admin, 'ChatA');
  const b = await createMember(srv.url, admin, 'ChatB');
  const c = await createMember(srv.url, admin, 'ChatC');
  const room = (await a.post('/hotel/rooms', { name: 'Chat', model: 'a' })).data.room;
  const sa = await connect(a), sb = await connect(b), sc = await connect(c);
  try {
    await enter(sa, room.id); await enter(sb, room.id); await enter(sc, room.id);
    const gotB = once(sb, 'hotel:chat'), gotC = once(sc, 'hotel:chat');
    sa.emit('hotel:chat', { text: '  hola\u0000  a   todos ', mode: 'say' });
    assert.equal((await gotB).text, 'hola a todos');
    await gotC;
    const sh = once(sc, 'hotel:chat');
    sa.emit('hotel:chat', { text: 'AAA', mode: 'shout' });
    assert.equal((await sh).mode, 'shout');
    // Susurro: llega a B y a quien lo manda, no a C
    const wb = once(sb, 'hotel:chat'), wa = once(sa, 'hotel:chat', (m) => m.mode === 'whisper');
    const quiet = nothing(sc, 'hotel:chat');
    sa.emit('hotel:chat', { text: 'secreto', mode: 'whisper', to: b.user.id });
    const w = await wb;
    assert.equal(w.mode, 'whisper');
    assert.equal(w.to, b.user.id);
    await wa; await quiet;
    // Largo máximo
    const long = once(sb, 'hotel:chat');
    sa.emit('hotel:chat', { text: 'x'.repeat(500) });
    assert.equal((await long).text.length, 200);
    // Dado: rueda (estado 0) y cae en 1–6
    const dice = (await a.post('/hotel/buy', { type: 'dice' })).data.items[0];
    const placed = once(sb, 'hotel:item', (m) => m.op === 'add');
    sa.emit('hotel:place', { itemId: dice.id, x: 3, y: 3, rot: 0 });
    await placed;
    const rolling = once(sb, 'hotel:item', (m) => m.item?.id === dice.id && m.item.state === 0);
    const result = once(sb, 'hotel:item', (m) => m.item?.id === dice.id && m.roll);
    sb.emit('hotel:use', { itemId: dice.id });
    await rolling;
    const st = (await result).item.state;
    assert.ok(st >= 1 && st <= 6);
    // Sacar (kick) y vetar: solo con permisos / dueña
    const noKick = nothing(sc, 'hotel:left');
    sb.emit('hotel:kick', { userId: c.user.id });
    await noKick;
    const kicked = once(sc, 'hotel:left');
    sa.emit('hotel:kick', { userId: c.user.id, ban: true });
    assert.equal((await kicked).reason, 'ban');
    const f = once(sc, 'hotel:enter:fail');
    sc.emit('hotel:enter', { roomId: room.id });
    assert.equal((await f).reason, 'banned');
  } finally { sa.close(); sb.close(); sc.close(); }
});

test('hotel: teletransportador en par (misma sala y a otra sala) y salir por la puerta', async () => {
  const admin = await adminClient(srv.url);
  const a = await createMember(srv.url, admin, 'TeleA');
  const r1 = (await a.post('/hotel/rooms', { name: 'Uno', model: 'b' })).data.room;
  await new Promise((r) => setTimeout(r, 1600));
  const r2 = (await a.post('/hotel/rooms', { name: 'Dos', model: 'a', access: 'closed' })).data.room;
  const [t1, t2] = (await a.post('/hotel/buy', { type: 'teleport' })).data.items;
  const s = await connect(a);
  try {
    await enter(s, r1.id);
    let ok = once(s, 'hotel:item', (m) => m.op === 'add' && m.item.id === t1.id);
    s.emit('hotel:place', { itemId: t1.id, x: 2, y: 5, rot: 0 });
    await ok;
    ok = once(s, 'hotel:item', (m) => m.op === 'add' && m.item.id === t2.id);
    s.emit('hotel:place', { itemId: t2.id, x: 6, y: 2, rot: 0 });
    await ok;
    // Misma sala
    const tp = once(s, 'hotel:user', (u) => u.tp, 6000);
    s.emit('hotel:use', { itemId: t1.id });
    const u = await tp;
    assert.deepEqual([u.x, u.y], [6, 2]);
    // Recoger el segundo y ponerlo en la otra sala (cerrada, pero el teletransportador lleva)
    const back = once(s, 'hotel:inv', (m) => m.add);
    s.emit('hotel:pickup', { itemId: t2.id });
    await back;
    await enter(s, r2.id);
    ok = once(s, 'hotel:item', (m) => m.op === 'add' && m.item.id === t2.id);
    s.emit('hotel:place', { itemId: t2.id, x: 3, y: 3, rot: 0 });
    await ok;
    await enter(s, r1.id);
    const arrived = once(s, 'hotel:room', (m) => m.room.id === r2.id, 8000);
    s.emit('hotel:use', { itemId: t1.id });
    const snap = await arrived;
    const me = snap.users.find((x) => x.id === a.user.id);
    assert.deepEqual([me.x, me.y], [3, 3]);
    // Pisar la puerta = salir
    const left = once(s, 'hotel:left', () => true, 8000);
    s.emit('hotel:walk', { x: 0, y: 4 });
    assert.equal((await left).reason, 'door');
  } finally { s.close(); }
});

test('hotel: furnis exclusivos HUB (solo admins) y regalos', async () => {
  const admin = await adminClient(srv.url);
  const m = await createMember(srv.url, admin, 'ExclH');
  assert.equal(FURNI_BY_ID.throne.exclusive, true);
  assert.ok(FURNI_BY_ID.throne.price > 0);
  assert.equal(FURNI_BY_ID.gtahub_rug.exclusive, true);
  assert.ok(!FURNI_BY_ID.chair_basic.exclusive);
  const r = await m.post('/hotel/buy', { type: 'throne' });
  assert.equal(r.status, 403);
  assert.match(r.data.error, /exclusivo/i);
  assert.equal((await admin.post('/hotel/buy', { type: 'throne' })).status, 200);
  // Regalar: solo admins; llega al inventario y como aviso
  assert.equal((await m.post('/hotel/gift', { type: 'chair_basic', userId: admin.user.id })).status, 403);
  const s = await connect(m);
  try {
    const inv = once(s, 'hotel:inv', (x) => x.add);
    const notif = once(s, 'notification', (n) => n.type === 'hotel_gift');
    const g = await admin.post('/hotel/gift', { type: 'gtahub_car', userId: m.user.id });
    assert.equal(g.status, 200);
    await inv;
    assert.match((await notif).data.text, /Te regalaron/);
    assert.ok((await m.get('/hotel/inventory')).data.items.some((i) => i.type === 'gtahub_car'));
  } finally { s.close(); }
});
