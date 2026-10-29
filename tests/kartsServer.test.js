// Karts de oficina en el servidor: la máquina en la sala de juegos, hasta 8 corredores, anfitrión que
// pasa al siguiente, quien corre "sale de la oficina" y vuelve igual, récords por pista y la migración.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { CATALOG, objSize } from '../shared/catalog.js';
import { getTemplate, KART_ARCADE_SPOT, ZOMBIE_ARCADE_SPOT } from '../shared/map.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`sin ${ev}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});

test('la máquina de karts está en el catálogo y en la sala de juegos (sin encimarse con la de Zombies)', () => {
  assert.equal(CATALOG.kartArcade.interactive, 'game');
  assert.equal(CATALOG.kartArcade.name, 'Máquina Karts');
  for (const tpl of ['recreativo', 'hq']) {
    const t = getTemplate(tpl);
    const cab = t.objects.find((o) => o.type === 'kartArcade');
    assert.ok(cab, `hay máquina en ${tpl}`);
    assert.deepEqual([cab.x, cab.y], [KART_ARCADE_SPOT[tpl].x, KART_ARCADE_SPOT[tpl].y]);
    assert.notDeepEqual([cab.x, cab.y], [ZOMBIE_ARCADE_SPOT[tpl].x, ZOMBIE_ARCADE_SPOT[tpl].y]);
    const s = objSize(cab);
    const overlap = t.objects.filter((o) => o !== cab && !CATALOG[o.type]?.under && CATALOG[o.type]?.kind !== 'decor').filter((o) => { const q = objSize(o); return o.x < cab.x + s.w && cab.x < o.x + q.w && o.y < cab.y + s.h && cab.y < o.y + q.h; });
    assert.deepEqual(overlap.map((o) => o.type), [], `nada encima en ${tpl}`);
  }
});

