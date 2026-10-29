// Personajes chibi en pixel-art, generados por código.
//
// Hoja de sprites: 3 columnas × 4 filas de cuadros de 32×48 px (96×192 en total).
//   columnas: 0 = quieto, 1 = paso A, 2 = paso B
//   filas:    0 = abajo, 1 = izquierda, 2 = derecha, 3 = arriba
// Los pies quedan en la fila 46 de cada cuadro. Cualquier hoja con este formato
// (hecha a mano en Aseprite/Piskel o generada aquí) funciona en la oficina.
//
// Los personajes generados por código usan además una hoja "completa" (renderFullSheet)
// que empieza igual que la de 3 columnas y agrega más cuadros a la derecha:
//   3 = paso A en el aire, 4 = paso B en el aire (ciclo de caminar de 4 cuadros)
//   5… = posturas para las acciones (POSES: brazos arriba, saludar, aplaudir…)
// Las hojas subidas (3 columnas) siguen funcionando: sin esos cuadros se usa el normal.
//
// Un avatar es una "ficha": piezas (peinado, ropa, accesorios…) + colores libres.
// Cualquier color hexadecimal es válido, así que las combinaciones no tienen fin.

export const FRAME_W = 32;
export const FRAME_H = 48;
export const SHEET_W = FRAME_W * 3;
export const SHEET_H = FRAME_H * 4;
export const DIRS = ['down', 'left', 'right', 'up'];

// Ciclo de caminar: paso 0 = quieto; 1 = contacto A, 2 = en el aire, 3 = contacto B, 4 = en el aire.
// Columna de cada paso en la hoja completa y en una hoja de 3 columnas.
export const WALK_COLS = [0, 1, 3, 2, 4];
export const WALK_COLS_LEGACY = [0, 1, 1, 2, 2];

// Posturas de las acciones. "a" es el brazo principal (el de la izquierda de la pantalla
// visto de frente; el más cercano visto de lado) y "b" el otro. legs/bob: piernas y altura.
export const POSE_DEFS = {
  armsUp: { a: 'up', b: 'up' },
  wave1: { a: 'wave1', b: 'idle' },
  wave2: { a: 'wave2', b: 'idle' },
  pointA: { a: 'point', b: 'hip' },
  pointB: { a: 'hip', b: 'point' },
  clapOpen: { a: 'clapOpen', b: 'clapOpen' },
  clapShut: { a: 'clapShut', b: 'clapShut' },
  hips: { a: 'hip', b: 'hip' },
  flex: { a: 'flex', b: 'flex' },
  armsOut: { a: 'out', b: 'out' },
  heart: { a: 'chest', b: 'chest' },
  belly: { a: 'belly', b: 'belly' },
  reach: { a: 'out', b: 'idle' },
  highfive: { a: 'hi', b: 'idle' },
  robotA: { a: 'robotUp', b: 'robotDown' },
  robotB: { a: 'robotDown', b: 'robotUp' },
  cross: { a: 'cross', b: 'cross' },
  handsHead: { a: 'head', b: 'head' },
  shuffleA: { a: 'low', b: 'low', legs: 'kickA' },
  shuffleB: { a: 'low', b: 'low', legs: 'kickB' },
  flossA: { a: 'low', b: 'across', legs: 'wide' },
  flossB: { a: 'across', b: 'low', legs: 'wide' },
  squatUp: { a: 'up', b: 'up', legs: 'squat', bob: 2 },
  crouch: { a: 'low', b: 'low', legs: 'squat', bob: 2 },
  // Sentado: cuerpo más abajo, manos en las piernas y muslos hacia el frente (de lado, rodillas al frente)
  sit: { a: 'lap', b: 'lap', legs: 'sit', bob: 4 },
};
// Postura de estar sentado (las hojas subidas de 3 columnas no la tienen)
export const SIT_POSE = 'sit';
export const POSES = Object.keys(POSE_DEFS);
export const POSE_COL0 = 5;
export const FULL_COLS = POSE_COL0 + POSES.length;
export const FULL_SHEET_W = FRAME_W * FULL_COLS;

// Hotel: posturas extra que solo usan las vistas del Hotel (no cambian la hoja de la oficina)
export const HOTEL_POSE_DEFS = {
  sign: { a: 'idle', b: 'idle' }, // el brazo que sostiene el cartel se pone en opt.sign
};
const NO_OPT = {};

// Columna de la hoja para un paso/postura; cols = columnas que tiene la hoja.
export function frameCol(step = 0, pose = null, cols = 3) {
  if (pose && cols >= FULL_COLS) {
    const i = POSES.indexOf(pose);
    if (i >= 0) return POSE_COL0 + i;
  }
  const s = Math.max(0, Math.min(4, Math.round(step) || 0));
  return (cols >= 5 ? WALK_COLS : WALK_COLS_LEGACY)[s];
}

// Piezas disponibles (el orden es el de los selectores)
export const PARTS = {
  hairStyle: ['short', 'sidepart', 'slick', 'spiky', 'mohawk', 'buzz', 'curly', 'afro', 'bob', 'long', 'ponytail', 'pigtails', 'bun'],
  eyes: ['normal', 'big', 'happy', 'sleepy', 'wink'],
  mouth: ['neutral', 'smile', 'grin', 'open'],
  facialHair: ['none', 'stubble', 'mustache', 'goatee', 'beard'],
  top: ['tee', 'hoodie', 'sweater', 'shirt', 'suit', 'blazer', 'varsity', 'jacket', 'uniform', 'tank', 'overalls'],
  bottom: ['pants', 'shorts', 'skirt'],
  hat: ['none', 'cap', 'beanie', 'bucket', 'headband', 'cowboy'],
  eyewear: ['none', 'glasses', 'round', 'sunglasses'],
  audio: ['none', 'headphones', 'headset'],
  extra: ['none', 'earrings', 'scarf', 'backpack', 'lanyard'],
};

// Paletas sugeridas (se puede usar cualquier otro color)
export const SPRITE_OPTIONS = {
  skin: ['#ffe0c7', '#f6c9a0', '#e8b07f', '#c98a57', '#9a6038', '#6b3f22', '#4a2b17'],
  hair: ['#1b1720', '#3b2418', '#6a3b22', '#b5652f', '#e7c06a', '#e9e4dc', '#d8434f', '#FE3377', '#7c4ad9', '#3d7be0', '#2fa36b', '#f28fb8'],
  eyeColor: ['#261e30', '#5a3a22', '#2f6f9f', '#2f7d4a', '#7b4ab8'],
  shirt: ['#FE3377', '#FFCC00', '#FF8A3D', '#157A6E', '#5B3FB8', '#0A2B2C', '#e5484d', '#f2c94c', '#2fb67c', '#1f9e9e', '#3d7be0', '#2a3f78', '#8150e0', '#e05ca5', '#f4f4f6', '#2b2d38', '#101010', '#7d8471'],
  accent: ['#f4f4f6', '#101010', '#FE3377', '#FFCC00', '#FF8A3D', '#3d7be0', '#2fb67c', '#e5484d', '#8B7BFF'],
  pants: ['#2b2d42', '#3e4462', '#24477a', '#6b705c', '#7a4a2b', '#151519', '#a9b6cc', '#c9b48a', '#FE3377'],
  shoes: ['#1d1d22', '#f4f4f6', '#e5484d', '#7a4a2b', '#FE3377', '#FFCC00'],
  hatColor: ['#101010', '#FE3377', '#FFCC00', '#e5484d', '#3d7be0', '#2fb67c', '#f4f4f6', '#7a4a2b'],
};

export const STYLE_NAMES = {
  hairStyle: { short: 'Corto', sidepart: 'De lado', slick: 'Hacia atrás', spiky: 'Picudo', mohawk: 'Mohicano', buzz: 'Rapado', curly: 'Rizado', afro: 'Afro', bob: 'Bob', long: 'Largo', ponytail: 'Coleta', pigtails: 'Dos coletas', bun: 'Chongo' },
  eyes: { normal: 'Normales', big: 'Grandes', happy: 'Felices', sleepy: 'Con sueño', wink: 'Guiño' },
  mouth: { neutral: 'Seria', smile: 'Sonrisa', grin: 'Sonrisota', open: 'Sorpresa' },
  facialHair: { none: 'Nada', stubble: 'Barba de días', mustache: 'Bigote', goatee: 'Candado', beard: 'Barba' },
  top: { tee: 'Playera', hoodie: 'Sudadera', sweater: 'Suéter', shirt: 'Camisa y corbata', suit: 'Traje', blazer: 'Saco', varsity: 'Varsity', jacket: 'Chamarra', uniform: 'Uniforme', tank: 'Sin mangas', overalls: 'Overol' },
  bottom: { pants: 'Pantalón', shorts: 'Short', skirt: 'Falda' },
  hat: { none: 'Nada', cap: 'Gorra', beanie: 'Gorro', bucket: 'Pescador', headband: 'Banda', cowboy: 'Vaquero' },
  eyewear: { none: 'Nada', glasses: 'Lentes', round: 'Redondos', sunglasses: 'De sol' },
  audio: { none: 'Nada', headphones: 'Audífonos', headset: 'Diadema' },
  extra: { none: 'Nada', earrings: 'Aretes', scarf: 'Bufanda', backpack: 'Mochila', lanyard: 'Gafete' },
};

const P = (o) => ({ eyes: 'normal', mouth: 'neutral', facialHair: 'none', bottom: 'pants', hat: 'none', eyewear: 'none', audio: 'none', extra: 'none', eyeColor: '#261e30', ...o });

