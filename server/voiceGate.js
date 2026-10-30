// Compuerta de voz y video: el servidor decide quién puede conectarse con quién.
//
// P2P (client/src/lib/media.js): la señalización WebRTC ('rtc') solo se reenvía entre dos
// personas que de verdad pueden tener medios entre sí. Es la misma regla del cliente
// (store.updateProximity + shared/map.js canTalk) con un poco de holgura por el retraso del movimiento:
//   - Mismo piso y canTalk: cerca, mismo escritorio o sala, ponente del escenario ↔ su público.
//   - Conexión "preparada" (warm): hasta PROXIMITY_RADIUS + 7 casillas (+ holgura), nunca hacia
//     ni desde una sala cerrada en la que no están los dos (quien fue admitido entra y ya cuenta como dentro).
//   - Hotel: misma sala del Hotel y a ≤ radio de voz + margen (posición lógica del servidor).
//   - Llamada aceptada ("Llamar"): la pareja se puede conectar unos minutos aunque esté lejos.
//   - Pisos archivados (solo admins): nadie de fuera se conecta con quien está dentro (regla de antes).
// Las pantallas compartidas viajan por la misma conexión y solo a quien está en tu sala
// (store.syncStreams), así que no necesitan una regla aparte.
// Si una pareja deja de poder conectarse (alguien se alejó, cerraron la sala, se acabó la llamada)
// se les avisa a los dos con 'rtc:drop' para que corten la conexión.
//
// LiveKit (client/src/lib/livekit.js): el SDK de servidor no permite permisos por pareja
// (los permisos de suscripción por pista los pone quien publica, desde su navegador), así que
// la sala se parte: cada quien recibe un token solo para su "ámbito" (su piso, su sala cerrada
// o su sala del Hotel). Si el ámbito cambia se le avisa ('lk:scope') para que se cambie de sala
// y, unos segundos después, el servidor lo saca de la anterior (RoomService/RemoveParticipant).
// Un silencio de un admin se aplica al momento (UpdateParticipant + MutePublishedTrack).

import crypto from 'node:crypto';
import { getFloor, isFloorAdminOnly } from './world.js';
import { areaAt, canTalk, PROXIMITY_RADIUS } from '../shared/map.js';
import { hotelCtx } from './hotel.js';
import { sameTeam } from './games.js'; // Arena por equipos: voz por equipo

export const WARM_RADIUS = PROXIMITY_RADIUS + 7; // igual que store.updateProximity
export const SLACK = 2; // casillas extra por el retraso del movimiento
export const HOTEL_VOICE_RADIUS = 6; // client/src/hotel/voice.js VOICE_RADIUS
export const HOTEL_WARM_MARGIN = 6; // conexión preparada en el Hotel (voice.js)
export const CALL_MS = 3 * 60e3; // una llamada aceptada abre la conexión por 3 minutos
const SWEEP_MS = 1500;
const DENY_NOTICE_MS = 3000;
export const LK_SWITCH_GRACE_MS = 4000;

let presence = new Map();
let toUser = () => {};
let gen = 0; // sube con cada cambio que puede afectar a todos (salas que se cierran, etc.)
const userGen = new Map(); // uid -> sube cada vez que se mueve
const decisions = new Map(); // "a:b" -> { ok, ga, gb, g, at } (caché: el reenvío es muy frecuente)
const links = new Map(); // uid -> Set(uid) con quién hay señalización viva
const calls = new Map(); // "a:b" -> vence
const denied = new Map(); // "a:b" -> último aviso de rechazo
let sweepTimer = null;

const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function initVoiceGate({ presence: pres, emitToUser }) {
  presence = pres;
  toUser = emitToUser;
  clearInterval(sweepTimer);
  sweepTimer = setInterval(sweep, SWEEP_MS);
  sweepTimer.unref?.();
  // Hotel: entrar, salir o llegar a una casilla cuenta como moverse (no regresan nada: no vetan)
  if (!hooked) {
    hooked = true;
    hotelCtx.hooks.enter.push((R, U) => { voiceMoved(U.id); });
    hotelCtx.hooks.leave.push((R, uid) => { voiceMoved(uid); });
    hotelCtx.hooks.arrive.push((R, U) => { voiceMoved(U.id); });
  }
}
let hooked = false;

// ---------- Llamadas ----------
export function markCall(a, b, ms = CALL_MS) {
  calls.set(pairKey(Number(a), Number(b)), Date.now() + ms);
  gen++;
}
function inCall(a, b) {
  const k = pairKey(a, b);
  const until = calls.get(k);
  if (!until) return false;
  if (until > Date.now()) return true;
  calls.delete(k);
  return false;
}

// ---------- La regla ----------
function hotelNear(a, b, roomId) {
  const R = hotelCtx.live.get(roomId);
  const A = R?.users.get(a), B = R?.users.get(b);
  if (!A || !B) return false;
  const pa = hotelCtx.logical(A), pb = hotelCtx.logical(B);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) <= HOTEL_VOICE_RADIUS + HOTEL_WARM_MARGIN + SLACK;
}

