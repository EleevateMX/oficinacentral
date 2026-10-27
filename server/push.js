// Notificaciones push (Web Push con VAPID): llegan al teléfono o la computadora
// aunque la app esté cerrada.
//
// API para el resto del servidor:
//   registerPushRoutes(router)  rutas /push/* (ya autenticadas)
//   pushNotification(...)       se llama desde notify(): saludos, invitaciones, menciones
//   pushMessage(...)            se llama al crear un mensaje de chat (DM o canal)
//   startPushScheduler()        recordatorios del calendario (5 min antes y al empezar)
//
// Regla para no duplicar avisos: solo se manda push si la persona no tiene la app
// abierta (sin socket conectado) o si todas sus pestañas avisaron que están ocultas
// (evento de socket 'visibility', ver realtime.js).
import webpush from 'web-push';
import { db, now, getSetting, setSetting } from './db.js';
import { presence } from './realtime.js';

db.exec(`
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_ok INTEGER
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS push_reminders (
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id, kind, starts_at)
);
`);

// ---------- Llaves VAPID ----------
let vapid = null;

export function vapidKeys() {
  if (vapid) return vapid;
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    // Sin variables de entorno: se generan una vez y se guardan en la base de datos
    publicKey = getSetting('vapid_public_key');
    privateKey = getSetting('vapid_private_key');
    if (!publicKey || !privateKey) {
      ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
      setSetting('vapid_public_key', publicKey);
      setSetting('vapid_private_key', privateKey);
    }
  }
  const subject = process.env.VAPID_SUBJECT
    || (process.env.ADMIN_EMAIL ? `mailto:${process.env.ADMIN_EMAIL}` : 'mailto:notificaciones@nuvora.app');
  vapid = { publicKey, privateKey, subject };
  return vapid;
}

// Solo para pruebas: permite usar un agente HTTPS que acepte un certificado propio.
let transport = {};
export function configurePush(opts = {}) {
  transport = { ...transport, ...opts };
}

// ---------- Envío ----------
const subRow = (r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } });

export async function sendToSubscription(row, payload) {
  const { publicKey, privateKey, subject } = vapidKeys();
  try {
    await webpush.sendNotification(subRow(row), JSON.stringify(payload), {
      vapidDetails: { subject, publicKey, privateKey },
      TTL: payload.ttl ?? 3600,
      urgency: payload.urgency || 'high',
      topic: payload.tag ? String(payload.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined : undefined,
      timeout: 10000,
      ...(transport.agent ? { agent: transport.agent } : {}),
    });
    db.prepare('UPDATE push_subscriptions SET last_ok = ? WHERE id = ?').run(now(), row.id);
    return { ok: true };
  } catch (e) {
    // 404/410: la suscripción ya no existe (desinstalaron la app, quitaron el permiso…)
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      return { ok: false, gone: true, status: e.statusCode };
    }
    return { ok: false, status: e?.statusCode || 0, error: e?.message || String(e) };
  }
}

export async function sendToUser(userId, payload) {
  const u = db.prepare('SELECT disabled FROM users WHERE id = ?').get(userId);
  if (!u || u.disabled) return [];
  const rows = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  return Promise.all(rows.map((r) => sendToSubscription(r, payload)));
}

// ¿La persona está mirando la app ahora mismo? Si sí, ya ve el aviso dentro de ella.
export function isAttending(userId) {
  const p = presence.get(userId);
  if (!p || !p.sockets?.size) return false;
  for (const s of p.sockets) if (!s.data?.hidden) return true;
  return false;
}

const hasSubs = (userId) => !!db.prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1').get(userId);

function notifPrefs(userId) {
  const r = db.prepare('SELECT prefs FROM users WHERE id = ?').get(userId);
  let p = {};
  try { p = JSON.parse(r?.prefs || '{}')?.notifications || {}; } catch { /* prefs dañadas */ }
  return { remind5: true, remindStart: true, chat: 'dms', ...p };
}

// Envía sin bloquear a quien llama; los errores solo se registran.
function pushLater(userId, payload) {
  if (isAttending(userId) || !hasSubs(userId)) return;
  sendToUser(userId, payload).catch((e) => console.error('[push]', e?.message || e));
}

