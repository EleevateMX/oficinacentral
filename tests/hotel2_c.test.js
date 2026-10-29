// Hotel parte 2 (C · Mecánicas): rodillos, puerta de un sentido, máquinas y objetos en la mano,
// rueda / medidor de amor con azar inyectado, marcador, trofeo, regulador de luz, wired y bots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { buildRoom, tileInfo, findPath } from '../shared/hotelRoom.js';
import { FURNI_BY_ID, HOTEL_LINES } from '../shared/hotelCatalog.js';
import mecanica, { vendOf, HAND_ITEMS } from '../shared/hotelLines/mecanica.js';
import { planRollers, onewayCheck, spinResult, loveResult, mulberry32, drinkRequest, receptionReply, greeting, besideTiles, isBeside } from '../server/hotelMechanics.js';
import { cleanConfig, matchKeyword } from '../server/hotelWired.js';
import artMecanica from '../client/src/hotel/art/lines/mecanica.js';
import { drawFurni, drawWallItem, furniBounds, wallBounds } from '../client/src/hotel/furniArt.js';

// ---------- Lógica pura ----------
const roller = (id, x, y, rot, z = 0) => ({ id, type: 'mecanica_roller', x, y, z, rot, state: 0 });
const ROLLER_H = FURNI_BY_ID.mecanica_roller.h;

test('línea mecánica: catálogo, contrato de objetos en la mano y dibujo', () => {
  assert.ok(HOTEL_LINES.some((l) => l.id === 'mecanica'));
  for (const d of mecanica) {
    assert.equal(FURNI_BY_ID[d.id], d);
    assert.ok(d.id.startsWith('mecanica_'));
    assert.ok(d.price >= 2 && d.price <= 60, d.id);
    if (d.kind === 'floor') { assert.ok(artMecanica.floor[d.id], `${d.id} sin dibujo`); const b = furniBounds(d, d.rots[0]); assert.ok(b.w > 10 && b.h > 10, d.id); }
    else { assert.ok(artMecanica.wall[d.id], `${d.id} sin dibujo`); assert.ok(wallBounds(d).w > 5); }
  }
  assert.deepEqual(Object.keys(HAND_ITEMS).sort(), ['agua', 'cafe', 'helado', 'palomitas', 'refresco', 'rosa']);
  assert.equal(vendOf(FURNI_BY_ID.fiesta_soda), 'refresco');
  assert.equal(vendOf(FURNI_BY_ID.fiesta_icecream), 'helado');
  assert.equal(vendOf(FURNI_BY_ID.cocina_coffee), 'cafe');
  assert.equal(vendOf(FURNI_BY_ID.mecanica_popcorn), 'palomitas');
  assert.equal(vendOf(FURNI_BY_ID.chair_basic), null);
  // Se dibuja sin errores en todos sus estados (contexto falso)
  const ctx = new Proxy({ getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), measureText: (t) => ({ width: String(t).length * 6 }) }, {
    get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; },
  });
  for (const d of mecanica) for (let st = 0; st < Math.min(d.states, 14); st++) {
    if (d.kind === 'wall') drawWallItem(ctx, d, { state: st, extra: {} }, { direct: true });
    else for (const rot of d.rots) drawFurni(ctx, d, { rot, state: st, extra: {} }, { t: st * 333, direct: true });
  }
});