// ¿Pueden a y b tener voz/video entre sí? (sin caché)
export function canConnect(a, b) {
  a = Number(a); b = Number(b);
  if (a === b) return false;
  const pa = presence.get(a), pb = presence.get(b);
  if (!pa || !pb) return false;
  // Zombies: quien juega solo se oye con su equipo (misma partida)
  if (pa.game || pb.game) return !!(pa.game && pb.game && pa.game.objectId === pb.game.objectId && sameTeam(pa.game, pb.game));
  const ha = hotelCtx.where.get(a), hb = hotelCtx.where.get(b);
  // Hotel: la misma sala se oye sin importar el piso de la oficina (regla de antes)
  if (ha && hb && ha.roomId === hb.roomId) return hotelNear(a, b, ha.roomId) || inCall(a, b);
  // Piso archivado (solo admins): nadie de fuera se conecta con quien está dentro
  if ((isFloorAdminOnly(pa.floorId) && !pb.admin) || (isFloorAdminOnly(pb.floorId) && !pa.admin)) return false;
  if (inCall(a, b)) return true;
  if (ha || hb) return false; // uno en el Hotel y el otro no (o en otra sala del Hotel)
  if (pa.floorId !== pb.floorId) return false;
  const f = getFloor(pa.floorId)?.state;
  if (!f) return false;
  // Sala cerrada: solo quienes están dentro (los admitidos ya entraron). Sin excepción para admins:
  // tampoco pueden entrar caminando a una sala cerrada (realtime.js 'move').
  const ra = areaAt(f, pa.x, pa.y), rb = areaAt(f, pb.x, pb.y);
  if ((ra?.closed || rb?.closed) && ra?.id !== rb?.id) return false;
  if (canTalk(f, pa, pb)) return true;
  return cheb(pa, pb) <= WARM_RADIUS + SLACK;
}

// Con caché: se invalida al moverse cualquiera de los dos, con cambios globales o al pasar 1 s (Hotel)
export function allowed(a, b) {
  const k = pairKey(a, b);
  const ga = userGen.get(a) || 0, gb = userGen.get(b) || 0;
  const d = decisions.get(k);
  const t = Date.now();
  const [g1, g2] = a < b ? [ga, gb] : [gb, ga];
  if (d && d.ga === g1 && d.gb === g2 && d.g === gen && t - d.at < 1000) return d.ok;
  const ok = canConnect(a, b);
  decisions.set(k, { ok, ga: g1, gb: g2, g: gen, at: t });
  return ok;
}

// ---------- Enlaces vivos ----------
function link(a, b) {
  if (!links.has(a)) links.set(a, new Set());
  if (!links.has(b)) links.set(b, new Set());
  links.get(a).add(b);
  links.get(b).add(a);
}
function unlink(a, b) {
  links.get(a)?.delete(b);
  links.get(b)?.delete(a);
  if (links.get(a)?.size === 0) links.delete(a);
  if (links.get(b)?.size === 0) links.delete(b);
}
function drop(a, b, reason) {
  unlink(a, b);
  toUser(a, 'rtc:drop', { peer: b, reason });
  toUser(b, 'rtc:drop', { peer: a, reason });
}
export function linksOf(uid) { return [...(links.get(Number(uid)) || [])]; }

// Reenvío de 'rtc' (realtime.js): true si se puede reenviar
export function relayRtc(from, to, data) {
  if (data?.bye) { unlink(from, to); return true; } // colgar siempre se puede
  if (!allowed(from, to)) {
    // Se le avisa a quien manda para que cierre la conexión a medias (y no la deje colgada)
    const k = `${from}>${to}`;
    const t = Date.now();
    if (t - (denied.get(k) || 0) > DENY_NOTICE_MS) {
      denied.set(k, t);
      if (links.get(from)?.has(to)) drop(from, to, 'denied');
      else toUser(from, 'rtc:drop', { peer: to, reason: 'denied' });
    }
    return false;
  }
  link(from, to);
  return true;
}

function recheck(uid) {
  const set = links.get(uid);
  if (!set) return;
  for (const other of [...set]) if (!allowed(uid, other)) drop(uid, other, 'out-of-range');
}

// Se movió (realtime.js 'move'): se revisan solo sus enlaces
export function voiceMoved(uid) {
  userGen.set(uid, (userGen.get(uid) || 0) + 1);
  recheck(uid);
  lkCheck(uid);
}

// Algo cambió para todos (se cerró o abrió una sala)
export function voiceChanged() {
  gen++;
  sweep();
}

// Se desconectó del todo
export function voiceGone(uid) {
  for (const other of linksOf(uid)) unlink(uid, other);
  userGen.delete(uid);
  lkGone(uid);
}

