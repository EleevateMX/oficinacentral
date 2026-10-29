// Oficina recreativa (plantilla nueva) y pisos archivados que solo ven los admins.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember, Client } from './helpers/server.js';
import { getTemplate, composeFloor, isWalkable, areaAt } from '../shared/map.js';
import { CATALOG, objSize } from '../shared/catalog.js';
import { floorStages, inStageScope } from '../shared/stage.js';
import { jukeboxAt } from '../shared/jukebox.js';

const SEATS = ['chair', 'officeChair', 'confChair', 'gamingChair', 'armchair', 'sofa', 'sofaSmall', 'lSofa', 'beanBag', 'stool', 'bench'];

function floorOf(id) {
  const t = getTemplate(id);
  const objects = t.objects.map((o, i) => ({ ...o, id: i + 1 }));
  const areas = t.areas.map((a, i) => ({ ...a, id: i + 1 }));
  return { t, objects, areas, f: composeFloor({ template: id, areas, objects }) };
}

function reachableFrom(f, start) {
  const seen = new Set([start.y * f.W + start.x]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx, y = c.y + dy;
      if (isWalkable(f, x, y) && !seen.has(y * f.W + x)) { seen.add(y * f.W + x); queue.push({ x, y }); }
    }
  }
  return seen;
}

const tiles = (o) => {
  const { w, h } = objSize(o);
  const out = [];
  for (let j = Math.floor(o.y); j < Math.ceil(o.y + h); j++) for (let i = Math.floor(o.x); i < Math.ceil(o.x + w); i++) out.push([i, j]);
  return out;
};