// Personajes listos para elegir, agrupados por paquete
export const PACKS = [
  { id: 'nuvora', name: 'Oficina' },
  { id: 'gtahub', name: 'GTAHUB' },
];

export const PRESETS = [
  P({ id: 'dev', pack: 'nuvora', name: 'Dev con audífonos', skin: '#f6c9a0', hair: '#1b1720', hairStyle: 'short', top: 'hoodie', shirt: '#e5484d', accent: '#f4f4f6', pants: '#2b2d42', shoes: '#f4f4f6', audio: 'headphones', hatColor: '#2fb67c', mouth: 'smile' }),
  P({ id: 'disenadora', pack: 'nuvora', name: 'Diseñadora', skin: '#e8b07f', hair: '#7c4ad9', hairStyle: 'long', top: 'sweater', shirt: '#f2c94c', accent: '#f4f4f6', pants: '#24477a', shoes: '#1d1d22', eyewear: 'glasses', extra: 'earrings' }),
  P({ id: 'gamer', pack: 'nuvora', name: 'Gamer', skin: '#c98a57', hair: '#3b2418', hairStyle: 'short', top: 'tee', shirt: '#2b2d38', accent: '#2fb67c', pants: '#3e4462', shoes: '#e5484d', hat: 'cap', hatColor: '#2fb67c', mouth: 'grin' }),
  P({ id: 'admin', pack: 'nuvora', name: 'Admin', skin: '#ffe0c7', hair: '#6a3b22', hairStyle: 'sidepart', top: 'shirt', shirt: '#f4f4f6', accent: '#3d7be0', pants: '#2a3f78', shoes: '#7a4a2b', extra: 'lanyard' }),
  P({ id: 'soporte', pack: 'nuvora', name: 'Soporte', skin: '#9a6038', hair: '#1b1720', hairStyle: 'bun', top: 'tee', shirt: '#1f9e9e', accent: '#f4f4f6', pants: '#2b2d42', shoes: '#1d1d22', audio: 'headset', mouth: 'smile' }),
  P({ id: 'artista', pack: 'nuvora', name: 'Artista', skin: '#f6c9a0', hair: '#d8434f', hairStyle: 'bob', top: 'overalls', shirt: '#f4f4f6', accent: '#f08c3a', pants: '#f08c3a', shoes: '#1d1d22', hat: 'beanie', hatColor: '#f08c3a' }),
  P({ id: 'ejecutiva', pack: 'nuvora', name: 'Ejecutiva', skin: '#e8b07f', hair: '#3b2418', hairStyle: 'bob', top: 'blazer', shirt: '#2b2d38', accent: '#f4f4f6', pants: '#2b2d38', shoes: '#1d1d22', bottom: 'skirt', extra: 'earrings' }),
  P({ id: 'rookie', pack: 'nuvora', name: 'Rookie', skin: '#ffe0c7', hair: '#e7c06a', hairStyle: 'spiky', top: 'hoodie', shirt: '#2fb67c', accent: '#f4f4f6', pants: '#3e4462', shoes: '#f4f4f6', eyes: 'big', mouth: 'grin' }),
  P({ id: 'creativo', pack: 'nuvora', name: 'Creativo', skin: '#6b3f22', hair: '#1b1720', hairStyle: 'afro', top: 'tee', shirt: '#8150e0', accent: '#f2c94c', pants: '#151519', shoes: '#f4f4f6', eyewear: 'sunglasses', facialHair: 'goatee' }),
  P({ id: 'liveops', pack: 'nuvora', name: 'LiveOps', skin: '#f6c9a0', hair: '#e9e4dc', hairStyle: 'buzz', top: 'sweater', shirt: '#3d7be0', accent: '#f4f4f6', pants: '#6b705c', shoes: '#7a4a2b', eyewear: 'round', facialHair: 'beard' }),
  P({ id: 'cafe', pack: 'nuvora', name: 'Fan del café', skin: '#c98a57', hair: '#6a3b22', hairStyle: 'ponytail', top: 'jacket', shirt: '#7d8471', accent: '#f4f4f6', pants: '#c9b48a', shoes: '#7a4a2b', eyes: 'sleepy', extra: 'scarf' }),
  P({ id: 'becaria', pack: 'nuvora', name: 'Becaria', skin: '#ffe0c7', hair: '#f28fb8', hairStyle: 'pigtails', top: 'tee', shirt: '#f4f4f6', accent: '#FF8A3D', pants: '#24477a', shoes: '#FF8A3D', bottom: 'shorts', extra: 'backpack', eyes: 'happy', mouth: 'smile' }),

  // Paquete GTAHUB (reparto de las piezas de la marca, sin insignias ni logos de terceros)
  P({ id: 'gh-traje-azul', pack: 'gtahub', name: 'Traje azul', skin: '#f6c9a0', hair: '#3b2418', hairStyle: 'slick', top: 'suit', shirt: '#2a3f78', accent: '#FE3377', pants: '#2a3f78', shoes: '#1d1d22' }),
  P({ id: 'gh-traje-rojo', pack: 'gtahub', name: 'Traje rojo', skin: '#c98a57', hair: '#1b1720', hairStyle: 'short', top: 'suit', shirt: '#c41a55', accent: '#101010', pants: '#101010', shoes: '#101010', eyewear: 'sunglasses' }),
  P({ id: 'gh-calle', pack: 'gtahub', name: 'Calle', skin: '#9a6038', hair: '#1b1720', hairStyle: 'buzz', top: 'hoodie', shirt: '#101010', accent: '#FE3377', pants: '#3e4462', shoes: '#f4f4f6', hat: 'cap', hatColor: '#FE3377', extra: 'backpack' }),
  P({ id: 'gh-varsity', pack: 'gtahub', name: 'Varsity', skin: '#ffe0c7', hair: '#e7c06a', hairStyle: 'sidepart', top: 'varsity', shirt: '#FE3377', accent: '#f4f4f6', pants: '#24477a', shoes: '#f4f4f6', mouth: 'smile' }),
  P({ id: 'gh-policia', pack: 'gtahub', name: 'Policía', skin: '#e8b07f', hair: '#3b2418', hairStyle: 'short', top: 'uniform', shirt: '#24477a', accent: '#FFCC00', pants: '#151519', shoes: '#101010', eyewear: 'sunglasses', facialHair: 'mustache' }),
  P({ id: 'gh-ejecutivo', pack: 'gtahub', name: 'Ejecutivo con bigote', skin: '#f6c9a0', hair: '#6a3b22', hairStyle: 'slick', top: 'suit', shirt: '#2b2d38', accent: '#FFCC00', pants: '#2b2d38', shoes: '#7a4a2b', facialHair: 'mustache' }),
  P({ id: 'gh-ejecutiva', pack: 'gtahub', name: 'Ejecutiva', skin: '#c98a57', hair: '#1b1720', hairStyle: 'long', top: 'blazer', shirt: '#101010', accent: '#FE3377', pants: '#101010', shoes: '#FE3377', bottom: 'skirt', extra: 'earrings' }),
  P({ id: 'gh-presentadora', pack: 'gtahub', name: 'Presentadora', skin: '#e8b07f', hair: '#3b2418', hairStyle: 'long', top: 'jacket', shirt: '#FE3377', accent: '#101010', pants: '#101010', shoes: '#f4f4f6', audio: 'headset', mouth: 'smile', extra: 'earrings' }),
  P({ id: 'gh-creator', pack: 'gtahub', name: 'Creator', skin: '#f6c9a0', hair: '#FE3377', hairStyle: 'mohawk', top: 'tee', shirt: '#101010', accent: '#FE3377', pants: '#151519', shoes: '#FFCC00', audio: 'headphones', hatColor: '#FE3377', mouth: 'grin' }),
  P({ id: 'gh-mecanico', pack: 'gtahub', name: 'Mecánico', skin: '#9a6038', hair: '#1b1720', hairStyle: 'curly', top: 'overalls', shirt: '#2b2d38', accent: '#FFCC00', pants: '#FFCC00', shoes: '#1d1d22', hat: 'headband', hatColor: '#FE3377', facialHair: 'stubble' }),
  P({ id: 'gh-ranchero', pack: 'gtahub', name: 'Ranchero', skin: '#c98a57', hair: '#6a3b22', hairStyle: 'short', top: 'jacket', shirt: '#7a4a2b', accent: '#f4f4f6', pants: '#24477a', shoes: '#7a4a2b', hat: 'cowboy', hatColor: '#7a4a2b', facialHair: 'beard' }),
  P({ id: 'gh-andromeda', pack: 'gtahub', name: 'Andromeda', skin: '#ffe0c7', hair: '#8B7BFF', hairStyle: 'ponytail', top: 'varsity', shirt: '#8B7BFF', accent: '#101010', pants: '#101010', shoes: '#f4f4f6', eyes: 'big' }),
];

export const DEFAULT_SPEC = PRESETS[0];

