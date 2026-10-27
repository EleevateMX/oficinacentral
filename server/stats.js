// Estadísticas de uso (para administradores): minutos en línea por persona y día,
// minutos por sala, y contadores pequeños (bailes, abrazos) para los logros.
// Todo se acumula en memoria y se escribe a la base de datos cada minuto y al desconectarse.
// Los días se cuentan en la zona de la oficina (OFFICE_TIMEZONE, por defecto Ciudad de México).
import { db, now } from './db.js';
import { shiftReport } from './shifts.js';

db.exec(`
CREATE TABLE IF NOT EXISTS stats_daily (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  online_min REAL NOT NULL DEFAULT 0,
  flags INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_stats_daily_day ON stats_daily(day);
CREATE TABLE IF NOT EXISTS area_usage (
  day TEXT NOT NULL,
  area_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, area_id, user_id)
);
CREATE TABLE IF NOT EXISTS user_counters (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key)
);
`);

// Banderas por día: 1 = se conectó de madrugada (4:00–7:59), 2 = de noche (23:00–3:59)
export const FLAG_EARLY = 1;
export const FLAG_NIGHT = 2;

// ---------- Fechas en la zona de la oficina ----------
export const officeTZ = () => process.env.OFFICE_TIMEZONE || 'America/Mexico_City';
const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }));
  }
  return fmtCache.get(tz);
}
const WEEKDAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function localParts(at = now(), tz = officeTZ()) {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAYS[p.weekday] ?? 0 };
}

// Medianoche (en la zona de la oficina) de un día 'YYYY-MM-DD' → milisegundos
export function zonedMidnight(day, tz = officeTZ()) {
  const [y, m, d] = day.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 2; i++) {
    const p = localParts(t, tz);
    const [ly, lm, ld] = p.day.split('-').map(Number);
    const asUTC = Date.UTC(ly, lm - 1, ld, p.hour, p.minute);
    t -= asUTC - Date.UTC(y, m - 1, d);
  }
  return t;
}

export const addDays = (day, n) => new Date(Date.UTC(...day.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0))) + n * 864e5).toISOString().slice(0, 10);

// Lunes 00:00 de la semana de `at` (zona de la oficina)
export function weekStart(at = now(), tz = officeTZ()) {
  const p = localParts(at, tz);
  const day = addDays(p.day, -p.weekday);
  return { day, at: zonedMidnight(day, tz) };
}

// ---------- Seguimiento en memoria ----------
const live = new Map(); // userId -> { at, areaId }
const pendDaily = new Map(); // `${uid}|${day}` -> { min, flags }
const pendArea = new Map(); // `${day}|${areaId}|${uid}` -> min
const pendCount = new Map(); // `${uid}|${key}` -> n

function flagsAt(hour) {
  return (hour >= 4 && hour < 8 ? FLAG_EARLY : 0) | (hour >= 23 || hour < 4 ? FLAG_NIGHT : 0);
}

function addDaily(uid, day, min, flags) {
  const k = `${uid}|${day}`;
  const cur = pendDaily.get(k) || { min: 0, flags: 0 };
  cur.min += min;
  cur.flags |= flags;
  pendDaily.set(k, cur);
}

// Suma el tiempo desde el último corte (máximo 15 min por si el servidor estuvo dormido)
function accrue(uid, at) {
  const s = live.get(uid);
  if (!s) return;
  const min = Math.max(0, Math.min(15, (at - s.at) / 60e3));
  s.at = at;
  const { day, hour } = localParts(at);
  addDaily(uid, day, min, flagsAt(hour));
  if (s.areaId && min > 0) {
    const k = `${day}|${s.areaId}|${uid}`;
    pendArea.set(k, (pendArea.get(k) || 0) + min);
  }
}

export function trackConnect(uid, areaId = null, at = now()) {
  if (live.has(uid)) accrue(uid, at);
  live.set(uid, { at, areaId: areaId || null });
  const { day, hour } = localParts(at);
  addDaily(uid, day, 0, flagsAt(hour));
}

export function trackArea(uid, areaId = null, at = now()) {
  const s = live.get(uid);
  if (!s || s.areaId === (areaId || null)) return;
  accrue(uid, at);
  s.areaId = areaId || null;
}

export function trackDisconnect(uid, at = now()) {
  accrue(uid, at);
  live.delete(uid);
  flush(at);
}

export function bumpCounter(uid, key, n = 1) {
  const k = `${uid}|${key}`;
  pendCount.set(k, (pendCount.get(k) || 0) + n);
}

const insDaily = db.prepare(`INSERT INTO stats_daily (user_id, day, online_min, flags) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, day) DO UPDATE SET online_min = online_min + excluded.online_min, flags = flags | excluded.flags`);
const insArea = db.prepare(`INSERT INTO area_usage (day, area_id, user_id, minutes) VALUES (?, ?, ?, ?)
  ON CONFLICT(day, area_id, user_id) DO UPDATE SET minutes = minutes + excluded.minutes`);
const insCount = db.prepare(`INSERT INTO user_counters (user_id, key, n) VALUES (?, ?, ?)
  ON CONFLICT(user_id, key) DO UPDATE SET n = n + excluded.n`);

