// Logros e insignias (definidos en shared/achievements.js) y ranking semanal.
// Los números se calculan con datos que ya existen (turnos, juegos, cumpleaños, chat, objetos)
// y con los contadores de server/stats.js. Se revisa cada pocos minutos a quienes están
// conectados, al desconectarse y cuando alguien abre sus logros.
import { db, now } from './db.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, tierFor, progressFor, WEEKLY_POINTS } from '../shared/achievements.js';
import { flush, FLAG_EARLY, FLAG_NIGHT, counter, weekStart, addDays, localParts } from './stats.js';
import { shiftReport } from './shifts.js';
import { presence, emitToUser, emitAll } from './realtime.js';
import { pushNotification } from './push.js';

db.exec(`
CREATE TABLE IF NOT EXISTS achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  tier INTEGER NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge)
);
CREATE TABLE IF NOT EXISTS achievement_checks (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  checked_at INTEGER NOT NULL
);
`);

// ---------- Números de cada insignia ----------
export function computeMetrics(uid, at = now()) {
  const one = (sql, ...a) => Object.values(db.prepare(sql).get(...a) || {})[0] || 0;
  const u = db.prepare('SELECT created_at FROM users WHERE id = ?').get(uid);
  if (!u) return null;
  const wins = Object.fromEntries(db.prepare("SELECT game, COUNT(*) AS n FROM game_scores WHERE user_id = ? AND game != 'arcade' GROUP BY game").all(uid).map((r) => [r.game, r.n]));
  const best = one("SELECT MAX(score) FROM game_scores WHERE game = 'arcade'");
  const mine = one("SELECT MAX(score) FROM game_scores WHERE game = 'arcade' AND user_id = ?", uid);
  return {
    shift: Math.floor(one('SELECT SUM(MAX(0, COALESCE(ended_at, ?) - started_at)) FROM shift_log WHERE user_id = ?', at, uid) / 36e5),
    online: Math.floor(one('SELECT SUM(online_min) FROM stats_daily WHERE user_id = ?', uid) / 60),
    early: one('SELECT COUNT(*) FROM stats_daily WHERE user_id = ? AND (flags & ?) != 0', uid, FLAG_EARLY),
    night: one('SELECT COUNT(*) FROM stats_daily WHERE user_id = ? AND (flags & ?) != 0', uid, FLAG_NIGHT),
    pong: wins.pong || 0,
    pool: wins.pool || 0,
    foosball: wins.foosball || 0,
    arcade: best > 0 && mine === best ? 1 : 0,
    bday: one('SELECT COUNT(*) FROM birthday_wishes WHERE from_id = ?', uid),
    dance: counter(uid, 'emote:dance'),
    hugs: counter(uid, 'emote:hug') + counter(uid, 'emote:highfive'),
    social: one("SELECT COUNT(DISTINCT dm_key) FROM messages WHERE user_id = ? AND dm_key IS NOT NULL AND kind != 'wave'", uid),
    explorer: one('SELECT COUNT(DISTINCT area_id) FROM area_usage WHERE user_id = ? AND minutes >= 1', uid),
    decor: one('SELECT COUNT(*) FROM objects WHERE created_by = ?', uid),
    veteran: Math.floor((at - u.created_at) / 864e5),
  };
}

// Insignias guardadas + progreso actual
export function badgesFor(uid, metrics = computeMetrics(uid)) {
  const earned = new Map(db.prepare('SELECT badge, tier, earned_at FROM achievements WHERE user_id = ?').all(uid).map((r) => [r.badge, r]));
  return ACHIEVEMENTS.map((a) => {
    const value = metrics?.[a.id] || 0;
    const e = earned.get(a.id);
    const p = progressFor(a, value);
    return { id: a.id, value, tier: Math.max(e?.tier || 0, p.tier), earnedAt: e?.earned_at || null, goal: p.goal, pct: p.pct };
  });
}

// Revisa y guarda niveles nuevos. La primera revisión de cada persona es silenciosa
// (para no llenar de avisos a quien ya tenía historial) y manda un solo aviso con el resumen.
const lastCheck = new Map();
export function checkAchievements(uid, { at = now(), force = false } = {}) {
  if (!force && at - (lastCheck.get(uid) || 0) < 30e3) return [];
  lastCheck.set(uid, at);
  const metrics = computeMetrics(uid, at);
  if (!metrics) return [];
  const first = !db.prepare('SELECT 1 FROM achievement_checks WHERE user_id = ?').get(uid);
  const earned = new Map(db.prepare('SELECT badge, tier FROM achievements WHERE user_id = ?').all(uid).map((r) => [r.badge, r.tier]));
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    const tier = tierFor(a, metrics[a.id] || 0);
    if (tier > (earned.get(a.id) || 0)) fresh.push({ id: a.id, tier });
  }
  const up = db.prepare(`INSERT INTO achievements (user_id, badge, tier, earned_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, badge) DO UPDATE SET tier = excluded.tier, earned_at = excluded.earned_at`);
  for (const f of fresh) up.run(uid, f.id, f.tier, at);
  db.prepare('INSERT INTO achievement_checks (user_id, checked_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET checked_at = excluded.checked_at').run(uid, at);
  if (fresh.length) award(uid, fresh, first);
  return fresh;
}