describe('plantilla recreativa', () => {
  const { t, objects, areas, f } = floorOf('recreativo');
  const seen = reachableFrom(f, f.spawn);

  test('mide lo mismo que HQ y no tiene áreas de staff ni departamentos', () => {
    assert.equal(t.W, 100);
    assert.equal(t.H, 68);
    const names = areas.map((a) => a.name);
    for (const bad of [/staff/i, /orgs/i, /^admin/i, /engineering/i, /gameplay/i, /liveops/i, /testing/i, /mapping/i, /design/i, /marketing/i, /direcci/i])
      assert.ok(!names.some((n) => bad.test(n)), `no debe haber un área como ${bad}`);
    for (const want of ['Recepción', 'Coworking', 'Zona de enfoque', 'Sala de juntas', 'Cafetería', 'Lounge', 'Sala de juegos', 'Auditorio', 'Jardín y terraza'])
      assert.ok(names.includes(want), `falta el área ${want}`);
    assert.ok(areas.filter((a) => a.private && /^Sala /.test(a.name) && a.name !== 'Sala de juntas').length >= 2, 'hay salas privadas para reuniones');
    assert.ok(areas.filter((a) => a.private && /^Cabina/.test(a.name)).length >= 2, 'hay cabinas telefónicas privadas');
  });

  test('cada área tiene casillas a las que se llega caminando desde la entrada', () => {
    for (const a of areas) {
      let ok = false;
      for (let y = a.y; y < a.y + a.h && !ok; y++) for (let x = a.x; x < a.x + a.w && !ok; x++) if (areaAt(f, x, y)?.id === a.id && seen.has(y * f.W + x)) ok = true;
      assert.ok(ok, `no se llega a ${a.name}`);
    }
  });

  test('trae lo que depende del mapa: recepción, elevador, rocola, escenario, juegos y escritorios', () => {
    const has = (type) => objects.filter((o) => o.type === type);
    assert.equal(has('reception').length, 1);
    assert.equal(has('hotelElevator').length, 1);
    assert.ok(has('wavingFlag').length && has('neonLogo').length && has('floorLogo').length, 'piezas de la marca');
    // Rocola: se oye en el lounge
    const jb = has('jukebox')[0];
    assert.ok(jb);
    assert.equal(areaAt(f, jb.x, jb.y).name, 'Lounge');
    assert.equal(jukeboxAt(f, 70, 43)?.id, jb.id);
    assert.equal(jukeboxAt(f, 42, 53), null);
    // Escenario del auditorio: lo oye toda el área
    const st = floorStages(f).find((s) => s.obj.type === 'stage' && s.area?.name === 'Auditorio');
    assert.ok(st, 'el auditorio tiene escenario');
    assert.ok(inStageScope(f, st, 40, 41));
    assert.equal(inStageScope(f, st, 42, 53), false);
    assert.ok(has('stageMic').some((o) => areaAt(f, o.x, o.y)?.name === 'Auditorio'));
    // Mesas de juego reales con lugar alrededor para jugar y mirar
    for (const type of ['pingPong', 'poolTable', 'foosball', 'arcade']) {
      const list = has(type);
      assert.ok(list.length, `falta ${type}`);
      for (const o of list) {
        const near = tiles(o).flatMap(([i, j]) => [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]).filter(([i, j]) => seen.has(j * f.W + i));
        assert.ok(near.length >= (type === 'arcade' ? 1 : 3), `${type}@${o.x},${o.y} sin lugar alrededor`);
      }
    }
    assert.ok(f.desks.length >= 18, 'escritorios para reclamar en el coworking');
  });

  test('los muebles no se enciman (sillas, sofás y mesas incluidos)', () => {
    const used = new Map();
    const problems = [];
    for (const o of objects) {
      const c = CATALOG[o.type];
      if (c.kind !== 'furniture' || c.under) continue;
      for (const [i, j] of tiles(o)) {
        const k = `${i},${j}`;
        if (t.walls[j]?.[i] && (c.solid || SEATS.includes(o.type))) problems.push(`${o.type}@${o.x},${o.y} sobre muro`);
        if (used.has(k)) problems.push(`${o.type}@${o.x},${o.y} se encima con ${used.get(k)}`);
        else used.set(k, `${o.type}@${o.x},${o.y}`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test('los asientos se pueden alcanzar', () => {
    const seats = objects.filter((o) => SEATS.includes(o.type));
    const bad = seats.filter((o) => !tiles(o).some(([i, j]) => seen.has(j * f.W + i))).map((o) => `${o.type}@${o.x},${o.y}`);
    assert.deepEqual(bad, []);
  });
});

// ---------- Servidor ----------
const connect = (url, c) => new Promise((resolve, reject) => {
  const s = io(url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', (h) => { s.hello = h; resolve(s); });
  s.on('connect_error', reject);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('instalación nueva', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv?.stop(); });

  test('el piso principal es la oficina recreativa y HQ sigue disponible para crear', async () => {
    const admin = await adminClient(srv.url);
    const floors = (await admin.get('/floors')).data.floors;
    assert.equal(floors.length, 1);
    assert.equal(floors[0].template, 'recreativo');
    assert.equal(floors[0].adminOnly, false);
    const r = await admin.post('/floors', { name: 'HQ', template: 'hq', adminOnly: true });
    assert.equal(r.status, 200);
    assert.equal(r.data.floor.template, 'hq');
    assert.equal(r.data.floor.adminOnly, true);
    // La oficina nueva trae escenario, rocola y elevador una sola vez
    const p = (await admin.get(`/floors/${floors[0].id}`)).data.floor;
    const tpl = getTemplate('recreativo').objects;
    for (const type of ['stage', 'jukebox', 'hotelElevator']) assert.equal(p.objects.filter((o) => o.type === type).length, tpl.filter((o) => o.type === type).length, type);
  });
});

describe('pisos solo para admins', () => {
  let srv, admin, ana, main, hq;
  before(async () => {
    srv = await startServer();
    admin = await adminClient(srv.url);
    ana = await createMember(srv.url, admin, 'Ana');
    main = (await admin.get('/floors')).data.floors[0].id;
    hq = (await admin.post('/floors', { name: 'Archivo', template: 'hq' })).data.floor.id;
  });
  after(async () => { await srv?.stop(); });

  test('solo un admin lo archiva; no se puede archivar el último piso visible', async () => {
    assert.equal((await ana.patch(`/floors/${hq}`, { adminOnly: true })).status, 403);
    assert.equal((await admin.patch(`/floors/${hq}`, { adminOnly: true })).status, 200);
    assert.equal((await admin.patch(`/floors/${main}`, { adminOnly: true })).status, 400);
    assert.equal((await admin.del(`/floors/${main}`)).status, 400);
  });

  test('un miembro no lo ve en la lista ni lo puede abrir; el admin sí', async () => {
    const mine = (await ana.get('/floors')).data.floors;
    assert.deepEqual(mine.map((f) => f.id), [main]);
    assert.equal((await ana.get(`/floors/${hq}`)).status, 404);
    const all = (await admin.get('/floors')).data.floors;
    assert.deepEqual(all.map((f) => [f.id, f.adminOnly]), [[main, false], [hq, true]]);
    assert.equal((await admin.get(`/floors/${hq}`)).status, 200);
    // Tampoco puede reclamar un escritorio ni poner objetos ahí
    const desk = composeFloor((await admin.get(`/floors/${hq}`)).data.floor).desks[0];
    assert.equal((await ana.post(`/desks/${desk.id}/claim`)).status, 404);
    assert.equal((await ana.post(`/floors/${hq}/objects`, { type: 'floorPlant', x: 50, y: 30 })).status, 404);
  });

  test('un miembro no puede ir; el admin sí, y nadie de fuera ve dónde está', async () => {
    const sa = await connect(srv.url, admin);
    const sb = await connect(srv.url, ana);
    try {
      const floorsSeen = [];
      sb.on('floors', (m) => floorsSeen.push(m.floors.map((f) => f.id)));
      const moves = [], players = [];
      sb.on('move', (m) => { if (m.id === admin.user.id) moves.push(m); });
      sb.on('player', (m) => { if (m.id === admin.user.id) players.push(m); });
      // El miembro intenta teletransportarse: el servidor lo regresa a donde estaba
      const back = new Promise((r) => sb.on('player', (m) => { if (m.id === ana.user.id) r(m); }));
      sb.emit('move', { floorId: hq, x: 42, y: 53, dir: 'down', tp: true });
      const me = await back;
      assert.equal(me.floorId, main);
      // El admin sí entra; al miembro solo le llega que está conectado, sin piso ni posición
      sa.emit('move', { floorId: hq, x: 42, y: 53, dir: 'down', tp: true });
      await wait(200);
      sa.emit('move', { floorId: hq, x: 42, y: 52, dir: 'up' });
      await wait(200);
      assert.equal(moves.length, 0, 'no recibe movimientos dentro del piso archivado');
      assert.ok(players.length >= 1);
      assert.equal(players.at(-1).floorId, null);
      assert.equal(players.at(-1).x, null);
      const users = (await ana.get('/users')).data.users;
      assert.equal(users.find((u) => u.id === admin.user.id).floorId, null);
      assert.equal((await admin.get('/users')).data.users.find((u) => u.id === admin.user.id).floorId, hq);
      // Al reconectarse, la lista de presencia también viene sin su ubicación
      const sc = await connect(srv.url, ana);
      assert.equal(sc.hello.players[admin.user.id].floorId, null);
      sc.disconnect();
      // Al volver al piso principal lo ve de nuevo
      sa.emit('move', { floorId: main, x: 42, y: 53, dir: 'down', tp: true });
      await wait(200);
      assert.equal(moves.at(-1)?.floorId, main);
      // Desarchivar: la lista nueva le llega al miembro con el piso
      assert.equal((await admin.patch(`/floors/${hq}`, { adminOnly: false })).status, 200);
      await wait(200);
      assert.deepEqual(floorsSeen.at(-1), [main, hq]);
      // Archivar con alguien dentro: el miembro sale a la entrada del piso principal
      sb.emit('move', { floorId: hq, x: 42, y: 53, dir: 'down', tp: true });
      await wait(200);
      const out = new Promise((r) => sb.on('player', (m) => { if (m.id === ana.user.id && m.floorId === main) r(m); }));
      assert.equal((await admin.patch(`/floors/${hq}`, { adminOnly: true })).status, 200);
      await out;
      await wait(100);
      assert.deepEqual(floorsSeen.at(-1), [main]);
    } finally {
      sa.disconnect(); sb.disconnect();
    }
  });
});

describe('migración de una oficina ya creada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-recreativo-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('crea la Oficina recreativa primero, archiva el HQ y se puede repetir sin duplicar', async () => {
    // 1) Una oficina "vieja": solo el piso HQ, un escritorio reclamado y Ana guardada ahí
    let srv = await startServer({ env: { DATA_DIR: dir } });
    let ana, deskId, hqId;
    try {
      const admin = await adminClient(srv.url);
      ana = await createMember(srv.url, admin, 'Ana');
      hqId = (await admin.post('/floors', { name: 'Piso 1', template: 'hq' })).data.floor.id;
      const p = (await admin.get(`/floors/${hqId}`)).data.floor;
      deskId = composeFloor(p).desks[0].id;
      assert.equal((await ana.post(`/desks/${deskId}/claim`)).status, 200);
    } finally { await srv.stop(); }
    {
      const db = new DatabaseSync(path.join(dir, 'office.db'));
      db.exec('PRAGMA foreign_keys = ON');
      db.prepare("DELETE FROM floors WHERE template = 'recreativo'").run();
      db.prepare('UPDATE floors SET sort = 1').run();
      db.prepare("DELETE FROM settings WHERE key = 'migr_recreativo_v1'").run();
      db.prepare('UPDATE users SET floor_id = ?, pos_x = 10, pos_y = 14 WHERE id = ?').run(hqId, ana.user.id);
      db.close();
    }
    // 2) Arranca con la versión nueva: se migra
    const check = async () => {
      const admin = await adminClient(srv.url);
      const floors = (await admin.get('/floors')).data.floors;
      assert.equal(floors.filter((f) => f.template === 'recreativo').length, 1);
      assert.equal(floors[0].template, 'recreativo');
      assert.equal(floors[0].name, 'Oficina');
      const hq = floors.find((f) => f.id === hqId);
      assert.equal(hq.adminOnly, true);
      assert.equal(hq.name, 'Oficina HQ (archivo)');
      const p = (await admin.get(`/floors/${hqId}`)).data.floor;
      assert.equal(p.claims[deskId], ana.user.id, 'el escritorio sigue reclamado');
      const m = await createMember(srv.url, admin, 'Memo');
      assert.deepEqual((await m.get('/floors')).data.floors.map((f) => f.id), [floors[0].id]);
      return floors[0].id;
    };
    srv = await startServer({ env: { DATA_DIR: dir } });
    let mainId;
    try {
      mainId = await check();
      // Ana tenía su lugar en el HQ: aparece en la entrada de la oficina nueva
      const a2 = new Client(srv.url);
      assert.equal((await a2.login(ana.user.username, 'secreto123')).status, 200);
      const s = await connect(srv.url, a2);
      const me = s.hello.players[ana.user.id];
      s.disconnect();
      assert.equal(me.floorId, mainId);
      const t = getTemplate('recreativo');
      assert.deepEqual([me.x, me.y], [t.spawn.x, t.spawn.y]);
    } finally { await srv.stop(); }
    // 3) Otra vez (y aunque se borre la marca): no duplica ni vuelve a renombrar
    {
      const db = new DatabaseSync(path.join(dir, 'office.db'));
      db.prepare("DELETE FROM settings WHERE key = 'migr_recreativo_v1'").run();
      db.close();
    }
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      assert.equal(await check(), mainId);
    } finally { await srv.stop(); }
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      assert.equal(await check(), mainId);
      // Las migraciones de HQ no tocan la oficina nueva
      const admin = await adminClient(srv.url);
      const p = (await admin.get(`/floors/${mainId}`)).data.floor;
      const tpl = getTemplate('recreativo').objects;
      for (const type of ['stage', 'stageMic', 'jukebox', 'hotelElevator', 'reception']) assert.equal(p.objects.filter((o) => o.type === type).length, tpl.filter((o) => o.type === type).length, type);
    } finally { await srv.stop(); }
  });
});
