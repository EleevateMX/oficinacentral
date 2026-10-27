// Resumen automático de reuniones con IA ("📝 Tomar notas").
// Es opcional y visible para toda la sala: alguien de dentro lo activa, cada navegador
// transcribe SOLO el micrófono de su propia persona (Web Speech API) y manda los
// fragmentos ya finales. Al apagarlo (o si la sala se queda vacía más de un minuto)
// el servidor pide a Claude un resumen y lo deja en el chat de quienes participaron.
// La transcripción vive solo en memoria y se descarta al terminar.
import { db, getSetting } from './db.js';
import { getFloor } from './world.js';
import { areaAt } from '../shared/map.js';
import { presence, emitToUser, emitAll } from './realtime.js';
import { postMessage } from './api.js';

const MAX_CHARS = 60_000; // tope de la transcripción por reunión
const MAX_SEGMENT = 1000;
const MIN_CHARS = 20; // menos que esto no vale la pena resumir
const MAX_SESSION_MS = 4 * 3600e3;
const idleMs = () => Number(process.env.NOTES_IDLE_MS) || 60e3; // sala vacía por más de esto → se cierra
const PER_USER_HOUR = 8;
const GLOBAL_HOUR = 40;

// areaId -> { areaId, floorId, name, by, startedAt, segments:[{uid,name,text,at}], chars, participants:Set, emptySince }
const sessions = new Map();
const summaryTimes = []; // marcas de tiempo de resúmenes pedidos (global)
const userSummaryTimes = new Map(); // userId -> [ts]

const hasKey = () => !!process.env.ANTHROPIC_API_KEY;
const settingOn = () => getSetting('ai_notes') !== '0';
export const notesAvailable = () => hasKey() && settingOn();

// Lo que ve el cliente en /api/config
export function notesConfig() {
  return { aiNotes: settingOn(), aiNotesReady: hasKey() };
}

const userName = (id) => db.prepare('SELECT display_name FROM users WHERE id = ?').get(id)?.display_name || 'Alguien';

// Sala (área privada o cerrada) donde está alguien
function roomOf(userId) {
  const p = presence.get(userId);
  const f = p && getFloor(p.floorId)?.state;
  const a = f && areaAt(f, p.x, p.y);
  return a && (a.private || a.closed) ? { floorId: p.floorId, area: a } : null;
}

function peopleIn(floorId, areaId) {
  const ids = [];
  const f = getFloor(floorId)?.state;
  if (!f) return ids;
  for (const [id, q] of presence) if (q.floorId === floorId && areaAt(f, q.x, q.y)?.id === areaId) ids.push(id);
  return ids;
}

const publicSession = (s) => ({ areaId: s.areaId, floorId: s.floorId, by: s.by, startedAt: s.startedAt });
export const activeNotes = () => [...sessions.values()].map(publicSession);

function broadcast(s, on, extra = {}) {
  emitAll('notes:state', { ...publicSession(s), on, ...extra });
}

// Apagar todo sin resumir (p. ej. el admin desactivó la función)
export function stopAllNotes() {
  for (const s of [...sessions.values()]) {
    sessions.delete(s.areaId);
    broadcast(s, false, { reason: 'disabled' });
  }
}

function finish(s, reason, byUserId = null) {
  if (sessions.get(s.areaId) !== s) return;
  sessions.delete(s.areaId);
  broadcast(s, false, { reason, stoppedBy: byUserId });
  summarize(s).catch((e) => console.error('[notas] error inesperado:', e?.message || e));
}

const pad = (n) => String(n).padStart(2, '0');
const clock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };

export function buildTranscript(s) {
  const names = [...s.participants].map(userName);
  const lines = s.segments.map((g) => `[${clock(g.at - s.startedAt)}] ${g.name}: ${g.text}`);
  return `Sala: ${s.name}\nParticipantes: ${names.join(', ')}\n\nTranscripción:\n${lines.join('\n')}`;
}

export const SYSTEM_PROMPT = [
  'Eres un asistente que resume reuniones de trabajo de una comunidad de roleplay de GTA (staff, organizaciones y soporte).',
  'Recibirás la transcripción automática de una reunión en español; cada línea indica el minuto y quién habló. El reconocimiento de voz puede tener errores: interpreta con sentido común.',
  'Escribe un resumen conciso en español de México, en texto plano (sin #, sin ** ni tablas), con exactamente este formato:',
  '',
  '<Título corto de la reunión>',
  '',
  'Resumen',
  '• (de 3 a 6 viñetas con lo más importante)',
  '',
  'Acuerdos',
  '• (decisiones tomadas)',
  '',
  'Pendientes',
  '— Persona: tarea (usa el nombre de quien se comprometió; si no se menciona, escribe "Sin asignar")',
  '',
  'Temas abiertos',
  '• (lo que quedó sin resolver)',
  '',
  'Si una sección no tiene contenido escribe "• Ninguno". No inventes nada que no esté en la transcripción.',
].join('\n');

function allowSummary(userId) {
  const t = Date.now();
  const recent = (arr) => { while (arr.length && t - arr[0] > 3600e3) arr.shift(); return arr; };
  const mine = recent(userSummaryTimes.get(userId) || []);
  recent(summaryTimes);
  if (mine.length >= PER_USER_HOUR || summaryTimes.length >= GLOBAL_HOUR) return false;
  mine.push(t);
  summaryTimes.push(t);
  userSummaryTimes.set(userId, mine);
  return true;
}