function award(uid, fresh, first) {
  // La más difícil primero (nivel más alto)
  const top = [...fresh].sort((a, b) => b.tier - a.tier)[0];
  const list = first ? [{ ...top, count: fresh.length }] : fresh.map((f) => ({ ...f, count: 1 }));
  for (const f of list) {
    const data = { id: f.id, tier: f.tier, ...(f.count > 1 ? { count: f.count } : {}) };
    const nid = Number(db.prepare('INSERT INTO notifications (user_id, type, actor_id, data, created_at) VALUES (?, ?, NULL, ?, ?)')
      .run(uid, 'achievement', JSON.stringify(data), now()).lastInsertRowid);
    emitToUser(uid, 'notification', { id: nid, type: 'achievement', actorId: null, data, read: false, createdAt: now() });
    pushNotification(uid, 'achievement', null, data);
  }
  // Pequeña celebración que ven todos: una medalla sobre su personaje
  emitAll('react', { id: uid, emoji: ACHIEVEMENT_BY_ID[top.id]?.emoji || '🏅' });
  emitAll('achievement', { userId: uid, id: top.id, tier: top.tier });
  rankingCache = null;
}

// Cada 5 minutos: quienes están conectados
setInterval(() => {
  try {
    flush();
    for (const uid of presence.keys()) checkAchievements(uid);
  } catch (e) { console.error('[logros]', e.message); }
}, 5 * 60e3).unref();

// ---------- Ranking semanal (se reinicia el lunes a las 00:00, hora de la oficina) ----------
let rankingCache = null;
export function weeklyPoints(at = now()) {
  const ws = weekStart(at);
  const fromDay = ws.day;
  const from = ws.at;
  const users = db.prepare('SELECT id FROM users WHERE disabled = 0').all();
  const map = new Map(users.map((u) => [u.id, { userId: u.id, onlineMin: 0, shiftMin: 0, wins: 0, wishes: 0, badges: 0 }]));
  const get = (id) => map.get(id);
  for (const r of db.prepare('SELECT user_id, SUM(online_min) AS m FROM stats_daily WHERE day >= ? GROUP BY user_id').all(fromDay)) if (get(r.user_id)) get(r.user_id).onlineMin = r.m;
  for (const r of shiftReport(from, at)) if (get(r.userId)) get(r.userId).shiftMin += r.minutes;
  for (const r of db.prepare("SELECT user_id, COUNT(*) AS n FROM game_scores WHERE game != 'arcade' AND created_at >= ? GROUP BY user_id").all(from)) if (get(r.user_id)) get(r.user_id).wins = r.n;
  for (const r of db.prepare('SELECT from_id, COUNT(*) AS n FROM birthday_wishes WHERE created_at >= ? GROUP BY from_id').all(from)) if (get(r.from_id)) get(r.from_id).wishes = r.n;
  for (const r of db.prepare('SELECT user_id, COUNT(*) AS n FROM achievements WHERE earned_at >= ? GROUP BY user_id').all(from)) if (get(r.user_id)) get(r.user_id).badges = r.n;
  const P = WEEKLY_POINTS;
  const rows = [...map.values()].map((r) => {
    const onlineMin = Math.round(r.onlineMin);
    const points = Math.floor(onlineMin / 60) * P.onlineHour + Math.floor(r.shiftMin / 60) * P.shiftHour + r.wins * P.win + r.wishes * P.wish + r.badges * P.badge;
    return { ...r, onlineMin, points };
  }).filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points || b.onlineMin - a.onlineMin || a.userId - b.userId);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { weekStart: from, weekStartDay: fromDay, weekEndDay: addDays(fromDay, 6), resetsAt: weekStart(at).at + 7 * 864e5, rows };
}

export function ranking(uid, at = now()) {
  if (!rankingCache || at - rankingCache.at > 60e3 || weekStart(at).day !== rankingCache.data.weekStartDay) {
    flush(at);
    rankingCache = { at, data: weeklyPoints(at) };
  }
  const { rows, ...rest } = rankingCache.data;
  return { ...rest, points: WEEKLY_POINTS, top: rows.slice(0, 10), me: rows.find((r) => r.userId === uid) || { userId: uid, points: 0, rank: null, onlineMin: 0, shiftMin: 0, wins: 0, wishes: 0, badges: 0 }, total: rows.length };
}

// ---------- Rutas (ya autenticadas) ----------
export function registerAchievementRoutes(api) {
  api.get('/achievements/ranking', (req, res) => res.json(ranking(req.user.id)));
  api.get('/achievements/:userId', (req, res) => {
    const uid = Number(req.params.userId);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) return res.status(404).json({ error: 'No existe' });
    if (uid === req.user.id) { flush(); checkAchievements(uid); }
    res.json({ userId: uid, badges: badgesFor(uid), day: localParts().day });
  });
}
