// Hotel parte 2 (B, social): amigos y solicitudes, mensajes con entrega diferida, seguir con
// reglas de acceso, invitar, likes únicos, favoritas, categorías/etiquetas/búsqueda, eventos
// que vencen, lema/insignias y límite de respetos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { cleanTags, parseSearch, popularScore, eventActive, countdown, RESPECTS_PER_DAY } from '../shared/hotelSocial.js';

// ---------- Lógica pura ----------
test('hotel social: etiquetas, búsqueda y puntaje', () => {
  assert.deepEqual(cleanTags(['#Fiesta', 'fiesta', 'Música Latina', 'extra']), ['fiesta', 'música-latina']);
  assert.deepEqual(cleanTags('a, rol'), ['rol']);
  assert.deepEqual(parseSearch('owner:Ana #rol bar'), { owner: 'ana', tags: ['rol'], text: 'bar' });
  assert.deepEqual(parseSearch('tag:chill'), { owner: null, tags: ['chill'], text: '' });
  assert.ok(popularScore(2, 0) > popularScore(0, 15));
  assert.ok(popularScore(1, 5) > popularScore(1, 2));
  assert.equal(eventActive({ endsAt: 10 }, 9), true);
  assert.equal(eventActive({ endsAt: 10 }, 10), false);
  assert.equal(countdown(30e3), '30 s');
  assert.equal(countdown(125 * 60e3), '2 h 05 min');
});

// ---------- Servidor ----------
let srv, admin;
before(async () => { srv = await startServer(); admin = await adminClient(srv.url); });
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
const call = (s, ev, m) => new Promise((resolve) => s.emit(ev, m, resolve));
const enter = async (s, roomId, extra = {}) => { const p = once(s, 'hotel:room'); s.emit('hotel:enter', { roomId, ...extra }); return p; };
const befriend = async (a, b) => {
  assert.equal((await a.post('/hotel/social/requests', { userId: b.user.id })).status, 200);
  assert.equal((await b.post(`/hotel/social/requests/${a.user.id}/accept`)).status, 200);
};

test('hotel social: solicitudes de amistad (mandar, rechazar, aceptar, cruzadas) y búsqueda', async () => {
  const ana = await createMember(srv.url, admin, 'AnaS');
  const beto = await createMember(srv.url, admin, 'BetoS');
  const caro = await createMember(srv.url, admin, 'CaroS');
  const sb = await connect(beto);
  try {
    // Buscar personas
    const found = (await ana.get('/hotel/social/search?q=betos')).data.users;
    assert.equal(found.length, 1);
    assert.equal(found[0].id, beto.user.id);
    assert.equal(found[0].friend, false);
    assert.equal((await ana.post('/hotel/social/requests', { userId: ana.user.id })).status, 400, 'a ti no');
    // Mandar: le llega en vivo
    const got = once(sb, 'hotel:social', (m) => m.type === 'request');
    assert.equal((await ana.post('/hotel/social/requests', { userId: beto.user.id })).data.friends, false);
    assert.equal((await got).user.id, ana.user.id);
    let st = (await beto.get('/hotel/social')).data;
    assert.deepEqual(st.requests.map((r) => r.id), [ana.user.id]);
    assert.deepEqual((await ana.get('/hotel/social')).data.sent, [beto.user.id]);
    // Rechazar
    await beto.post(`/hotel/social/requests/${ana.user.id}/decline`);
    assert.equal((await beto.get('/hotel/social')).data.requests.length, 0);
    assert.equal((await beto.post(`/hotel/social/requests/${ana.user.id}/accept`)).status, 404, 'ya no existe');
    // Otra vez y aceptar
    await ana.post('/hotel/social/requests', { userId: beto.user.id });
    const fr = once(sb, 'hotel:social', (m) => m.type === 'friend');
    assert.equal((await beto.post(`/hotel/social/requests/${ana.user.id}/accept`)).status, 200);
    assert.equal((await fr).user.id, ana.user.id);
    st = (await beto.get('/hotel/social')).data;
    assert.deepEqual(st.friends.map((f) => f.id), [ana.user.id]);
    assert.equal(st.friends[0].online, false);
    assert.equal((await ana.post('/hotel/social/requests', { userId: beto.user.id })).status, 400, 'ya son amigos');
    // Cruzadas: si la otra persona ya te mandó, quedan amigos de una vez
    await caro.post('/hotel/social/requests', { userId: ana.user.id });
    assert.equal((await ana.post('/hotel/social/requests', { userId: caro.user.id })).data.friends, true);
    assert.equal((await ana.get('/hotel/social')).data.friends.length, 2);
    // Quitar amigo
    await ana.del(`/hotel/social/friends/${caro.user.id}`);
    assert.equal((await caro.get('/hotel/social')).data.friends.length, 0);
  } finally { sb.close(); }
});

