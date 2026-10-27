// Historial de turnos: cuánto tiempo pasa cada quien "En turno" y en cuál.
// Un periodo se abre al entrar en turno (o al conectarse estando en turno)
// y se cierra al salir de turno o al desconectarse.
import { db, now } from './db.js';

db.exec(`
CREATE TABLE IF NOT EXISTS shift_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shift_log_user ON shift_log(user_id, started_at);
`);

// Al arrancar, cerrar periodos que quedaron abiertos (el servidor se reinició)
// (se toma la última actividad guardada de la persona, que se guarda cada minuto)
db.prepare(`UPDATE shift_log SET ended_at = MAX(started_at, COALESCE((SELECT last_active FROM users WHERE users.id = shift_log.user_id), started_at))
  WHERE ended_at IS NULL`).run();

export function closeShift(userId, at = now()) {
  db.prepare('UPDATE shift_log SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL').run(at, userId);
}

export function openShift(userId, shift, at = now()) {
  closeShift(userId, at);
  if (shift) db.prepare('INSERT INTO shift_log (user_id, shift, started_at) VALUES (?, ?, ?)').run(userId, shift, at);
}

// Al conectarse: si sigue marcado en turno, se reabre el periodo
export function onConnect(user) {
  if (user.shift && !db.prepare('SELECT 1 FROM shift_log WHERE user_id = ? AND ended_at IS NULL').get(user.id)) openShift(user.id, user.shift);
}

// Horas por persona y turno entre dos fechas (los periodos se recortan al rango)
export function shiftReport(from, to) {
  const rows = db.prepare(`SELECT l.user_id, l.shift, l.started_at, COALESCE(l.ended_at, ?) AS ended_at, u.display_name
    FROM shift_log l JOIN users u ON u.id = l.user_id
    WHERE l.started_at < ? AND COALESCE(l.ended_at, ?) > ?`).all(now(), to, now(), from);
  const map = new Map();
  for (const r of rows) {
    const ms = Math.max(0, Math.min(r.ended_at, to) - Math.max(r.started_at, from));
    if (ms < 60e3) continue;
    const key = `${r.user_id}|${r.shift}`;
    const cur = map.get(key) || { userId: r.user_id, name: r.display_name, shift: r.shift, minutes: 0, sessions: 0, days: new Set() };
    cur.minutes += ms / 60e3;
    cur.sessions += 1;
    cur.days.add(new Date(Math.max(r.started_at, from)).toISOString().slice(0, 10));
    map.set(key, cur);
  }
  return [...map.values()].map((x) => ({ ...x, minutes: Math.round(x.minutes), days: x.days.size }))
    .sort((a, b) => b.minutes - a.minutes);
}
