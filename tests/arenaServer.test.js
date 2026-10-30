// Arena HUB en el servidor: la máquina en la sala de juegos, hasta 8 jugadores, anfitrión que pasa
// al siguiente, quien juega "sale de la oficina" (🎯 En la Arena) y vuelve igual, voz por equipo,
// resultados con XP y nivel, tablas de victorias y bajas, y la migración que agrega la máquina una vez.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';
import { CATALOG, objSize } from '../shared/catalog.js';
import { getTemplate, ARENA_ARCADE_SPOT, KART_ARCADE_SPOT, ZOMBIE_ARCADE_SPOT } from '../shared/map.js';
import { matchXp, levelFor } from '../shared/arena.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`sin ${ev}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});

test('la máquina de la Arena está en el catálogo y en la sala de juegos (sin encimarse con las otras)', () => {
  assert.equal(CATALOG.arenaArcade.interactive, 'game');
  assert.equal(CATALOG.arenaArcade.name, 'Máquina Arena');
  for (const tpl of ['recreativo', 'hq']) {
    const t = getTemplate(tpl);
    const cab = t.objects.find((o) => o.type === 'arenaArcade');
    assert.ok(cab, `hay máquina en ${tpl}`);
    assert.deepEqual([cab.x, cab.y], [ARENA_ARCADE_SPOT[tpl].x, ARENA_ARCADE_SPOT[tpl].y]);
    for (const other of [ZOMBIE_ARCADE_SPOT[tpl], KART_ARCADE_SPOT[tpl]]) assert.notDeepEqual([cab.x, cab.y], [other.x, other.y]);
    const s = objSize(cab);
    const overlap = t.objects.filter((o) => o !== cab && !CATALOG[o.type]?.under && CATALOG[o.type]?.kind !== 'decor').filter((o) => { const q = objSize(o); return o.x < cab.x + s.w && cab.x < o.x + q.w && o.y < cab.y + s.h && cab.y < o.y + q.h; });
    assert.deepEqual(overlap.map((o) => o.type), [], `nada encima en ${tpl}`);
    const games = t.areas.find((a) => /juegos/i.test(a.name));
    assert.ok(cab.x >= games.x && cab.x < games.x + games.w && cab.y >= games.y && cab.y < games.y + games.h, 'en la sala de juegos');
  }
});

