// Salas temáticas de la oficina recreativa (Charla General, Roleplay, League of Legends…),
// la migración que renueva la oficina ya creada y el cambio de marca GTAHUB → HUB.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember, Client, ROOT } from './helpers/server.js';
import { getTemplate, composeFloor, isWalkable, areaAt } from '../shared/map.js';
import { CATALOG } from '../shared/catalog.js';

const tpl = getTemplate('recreativo');
const floorOf = () => composeFloor({
  template: 'recreativo',
  areas: tpl.areas.map((a, i) => ({ ...a, id: i + 1 })),
  objects: tpl.objects.map((o, i) => ({ ...o, id: i + 1 })),
});

describe('salas temáticas', () => {
  test('existen Charla General, Roleplay y League of Legends', () => {
    const names = tpl.areas.map((a) => a.name);
    for (const want of ['Charla General', 'Roleplay', 'League of Legends']) assert.ok(names.includes(want), `falta ${want}`);
    for (const want of ['Valorant', 'Minecraft', 'Música y Karaoke', 'Cine y Anime', 'Stream', 'Arte y Diseño', 'Estudio / Tareas', 'Sala VIP 1:1', 'Torneos', 'Juegos', 'Café', 'Jardín', 'Recepción', 'Coworking'])
      assert.ok(names.includes(want), `falta ${want}`);
    assert.equal(new Set(names).size, names.length, 'sin nombres repetidos');
  });

  test('cada sala se ve de su tema', () => {
    const f = floorOf();
    const inArea = (name, type) => tpl.objects.filter((o) => o.type === type && areaAt(f, Math.floor(o.x), Math.floor(o.y))?.name === name);
    // Charla General: la sala grande para platicar, con sofás
    const charla = tpl.areas.find((a) => a.name === 'Charla General');
    assert.ok(charla.w * charla.h >= 300);
    assert.ok(inArea('Charla General', 'sofa').length + inArea('Charla General', 'lSofa').length + inArea('Charla General', 'sofaSmall').length >= 4);
    // Roleplay: taberna (chimenea, barriles y mesa larga)
    assert.ok(inArea('Roleplay', 'fireplace').length && inArea('Roleplay', 'barrel').length >= 2 && inArea('Roleplay', 'table').length);
    // League of Legends: PCs gamer y pantalla gigante
    assert.ok(inArea('League of Legends', 'gamingChair').length >= 10 && inArea('League of Legends', 'bigScreen').length);
    assert.ok(inArea('Minecraft', 'voxelBlock').length >= 4);
    // Valorant y Coworking: escritorios que se pueden reclamar
    assert.ok(f.desks.filter((d) => areaAt(f, d.object.x, d.object.y)?.name === 'Valorant').length >= 4);
    // Letreros con el nombre de las salas (no hay logos de juegos, solo texto)
    assert.ok(tpl.objects.filter((o) => o.type === 'roomSign').length >= 8);
  });

  test('las salas privadas siguen privadas y el e2e tiene dónde pararse', () => {
    for (const name of ['League of Legends', 'Roleplay', 'Arte y Diseño', 'Sala VIP 1:1', 'Stream', 'Cine y Anime'])
      assert.equal(tpl.areas.find((a) => a.name === name).private, true, name);
    const f = floorOf();
    for (const [x, y] of [[19, 55], [22, 55]]) {
      assert.ok(isWalkable(f, x, y));
      assert.equal(areaAt(f, x, y).name, 'Roleplay');
    }
  });

  test('marca discreta: sin piezas con logo salvo el neón HUB de la recepción', () => {
    const logoTypes = ['neonLogo', 'floorLogo', 'cubeLogo', 'poster', 'wallBanner', 'wavingFlag', 'flagPole', 'rollupBanner', 'brandWall', 'logoTotem', 'photocall', 'brandRug', 'hexLamp', 'hexNeon', 'hexBadge'];
    assert.deepEqual(tpl.objects.filter((o) => logoTypes.includes(o.type)).map((o) => o.type), []);
    for (const t of ['roomSign', 'neonHub', 'ringRug', 'neonGG', 'gamePoster', 'controllerRug', 'voxelBlock', 'barrel', 'fireplace']) assert.ok(CATALOG[t], t);
  });
});

describe('sin "GTAHUB" en la oficina', () => {
  // Se excluyen el Hotel (lo hace otro módulo) y los identificadores internos (tema 'gtahub', GTAHUB_LOGO)
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (/hotel/i.test(e.name)) continue;
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|css|html|json|webmanifest)$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ['client/src', 'server', 'shared']) walk(path.join(ROOT, d));
  files.push(path.join(ROOT, 'client/index.html'), path.join(ROOT, 'client/public/manifest.webmanifest'));

  test('ningún texto dice GTAHUB', () => {
    const bad = [];
    for (const f of files) {
      let src = fs.readFileSync(f, 'utf8');
      if (f.endsWith('.css')) src = src.replace(/\/\*[\s\S]*?\*\//g, ''); // comentarios de estilos
      src.split('\n').forEach((line, i) => { if (/\bGTAHUB\b/.test(line)) bad.push(`${path.relative(ROOT, f)}:${i + 1}`); });
    }
    assert.deepEqual(bad, []);
  });
});

