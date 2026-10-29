// Hotel: caminar casilla por casilla (tiempo por paso, posición en el instante t, cambio de rumbo a
// media caminata, quien llega tarde ve el mismo paso), acostarse en la almohada, alturas de los furnis
// contra su dibujo (nada flota) y el personaje isométrico.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { STEP_MS, walkAt, walkEnd, rerouteFrom, dir8, dirToward, toDir8, ROT_DIR8 } from '../shared/hotelWalk.js';
import { buildRoom, findPath } from '../shared/hotelRoom.js';
import { layHeadTile, bedHeadTile } from '../shared/hotelSeat.js';
import { HOTEL_FURNI, FURNI_BY_ID } from '../shared/hotelCatalog.js';
import { auditFurni } from '../server/cli/hotel-art-audit.js';
import { renderAvatarPixels } from '../client/src/hotel/avatarIso.js';
import { PRESETS } from '../shared/sprite.js';

// ---------- Lógica pura ----------
test('walkAt: medio segundo por casilla (también en diagonal), deslizándose en línea recta', () => {
  assert.equal(STEP_MS, 500);
  const w = { from: [1, 1, 0], path: [[2, 1, 0], [3, 2, 0], [3, 3, 1]], t0: 1000 };
  let p = walkAt(w, 1000);
  assert.deepEqual([p.x, p.y, p.z, p.i, p.done], [1, 1, 0, 0, false]);
  assert.equal(p.dir, 2, 'ya mira hacia la siguiente casilla (+x)');
  p = walkAt(w, 1250);
  assert.deepEqual([p.x, p.y, p.k], [1.5, 1, 0.5]);
  // El paso diagonal dura lo mismo
  p = walkAt(w, 1500 + 250);
  assert.deepEqual([p.x, p.y, p.i, p.dir], [2.5, 1.5, 1, 3]);
  // Subir un escalón: la altura se interpola dentro del paso
  p = walkAt(w, 2000 + 250);
  assert.deepEqual([p.x, p.y, p.z, p.dir], [3, 2.5, 0.5, 4]);
  // Al llegar queda justo en el centro de la última casilla
  p = walkAt(w, 2600);
  assert.deepEqual([p.x, p.y, p.z, p.done], [3, 3, 1, true]);
  assert.equal(walkEnd(w), 2500);
  // Pasos dados (para el ciclo de piernas: 4 cuadros cada 2 pasos)
  assert.equal(walkAt({ ...w, n0: 3 }, 1250).steps, 3.5);
});

test('rerouteFrom: termina el paso en curso y conserva el ritmo', () => {
  const w = { from: [0, 5, 0], path: [[1, 5, 0], [2, 5, 0], [3, 5, 0], [4, 5, 0]], t0: 0, n0: 0 };
  const r = rerouteFrom(w, 1300); // a media del 3er paso (2,5)→(3,5)
  assert.deepEqual(r, { from: [2, 5, 0], next: [3, 5, 0], t0: 1000, n0: 2 });
  // Sin cortes: la posición justo antes y después de cambiar de rumbo es la misma
  const nw = { from: r.from, path: [r.next, [3, 6, 0]], t0: r.t0, n0: r.n0 };
  const a = walkAt(w, 1300), b = walkAt(nw, 1300);
  assert.deepEqual([a.x, a.y, a.steps], [b.x, b.y, b.steps]);
  assert.equal(rerouteFrom(w, 99999), null, 'ya llegó');
});

