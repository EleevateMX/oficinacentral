// Hotel: salas temáticas de la comunidad (Charla General, Roleplay, League of Legends…), marca
// "MeDed Friends" / "HUB" sin restos de la marca vieja, poco logo y migración de las salas viejas en su lugar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { io } from 'socket.io-client';
import { startServer, adminClient, ROOT } from './helpers/server.js';
import { ROOM_MODELS } from '../shared/hotel.js';
import { HOTEL_FURNI, HOTEL_CATS, HOTEL_LINES } from '../shared/hotelCatalog.js';
import { OFFICIAL_ROOMS, FLAGSHIP_KEY, LEGACY_OFFICIAL_KEYS, officialKey, planOfficialRoom } from '../shared/hotelOfficialRooms.js';
import { greeting, receptionReply, BOT_SPECS } from '../server/hotelMechanics.js';

const OLD = 'GTA' + 'HUB'; // la marca vieja (armada para que este archivo no la contenga)

test('temas: existen las salas pedidas y Charla General es la de entrada', () => {
  const names = OFFICIAL_ROOMS.map((r) => r.name);
  for (const n of ['Charla General', 'Roleplay', 'League of Legends']) assert.ok(names.includes(n), n);
  assert.equal(OFFICIAL_ROOMS[0].key, FLAGSHIP_KEY);
  assert.equal(OFFICIAL_ROOMS[0].name, 'Charla General');
  assert.ok(OFFICIAL_ROOMS.length >= 6);
  assert.equal(new Set(OFFICIAL_ROOMS.map((r) => r.key)).size, OFFICIAL_ROOMS.length, 'claves únicas');
  // Las claves viejas migran a una sala nueva (ninguna queda huérfana) y no chocan con las nuevas
  for (const old of ['hq', 'juntas', 'juegos', 'jardin', 'comedor']) {
    assert.ok(LEGACY_OFFICIAL_KEYS[old], `${old} migra`);
    assert.ok(!OFFICIAL_ROOMS.some((r) => r.key === old));
  }
  assert.equal(officialKey('hq'), 'charla');
  assert.equal(officialKey('lol'), 'lol');
  // Cada sala oficial tiene su modelo y se acomoda sin errores
  for (const spec of OFFICIAL_ROOMS) {
    assert.ok(ROOM_MODELS[spec.model]?.official, spec.model);
    assert.deepEqual(planOfficialRoom(spec).errors, [], spec.key);
  }
  // Bots: Rita en Charla General, Beto en Roleplay; ninguno en salas que ya no existen
  assert.equal(BOT_SPECS[FLAGSHIP_KEY][0].role, 'reception');
  assert.equal(BOT_SPECS.roleplay[0].role, 'bartender');
  for (const k of Object.keys(BOT_SPECS)) assert.ok(OFFICIAL_ROOMS.some((r) => r.key === k), `bot en ${k}`);
  assert.match(greeting('Ana'), /Charla General/);
  assert.match(receptionReply('hotel'), /MeDed Friends/);
});

test('marca: nada visible dice la marca vieja y el logo se usa poco', () => {
  const visible = [
    ...HOTEL_FURNI.map((f) => f.name), ...HOTEL_CATS.map((c) => c.name), ...HOTEL_LINES.flatMap((l) => [l.name, l.desc]),
    ...OFFICIAL_ROOMS.flatMap((r) => [r.name, r.description]), ...Object.values(ROOM_MODELS).map((m) => m.name),
    greeting('X'),
    ...['ayuda', 'hotel', 'juegos', 'salas', 'roleplay', 'karaoke'].map((t) => receptionReply(t) || ''),
  ];
  for (const s of visible) assert.ok(!s.includes(OLD), s);
  assert.equal(HOTEL_CATS.find((c) => c.id === 'gtahub').name, 'HUB');
  // Ni en el código del Hotel (textos, letreros dibujados en los furnis, la torre de la llegada)
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|jsx|css)$/.test(e.name)) files.push(p); } };
  walk(path.join(ROOT, 'client/src/hotel'));
  walk(path.join(ROOT, 'shared/hotelLines'));
  for (const d of ['server', 'shared']) for (const f of fs.readdirSync(path.join(ROOT, d))) if (/^hotel.*\.js$/.test(f)) files.push(path.join(ROOT, d, f));
  assert.ok(files.length > 30);
  for (const f of files) assert.ok(!fs.readFileSync(f, 'utf8').includes(OLD), path.relative(ROOT, f));
  // Ids viejos intactos (los inventarios siguen sirviendo)
  for (const id of ['gtahub_rug', 'gtahub_statue', 'gtahub_car', 'poster_gtahub', 'neon_sign', 'throne']) assert.ok(HOTEL_FURNI.some((f) => f.id === id), id);
  // Piezas con la marca: ninguna en las salas temáticas y a lo mucho una en el Lobby VIP
  const LOGO = new Set(['gtahub_rug', 'gtahub_statue', 'poster_gtahub', 'neon_sign', 'hub_neon_wall', 'hub_flag']);
  for (const spec of OFFICIAL_ROOMS) {
    const n = spec.items.filter((i) => LOGO.has(i.type)).length;
    assert.ok(n <= (spec.key === 'vip' ? 1 : 0), `${spec.key}: ${n} piezas de logo`);
  }
});

// ---------- Migración en producción ----------
let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv?.stop(); });

