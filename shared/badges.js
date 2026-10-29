// Placas (badges) estilo hotel clásico: cuadritos de pixel art de 40×40 que se dibujan
// en el cliente (client/src/lib/badgeArt.js) a partir de una "receta" (forma, colores, glifo
// o letras). Aquí vive el catálogo fijo; las placas personalizadas que crean los admins se
// guardan en la base (server/badges.js) con la misma receta.
//
// Ids:  logros de la oficina → su id de siempre ('dance', 'veteran'…; así no se pierde lo que
//       ya estaba elegido en el Hotel) · el resto lleva prefijo: 'role:', 'stream:', 'event:',
//       'fan:' y 'custom:<n>'.
import { ACHIEVEMENTS, TIER_NAMES } from './achievements.js';

export const BADGE_SIZE = 40;
export const MAX_WORN = 5;

export const SHAPES = ['circle', 'shield', 'square', 'hex', 'diamond', 'seal'];
export const SHAPE_NAMES = { circle: 'Medalla', shield: 'Escudo', square: 'Cuadro', hex: 'Hexágono', diamond: 'Rombo', seal: 'Sello' };

// Glifos disponibles (los dibujos están en client/src/lib/badgeArt.js)
export const GLYPHS = [
  'crown', 'star', 'shieldStar', 'gavel', 'wrench', 'gem', 'flask', 'flag', 'palette', 'calendar', 'trophy', 'chevrons',
  'bubble', 'play', 'note', 'camera', 'pumpkin', 'tree', 'cake', 'rocket', 'swords', 'crosshair', 'pickaxe', 'cube',
  'mask', 'car', 'ball', 'controller', 'heart', 'bolt', 'clock', 'building', 'sun', 'moon', 'paddle', 'eightball',
  'invader', 'music', 'hug', 'compass', 'plant', 'medal', 'skull', 'fire', 'headset', 'mic',
];
export const GLYPH_SET = new Set(GLYPHS);

export const CATEGORIES = [
  { id: 'achievement', name: 'Logros', how: 'Se gana con los logros de la oficina' },
  { id: 'role', name: 'Roles', how: 'La otorga un admin' },
  { id: 'streamer', name: 'Streamers', how: 'Se gana al verificar tu canal' },
  { id: 'event', name: 'Eventos', how: 'De un evento o temporada' },
  { id: 'fan', name: 'Fan', how: 'Gratis: elígela tú' },
  { id: 'custom', name: 'Especiales', how: 'Placa especial de la comunidad' },
];
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// Colores de la marca Eleevate
export const PALETTE = { navy: '#101120', navy2: '#15172A', navy3: '#222640', steel: '#9CBED9', steel2: '#5D7E9F', cream: '#ECE8DA', amber: '#E0B15A' };
// Marco por nivel del logro: bronce, plata, oro
export const TIER_FRAMES = ['#8C99AE', '#C07A3E', '#C9D1DC', '#E0B15A'];

const r = (id, name, desc, art) => ({ id: `role:${id}`, name, desc, category: 'role', art });
const s = (id, name, desc, art, platform) => ({ id: `stream:${id}`, name, desc, category: 'streamer', art, platform });
const e = (id, name, desc, art) => ({ id: `event:${id}`, name, desc, category: 'event', art });
const f = (id, name, desc, art) => ({ id: `fan:${id}`, name, desc, category: 'fan', art });