describe('Arena: servidor', () => {
  let srv, admin, cab, connect;
  const sockets = [];
  before(async () => {
    srv = await startServer({ env: { OFFICE_NAME: 'HUB' } });
    admin = await adminClient(srv.url);
    const floor = (await admin.get('/floors/1')).data.floor;
    cab = floor.objects.find((o) => o.type === 'arenaArcade');
    connect = (c) => new Promise((resolve, reject) => {
      const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
      s.on('hello', () => { sockets.push(s); resolve(s); });
      s.on('connect_error', reject);
    });
  });
  after(async () => { for (const s of sockets) s.close(); await srv?.stop(); });

  test('la oficina nueva trae la máquina de la Arena', () => {
    assert.ok(cab);
    assert.deepEqual([cab.x, cab.y], [ARENA_ARCADE_SPOT.recreativo.x, ARENA_ARCADE_SPOT.recreativo.y]);
  });

  test('hasta 8 jugadores; el noveno mira; el anfitrión pasa al siguiente', async () => {
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
    assert.equal(room.game, 'arena');
    assert.equal(room.seats.length, 8);
    assert.deepEqual(room.seats, users.slice(0, 8).map((u) => u.user.id));
    assert.deepEqual(room.watchers, [users[8].user.id], 'el noveno mira');
    assert.equal(room.host, admin.user.id);
    const live = (await admin.get('/games/live')).data.live.find((m) => m.objectId === cab.id);
    assert.equal(live.game, 'arena');
    assert.equal(live.max, 8);
    // los controles van al anfitrión; el estado solo lo manda él
    const inp = once(ss[0], 'game:input', (m) => m.objectId === cab.id);
    ss[5].emit('game:input', { objectId: cab.id, data: { x: 1, y: 2 } });
    assert.equal((await inp).seat, 5);
    let r = once(ss[1], 'game:room', (x) => x.objectId === cab.id && !x.seats.includes(admin.user.id));
    ss[0].emit('game:leave', cab.id);
    r = await r;
    assert.equal(r.host, users[1].user.id, 'el siguiente lleva la partida');
    assert.equal(r.seats[3], users[3].user.id, 'los demás conservan su lugar');
    r = once(ss[8], 'game:room', (x) => x.objectId === cab.id && x.seats.includes(users[8].user.id));
    ss[8].emit('game:sit', cab.id);
    await r;
    for (let i = 1; i < 9; i++) ss[i].emit('game:leave', cab.id);
    await wait(250);
    assert.equal((await admin.get('/games/live')).data.live.length, 0);
  });

  test('quien juega sale de la oficina (🎯 En la Arena), la voz se separa por equipo y vuelve a su lugar', async () => {
    const gil = await createMember(srv.url, admin, 'Gil');
    const hugo = await createMember(srv.url, admin, 'Hugo');
    const ivan = await createMember(srv.url, admin, 'Ivan');
    const g = await connect(gil), h = await connect(hugo), v = await connect(ivan);
    g.emit('move', { floorId: 1, x: 40, y: 52, dir: 'down', tp: true });
    h.emit('move', { floorId: 1, x: 41, y: 52, dir: 'down', tp: true });
    await wait(250);
    const hid = once(h, 'player', (p) => p.id === gil.user.id && p.game);
    g.emit('game:join', cab.id);
    const p = await hid;
    assert.equal(p.game.type, 'arena');
    assert.equal(p.game.objectId, cab.id);
    assert.deepEqual([p.x, p.y], [40, 52], 'su lugar se guarda');
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
    assert.equal(await relays(h, g, gil.user.id), false, 'no se oye con la oficina');
    for (const s of [h, v]) { const seated = once(s, 'game:room', (r) => r.objectId === cab.id && r.seats.length === 8); s.emit('game:join', cab.id); await seated; }
    await wait(150);
    assert.equal(await relays(h, g, gil.user.id), true, 'en la sala se oyen todos');
    // Por equipos: Gil (anfitrión) y Hugo en Rosa, Iván en Azul
    const teamed = once(v, 'player', (q) => q.id === ivan.user.id && q.game?.team === 1);
    h.emit('arena:teams', { objectId: cab.id, teams: { [gil.user.id]: 1, [hugo.user.id]: 1, [ivan.user.id]: 0 } }); // no es el anfitrión: no cuenta
    g.emit('arena:teams', { objectId: cab.id, teams: { [gil.user.id]: 0, [hugo.user.id]: 0, [ivan.user.id]: 1 } });
    await teamed;
    await wait(150);
    assert.equal(await relays(h, g, gil.user.id), true, 'mismo equipo: se oyen');
    assert.equal(await relays(v, g, gil.user.id), false, 'otro equipo: no');
    // al terminar, todos de nuevo
    g.emit('arena:teams', { objectId: cab.id, teams: { [gil.user.id]: null, [hugo.user.id]: null, [ivan.user.id]: null } });
    await wait(250);
    assert.equal(await relays(v, g, gil.user.id), true, 'sin equipos: se oyen todos');
    // Volver a la oficina
    const back = once(h, 'player', (q) => q.id === gil.user.id && !q.game);
    g.emit('game:leave', cab.id);
    const q = await back;
    assert.deepEqual([q.floorId, q.x, q.y], [1, 40, 52]);
    // desconectarse a media partida no deja a nadie "en la Arena"
    const gone = once(v, 'player', (x) => x.id === hugo.user.id && !x.game);
    h.close();
    await gone;
    v.emit('game:leave', cab.id);
    await wait(250);
    assert.equal((await admin.get('/games/live')).data.live.length, 0);
  });

  test('resultados: XP y nivel; las tablas cuentan victorias y bajas contra personas', async () => {
    const ana = await createMember(srv.url, admin, 'Anita');
    const beto = await createMember(srv.url, admin, 'Betito');
    const a = await connect(ana), b = await connect(beto);
    // fuera de la máquina no se acepta
    assert.equal((await ana.post('/arena/result', { objectId: cab.id, kills: 3 })).status, 403);
    for (const s of [a, b]) { const got = once(s, 'game:room', (r) => r.objectId === cab.id); s.emit('game:join', cab.id); await got; }
    // partida contra otra persona: gana Ana con 12 bajas (10 a personas) y 4 a la cabeza
    const r = await ana.post('/arena/result', { objectId: cab.id, kills: 12, pk: 10, deaths: 3, hs: 4, won: true, humans: 2, mode: 'ffa' });
    assert.equal(r.status, 200);
    assert.equal(r.data.xp, matchXp({ kills: 12, hs: 4, won: true }));
    assert.equal(r.data.practice, false);
    assert.equal(r.data.profile.level, levelFor(r.data.xp));
    assert.equal(r.data.levelUp, levelFor(r.data.xp) > 1 ? levelFor(r.data.xp) : null);
    // muy seguido: no
    assert.equal((await ana.post('/arena/result', { objectId: cab.id, kills: 99, humans: 2 })).status, 429);
    // trampas: se recortan
    const big = await beto.post('/arena/result', { objectId: cab.id, kills: 500, pk: 900, deaths: -4, hs: 999, won: false, humans: 2 });
    assert.equal(big.status, 200);
    assert.equal(big.data.profile.kills, 80, 'tope de bajas por partida');
    assert.equal(big.data.profile.headshots, 80, 'cabezas no más que bajas');
    assert.equal(big.data.profile.deaths, 0);
    const wins = (await admin.get('/games/arena/top')).data.top;
    assert.deepEqual(wins.map((x) => [x.userId, x.score]), [[ana.user.id, 1]]);
    const kills = (await admin.get('/games/arena_kills/top')).data.top;
    assert.deepEqual(kills.map((x) => x.userId), [beto.user.id, ana.user.id]);
    assert.equal(kills.find((x) => x.userId === ana.user.id).score, 10, 'solo bajas a personas');
    const prof = (await admin.get(`/arena/profiles?ids=${ana.user.id},${beto.user.id},999999`)).data.profiles;
    assert.equal(prof[ana.user.id].wins, 1);
    assert.equal(prof[ana.user.id].matches, 1);
    assert.equal(prof[999999].xp, 0, 'sin partidas: nivel 1');
    assert.equal(prof[999999].level, 1);
    for (const s of [a, b]) s.emit('game:leave', cab.id);
    await wait(150);
  });

  test('práctica contra bots: la mitad de XP y no cuenta para las tablas; las bajas se suman', async () => {
    const caro = await createMember(srv.url, admin, 'Carito');
    const c = await connect(caro);
    const got = once(c, 'game:room', (r) => r.objectId === cab.id);
    c.emit('game:join', cab.id);
    await got;
    const r = await caro.post('/arena/result', { objectId: cab.id, kills: 6, pk: 0, deaths: 2, hs: 1, won: true, humans: 1, mode: 'ffa' });
    assert.equal(r.status, 200);
    assert.equal(r.data.practice, true);
    assert.equal(r.data.xp, matchXp({ kills: 6, hs: 1, won: true, bots: true }));
    assert.equal(r.data.profile.wins, 0, 'ganarle a bots no cuenta');
    assert.ok(!(await admin.get('/games/arena/top')).data.top.some((x) => x.userId === caro.user.id));
    assert.ok(!(await admin.get('/games/arena_kills/top')).data.top.some((x) => x.userId === caro.user.id));
    c.emit('game:leave', cab.id);
  });
});