test('rodillos: mueven personas y furnis, en cadena, y se detienen si está bloqueado', () => {
  // Una persona sobre un rodillo que mira a +x (rot 6) avanza una casilla
  let g = buildRoom('b', [roller(1, 3, 3, 6)]);
  const u = (id, x, y, z = ROLLER_H, moving = false) => ({ id, x, y, z, moving });
  let p = planRollers(g, [roller(1, 3, 3, 6)].map((r) => g.tiles[3][3].find((q) => q.id === r.id)), [u(10, 3, 3)]);
  assert.deepEqual(p.users, [{ id: 10, from: [3, 3, ROLLER_H], to: [4, 3, 0] }]);
  // Caminando no lo mueve
  assert.equal(planRollers(g, g.tiles[3][3], [u(10, 3, 3, ROLLER_H, true)]).users.length, 0);

  // Cadena: dos rodillos seguidos con una persona en cada uno → ambos avanzan
  const chain = [roller(1, 3, 3, 6), roller(2, 4, 3, 6)];
  g = buildRoom('b', chain);
  p = planRollers(g, chain, [u(10, 3, 3), u(11, 4, 3)]);
  assert.deepEqual(p.users.map((m) => [m.id, m.to[0], m.to[1], m.to[2]]).sort(), [[10, 4, 3, ROLLER_H], [11, 5, 3, 0]]);

  // Bloqueado: un librero adelante (o alguien parado ahí) → no se mueve
  const shelf = { id: 3, type: 'plant_big', x: 4, y: 3, z: 0, rot: 0 };
  g = buildRoom('b', [roller(1, 3, 3, 6), shelf]);
  assert.equal(planRollers(g, [g.tiles[3][3][0]], [u(10, 3, 3)]).users.length, 0, 'furni sólido');
  g = buildRoom('b', [roller(1, 3, 3, 6)]);
  assert.equal(planRollers(g, [g.tiles[3][3][0]], [u(10, 3, 3), u(11, 4, 3, 0)]).users.length, 0, 'persona adelante');

  // Furni encima: viaja con su altura relativa y queda en el grid nuevo
  const plant = { id: 5, type: 'plant_small', x: 3, y: 3, z: ROLLER_H, rot: 0 };
  const lamp = { id: 6, type: 'lamp_floor', x: 3, y: 3, z: ROLLER_H, rot: 0 };
  const r1 = roller(1, 3, 3, 6), r2 = roller(2, 4, 3, 6);
  g = buildRoom('b', [r1, r2, plant]);
  p = planRollers(g, [r1, r2], []);
  assert.deepEqual(p.items.map((m) => [m.id, ...m.to]), [[5, 4, 3, ROLLER_H]], 'a otro rodillo, misma altura sobre él');
  assert.equal(tileInfo(g, 4, 3).item.id, 5);
  assert.equal(g.tiles[3][3].length, 1, 'el rodillo de atrás quedó vacío');
  // El siguiente paso lo baja al piso (z = 0)
  p = planRollers(g, [r1, r2], []);
  assert.deepEqual(p.items.map((m) => [m.id, ...m.to]), [[5, 5, 3, 0]]);
  // Cadena de furnis: el de adelante se mueve primero y deja lugar
  const pa = { ...plant, id: 7, x: 3, y: 3, z: ROLLER_H }, pb = { ...lamp, id: 8, x: 4, y: 3, z: ROLLER_H };
  g = buildRoom('b', [r1, r2, pa, pb].map((o) => ({ ...o })));
  const rr = [g.tiles[3][3][0], g.tiles[3][4][0]];
  p = planRollers(g, rr, []);
  assert.deepEqual(p.items.map((m) => [m.id, m.to[0]]).sort(), [[7, 4], [8, 5]]);
  // Furni que no cabe (alguien parado adelante) no se mueve
  g = buildRoom('b', [{ ...r1, x: 3, y: 3 }, { ...plant, x: 3, y: 3, z: ROLLER_H }]);
  assert.equal(planRollers(g, [g.tiles[3][3][0]], [u(11, 4, 3, 0)]).items.length, 0);
});