// ---------- Logros (envueltos como placas; el marco cambia con el nivel) ----------
const ACH_ART = {
  shift: { shape: 'circle', bg: '#2B4C6F', bg2: '#15172A', glyph: 'clock', color: '#ECE8DA' },
  online: { shape: 'circle', bg: '#3A5A7A', bg2: '#1B2238', glyph: 'building', color: '#9CBED9' },
  early: { shape: 'circle', bg: '#F2A65A', bg2: '#B4523A', glyph: 'sun', color: '#FFE38A' },
  night: { shape: 'circle', bg: '#2A2F5C', bg2: '#101120', glyph: 'moon', color: '#ECE8DA' },
  pong: { shape: 'circle', bg: '#2E7D5B', bg2: '#173D2E', glyph: 'paddle', color: '#E2524A' },
  pool: { shape: 'circle', bg: '#1F7A4D', bg2: '#0F3B27', glyph: 'eightball', color: '#141414' },
  foosball: { shape: 'circle', bg: '#3E9B4F', bg2: '#1C4A27', glyph: 'ball', color: '#F4F4F4' },
  arcade: { shape: 'circle', bg: '#4A2C7A', bg2: '#1C1236', glyph: 'invader', color: '#6CF08A' },
  bday: { shape: 'circle', bg: '#E77FA7', bg2: '#8A3360', glyph: 'cake', color: '#ECE8DA' },
  dance: { shape: 'circle', bg: '#C04FD0', bg2: '#4F1F66', glyph: 'music', color: '#FFE38A' },
  hugs: { shape: 'circle', bg: '#F08A6A', bg2: '#9C3E3A', glyph: 'hug', color: '#FFD9C9' },
  social: { shape: 'circle', bg: '#3F8FD0', bg2: '#1C3F6A', glyph: 'bubble', color: '#F4F4F4' },
  explorer: { shape: 'circle', bg: '#4E8F8A', bg2: '#1E3D44', glyph: 'compass', color: '#ECE8DA' },
  decor: { shape: 'circle', bg: '#8FB35A', bg2: '#3D5A26', glyph: 'plant', color: '#5BC25B' },
  veteran: { shape: 'circle', bg: '#5D7E9F', bg2: '#222640', glyph: 'medal', color: '#E0B15A' },
};
export const ACHIEVEMENT_BADGES = ACHIEVEMENTS.map((a) => ({
  id: a.id, name: a.name, desc: a.desc, category: 'achievement', tiers: a.tiers.length,
  art: ACH_ART[a.id] || { shape: 'circle', bg: '#5D7E9F', bg2: '#222640', glyph: 'star', color: '#ECE8DA' },
}));

// ---------- Roles (los otorga un admin) ----------
export const ROLE_BADGES = [
  r('fundador', 'Fundador', 'Estuvo desde el principio y levantó la comunidad', { shape: 'shield', bg: '#E0B15A', bg2: '#8A5A1E', frame: '#ECE8DA', glyph: 'crown', color: '#FFE38A' }),
  r('admin', 'Admin', 'Administra la oficina y el Hotel', { shape: 'shield', bg: '#5D7E9F', bg2: '#222640', frame: '#E0B15A', glyph: 'shieldStar', color: '#ECE8DA' }),
  r('moderador', 'Moderador', 'Cuida que todo esté en orden', { shape: 'shield', bg: '#3F6FB0', bg2: '#15172A', frame: '#9CBED9', glyph: 'gavel', color: '#E0B15A' }),
  r('staff', 'Staff', 'Parte del equipo de la comunidad', { shape: 'square', bg: '#222640', bg2: '#101120', frame: '#9CBED9', glyph: 'wrench', color: '#9CBED9' }),
  r('vip', 'VIP', 'Persona muy importante del HUB', { shape: 'diamond', bg: '#B04BD6', bg2: '#3C1458', frame: '#E0B15A', glyph: 'gem', color: '#7FE3FF' }),
  r('beta', 'Beta tester', 'Probó las funciones antes que nadie', { shape: 'hex', bg: '#2F8F83', bg2: '#123A3A', frame: '#9CBED9', glyph: 'flask', color: '#7DFFB2' }),
  r('embajador', 'Embajador', 'Representa al HUB en otras comunidades', { shape: 'shield', bg: '#2C7BC0', bg2: '#15284A', frame: '#ECE8DA', glyph: 'flag', color: '#E2524A' }),
  r('artista', 'Artista', 'Crea arte, diseños o música para la comunidad', { shape: 'circle', bg: '#E07A5A', bg2: '#7A2E45', frame: '#ECE8DA', glyph: 'palette', color: '#ECE8DA' }),
  r('organizador', 'Organizador de eventos', 'Arma los eventos de la comunidad', { shape: 'square', bg: '#E0B15A', bg2: '#9A5A26', frame: '#ECE8DA', glyph: 'calendar', color: '#ECE8DA' }),
  r('campeon', 'Ganador de torneo', 'Ganó un torneo oficial del HUB', { shape: 'seal', bg: '#E0B15A', bg2: '#8A5A1E', frame: '#FFE38A', glyph: 'trophy', color: '#FFE38A' }),
  r('veterano', 'Veterano', 'Lleva mucho tiempo en la comunidad', { shape: 'shield', bg: '#6B5A3A', bg2: '#2E2416', frame: '#C07A3E', glyph: 'chevrons', color: '#E0B15A' }),
];