// ---------- utilidades de color ----------
const HEX = /^#[0-9a-fA-F]{6}$/;
function hexToRgb(hex, fallback = '#888888') {
  const h = HEX.test(String(hex)) ? hex : fallback;
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade([r, g, b], amt) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return [f(r), f(g), f(b)];
}
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// ---------- lienzo de un cuadro ----------
class Frame {
  constructor() {
    this.px = new Array(FRAME_W * FRAME_H).fill(null);
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (c && x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H) this.px[y * FRAME_W + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H ? this.px[y * FRAME_W + x] : null;
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  rrect(x, y, w, h, r, c) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const dx = i < r ? r - i : i >= w - r ? i - (w - r - 1) : 0;
        const dy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0;
        if (dx && dy && dx * dx + dy * dy > r * r + 1) continue;
        this.set(x + i, y + j, c);
      }
    }
  }
  disc(cx, cy, r, c) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) this.set(cx + i, cy + j, c);
  }
  mirror() {
    const f = new Frame();
    for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) f.px[y * FRAME_W + (FRAME_W - 1 - x)] = this.get(x, y);
    return f;
  }
  outline() {
    const out = this.px.slice();
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        if (this.get(x, y)) continue;
        const n = this.get(x, y + 1) || this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1);
        if (n) out[y * FRAME_W + x] = shade(n, -0.62);
      }
    }
    this.px = out;
  }
}

