// Hotel como el clásico: voltear sin caminar, cabeza aparte, no atravesar a nadie, quedarse al lado
// de una casilla ocupada, acciones para todos (bailes 1–4, beso, reír, saltar…) y voz en la sala.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { clickIntent, lookDirs, headWithin, planWalk, STEP_MS } from '../shared/hotelWalk.js';
import { buildRoom } from '../shared/hotelRoom.js';
import { actPose, ACT_LIST } from '../client/src/hotel/actions.js';
import { renderAvatarPixels } from '../client/src/hotel/avatarIso.js';

// ---------- Lógica pura ----------
test('clic: casilla vecina = voltear sin caminar (2.º clic da el paso); la tuya = mirar; lejos o caminando = caminar', () => {
  const me = { x: 3, y: 3, dir: 2, moving: false };
  assert.deepEqual(clickIntent(me, { x: 3, y: 4 }), { face: 4 });
  assert.deepEqual(clickIntent({ ...me, dir: 4 }, { x: 3, y: 4 }), { walk: true }, 'ya la mira: da el paso');
  assert.deepEqual(clickIntent(me, { x: 2, y: 2 }), { face: 7 });
  assert.deepEqual(clickIntent(me, { x: 3, y: 3 }), { look: true });
  assert.deepEqual(clickIntent(me, { x: 6, y: 3 }), { walk: true });
  assert.deepEqual(clickIntent({ ...me, moving: true }, { x: 3, y: 4 }), { walk: true }, 'caminando: cambia de rumbo');
  assert.deepEqual(clickIntent({ ...me, sit: { z: 0.7 } }, { x: 3, y: 4 }), { walk: true }, 'sentado: se levanta y va');
});

test('voltear: de pie gira todo; en silla solo la cabeza ±1; en el piso solo rectas; acostado nada', () => {
  assert.deepEqual(lookDirs({ dir: 2 }, 5), { dir: 5, head: null });
  assert.deepEqual(lookDirs({ dir: 4, sit: { z: 0.7 } }, 2), { dir: 4, head: 3 });
  assert.deepEqual(lookDirs({ dir: 4, sit: { z: 0.7 } }, 0), { dir: 4, head: 3 }, 'de espaldas: hasta donde da el cuello');
  assert.deepEqual(lookDirs({ dir: 4, sit: { z: 0.7 } }, 4), { dir: 4, head: null });
  assert.deepEqual(lookDirs({ dir: 4, sit: { floor: true } }, 3), { dir: 4, head: 3 });
  assert.deepEqual(lookDirs({ dir: 4, sit: { floor: true } }, 6), { dir: 6, head: null });
  assert.equal(lookDirs({ dir: 4, lay: { z: 1 } }, 2), null);
  assert.equal(headWithin(0, 4), 7);
});

test('caminar: no atraviesa a nadie (salvo en la puerta) y si el destino está ocupado se queda al lado', () => {
  const g = buildRoom('b');
  const door = g.door; // (0, 5)
  // Alguien parado en (5,5): se rodea
  const p = planWalk(g, { x: 1, y: 5 }, { x: 9, y: 5 }, { blocked: new Set(['5,5']), door });
  assert.ok(p && !p.near);
  assert.ok(!p.path.some(([x, y]) => x === 5 && y === 5), 'rodea a la persona');
  assert.deepEqual(p.path[p.path.length - 1].slice(0, 2), [9, 5]);
  // Destino ocupado: termina en la casilla vecina libre más cercana
  const q = planWalk(g, { x: 1, y: 5 }, { x: 6, y: 5 }, { blocked: new Set(['6,5']), occupied: new Set(['6,5']), door });
  assert.ok(q.near);
  const [ex, ey] = q.path[q.path.length - 1];
  assert.equal(Math.max(Math.abs(ex - 6), Math.abs(ey - 5)), 1);
  assert.equal(q.path.length, 4, 'la vecina más cercana: (5,5) a 4 pasos');
  // Ya estás al lado: no caminas
  assert.deepEqual(planWalk(g, { x: 5, y: 5 }, { x: 6, y: 5 }, { blocked: new Set(['6,5']), door }), { path: [], near: true });
  // Sin "near" (máquinas, rejas): no hay camino
  assert.equal(planWalk(g, { x: 1, y: 5 }, { x: 6, y: 5 }, { occupied: new Set(['6,5']), door, near: false }), null);
  // En la puerta sí se puede pasar aunque haya alguien
  const r = planWalk(g, { x: 1, y: 5 }, { x: 0, y: 5 }, { blocked: new Set(['0,5']), door });
  assert.deepEqual(r.path.map((s) => s.slice(0, 2)), [[0, 5]]);
});

