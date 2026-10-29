// Hotel (parte social): categorías de sala, etiquetas, eventos, respetos, lema e insignias.
// Lo usan el servidor (server/hotelSocial.js) y el cliente (client/src/hotel/social/*).

export const ROOM_CATEGORIES = [
  { id: 'fiesta', name: 'Fiesta', emoji: '🎉' },
  { id: 'chill', name: 'Chill', emoji: '🌙' },
  { id: 'juegos', name: 'Juegos', emoji: '🎮' },
  { id: 'trabajo', name: 'Trabajo', emoji: '💼' },
  { id: 'rol', name: 'Rol', emoji: '🎭' },
  { id: 'comercio', name: 'Comercio', emoji: '🛍️' },
  { id: 'ayuda', name: 'Ayuda', emoji: '🛟' },
  { id: 'otros', name: 'Otros', emoji: '🏠' },
];
export const CATEGORY_BY_ID = Object.fromEntries(ROOM_CATEGORIES.map((c) => [c.id, c]));
export const DEFAULT_CATEGORY = 'otros';

export const MAX_TAGS = 2;
export const MOTTO_MAX = 60;
export const MAX_BADGES = 5;
export const RESPECTS_PER_DAY = 3;
export const EVENT_HOURS = [1, 2, 3];
export const EVENT_TITLE_MAX = 40;
export const EVENT_DESC_MAX = 140;
export const MAX_FRIENDS = 300;
export const MAX_FAVORITES = 50;
export const PM_MAX = 300;

// Etiqueta: minúsculas, sin espacios ni símbolos raros, 2–16 letras
export function cleanTag(t) {
  const s = String(t ?? '').toLowerCase().normalize('NFC').replace(/^#/, '').replace(/\s+/g, '-')
    .replace(/[^a-z0-9áéíóúüñ_-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 16);
  return s.length >= 2 ? s : '';
}
export function cleanTags(list) {
  const arr = Array.isArray(list) ? list : String(list ?? '').split(/[,\s]+/);
  const out = [];
  for (const t of arr) { const c = cleanTag(t); if (c && !out.includes(c)) out.push(c); if (out.length >= MAX_TAGS) break; }
  return out;
}

// Búsqueda del navegador: "owner:usuario", "#etiqueta" / "tag:etiqueta" y texto libre
export function parseSearch(q) {
  const out = { owner: null, tags: [], text: '' };
  const words = [];
  for (const w of String(q ?? '').trim().split(/\s+/).filter(Boolean)) {
    const m = /^(owner|dueño|dueno|de):(.+)$/i.exec(w);
    const tg = /^(?:tag:|#)(.+)$/i.exec(w);
    if (m) out.owner = m[2].replace(/^@/, '').toLowerCase();
    else if (tg) { const c = cleanTag(tg[1]); if (c) out.tags.push(c); }
    else words.push(w);
  }
  out.text = words.join(' ').slice(0, 40);
  return out;
}

// Puntaje de Populares: gente dentro ahora pesa más que los likes
export const popularScore = (users, likes) => users * 10 + likes;

// Evento vigente
export const eventActive = (ev, t = Date.now()) => !!ev && ev.endsAt > t;

// Cuenta regresiva corta: "2 h 05 min", "12 min", "45 s"
export function countdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