test('migración: la máquina de la Arena se agrega una vez a las oficinas ya creadas', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-migr-'));
  try {
    let srv = await startServer({ env: { DATA_DIR: dir } });
    await srv.stop();
    let db = new DatabaseSync(path.join(dir, 'office.db'));
    db.prepare("DELETE FROM objects WHERE type = 'arenaArcade'").run();
    db.prepare("DELETE FROM settings WHERE key = 'migr_arena_arcade_v1'").run();
    db.close();
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url);
      const objs = (await admin.get('/floors/1')).data.floor.objects;
      const a = objs.filter((o) => o.type === 'arenaArcade');
      assert.equal(a.length, 1);
      assert.deepEqual([a[0].x, a[0].y], [ARENA_ARCADE_SPOT.recreativo.x, ARENA_ARCADE_SPOT.recreativo.y]);
      assert.equal(objs.filter((o) => o.type === 'zombieArcade').length, 1, 'la de Zombies sigue');
      assert.equal(objs.filter((o) => o.type === 'kartArcade').length, 1, 'la de Karts sigue');
    } finally { await srv.stop(); }
    // otra vez: no duplica
    db = new DatabaseSync(path.join(dir, 'office.db'));
    db.prepare("DELETE FROM settings WHERE key = 'migr_arena_arcade_v1'").run();
    db.close();
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url);
      assert.equal((await admin.get('/floors/1')).data.floor.objects.filter((o) => o.type === 'arenaArcade').length, 1);
    } finally { await srv.stop(); }
    // lugar ocupado: busca otro libre en la sala de juegos
    db = new DatabaseSync(path.join(dir, 'office.db'));
    db.prepare("DELETE FROM objects WHERE type = 'arenaArcade'").run();
    db.prepare("DELETE FROM settings WHERE key = 'migr_arena_arcade_v1'").run();
    db.prepare("INSERT INTO objects (floor_id, type, x, y, w, h, rot, color, created_at) VALUES (1, 'plant', ?, ?, NULL, NULL, 0, NULL, 0)").run(ARENA_ARCADE_SPOT.recreativo.x, ARENA_ARCADE_SPOT.recreativo.y);
    db.close();
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url);
      const floor = (await admin.get('/floors/1')).data.floor;
      const k = floor.objects.filter((o) => o.type === 'arenaArcade');
      assert.equal(k.length, 1);
      assert.notDeepEqual([k[0].x, k[0].y], [ARENA_ARCADE_SPOT.recreativo.x, ARENA_ARCADE_SPOT.recreativo.y]);
      const room = floor.areas.find((a) => /juegos/i.test(a.name));
      assert.ok(k[0].x >= room.x && k[0].x < room.x + room.w && k[0].y >= room.y && k[0].y < room.y + room.h, 'dentro de la sala de juegos');
    } finally { await srv.stop(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