test('acciones: 4 bailes distintos, beso, reír y saltar en las 8 direcciones', () => {
  assert.deepEqual(ACT_LIST.dances.map((d) => d.n), [1, 2, 3, 4]);
  // Cada baile tiene su propia secuencia de posturas
  const seqs = [1, 2, 3, 4].map((n) => Array.from({ length: 16 }, (_, i) => { const p = actPose('dance', n, i * 130, 3); return `${p.pose}:${p.dir}:${p.dx}:${p.dy}`; }).join('|'));
  assert.equal(new Set(seqs).size, 4);
  // El salto sube y baja
  const hops = Array.from({ length: 10 }, (_, i) => actPose('jump', 0, i * 130, 3).dy);
  assert.ok(Math.min(...hops) <= -8 && hops[0] >= -2);
  const av = { preset: 'nuvora' };
  for (let dir = 0; dir < 8; dir++) {
    for (const [act, n] of [['dance', 1], ['dance', 2], ['dance', 3], ['dance', 4], ['kiss', 0], ['laugh', 0], ['jump', 0], ['wave', 0]]) {
      for (const t of [0, 400, 900]) {
        const r = renderAvatarPixels(av, { dir, pose: act, act, actN: n, actT: t });
        let px = 0;
        for (let k = 3; k < r.data.length; k += 4) if (r.data[k]) px++;
        assert.ok(px > 400, `${act}${n} dir ${dir} t ${t}: ${px} píxeles`);
      }
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
const none = (s, ev, pred = () => true, ms = 500) => new Promise((resolve, reject) => {
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); reject(new Error(`no debía llegar ${ev}`)); } };
  const t = setTimeout(() => { s.off(ev, f); resolve(); }, ms);
  s.on(ev, f);
});
const enter = async (s, roomId) => { const p = once(s, 'hotel:room'); s.emit('hotel:enter', { roomId }); return p; };
const walkTo = async (s, id, x, y) => { const p = once(s, 'hotel:user', (m) => m.id === id && m.x === x && m.y === y, 8000); s.emit('hotel:walk', { x, y }); return p; };

test('servidor: voltear sin caminar, cabeza sentada, rodear y quedarse al lado de quien ocupa la casilla', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'GiraC');
  const beto = await createMember(srv.url, admin, 'EstorbaC');
  const room = (await ana.post('/hotel/rooms', { name: 'Clásica', model: 'b' })).data.room;
  const chair = (await ana.post('/hotel/buy', { type: 'chair_basic' })).data.items[0];
  const sa = await connect(ana), sb = await connect(beto);
  const A = ana.user.id, B = beto.user.id;
  try {
    await enter(sa, room.id);
    await walkTo(sa, A, 2, 5);
    // Voltear hacia una casilla vecina: cambia la dirección y no camina
    const noPath = none(sa, 'hotel:path', (m) => m.id === A, 400);
    const turned = once(sa, 'hotel:user', (m) => m.id === A && m.dir === 4);
    sa.emit('hotel:look', { x: 2, y: 6 });
    const u = await turned;
    assert.deepEqual([u.x, u.y, u.head], [2, 5, null]);
    await noPath;

    // Beto se para en (5,5); Ana pide ir a (5,5): queda al lado, mirándolo
    await enter(sb, room.id);
    await walkTo(sb, B, 5, 5);
    const p = once(sa, 'hotel:path', (m) => m.id === A);
    sa.emit('hotel:walk', { x: 5, y: 5 });
    const m = await p;
    const end = m.path[m.path.length - 1];
    assert.equal(Math.max(Math.abs(end[0] - 5), Math.abs(end[1] - 5)), 1, 'termina en la casilla de al lado');
    assert.ok(!m.path.some(([x, y]) => x === 5 && y === 5));
    const arrived = await once(sa, 'hotel:user', (x) => x.id === A && x.x === end[0] && x.y === end[1], 6000);
    assert.equal(arrived.dir, [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]].findIndex(([a, b]) => a === Math.sign(5 - end[0]) && b === Math.sign(5 - end[1])), 'mira hacia Beto');

    // Al otro lado de Beto: lo rodea, no lo atraviesa
    const p2 = once(sa, 'hotel:path', (x) => x.id === A);
    sa.emit('hotel:walk', { x: 8, y: 5 });
    const m2 = await p2;
    assert.ok(!m2.path.some(([x, y]) => x === 5 && y === 5), 'no pasa por encima de Beto');
    await once(sa, 'hotel:user', (x) => x.id === A && x.x === 8 && x.y === 5, 8000);

    // Re-path a media caminata: el nuevo camino sale de la siguiente casilla
    const p3 = once(sa, 'hotel:path', (x) => x.id === A);
    sa.emit('hotel:walk', { x: 8, y: 1 });
    const m3 = await p3;
    await new Promise((r) => setTimeout(r, STEP_MS * 1.5));
    const p4 = once(sa, 'hotel:path', (x) => x.id === A);
    sa.emit('hotel:walk', { x: 8, y: 9 });
    const m4 = await p4;
    assert.deepEqual(m4.path[0], m3.path[1], 'termina el paso en curso');
    await once(sa, 'hotel:user', (x) => x.id === A && x.x === 8 && x.y === 9, 9000);

    // Sentada en una silla: el cuerpo no gira, la cabeza sí (±1)
    const placed = once(sa, 'hotel:item', (x) => x.item?.id === chair.id);
    sa.emit('hotel:place', { itemId: chair.id, x: 7, y: 8, rot: 0 });
    await placed;
    const sat = once(sa, 'hotel:user', (x) => x.id === A && x.sit && !x.sit.floor, 8000);
    sa.emit('hotel:walk', { x: 7, y: 8 });
    const s = await sat;
    assert.equal(s.dir, 4);
    const head = once(sa, 'hotel:user', (x) => x.id === A && x.head === 3);
    sa.emit('hotel:look', { x: 9, y: 8 });
    const h = await head;
    assert.equal(h.dir, 4, 'el cuerpo sigue viendo al frente de la silla');
  } finally { sa.close(); sb.close(); }
});