test('hotel social: mensajes privados solo entre amigos, en vivo y diferidos (sin leer hasta abrir)', async () => {
  const ana = await createMember(srv.url, admin, 'AnaM');
  const beto = await createMember(srv.url, admin, 'BetoM');
  const otro = await createMember(srv.url, admin, 'OtroM');
  assert.equal((await ana.post('/hotel/social/messages', { to: beto.user.id, text: 'hola' })).status, 403, 'no son amigos');
  await befriend(ana, beto);
  // Beto no está conectado: el mensaje queda guardado
  const r = await ana.post('/hotel/social/messages', { to: beto.user.id, text: '  ¿vienes a mi sala?  ' });
  assert.equal(r.status, 200);
  assert.equal(r.data.delivered, false);
  assert.equal(r.data.message.text, '¿vienes a mi sala?');
  assert.equal((await ana.post('/hotel/social/messages', { to: beto.user.id, text: '   ' })).status, 400);
  // Al abrir la consola, lo ve como no leído
  let st = (await beto.get('/hotel/social')).data;
  assert.equal(st.unread, 1);
  assert.equal(st.friends[0].unread, 1);
  assert.equal(st.friends[0].last.text, '¿vienes a mi sala?');
  // Al abrir la conversación se marca como leído
  const conv = (await beto.get(`/hotel/social/messages/${ana.user.id}`)).data.messages;
  assert.deepEqual(conv.map((m) => m.text), ['¿vienes a mi sala?']);
  st = (await beto.get('/hotel/social')).data;
  assert.equal(st.unread, 0);
  // En vivo cuando sí está conectado
  const sb = await connect(beto);
  try {
    const live = once(sb, 'hotel:pm');
    const r2 = await ana.post('/hotel/social/messages', { to: beto.user.id, text: 'ya llegué' });
    assert.equal(r2.data.delivered, true);
    const m = await live;
    assert.equal(m.text, 'ya llegué');
    assert.equal(m.from, ana.user.id);
    assert.equal(m.name, ana.user.displayName);
    // Nadie más puede leer la conversación ajena
    assert.equal((await otro.get(`/hotel/social/messages/${ana.user.id}`)).data.messages.length, 0);
  } finally { sb.close(); }
});

