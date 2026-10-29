// Zombies en la oficina en el servidor: puntuaciones, hasta 4 asientos, anfitrión que pasa al
// siguiente, quien juega "sale de la sala" (no se ve, no se oye) y vuelve igual, y la máquina
// que se agrega una sola vez a las oficinas ya creadas.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev, pred = () => true, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { s.off(ev, f); reject(new Error(`sin ${ev}`)); }, ms);
  const f = (m) => { if (pred(m)) { clearTimeout(t); s.off(ev, f); resolve(m); } };
  s.on(ev, f);
});

describe('Zombies: servidor', () => {
  let srv, admin, cab, connect;
  const sockets = [];
  before(async () => {
    srv = await startServer();
    admin = await adminClient(srv.url);
    const floor = (await admin.get('/floors/1')).data.floor;
    cab = floor.objects.find((o) => o.type === 'zombieArcade');
    connect = (c) => new Promise((resolve, reject) => {
      const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
      s.on('hello', () => { sockets.push(s); resolve(s); });
      s.on('connect_error', reject);
    });
  });
  after(async () => { for (const s of sockets) s.close(); await srv?.stop(); });

  test('la oficina nueva trae la máquina de Zombies en la sala de juegos', () => {
    assert.ok(cab, 'hay zombieArcade');
    assert.deepEqual([cab.x, cab.y], [65, 23]);
  });

  test('puntuaciones: se aceptan, cuenta la mejor de cada quien y hay tabla', async () => {
    const ana = await createMember(srv.url, admin, 'Ana');
    assert.equal((await ana.post('/games/zombies/score', { score: 1200 })).status, 200);
    await wait(5100); // una puntuación cada 5 s por persona
    const r = await ana.post('/games/zombies/score', { score: 800 });
    assert.equal(r.status, 200);
    assert.equal(r.data.top.find((t) => t.userId === ana.user.id).score, 1200, 'cuenta la mejor');
    assert.equal((await admin.post('/games/zombies/score', { score: -5 })).status, 400);
    assert.equal((await admin.post('/games/pong/score', { score: 10 })).status, 404, 'las mesas no tienen puntos');
    assert.equal((await admin.post('/games/arcade/score', { score: 10 })).status, 200, 'el arcade sigue igual');
    const top = (await admin.get('/games/zombies/top')).data.top;
    assert.equal(top[0].userId, ana.user.id);
    assert.equal(top[0].score, 1200);
  });

  test('hasta 4 jugadores; el quinto mira y se sienta cuando hay lugar; el anfitrión pasa al siguiente', async () => {
    const users = [admin];
    for (const n of ['Beto', 'Caro', 'Dani', 'Eli']) users.push(await createMember(srv.url, admin, n));
    const ss = [];
    for (const u of users) ss.push(await connect(u));
    let room = null;
    for (let i = 0; i < 5; i++) {
      const got = once(ss[0], 'game:room', (r) => r.objectId === cab.id && [...r.seats, ...r.watchers].includes(users[i].user.id));
      ss[i].emit('game:join', cab.id);
      room = await got;
    }
    assert.equal(room.seats.length, 4);
    assert.deepEqual(room.seats, users.slice(0, 4).map((u) => u.user.id));
    assert.deepEqual(room.watchers, [users[4].user.id], 'el quinto mira');
    assert.equal(room.host, admin.user.id);
    // partidas en curso (para "Unirse")
    const live = (await admin.get('/games/live')).data.live;
    assert.equal(live.find((m) => m.objectId === cab.id).players.length, 4);
    // se va el anfitrión: el siguiente toma el mando y su asiento queda libre
    let r = once(ss[1], 'game:room', (x) => x.objectId === cab.id && !x.seats.includes(admin.user.id));
    ss[0].emit('game:leave', cab.id);
    r = await r;
    assert.equal(r.host, users[1].user.id);
    assert.equal(r.seats[0], null);
    assert.equal(r.seats[1], users[1].user.id, 'los demás conservan su asiento');
    // los controles van al nuevo anfitrión y solo él manda el estado
    const inp = once(ss[1], 'game:input', (m) => m.objectId === cab.id);
    ss[2].emit('game:input', { objectId: cab.id, data: { x: 1 } });
    assert.equal((await inp).seat, 2);
    let leaked = false;
    const spy = (m) => { if (m.data?.fake) leaked = true; };
    ss[3].on('game:state', spy);
    ss[2].emit('game:state', { objectId: cab.id, data: { fake: 1 } });
    await wait(200);
    ss[3].off('game:state', spy);
    assert.equal(leaked, false, 'un invitado no puede mandar el estado');
    // el que miraba se une
    r = once(ss[4], 'game:room', (x) => x.objectId === cab.id && x.seats.includes(users[4].user.id));
    ss[4].emit('game:sit', cab.id);
    r = await r;
    assert.equal(r.seats[0], users[4].user.id);
    for (let i = 1; i < 5; i++) ss[i].emit('game:leave', cab.id);
    await wait(200);
    assert.equal((await admin.get('/games/live')).data.live.length, 0, 'sin jugadores no hay partida');
  });

  test('quien juega sale de la sala: no se ve, no se oye ni le llega el chat; al volver queda donde estaba', async () => {
    const gil = await createMember(srv.url, admin, 'Gil');
    const hugo = await createMember(srv.url, admin, 'Hugo');
    const ivan = await createMember(srv.url, admin, 'Ivan');
    const g = await connect(gil), h = await connect(hugo), iv = await connect(ivan);
    // los tres juntos en la oficina (lejos de la máquina)
    for (const [s, x] of [[g, 40], [h, 41], [iv, 42]]) s.emit('move', { floorId: 1, x, y: 52, dir: 'down', tp: true });
    await wait(250);
    const hid = once(h, 'player', (p) => p.id === gil.user.id && p.game);
    g.emit('game:join', cab.id);
    const p = await hid;
    assert.equal(p.game.type, 'zombies');
    assert.equal(p.game.objectId, cab.id);
    assert.deepEqual([p.x, p.y], [40, 52], 'su lugar en la oficina se guarda');
    // quien se conecta después también lo ve jugando
    const extra = io(srv.url, { extraHeaders: { cookie: [...ivan.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
    sockets.push(extra);
    const hello = await once(extra, 'hello');
    assert.equal(hello.players[gil.user.id].game.objectId, cab.id);
    // chat de sala: a Gil no le llega lo que dicen junto a él, ni a ellos lo suyo
    let gotG = false, gotH = false;
    g.on('room-msg', (m) => { if (m.from === hugo.user.id) gotG = true; });
    h.on('room-msg', (m) => { if (m.from === gil.user.id) gotH = true; });
    h.emit('room-msg', { text: 'hola' });
    g.emit('room-msg', { text: 'aquí ando' });
    await wait(300);
    assert.equal(gotG, false);
    assert.equal(gotH, false);
    // voz: la señalización entre Gil y Hugo ya no pasa…
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
    assert.equal(await relays(h, iv, ivan.user.id), true, 'los de la oficina sí');
    // …pero el equipo de la partida sí se oye aunque estén lejos en el mapa
    iv.emit('move', { floorId: 1, x: 12, y: 28, dir: 'down', tp: true });
    await wait(150);
    const team = once(iv, 'game:room', (r) => r.objectId === cab.id && r.seats.includes(ivan.user.id));
    iv.emit('game:join', cab.id);
    await team;
    await wait(150);
    assert.equal(await relays(g, iv, ivan.user.id), true, 'el equipo se oye');
    // volver a la oficina: mismo lugar y sin "jugando"
    const back = once(h, 'player', (q) => q.id === gil.user.id && !q.game);
    g.emit('game:leave', cab.id);
    const q = await back;
    assert.deepEqual([q.floorId, q.x, q.y], [1, 40, 52]);
    assert.equal(await relays(h, g, gil.user.id), true, 'se vuelven a oír');
    // desconectarse a media partida no deja a nadie "jugando"
    const gone = once(h, 'player', (x) => x.id === ivan.user.id && !x.game);
    iv.close();
    extra.close();
    await gone;
    await wait(200);
    assert.equal((await admin.get('/games/live')).data.live.length, 0);
  });
});

test('migración: la máquina se agrega una vez a las oficinas ya creadas', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-migr-'));
  try {
    let srv = await startServer({ env: { DATA_DIR: dir } });
    await srv.stop();
    // Oficina vieja: sin máquina y sin la migración hecha
    let db = new DatabaseSync(path.join(dir, 'office.db'));
    db.prepare("DELETE FROM objects WHERE type = 'zombieArcade'").run();
    db.prepare("DELETE FROM settings WHERE key = 'migr_zombies_arcade_v1'").run();
    db.close();
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url);
      const objs = (await admin.get('/floors/1')).data.floor.objects.filter((o) => o.type === 'zombieArcade');
      assert.equal(objs.length, 1);
      assert.deepEqual([objs[0].x, objs[0].y], [65, 23]);
    } finally { await srv.stop(); }
    // Correrla otra vez no duplica
    db = new DatabaseSync(path.join(dir, 'office.db'));
    db.prepare("DELETE FROM settings WHERE key = 'migr_zombies_arcade_v1'").run();
    db.close();
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url);
      assert.equal((await admin.get('/floors/1')).data.floor.objects.filter((o) => o.type === 'zombieArcade').length, 1);
    } finally { await srv.stop(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