test('servidor: acciones para todos (sin staff): bailes 1–4 sincronizados, beso, reír, saltar, efectos y mano', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'BailaC');
  const beto = await createMember(srv.url, admin, 'VeC');
  const room = (await ana.post('/hotel/rooms', { name: 'Pista', model: 'b' })).data.room;
  const sa = await connect(ana), sb = await connect(beto);
  const A = ana.user.id;
  const mine = (m) => m.id === A;
  try {
    await enter(sa, room.id);
    await walkTo(sa, A, 3, 3);
    await enter(sb, room.id);
    // Los 4 bailes (por el menú y por el chat), los ve quien está en la sala
    for (const n of [1, 2, 3, 4]) {
      const seen = once(sb, 'hotel:user', (m) => mine(m) && m.act === 'dance' && m.dance === n);
      if (n % 2) sa.emit('hotel:act', { act: 'dance', n });
      else sa.emit('hotel:chat', { text: `:bailar ${n}` });
      await seen;
    }
    let p = once(sb, 'hotel:user', (m) => mine(m) && m.act === null);
    sa.emit('hotel:act', { act: 'stop' });
    await p;
    // Al entrar alguien más ve el baile en curso
    sa.emit('hotel:chat', { text: ':bailar 3' });
    await once(sb, 'hotel:user', (m) => mine(m) && m.dance === 3);
    const sc = await connect(admin);
    const snap = await enter(sc, room.id);
    assert.deepEqual([snap.users.find(mine).act, snap.users.find(mine).dance], ['dance', 3]);
    sc.close();
    // Acciones cortas: aparecen y se quitan solas
    for (const [cmd, act] of [[':beso', 'kiss'], [':reir', 'laugh'], [':saltar', 'jump'], [':saludar', 'wave']]) {
      p = once(sb, 'hotel:user', (m) => mine(m) && m.act === act);
      sa.emit('hotel:chat', { text: cmd });
      await p;
      await once(sb, 'hotel:user', (m) => mine(m) && m.act === null, 4000);
    }
    // Efectos (también el reflector) y objeto en la mano: para todos
    p = once(sb, 'hotel:user', (m) => mine(m) && m.effect === 'reflector');
    sa.emit('hotel:chat', { text: ':efecto reflector' });
    await p;
    p = once(sb, 'hotel:user', (m) => mine(m) && m.hand === 'helado');
    sa.emit('hotel:chat', { text: ':mano helado' });
    await p;
    p = once(sb, 'hotel:user', (m) => mine(m) && m.hand === null);
    sa.emit('hotel:chat', { text: ':mano' });
    await p;
    // Ningún comando sale en el chat
    const chats = [];
    sb.on('hotel:chat', (m) => chats.push(m.text));
    sa.emit('hotel:chat', { text: 'listo' });
    await once(sb, 'hotel:chat');
    assert.deepEqual(chats, ['listo']);
  } finally { sa.close(); sb.close(); }
});