// Escribe lo acumulado (primero corta el tiempo de quienes siguen conectados)
export function flush(at = now()) {
  for (const uid of live.keys()) accrue(uid, at);
  if (!pendDaily.size && !pendArea.size && !pendCount.size) return;
  const safe = (fn) => { try { fn(); } catch { /* la persona ya no existe */ } };
  db.exec('BEGIN');
  try {
    for (const [k, v] of pendDaily) { const [uid, day] = k.split('|'); safe(() => insDaily.run(Number(uid), day, v.min, v.flags)); }
    for (const [k, v] of pendArea) { const [day, area, uid] = k.split('|'); safe(() => insArea.run(day, Number(area), Number(uid), v)); }
    for (const [k, v] of pendCount) { const i = k.indexOf('|'); safe(() => insCount.run(Number(k.slice(0, i)), k.slice(i + 1), v)); }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  pendDaily.clear();
  pendArea.clear();
  pendCount.clear();
}

setInterval(() => { try { flush(); } catch (e) { console.error('[stats]', e.message); } }, 60e3).unref();

export const counter = (uid, key) => db.prepare('SELECT n FROM user_counters WHERE user_id = ? AND key = ?').get(uid, key)?.n || 0;

// ---------- Reporte para administradores ----------
export function statsReport({ days = 7, inactiveDays = 14, at = now() } = {}) {
  flush(at);
  const today = localParts(at).day;
  const fromDay = addDays(today, -(days - 1));
  const fromAt = zonedMidnight(fromDay);
  const users = db.prepare('SELECT id, display_name, username, role, last_active, created_at FROM users WHERE disabled = 0').all();

  const online = new Map(db.prepare(`SELECT user_id, SUM(online_min) AS min, SUM(online_min > 0 OR flags > 0) AS days
    FROM stats_daily WHERE day >= ? GROUP BY user_id`).all(fromDay).map((r) => [r.user_id, r]));
  const shift = new Map();
  for (const r of shiftReport(fromAt, at)) {
    const cur = shift.get(r.userId) || { min: 0, days: 0 };
    cur.min += r.minutes;
    cur.days = Math.max(cur.days, r.days);
    shift.set(r.userId, cur);
  }

  const rows = users.map((u) => ({
    userId: u.id,
    name: u.display_name,
    username: u.username,
    role: u.role,
    onlineMin: Math.round(online.get(u.id)?.min || 0),
    shiftMin: Math.round(shift.get(u.id)?.min || 0),
    days: Math.max(online.get(u.id)?.days || 0, shift.get(u.id)?.days || 0),
    lastActive: u.last_active || null,
  })).sort((a, b) => b.onlineMin - a.onlineMin || b.shiftMin - a.shiftMin || a.name.localeCompare(b.name, 'es'));

  const rooms = db.prepare(`SELECT u.area_id AS areaId, a.name, SUM(u.minutes) AS minutes, COUNT(DISTINCT u.user_id) AS people
    FROM area_usage u LEFT JOIN areas a ON a.id = u.area_id
    WHERE u.day >= ? GROUP BY u.area_id HAVING SUM(u.minutes) >= 1 ORDER BY minutes DESC LIMIT 12`).all(fromDay)
    .map((r) => ({ areaId: r.areaId, name: r.name || 'Sala eliminada', minutes: Math.round(r.minutes), people: r.people }));

  const byDay = new Map(db.prepare(`SELECT day, COUNT(*) AS people, SUM(online_min) AS min FROM stats_daily
    WHERE day >= ? AND (online_min > 0 OR flags > 0) GROUP BY day`).all(fromDay).map((r) => [r.day, r]));
  const daily = Array.from({ length: days }, (_, i) => {
    const day = addDays(fromDay, i);
    return { day, people: byDay.get(day)?.people || 0, minutes: Math.round(byDay.get(day)?.min || 0) };
  });

  const cutoff = at - inactiveDays * 864e5;
  const inactive = users.filter((u) => (u.last_active || 0) < cutoff)
    .map((u) => ({ userId: u.id, name: u.display_name, lastActive: u.last_active || null, createdAt: u.created_at }))
    .sort((a, b) => (a.lastActive || 0) - (b.lastActive || 0));

  return {
    from: fromAt, to: at, days, inactiveDays,
    totals: {
      people: users.length,
      active: rows.filter((r) => r.days > 0 || r.onlineMin > 0).length,
      onlineMin: rows.reduce((s, r) => s + r.onlineMin, 0),
      shiftMin: rows.reduce((s, r) => s + r.shiftMin, 0),
      topRoom: rooms[0] || null,
    },
    rows, rooms, daily, inactive,
  };
}

// ---------- Rutas (dentro del router de administradores, ya con requireAdmin) ----------
export function registerStatsRoutes(admin) {
  // Al apagar: guardar lo acumulado (corre antes del cierre de server/index.js)
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { flush(); } catch { /* base cerrada */ } });
  admin.get('/stats', (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
    const inactiveDays = [7, 14, 30].includes(Number(req.query.inactive)) ? Number(req.query.inactive) : 14;
    res.json(statsReport({ days, inactiveDays }));
  });
}
