// Hotel parte 2 — agente D: el personaje de la oficina en 8 direcciones, objetos en la mano,
// cartel / efectos / sentarse / dormir por chat, y el aviso de la vista de llegada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { PRESETS, hotelFrame, renderDiagSheet, renderFullSheet, randomSpec, DIAG_DIRS, DIRS8, HAND_ITEMS, FRAME_W, FRAME_H } from '../shared/sprite.js';
import { renderAvatarPixels } from '../client/src/hotel/avatarIso.js';

const count = (d) => { let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k]) n++; return n; };
const hash = (d) => createHash('sha256').update(Buffer.from(d)).digest('hex');

test('sprite: las 4 vistas de 3/4 existen, son del mismo tamaño y salen siempre iguales', () => {
  assert.deepEqual(DIRS8, ['upRight', 'right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up']);
  for (const spec of [PRESETS[0], PRESETS.find((p) => p.hat === 'cowboy'), PRESETS.find((p) => p.hairStyle === 'long'), {}]) {
    for (const dir of DIAG_DIRS) {
      for (const o of [{ step: 0 }, { step: 1 }, { step: 3 }, { pose: 'sit' }, { pose: 'wave1' }, { hold: 'cafe' }, { hold: 'cafe', drink: true }, { pose: 'sign', sign: 4 }]) {
        const a = hotelFrame(spec, { dir, ...o }), b = hotelFrame(spec, { dir, ...o });
        assert.equal(a.width, FRAME_W); assert.equal(a.height, FRAME_H);
        assert.ok(count(a.data) > 300, `${dir} ${JSON.stringify(o)}: ${count(a.data)} px`);
        assert.equal(hash(a.data), hash(b.data), 'determinista');
      }
    }
  }
  // Izquierda y derecha son espejo
  const l = hotelFrame(PRESETS[2], { dir: 'downLeft' }).data, r = hotelFrame(PRESETS[2], { dir: 'downRight' }).data;
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) assert.equal(l[(y * FRAME_W + x) * 4 + 3], r[(y * FRAME_W + FRAME_W - 1 - x) * 4 + 3]);
  // Caminar cambia el dibujo; la hoja de 3/4 es determinista
  assert.notEqual(hash(hotelFrame(PRESETS[0], { dir: 'downLeft', step: 1 }).data), hash(hotelFrame(PRESETS[0], { dir: 'downLeft', step: 3 }).data));
  assert.equal(hash(renderDiagSheet(PRESETS[3]).data), hash(renderDiagSheet(PRESETS[3]).data));
});

test('sprite: la hoja de la oficina no cambió (las vistas del Hotel se agregaron aparte)', () => {
  const h = createHash('sha256');
  for (const p of PRESETS) h.update(Buffer.from(renderFullSheet(p).data));
  for (let i = 0; i < 20; i++) { let s = i * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280); h.update(Buffer.from(renderFullSheet(randomSpec(r)).data)); }
  // Huella de la hoja de la oficina antes de agregar las vistas del Hotel: si cambia, cambió el personaje de la oficina
  assert.equal(h.digest('hex'), '4578970bb21a91df6b73619238542dd9a48b12e3813fbe3e8043dc7650019c1f');
});

test('sprite: objetos en la mano, en la mano cercana de cada vista', () => {
  for (const item of HAND_ITEMS) {
    const plain = hotelFrame(PRESETS[0], { dir: 'down' }), held = hotelFrame(PRESETS[0], { dir: 'down', hold: item });
    assert.notEqual(hash(plain.data), hash(held.data), item);
    assert.equal(held.holdArm, 'b');
    assert.ok(held.hands.b, 'se sabe dónde está la mano');
  }
  assert.equal(hotelFrame(PRESETS[0], { dir: 'left', hold: 'cafe' }).holdArm, 'a');
  assert.equal(hotelFrame(PRESETS[0], { dir: 'upLeft', hold: 'cafe' }).holdArm, 'a');
  assert.equal(hotelFrame(PRESETS[0], { dir: 'downLeft', hold: 'cafe' }).holdArm, 'b');
});

test('Hotel: el personaje es el sprite de la oficina (2 px por píxel), pies en el ancla, acostado sobre la cama', () => {
  for (let dir = 0; dir < 8; dir++) {
    const r = renderAvatarPixels(PRESETS[5], { dir, pose: 'stand' });
    assert.equal(r.w, FRAME_W * 2); assert.equal(r.h, FRAME_H * 2);
    assert.equal(r.ay, 47 * 2, 'los zapatos pisan la casilla');
  }
  const s = renderAvatarPixels(PRESETS[5], { dir: 4, pose: 'sit', seatH: 0.5 });
  assert.ok(s.ay < 47 * 2, 'sentado: el ancla es la cadera');
  for (const dir of [0, 2, 4, 6]) {
    const r = renderAvatarPixels(PRESETS[5], { dir, pose: 'lay' });
    assert.ok(r.w > r.h * 0.9, `acostado a lo largo (${r.w}×${r.h})`);
    assert.ok(r.ax > 0 && r.ax < r.w && r.ay > 0 && r.ay < r.h);
  }
});

// ---------- Servidor ----------
let srv;
before(async () => { srv = await startServer({ env: { HOTEL_SIGN_MS: '500', HOTEL_AFK_MS: '1500' } }); });
after(async () => { await srv?.stop(); });

