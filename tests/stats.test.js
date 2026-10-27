// Estadísticas de uso, logros e insignias, y ranking semanal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';
import { startServer, adminClient, createMember } from './helpers/server.js';

// Las pruebas de módulo usan su propia base de datos temporal
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-stats-'));
process.env.DATA_DIR = dataDir;
process.env.OFFICE_TIMEZONE = 'America/Mexico_City';
const { db } = await import('../server/db.js');
const stats = await import('../server/stats.js');
const ach = await import('../server/achievements.js');

const mkUser = (name, createdAt = Date.now()) => Number(db.prepare("INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, 'x', ?)").run(name, name, createdAt).lastInsertRowid);

let srv;
before(async () => { srv = await startServer(); });
after(async () => {
  await srv?.stop();
  try { db.close(); } catch { /* ya cerrada */ }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('fechas en la zona de la oficina: medianoche y lunes', () => {
  // 2026-10-27 (martes) 10:00 en Ciudad de México = 16:00 UTC
  const at = Date.UTC(2026, 9, 27, 16, 0);
  assert.equal(stats.localParts(at).day, '2026-10-27');
  assert.equal(stats.zonedMidnight('2026-10-27'), Date.UTC(2026, 9, 27, 6, 0));
  const ws = stats.weekStart(at);
  assert.equal(ws.day, '2026-10-26');
  assert.equal(ws.at, Date.UTC(2026, 9, 26, 6, 0));
  // Domingo en la noche todavía es la misma semana; el lunes 00:00 empieza otra
  assert.equal(stats.weekStart(Date.UTC(2026, 10, 2, 5, 59)).day, '2026-10-26');
  assert.equal(stats.weekStart(Date.UTC(2026, 10, 2, 6, 0)).day, '2026-11-02');
});

test('se acumulan minutos en línea y por sala, con banderas de madrugada', () => {
  const uid = mkUser('acum');
  // 6:00 en Ciudad de México (12:00 UTC): cuenta como madrugador
  const t0 = Date.UTC(2026, 9, 27, 12, 0);
  stats.trackConnect(uid, 101, t0);
  stats.trackArea(uid, 102, t0 + 10 * 60e3);
  stats.flush(t0 + 12 * 60e3);
  stats.trackArea(uid, null, t0 + 20 * 60e3);
  stats.trackDisconnect(uid, t0 + 25 * 60e3);
  const d = db.prepare('SELECT * FROM stats_daily WHERE user_id = ?').get(uid);
  assert.equal(d.day, '2026-10-27');
  assert.ok(Math.abs(d.online_min - 25) < 0.01, `minutos en línea: ${d.online_min}`);
  assert.equal(d.flags & stats.FLAG_EARLY, stats.FLAG_EARLY);
  const areas = Object.fromEntries(db.prepare('SELECT area_id, minutes FROM area_usage WHERE user_id = ?').all(uid).map((r) => [r.area_id, r.minutes]));
  assert.ok(Math.abs(areas[101] - 10) < 0.01);
  assert.ok(Math.abs(areas[102] - 10) < 0.01);
  // Contadores (bailes) se escriben al vaciar
  stats.bumpCounter(uid, 'emote:dance', 3);
  stats.flush();
  assert.equal(stats.counter(uid, 'emote:dance'), 3);
  // El reporte los incluye
  const rep = stats.statsReport({ days: 7, inactiveDays: 7, at: t0 + 60 * 60e3 });
  const row = rep.rows.find((r) => r.userId === uid);
  assert.equal(row.onlineMin, 25);
  assert.equal(row.days, 1);
  assert.equal(rep.daily.length, 7);
  assert.equal(rep.daily.at(-1).day, '2026-10-27');
});

test('insignias: se ganan, suben de nivel y avisan una vez', () => {
  const uid = mkUser('bailarin', Date.now() - 40 * 864e5);
  // Primera revisión: silenciosa, pero un solo aviso con el resumen (Veterano por 40 días)
  let fresh = ach.checkAchievements(uid, { force: true });
  assert.deepEqual(fresh.map((f) => f.id), ['veteran']);
  let notes = db.prepare("SELECT data FROM notifications WHERE user_id = ? AND type = 'achievement'").all(uid);
  assert.equal(notes.length, 1);
  // 10 bailes → Alma de la fiesta (bronce)
  stats.bumpCounter(uid, 'emote:dance', 10);
  stats.flush();
  fresh = ach.checkAchievements(uid, { force: true });
  assert.deepEqual(fresh, [{ id: 'dance', tier: 1 }]);
  // Sin cambios: nada nuevo
  assert.deepEqual(ach.checkAchievements(uid, { force: true }), []);
  // 50 bailes → plata
  stats.bumpCounter(uid, 'emote:dance', 40);
  stats.flush();
  assert.deepEqual(ach.checkAchievements(uid, { force: true }), [{ id: 'dance', tier: 2 }]);
  notes = db.prepare("SELECT data FROM notifications WHERE user_id = ? AND type = 'achievement'").all(uid).map((n) => JSON.parse(n.data));
  assert.equal(notes.length, 3);
  assert.deepEqual(notes.at(-1), { id: 'dance', tier: 2 });
  // Victorias de ping pong y récord del arcade
  const other = mkUser('rival');
  const ins = db.prepare('INSERT INTO game_scores (user_id, game, score, created_at) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < 5; i++) ins.run(uid, 'pong', 1, Date.now());
  ins.run(uid, 'arcade', 900, Date.now());
  ins.run(other, 'arcade', 500, Date.now());
  const m = ach.computeMetrics(uid);
  assert.equal(m.pong, 5);
  assert.equal(m.arcade, 1);
  assert.equal(ach.computeMetrics(other).arcade, 0);
  const badges = ach.badgesFor(uid);
  assert.equal(badges.find((b) => b.id === 'dance').tier, 2);
  assert.equal(badges.find((b) => b.id === 'dance').goal, 200);
});

test('ranking semanal: puntos por horas, victorias, felicitaciones e insignias', () => {
  const at = Date.now();
  const ws = stats.weekStart(at);
  const a = mkUser('rank_a');
  const b = mkUser('rank_b');
  db.prepare('INSERT INTO stats_daily (user_id, day, online_min, flags) VALUES (?, ?, ?, 0)').run(a, ws.day, 185); // 3 h → 3 pts
  db.prepare('INSERT INTO stats_daily (user_id, day, online_min, flags) VALUES (?, ?, ?, 0)').run(a, stats.addDays(ws.day, -1), 600); // semana pasada: no cuenta
  db.prepare('INSERT INTO shift_log (user_id, shift, started_at, ended_at) VALUES (?, ?, ?, ?)').run(b, 'Soporte', ws.at + 60e3, ws.at + 60e3 + 2 * 36e5); // 2 h → 4 pts
  db.prepare('INSERT INTO game_scores (user_id, game, score, created_at) VALUES (?, ?, 1, ?)').run(b, 'pool', ws.at + 1000); // 3 pts
  db.prepare('INSERT INTO game_scores (user_id, game, score, created_at) VALUES (?, ?, 1, ?)').run(b, 'pool', ws.at - 1000); // semana pasada
  db.prepare("INSERT INTO birthday_wishes (user_id, from_id, year, text, created_at) VALUES (?, ?, 2026, 'hola', ?)").run(b, a, ws.at + 5000); // 5 pts
  db.prepare('INSERT INTO achievements (user_id, badge, tier, earned_at) VALUES (?, ?, 1, ?)').run(a, 'early', ws.at + 5000); // 10 pts
  const r = ach.weeklyPoints(at);
  const ra = r.rows.find((x) => x.userId === a);
  const rb = r.rows.find((x) => x.userId === b);
  assert.equal(ra.points, 3 + 5 + 10);
  assert.equal(rb.points, 4 + 3);
  assert.ok(ra.rank < rb.rank);
  assert.equal(r.weekStartDay, ws.day);
  // La semana siguiente empieza de cero (para estas dos personas)
  const next = ach.weeklyPoints(ws.at + 7 * 864e5 + 1000);
  assert.ok(!next.rows.some((x) => x.userId === a || x.userId === b));
});

test('estadísticas solo para administradores; se cuenta el tiempo de la conexión', async () => {
  const admin = await adminClient(srv.url);
  const ana = await createMember(srv.url, admin, 'Ana');
  assert.equal((await ana.get('/admin/stats')).status, 403);
  const s = io(srv.url, { extraHeaders: { cookie: [...ana.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, transports: ['websocket'] });
  await new Promise((resolve, reject) => { s.on('hello', resolve); s.on('connect_error', reject); });
  s.emit('emote', { kind: 'dance' });
  await new Promise((r) => setTimeout(r, 300));
  s.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  const r = await admin.get('/admin/stats?days=30&inactive=7');
  assert.equal(r.status, 200);
  assert.equal(r.data.days, 30);
  assert.equal(r.data.daily.length, 30);
  const row = r.data.rows.find((x) => x.userId === ana.user.id);
  assert.ok(row, 'Ana aparece en la tabla');
  assert.ok(row.lastActive > 0);
  // Logros: cualquiera puede ver los suyos y el ranking
  const mine = await ana.get(`/achievements/${ana.user.id}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.data.badges.find((b) => b.id === 'dance').value, 1);
  const rank = await ana.get('/achievements/ranking');
  assert.equal(rank.status, 200);
  assert.ok(Array.isArray(rank.data.top));
  assert.equal(rank.data.me.userId, ana.user.id);
  assert.equal((await ana.get('/achievements/999999')).status, 404);
});