// ---------- dibujo de un personaje ----------
function drawFrame(spec, dir, step, poseName = null, opt = NO_OPT) {
  let f = new Frame();
  const P = (poseName && (POSE_DEFS[poseName] || HOTEL_POSE_DEFS[poseName])) || null;
  // Vistas de 3/4 (Hotel): 'dl' = de frente hacia la izquierda, 'ul' = de espaldas hacia la izquierda;
  // las de la derecha son su espejo. part: 'body' (sin cabeza) o 'head' (solo la cabeza) para voltear la cabeza.
  const Q = dir === 'downLeft' || dir === 'downRight' ? 'dl' : dir === 'upLeft' || dir === 'upRight' ? 'ul' : null;
  const flip = dir === 'right' || dir === 'downRight' || dir === 'upRight';
  const doBody = opt.part !== 'head', doHead = opt.part !== 'body';
  const meta = { hands: {}, holdArm: null };
  f.meta = meta;
  const walk = P ? 0 : Math.max(0, Math.min(4, step | 0));
  const contact = walk === 1 ? 1 : walk === 3 ? -1 : 0; // 1: pie A al frente, -1: pie B
  const C = {
    skin: hexToRgb(spec.skin, '#f6c9a0'),
    hair: hexToRgb(spec.hair, '#1b1720'),
    top: hexToRgb(spec.shirt, '#3d7be0'),
    accent: hexToRgb(spec.accent, '#f4f4f6'),
    pants: hexToRgb(spec.pants, '#2b2d42'),
    shoes: hexToRgb(spec.shoes, '#1d1d22'),
    hat: hexToRgb(spec.hatColor || spec.accent, '#101010'),
    eye: hexToRgb(spec.eyeColor, '#261e30'),
    white: [255, 255, 255],
    ink: [40, 34, 46],
  };
  const skinD = shade(C.skin, -0.16);
  const hairL = shade(C.hair, lum(C.hair) < 60 ? 0.28 : 0.2);
  const hairD = shade(C.hair, -0.22);
  const topD = shade(C.top, -0.2);
  const topL = shade(C.top, 0.15);
  const side = dir === 'left' || dir === 'right';
  const bob = P ? P.bob || 0 : walk === 2 || walk === 4 ? -1 : 0;
  const top = spec.top || 'tee';
  const hs = spec.hairStyle || 'short';
  const longHair = hs === 'long' || hs === 'bob';
  const d = Q === 'dl' ? 'down' : Q === 'ul' ? 'up' : dir === 'right' ? 'left' : dir; // "derecha" = espejo de "izquierda"
  const hy = 13 + bob; // tope de la cabeza
  const ty = 30 + bob; // tope del torso
  const out = f, junk = new Frame();
  if (!doBody) f = junk;

  // ===== Capas de atrás =====
  if (spec.extra === 'backpack' && d !== 'down') {
    const bx = d === 'up' ? 10 : 18;
    f.rrect(bx, ty, d === 'up' ? 12 : 5, 9, 2, C.accent);
    f.rect(bx + 1, ty + 5, d === 'up' ? 10 : 3, 1, shade(C.accent, -0.25));
  }
  if (hs === 'long' && d !== 'left') f.rect(6, hy + 3, 20, d === 'up' ? 20 : 17, hairD);
  if (hs === 'long' && d === 'left') f.rect(13, hy + 3, 11, 18, hairD);
  if (hs === 'ponytail') {
    if (d === 'up') f.rect(14, hy + 10, 4, 12, hairD);
    if (d === 'left') { f.rect(22, hy + 6, 3, 10, hairD); f.set(23, hy + 16, hairD); }
    if (Q === 'dl') f.rect(23, hy + 6, 3, 10, hairD);
  }

  // ===== Piernas, ropa de abajo y zapatos =====
  const bottom = spec.bottom || 'pants';
  const legTop = 39;
  const legColor = (y) => (bottom === 'pants' || (bottom === 'shorts' && y < legTop + 3) ? C.pants : C.skin);
  const legs = P?.legs || 'stand';
  if (legs === 'sit') {
    // Las piernas sentado se pintan después del torso (ver más abajo)
  } else if (!side) {
    const lift = (k) => ((contact === 1 && k === 0) || (contact === -1 && k === 1) ? 1
      : (legs === 'kickA' && k === 0) || (legs === 'kickB' && k === 1) ? 3 : 0);
    const spread = legs === 'wide' || legs === 'squat' ? 1 : 0;
    const legX = (k) => (k === 0 ? 11 - spread - (legs === 'kickA' ? 2 : 0) : 17 + spread + (legs === 'kickB' ? 2 : 0)) - (Q ? (k === 1 ? 2 : 1) : 0);
    [0, 1].forEach((k) => {
      const x = legX(k);
      const up = lift(k);
      for (let y = legTop; y < legTop + 6 - up; y++) {
        f.rect(x, y, 4, 1, legColor(y));
        f.set(x, y, shade(legColor(y), 0.1));
      }
      const sx = x - (k === 0 || Q ? 1 : 0);
      f.rect(sx, 45 - up, 5, 2, Q && k === (Q === 'dl' ? 0 : 1) ? shade(C.shoes, -0.12) : C.shoes);
      f.rect(sx, 46 - up, 5, 1, shade(C.shoes, -0.25));
    });
  } else {
    const off = contact === 1 ? 2 : contact === -1 ? -2
      : legs === 'kickA' ? 3 : legs === 'kickB' ? -3 : legs === 'wide' ? 2 : legs === 'squat' ? 1 : 0;
    for (let y = legTop; y < legTop + 6; y++) f.rect(15 - off, y, 4, 1, shade(legColor(y), -0.15));
    f.rect(14 - off, 45, 5, 2, shade(C.shoes, -0.2));
    for (let y = legTop; y < legTop + 6; y++) f.rect(13 + off, y, 4, 1, legColor(y));
    f.rect(12 + off, 45, 5, 2, C.shoes);
    f.rect(12 + off, 46, 5, 1, shade(C.shoes, -0.25));
  }
  if (bottom === 'skirt' && legs !== 'sit') {
    const sk = C.pants;
    if (!side) { f.rect(10, legTop - 1, 12, 2, sk); f.rect(9, legTop + 1, 14, 2, sk); f.rect(9, legTop + 2, 14, 1, shade(sk, -0.2)); }
    else { f.rect(11, legTop - 1, 10, 2, sk); f.rect(10, legTop + 1, 12, 2, sk); f.rect(10, legTop + 2, 12, 1, shade(sk, -0.2)); }
  }

  // ===== Brazos (geometría) =====
  // Cada brazo es una línea de 2 px (manga) que termina en una manita de piel.
  // Coordenadas del brazo izquierdo de la pantalla (de frente) o del cercano (de lado);
  // el otro brazo de frente es el espejo (x → 31 - x).
  const sleeve = top === 'tank' ? C.skin : top === 'varsity' ? C.accent : C.top;
  const shortSleeve = top === 'tee' || top === 'uniform';
  const t0 = 30 + bob;
  const FRONT = {
    idle: { pts: [[7, t0 + 1], [7, t0 + 5]], hand: [7, t0 + 7, 2, 2] },
    fwd: { pts: [[7, t0 + 1], [7, t0 + 3], [6, t0 + 6]], hand: [5, t0 + 8, 3, 2] },
    bwd: { pts: [[7, t0 + 1], [7, t0 + 3]], hand: [7, t0 + 5, 2, 2], dim: true },
    up: { pts: [[7, t0 + 1], [5, t0 - 3], [5, t0 - 10]], hand: [4, t0 - 13, 3, 3], layer: 'top' },
    wave1: { pts: [[7, t0 + 1], [5, t0 - 3], [3, t0 - 10]], hand: [2, t0 - 13, 3, 3], finger: [[1, t0 - 11]], layer: 'top' },
    wave2: { pts: [[7, t0 + 1], [5, t0 - 3], [6, t0 - 10]], hand: [6, t0 - 13, 3, 3], finger: [[9, t0 - 11]], layer: 'top' },
    hi: { pts: [[7, t0 + 1], [5, t0 - 3], [4, t0 - 10]], hand: [3, t0 - 13, 3, 3], finger: [[2, t0 - 11]], layer: 'top' },
    point: { pts: [[7, t0 + 1], [4, t0 - 2], [2, t0 - 6]], hand: [1, t0 - 8, 2, 2], finger: [[1, t0 - 9], [0, t0 - 10]], layer: 'top' },
    out: { pts: [[7, t0 + 1], [3, t0]], hand: [1, t0 - 1, 2, 3] },
    hip: { pts: [[7, t0 + 1], [5, t0 + 3], [5, t0 + 4], [7, t0 + 6]], hand: [8, t0 + 6, 2, 2] },
    flex: { pts: [[7, t0 + 1], [4, t0 + 1], [3, t0 - 1], [3, t0 - 3]], hand: [2, t0 - 6, 3, 3], bump: [5, t0], layer: 'top' },
    robotUp: { pts: [[7, t0 + 1], [3, t0 + 1], [3, t0 - 4]], hand: [3, t0 - 7, 2, 3], layer: 'top' },
    robotDown: { pts: [[7, t0 + 1], [3, t0 + 1], [3, t0 + 6]], hand: [3, t0 + 8, 2, 2] },
    low: { pts: [[7, t0 + 1], [5, t0 + 4], [4, t0 + 6]], hand: [3, t0 + 8, 2, 2] },
    clapOpen: { pts: [[7, t0 + 1], [7, t0 + 4], [10, t0 + 4]], hand: [11, t0 + 2, 2, 3], inFront: true },
    clapShut: { pts: [[7, t0 + 1], [8, t0 + 5], [12, t0 + 4]], hand: [14, t0 + 2, 2, 3], inFront: true },
    chest: { pts: [[7, t0 + 1], [8, t0 + 4], [11, t0 + 3]], hand: [13, t0 + 1, 2, 3], inFront: true },
    belly: { pts: [[7, t0 + 1], [8, t0 + 5], [11, t0 + 6]], hand: [12, t0 + 5, 3, 2], inFront: true },
    cross: { pts: [[7, t0 + 1], [9, t0 + 5], [16, t0 + 2]], hand: [18, t0 + 1, 2, 2], inFront: true },
    across: { pts: [[7, t0 + 1], [9, t0 + 5], [18, t0 + 7]], hand: [20, t0 + 7, 2, 2], inFront: true },
    head: { pts: [[7, t0 + 1], [4, t0 - 3], [5, t0 - 8]], hand: [6, t0 - 10, 2, 2] },
    lap: { pts: [[7, t0 + 1], [7, t0 + 6], [9, t0 + 8]], hand: [10, t0 + 9, 2, 2], inFront: true },
    // Hotel: sostener algo, llevárselo a la boca y levantar un cartel
    hold: { pts: [[7, t0 + 1], [7, t0 + 5], [9, t0 + 6]], hand: [9, t0 + 6, 2, 2], inFront: true },
    drink: { pts: [[7, t0 + 1], [8, t0 + 4], [11, t0 + 1], [12, t0 - 2]], hand: [12, t0 - 4, 2, 2], inFront: true, layer: 'top' },
    drinkQ: { pts: [[7, t0 + 1], [8, t0 + 4], [13, t0 + 1], [14, t0 - 2]], hand: [15, t0 - 4, 2, 2], inFront: true, layer: 'top' },
    sign: { pts: [[7, t0 + 1], [5, t0 - 3], [5, t0 - 9]], hand: [4, t0 - 12, 3, 3], layer: 'top' },
  };
  const SIDE = {
    idle: { pts: [[16, t0 + 1], [16, t0 + 5]], hand: [16, t0 + 7, 2, 2] },
    fwd: { pts: [[16, t0 + 1], [15, t0 + 3], [12, t0 + 5]], hand: [10, t0 + 6, 2, 2] },
    bwd: { pts: [[16, t0 + 1], [17, t0 + 3], [19, t0 + 5]], hand: [20, t0 + 6, 2, 2] },
    // de lado, el brazo levantado pasa por detrás de la cara (sobre el pelo) para no taparla
    up: { pts: [[16, t0 + 1], [18, t0 - 4], [19, t0 - 10]], hand: [18, t0 - 13, 3, 3], layer: 'top' },
    wave1: { pts: [[16, t0 + 1], [18, t0 - 4], [21, t0 - 10]], hand: [21, t0 - 13, 3, 3], layer: 'top' },
    wave2: { pts: [[16, t0 + 1], [18, t0 - 4], [17, t0 - 10]], hand: [16, t0 - 13, 3, 3], layer: 'top' },
    hi: { pts: [[16, t0 + 1], [11, t0 - 3], [6, t0 - 6]], hand: [3, t0 - 9, 3, 3], layer: 'top' },
    point: { pts: [[16, t0 + 1], [12, t0 - 3], [8, t0 - 7]], hand: [7, t0 - 9, 2, 2], finger: [[6, t0 - 10], [5, t0 - 11]], layer: 'top' },
    out: { pts: [[16, t0 + 1], [5, t0 + 1]], hand: [3, t0, 2, 3] },
    hip: { pts: [[16, t0 + 1], [19, t0 + 4], [17, t0 + 6]], hand: [15, t0 + 6, 2, 2] },
    flex: { pts: [[16, t0 + 1], [11, t0 + 1], [11, t0 - 3]], hand: [10, t0 - 6, 3, 3], layer: 'top' },
    robotUp: { pts: [[16, t0 + 1], [16, t0 + 4], [10, t0 + 4]], hand: [8, t0 + 3, 2, 3] },
    robotDown: { pts: [[16, t0 + 1], [16, t0 + 5]], hand: [16, t0 + 7, 2, 2] },
    clapOpen: { pts: [[16, t0 + 1], [13, t0 + 5], [9, t0 + 4]], hand: [7, t0 + 3, 2, 3] },
    clapShut: { pts: [[16, t0 + 1], [13, t0 + 5], [8, t0 + 3]], hand: [6, t0 + 2, 2, 3] },
    chest: { pts: [[16, t0 + 1], [14, t0 + 4], [11, t0 + 2]], hand: [9, t0 + 1, 2, 2] },
    belly: { pts: [[16, t0 + 1], [15, t0 + 5], [12, t0 + 6]], hand: [10, t0 + 5, 2, 2] },
    head: { pts: [[16, t0 + 1], [20, t0 - 3], [19, t0 - 8]], hand: [17, t0 - 10, 2, 2], layer: 'top' },
    lap: { pts: [[16, t0 + 1], [15, t0 + 5], [12, t0 + 7]], hand: [10, t0 + 7, 2, 2] },
    hold: { pts: [[16, t0 + 1], [16, t0 + 5], [13, t0 + 6]], hand: [11, t0 + 6, 2, 2] },
    drink: { pts: [[16, t0 + 1], [15, t0 + 4], [12, t0 + 2], [10, t0 - 1]], hand: [9, t0 - 3, 2, 2], layer: 'top' },
    sign: { pts: [[16, t0 + 1], [14, t0 - 4], [13, t0 - 9]], hand: [12, t0 - 12, 3, 3], layer: 'top' },
  };
  SIDE.low = SIDE.fwd; SIDE.across = SIDE.bwd; SIDE.cross = SIDE.chest;
  // Brazos según el paso o la postura
  let armA = 'idle', armB = 'idle';
  if (P) { armA = P.a; armB = P.b; }
  else if (contact) {
    // De frente se balancea el brazo contrario a la pierna que avanza; de lado, el cercano va al frente con el paso A
    if (side) { armA = contact === 1 ? 'fwd' : 'bwd'; armB = contact === 1 ? 'bwd' : 'fwd'; }
    else { armA = contact === 1 ? 'bwd' : 'fwd'; armB = contact === 1 ? 'fwd' : 'bwd'; }
  }
  // Hotel: el brazo cercano a la cámara sostiene la bebida o el cartel
  const holdArm = side || Q === 'ul' ? 'a' : 'b';
  const farQ = Q === 'dl' ? 'a' : Q === 'ul' ? 'b' : null;
  if (opt.hold || opt.sign != null) {
    meta.holdArm = holdArm;
    const cur = holdArm === 'a' ? armA : armB;
    const free = !P || cur === 'idle' || cur === 'lap' || poseName === 'sign';
    const g = opt.sign != null ? 'sign' : opt.drink ? (Q === 'dl' ? 'drinkQ' : 'drink') : 'hold';
    if (free || opt.sign != null) { if (holdArm === 'a') armA = g; else armB = g; }
  }
  const linePts = (pts) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      let [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        out.push([x0, y0]);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    if (!out.length) out.push(pts[0]);
    return out;
  };
  // Dibuja un brazo en su propia capa y lo pega con un contorno donde tapa al cuerpo
  const paintArm = (g, mirror, far, id) => {
    const a = new Frame();
    const mx = (x, w = 1) => (mirror ? 31 - x - w + 1 : x);
    const ox = (far ? 1 : 0) + (Q && id === 'b' ? 1 : 0), oy = far ? -1 : 0;
    const dark = Q ? id === farQ || g.dim : far || mirror || g.dim;
    const slv = dark ? shade(sleeve, -0.15) : sleeve;
    const skin = dark ? skinD : C.skin;
    linePts(g.pts).forEach(([x, y], i) => {
      a.rect(mx(x + ox, 2), y + oy, 2, 2, shortSleeve && i > 3 ? skin : slv);
    });
    if (g.bump) a.rect(mx(g.bump[0] + ox), g.bump[1] + oy, 1, 1, slv);
    const [hx, hy2, hw, hh] = g.hand;
    const hpx = mx(hx + ox, hw), hpy = hy2 + oy;
    meta.hands[id] = [hpx + hw / 2, hpy + hh / 2];
    if (opt.hold && id === meta.holdArm && opt.sign == null) paintHandItem((x, y, c) => a.set(x, y, c), opt.hold, hpx, hpy, hw, hh, { up: d === 'up', drink: !!opt.drink });
    a.rect(hpx, hpy, hw, hh, skin);
    for (const [x, y] of g.finger || []) a.set(mx(x + ox), y + oy, skin);
    // Contorno solo encima de lo ya dibujado (el borde exterior lo pone outline())
    // ropa muy oscura: el borde va más claro para que el brazo se lea encima del torso
    const ink = lum(sleeve) < 60 ? shade(sleeve, 0.3) : shade(sleeve, -0.6);
    const skinInk = shade(C.skin, -0.55);
    const filled = [];
    for (let i = 0; i < a.px.length; i++) if (a.px[i]) filled.push(i);
    for (const i of filled) {
      const x = i % FRAME_W, y = (i - x) / FRAME_W;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!a.get(nx, ny) && f.get(nx, ny)) f.set(nx, ny, a.px[i] === skin ? skinInk : ink);
      }
    }
    for (const i of filled) f.px[i] = a.px[i];
  };
  const armLayer = (g, far) => {
    if (side && far) return 'back';
    if (d === 'up' && g.inFront) return 'back';
    if (d === 'up' && g === FRONT.head) return 'top';
    return g.layer || 'mid';
  };
  function drawArms(layer) {
    if (side) {
      const ga = SIDE[armA] || SIDE.idle, gb = SIDE[armB] || SIDE.idle;
      if (armLayer(gb, true) === layer) paintArm(gb, false, true, 'b');
      if (armLayer(ga, false) === layer) paintArm(ga, false, false, 'a');
    } else {
      const ga = FRONT[armA] || FRONT.idle, gb = FRONT[armB] || FRONT.idle;
      if (armLayer(ga, false) === layer) paintArm(ga, false, false, 'a');
      if (armLayer(gb, false) === layer) paintArm(gb, true, false, 'b');
    }
  }
  // Piernas sentado: de frente, muslos hacia la cámara (regazo), espinillas cortas y zapatos;
  // de lado, muslo horizontal hacia el frente y la pierna colgando; de espaldas no se ven.
  function drawSitLegs() {
    const skirt = bottom === 'skirt';
    const thigh = C.pants;
    const shin = bottom === 'pants' ? C.pants : C.skin;
    if (Q === 'dl') {
      // 3/4 de frente: muslos al frente y hacia un lado, la pierna lejana más oscura
      const far = shade(thigh, -0.18);
      for (let j = 0; j < 3; j++) { f.rect(9 - j, 41 + j, 6, 1, far); f.rect(14 - j, 41 + j, 8, 1, thigh); }
      f.rect(14, 41, 6, 1, shade(thigh, 0.14));
      if (skirt) f.rect(7, 43, 15, 1, shade(thigh, -0.2));
      f.rect(7, 44, 3, 1, shade(shin, -0.18));
      f.rect(5, 45, 5, 2, shade(C.shoes, -0.2));
      f.rect(12, 44, 4, 1, shin);
      f.rect(10, 45, 6, 2, C.shoes);
      f.rect(10, 46, 6, 1, shade(C.shoes, -0.25));
    } else if (Q === 'ul') {
      // 3/4 de espaldas: casi todo lo tapa el cuerpo; asoma el muslo cercano
      f.rect(10, 43, 11, 2, shade(thigh, -0.1));
    } else if (d === 'down') {
      f.rect(10, 41, 12, 3, thigh);
      f.rect(11, 41, 3, 1, shade(thigh, 0.14)); f.rect(18, 41, 3, 1, shade(thigh, 0.14));
      f.rect(15, 42, 2, 2, shade(thigh, -0.22));
      if (skirt) f.rect(9, 43, 14, 1, shade(thigh, -0.2));
      for (const x of [11, 17]) {
        f.rect(x, 44, 4, 1, shin);
        f.rect(x - (x === 11 ? 1 : 0), 45, 5, 2, C.shoes);
        f.rect(x - (x === 11 ? 1 : 0), 46, 5, 1, shade(C.shoes, -0.25));
      }
    } else if (d === 'left') {
      // pierna lejana (más oscura) y luego la cercana
      f.rect(6, 40, 12, 3, shade(thigh, -0.18));
      f.rect(8, 43, 3, 2, shade(shin, -0.18));
      f.rect(7, 45, 5, 1, shade(C.shoes, -0.2));
      f.rect(5, 41, 14, 3, thigh);
      f.rect(6, 41, 10, 1, shade(thigh, 0.12));
      if (skirt) f.rect(12, 43, 7, 1, shade(thigh, -0.2));
      f.rect(5, 44, 4, 1, shin);
      f.rect(3, 45, 6, 2, C.shoes);
      f.rect(3, 46, 6, 1, shade(C.shoes, -0.25));
    } else {
      f.rect(10, 43, 12, 2, shade(thigh, -0.1));
    }
  }
  drawArms('back');

  // ===== Torso =====
  const tx = side ? 11 : 9;
  const tw = side ? 10 : Q ? 13 : 14;
  f.rrect(tx, ty, tw, 10, 2, C.top);
  f.rect(tx + tw - 2, ty + 1, 2, 8, topD);
  f.rect(tx + 1, ty + 1, 1, 6, topL);
  if (Q === 'dl') f.rect(tx + tw - 3, ty + 2, 1, 7, shade(C.top, -0.1)); // el costado que se ve

  if (top === 'hoodie') {
    if (d === 'down') {
      f.rect(14, ty, 4, 2, shade(C.top, -0.12));
      f.rect(13, ty + 2, 1, 3, C.accent); f.rect(18, ty + 2, 1, 3, C.accent);
      f.rect(12, ty + 6, 8, 3, topD);
    }
    if (d === 'up') f.rrect(11, ty - 1, 10, 5, 2, topD);
    if (d === 'left') f.rrect(15, ty - 1, 6, 5, 2, topD);
  }
  if (top === 'sweater' && d !== 'up') {
    f.rect(tx, ty + 8, tw, 2, topD);
    if (d === 'down') f.rect(13, ty, 6, 1, C.accent);
  }
  if (top === 'shirt' && d === 'down') {
    f.rect(13, ty, 6, 2, C.top);
    f.set(13, ty, topD); f.set(18, ty, topD);
    f.rect(15, ty + 1, 2, 7, C.accent);
    f.set(15, ty + 1, shade(C.accent, 0.2));
  }
  if (top === 'suit' || top === 'blazer') {
    if (d === 'down') {
      f.rect(14, ty, 4, 8, C.white);
      if (top === 'suit') { f.rect(15, ty + 1, 2, 7, C.accent); f.set(15, ty + 1, shade(C.accent, 0.25)); }
      else f.rect(15, ty + 1, 2, 6, C.top);
      f.rect(13, ty, 1, 7, topL); f.rect(18, ty, 1, 7, topL);
      f.rect(10, ty + 7, 3, 1, topD); f.rect(19, ty + 7, 3, 1, topD);
    }
    if (d === 'left') { f.rect(11, ty + 1, 2, 5, C.white); if (top === 'suit') f.rect(11, ty + 2, 1, 4, C.accent); }
  }
  if (top === 'varsity' && d !== 'up') {
    f.rect(tx, ty + 8, tw, 2, C.accent);
    if (d === 'down') { f.rect(13, ty, 6, 1, C.accent); f.rect(15, ty + 1, 2, 7, shade(C.top, -0.3)); f.rect(11, ty + 3, 2, 2, C.accent); }
  }
  if (top === 'jacket') {
    if (d === 'down') { f.rect(13, ty, 6, 9, C.accent); f.rect(13, ty, 1, 9, topL); f.rect(18, ty, 1, 9, topD); }
    if (d === 'left') f.rect(11, ty + 1, 2, 7, C.accent);
  }
  if (top === 'uniform') {
    if (d !== 'up') {
      f.rect(tx, ty + 7, tw, 2, shade(C.pants, -0.1)); // cinturón
      if (d === 'down') {
        f.set(16, ty + 7, C.accent); f.set(15, ty + 7, C.accent);
        f.rect(11, ty + 2, 3, 2, topD); f.rect(18, ty + 2, 3, 2, topD); // bolsillos
        f.rect(19, ty + 1, 2, 1, C.accent); // parche liso, sin texto
      }
    }
    f.rect(tx, ty, 2, 1, C.accent); f.rect(tx + tw - 2, ty, 2, 1, C.accent); // hombreras
  }
  if (top === 'overalls') {
    if (d !== 'up') {
      const bx = side ? 12 : 11;
      const bw = side ? 8 : 10;
      f.rect(bx, ty + 3, bw, 7, C.pants);
      f.rect(bx + 1, ty, 1, 3, C.pants); f.rect(bx + bw - 2, ty, 1, 3, C.pants);
      f.rect(bx + 2, ty + 5, bw - 4, 2, shade(C.pants, -0.15));
      f.set(bx + 1, ty + 3, C.accent); f.set(bx + bw - 2, ty + 3, C.accent);
    } else {
      f.rect(11, ty + 3, 10, 7, C.pants);
      f.rect(12, ty, 2, 3, C.pants); f.rect(18, ty, 2, 3, C.pants);
    }
  }
  if (top === 'tee' && d === 'down') {
    f.rect(14, ty, 4, 1, skinD);
    f.rect(13, ty + 3, 6, 3, C.accent);
    f.rect(14, ty + 4, 4, 1, shade(C.accent, -0.2));
  }
  if (top === 'tank' && d === 'down') f.rect(13, ty, 6, 2, C.skin);

  if (spec.extra === 'scarf' && d !== 'up') {
    f.rect(side ? 11 : 10, ty - 1, side ? 9 : 12, 3, C.accent);
    if (d === 'down') f.rect(18, ty + 2, 2, 4, C.accent);
    f.rect(side ? 11 : 10, ty + 1, side ? 9 : 12, 1, shade(C.accent, -0.2));
  }
  if (spec.extra === 'lanyard' && d === 'down') {
    f.set(13, ty, C.accent); f.set(14, ty + 1, C.accent); f.set(18, ty, C.accent); f.set(17, ty + 1, C.accent);
    f.rect(15, ty + 2, 2, 1, C.accent);
    f.rect(14, ty + 3, 4, 3, C.white); f.rect(15, ty + 4, 2, 1, C.accent);
  }
  if (spec.extra === 'backpack' && d === 'down') { f.rect(10, ty, 2, 7, shade(C.accent, -0.2)); f.rect(20, ty, 2, 7, shade(C.accent, -0.2)); }

  if (legs === 'sit') drawSitLegs();

  drawArms('mid');
  f = doHead ? out : junk;

  // ===== Cabeza =====
  f.rrect(7, hy, 18, 17, 4, C.skin);
  f.rect(8, hy + 15, 16, 1, skinD);
  if (d === 'left') f.rect(19, hy + 8, 2, 3, skinD);
  if (spec.extra === 'earrings') {
    if (Q === 'dl') f.set(21, hy + 12, [255, 204, 0]);
    else if (Q === 'ul') f.set(8, hy + 12, [255, 204, 0]);
    else if (d === 'down') { f.set(6, hy + 12, [255, 204, 0]); f.set(25, hy + 12, [255, 204, 0]); }
    if (d === 'left') f.set(20, hy + 12, [255, 204, 0]);
  }

  // ===== Cara =====
  const eyes = spec.eyes || 'normal';
  const drawEye = (x, closed) => {
    if (closed || eyes === 'sleepy') { f.rect(x, hy + 9, 2, 1, C.eye); return; }
    if (eyes === 'happy') { f.set(x, hy + 9, C.eye); f.set(x + 1, hy + 8, C.eye); f.set(x + 2, hy + 9, C.eye); return; }
    if (eyes === 'big') { f.rect(x, hy + 7, 3, 4, C.eye); f.set(x, hy + 7, C.white); f.set(x + 2, hy + 9, C.white); return; }
    f.rect(x, hy + 8, 2, 3, C.eye);
    f.set(x, hy + 8, C.white);
  };
  const mouth = spec.mouth || 'neutral';
  const mouthC = shade(C.skin, -0.38);
  if (Q === 'dl') {
    // 3/4: la cara se recorre hacia donde mira; el ojo lejano queda más cerca de la orilla
    const wide = eyes === 'big' || eyes === 'happy';
    drawEye(wide ? 8 : 9, false);
    drawEye(wide ? 14 : 15, eyes === 'wink');
    const blush = [Math.min(255, C.skin[0] + 18), Math.max(0, C.skin[1] - 18), Math.max(0, C.skin[2] - 12)];
    f.set(8, hy + 11, blush); f.rect(17, hy + 11, 2, 1, blush);
    if (mouth === 'neutral') f.rect(12, hy + 13, 2, 1, mouthC);
    if (mouth === 'smile') { f.set(11, hy + 12, mouthC); f.rect(12, hy + 13, 2, 1, mouthC); f.set(14, hy + 12, mouthC); }
    if (mouth === 'grin') { f.rect(11, hy + 12, 4, 2, mouthC); f.rect(11, hy + 12, 4, 1, C.white); }
    if (mouth === 'open') f.rect(12, hy + 12, 2, 2, mouthC);
    f.rect(20, hy + 8, 2, 3, skinD); // oreja
  } else if (d === 'down') {
    drawEye(eyes === 'big' ? 10 : 11, false);
    drawEye(19, eyes === 'wink');
    const blush = [Math.min(255, C.skin[0] + 18), Math.max(0, C.skin[1] - 18), Math.max(0, C.skin[2] - 12)];
    f.rect(9, hy + 11, 2, 1, blush); f.rect(21, hy + 11, 2, 1, blush);
    if (mouth === 'neutral') f.rect(15, hy + 13, 2, 1, mouthC);
    if (mouth === 'smile') { f.set(14, hy + 12, mouthC); f.rect(15, hy + 13, 2, 1, mouthC); f.set(17, hy + 12, mouthC); }
    if (mouth === 'grin') { f.rect(14, hy + 12, 4, 2, mouthC); f.rect(14, hy + 12, 4, 1, C.white); }
    if (mouth === 'open') f.rect(15, hy + 12, 2, 2, mouthC);
  } else if (d === 'left') {
    if (eyes === 'happy') { f.set(9, hy + 9, C.eye); f.set(10, hy + 8, C.eye); }
    else if (eyes === 'sleepy') f.rect(9, hy + 9, 2, 1, C.eye);
    else { f.rect(9, hy + 8, 2, eyes === 'big' ? 4 : 3, C.eye); f.set(9, hy + 8, C.white); }
    f.rect(8, hy + 13, mouth === 'grin' ? 3 : 2, 1, mouth === 'grin' ? C.white : mouthC);
  }

  // ===== Vello facial =====
  const fh = spec.facialHair || 'none';
  if (fh !== 'none' && d !== 'up') {
    const hc = fh === 'stubble' ? shade(C.skin, -0.3) : C.hair;
    if (Q === 'dl') {
      if (fh === 'mustache') f.rect(10, hy + 12, 6, 1, hc);
      if (fh === 'goatee') { f.rect(11, hy + 12, 4, 1, hc); f.rect(12, hy + 14, 2, 2, hc); }
      if (fh === 'beard' || fh === 'stubble') {
        f.rect(7, hy + 10, 1, 5, hc); f.rect(18, hy + 10, 3, 5, hc);
        f.rect(8, hy + 14, 12, 2, hc); f.rect(10, hy + 12, 6, 1, hc);
        if (mouth !== 'neutral') f.rect(12, hy + 13, 2, 1, mouthC);
      }
    } else if (d === 'down') {
      if (fh === 'mustache') f.rect(13, hy + 12, 6, 1, hc);
      if (fh === 'goatee') { f.rect(14, hy + 12, 4, 1, hc); f.rect(15, hy + 14, 2, 2, hc); }
      if (fh === 'beard' || fh === 'stubble') {
        f.rect(8, hy + 10, 2, 5, hc); f.rect(22, hy + 10, 2, 5, hc);
        f.rect(9, hy + 14, 14, 2, hc); f.rect(13, hy + 12, 6, 1, hc);
        if (mouth !== 'neutral') f.rect(15, hy + 13, 2, 1, mouthC);
      }
    } else {
      if (fh === 'mustache') f.rect(7, hy + 12, 4, 1, hc);
      if (fh === 'goatee') f.rect(8, hy + 14, 3, 2, hc);
      if (fh === 'beard' || fh === 'stubble') { f.rect(7, hy + 12, 4, 1, hc); f.rect(8, hy + 14, 10, 2, hc); f.rect(17, hy + 10, 2, 5, hc); }
    }
  }

  // ===== Cabello =====
  const hat = spec.hat || 'none';
  const hatCovers = hat === 'beanie' || hat === 'bucket' || hat === 'cowboy';
  if (hs === 'buzz') {
    f.rrect(7, hy - 1, 18, d === 'up' ? 10 : 5, 4, C.hair);
    if (d === 'left') f.rect(16, hy + 1, 9, 5, C.hair);
  } else if (hs === 'afro') {
    const r = 11;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (i * i + j * j > r * r) continue;
      const x = 16 + i, y = hy + 4 + j;
      if (d === 'up' || y < hy + 6 || x < 8 || x > 23 || (d === 'left' && x > 15)) f.set(x, y, (i + j) % 3 === 0 ? hairD : C.hair);
    }
    f.rect(11, hy - 4, 4, 2, hairL);
  } else if (d === 'up') {
    f.rrect(6, hy - 1, 20, hs === 'long' ? 18 : 16, 5, C.hair);
    f.rect(9, hy + 1, 3, 6, hairL);
    if (hs === 'pigtails') { f.rrect(3, hy + 6, 4, 8, 2, C.hair); f.rrect(25, hy + 6, 4, 8, 2, C.hair); }
    if (hs === 'mohawk') f.rect(14, hy - 4, 4, 18, C.hair);
  } else if (d === 'down') {
    if (hs === 'mohawk') {
      f.rect(14, hy - 4, 4, 9, C.hair); f.rect(15, hy - 4, 1, 4, hairL);
      f.rect(7, hy + 2, 2, 4, shade(C.skin, -0.25)); f.rect(23, hy + 2, 2, 4, shade(C.skin, -0.25));
    } else {
      f.rrect(6, hy - 1, 20, 8, 5, C.hair);
      f.rect(6, hy + 3, 3, longHair ? 12 : 6, C.hair);
      f.rect(23, hy + 3, 3, longHair ? 12 : 6, C.hair);
      if (hs === 'sidepart') { f.rect(8, hy + 5, 8, 2, C.hair); f.rect(17, hy + 1, 1, 4, hairD); }
      else if (hs === 'slick') { f.rect(7, hy + 3, 18, 1, hairL); f.rect(9, hy + 1, 14, 1, hairL); }
      else for (let i = 9; i < 23; i++) if ((i * 7) % 5 < 2) f.set(i, hy + 7, C.hair);
      f.rect(10, hy + 1, 4, 2, hairL);
      if (hs === 'pigtails') { f.rrect(2, hy + 6, 4, 9, 2, C.hair); f.rrect(26, hy + 6, 4, 9, 2, C.hair); f.set(5, hy + 6, C.accent); f.set(26, hy + 6, C.accent); }
      if (hs === 'ponytail') f.rect(22, hy - 2, 3, 3, C.hair);
    }
  } else {
    if (hs === 'mohawk') {
      f.rect(10, hy - 4, 13, 5, C.hair); f.rect(11, hy - 3, 5, 1, hairL);
      f.rect(17, hy + 2, 6, 4, shade(C.skin, -0.25));
    } else {
      f.rrect(7, hy - 1, 19, 8, 5, C.hair);
      f.rect(15, hy + 3, 11, longHair ? 12 : 7, C.hair);
      f.rect(7, hy + 6, 3, 1, C.hair);
      f.rect(11, hy + 1, 5, 2, hairL);
      f.rect(19, hy + 8, 2, 3, d === 'left' && longHair ? C.hair : skinD);
      if (hs === 'slick') f.rect(8, hy + 2, 12, 1, hairL);
      if (hs === 'pigtails') f.rrect(23, hy + 6, 4, 9, 2, C.hair);
    }
  }
  // 3/4: de frente se ve la parte de atrás del pelo a un lado (con la oreja); de espaldas, la mejilla y la oreja
  if (Q === 'dl' && hs !== 'afro') {
    if (hs === 'mohawk') f.rect(18, hy + 2, 4, 4, shade(C.skin, -0.25));
    else if (hs === 'buzz') f.rect(19, hy + 1, 6, 5, C.hair);
    else {
      f.rect(20, hy + 3, 6, longHair ? 12 : 6, C.hair);
      f.rect(24, hy + 4, 1, longHair ? 10 : 4, hairD);
      if (!longHair) f.rect(8, hy + 4, 1, 5, C.skin);
    }
    if (!longHair) f.rect(20, hy + 8, 2, 3, skinD);
  }
  if (Q === 'ul' && hs !== 'afro' && !longHair) {
    for (let j = 6; j <= 14; j++) f.px[(hy + j) * FRAME_W + 6] = null;
    f.rect(7, hy + 6, 2, 9, C.skin);
    f.rect(9, hy + 12, 2, 3, C.skin);
    f.rect(9, hy + 8, 2, 3, skinD);
  }
  if (hs === 'spiky' && !hatCovers) {
    for (const sx of [8, 12, 16, 20]) {
      f.rect(sx + (d === 'left' ? 1 : 0), hy - 3, 3, 2, C.hair);
      f.set(sx + 1 + (d === 'left' ? 1 : 0), hy - 4, C.hair);
    }
  }
  if (hs === 'bun' && !hatCovers) {
    const bx = d === 'left' ? 19 : 16;
    f.disc(bx, hy - 3, 3, C.hair);
    f.set(bx - 1, hy - 4, hairL);
  }
  if (hs === 'curly' && !hatCovers) {
    for (let i = 0; i < 6; i++) f.disc(8 + i * 3, hy, 2, i % 2 ? C.hair : hairD);
    if (d !== 'up') { f.disc(7, hy + 5, 2, C.hair); f.disc(24, hy + 5, 2, C.hair); }
  }

  // ===== Lentes =====
  const ew = spec.eyewear || 'none';
  if (ew !== 'none' && (d !== 'up' || Q === 'ul')) {
    const sun = ew === 'sunglasses';
    const lens = sun ? [24, 24, 30] : shade(C.skin, 0.25);
    const frame = sun ? [20, 20, 26] : C.ink;
    if (Q === 'ul') {
      if (!longHair) f.rect(7, hy + 8, 3, 1, frame);
    } else if (Q === 'dl') {
      for (const ex of [8, 14]) {
        if (ew === 'round') f.rrect(ex, hy + 7, 4, 4, 1, frame);
        else f.rect(ex, hy + 7, 4, 4, frame);
        f.rect(ex + 1, hy + 8, 2, 2, lens);
        if (!sun) f.set(ex + 1, hy + 8, C.eye);
      }
      f.rect(12, hy + 8, 2, 1, frame);
      f.rect(18, hy + 8, 3, 1, frame);
      if (sun) { f.set(9, hy + 8, [120, 120, 140]); f.set(15, hy + 8, [120, 120, 140]); }
    } else if (d === 'down') {
      for (const ex of [10, 18]) {
        if (ew === 'round') f.rrect(ex, hy + 7, 4, 4, 1, frame);
        else f.rect(ex, hy + 7, 4, 4, frame);
        f.rect(ex + 1, hy + 8, 2, 2, lens);
        if (!sun) f.set(ex + 1, hy + 8, C.eye);
      }
      f.rect(14, hy + 8, 4, 1, frame);
      if (sun) { f.set(11, hy + 8, [120, 120, 140]); f.set(19, hy + 8, [120, 120, 140]); }
    } else {
      f.rect(7, hy + 7, 5, 4, frame);
      f.rect(8, hy + 8, 3, 2, lens);
      if (!sun) f.set(9, hy + 8, C.eye);
      f.rect(12, hy + 8, 7, 1, frame);
    }
  }

  // ===== Audífonos =====
  const au = spec.audio || 'none';
  if (au !== 'none') {
    const cup = au === 'headphones' ? (spec.hatColor ? C.hat : C.accent) : [52, 52, 62];
    const band = shade(cup, -0.35);
    if (Q) {
      // 3/4: el audífono cercano sobre la oreja y del otro solo la orilla
      const ul = Q === 'ul';
      if (!hatCovers) f.rect(ul ? 9 : 9, hy - 2, 14, 1, band);
      f.rect(ul ? 8 : 22, hy - 1, 1, 6, band);
      f.rrect(ul ? 7 : 19, hy + 5, 4, 7, 1, cup);
      f.rrect(ul ? 24 : 5, hy + 6, 3, 6, 1, shade(cup, -0.2));
      if (au === 'headset' && !ul) { f.rect(14, hy + 12, 6, 1, [52, 52, 62]); f.rect(13, hy + 12, 2, 2, [229, 72, 77]); }
    } else if (d !== 'left') {
      if (!hatCovers) f.rect(8, hy - 2, 16, 1, band);
      f.rect(7, hy - 1, 1, 6, band); f.rect(24, hy - 1, 1, 6, band);
      f.rrect(4, hy + 5, 4, 7, 1, cup); f.rrect(24, hy + 5, 4, 7, 1, cup);
      if (au === 'headset' && d === 'down') { f.rect(8, hy + 12, 5, 1, [52, 52, 62]); f.rect(12, hy + 12, 2, 2, [229, 72, 77]); }
    } else {
      if (!hatCovers) f.rect(12, hy - 2, 9, 1, band);
      f.rect(19, hy - 1, 1, 7, band);
      f.rrect(17, hy + 6, 5, 7, 1, cup);
      if (au === 'headset') { f.rect(10, hy + 13, 8, 1, [52, 52, 62]); f.rect(9, hy + 12, 2, 2, [229, 72, 77]); }
    }
  }

  // ===== Gorras y sombreros =====
  const H = C.hat;
  if (hat === 'cap') {
    f.rrect(6, hy - 3, 20, 7, 4, H);
    f.rect(9, hy - 2, 4, 1, shade(H, 0.25));
    if (Q === 'dl') f.rect(4, hy + 3, 15, 2, shade(H, -0.22));
    else if (Q === 'ul') { f.rect(16, hy + 2, 6, 2, shade(H, -0.22)); f.rect(3, hy + 3, 5, 2, shade(H, -0.22)); }
    else if (d === 'down') f.rect(8, hy + 3, 16, 2, shade(H, -0.22));
    if (d === 'left') f.rect(2, hy + 3, 8, 2, shade(H, -0.22));
    if (d === 'up' && !Q) f.rect(13, hy + 2, 6, 2, shade(H, -0.22));
  }
  if (hat === 'beanie') {
    f.rrect(6, hy - 4, 20, 9, 5, H);
    f.rect(6, hy + 2, 20, 3, shade(H, -0.2));
    for (let i = 8; i < 25; i += 2) f.set(i, hy + 3, shade(H, -0.35));
    f.disc(16, hy - 5, 2, C.white);
  }
  if (hat === 'bucket') {
    f.rrect(8, hy - 4, 16, 7, 3, H);
    f.rect(4, hy + 2, 24, 2, shade(H, -0.15));
    f.rect(8, hy + 1, 16, 1, shade(H, -0.3));
  }
  if (hat === 'headband') {
    f.rect(6, hy + 3, 20, 2, H);
    if (d === 'left' || Q === 'dl') f.rect(24, hy + 4, 2, 4, H);
  }
  if (hat === 'cowboy') {
    f.rrect(9, hy - 6, 14, 8, 3, H);
    f.rect(12, hy - 6, 8, 1, shade(H, -0.25));
    f.rect(2, hy + 1, 28, 2, shade(H, -0.12));
    f.set(2, hy, shade(H, -0.12)); f.set(29, hy, shade(H, -0.12));
    f.rect(9, hy, 14, 1, C.accent);
  }

  f = doBody ? out : junk;
  drawArms('top');
  f = out;

  if (!opt.noOutline) f.outline();
  const res = flip ? f.mirror() : f;
  if (flip) for (const k of Object.keys(meta.hands)) meta.hands[k] = [FRAME_W - meta.hands[k][0], meta.hands[k][1]];
  res.meta = meta;
  return res;
}