describe('Karts: servidor', () => {
  let srv, admin, cab, connect;
  const sockets = [];
  before(async () => {
    srv = await startServer({ env: { OFFICE_NAME: 'HUB' } });
    admin = await adminClient(srv.url);
    const floor = (await admin.get('/floors/1')).data.floor;
    cab = floor.objects.find((o) => o.type === 'kartArcade');
    connect = (c) => new Promise((resolve, reject) => {
      const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
      s.on('hello', () => { sockets.push(s); resolve(s); });
      s.on('connect_error', reject);
    });
  });
  after(async () => { for (const s of sockets) s.close(); await srv?.stop(); });

  test('la oficina nueva trae la máquina de karts', () => {
    assert.ok(cab);
    assert.deepEqual([cab.x, cab.y], [KART_ARCADE_SPOT.recreativo.x, KART_ARCADE_SPOT.recreativo.y]);
  });

  test('récords por pista: la mejor vuelta (menos es mejor) de cada quien, separados por pista', async () => {
    const ana = await createMember(srv.url, admin, 'Ana');
    assert.equal((await ana.post('/games/karts_oficina/score', { score: 21500 })).status, 200);
    await wait(5100);
    const r = await ana.post('/games/karts_oficina/score', { score: 19800 });
    assert.equal(r.status, 200);
    assert.equal(r.data.top.find((t) => t.userId === ana.user.id).score, 19800, 'cuenta la vuelta más rápida');
    await wait(5100);
    await ana.post('/games/karts_oficina/score', { score: 25000 });
    assert.equal((await admin.post('/games/karts_juegos/score', { score: 27000 })).status, 200);
    const of = (await admin.get('/games/karts_oficina/top')).data.top;
    assert.deepEqual(of.map((t) => [t.userId, t.score]), [[ana.user.id, 19800]]);
    const ju = (await admin.get('/games/karts_juegos/top')).data.top;
    assert.deepEqual(ju.map((t) => t.userId), [admin.user.id]);
    assert.deepEqual((await admin.get('/games/karts_torre/top')).data.top, []);
    // orden: menos tiempo primero
    const beto = await createMember(srv.url, admin, 'Beto');
    await beto.post('/games/karts_juegos/score', { score: 24000 });
    assert.deepEqual((await admin.get('/games/karts_juegos/top')).data.top.map((t) => t.score), [24000, 27000]);
    assert.equal((await admin.post('/games/karts_luna/score', { score: 1000 })).status, 404);
    assert.equal((await admin.get('/games/karts/top')).status, 404);
  });

  test('hasta 8 corredores; el noveno mira; el anfitrión pasa al siguiente', async () => {
    const users = [admin];
    for (const n of ['Caro', 'Dani', 'Eli', 'Fer', 'Gabo', 'Hilda', 'Iker', 'Juan']) users.push(await createMember(srv.url, admin, n));
    const ss = [];
    for (const u of users) ss.push(await connect(u));
    let room = null;
    for (let i = 0; i < 9; i++) {
      const got = once(ss[0], 'game:room', (r) => r.objectId === cab.id && [...r.seats, ...r.watchers].includes(users[i].user.id));
      ss[i].emit('game:join', cab.id);
      room = await got;
    }
    assert.equal(room.game, 'karts');
    assert.equal(room.seats.length, 8);
    assert.deepEqual(room.seats, users.slice(0, 8).map((u) => u.user.id));
    assert.deepEqual(room.watchers, [users[8].user.id], 'el noveno mira');
    assert.equal(room.host, admin.user.id);
    const live = (await admin.get('/games/live')).data.live.find((m) => m.objectId === cab.id);
    assert.equal(live.game, 'karts');
    assert.equal(live.players.length, 8);
    assert.equal(live.max, 8);
    // el estado solo lo manda el anfitrión; las posiciones de los demás le llegan a él
    const inp = once(ss[0], 'game:input', (m) => m.objectId === cab.id);
    ss[3].emit('game:input', { objectId: cab.id, data: { x: 1, seq: 1 } });
    assert.equal((await inp).seat, 3);
    // se va el anfitrión: el siguiente lleva la carrera y los demás conservan su lugar
    let r = once(ss[1], 'game:room', (x) => x.objectId === cab.id && !x.seats.includes(admin.user.id));
    ss[0].emit('game:leave', cab.id);
    r = await r;
    assert.equal(r.host, users[1].user.id);
    assert.equal(r.seats[2], users[2].user.id);
    // el que miraba se sienta en el lugar libre
    r = once(ss[8], 'game:room', (x) => x.objectId === cab.id && x.seats.includes(users[8].user.id));
    ss[8].emit('game:sit', cab.id);
    await r;
    for (let i = 1; i < 9; i++) ss[i].emit('game:leave', cab.id);
    await wait(250);
    assert.equal((await admin.get('/games/live')).data.live.length, 0);
  });

  test('quien corre sale de la oficina ("Corriendo karts"), su voz es del equipo y vuelve a su lugar', async () => {
    const gil = await createMember(srv.url, admin, 'Gil');
    const hugo = await createMember(srv.url, admin, 'Hugo');
    const g = await connect(gil), h = await connect(hugo);
    g.emit('move', { floorId: 1, x: 40, y: 52, dir: 'down', tp: true });
    h.emit('move', { floorId: 1, x: 41, y: 52, dir: 'down', tp: true });
    await wait(250);
    const hid = once(h, 'player', (p) => p.id === gil.user.id && p.game);
    g.emit('game:join', cab.id);
    const p = await hid;
    assert.equal(p.game.type, 'karts');
    assert.equal(p.game.objectId, cab.id);
    assert.deepEqual([p.x, p.y], [40, 52], 'su lugar se guarda');
    // voz: ya no se oye con quien está en la oficina
    const relays = async (a, b, bId) => {
      const tag = Math.random().toString(36).slice(2);
      let got = false;
      const on = ({ data }) => { if (data?.tag === tag) got = true; };
      b.on('rtc', on);
      a.emit('rtc', { to: bId, data: { candidate: null, tag } });
      await wait(250);
      b.off('rtc', on);
      return got;
    };
    assert.equal(await relays(h, g, gil.user.id), false, 'no se oyen');
    // Hugo entra a la carrera: ahora sí se oyen (equipo de la carrera)
    const team = once(h, 'game:room', (r) => r.objectId === cab.id && r.seats.includes(hugo.user.id));
    h.emit('game:join', cab.id);
    await team;
    await wait(150);
    assert.equal(await relays(h, g, gil.user.id), true, 'los corredores se oyen');
    // Volver a la oficina
    const back = once(h, 'player', (q) => q.id === gil.user.id && !q.game);
    g.emit('game:leave', cab.id);
    const q = await back;
    assert.deepEqual([q.floorId, q.x, q.y], [1, 40, 52]);
    // desconectarse a media carrera no deja a nadie "corriendo"
    const gone = once(g, 'player', (x) => x.id === hugo.user.id && !x.game);
    h.close();
    await gone;
    await wait(200);
    assert.equal((await admin.get('/games/live')).data.live.length, 0);
  });
});