test('hotel social: seguir a un amigo respeta el acceso de la sala; invitar manda aviso', async () => {
  const ana = await createMember(srv.url, admin, 'AnaF');
  const beto = await createMember(srv.url, admin, 'BetoF');
  const extra = await createMember(srv.url, admin, 'ExtraF');
  const open = (await ana.post('/hotel/rooms', { name: 'Abierta F', model: 'a' })).data.room;
  await new Promise((r) => setTimeout(r, 1600));
  const closed = (await ana.post('/hotel/rooms', { name: 'Cerrada F', model: 'a', access: 'closed' })).data.room;
  await new Promise((r) => setTimeout(r, 1600));
  const pw = (await ana.post('/hotel/rooms', { name: 'Clave F', model: 'a', access: 'password', password: 'abc123' })).data.room;
  const sa = await connect(ana), sb = await connect(beto), sx = await connect(extra);
  try {
    assert.match((await call(sb, 'hotel:follow', { userId: ana.user.id })).error, /amigos/, 'sin ser amigos no');
    await befriend(ana, beto);
    assert.match((await call(sb, 'hotel:follow', { userId: ana.user.id })).error, /ninguna sala/);
    // Sala abierta: sí
    await enter(sa, open.id);
    let f = await call(sb, 'hotel:follow', { userId: ana.user.id });
    assert.equal(f.ok, true);
    assert.equal(f.roomId, open.id);
    // La consola dice en qué sala está
    const st = (await beto.get('/hotel/social')).data;
    assert.equal(st.friends[0].online, true);
    assert.equal(st.friends[0].room.id, open.id);
    // Invitar: le llega a Beto (amigo); a Extra (no amigo) no
    const inv = once(sb, 'hotel:invite');
    const ir = await call(sa, 'hotel:invite', { userIds: [beto.user.id, extra.user.id] });
    assert.equal(ir.sent, 1);
    const iv = await inv;
    assert.equal(iv.roomId, open.id);
    assert.equal(iv.name, ana.user.displayName);
    let gotX = false; sx.on('hotel:invite', () => { gotX = true; });
    // Sala cerrada: no se puede seguir
    await enter(sa, closed.id);
    f = await call(sb, 'hotel:follow', { userId: ana.user.id });
    assert.match(f.error, /cerrada/);
    // … y aunque lo intente directo, el servidor no lo deja
    const fail = once(sb, 'hotel:enter:fail');
    sb.emit('hotel:enter', { roomId: closed.id });
    assert.equal((await fail).reason, 'closed');
    // Con permisos sí
    await ana.post(`/hotel/rooms/${closed.id}/rights`, { userId: beto.user.id });
    f = await call(sb, 'hotel:follow', { userId: ana.user.id });
    assert.equal(f.ok, true);
    // Contraseña: avisa que la pide
    await enter(sa, pw.id);
    f = await call(sb, 'hotel:follow', { userId: ana.user.id });
    assert.equal(f.access, 'password');
    const pf = once(sb, 'hotel:enter:fail');
    sb.emit('hotel:enter', { roomId: pw.id, password: 'mal' });
    assert.equal((await pf).reason, 'password');
    // Veto: no se puede seguir
    await enter(sb, pw.id, { password: 'abc123' });
    const left = once(sb, 'hotel:left');
    sa.emit('hotel:kick', { userId: beto.user.id, ban: true });
    await left;
    f = await call(sb, 'hotel:follow', { userId: ana.user.id });
    assert.match(f.error, /por un rato/);
    assert.equal(gotX, false);
  } finally { sa.close(); sb.close(); sx.close(); }
});