function paintSheet(spec, cols) {
  const s = normalizeSpec(spec);
  const W = FRAME_W * cols;
  const out = new Uint8ClampedArray(W * SHEET_H * 4);
  DIRS.forEach((dir, row) => {
    for (let col = 0; col < cols; col++) {
      // columnas 0-4: quieto + ciclo de caminar; 5…: posturas
      const fr = col < POSE_COL0 ? drawFrame(s, dir, WALK_COLS.indexOf(col)) : drawFrame(s, dir, 0, POSES[col - POSE_COL0]);
      for (let y = 0; y < FRAME_H; y++) {
        for (let x = 0; x < FRAME_W; x++) {
          const c = fr.get(x, y);
          if (!c) continue;
          const i = ((row * FRAME_H + y) * W + col * FRAME_W + x) * 4;
          out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
        }
      }
    }
  });
  return out;
}

// Píxeles RGBA de la hoja clásica de 3 columnas (96×192): el mismo formato que las hojas subidas
export function renderSheet(spec) {
  return paintSheet(spec, 3);
}

// Hoja completa: las 3 columnas clásicas + pasos en el aire + posturas de las acciones
export function renderFullSheet(spec) {
  return { data: paintSheet(spec, FULL_COLS), width: FULL_SHEET_W, height: SHEET_H };
}