describe('migración a las salas temáticas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-temas-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const OLD = {
    'Café': 'Cafetería', 'Jardín': 'Jardín y terraza', 'Estudio / Tareas': 'Biblioteca', 'League of Legends': 'Sala de juntas',
    Minecraft: 'Zona zen', Torneos: 'Auditorio', Juegos: 'Sala de juegos', 'Charla General': 'Lounge', 'Arte y Diseño': 'Sala creativa',
    Roleplay: 'Sala de ideas', 'Sala VIP 1:1': 'Sala 1:1', Stream: 'Estudio de stream', 'Cine y Anime': 'Cine', 'Música y Karaoke': 'Karaoke y música',
  };

  test('renueva la oficina con los nombres viejos, conserva escritorios y no toca el HQ archivado; se puede repetir', async () => {
    // 1) Una oficina "vieja": nombres de antes, un letrero con logo, Ana con escritorio y parada sobre un mueble
    let srv = await startServer({ env: { DATA_DIR: dir } });
    let ana, mainId, hqId, deskPos, hqBefore;
    try {
      const admin = await adminClient(srv.url);
      ana = await createMember(srv.url, admin, 'Ana');
      mainId = (await admin.get('/floors')).data.floors[0].id;
      hqId = (await admin.post('/floors', { name: 'Oficina HQ (archivo)', template: 'hq', adminOnly: true })).data.floor.id;
      const p = (await admin.get(`/floors/${mainId}`)).data.floor;
      const desk = composeFloor(p).desks.find((d) => areaAt(composeFloor(p), d.object.x, d.object.y)?.name === 'Coworking');
      deskPos = [desk.object.x, desk.object.y];
      assert.equal((await ana.post(`/desks/${desk.id}/claim`)).status, 200);
      const hq = (await admin.get(`/floors/${hqId}`)).data.floor;
      hqBefore = { areas: hq.areas.map((a) => a.name).sort(), objects: hq.objects.length };
      // El nombre de la oficina ya pasó a HUB (venía de OFFICE_NAME=GTAHUB)
      assert.equal((await admin.get('/config')).data.officeName, 'HUB');
    } finally { await srv.stop(); }
    {
      const db = new DatabaseSync(path.join(dir, 'office.db'));
      db.exec('PRAGMA foreign_keys = ON');
      const ren = db.prepare('UPDATE areas SET name = ? WHERE floor_id = ? AND name = ?');
      for (const [to, from] of Object.entries(OLD)) ren.run(from, mainId, to);
      db.prepare("DELETE FROM areas WHERE floor_id = ? AND name = 'Valorant'").run(mainId);
      db.prepare("INSERT INTO objects (floor_id, type, x, y, rot, created_at) VALUES (?, 'neonLogo', 67, 9.15, 0, 0)").run(mainId);
      db.prepare("DELETE FROM settings WHERE key = 'migr_recreativo_temas_v1'").run();
      db.prepare('UPDATE users SET floor_id = ?, pos_x = 70, pos_y = 14 WHERE id = ?').run(mainId, ana.user.id); // sobre la mesa
      db.close();
    }
    const check = async () => {
      const admin = await adminClient(srv.url);
      const p = (await admin.get(`/floors/${mainId}`)).data.floor;
      const names = p.areas.map((a) => a.name).sort();
      assert.deepEqual(names, tpl.areas.map((a) => a.name).sort());
      assert.equal(p.objects.filter((o) => o.type === 'neonLogo').length, 0);
      assert.equal(p.objects.filter((o) => o.deskId == null).length, tpl.objects.length);
      const f = composeFloor(p);
      const mine = f.desks.find((d) => p.claims[d.id] === ana.user.id);
      assert.ok(mine, 'Ana conserva su escritorio');
      assert.deepEqual([mine.object.x, mine.object.y], deskPos, 'en el mismo lugar');
      const hq = (await admin.get(`/floors/${hqId}`)).data.floor;
      assert.deepEqual({ areas: hq.areas.map((a) => a.name).sort(), objects: hq.objects.length }, hqBefore, 'el HQ archivado no cambia');
      assert.equal(hq.adminOnly, true);
      return p;
    };
    srv = await startServer({ env: { DATA_DIR: dir } });
    let first;
    try {
      first = await check();
      // La posición guardada de Ana quedó sobre un mueble: al entrar aparece en una casilla libre
      const a2 = new Client(srv.url);
      assert.equal((await a2.login(ana.user.username, 'secreto123')).status, 200);
      const s = await new Promise((resolve, reject) => {
        const so = io(srv.url, { extraHeaders: { cookie: [...a2.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
        so.on('hello', (h) => { so.hello = h; resolve(so); });
        so.on('connect_error', reject);
      });
      const me = s.hello.players[ana.user.id];
      s.disconnect();
      assert.equal(me.floorId, mainId);
      assert.ok(isWalkable(composeFloor(first), me.x, me.y), `aparece en una casilla libre (${me.x},${me.y})`);
    } finally { await srv.stop(); }
    // 2) Otra vez, aunque se borre la marca: mismo resultado
    {
      const db = new DatabaseSync(path.join(dir, 'office.db'));
      db.prepare("DELETE FROM settings WHERE key = 'migr_recreativo_temas_v1'").run();
      db.close();
    }
    srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const again = await check();
      assert.equal(again.objects.length, first.objects.length);
      assert.deepEqual(again.areas.map((a) => [a.id, a.name]), first.areas.map((a) => [a.id, a.name]), 'las áreas conservan su id');
      // El nombre de la oficina se puede volver a cambiar y no se pisa al reiniciar
      const admin = await adminClient(srv.url);
      assert.equal((await admin.get('/config')).data.officeName, 'HUB');
    } finally { await srv.stop(); }
  });
});
