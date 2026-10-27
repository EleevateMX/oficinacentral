// Rocola: reglas compartidas entre servidor y cliente.
import { areaAt } from './map.js';
import { objSize } from './catalog.js';

export const JUKEBOX_MAX_QUEUE = 30; // canciones en la fila
export const JUKEBOX_MAX_PER_USER = 3; // canciones en la fila por persona
export const JUKEBOX_TITLE_MAX = 120;
// Si la rocola no está dentro de ningún área, se oye a esta distancia (casillas)
export const JUKEBOX_RADIUS = 6;

// Votos para saltar una canción: la mayoría de quienes la oyen
export const skipNeeded = (listeners) => Math.floor(Math.max(1, listeners) / 2) + 1;

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const isVideoId = (s) => typeof s === 'string' && ID_RE.test(s);

// Saca el id de 11 caracteres de un enlace de YouTube (o de un id suelto). null si no es válido.
export function parseVideoId(input) {
  const s = String(input ?? '').trim();
  if (!s || s.length > 500) return null;
  if (isVideoId(s)) return s;
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return isVideoId(id) ? id : null;
}

// Título limpio: sin saltos ni caracteres de control, con largo máximo
export function cleanTitle(t, fallback = 'Canción de YouTube') {
  const s = String(t ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, JUKEBOX_TITLE_MAX);
  return s || fallback;
}

// Zona donde se oye una rocola: su área (la más pequeña que la contiene) o un radio alrededor
export function jukeboxZone(f, o) {
  const { w, h } = objSize(o);
  const a = areaAt(f, Math.floor(o.x + w / 2 - 0.01), Math.floor(o.y + h / 2 - 0.01));
  return a ? { areaId: a.id, name: a.name } : { areaId: null, name: 'Rocola' };
}

export function inJukeboxZone(f, o, x, y) {
  const z = jukeboxZone(f, o);
  if (z.areaId != null) return areaAt(f, x, y)?.id === z.areaId;
  const { w, h } = objSize(o);
  const dx = Math.max(o.x - x, 0, x - (o.x + w - 1));
  const dy = Math.max(o.y - y, 0, y - (o.y + h - 1));
  return Math.max(dx, dy) <= JUKEBOX_RADIUS;
}

// La rocola que se oye en (x, y), si hay alguna en el piso
const boxCache = new WeakMap();
export function jukeboxAt(f, x, y) {
  let list = boxCache.get(f.objects);
  if (!list) { list = f.objects.filter((o) => o.type === 'jukebox'); boxCache.set(f.objects, list); }
  for (const o of list) if (inJukeboxZone(f, o, x, y)) return o;
  return null;
}