async function callClaude(transcript) {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const r = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-sonnet-5-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`La API respondió ${r.status}`);
  const data = await r.json();
  const text = (data?.content || []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n').trim();
  if (!text) throw new Error('Respuesta vacía');
  return text.slice(0, 8000);
}

const dmKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

async function summarize(s) {
  const starter = s.by;
  if (s.chars < MIN_CHARS) {
    emitToUser(starter, 'notes:empty', { areaId: s.areaId, name: s.name });
    return;
  }
  if (!hasKey()) return;
  if (!allowSummary(starter)) {
    emitToUser(starter, 'notes:error', { areaId: s.areaId, message: 'Se alcanzó el límite de resúmenes por hora. Intenta más tarde.' });
    return;
  }
  let summary;
  try {
    summary = await callClaude(buildTranscript(s));
  } catch (e) {
    // Nunca se registra la llave: solo el motivo
    console.error('[notas] no se pudo generar el resumen:', e?.name === 'TimeoutError' ? 'tiempo de espera agotado' : e?.message);
    emitToUser(starter, 'notes:error', { areaId: s.areaId, message: 'No se pudo generar el resumen' });
    return;
  }
  deliver(s, summary);
}

// Entrega: un mensaje directo de quien activó las notas a cada participante.
// Así cada quien lo tiene en su chat (y quien lo activó, en sus conversaciones con ellos),
// sin publicar el contenido de una sala privada en un canal que ve toda la oficina.
function deliver(s, summary) {
  let sender = db.prepare('SELECT * FROM users WHERE id = ?').get(s.by);
  const ids = [...s.participants].filter((id) => db.prepare('SELECT 1 FROM users WHERE id = ?').get(id));
  if (!sender) sender = ids.length ? db.prepare('SELECT * FROM users WHERE id = ?').get(ids[0]) : null;
  if (!sender) return;
  const recipients = ids.filter((id) => id !== sender.id);
  if (!recipients.length) {
    emitToUser(sender.id, 'notes:error', { areaId: s.areaId, message: 'No se pudo entregar el resumen: no hubo más participantes' });
    return;
  }
  const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60e3));
  const names = ids.map(userName).join(', ');
  const body = `📝 Resumen de la reunión en ${s.name}\n${mins} min · ${names}\n\n${summary}\n\n— Generado con IA a partir de lo que se dijo con "Tomar notas" activo. Puede tener errores.`;
  for (const id of recipients) {
    const key = dmKey(sender.id, id);
    postMessage(sender, { dm: key, otherId: id, key: `d:${key}` }, body, 'notes');
    emitToUser(id, 'notes:summary', { areaId: s.areaId, name: s.name, conv: `d:${sender.id}` });
  }
  emitToUser(sender.id, 'notes:summary', { areaId: s.areaId, name: s.name, conv: `d:${recipients[0]}`, count: recipients.length });
}

export function initNotes(io, socket, userId) {
  socket.emit('notes:list', { sessions: activeNotes() });

  socket.on('notes:start', (m) => {
    const here = roomOf(userId);
    if (!notesAvailable() || !here || here.area.id !== Number(m?.areaId) || sessions.has(here.area.id)) return;
    const people = peopleIn(here.floorId, here.area.id);
    if (people.length < 2) return;
    const s = {
      areaId: here.area.id, floorId: here.floorId, name: here.area.name, by: userId, startedAt: Date.now(),
      segments: [], chars: 0, participants: new Set(people), emptySince: null,
    };
    sessions.set(s.areaId, s);
    broadcast(s, true);
  });

  socket.on('notes:stop', (m) => {
    const s = sessions.get(Number(m?.areaId));
    if (!s) return;
    if (s.by !== userId && roomOf(userId)?.area.id !== s.areaId) return; // solo quien está dentro (o quien lo activó)
    finish(s, 'stopped', userId);
  });

  let times = [];
  socket.on('notes:segment', (m) => {
    const here = roomOf(userId);
    const s = here && sessions.get(here.area.id);
    if (!s || s.floorId !== here.floorId) return;
    const p = presence.get(userId);
    if (!p?.mic) return; // solo se transcribe con el micrófono encendido
    const text = String(m?.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEGMENT);
    if (!text) return;
    const t = Date.now();
    times = times.filter((x) => t - x < 60e3);
    if (times.length >= 40) return;
    times.push(t);
    if (s.chars + text.length > MAX_CHARS) {
      if (!s.full) { s.full = true; emitToUser(s.by, 'notes:full', { areaId: s.areaId }); }
      return;
    }
    s.participants.add(userId);
    s.segments.push({ uid: userId, name: userName(userId), text, at: t });
    s.chars += text.length;
  });
}

// Revisión periódica: quién sigue en la sala y si se quedó vacía
export function startNotesTimer() {
  const tick = () => {
    const t = Date.now();
    for (const s of [...sessions.values()]) {
      const people = peopleIn(s.floorId, s.areaId);
      for (const id of people) s.participants.add(id);
      if (t - s.startedAt > MAX_SESSION_MS) { finish(s, 'timeout'); continue; }
      if (people.length) { s.emptySince = null; continue; }
      s.emptySince ??= t;
      if (t - s.emptySince >= idleMs()) finish(s, 'empty');
    }
  };
  setInterval(tick, Math.min(2000, Math.max(200, idleMs() / 4))).unref();
}
