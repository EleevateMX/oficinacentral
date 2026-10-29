// Hotel: voz por cercanía dentro de una sala (usa la misma conexión de medios de la oficina:
// P2P de media.js o LiveKit, las dos con setPeers / setPeerVolume).
//   - Te oye quien está a ≤ VOICE_RADIUS casillas en tu misma sala; el volumen baja con la distancia.
//   - Con los demás de la sala la conexión queda preparada (sin enviar audio) para que suene al instante.
//   - store.updateProximity() llama a office.hotelVoice() mientras estás en el Hotel; al salir vuelve la oficina.
// Además mide el nivel de audio de cada quien para dibujar la ondita de "está hablando".
import { office } from '../lib/store.js';
import { hotel } from './hotelStore.js';

export const VOICE_RADIUS = 6;
export const VOICE_FULL = 2; // hasta aquí se oye al 100 %
const MIN_VOL = 0.2;

export function voiceFalloff(d) {
  if (d <= VOICE_FULL) return 1;
  return Math.max(MIN_VOL, 1 - ((d - VOICE_FULL) / (VOICE_RADIUS - VOICE_FULL)) * (1 - MIN_VOL));
}

// → { ids (con quién hablas), warm (conexión preparada), vol: { id: 0–1 } }
export function hotelVoicePeers() {
  const out = { ids: [], warm: [], vol: {} };
  const L = hotel.live;
  const me = L.users.get(hotel.me);
  if (!me || !hotel.state.roomId) return out;
  const near = [];
  for (const U of L.users.values()) {
    if (U === me || U.bot || !(U.id > 0)) continue;
    const d = Math.hypot(U.rx - me.rx, U.ry - me.ry);
    if (d <= VOICE_RADIUS + 0.01) { out.ids.push(U.id); out.vol[U.id] = voiceFalloff(d); } else near.push([d, U.id]);
  }
  out.ids.sort((a, b) => a - b);
  near.sort((a, b) => a[0] - b[0]);
  out.warm = near.slice(0, 12).map(([, id]) => id);
  return out;
}
office.hotelVoice = hotelVoicePeers;

// ---------- Nivel de audio (ondita) ----------
let ctx = null;
const meters = new Map(); // id → { track, an, buf, level, until }
let timer = 0;

function audioCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function trackOf(stream) { return stream?.getAudioTracks?.().find((t) => t.readyState === 'live') || null; }
function meter(id, track) {
  let m = meters.get(id);
  if (m && m.track === track) return m;
  if (m) { try { m.src.disconnect(); } catch { /* ya */ } meters.delete(id); }
  if (!track) return null;
  const c = audioCtx();
  if (!c) return null;
  try {
    const src = c.createMediaStreamSource(new MediaStream([track]));
    const an = c.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    m = { track, src, an, buf: new Uint8Array(an.frequencyBinCount), level: 0, until: 0 };
    meters.set(id, m);
    return m;
  } catch { return null; }
}
function poll() {
  const st = office.state;
  const live = new Map();
  // Yo: mi micrófono (si está prendido)
  const media = office.media;
  const mine = st.media?.mic ? (media?.audioTrack?.mediaStreamTrack || media?.audioTrack) : null;
  if (mine && st.me) live.set(st.me.id, mine);
  // Los demás: lo que me llega de quien está cerca
  const talking = new Set(st.talkingWith || []);
  for (const p of st.peers || []) if (talking.has(p.id) && st.users[p.id]?.mic !== false) { const t = trackOf(p.stream); if (t) live.set(p.id, t); }
  for (const id of meters.keys()) if (!live.has(id)) { try { meters.get(id).src.disconnect(); } catch { /* ya */ } meters.delete(id); }
  const now = performance.now();
  for (const [id, track] of live) {
    const m = meter(id, track);
    if (!m) continue;
    m.an.getByteFrequencyData(m.buf);
    let sum = 0;
    for (let i = 2; i < 64; i++) sum += m.buf[i];
    const avg = sum / 62;
    if (avg > 16) { m.level = Math.min(1, avg / 70); m.until = now + 350; } else if (now > m.until) m.level = 0;
  }
}
// 0 = callado · >0 = hablando
export function voiceLevel(id) {
  const m = meters.get(id);
  return m?.level > 0 ? m.level : 0;
}
export function startVoiceMeters() {
  if (timer) return;
  timer = setInterval(poll, 110);
  const wake = () => audioCtx();
  window.addEventListener('pointerdown', wake);
  startVoiceMeters.stop = () => { window.removeEventListener('pointerdown', wake); };
}
export function stopVoiceMeters() {
  clearInterval(timer); timer = 0;
  startVoiceMeters.stop?.();
  for (const m of meters.values()) { try { m.src.disconnect(); } catch { /* ya */ } }
  meters.clear();
}
// Para pruebas
if (typeof window !== 'undefined') window.__hotelVoice = { peers: hotelVoicePeers, level: voiceLevel, meters };