export const COLOR_KEYS = ['skin', 'hair', 'eyeColor', 'shirt', 'accent', 'pants', 'shoes', 'hatColor'];

// ================= Hotel: 8 direcciones, objetos en la mano =================
// Las vistas de 3/4 usan el mismo dibujo (cara, peinado, ropa, proporciones) que la oficina.
// Dirección del Hotel (0–7, ver shared/hotelWalk.js) → vista del personaje.
export const DIRS8 = ['upRight', 'right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up'];
export const DIAG_DIRS = ['downLeft', 'downRight', 'upLeft', 'upRight'];
export const HAND_ITEMS = ['refresco', 'cafe', 'agua', 'helado', 'palomitas', 'rosa'];

// Objeto en la mano (pixel-art original): la mano (hx, hy, hw, hh) lo agarra por abajo.
export function paintHandItem(set, id, hx, hy, hw = 2, hh = 2, o = {}) {
  const x0 = hx + Math.floor(hw / 2) - 1;
  const R = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  switch (id) {
    case 'refresco': {
      const y0 = hy - 4;
      R(x0, y0 + 1, 3, 5, [254, 51, 119]);
      R(x0, y0, 3, 1, [206, 208, 218]);
      R(x0, y0 + 2, 3, 1, [255, 255, 255]);
      set(x0, y0 + 3, [255, 128, 170]);
      break;
    }
    case 'cafe': {
      const y0 = hy - 3;
      R(x0, y0, 3, 1, [60, 42, 36]);
      R(x0, y0 + 1, 3, 4, [250, 246, 238]);
      R(x0, y0 + 2, 3, 2, [168, 112, 66]);
      if (!o.drink) { set(x0 + 1, y0 - 2, [236, 236, 244]); set(x0 + 2, y0 - 3, [236, 236, 244]); set(x0 + 1, y0 - 4, [220, 220, 232]); }
      break;
    }
    case 'agua': {
      const y0 = hy - 5;
      R(x0 + 1, y0, 1, 1, [40, 110, 210]);
      R(x0, y0 + 1, 3, 6, [150, 205, 245]);
      R(x0 + 2, y0 + 1, 1, 6, [110, 175, 230]);
      set(x0, y0 + 2, [235, 248, 255]);
      R(x0, y0 + 4, 3, 1, [40, 110, 210]);
      break;
    }
    case 'helado': {
      const y0 = hy - 5;
      R(x0, y0, 3, 1, [255, 170, 205]);
      R(x0 - 1, y0 + 1, 5, 2, [255, 150, 190]);
      set(x0, y0 + 1, [255, 225, 236]);
      R(x0 - 1, y0 + 3, 5, 1, [250, 240, 214]);
      R(x0, y0 + 4, 3, 2, [214, 160, 90]);
      set(x0 + 1, y0 + 6, [190, 132, 66]);
      set(x0 + 1, y0 + 4, [180, 124, 60]);
      break;
    }
    case 'palomitas': {
      const y0 = hy - 4;
      R(x0 - 1, y0, 5, 2, [255, 238, 190]);
      set(x0, y0 - 1, [255, 246, 214]); set(x0 + 2, y0 - 1, [255, 230, 170]);
      for (let i = 0; i < 5; i++) R(x0 - 1 + i, y0 + 2, 1, 4, i % 2 ? [255, 255, 255] : [230, 40, 60]);
      break;
    }
    case 'rosa': {
      const y0 = hy - 6;
      R(x0, y0, 3, 2, [220, 30, 66]);
      set(x0 + 1, y0, [255, 90, 120]);
      set(x0 + 1, y0 - 1, [190, 20, 50]);
      R(x0 + 1, y0 + 2, 1, 6, [56, 150, 70]);
      set(x0 + 2, y0 + 4, [86, 180, 90]);
      break;
    }
    default: break;
  }
}

