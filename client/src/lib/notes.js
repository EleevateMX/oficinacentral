// Resumen de reuniones con IA ("📝 Tomar notas"): estado compartido y transcripción local.
// Cada navegador transcribe SOLO tu micrófono (Web Speech API) mientras las notas están
// activas en tu sala y tu micro está encendido; manda al servidor los fragmentos finales.
import { areaAt } from '@shared/map.js';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const speechSupported = () => !!SR;

// ¿La oficina permite la función y el servidor tiene llave?
export const notesEnabled = (config) => !!(config?.aiNotes && config?.aiNotesReady);

// Sesión de notas activa en un área (o null)
export const notesIn = (state, areaId) => (areaId != null && state.notes?.[areaId]) || null;

// Para las etiquetas de nombre: ¿esta persona está en una sala con notas activas?
export function inNotesRoom(state, f, p) {
  const n = state.notes;
  if (!n || !f || !p) return false;
  let any = false;
  for (const k in n) if (n[k].floorId === f.id) { any = true; break; }
  if (!any) return false;
  const a = areaAt(f, p.x, p.y);
  return !!(a && n[a.id] && n[a.id].floorId === f.id);
}

function myAreaId(office) {
  const f = office.state.floor;
  const me = office.myPlayer;
  return f && me && me.floorId === f.id ? areaAt(f, me.x, me.y)?.id ?? null : null;
}

const who = (office, id) => (id === office.state.me?.id ? 'Tú' : office.state.users[id]?.displayName || 'Alguien');

export function bindNotes(office, s) {
  const setNotes = (fn) => office.set((st) => ({ notes: fn({ ...(st.notes || {}) }) }));
  s.on('notes:list', ({ sessions = [] } = {}) => {
    const map = {};
    for (const x of sessions) map[x.areaId] = x;
    office.set({ notes: map });
  });
  s.on('notes:state', (m) => {
    const meId = office.state.me?.id;
    const here = myAreaId(office) === m.areaId;
    setNotes((n) => { if (m.on) n[m.areaId] = { areaId: m.areaId, floorId: m.floorId, by: m.by, startedAt: m.startedAt }; else delete n[m.areaId]; return n; });
    if (m.on) {
      if (here && m.by !== meId) {
        office.toast({
          title: `📝 ${who(office, m.by)} activó "Tomar notas": se transcribe lo que se dice en la sala para hacer un resumen`,
          action: { label: 'Apagar', run: () => stopNotes(office, m.areaId) },
          duration: 9000,
        });
      }
    } else if (here || m.by === meId) {
      if (m.reason === 'disabled') office.toast({ title: '📝 Un admin desactivó las notas con IA' });
      else if (m.stoppedBy !== meId) office.toast({ title: m.reason === 'stopped' ? `📝 ${who(office, m.stoppedBy)} dejó de tomar notas` : '📝 Se dejaron de tomar notas' });
    }
  });
  s.on('notes:summary', ({ conv }) => {
    office.toast({
      title: '📝 El resumen de la reunión ya está en el chat',
      action: { label: 'Abrir', run: () => office.openConv(conv) },
      duration: 15000,
    });
  });
  s.on('notes:error', ({ message }) => office.toast({ title: message || 'No se pudo generar el resumen', kind: 'error', duration: 8000 }));
  s.on('notes:empty', () => office.toast({ title: '📝 No se oyó nada que resumir' }));
  s.on('notes:full', () => office.toast({ title: '📝 Las notas llegaron a su límite: lo demás ya no se anota' }));
}

export function startNotes(office, areaId) { office.socket?.emit('notes:start', { areaId }); }
export function stopNotes(office, areaId) { office.socket?.emit('notes:stop', { areaId }); }

// ---------- Transcripción con el micrófono propio ----------
let rec = null;
let want = false;
let sendFn = null;
let failures = 0;

function makeRec() {
  const r = new SR();
  r.lang = 'es-MX';
  r.continuous = true;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    failures = 0;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (!res.isFinal) continue;
      const text = res[0]?.transcript?.trim();
      if (text) sendFn?.(text);
    }
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want = false; failures = 99; }
    else if (e.error !== 'no-speech' && e.error !== 'aborted') failures++;
  };
  // Chrome corta solo tras un rato de silencio: se reinicia mientras siga activo
  r.onend = () => {
    if (rec !== r) return;
    rec = null;
    if (want && failures < 5) setTimeout(() => { if (want && !rec) begin(); }, 400);
  };
  return r;
}

function begin() {
  try { rec = makeRec(); rec.start(); } catch { rec = null; }
}

// Encender o apagar la transcripción local. send(text) recibe cada fragmento final.
export function setTranscribing(on, send) {
  if (!SR) return;
  sendFn = send;
  if (on === want) return;
  want = on;
  if (on) { failures = 0; if (!rec) begin(); }
  else if (rec) { const r = rec; rec = null; try { r.abort(); } catch { /* ya terminó */ } }
}