test('hotel social: like único por persona, favoritas, categorías, etiquetas y búsqueda', async () => {
  const ana = await createMember(srv.url, admin, 'AnaL');
  const beto = await createMember(srv.url, admin, 'BetoL');
  const caro = await createMember(srv.url, admin, 'CaroL');
  const room = (await ana.post('/hotel/rooms', { name: 'Antro Neón', model: 'a', category: 'fiesta', tags: ['#Reggaeton', 'noche', 'tercera'] })).data.room;
  assert.equal(room.category, 'fiesta');
  assert.deepEqual(room.tags, ['reggaeton', 'noche']);
  assert.equal(room.likes, 0);
  // Like: uno por persona (repetir no suma) y no a tu propia sala
  assert.equal((await ana.post(`/hotel/social/rooms/${room.id}/like`)).status, 400);
  assert.equal((await beto.post(`/hotel/social/rooms/${room.id}/like`)).data.likes, 1);
  const again = (await beto.post(`/hotel/social/rooms/${room.id}/like`)).data;
  assert.equal(again.likes, 1);
  assert.equal(again.already, true);
  assert.equal((await caro.post(`/hotel/social/rooms/${room.id}/like`)).data.likes, 2);
  const seen = (await beto.get(`/hotel/rooms/${room.id}`)).data.room;
  assert.equal(seen.likes, 2);
  assert.equal(seen.liked, true);
  assert.equal((await beto.del(`/hotel/social/rooms/${room.id}/like`)).data.likes, 1);
  // Favoritas
  await beto.post(`/hotel/social/rooms/${room.id}/fav`);
  await beto.post(`/hotel/social/rooms/${room.id}/fav`);
  const favs = (await beto.get('/hotel/nav?tab=favorites')).data.rooms;
  assert.deepEqual(favs.map((r) => r.id), [room.id]);
  assert.equal(favs[0].fav, true);
  assert.equal((await caro.get('/hotel/nav?tab=favorites')).data.rooms.length, 0);
  await beto.del(`/hotel/social/rooms/${room.id}/fav`);
  assert.equal((await beto.get('/hotel/nav?tab=favorites')).data.rooms.length, 0);
  // Editar categoría y etiquetas (solo dueño)
  assert.equal((await beto.patch(`/hotel/rooms/${room.id}`, { category: 'chill' })).status, 403);
  const up = (await ana.patch(`/hotel/rooms/${room.id}`, { category: 'rol', tags: 'roleplay' })).data.room;
  assert.equal(up.category, 'rol');
  assert.deepEqual(up.tags, ['roleplay']);
  assert.equal((await ana.patch(`/hotel/rooms/${room.id}`, { category: 'nope' })).data.room.category, 'rol', 'categoría inválida no cambia');
  // Búsqueda: owner:, #etiqueta y texto; filtro por categoría
  const s1 = (await caro.get(`/hotel/nav?tab=search&q=${encodeURIComponent(`owner:${ana.user.username}`)}`)).data.rooms;
  assert.deepEqual(s1.map((r) => r.id), [room.id]);
  const s2 = (await caro.get(`/hotel/nav?tab=search&q=${encodeURIComponent('#roleplay')}`)).data.rooms;
  assert.ok(s2.some((r) => r.id === room.id));
  const s3 = (await caro.get(`/hotel/nav?tab=search&q=${encodeURIComponent('neón')}`)).data.rooms;
  assert.ok(s3.some((r) => r.id === room.id));
  assert.equal((await caro.get(`/hotel/nav?tab=search&q=${encodeURIComponent('owner:nadie_existe')}`)).data.rooms.length, 0);
  const cat = (await caro.get('/hotel/nav?tab=popular&category=rol')).data.rooms;
  assert.ok(cat.length >= 1 && cat.every((r) => r.category === 'rol'));
  // Populares: más likes arriba (sin gente dentro)
  await new Promise((r) => setTimeout(r, 1600));
  const other = (await ana.post('/hotel/rooms', { name: 'Sin likes', model: 'a' })).data.room;
  const pop = (await caro.get('/hotel/nav?tab=popular')).data.rooms.map((r) => r.id);
  assert.ok(pop.indexOf(room.id) < pop.indexOf(other.id));
  // Oficiales siguen en su pestaña
  assert.ok((await caro.get('/hotel/nav?tab=official')).data.rooms.every((r) => r.official));
});

test('hotel social: eventos (1–3 h, solo dueño, banner en la sala) y vencen solos', async () => {
  const ana = await createMember(srv.url, admin, 'AnaE');
  const beto = await createMember(srv.url, admin, 'BetoE');
  const room = (await ana.post('/hotel/rooms', { name: 'Karaoke E', model: 'a' })).data.room;
  assert.equal((await beto.post(`/hotel/social/rooms/${room.id}/event`, { title: 'Mío', hours: 1 })).status, 403);
  assert.equal((await ana.post(`/hotel/social/rooms/${room.id}/event`, { title: 'Karaoke', hours: 5 })).status, 400);
  assert.equal((await ana.post(`/hotel/social/rooms/${room.id}/event`, { title: '', hours: 1 })).status, 400);
  const sb = await connect(beto);
  try {
    await enter(sb, room.id);
    const upd = once(sb, 'hotel:room:update', (m) => !!m.room.event);
    const r = await ana.post(`/hotel/social/rooms/${room.id}/event`, { title: 'Karaoke night', description: 'Trae tu canción', hours: 2 });
    assert.equal(r.status, 200);
    const ev = r.data.event;
    assert.equal(ev.title, 'Karaoke night');
    assert.ok(Math.abs(ev.endsAt - ev.startsAt - 2 * 3600e3) < 1000);
    assert.equal((await upd).room.event.title, 'Karaoke night', 'banner en vivo para quien está dentro');
    const list = (await beto.get('/hotel/nav?tab=events')).data.rooms;
    assert.ok(list.some((x) => x.id === room.id && x.event.title === 'Karaoke night'));
    // Vence: movemos la hora de fin al pasado directo en la base
    const db = new DatabaseSync(path.join(srv.dataDir, 'office.db'));
    db.prepare('UPDATE hotel_events SET ends_at = ? WHERE room_id = ?').run(Date.now() - 1000, room.id);
    db.close();
    assert.ok(!(await beto.get('/hotel/nav?tab=events')).data.rooms.some((x) => x.id === room.id));
    assert.equal((await beto.get(`/hotel/rooms/${room.id}`)).data.room.event, null);
    // Terminar antes
    await ana.post(`/hotel/social/rooms/${room.id}/event`, { title: 'Otra', hours: 1 });
    assert.equal((await ana.del(`/hotel/social/rooms/${room.id}/event`)).status, 200);
    assert.equal((await beto.get(`/hotel/rooms/${room.id}`)).data.room.event, null);
  } finally { sb.close(); }
});