const connect = (c) => new Promise((resolve, reject) => {
  const s = io(srv.url, { extraHeaders: { cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  s.on('hello', () => resolve(s));
  s.on('connect_error', reject);
});
const once = (s, ev, ms = 4000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timeout esperando ${ev}`)), ms);
  s.once(ev, (m) => { clearTimeout(t); resolve(m); });
});
async function restart(dataDir, patch) {
  srv.child.kill('SIGTERM');
  await new Promise((r) => srv.child.once('exit', r));
  if (patch) {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(dataDir, 'office.db'));
    patch(db);
    db.close();
  }
  const next = await startServer({ env: { DATA_DIR: dataDir } });
  const prevStop = srv.stop;
  srv = { ...next, dataDir, stop: async () => { await next.stop(); await prevStop(); } };
}
const OLD_ROOMS = { charla: ['hq', 'Oficina Central'], roleplay: ['comedor', 'Comedor'], minecraft: ['jardin', 'Jardín'], musica: ['juegos', 'Sala de juegos'], cine: ['juntas', 'Sala de juntas'] };

test('migración: las salas viejas se vuelven las temáticas en su lugar, sin duplicar ni dejar huérfanas', async () => {
  const admin = await adminClient(srv.url);
  const promo = (await admin.get('/hotel/promo')).data.promo;
  assert.match(promo.title, /MeDed Friends/);
  assert.ok(![promo.title, promo.text, promo.button].join(' ').includes(OLD));
  const first = (await admin.get('/hotel/rooms?tab=official')).data.rooms;
  assert.deepEqual(first.map((r) => r.officialKey), OFFICIAL_ROOMS.map((r) => r.key));
  const idOf = Object.fromEntries(first.map((r) => [r.officialKey, r.id]));
  const dataDir = srv.dataDir;

  // Base de datos "como en producción antes del cambio": claves, nombres y modelos viejos, sin las salas nuevas,
  // con un furni de un admin en un lugar que sí existe y otro donde el mapa nuevo ya no tiene piso, más una oficial
  // cuya clave ya no existe.
  let keptId, lostId, orphanId;
  await restart(dataDir, (db) => {
    for (const [key, [old, name]] of Object.entries(OLD_ROOMS)) {
      db.prepare('UPDATE hotel_rooms SET official_key = ?, name = ?, model = ?, description = ? WHERE id = ?').run(old, name, old, 'vieja', idOf[key]);
    }
    for (const key of ['lol', 'fps']) {
      db.prepare('DELETE FROM hotel_items WHERE room_id = ?').run(idOf[key]);
      db.prepare('DELETE FROM hotel_rooms WHERE id = ?').run(idOf[key]);
    }
    const owner = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get().id;
    const ins = db.prepare("INSERT INTO hotel_items (owner_id, room_id, type, x, y, z, rot, state, extra, created_at) VALUES (?, ?, 'plant_small', ?, ?, 1, 0, 0, '{}', 1)");
    keptId = Number(ins.run(owner, idOf.charla, 20, 15).lastInsertRowid);
    lostId = Number(ins.run(owner, idOf.charla, 28, 22).lastInsertRowid);
    orphanId = Number(db.prepare("INSERT INTO hotel_rooms (owner_id, name, description, model, access, official, official_key, created_at, updated_at) VALUES (?, 'Vieja', '', 'a', 'open', 9, 'piscina', 1, 1)").run(owner).lastInsertRowid);
    db.prepare("INSERT INTO hotel_items (owner_id, room_id, type, x, y, z, rot, state, extra, created_at) VALUES (?, ?, 'chair_basic', 2, 2, 0, 0, 0, '{\"official\":\"piscina\"}', 1)").run(owner, orphanId);
    db.prepare("UPDATE settings SET value = '1' WHERE key = 'hotel_official_v'").run();
  });

  const check = async () => {
    const a = await adminClient(srv.url);
    const rooms = (await a.get('/hotel/rooms?tab=official')).data.rooms;
    assert.deepEqual(rooms.map((r) => r.officialKey), OFFICIAL_ROOMS.map((r) => r.key), 'mismas salas, en orden');
    assert.deepEqual(rooms.map((r) => r.name), OFFICIAL_ROOMS.map((r) => r.name), 'nombres nuevos');
    for (const key of Object.keys(OLD_ROOMS)) assert.equal(rooms.find((r) => r.officialKey === key).id, idOf[key], `${key}: misma sala (en su lugar)`);
    const s = await connect(a);
    const counts = {};
    try {
      for (const r of rooms) {
        const p = once(s, 'hotel:room');
        s.emit('hotel:enter', { roomId: r.id });
        const snap = await p;
        const spec = OFFICIAL_ROOMS.find((o) => o.key === r.officialKey);
        assert.equal(snap.room.model, spec.model);
        const seeds = snap.items.filter((i) => i.id !== keptId);
        assert.equal(seeds.length, planOfficialRoom(spec).items.length, `${r.officialKey}: sembrada sin duplicar`);
        counts[r.id] = snap.items.length;
      }
      const charla = rooms.find((r) => r.officialKey === 'charla');
      const p = once(s, 'hotel:room');
      s.emit('hotel:enter', { roomId: charla.id });
      const snap = await p;
      assert.ok(snap.items.some((i) => i.id === keptId), 'lo del admin que cabe se queda');
      assert.ok(!snap.items.some((i) => i.id === lostId));
    } finally { s.close(); }
    // Lo que ya no cabe regresa al inventario del admin; la oficial huérfana vuelve a ser sala normal
    assert.ok((await a.get('/hotel/inventory')).data.items.some((i) => i.id === lostId), 'regresa al inventario');
    const orphan = (await a.get(`/hotel/rooms/${orphanId}`)).data.room;
    assert.equal(orphan.official, false);
    assert.equal(orphan.officialKey, null);
    return counts;
  };
  const counts = await check();
  // Idempotente: otro reinicio (y otra vuelta de la siembra a la fuerza) no cambia nada
  await restart(dataDir, (db) => db.prepare("UPDATE settings SET value = '0' WHERE key = 'hotel_official_v'").run());
  assert.deepEqual(await check(), counts);
});