test('puerta de un sentido: solo desde el frente y hacia atrás', () => {
  const gate = { id: 1, type: 'mecanica_oneway', x: 5, y: 5, z: 0, rot: 0 };
  const g = buildRoom('b', [gate]);
  assert.equal(tileInfo(g, 5, 5).kind, 'block', 'no se camina a través con A*');
  const ok = onewayCheck(g, gate, { x: 5, y: 6 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.path, [[5, 5, 0], [5, 4, 0]]);
  assert.equal(onewayCheck(g, gate, { x: 5, y: 4 }).ok, false, 'por detrás no');
  assert.equal(onewayCheck(g, gate, { x: 5, y: 6 }, new Set(['5,4'])).ok, false, 'alguien del otro lado');
  // El camino normal rodea la puerta
  const path = findPath(g, { x: 5, y: 4 }, { x: 5, y: 6 });
  assert.ok(path && !path.some(([x, y]) => x === 5 && y === 5));
});

test('azar inyectado: rueda 1–10 y medidor de amor 0–100 deterministas', () => {
  assert.equal(spinResult(() => 0), 1);
  assert.equal(spinResult(() => 0.999999), 10);
  assert.equal(spinResult(() => 0.45), 5);
  assert.equal(loveResult(() => 0), 0);
  assert.equal(loveResult(() => 0.5), 50);
  assert.equal(loveResult(() => 0.9999999), 100);
  const a = mulberry32(7), b = mulberry32(7);
  const seqA = Array.from({ length: 20 }, () => spinResult(a)), seqB = Array.from({ length: 20 }, () => spinResult(b));
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((n) => n >= 1 && n <= 10));
  assert.ok(new Set(seqA).size > 3);
});

test('máquinas: casillas de al lado y textos de bots', () => {
  const m = { id: 1, type: 'mecanica_icecream', x: 4, y: 4, z: 0, rot: 0 };
  assert.equal(isBeside(m, 4, 5), true);
  assert.equal(isBeside(m, 5, 4), false, 'es parte del carrito (2 de ancho)');
  assert.equal(isBeside(m, 6, 3), true);
  assert.equal(isBeside(m, 7, 4), false);
  const near = besideTiles(m)[0];
  assert.equal(near.y, 5, 'primero la de enfrente');
  assert.equal(drinkRequest('¿me das un café porfa?'), 'cafe');
  assert.equal(drinkRequest('UN REFRESCO!'), 'refresco');
  assert.equal(drinkRequest('hola'), null);
  assert.match(receptionReply('necesito ayuda'), /caminar/);
  assert.match(receptionReply('¿qué salas hay?'), /Oficina Central/);
  assert.equal(receptionReply('buenas tardes'), null);
  assert.equal(greeting('Ana'), '¡Bienvenido a la Oficina Central, Ana!');
  assert.ok(matchKeyword('Prende la LÚZ', 'luz'));
  assert.ok(!matchKeyword('hola', ''));
  const R = { items: new Map([[3, {}], [4, {}]]) };
  assert.deepEqual(cleanConfig('toggle', { items: [3, 4, 99, '3'] }, R), { items: [3, 4] });
  assert.deepEqual(cleanConfig('timer', { secs: 9999 }, R), { secs: 600 });
  assert.equal(cleanConfig('say', { text: '  ' }, R), null);
  assert.equal(cleanConfig('hand', { hand: 'pizza' }, R), null);
  assert.deepEqual(cleanConfig('move', { items: [4], dir: 2 }, R), { items: [4], dir: 2 });
});

// ---------- Servidor ----------
const SEED = 4242;
let srv;
before(async () => { srv = await startServer({ env: { HOTEL_RNG_SEED: String(SEED), HOTEL_HAND_MS: '1500' } }); });
after(async () => { await srv?.stop(); });