// ---------- Streamers (marca simple con el color de cada plataforma; no son sus logos) ----------
export const PLATFORMS = [
  { id: 'kick', name: 'Kick', color: '#53FC18' },
  { id: 'twitch', name: 'Twitch', color: '#9146FF' },
  { id: 'youtube', name: 'YouTube', color: '#FF0000' },
  { id: 'tiktok', name: 'TikTok', color: '#25F4EE' },
];
export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));
export const STREAMER_BADGES = [
  s('kick', 'Streamer de Kick', 'Transmite en Kick (canal verificado)', { shape: 'square', bg: '#53FC18', bg2: '#2BB80A', frame: '#101120', text: 'K', color: '#101120' }, 'kick'),
  s('twitch', 'Streamer de Twitch', 'Transmite en Twitch (canal verificado)', { shape: 'square', bg: '#9146FF', bg2: '#5A1FC0', frame: '#101120', glyph: 'bubble', color: '#FFFFFF' }, 'twitch'),
  s('youtube', 'Creador de YouTube', 'Sube videos o transmite en YouTube (canal verificado)', { shape: 'square', bg: '#FF0000', bg2: '#B00000', frame: '#101120', glyph: 'play', color: '#FFFFFF' }, 'youtube'),
  s('tiktok', 'Creador de TikTok', 'Hace contenido en TikTok (canal verificado)', { shape: 'square', bg: '#1A1A1A', bg2: '#000000', frame: '#25F4EE', glyph: 'note', color: '#FFFFFF', fx: 'tiktok' }, 'tiktok'),
  s('streamer', 'Streamer', 'Hace streams para la comunidad', { shape: 'circle', bg: '#2A2D45', bg2: '#101120', frame: '#E2524A', glyph: 'camera', color: '#ECE8DA' }),
];
export const STREAM_BADGE_FOR = { kick: 'stream:kick', twitch: 'stream:twitch', youtube: 'stream:youtube', tiktok: 'stream:tiktok' };

// ---------- Eventos y temporadas ----------
export const EVENT_BADGES = [
  e('halloween-2026', 'Halloween 2026', 'Estuvo en la noche de Halloween 2026 del HUB', { shape: 'seal', bg: '#F28C28', bg2: '#5A1F66', frame: '#2A1036', glyph: 'pumpkin', color: '#FF9A2E' }),
  e('navidad-2026', 'Navidad 2026', 'Celebró la Navidad 2026 en el HUB', { shape: 'seal', bg: '#C8323C', bg2: '#5E1218', frame: '#ECE8DA', glyph: 'tree', color: '#3DAA55' }),
  e('aniversario', 'Aniversario', 'Celebró el aniversario de la comunidad', { shape: 'seal', bg: '#5D7E9F', bg2: '#222640', frame: '#E0B15A', glyph: 'cake', color: '#ECE8DA' }),
  e('primer-dia', 'Primer día', 'Llegó en la semana de lanzamiento del HUB', { shape: 'hex', bg: '#3F6FB0', bg2: '#101120', frame: '#E0B15A', glyph: 'rocket', color: '#ECE8DA' }),
];

