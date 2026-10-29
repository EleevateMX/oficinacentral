// Defensa extra del lado del navegador (la regla de verdad está en server/voiceGate.js):
// ¿acepto una conexión de voz de esta persona? Sí si está en mi sala o cerca (con la
// misma holgura que la conexión preparada), nunca a través de una sala cerrada; en el
// Hotel, si está en mi misma sala del Hotel. Llamadas aceptadas: media.allowPeer().
import { areaAt, canTalk, PROXIMITY_RADIUS } from '@shared/map.js';

export const WARM_RADIUS = PROXIMITY_RADIUS + 7; // store.updateProximity
const SLACK = 3;

// Una de las dos personas está en una sala cerrada y la otra no está con ella
export function closedApart(f, a, b) {
  const ra = areaAt(f, a.x, a.y), rb = areaAt(f, b.x, b.y);
  return !!(ra?.closed || rb?.closed) && ra?.id !== rb?.id;
}

export function acceptsPeer(office, id) {
  const st = office.state;
  if (st.talkingWith?.includes(id)) return true;
  if (st.view === 'hotel') return !!office.hotelHas?.(id);
  const f = st.floor;
  const me = office.myPlayer;
  const p = office.players[id];
  if (!f || !me || !p || p.floorId !== me.floorId) return false;
  if (canTalk(f, me, p)) return true;
  if (closedApart(f, me, p)) return false;
  return Math.max(Math.abs(p.x - me.x), Math.abs(p.y - me.y)) <= WARM_RADIUS + SLACK;
}