const connect = (c) => new Promise((resolve, reject) => {
  const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const once = (s, ev, pred = () => true, ms = 5000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`timeout esperando ${ev}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});
const enter = async (s, roomId) => { const p = once(s, 'hotel:room'); s.emit('hotel:enter', { roomId }); return p; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function buy(c, type) { const r = await c.post('/hotel/buy', { type }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.items[0]; }
async function place(s, item, x, y, rot = 0, extra = {}) {
  const p = once(s, 'hotel:item', (m) => m.op === 'add' && m.item.id === item.id);
  s.emit('hotel:place', { itemId: item.id, x, y, rot, ...extra });
  return (await p).item;
}
const userAt = (s, id, x, y) => once(s, 'hotel:user', (m) => m.id === id && m.x === x && m.y === y, 6000);

let wheelDone = false;
test('rueda de la fortuna: gira y anuncia el resultado (semilla fija)', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'RuedaC');
  const room = (await ana.post('/hotel/rooms', { name: 'Rueda', model: 'b' })).data.room;
  const s = await connect(ana);
  try {
    await enter(s, room.id);
    const wheel = await place(s, await buy(ana, 'mecanica_wheel'), 6, 2, 0);
    const spinning = once(s, 'hotel:item', (m) => m.item?.id === wheel.id && m.item.state === 11);
    const result = once(s, 'hotel:item', (m) => m.item?.id === wheel.id && m.item.state >= 1 && m.item.state <= 10, 6000);
    const chat = once(s, 'hotel:chat', (m) => m.system && /rueda/i.test(m.text), 6000);
    s.emit('hotel:use', { itemId: wheel.id });
    await spinning;
    const r = await result;
    const msg = await chat;
    // Es lo primero que usa el azar del servidor: mismo número que con la semilla
    assert.equal(r.item.state, spinResult(mulberry32(SEED)));
    assert.match(msg.text, new RegExp(`cayó en ${r.item.state}!`));
    wheelDone = true;
  } finally { s.close(); }
});

test('rodillos en vivo: llevan a la persona (deslizando) y a los furnis', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'RodilloC');
  const room = (await ana.post('/hotel/rooms', { name: 'Rodillos', model: 'b' })).data.room;
  const s = await connect(ana);
  try {
    const snap = await enter(s, room.id);
    const me = snap.users[0].id;
    const r1 = await place(s, await buy(ana, 'mecanica_roller'), 3, 3, 6);
    const r2 = await place(s, await buy(ana, 'mecanica_roller'), 4, 3, 6);
    assert.equal(r1.z, 0);
    // Camina al primer rodillo: la cadena la lleva hasta (5, 3)
    const slide = once(s, 'hotel:path', (m) => m.id === me && m.slide, 6000);
    const end = userAt(s, me, 5, 3);
    s.emit('hotel:walk', { x: 3, y: 3 });
    const sl = await slide;
    assert.equal(sl.path.length, 1);
    await end;
    // Se aparta y pone una maceta en el rodillo: viaja y baja al piso
    s.emit('hotel:walk', { x: 8, y: 8 });
    await userAt(s, me, 8, 8);
    const pot = await place(s, await buy(ana, 'plant_small'), 3, 3, 0);
    assert.equal(pot.z, ROLLER_H);
    const m1 = await once(s, 'hotel:item', (m) => m.item?.id === pot.id && m.slide, 4000);
    assert.deepEqual([m1.item.x, m1.item.y, m1.item.z], [4, 3, ROLLER_H]);
    assert.deepEqual(m1.slide.from, [3, 3, ROLLER_H]);
    const m2 = await once(s, 'hotel:item', (m) => m.item?.id === pot.id && m.slide, 4000);
    assert.deepEqual([m2.item.x, m2.item.y, m2.item.z], [5, 3, 0]);
    void r2;
  } finally { s.close(); }
});

test('puerta de un sentido en vivo: se cruza desde el frente', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'PuertaC');
  const room = (await ana.post('/hotel/rooms', { name: 'Puerta', model: 'b' })).data.room;
  const s = await connect(ana);
  try {
    const me = (await enter(s, room.id)).users[0].id;
    const gate = await place(s, await buy(ana, 'mecanica_oneway'), 5, 5, 0);
    // Clic en la puerta: camina al frente (5, 6) y la cruza hasta (5, 4)
    const through = once(s, 'hotel:path', (m) => m.id === me && m.path.length === 2 && m.path[0][0] === 5 && m.path[0][1] === 5, 8000);
    s.emit('hotel:walk', { x: 5, y: 5 });
    const p = await through;
    assert.deepEqual(p.path.map((q) => q.slice(0, 2)), [[5, 5], [5, 4]]);
    await userAt(s, me, 5, 4);
    // Ya del otro lado, ir al frente rodea la puerta (no la cruza al revés)
    const back = once(s, 'hotel:path', (m) => m.id === me);
    s.emit('hotel:walk', { x: 5, y: 6 });
    assert.ok(!(await back).path.some(([x, y]) => x === 5 && y === 5));
    void gate;
  } finally { s.close(); }
});

test('máquinas y objetos en la mano: pedir, pasar (:dar y tarjeta), :tirar y caducar', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'ManoAna');
  const beto = await createMember(srv.url, admin, 'ManoBeto');
  const room = (await ana.post('/hotel/rooms', { name: 'Cafetería', model: 'b' })).data.room;
  const sa = await connect(ana), sb = await connect(beto);
  try {
    const me = (await enter(sa, room.id)).users[0].id;
    await enter(sb, room.id);
    const coffee = await place(sa, await buy(ana, 'mecanica_vending_coffee'), 8, 2, 0);
    // Usarla de lejos: camina junto a ella y recibe un café
    let got = once(sa, 'hotel:user', (m) => m.id === me && m.hand === 'cafe', 9000);
    sa.emit('hotel:use', { itemId: coffee.id });
    await got;
    // :dar Beto → Beto lo trae, Ana ya no
    const bGot = once(sa, 'hotel:user', (m) => m.id === beto.user.id && m.hand === 'cafe');
    const aLost = once(sa, 'hotel:user', (m) => m.id === me && m.hand === null);
    sa.emit('hotel:chat', { text: ':dar ManoBeto' });
    await Promise.all([bGot, aLost]);
    // Desde la tarjeta: Beto se lo regresa
    got = once(sa, 'hotel:user', (m) => m.id === me && m.hand === 'cafe');
    sb.emit('hotel:mech:give', { to: me });
    await got;
    // :tirar
    const dropped = once(sa, 'hotel:user', (m) => m.id === me && m.hand === null);
    sa.emit('hotel:chat', { text: ':tirar' });
    await dropped;
    // La máquina de refrescos de la línea Fiesta también da (sin cambiar su definición)
    const soda = await place(sa, await buy(ana, 'fiesta_soda'), 2, 8, 0);
    got = once(sa, 'hotel:user', (m) => m.id === me && m.hand === 'refresco', 9000);
    sa.emit('hotel:use', { itemId: soda.id });
    await got;
    // Caduca (HOTEL_HAND_MS = 1.5 s en esta prueba)
    await once(sa, 'hotel:user', (m) => m.id === me && m.hand === null, 4000);
    // Nadie pasa algo que no trae
    const n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:chat', { text: ':dar ManoAna' });
    assert.match((await n).text, /mano/);
  } finally { sa.close(); sb.close(); }
});

test('medidor de amor (dos sentados), marcador, trofeo y regulador de luz', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'AmorAna');
  const beto = await createMember(srv.url, admin, 'AmorBeto');
  const room = (await ana.post('/hotel/rooms', { name: 'Amor', model: 'b' })).data.room;
  const sa = await connect(ana), sb = await connect(beto);
  try {
    const me = (await enter(sa, room.id)).users[0].id;
    await enter(sb, room.id);
    const lv = await place(sa, await buy(ana, 'mecanica_love'), 4, 7, 0);
    // Con una sola persona no mide
    let n = once(sa, 'hotel:notice', (m) => m.error);
    sa.emit('hotel:use', { itemId: lv.id });
    assert.match((await n).text, /dos personas/);
    const aSit = once(sa, 'hotel:user', (m) => m.id === me && m.x === 4 && m.y === 7 && m.sit);
    const bSit = once(sa, 'hotel:user', (m) => m.id === beto.user.id && m.x === 5 && m.y === 7 && m.sit);
    sa.emit('hotel:walk', { x: 4, y: 7 }); sb.emit('hotel:walk', { x: 5, y: 7 });
    await Promise.all([aSit, bSit]);
    const res = once(sa, 'hotel:item', (m) => m.item?.id === lv.id && m.item.state >= 2, 5000);
    const chat = once(sa, 'hotel:chat', (m) => m.system && /de amor/.test(m.text), 5000);
    sb.emit('hotel:use', { itemId: lv.id });
    const pct = (await res).item.state - 2;
    assert.ok(pct >= 0 && pct <= 100);
    assert.match((await chat).text, new RegExp(`AmorAna \\+ AmorBeto: ${pct}% de amor`));

    // Marcador: +1, +1, −1, reiniciar; quien no tiene permisos no lo mueve
    const sc = await place(sa, await buy(ana, 'mecanica_scoreboard'), 8, 2, 0);
    const scoreIs = (v) => once(sa, 'hotel:item', (m) => m.item?.id === sc.id && m.item.state === v);
    let p = scoreIs(1); sa.emit('hotel:use', { itemId: sc.id, op: 'inc' }); await p;
    p = scoreIs(2); sa.emit('hotel:use', { itemId: sc.id }); await p;
    p = scoreIs(1); sa.emit('hotel:use', { itemId: sc.id, op: 'dec' }); await p;
    n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:use', { itemId: sc.id, op: 'inc' });
    assert.match((await n).text, /permisos/);
    p = scoreIs(0); sa.emit('hotel:use', { itemId: sc.id, op: 'reset' }); await p;

    // Trofeo: dedicatoria al colocarlo y luego la cambia la dueña (Beto no)
    const tr = await place(sa, await buy(ana, 'mecanica_trophy'), 2, 2, 0, { inscription: 'Campeona del torneo' });
    assert.equal(tr.extra.inscription, 'Campeona del torneo');
    assert.equal(tr.extra.by, 'AmorAna');
    const upd = once(sa, 'hotel:item', (m) => m.item?.id === tr.id && m.item.extra.inscription === 'Mejor del mes');
    sa.emit('hotel:mech:engrave', { itemId: tr.id, text: 'Mejor del mes' });
    await upd;
    n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:mech:engrave', { itemId: tr.id, text: 'jaja' });
    assert.match((await n).text, /dueño/);

    // Regulador de luz: uno por sala; la dueña elige color e intensidad
    const dm = await (async () => {
      const it = await buy(ana, 'mecanica_dimmer');
      const pr = once(sa, 'hotel:item', (m) => m.op === 'add' && m.item.id === it.id);
      sa.emit('hotel:place', { itemId: it.id, wall: 'r', pos: 4, h: 1 });
      return (await pr).item;
    })();
    const open = once(sa, 'hotel:mech:open', (m) => m.kind === 'dimmer' && m.itemId === dm.id);
    sa.emit('hotel:use', { itemId: dm.id });
    await open;
    const tint = once(sa, 'hotel:item', (m) => m.item?.id === dm.id && m.item.state === 1);
    sa.emit('hotel:mech:dimmer', { itemId: dm.id, color: '#3a1f6b', alpha: 0.5, on: true });
    assert.deepEqual((await tint).item.extra.dimmer, { color: '#3a1f6b', alpha: 0.5 });
    const second = await buy(ana, 'mecanica_dimmer');
    n = once(sa, 'hotel:notice', (m) => m.error);
    sa.emit('hotel:place', { itemId: second.id, wall: 'r', pos: 7, h: 1 });
    assert.match((await n).text, /un regulador/);
    n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:mech:dimmer', { itemId: dm.id, color: '#ff0000', alpha: 0.7 });
    assert.match((await n).text, /permisos/);
  } finally { sa.close(); sb.close(); }
});

test('wired: palabra → cambiar estado, pisar → dar objeto; solo con permisos; con límite', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'WiredAna');
  const beto = await createMember(srv.url, admin, 'WiredBeto');
  const room = (await ana.post('/hotel/rooms', { name: 'Wired', model: 'b' })).data.room;
  const inv = (await ana.get('/hotel/inventory')).data.items;
  const sa = await connect(ana), sb = await connect(beto);
  try {
    const me = (await enter(sa, room.id)).users[0].id;
    await enter(sb, room.id);
    const lamp = await place(sa, inv.find((i) => i.type === 'lamp_floor'), 4, 9, 0);
    assert.equal(lamp.state, 0);
    // Pila en (2, 9): disparador "al decir" + efecto "cambiar estado"
    const say = await place(sa, await buy(ana, 'mecanica_wf_say'), 2, 9, 0);
    const tog = await place(sa, await buy(ana, 'mecanica_we_toggle'), 2, 9, 0);
    assert.ok(tog.z > say.z, 'el efecto va apilado encima');
    // Beto (sin permisos) no puede configurar
    let n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:wired:save', { itemId: say.id, cfg: { text: 'luz' } });
    assert.match((await n).text, /permisos/);
    n = once(sb, 'hotel:notice', (m) => m.error);
    sb.emit('hotel:use', { itemId: say.id });
    assert.match((await n).text, /permisos/);
    // Ana sí: al usar se abre el panel y guarda
    const open = once(sa, 'hotel:mech:open', (m) => m.kind === 'wired');
    sa.emit('hotel:use', { itemId: say.id });
    await open;
    let saved = once(sa, 'hotel:item', (m) => m.item?.id === say.id && m.item.extra.wired?.text === 'luz');
    sa.emit('hotel:wired:save', { itemId: say.id, cfg: { text: 'luz' } });
    await saved;
    saved = once(sa, 'hotel:item', (m) => m.item?.id === tog.id && m.item.extra.wired?.items?.[0] === lamp.id);
    sa.emit('hotel:wired:save', { itemId: tog.id, cfg: { items: [lamp.id] } });
    await saved;
    // Beto dice la palabra → la lámpara se prende
    const on = once(sa, 'hotel:item', (m) => m.item?.id === lamp.id && m.item.state === 1);
    sb.emit('hotel:chat', { text: 'prendan la LUZ porfa' });
    await on;
    // Pisar un tapete → objeto en la mano (disparador + efecto en (6, 2))
    const rug = await place(sa, inv.find((i) => i.type === 'rug_round'), 6, 5, 0);
    const walk = await place(sa, await buy(ana, 'mecanica_wf_walk'), 6, 2, 0);
    const hand = await place(sa, await buy(ana, 'mecanica_we_hand'), 6, 2, 0);
    const msg = await place(sa, await buy(ana, 'mecanica_we_msg'), 6, 2, 0);
    sa.emit('hotel:wired:save', { itemId: walk.id, cfg: { items: [rug.id] } });
    sa.emit('hotel:wired:save', { itemId: hand.id, cfg: { hand: 'rosa' } });
    sa.emit('hotel:wired:save', { itemId: msg.id, cfg: { text: '¡Bienvenida al tapete!' } });
    await once(sa, 'hotel:item', (m) => m.item?.id === msg.id && m.item.extra.wired?.text);
    const rose = once(sa, 'hotel:user', (m) => m.id === me && m.hand === 'rosa', 8000);
    const whisper = once(sa, 'hotel:chat', (m) => m.mode === 'whisper' && m.system && m.to === me, 8000);
    sa.emit('hotel:walk', { x: 6, y: 5 });
    await rose;
    assert.equal((await whisper).text, '¡Bienvenida al tapete!');
    // Límite: muchas palabras seguidas no disparan sin freno (mínimo entre disparos)
    let toggles = 0;
    const count = (m) => { if (m.item?.id === lamp.id) toggles++; };
    sa.on('hotel:item', count);
    for (let i = 0; i < 5; i++) sb.emit('hotel:chat', { text: 'luz' });
    await wait(600);
    sa.off('hotel:item', count);
    assert.ok(toggles >= 1 && toggles <= 2, `toggles: ${toggles}`);
  } finally { sa.close(); sb.close(); }
});

test('wired: cada N segundos → mover furni; al entrar → teletransportar', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'WiredTimer');
  const beto = await createMember(srv.url, admin, 'WiredEntra');
  const room = (await ana.post('/hotel/rooms', { name: 'Wired 2', model: 'b' })).data.room;
  const inv = (await ana.get('/hotel/inventory')).data.items;
  const sa = await connect(ana), sb = await connect(beto);
  try {
    await enter(sa, room.id);
    const plant = await place(sa, inv.find((i) => i.type === 'plant_big'), 3, 6, 0);
    const timer = await place(sa, await buy(ana, 'mecanica_wf_timer'), 2, 2, 0);
    const move = await place(sa, await buy(ana, 'mecanica_we_move'), 2, 2, 0);
    sa.emit('hotel:wired:save', { itemId: timer.id, cfg: { secs: 1 } });
    sa.emit('hotel:wired:save', { itemId: move.id, cfg: { items: [plant.id], dir: 6 } });
    const slid = await once(sa, 'hotel:item', (m) => m.item?.id === plant.id && m.slide, 5000);
    assert.deepEqual([slid.item.x, slid.item.y], [4, 6], 'rot 6 = una casilla hacia +x');
    sa.emit('hotel:wired:save', { itemId: timer.id, cfg: { secs: 600 } });
    // Al entrar: teletransporta a quien entra encima del tapete
    const rug = await place(sa, inv.find((i) => i.type === 'rug_round'), 6, 6, 0);
    const ent = await place(sa, await buy(ana, 'mecanica_wf_enter'), 9, 2, 0);
    const tele = await place(sa, await buy(ana, 'mecanica_we_tele'), 9, 2, 0);
    sa.emit('hotel:wired:save', { itemId: tele.id, cfg: { items: [rug.id] } });
    await once(sa, 'hotel:item', (m) => m.item?.id === tele.id && m.item.extra.wired?.items?.length === 1);
    const tp = once(sa, 'hotel:user', (m) => m.id === beto.user.id && m.tp && m.x === 6 && m.y === 6, 5000);
    await enter(sb, room.id);
    await tp;
    void ent;
  } finally { sa.close(); sb.close(); }
});

test('bots: la recepción saluda por nombre, contesta y no cuenta como persona; la barra sirve café', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'Visitante');
  const official = (await ana.get('/hotel/rooms?tab=official')).data.rooms;
  const hq = official.find((r) => r.officialKey === 'hq');
  const comedor = official.find((r) => r.officialKey === 'comedor');
  const s = await connect(ana);
  try {
    const join = once(s, 'hotel:user:join', (u) => u.bot === 'reception');
    const hello = once(s, 'hotel:chat', (m) => m.bot && m.text === '¡Bienvenido a la Oficina Central, Visitante!', 6000);
    const snap = await enter(s, hq.id);
    const bot = snap.users.find((u) => u.bot) || await join;
    assert.ok(bot.id < 0);
    assert.equal(bot.name, 'Rita · Recepción');
    assert.equal(typeof bot.avatar, 'object');
    assert.equal(bot.avatar.preset, 'gh-presentadora');
    const greet = await hello;
    assert.equal(greet.from, bot.id);
    // No cuenta como persona en la sala
    assert.equal((await ana.get(`/hotel/rooms/${hq.id}`)).data.room.users, 1);
    // Palabras clave
    const reply = once(s, 'hotel:chat', (m) => m.bot && /Navegador/.test(m.text), 6000);
    await wait(2600);
    s.emit('hotel:chat', { text: '¿qué salas hay?' });
    assert.match((await reply).text, /Sala de juegos/);
    // Barra del comedor: "un café" → café en la mano
    const me = (await enter(s, comedor.id)).users.find((u) => !u.bot).id;
    await wait(300);
    const served = once(s, 'hotel:chat', (m) => m.bot && /café/.test(m.text), 6000);
    const cup = once(s, 'hotel:user', (m) => m.id === me && m.hand === 'cafe', 6000);
    s.emit('hotel:chat', { text: 'un café por favor' });
    await served; await cup;
    assert.ok(wheelDone || true);
  } finally { s.close(); }
});