// ---------- Fan (gratis: cada quien elige las suyas). Íconos genéricos, sin logos ----------
export const FAN_BADGES = [
  f('lol', 'Fan de LoL', 'Juega MOBA en la Grieta', { shape: 'hex', bg: '#1E4A6E', bg2: '#0B1B2E', frame: '#C8A45A', glyph: 'swords', color: '#D8E2EE' }),
  f('valorant', 'Fan de Valorant', 'Tirador táctico de corazón', { shape: 'diamond', bg: '#E2524A', bg2: '#5A1418', frame: '#ECE8DA', glyph: 'crosshair', color: '#ECE8DA' }),
  f('fortnite', 'Fan de Fortnite', 'Construye, salta y sobrevive', { shape: 'hex', bg: '#7A4FE0', bg2: '#22145A', frame: '#7FE3FF', glyph: 'pickaxe', color: '#7FE3FF' }),
  f('minecraft', 'Fan de Minecraft', 'Bloque a bloque', { shape: 'square', bg: '#5FA0E0', bg2: '#2A5A8A', frame: '#3D5A26', glyph: 'cube', color: '#6BBF45' }),
  f('roleplay', 'Fan del Roleplay', 'Vive la historia de tu personaje', { shape: 'circle', bg: '#8A3360', bg2: '#2E1022', frame: '#E0B15A', glyph: 'mask', color: '#ECE8DA' }),
  f('carreras', 'Fan de las carreras', 'Pura velocidad', { shape: 'circle', bg: '#E0B15A', bg2: '#8A5A1E', frame: '#101120', glyph: 'car', color: '#E2524A' }),
  f('futbol', 'Fan del fútbol', 'Del FIFA a la cancha', { shape: 'circle', bg: '#3E9B4F', bg2: '#1C4A27', frame: '#ECE8DA', glyph: 'ball', color: '#F4F4F4' }),
  f('shooter', 'Fan de los shooters', 'Battle royale y FPS', { shape: 'shield', bg: '#4B5A3A', bg2: '#1E2416', frame: '#C8A45A', glyph: 'skull', color: '#ECE8DA' }),
  f('retro', 'Gamer retro', 'Los clásicos nunca mueren', { shape: 'square', bg: '#9CBED9', bg2: '#5D7E9F', frame: '#222640', glyph: 'controller', color: '#222640' }),
  f('musica', 'Melómano', 'Siempre con música', { shape: 'circle', bg: '#2A2D45', bg2: '#101120', frame: '#9CBED9', glyph: 'headset', color: '#9CBED9' }),
];

export const STATIC_BADGES = [...ACHIEVEMENT_BADGES, ...ROLE_BADGES, ...STREAMER_BADGES, ...EVENT_BADGES, ...FAN_BADGES];
export const BADGE_BY_ID = Object.fromEntries(STATIC_BADGES.map((b) => [b.id, b]));
export const isAchievementBadge = (id) => BADGE_BY_ID[id]?.category === 'achievement';
export const isFanBadge = (id) => BADGE_BY_ID[id]?.category === 'fan';
// Placas que un admin puede otorgar (todas menos los logros, que se ganan solos)
export const isGrantable = (id) => (!!BADGE_BY_ID[id] && !isAchievementBadge(id)) || /^custom:\d+$/.test(String(id));
export const tierName = (b, tier) => (b?.category === 'achievement' && b.tiers > 1 && tier > 0 ? TIER_NAMES[tier - 1] : '');