test('hotel social: lema, insignias solo ganadas y respetos (3 al día, no a ti, misma sala)', async () => {
  const ana = await createMember(srv.url, admin, 'AnaR');
  const beto = await createMember(srv.url, admin, 'BetoR');
  const room = (await ana.post('/hotel/rooms', { name: 'Respeto R', model: 'b' })).data.room;
  // Lema
  const p = await ana.patch('/hotel/social/profile', { motto: '  Rolera de corazón 💖  '.padEnd(120, '!'), badges: ['veteran', 'nope'] });
  assert.equal(p.status, 200);
  assert.ok(p.data.motto.startsWith('Rolera de corazón 💖'));
  assert.ok(p.data.motto.length <= 60);
  assert.deepEqual(p.data.badges, [], 'no puede mostrar insignias que no ganó');
  // Insignia ganada (sembrada directo en la base)
  const db = new DatabaseSync(path.join(srv.dataDir, 'office.db'));
  db.prepare('INSERT INTO achievements (user_id, badge, tier, earned_at) VALUES (?, ?, ?, ?)').run(ana.user.id, 'dance', 2, Date.now());
  db.close();
  assert.deepEqual((await ana.patch('/hotel/social/profile', { badges: ['dance', 'veteran'] })).data.badges, ['dance']);
  const prof = (await beto.get(`/hotel/social/profile/${ana.user.id}`)).data;
  assert.ok(prof.motto.startsWith('Rolera'));
  assert.deepEqual(prof.badges, [{ id: 'dance', tier: 2 }]);
  assert.equal(prof.respects, 0);

  const sa = await connect(ana), sb = await connect(beto);
  try {
    // En la sala los avatares traen motto/badges/respects
    await enter(sa, room.id);
    const snap = await enter(sb, room.id);
    const A = snap.users.find((u) => u.id === ana.user.id);
    assert.ok(A.motto.startsWith('Rolera'));
    assert.deepEqual(A.badges, ['dance']);
    assert.equal(A.respects, 0);
    // Cambiar el lema avisa a la sala
    const su = once(sb, 'hotel:social:user', (m) => m.id === ana.user.id);
    await ana.patch('/hotel/social/profile', { motto: 'Nuevo lema' });
    assert.equal((await su).motto, 'Nuevo lema');
    // Respetos
    assert.match((await call(sb, 'hotel:respect', { userId: beto.user.id })).error, /a ti/);
    const fx = once(sa, 'hotel:respect');
    let r = await call(sb, 'hotel:respect', { userId: ana.user.id });
    assert.equal(r.ok, true);
    assert.equal(r.left, RESPECTS_PER_DAY - 1);
    const e = await fx;
    assert.equal(e.to, ana.user.id);
    assert.equal(e.respects, 1);
    for (let i = 1; i < RESPECTS_PER_DAY; i++) r = await call(sb, 'hotel:respect', { userId: ana.user.id });
    assert.equal(r.left, 0);
    assert.equal(r.respects, RESPECTS_PER_DAY);
    const over = await call(sb, 'hotel:respect', { userId: ana.user.id });
    assert.match(over.error, /3 respetos/);
    assert.equal((await beto.get(`/hotel/social/profile/${ana.user.id}`)).data.respects, RESPECTS_PER_DAY);
    assert.equal((await beto.get(`/hotel/social/profile/${beto.user.id}`)).data.respectsLeft, 0);
    // Ana sí tiene los suyos; pero solo a alguien de su sala
    sb.emit('hotel:leave');
    await new Promise((res) => setTimeout(res, 150));
    assert.match((await call(sa, 'hotel:respect', { userId: beto.user.id })).error, /no está en la sala/);
  } finally { sa.close(); sb.close(); }
});