const displayName = (id) => db.prepare('SELECT display_name FROM users WHERE id = ?').get(id)?.display_name || 'Alguien';
const clip = (s, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const channelName = (id) => db.prepare('SELECT name FROM channels WHERE id = ?').get(id)?.name || 'canal';

function fmtWhen(ts, userId) {
  const tz = db.prepare('SELECT timezone FROM users WHERE id = ?').get(userId)?.timezone || 'America/Mexico_City';
  try {
    return new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts);
  } catch {
    return new Date(ts).toISOString();
  }
}

// Avisos de notify() (tabla notifications)
export function pushNotification(userId, type, actorId, data = {}) {
  try {
    const who = displayName(actorId);
    if (type === 'wave') {
      pushLater(userId, { title: `${who} te saludó 👋`, body: 'Toca para responder', tag: `wave-${actorId}`, url: `/?conv=d:${actorId}` });
    } else if (type === 'event') {
      pushLater(userId, { title: `📅 ${who} te invitó a un evento`, body: `"${data.title}" · ${fmtWhen(data.startsAt, userId)}`, tag: `event-${data.eventId}`, url: '/?view=calendar' });
    } else if (type === 'mention') {
      if (notifPrefs(userId).chat === 'none') return;
      const ch = /^c:(\d+)$/.exec(data.conv || '');
      pushLater(userId, {
        title: `${who} te mencionó${ch ? ` en #${channelName(Number(ch[1]))}` : ''}`,
        body: clip(data.preview || ''),
        tag: `conv-${String(data.conv || '').replace(':', '-')}`,
        url: ch ? `/?conv=${data.conv}` : '/',
      });
    }
  } catch (e) {
    console.error('[push]', e?.message || e);
  }
}

const MENTION = /@([a-zA-Z0-9_.-]{3,24})/g;

// Mensajes de chat. Las menciones se avisan por pushNotification (tipo 'mention').
export function pushMessage(sender, msg, { channelId = null, otherId = null } = {}) {
  try {
    if (msg.kind === 'wave') return; // el saludo tiene su propio aviso
    const body = msg.kind === 'text' ? clip(msg.body) : 'Te envió un mensaje';
    if (otherId) {
      if (notifPrefs(otherId).chat === 'none') return;
      pushLater(otherId, { title: sender.display_name, body, tag: `conv-d-${sender.id}`, url: `/?conv=d:${sender.id}` });
      return;
    }
    if (!channelId) return;
    const mentioned = new Set([...String(msg.body).matchAll(MENTION)].map((m) => m[1].toLowerCase()));
    const name = channelName(channelId);
    // Solo quienes eligieron "Todos los mensajes nuevos" y tienen algún dispositivo suscrito
    const rows = db.prepare(`SELECT DISTINCT u.id, u.username FROM users u JOIN push_subscriptions s ON s.user_id = u.id
      WHERE u.id != ? AND u.disabled = 0`).all(sender.id);
    for (const r of rows) {
      if (mentioned.has(String(r.username).toLowerCase())) continue;
      if (notifPrefs(r.id).chat !== 'all') continue;
      pushLater(r.id, { title: `#${name} · ${sender.display_name}`, body, tag: `conv-c-${channelId}`, url: `/?conv=c:${channelId}` });
    }
  } catch (e) {
    console.error('[push]', e?.message || e);
  }
}

// ---------- Recordatorios del calendario ----------
const sentKeys = new Set(); // copia en memoria de push_reminders (evita consultas repetidas)

export function _resetReminderMemory() {
  sentKeys.clear();
}

function claimReminder(eventId, userId, kind, startsAt, t) {
  const key = `${eventId}:${userId}:${kind}:${startsAt}`;
  if (sentKeys.has(key)) return false;
  sentKeys.add(key);
  // INSERT OR IGNORE: si ya estaba guardado (p. ej. antes de reiniciar), no se repite
  const r = db.prepare('INSERT OR IGNORE INTO push_reminders (event_id, user_id, kind, starts_at, sent_at) VALUES (?, ?, ?, ?, ?)')
    .run(eventId, userId, kind, startsAt, t);
  return r.changes > 0;
}