const connect = (c) => new Promise((resolve, reject) => {
  const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const once = (s, ev, pred = () => true, ms = 6000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`timeout esperando ${ev} ${pred}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('servidor: cartel, efectos, sentarse en el piso, dormir (también solo) y despertar', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'CartelD');
  const room = (await ana.post('/hotel/rooms', { name: 'Pruebas D', model: 'b' })).data.room;
  const s = await connect(ana);
  const sa = await connect(admin);
  try {
    const me = ana.user.id;
    const mine = (m) => m.id === me;
    let p = once(s, 'hotel:room');
    s.emit('hotel:enter', { roomId: room.id });
    const snap = await p;
    const u0 = snap.users.find(mine);
    assert.equal(u0.sign, null); assert.equal(u0.effect, null); assert.equal(u0.hand, null);
    // Caminar dentro para no estar en la puerta
    p = once(s, 'hotel:user', (m) => mine(m) && m.x === 3);
    s.emit('hotel:walk', { x: 3, y: 5 });
    await p;

    // Cartel: aparece y se quita solo
    p = once(s, 'hotel:user', (m) => mine(m) && m.sign === 7);
    s.emit('hotel:chat', { text: ':cartel 7' });
    await p;
    await once(s, 'hotel:user', (m) => mine(m) && m.sign === null, 3000);
    // Número inválido: aviso, no se manda al chat
    p = once(s, 'hotel:notice');
    s.emit('hotel:chat', { text: ':sign 99' });
    assert.match((await p).text, /0 al 10/);

    // Efectos: se pone, se cambia y se quita; el reflector es del staff
    p = once(s, 'hotel:user', (m) => mine(m) && m.effect === 'brillos');
    s.emit('hotel:chat', { text: ':efecto brillos' });
    await p;
    p = once(s, 'hotel:notice');
    s.emit('hotel:chat', { text: ':efecto reflector' });
    assert.match((await p).text, /staff/);
    p = once(s, 'hotel:user', (m) => mine(m) && m.effect === null);
    s.emit('hotel:chat', { text: ':efecto' });
    await p;
    s.emit('hotel:chat', { text: ':efecto fuego' });
    await once(s, 'hotel:user', (m) => mine(m) && m.effect === 'fuego');

    // Sentarse en el piso y pararse
    p = once(s, 'hotel:user', (m) => mine(m) && m.sit?.floor);
    s.emit('hotel:chat', { text: ':sentarse' });
    await p;
    p = once(s, 'hotel:user', (m) => mine(m) && !m.sit);
    s.emit('hotel:chat', { text: ':sentarse' });
    await p;

    // Dormir con el comando y despertar al hacer algo
    p = once(s, 'hotel:user', (m) => mine(m) && m.act === 'sleep');
    s.emit('hotel:chat', { text: ':dormir' });
    await p;
    p = once(s, 'hotel:user', (m) => mine(m) && m.act === null);
    s.emit('hotel:typing', true);
    await p;
    // Sin hacer nada un rato (aquí 1.5 s) se queda dormido solo
    await once(s, 'hotel:user', (m) => mine(m) && m.act === 'sleep', 6000);

    // Los comandos no salen en el chat
    const chats = [];
    s.on('hotel:chat', (m) => chats.push(m.text));
    s.emit('hotel:chat', { text: 'hola' });
    await sleep(300);
    assert.deepEqual(chats, ['hola']);

    // El efecto se conserva al cambiar de sala
    const room2 = (await ana.post('/hotel/rooms', { name: 'Pruebas D2', model: 'a' })).data.room;
    p = once(s, 'hotel:room');
    s.emit('hotel:enter', { roomId: room2.id });
    assert.equal((await p).users.find(mine).effect, 'fuego');

    // Staff: reflector y objeto en la mano
    p = once(sa, 'hotel:room');
    sa.emit('hotel:enter', { roomId: room2.id });
    await p;
    p = once(s, 'hotel:user', (m) => m.id === admin.user.id && m.effect === 'reflector');
    sa.emit('hotel:chat', { text: ':efecto reflector' });
    await p;
    p = once(s, 'hotel:user', (m) => m.id === admin.user.id && m.hand === 'cafe');
    sa.emit('hotel:chat', { text: ':mano cafe' });
    await p;
  } finally { s.close(); sa.close(); }
});

test('servidor: aviso de la vista del Hotel (solo el staff lo cambia)', async () => {
  const admin = await adminClient(srv.url);
  const beto = await createMember(srv.url, admin, 'PromoD');
  const r0 = await beto.get('/hotel/promo');
  assert.equal(r0.status, 200);
  assert.ok(r0.data.promo.title);
  assert.equal((await beto.put('/hotel/promo', { title: 'X' })).status, 403);
  const r = await admin.put('/hotel/promo', { title: '  Noche de karaoke  ', text: 'Hoy a las 9 en la Sala de juegos', button: 'Ir', roomKey: 'juegos' });
  assert.equal(r.status, 200);
  assert.equal(r.data.promo.title, 'Noche de karaoke');
  assert.equal((await beto.get('/hotel/promo')).data.promo.roomKey, 'juegos');
  assert.equal((await admin.put('/hotel/promo', { title: '' })).status, 400);
});
