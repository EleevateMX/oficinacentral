// Hotel: salas personales en vista isométrica (estilo Habbo) con furnis.
// Este archivo es el contrato compartido entre servidor, motor y dibujo de furnis.
//
// Coordenadas
//   Casillas (x, y) en la cuadrícula de la sala; z = altura en "unidades" (1 unidad = 1 escalón).
//   Proyección a pantalla (en px, antes de zoom):
//     sx = (x - y) * TILE_W / 2
//     sy = (x + y) * TILE_H / 2 - z * Z_PX
//   El "origen" de una casilla es su vértice NORTE (el de arriba del rombo).
//   Rotaciones como Habbo: 0, 2, 4, 6 (0 = mira hacia +y/abajo-izquierda… ver ROT_DIR).
//   Un furni de huella w×l ocupa x..x+w-1, y..y+l-1 con rot 0/4; con rot 2/6 se intercambian (l×w).
//
// Avatares
//   Se reutilizan los personajes de la oficina (shared/sprite.js). Direcciones isométricas
//   (las 4 diagonales de pantalla) se dibujan con los cuadros 'down' | 'left' | 'right' | 'up'.

export const TILE_W = 64;
export const TILE_H = 32;
export const Z_PX = 32; // px por unidad de altura
export const WALL_H = 3.5; // altura de las paredes en unidades
import { OFFICIAL_MODELS } from './hotelOfficialModels.js';

export const toScreen = (x, y, z = 0) => ({ sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) - z * Z_PX });
export const fromScreen = (sx, sy, z = 0) => {
  const a = sx / (TILE_W / 2);
  const b = (sy + z * Z_PX) / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
};

// Hacia dónde ve cada rotación y la dirección de sprite que le toca
export const ROT_DIR = { 0: 'down', 2: 'left', 4: 'up', 6: 'right' };

// Modelos de sala: mapa de alturas como en Habbo ('x' = vacío, 0–9 = altura del piso).
// door: casilla de entrada (borde) y hacia dónde se mira al entrar.
export const ROOM_MODELS = {
  a: {
    name: 'Cuarto chico', size: '6×8',
    map: [
      'xxxxxxx',
      'x000000',
      'x000000',
      'x000000',
      '0000000',
      'x000000',
      'x000000',
      'x000000',
      'x000000',
    ],
    door: { x: 0, y: 4, rot: 2 },
  },
  b: {
    name: 'Estudio', size: '10×10',
    map: [
      'xxxxxxxxxxx',
      'x0000000000',
      'x0000000000',
      'x0000000000',
      'x0000000000',
      '00000000000',
      'x0000000000',
      'x0000000000',
      'x0000000000',
      'x0000000000',
      'x0000000000',
    ],
    door: { x: 0, y: 5, rot: 2 },
  },
  c: {
    name: 'Loft con tarima', size: '12×10',
    map: [
      'xxxxxxxxxxxxx',
      'x111110000000',
      'x111110000000',
      'x111110000000',
      'x000000000000',
      '0000000000000',
      'x000000000000',
      'x000000000000',
      'x000000000000',
      'x000000000000',
      'x000000000000',
    ],
    door: { x: 0, y: 5, rot: 2 },
  },
  d: {
    name: 'En L', size: '12×12',
    map: [
      'xxxxxxxxxxxxx',
      'x000000000000',
      'x000000000000',
      'x000000000000',
      'x000000000000',
      '0000000000000',
      'x00000xxxxxxx',
      'x00000xxxxxxx',
      'x00000xxxxxxx',
      'x00000xxxxxxx',
      'x00000xxxxxxx',
      'x00000xxxxxxx',
    ],
    door: { x: 0, y: 5, rot: 2 },
  },
  e: {
    name: 'Salón de eventos', size: '16×14',
    map: [
      'xxxxxxxxxxxxxxxxx',
      'x2222222222222222',
      'x2222222222222222',
      'x1111111111111111',
      'x0000000000000000',
      'x0000000000000000',
      'x0000000000000000',
      '00000000000000000',
      'x0000000000000000',
      'x0000000000000000',
      'x0000000000000000',
      'x0000000000000000',
      'x0000000000000000',
      'x0000000000000000',
      'x0000000000000000',
    ],
    door: { x: 0, y: 7, rot: 2 },
  },
  f: {
    name: 'Penthouse', size: '14×14',
    map: [
      'xxxxxxxxxxxxxxx',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
      '000000000000000',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
      'x00000000000000',
    ],
    door: { x: 0, y: 7, rot: 2 },
  },
};

// Salas oficiales (Oficina Central, Sala de juntas…): mapas propios con official: true
Object.assign(ROOM_MODELS, OFFICIAL_MODELS);
// Modelos que cualquiera puede elegir al crear su sala (a–f)
export const PUBLIC_MODELS = Object.keys(ROOM_MODELS).filter((k) => !ROOM_MODELS[k].official);
export const MAX_MODEL_SIZE = 40; // casillas por lado

// Revisa que un modelo sea válido: tamaño, caracteres, bordes vacíos y la puerta en el borde izquierdo
// con piso detrás. Devuelve null si está bien o el motivo.
export function validateModel(m) {
  if (!m || !Array.isArray(m.map) || !m.map.length) return 'Sin mapa';
  const rows = m.map, H = rows.length, W = Math.max(...rows.map((r) => r.length));
  if (W < 3 || H < 3 || W > MAX_MODEL_SIZE + 1 || H > MAX_MODEL_SIZE + 1) return 'Tamaño inválido';
  if (rows.some((r) => !/^[x0-9]+$/.test(r))) return 'Caracteres inválidos';
  const d = m.door;
  if (!d || d.x !== 0 || !Number.isInteger(d.y) || d.y < 1 || d.y >= H) return 'Puerta inválida';
  if (![0, 2, 4, 6].includes(d.rot)) return 'Rotación de puerta inválida';
  if (/[0-9]/.test(rows[0])) return 'La fila 0 debe estar vacía';
  for (let y = 1; y < H; y++) if (y !== d.y && rows[y][0] !== 'x') return 'La columna 0 debe estar vacía (salvo la puerta)';
  const inner = rows[d.y][1];
  if (!inner || inner === 'x' || rows[d.y][0] !== inner) return 'La puerta debe estar a la altura del piso de enfrente';
  return null;
}

// Lee el mapa de alturas: devuelve { W, H, heights: number[][] (NaN = vacío) }
export function parseModel(model) {
  const rows = (ROOM_MODELS[model] || ROOM_MODELS.a).map;
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const heights = rows.map((r) => Array.from({ length: W }, (_, x) => (r[x] && r[x] !== 'x' ? Number(r[x]) : NaN)));
  return { W, H, heights };
}

export const ACCESS = ['open', 'bell', 'password', 'closed']; // abierta, con timbre, con contraseña, solo dueño
export const MAX_ROOMS_PER_USER = 5;
export const MAX_FURNI_PER_ROOM = 250;
export const OFFICIAL_MAX_FURNI = 400; // salas oficiales (más grandes)
export const MAX_INVENTORY = 400;
export const ROOM_CAPACITY = 25;
export const OFFICIAL_CAPACITY = 50; // salas oficiales
export const CHAT_MODES = ['say', 'shout', 'whisper'];
export const WALK_SPEED = 2.2; // casillas por segundo
export const MAX_STEP = 1.5; // diferencia de altura máxima para subir/bajar un paso