test('servidor: voz en el Hotel — la misma sala se conecta aunque el piso sea solo de admins; fuera no', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'VozC');
  const hq = (await admin.post('/floors', { name: 'Archivo voz', template: 'hq', adminOnly: true })).data.floor.id;
  const room = (await ana.post('/hotel/rooms', { name: 'Charla', model: 'b' })).data.room;
  const sa = await connect(admin), sb = await connect(ana);
  try {
    // El admin está en el piso archivado
    sa.emit('move', { floorId: hq, x: 42, y: 53, dir: 'down', tp: true });
    await new Promise((r) => setTimeout(r, 250));
    const rtc = (from, to, tag) => { from.emit('rtc', { to, data: { tag } }); };
    // En la oficina: el miembro no puede señalizar con quien está en el piso archivado
    let no = none(sa, 'rtc', (m) => m.data?.tag === 'oficina');
    rtc(sb, admin.user.id, 'oficina');
    await no;
    // Los dos en la misma sala del Hotel: sí
    await enter(sa, room.id);
    await enter(sb, room.id);
    let yes = once(sa, 'rtc', (m) => m.data?.tag === 'hotel' && m.from === ana.user.id);
    rtc(sb, admin.user.id, 'hotel');
    await yes;
    yes = once(sb, 'rtc', (m) => m.data?.tag === 'hotel2');
    rtc(sa, ana.user.id, 'hotel2');
    await yes;
    // Sale del Hotel: vuelve la regla de la oficina
    sb.emit('hotel:leave');
    await new Promise((r) => setTimeout(r, 150));
    no = none(sa, 'rtc', (m) => m.data?.tag === 'fuera');
    rtc(sb, admin.user.id, 'fuera');
    await no;
  } finally { sa.close(); sb.close(); }
});