const toRGBA = (fr) => {
  const out = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
  for (let i = 0; i < fr.px.length; i++) {
    const c = fr.px[i];
    if (!c) continue;
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return out;
};

// Un cuadro del Hotel (32×48, mismo formato que la hoja de la oficina; pies en la fila 46).
//   dir/head: 'down' | 'left' | 'right' | 'up' | DIAG_DIRS · step: 0 quieto, 1–4 caminar
//   pose: nombre de POSES (o 'sit') · hold: objeto en la mano (HAND_ITEMS) · drink: llevárselo a la boca
//   sign: levantar un cartel · blink / talk: ojos cerrados / boca abierta
// → { data (RGBA), width, height, hands: { a: [x, y], b: [x, y] }, holdArm }
export function hotelFrame(spec, o = {}) {
  let s = normalizeSpec(spec);
  if (o.blink && s.eyewear !== 'sunglasses') s = { ...s, eyes: 'sleepy' };
  if (o.talk) s = { ...s, mouth: s.mouth === 'open' ? 'neutral' : 'open' };
  const dir = o.dir || 'down';
  const opt = { hold: HAND_ITEMS.includes(o.hold) ? o.hold : null, drink: !!o.drink, sign: o.sign ?? null };
  let fr;
  if (o.head && o.head !== dir) {
    fr = drawFrame(s, dir, o.step || 0, o.pose || null, { ...opt, part: 'body', noOutline: true });
    const hd = drawFrame(s, o.head, o.step || 0, o.pose || null, { ...opt, part: 'head', noOutline: true });
    for (let i = 0; i < hd.px.length; i++) if (hd.px[i]) fr.px[i] = hd.px[i];
    fr.outline();
  } else fr = drawFrame(s, dir, o.step || 0, o.pose || null, opt);
  return { data: toRGBA(fr), width: FRAME_W, height: FRAME_H, hands: fr.meta.hands, holdArm: fr.meta.holdArm };
}

// Hoja de las 4 vistas de 3/4 (filas: DIAG_DIRS) para vistas previas y pruebas:
// columnas 0 quieto, 1–4 caminar (WALK_COLS), 5 sentado, 6–7 saludar
export const DIAG_COLS = 8;
export function renderDiagSheet(spec) {
  const W = FRAME_W * DIAG_COLS;
  const out = new Uint8ClampedArray(W * SHEET_H * 4);
  const cols = [[0, null], [1, null], [3, null], [2, null], [4, null], [0, SIT_POSE], [0, 'wave1'], [0, 'wave2']];
  DIAG_DIRS.forEach((dir, row) => {
    cols.forEach(([step, pose], col) => {
      const { data } = hotelFrame(spec, { dir, step, pose });
      for (let y = 0; y < FRAME_H; y++) {
        const i = ((row * FRAME_H + y) * W + col * FRAME_W) * 4;
        out.set(data.subarray(y * FRAME_W * 4, (y + 1) * FRAME_W * 4), i);
      }
    });
  });
  return { data: out, width: W, height: SHEET_H };
}

// Normaliza un avatar guardado (incluye avatares de formatos anteriores)
export function normalizeSpec(av = {}) {
  const base = PRESETS.find((p) => p.id === av.preset) || DEFAULT_SPEC;
  const out = { ...base, ...av };
  // Formato anterior: un solo "accessory"
  if (av.accessory && !av.hat && !av.eyewear && !av.audio) {
    if (['glasses', 'sunglasses'].includes(av.accessory)) out.eyewear = av.accessory;
    if (['headphones', 'headset'].includes(av.accessory)) out.audio = av.accessory;
    if (['cap', 'beanie'].includes(av.accessory)) { out.hat = av.accessory; out.hatColor = av.accent || '#e5484d'; }
  }
  if (out.hairStyle === 'bald') out.hairStyle = 'buzz';
  for (const [k, list] of Object.entries(PARTS)) if (!list.includes(out[k])) out[k] = list[0];
  for (const k of COLOR_KEYS) if (out[k] != null && !HEX.test(out[k])) delete out[k];
  return out;
}

// Ficha al azar (para "Aleatorio"): piezas y colores de las paletas sugeridas
export function randomSpec(rand = Math.random) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const spec = {};
  for (const [k, list] of Object.entries(PARTS)) spec[k] = pick(list);
  for (const [k, list] of Object.entries(SPRITE_OPTIONS)) spec[k] = pick(list);
  // Accesorios con menos frecuencia para que no todos salgan "cargados"
  for (const k of ['hat', 'eyewear', 'audio', 'extra', 'facialHair']) if (rand() < 0.5) spec[k] = 'none';
  return spec;
}

export const SPEC_KEYS = [...Object.keys(PARTS), ...COLOR_KEYS, 'preset', 'sprite'];