// Revisa los eventos y manda los recordatorios que toquen. Devuelve las promesas de envío.
export function runReminders(t = now()) {
  const jobs = [];
  const events = db.prepare('SELECT * FROM events WHERE starts_at > ? AND starts_at <= ?').all(t - 60e3, t + 5 * 60e3);
  for (const e of events) {
    const attendees = db.prepare('SELECT user_id FROM event_attendees WHERE event_id = ?').all(e.id).map((a) => a.user_id);
    // Igual que en el cliente: sin invitados, el evento es para toda la oficina
    const recipients = attendees.length
      ? [...new Set([...attendees, e.created_by])]
      : db.prepare('SELECT id FROM users WHERE disabled = 0').all().map((u) => u.id);
    const until = e.starts_at - t;
    const kind = until > 0 ? '5' : '0';
    for (const uid of recipients) {
      if (!hasSubs(uid)) continue;
      const p = notifPrefs(uid);
      if (kind === '5' ? !p.remind5 : !p.remindStart) continue;
      if (!claimReminder(e.id, uid, kind, e.starts_at, t)) continue;
      if (isAttending(uid)) continue; // la app abierta ya muestra su propio aviso
      const mins = Math.max(1, Math.round(until / 60e3));
      const payload = kind === '5'
        ? { title: `📅 ${e.title}`, body: `Empieza en ${mins} minuto${mins === 1 ? '' : 's'}${e.location ? ` · ${e.location}` : ''}`, tag: `remind-${e.id}`, url: '/?view=calendar', ttl: 300 }
        : { title: `📅 ${e.title}`, body: `Está empezando${e.location ? ` · ${e.location}` : ''}`, tag: `remind-${e.id}`, url: '/?view=calendar', ttl: 300 };
      jobs.push(sendToUser(uid, payload).catch((err) => console.error('[push]', err?.message || err)));
    }
  }
  return jobs;
}

let timer = null;
export function startPushScheduler(everyMs = Number(process.env.PUSH_TICK_MS) || 30e3) {
  if (timer) return;
  timer = setInterval(() => {
    try {
      runReminders();
      // Limpieza de recordatorios viejos
      db.prepare('DELETE FROM push_reminders WHERE starts_at < ?').run(now() - 2 * 864e5);
      if (sentKeys.size > 5000) sentKeys.clear();
    } catch (e) {
      console.error('[push]', e?.message || e);
    }
  }, everyMs);
  timer.unref();
}

// ---------- Rutas (montadas después de requireAuth) ----------
function readSubscription(b) {
  const s = b?.subscription || b;
  const endpoint = String(s?.endpoint || '');
  const p256dh = String(s?.keys?.p256dh || '');
  const auth = String(s?.keys?.auth || '');
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || endpoint.length > 1000) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

export function registerPushRoutes(router) {
  router.get('/push/key', (req, res) => {
    res.json({ publicKey: vapidKeys().publicKey });
  });

  router.post('/push/subscribe', (req, res) => {
    const s = readSubscription(req.body);
    if (!s) return res.status(400).json({ error: 'Suscripción inválida' });
    // El mismo dispositivo puede cambiar de cuenta: la suscripción pasa a quien la registra
    db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(req.user.id, s.endpoint, s.p256dh, s.auth, now());
    const n = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(req.user.id).n;
    res.json({ ok: true, devices: n });
  });

  router.post('/push/unsubscribe', (req, res) => {
    const endpoint = String(req.body?.endpoint || req.body?.subscription?.endpoint || '');
    const r = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.user.id);
    res.json({ ok: true, removed: r.changes });
  });

  // Aviso de prueba a todos los dispositivos de quien lo pide (aunque tenga la app abierta)
  router.post('/push/test', async (req, res, next) => {
    try {
      const results = await sendToUser(req.user.id, { title: 'Nuvora', body: 'Las notificaciones de este dispositivo funcionan ✅', tag: 'test', url: '/' });
      res.json({ sent: results.filter((r) => r.ok).length, total: results.length });
    } catch (e) {
      next(e);
    }
  });
}