// ---------- Validación de recetas (placas personalizadas) ----------
const HEX = /^#[0-9a-f]{6}$/i;
export const TEXT_RE = /^[A-Z0-9!?+#&]{1,3}$/;
export const NAME_MAX = 40;
export const DESC_MAX = 140;
export function cleanArt(a = {}) {
  if (!a || typeof a !== 'object') return { error: 'Diseño inválido' };
  const shape = SHAPES.includes(a.shape) ? a.shape : null;
  if (!shape) return { error: 'Elige una forma' };
  const col = (v, d) => (HEX.test(String(v || '')) ? String(v).toUpperCase() : d);
  const out = { shape, bg: col(a.bg, '#5D7E9F'), bg2: col(a.bg2, col(a.bg, '#222640')), frame: col(a.frame, '#ECE8DA'), color: col(a.color, '#ECE8DA') };
  const text = String(a.text || '').toUpperCase().trim();
  if (text) {
    if (!TEXT_RE.test(text)) return { error: 'Las letras: de 1 a 3, solo A–Z, 0–9 o !?+#&' };
    out.text = text;
  } else if (GLYPH_SET.has(a.glyph)) out.glyph = a.glyph;
  else return { error: 'Elige un dibujo o escribe de 1 a 3 letras' };
  return { art: out };
}

// ---------- Canales de streamer: solo el dominio oficial de cada plataforma ----------
const HANDLE = {
  kick: /^[A-Za-z0-9_]{3,25}$/,
  twitch: /^[A-Za-z0-9_]{4,25}$/,
  youtube: /^[A-Za-z0-9._-]{3,30}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
};
const HOSTS = {
  kick: ['kick.com', 'www.kick.com'],
  twitch: ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'],
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
};
export const channelUrl = (platform, handle) => ({
  kick: `https://kick.com/${handle}`,
  twitch: `https://www.twitch.tv/${handle}`,
  youtube: /^UC[A-Za-z0-9_-]{22}$/.test(handle) ? `https://www.youtube.com/channel/${handle}` : `https://www.youtube.com/@${handle}`,
  tiktok: `https://www.tiktok.com/@${handle}`,
}[platform]);

// Acepta un enlace (https://kick.com/fulano) o el usuario (fulano / @fulano).
// Devuelve { handle, url } o { error }.
export function parseChannel(platform, input) {
  if (!HOSTS[platform]) return { error: 'Plataforma desconocida' };
  let v = String(input ?? '').trim();
  if (!v) return { error: 'Escribe tu canal' };
  if (v.length > 200) return { error: 'Ese enlace es demasiado largo' };
  let handle;
  const looksUrl = /[/:]/.test(v); // si no, es el usuario (fulano, @fulano, @fulano.mx)
  if (looksUrl) {
    if (!/^https?:\/\//i.test(v)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return { error: 'Solo enlaces https' };
      v = `https://${v}`;
    }
    let u;
    try { u = new URL(v); } catch { return { error: 'Ese enlace no es válido' }; }
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port) return { error: 'Ese enlace no es válido' };
    if (!HOSTS[platform].includes(u.hostname.toLowerCase())) return { error: `El enlace tiene que ser de ${HOSTS[platform][0]}` };
    const parts = u.pathname.split('/').filter(Boolean);
    if (platform === 'kick' || platform === 'twitch') handle = parts.length === 1 ? parts[0] : null;
    else if (platform === 'tiktok') handle = parts.length === 1 && parts[0].startsWith('@') ? parts[0].slice(1) : null;
    else if (platform === 'youtube') {
      if (parts.length === 1 && parts[0].startsWith('@')) handle = parts[0].slice(1);
      else if (parts.length === 2 && parts[0] === 'channel' && /^UC[A-Za-z0-9_-]{22}$/.test(parts[1])) handle = parts[1];
      else handle = null;
    }
    if (!handle) return { error: 'Pon el enlace directo a tu canal' };
  } else handle = v.replace(/^@/, '');
  if (!(platform === 'youtube' && /^UC[A-Za-z0-9_-]{22}$/.test(handle)) && !HANDLE[platform].test(handle)) return { error: 'Ese nombre de canal no es válido' };
  return { handle, url: channelUrl(platform, handle) };
}

export const LIVE_HOURS = 6;