test('migración: la máquina de karts se agrega una vez a las oficinas ya creadas', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karts-migr-'));
  try {
    let srv = await startServer({ env: { DATA_DIR: dir } });
    await srv.stop();
    let db = new DatabaseSync(path.join(dir, 'office.db'));
    db.prepare("DELETE FROM objects WHERE type = 'kartArcade'").run();
    db.prepare("DELETE FROM settings WHERE key = 'migr_kart_arcade_v1'").run();
    db.close();
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url);
      const objs = (await admin.get('/floors/1')).data.floor.objects;
      const karts = objs.filter((o) => o.type === 'kartArcade');
      assert.equal(karts.length, 1);
      assert.deepEqual([karts[0].x, karts[0].y], [KART_ARCADE_SPOT.recreativo.x, KART_ARCADE_SPOT.recreativo.y]);
      assert.equal(objs.filter((o) => o.type === 'zombieArcade').length, 1, 'la de Zombies sigue ahí');
    } finally { await srv.stop(); }
    // otra vez: no duplica; y si el lugar está ocupado, busca otro libre en la sala de juegos
    db = new DatabaseSync(path.join(dir, 'office.db'));
    db.prepare("DELETE FROM settings WHERE key = 'migr_kart_arcade_v1'").run();
    db.close();
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url);
      assert.equal((await admin.get('/floors/1')).data.floor.objects.filter((o) => o.type === 'kartArcade').length, 1);
    } finally { await srv.stop(); }
    db = new DatabaseSync(path.join(dir, 'office.db'));
    db.prepare("DELETE FROM objects WHERE type = 'kartArcade'").run();
    db.prepare("DELETE FROM settings WHERE key = 'migr_kart_arcade_v1'").run();
    db.prepare("INSERT INTO objects (floor_id, type, x, y, w, h, rot, color, created_at) VALUES (1, 'plant', ?, ?, NULL, NULL, 0, NULL, 0)").run(KART_ARCADE_SPOT.recreativo.x, KART_ARCADE_SPOT.recreativo.y);
    db.close();
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url);
      const floor = (await admin.get('/floors/1')).data.floor;
      const k = floor.objects.filter((o) => o.type === 'kartArcade');
      assert.equal(k.length, 1);
      assert.notDeepEqual([k[0].x, k[0].y], [KART_ARCADE_SPOT.recreativo.x, KART_ARCADE_SPOT.recreativo.y]);
      const room = floor.areas.find((a) => /juegos/i.test(a.name));
      assert.ok(k[0].x >= room.x && k[0].x < room.x + room.w && k[0].y >= room.y && k[0].y < room.y + room.h, 'dentro de la sala de juegos');
    } finally { await srv.stop(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