function sweep() {
  for (const uid of [...links.keys()]) recheck(uid);
  for (const uid of [...lkScopes.keys()]) lkCheck(uid);
  if (denied.size > 500) { const t = Date.now(); for (const [k, v] of denied) if (t - v > DENY_NOTICE_MS) denied.delete(k); }
  if (decisions.size > 5000) decisions.clear();
}

// Un admin silenció a alguien: se corta su voz al momento (P2P y LiveKit)
export function onMute(uid, muted) {
  uid = Number(uid);
  if (muted) for (const other of linksOf(uid)) drop(uid, other, 'muted');
  lkMute(uid, muted).catch((e) => console.warn('[livekit] no se pudo aplicar el silencio:', e.message));
}

// ---------- LiveKit ----------
export function livekitEnabled() {
  return !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}
const lkBase = () => process.env.LIVEKIT_ROOM || 'oficina';
const lkScopes = new Map(); // uid -> ámbito del último token que se le dio
const lkLeaving = new Map(); // uid -> timer para sacarlo de la sala anterior

// Ámbito de voz: su sala del Hotel, su sala cerrada o su piso
export function voiceScope(uid) {
  const w = hotelCtx.where.get(Number(uid));
  if (w) return `h${w.roomId}`;
  const p = presence.get(Number(uid));
  if (!p) return 'idle';
  if (p.game) return `z${p.game.objectId}${p.game.team != null ? `t${p.game.team}` : ''}`; // equipo de Zombies (o de la Arena)
  const f = getFloor(p.floorId)?.state;
  const a = f && areaAt(f, p.x, p.y);
  if (a?.closed) return `a${a.id}`;
  return `f${p.floorId}`;
}
export const lkRoomName = (scope) => `${lkBase()}-${scope}`;

// Al dar un token: queda registrado en qué sala de LiveKit está
export function lkIssue(uid) {
  const scope = voiceScope(uid);
  lkScopes.set(Number(uid), scope);
  return lkRoomName(scope);
}

function lkCheck(uid) {
  if (!livekitEnabled()) return;
  const cur = lkScopes.get(uid);
  if (cur == null) return;
  const next = voiceScope(uid);
  if (next === cur) return;
  lkScopes.set(uid, next);
  toUser(uid, 'lk:scope', { scope: next });
  // Unos segundos para que el cliente se cambie solo; luego se le saca de la sala anterior
  const old = lkRoomName(cur);
  const prev = lkLeaving.get(`${uid}:${old}`);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    lkLeaving.delete(`${uid}:${old}`);
    if (lkScopes.get(uid) != null && lkRoomName(lkScopes.get(uid)) === old) return; // regresó
    lkCall('RemoveParticipant', { room: old, identity: String(uid) }, old).catch(() => { /* ya no estaba */ });
  }, LK_SWITCH_GRACE_MS);
  t.unref?.();
  lkLeaving.set(`${uid}:${old}`, t);
}

function lkGone(uid) {
  lkScopes.delete(uid);
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function adminToken(room) {
  const nowS = Math.floor(Date.now() / 1000);
  const claims = { iss: process.env.LIVEKIT_API_KEY, sub: 'nuvora-server', nbf: nowS - 10, exp: nowS + 120, video: { room, roomAdmin: true } };
  const data = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  return `${data}.${b64url(crypto.createHmac('sha256', process.env.LIVEKIT_API_SECRET).update(data).digest())}`;
}

// RoomService de LiveKit (Twirp sobre HTTP, lo mismo que usa livekit-server-sdk)
async function lkCall(method, body, room) {
  if (!livekitEnabled()) return null;
  const base = process.env.LIVEKIT_URL.replace(/^ws/, 'http').replace(/\/+$/, '');
  const r = await fetch(`${base}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken(room)}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`${method}: ${r.status}`);
  return r.json().catch(() => ({}));
}

const ALL_SOURCES = ['CAMERA', 'MICROPHONE', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO'];
async function lkMute(uid, muted) {
  if (!livekitEnabled()) return;
  const scope = lkScopes.get(uid);
  if (scope == null) return; // no está en LiveKit
  const room = lkRoomName(scope);
  const identity = String(uid);
  // Permisos: sin micrófono mientras dure el silencio
  await lkCall('UpdateParticipant', {
    room, identity,
    permission: { canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: muted ? ['CAMERA', 'SCREEN_SHARE'] : ALL_SOURCES },
  }, room);
  if (!muted) return;
  // Y el micrófono que ya estaba publicado se silencia al momento
  const info = await lkCall('GetParticipant', { room, identity }, room).catch(() => null);
  for (const t of info?.tracks || []) {
    if (t.source === 'MICROPHONE' || t.source === 2) await lkCall('MutePublishedTrack', { room, identity, track_sid: t.sid, muted: true }, room).catch(() => {});
  }
}

// Para pruebas
export const _voiceGate = { links, calls, lkScopes, sweep };