test('direcciones: 8, con diagonales; rotación de furni y nombres viejos', () => {
  assert.deepEqual([dir8(0, -1), dir8(1, -1), dir8(1, 0), dir8(1, 1), dir8(0, 1), dir8(-1, 1), dir8(-1, 0), dir8(-1, -1)], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(dir8(0, 0), null);
  assert.equal(dirToward(0, 0, 5, 1), 2);
  assert.equal(dirToward(0, 0, -3, -3), 7);
  assert.deepEqual(ROT_DIR8, { 0: 4, 2: 6, 4: 0, 6: 2 });
  assert.equal(toDir8('left'), 6);
  assert.equal(toDir8(9), 1);
});

test('cama: se acuesta en la casilla de la almohada', () => {
  const bed = { id: 1, type: 'bed_double', x: 3, y: 3, z: 0, rot: 0 };
  const r = buildRoom('b', [bed]);
  assert.deepEqual(bedHeadTile(bed, 4, 4), { x: 4, y: 3 });
  assert.deepEqual(layHeadTile(r, { x: 4, y: 4 }), { x: 4, y: 3 });
  assert.equal(layHeadTile(r, { x: 4, y: 3 }), null, 'ya es la almohada');
  assert.equal(layHeadTile(r, { x: 4, y: 4 }, new Set(['4,3'])), null, 'almohada ocupada: se queda donde llegó');
  const b6 = { id: 2, type: 'bed_single', x: 6, y: 6, z: 0, rot: 6 }; // mira a +x: la cabecera en x = 6
  assert.deepEqual(bedHeadTile(b6, 7, 6), { x: 6, y: 6 });
  const b2 = { id: 3, type: 'bed_single', x: 6, y: 6, z: 0, rot: 2 }; // mira a −x: la cabecera en x = 7
  assert.deepEqual(bedHeadTile(b2, 6, 6), { x: 7, y: 6 });
});

test('catálogo: la altura de cada furni coincide con su dibujo (nada flota ni se hunde)', () => {
  const bad = [];
  for (const def of HOTEL_FURNI.filter((d) => d.kind === 'floor')) {
    const { issues } = auditFurni(def);
    if (issues.length) bad.push(`${def.id}: ${issues.join(' · ')}`);
    if (def.sit != null) assert.ok(def.sit > 0 && def.sit <= def.h + 0.01, `${def.id}: sit dentro de la altura`);
  }
  assert.deepEqual(bad, []);
  // Las sillas y camas que más se usan
  for (const id of ['chair_basic', 'sofa_2', 'throne', 'bano_toilet', 'zen_zabuton', 'retro70_egg', 'stool_bar', 'bed_single', 'zen_futon']) assert.ok(FURNI_BY_ID[id], id);
});

test('personaje isométrico: 8 direcciones y todas las posturas, con los pies en el ancla', () => {
  for (const av of [PRESETS[0], PRESETS.find((p) => p.hat === 'cowboy'), PRESETS.find((p) => p.hairStyle === 'long'), {}]) {
    for (let dir = 0; dir < 8; dir++) {
      const r = renderAvatarPixels(av, { dir, pose: 'stand' });
      assert.ok(r.w > 20 && r.w < 90 && r.h > 60 && r.h < 110, `tamaño ${r.w}×${r.h}`);
      // La fila más baja con píxeles queda pegada a los pies: el pie de enfrente baja hasta ~2 px en pantalla
      // (está más cerca) y el contorno suma 1. Nunca arriba del ancla (flotando) ni muy abajo (hundido).
      let low = -1;
      for (let j = r.h - 1; j >= 0 && low < 0; j--) for (let i = 0; i < r.w; i++) if (r.data[(j * r.w + i) * 4 + 3]) { low = j; break; }
      assert.ok(low - r.ay >= 0 && low - r.ay <= 4, `dir ${dir}: pies en ${low} vs ancla ${r.ay}`);
      assert.ok(r.top > 60 && r.top < 95, `coronilla a ${r.top}px`);
    }
    for (const pose of ['walk', 'sit', 'lay', 'wave', 'dance']) for (let frame = 0; frame < 4; frame++) {
      const r = renderAvatarPixels(av, { dir: frame * 2 + 1, pose, frame, seatH: 0.5 });
      let n = 0;
      for (let k = 3; k < r.data.length; k += 4) if (r.data[k]) n++;
      assert.ok(n > 400, `${pose} ${frame}: ${n} píxeles`);
    }
  }
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
const once = (s, ev, pred = () => true, ms = 6000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`timeout esperando ${ev}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});
const enter = async (s, roomId) => { const p = once(s, 'hotel:room'); s.emit('hotel:enter', { roomId }); return p; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('servidor: pasos de 0.5 s, cambio de rumbo a media caminata y quien llega tarde ve el mismo paso', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'CaminaH');
  const beto = await createMember(srv.url, admin, 'MiraH');
  const room = (await ana.post('/hotel/rooms', { name: 'Pasillo', model: 'b' })).data.room;
  const sa = await connect(ana), sb = await connect(beto);
  try {
    const snap = await enter(sa, room.id);
    const me = snap.users.find((u) => u.id === ana.user.id);
    assert.deepEqual([me.x, me.y], [0, 5], 'entra en la puerta');
    assert.equal(me.dir, 2, 'mirando hacia la sala');
    // Camina en línea recta 5 casillas
    const p1 = once(sa, 'hotel:path');
    sa.emit('hotel:walk', { x: 5, y: 5 });
    const m1 = await p1;
    assert.equal(m1.path.length, 5);
    assert.ok(Math.abs(m1.now - m1.t0) < 50 && m1.n0 === 0);
    assert.deepEqual(m1.from, [0, 5, 0]);
    // A media del 3er paso entra alguien más: lo ve saliendo de (2,5) hacia (3,5) con el mismo t0 del paso
    await sleep(1250);
    const snapB = await enter(sb, room.id);
    const u = snapB.users.find((x) => x.id === ana.user.id);
    assert.ok(u.path, 'va caminando');
    assert.deepEqual([u.x, u.y], [2, 5]);
    assert.deepEqual(u.path[0].slice(0, 2), [3, 5]);
    assert.equal(u.t0, m1.t0 + 2 * STEP_MS);
    assert.equal(u.n0, 2);
    const pb = walkAt({ from: u.from, path: u.path, t0: u.t0, n0: u.n0 }, u.now);
    const pa = walkAt({ from: m1.from, path: m1.path, t0: m1.t0 }, u.now);
    assert.ok(Math.abs(pa.x - pb.x) < 1e-9 && pa.y === pb.y, 'misma posición para los dos');
    // Cambio de rumbo a media caminata: termina el paso en curso y sigue desde ahí, sin perder el ritmo
    const p2 = once(sa, 'hotel:path');
    sa.emit('hotel:walk', { x: 3, y: 8 });
    const m2 = await p2;
    const cur = walkAt({ from: m1.from, path: m1.path, t0: m1.t0 }, m2.now);
    assert.deepEqual(m2.from.slice(0, 2), cur.from.slice(0, 2), 'sale de la casilla del paso en curso');
    assert.deepEqual(m2.path[0].slice(0, 2), cur.to.slice(0, 2), 'termina el paso hacia donde ya iba');
    assert.equal(m2.t0, m1.t0 + cur.i * STEP_MS, 'el paso conserva su tiempo');
    assert.equal(m2.n0, cur.i);
    assert.deepEqual(m2.path[m2.path.length - 1].slice(0, 2), [3, 8]);
    // Llega justo cuando se acaban los pasos y queda mirando en la dirección del último paso
    const end = walkEnd({ path: m2.path, t0: m2.t0 });
    const arrived = await once(sb, 'hotel:user', (x) => x.id === ana.user.id, 6000);
    assert.ok(Date.now() >= end - 30, 'no llega antes de tiempo');
    assert.deepEqual([arrived.x, arrived.y], [3, 8]);
    assert.equal(arrived.dir, walkAt({ from: m2.from, path: m2.path, t0: m2.t0 }, Infinity).dir);
    // Saludar: lo ven todos y se quita solo
    const waved = once(sb, 'hotel:user', (x) => x.id === ana.user.id && x.act === 'wave');
    sa.emit('hotel:act', { act: 'wave' });
    await waved;
    await once(sb, 'hotel:user', (x) => x.id === ana.user.id && !x.act, 4000);
  } finally { sa.close(); sb.close(); }
});

test('servidor: a la cama se llega a la almohada y ahí se acuesta', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'DuermeH');
  const room = (await ana.post('/hotel/rooms', { name: 'Recámara', model: 'b' })).data.room;
  const bed = (await ana.post('/hotel/buy', { type: 'bed_single' })).data.items[0];
  const sa = await connect(ana);
  try {
    await enter(sa, room.id);
    const placed = once(sa, 'hotel:item', (m) => m.item?.id === bed.id);
    sa.emit('hotel:place', { itemId: bed.id, x: 4, y: 4, rot: 0 });
    await placed;
    const p = once(sa, 'hotel:path');
    sa.emit('hotel:walk', { x: 4, y: 5 }); // el pie de la cama
    const m = await p;
    assert.deepEqual(m.path[m.path.length - 1].slice(0, 2), [4, 4]);
    const lay = await once(sa, 'hotel:user', (u) => u.id === ana.user.id && u.lay, 8000);
    assert.equal(lay.dir, 4);
    assert.equal(lay.z, FURNI_BY_ID.bed_single.h);
  } finally { sa.close(); }
});
