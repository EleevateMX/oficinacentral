// Hotel: salas OFICIALES de GTAHUB (la oficina de verdad, en versión isométrica).
// Datos puros + planOfficialRoom(): valida cada furni con canPlace / canPlaceWall (las mismas reglas
// que usa el servidor al colocar) y calcula su altura. El servidor las siembra al arrancar
// (server/hotelOfficial.js); si cambias un acomodo, sube OFFICIAL_VERSION para volver a sembrarlo.
//
// Rotaciones (hacia dónde ve el frente): 0 → +y · 2 → −x · 4 → −y · 6 → +x.
// Una silla "mira" a su mesa: silla en y−1 de la mesa → rot 0; en y+1 → rot 4; en x−1 → rot 6; en x+1 → rot 2.
import { ROOM_MODELS } from './hotel.js';
import { FURNI_BY_ID } from './hotelCatalog.js';
import { buildRoom, canPlace, canPlaceWall, roomAddItem, wallBase } from './hotelRoom.js';

export const OFFICIAL_VERSION = 1;

// ---------- Ayudantes de acomodo ----------
const f = (type, x, y, rot = 0, o = {}) => ({ type, x, y, rot, ...o });
const w = (type, wall, pos, h, o = {}) => ({ type, wall: { wall, pos, h }, ...o });
const ON = { state: 1 };

// Escritorio con PC (2 de ancho) y dos sillas. side 'n' = sillas detrás (y − 1, ven a la mesa: rot 0);
// side 's' = sillas delante (y + 1, rot 4). El frente del escritorio (pantallas) ve hacia las sillas.
function pcPod(x, y, side, chairColors, { chair = 'chair_gamer', desk = 'desk_pc' } = {}) {
  const north = side === 'n';
  const cy = north ? y - 1 : y + 1;
  return [
    f(desk, x, y, north ? 4 : 0, ON),
    f(chair, x, cy, north ? 0 : 4, { color: chairColors[0] }),
    f(chair, x + 1, cy, north ? 0 : 4, { color: chairColors[1] ?? chairColors[0] }),
  ];
}
// Escritorio de trabajo con laptops (línea Oficina)
function workPod(x, y, side, chairColors, deskColor = '#f1efe9') {
  const north = side === 'n';
  const cy = north ? y - 1 : y + 1;
  return [
    f('oficina_escritorio', x, y, north ? 4 : 0, { color: deskColor }),
    f('oficina_laptop', x, y, north ? 4 : 0, ON),
    f('oficina_laptop', x + 1, y, north ? 4 : 0, ON),
    f('oficina_silla', x, cy, north ? 0 : 4, { color: chairColors[0] }),
    f('oficina_silla', x + 1, cy, north ? 0 : 4, { color: chairColors[1] ?? chairColors[0] }),
  ];
}
// Mesa de 2×2 con 8 sillas alrededor (dos por lado)
function table8(x, y, chair = 'chair_basic', color = null, table = 'table_dining', tableColor = null) {
  const c = color ? { color } : {};
  return [
    f(table, x, y, 0, tableColor ? { color: tableColor } : {}),
    f(chair, x, y - 1, 0, c), f(chair, x + 1, y - 1, 0, c),
    f(chair, x, y + 2, 4, c), f(chair, x + 1, y + 2, 4, c),
    f(chair, x - 1, y, 6, c), f(chair, x - 1, y + 1, 6, c),
    f(chair, x + 2, y, 2, c), f(chair, x + 2, y + 1, 2, c),
  ];
}
// Rectángulo de losetas / pasto (piso que se camina)
function tiles(type, x0, y0, x1, y1, color, skip = () => false) {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!skip(x, y)) out.push(f(type, x, y, 0, { color: typeof color === 'function' ? color(x, y) : color }));
  return out;
}

// ---------- Oficina Central ----------
// Planta (x → derecha-abajo, y → izquierda-abajo; la pared del fondo derecha es y = 1, la izquierda x = 1):
//   Atrás:     Escenario (tarima a 2) · Engineering · Cocina
//   En medio:  Jardín interior · Gameplay / LiveOps · Staff / Orgs
//   Adelante:  Recepción (junto a la puerta) · Lounge hundido · Sala de juegos
const HQ = [
  // Pisos primero (se camina encima)
  ...tiles('cocina_floor', 21, 2, 29, 7, null),
  ...tiles('jardin_grass', 1, 9, 7, 14, '#7cbf4a'),
  f('gtahub_rug', 2, 18, 0),
  f('rug_round', 12, 19, 0, { color: '#FE3377' }), f('rug_round', 16, 19, 0, { color: '#2b2d38' }),
  f('rug_long', 7, 18, 2, { color: '#c0392b' }),
  f('rug_round', 26, 19, 0, { color: '#FFCC00' }),

  // Escenario / sala de juntas abierta (tarima a altura 2)
  f('fiesta_speaker', 2, 1, 0, ON), f('tv', 3, 1, 0, ON), f('fiesta_speaker', 5, 1, 0, ON),
  f('plant_big', 1, 1), f('lamp_floor', 7, 1, 0, ON), f('lamp_floor', 1, 5, 0, ON),
  f('table_small', 4, 3, 0, { color: '#2b2b2f' }), f('oficina_laptop', 4, 3, 4, ON),
  f('hub_flag', 7, 5, 0),
  // Público frente al escenario
  ...[2, 3, 5, 6].map((x) => f('chair_basic', x, 7, 4, { color: '#2b2b2f' })),

  // Engineering: dos filas de puestos gamer (una de espaldas, otra de frente)
  ...[9, 12, 15].flatMap((x) => pcPod(x, 1, 's', ['#141414', '#FE3377'])),
  ...[9, 12, 15].flatMap((x) => pcPod(x, 5, 'n', ['#FE3377', '#141414'])),
  f('urbana_shelf', 18, 1, 0, { color: '#141414' }), f('urbana_shelf', 19, 1, 0, { color: '#141414' }),
  f('oficina_archivero', 18, 5, 4, { color: '#9aa3ad' }), f('oficina_planta', 19, 5),
  f('neon_hex', 19, 3, 0, { state: 1, color: '#3a86ff' }),

  // Cocina
  f('fridge', 21, 1, 0), f('cocina_pantry', 22, 1, 0), f('cocina_counter', 23, 1, 0), f('cocina_coffee', 23, 1, 0, ON),
  f('cocina_stove', 24, 1, 0), f('cocina_sink', 25, 1, 0), f('cocina_counter', 26, 1, 0),
  f('fiesta_soda', 27, 1, 0, { state: 1, color: '#FE3377' }), f('fiesta_soda', 28, 1, 0, { state: 1, color: '#141414' }), f('oficina_garrafon', 29, 1, 0),
  f('bar_counter', 22, 4, 0, { color: '#2b2d38' }),
  ...[22, 23, 24].map((x) => f('stool_bar', x, 5, 0, { color: '#FE3377' })),
  f('cocina_table', 27, 4, 0, { color: '#c0392b' }), f('chair_basic', 26, 4, 6), f('chair_basic', 28, 4, 2),
  f('cocina_table', 27, 6, 0, { color: '#c0392b' }), f('chair_basic', 26, 6, 6), f('chair_basic', 28, 6, 2),

  // Mamparas y libreros que separan las áreas de atrás de las de en medio (con pasillos)
  f('oficina_mampara', 9, 8, 0, { color: '#5b6b8a' }), f('oficina_mampara', 11, 8, 0, { color: '#5b6b8a' }),
  f('oficina_mampara', 15, 8, 0, { color: '#5b6b8a' }), f('oficina_mampara', 17, 8, 0, { color: '#5b6b8a' }),
  f('bookshelf', 22, 8, 0, { color: '#7a4a2b' }), f('plant_big', 24, 8), f('bookshelf', 27, 8, 0, { color: '#7a4a2b' }),
  f('oficina_planta', 8, 8), f('oficina_planta', 20, 8),

  // Jardín interior (como el de la oficina)
  f('jardin_fountain', 3, 10, 0, ON),
  f('jardin_bench', 6, 10, 2, { color: '#b5794a' }), f('jardin_bench', 1, 10, 6, { color: '#b5794a' }),
  f('jardin_flowerbed', 3, 9, 0, { color: '#FE3377' }), f('jardin_flowerbed', 3, 13, 0, { color: '#FFCC00' }),
  f('jardin_lamp', 1, 9, 0, ON), f('jardin_lamp', 7, 9, 0, ON), f('plant_big', 1, 13), f('plant_big', 7, 13),

  // Gameplay / LiveOps / Testing: puestos gamer de frente
  ...[9, 12, 15, 18].flatMap((x, i) => pcPod(x, 11, 'n', [['#3a86ff', '#FE3377'], ['#FFCC00', '#3a86ff'], ['#FE3377', '#FFCC00'], ['#3a86ff', '#FE3377']][i])),
  ...[9, 12, 15, 18].flatMap((x, i) => pcPod(x, 14, 'n', [['#FE3377', '#3a86ff'], ['#3a86ff', '#FFCC00'], ['#FFCC00', '#FE3377'], ['#FE3377', '#3a86ff']][i])),

  // Staff / Orgs: escritorios blancos con laptops
  ...[21, 24, 27].flatMap((x) => workPod(x, 11, 'n', ['#2b2d38', '#FE3377'])),
  ...[21, 24, 27].flatMap((x) => workPod(x, 14, 'n', ['#FE3377', '#2b2d38'])),
  f('oficina_archivero', 29, 12, 2, { color: '#e8e3d8' }),

  // Recepción junto a la puerta
  f('bar_counter', 6, 20, 2, { color: '#2b2d38' }), f('oficina_silla', 7, 21, 2, { color: '#FE3377' }),
  f('gtahub_statue', 2, 16), f('neon_hex', 5, 16, 0, { state: 1, color: '#FE3377' }),
  f('plant_big', 1, 16), f('plant_big', 7, 16),
  f('sofa_2', 1, 21, 6, { color: '#FE3377' }), f('plant_small', 1, 23), f('plant_small', 4, 23, 0, { color: '#FE3377' }),
  f('lamp_floor', 7, 23, 0, ON),

  // Lounge hundido: sofás, rocola y mesas de centro
  f('sofa_3', 11, 17, 0, { color: '#2b2d38' }), f('sofa_3', 15, 17, 0, { color: '#FE3377' }),
  f('table_coffee', 12, 19, 0), f('table_coffee', 16, 19, 0, { color: '#f4f4f6' }),
  f('sofa_3', 11, 22, 4, { color: '#FE3377' }), f('sofa_3', 15, 22, 4, { color: '#2b2d38' }),
  f('beanbag', 10, 20, 0, { color: '#FFCC00' }), f('beanbag', 18, 20, 0, { color: '#3a86ff' }),
  f('jukebox', 14, 17, 0, ON), f('lamp_floor', 10, 17, 0, ON), f('lamp_floor', 18, 17, 0, ON),
  f('plant_small', 14, 22, 0, { color: '#FE3377' }),
  f('oficina_planta', 9, 16), f('oficina_planta', 19, 16), f('oficina_planta', 9, 23), f('oficina_planta', 19, 23),

  // Sala de juegos (esquina de adelante)
  f('oficina_mampara', 21, 16, 0, { color: '#b8656f' }), f('oficina_mampara', 23, 16, 0, { color: '#b8656f' }),
  f('arcade', 21, 17, 0, { state: 1, color: '#FE3377' }), f('arcade', 22, 17, 0, { state: 1, color: '#FFCC00' }), f('arcade', 23, 17, 0, { state: 1, color: '#3a86ff' }),
  f('tv', 26, 17, 0, ON), f('fiesta_soda', 29, 17, 2, { state: 1, color: '#3a86ff' }),
  f('beanbag', 26, 20, 0, { color: '#FE3377' }), f('beanbag', 27, 20, 0, { color: '#FFCC00' }), f('sofa_2', 26, 22, 4, { color: '#2b2d38' }),
  f('table_small', 23, 21, 0, { color: '#2b2b2f' }), f('dice', 23, 21, 0, { state: 6 }),
  f('chair_gamer', 22, 21, 6, { color: '#FE3377' }), f('chair_gamer', 24, 21, 2, { color: '#3a86ff' }),
  f('trophy', 29, 19, 0), f('neon_hex', 21, 22, 0, { state: 1, color: '#FFCC00' }),

  // Pared derecha (y = 1): letrero, ventanas, pizarrón y cocina
  w('neon_sign', 'r', 3, 1.75, ON), w('window', 'r', 9, 1), w('oficina_pizarron', 'r', 12, 0.9), w('window', 'r', 15, 1),
  w('clock', 'r', 20, 1.6), w('cocina_spices', 'r', 24, 1.3), w('cocina_utensils', 'r', 26, 1.2), w('poster_gtahub', 'r', 28, 1.4),
  // Pared izquierda (x = 1)
  w('poster_gtahub', 'l', 3, 1.4), w('window', 'l', 6, 1), w('window', 'l', 11, 0.9), w('clock', 'l', 15, 1.6),
  w('frame_photo', 'l', 17, 1.2, { color: '#FE3377' }), w('neon_sign', 'l', 20, 1.6, ON), w('frame_photo', 'l', 23, 1.2, { color: '#3a86ff' }),
];

// ---------- Sala de juntas ----------
const JUNTAS = [
  // Mesa larga: tres mesas de comedor juntas (6×2) con sillas alrededor
  f('table_dining', 5, 6, 0, { color: '#2b2b2f' }), f('table_dining', 7, 6, 0, { color: '#2b2b2f' }), f('table_dining', 9, 6, 0, { color: '#2b2b2f' }),
  ...[5, 6, 7, 8, 9, 10].map((x) => f('oficina_silla', x, 5, 0, { color: '#2b2d38' })),
  ...[5, 6, 7, 8, 9, 10].map((x) => f('oficina_silla', x, 8, 4, { color: '#2b2d38' })),
  f('oficina_silla', 4, 6, 6, { color: '#FE3377' }), f('oficina_silla', 4, 7, 6, { color: '#FE3377' }),
  f('oficina_silla', 11, 6, 2, { color: '#FE3377' }), f('oficina_silla', 11, 7, 2, { color: '#FE3377' }),
  f('oficina_laptop', 6, 6, 0, ON), f('oficina_laptop', 9, 7, 4, ON), f('cocina_coffee', 7, 7, 0, ON),
  // Tarima de quien presenta
  f('tv', 6, 1, 0, ON), f('tv', 9, 1, 0, ON), f('plant_big', 1, 1), f('plant_big', 15, 1),
  f('lamp_floor', 4, 1, 0, ON), f('lamp_floor', 12, 1, 0, ON), f('hub_flag', 14, 2, 0),
  // Lado: café y archiveros
  f('oficina_archivero', 15, 5, 2, { color: '#9aa3ad' }), f('oficina_archivero', 15, 6, 2, { color: '#9aa3ad' }), f('oficina_garrafon', 15, 8, 2),
  f('cocina_counter', 15, 10, 2), f('cocina_coffee', 15, 10, 2, ON), f('oficina_planta', 15, 12),
  f('rug_round', 6, 11, 0, { color: '#FE3377' }),
  f('sofa_2', 5, 12, 4, { color: '#2b2d38' }), f('table_small', 7, 12, 0, { color: '#2b2b2f' }), f('sofa_2', 8, 12, 4, { color: '#2b2d38' }),
  f('bookshelf', 1, 4, 6, { color: '#7a4a2b' }), f('bookshelf', 1, 6, 6, { color: '#7a4a2b' }), f('oficina_planta', 1, 8),
  f('oficina_planta', 1, 12), f('plant_small', 12, 12, 0, { color: '#FE3377' }), f('oficina_copiadora', 11, 12, 4), f('plant_big', 13, 12),
  // Paredes
  w('oficina_pizarron', 'r', 2, 1), w('neon_sign', 'r', 7, 1.9, ON), w('clock', 'r', 12, 1.9),
  w('window', 'l', 2, 1.2), w('poster_gtahub', 'l', 11, 1.2), w('frame_photo', 'l', 13, 1.2, { color: '#3a86ff' }),
];

// ---------- Sala de juegos ----------
const JUEGOS = [
  // Pista de baile 6×4 frente al DJ
  ...[11, 13, 15].flatMap((x) => [f('fiesta_dancefloor', x, 5, 0, ON), f('fiesta_dancefloor', x, 7, 0, ON)]),
  f('fiesta_dj', 13, 2, 0, ON), f('fiesta_speaker', 11, 1, 0, ON), f('fiesta_speaker', 17, 1, 0, ON),
  f('fiesta_discoball', 14, 6, 0, ON), f('neon_hex', 12, 1, 0, { state: 1, color: '#FE3377' }), f('neon_hex', 16, 1, 0, { state: 1, color: '#3a86ff' }),
  f('fiesta_balloons', 18, 4, 0, { color: '#FFCC00' }),
  // Maquinitas en la pared
  ...[['#FE3377', 2], ['#FFCC00', 3], ['#3a86ff', 4], ['#FE3377', 5], ['#FFCC00', 6], ['#3a86ff', 7]].map(([c, x]) => f('arcade', x, 1, 0, { state: 1, color: c })),
  f('plant_big', 1, 1), f('plant_big', 9, 1),
  // Mesas de juego (tipo ping-pong) con balón y bancos
  f('table_dining', 3, 5, 0, { color: '#2b2b2f' }), f('deportes_ball', 4, 6, 0),
  f('stool_bar', 3, 4, 0, { color: '#FE3377' }), f('stool_bar', 4, 4, 0, { color: '#FE3377' }), f('stool_bar', 3, 7, 0, { color: '#c0c6cf' }), f('stool_bar', 4, 7, 0, { color: '#c0c6cf' }),
  f('table_dining', 7, 5, 0, { color: '#2b2b2f' }), f('dice', 7, 5, 0, { state: 3 }), f('dice', 8, 6, 0, { state: 5 }),
  f('stool_bar', 7, 4, 0, { color: '#FE3377' }), f('stool_bar', 8, 4, 0, { color: '#FE3377' }), f('stool_bar', 7, 7, 0, { color: '#c0c6cf' }), f('stool_bar', 8, 7, 0, { color: '#c0c6cf' }),
  // Rincón de consolas
  f('rug_round', 3, 12, 0, { color: '#2b2d38' }), f('tv', 3, 10, 0, ON),
  ...[['#FE3377', 2], ['#FFCC00', 3], ['#3a86ff', 4], ['#2fb67c', 5]].map(([c, x]) => f('beanbag', x, 14, 0, { color: c })),
  f('lamp_lava', 1, 10, 0, ON), f('lamp_lava', 6, 10, 0, { state: 1, color: '#3a86ff' }),
  // Barra de botanas
  f('fiesta_soda', 18, 9, 2, { state: 1, color: '#FE3377' }), f('fiesta_icecream', 18, 10, 2, ON), f('fiesta_soda', 18, 11, 2, { state: 1, color: '#3a86ff' }),
  f('bar_counter', 14, 11, 0, { color: '#2b2d38' }), f('fiesta_cake', 15, 11, 0, ON),
  ...[14, 15, 16].map((x) => f('stool_bar', x, 12, 0, { color: '#FE3377' })),
  f('deportes_hoop', 9, 15, 0), f('deportes_ball', 11, 13, 0, ON), f('deportes_mat', 6, 14, 2, { color: '#FE3377' }),
  f('sofa_3', 2, 16, 4, { color: '#FE3377' }), f('plant_big', 1, 16), f('lamp_lava', 5, 16, 0, { state: 1, color: '#2fb67c' }), f('trophy', 17, 14, 0), f('plant_small', 8, 15, 0, { color: '#FE3377' }),
  // Paredes
  w('neon_sign', 'r', 13, 1.9, ON), w('fiesta_papel', 'r', 9, 1.9, { color: '#FE3377' }), w('fiesta_papel', 'r', 16, 1.9, { color: '#FFCC00' }),
  w('poster_gtahub', 'r', 4, 1.9), w('deportes_scoreboard', 'l', 3, 1.6, ON), w('poster_gtahub', 'l', 7, 1.2), w('frame_photo', 'l', 14, 1.2, { color: '#FE3377' }),
];

// ---------- Jardín GTAHUB ----------
const JARDIN = [
  // Terraza elevada con camastros y sombrillas
  f('jardin_lounger', 2, 3, 0, { color: '#FE3377' }), f('jardin_umbrella', 3, 1, 0, { color: '#FE3377' }), f('jardin_lounger', 4, 3, 0, { color: '#FFCC00' }),
  f('jardin_umbrella', 5, 1, 0, { color: '#FFCC00' }), f('jardin_lounger', 6, 3, 0, { color: '#f4f4f6' }),
  f('plant_big', 1, 1), f('plant_big', 7, 1), f('table_small', 3, 6, 0, { color: '#f4f4f6' }), f('beanbag', 2, 6, 0, { color: '#FE3377' }), f('beanbag', 4, 6, 0, { color: '#FFCC00' }),
  // Alberca con camastros
  f('jardin_pool', 10, 2, 0), f('jardin_lounger', 9, 6, 4, { color: '#3a86ff' }), f('jardin_lounger', 11, 6, 4, { color: '#FE3377' }), f('jardin_lounger', 13, 6, 4, { color: '#FFCC00' }),
  f('jardin_umbrella', 14, 2, 0, { color: '#3a86ff' }), f('jardin_flowerbed', 10, 1, 0, { color: '#FFCC00' }),
  // Fuente al centro con bancas mirándola y camino de piedra
  f('jardin_fountain', 10, 10, 0, ON),
  f('jardin_bench', 10, 8, 0, { color: '#b5794a' }), f('jardin_bench', 10, 13, 4, { color: '#b5794a' }),
  f('jardin_bench', 8, 10, 6, { color: '#2fb67c' }), f('jardin_bench', 13, 10, 2, { color: '#2fb67c' }),
  f('jardin_lamp', 8, 8, 0, ON), f('jardin_lamp', 13, 8, 0, ON), f('jardin_lamp', 8, 13, 0, ON), f('jardin_lamp', 13, 13, 0, ON),
  // Jardineras y árboles
  f('jardin_flowerbed', 2, 8, 0, { color: '#FE3377' }), f('jardin_flowerbed', 4, 8, 0, { color: '#8e5cf7' }),
  f('jardin_flowerbed', 17, 6, 2, { color: '#FFCC00' }), f('jardin_flowerbed', 17, 10, 2, { color: '#FE3377' }),
  f('plant_big', 1, 9), f('plant_big', 20, 5), f('plant_big', 20, 12), f('cactus', 19, 15), f('cactus', 16, 17),
  f('zen_bonsai', 6, 8), f('oficina_planta', 1, 17), f('plant_big', 5, 17), f('plant_big', 11, 17),
  // Mesa de picnic y rincón zen
  f('cabana_table', 3, 13, 0), f('cabana_stool', 3, 12), f('cabana_stool', 4, 12), f('cabana_stool', 3, 14), f('cabana_stool', 4, 14),
  f('zen_fountain', 16, 14, 0, ON), f('zen_lantern', 15, 15, 0, ON), f('zen_lantern', 18, 12, 0, ON),
  f('gtahub_statue', 7, 15), f('jardin_umbrella', 3, 16, 0, { color: '#2fb67c' }),
  // Paredes
  w('jardin_birdhouse', 'r', 9, 1.9), w('jardin_birdhouse', 'l', 4, 1.9, { color: '#FE3377' }), w('poster_gtahub', 'l', 9, 1.2),
  w('jardin_birdhouse', 'l', 16, 1.8, { color: '#3a86ff' }), w('neon_sign', 'r', 3, 1.9, ON),
];

// ---------- Comedor ----------
const COMEDOR = [
  // Cocina en la pared del fondo
  f('fridge', 1, 1, 0), f('fridge', 2, 1, 0, { color: '#FE3377' }), f('cocina_pantry', 3, 1, 0), f('cocina_counter', 4, 1, 0), f('cocina_stove', 5, 1, 0),
  f('cocina_stove', 6, 1, 0), f('cocina_sink', 7, 1, 0), f('cocina_counter', 8, 1, 0), f('cocina_coffee', 8, 1, 0, ON), f('cocina_counter', 9, 1, 0),
  f('fiesta_soda', 11, 1, 0, { state: 1, color: '#FE3377' }), f('fiesta_icecream', 12, 1, 0, ON), f('oficina_garrafon', 13, 1, 0), f('plant_big', 14, 1),
  // Barra
  f('bar_counter', 4, 3, 0, { color: '#7a4a2b' }), f('bar_counter', 7, 3, 0, { color: '#7a4a2b' }),
  ...[4, 5, 6, 7, 8, 9].map((x) => f('stool_bar', x, 4, 0, { color: x % 2 ? '#FE3377' : '#c0c6cf' })),
  // Mesas de comedor
  ...table8(3, 7, 'chair_basic', '#b5794a', 'table_dining', '#b5794a'),
  ...table8(8, 7, 'chair_basic', '#b5794a', 'table_dining', '#b5794a'),
  f('fiesta_cake', 3, 7, 0, ON), f('cocina_coffee', 9, 8, 0, ON),
  // Mesitas con mantel
  f('cocina_table', 13, 5, 0, { color: '#c0392b' }), f('chair_basic', 12, 5, 6, { color: '#2b2b2f' }), f('chair_basic', 14, 5, 2, { color: '#2b2b2f' }),
  f('cocina_table', 13, 8, 0, { color: '#2f6fb0' }), f('chair_basic', 12, 8, 6, { color: '#2b2b2f' }), f('chair_basic', 14, 8, 2, { color: '#2b2b2f' }),
  f('cocina_table', 13, 11, 0, { color: '#2fb67c' }), f('chair_basic', 12, 11, 6, { color: '#2b2b2f' }), f('chair_basic', 14, 11, 2, { color: '#2b2b2f' }),
  f('plant_big', 1, 12), f('oficina_planta', 6, 12), f('plant_small', 1, 4, 0, { color: '#FE3377' }),
  // Paredes
  w('cocina_spices', 'r', 4, 1.3), w('cocina_utensils', 'r', 6, 1.2), w('clock', 'r', 10, 1.8), w('poster_gtahub', 'r', 12, 1.9),
  w('window', 'l', 2, 1), w('window', 'l', 5, 1), w('frame_photo', 'l', 10, 1.2, { color: '#2fb67c' }), w('window', 'l', 11, 1),
];

// ---------- Lobby VIP HUB ----------
// Alfombra roja desde la puerta, da vuelta y sube a la tarima del trono (pared del fondo)
const VIP = [
  f('hub_rug', 1, 11, 2), f('hub_rug', 4, 11, 2), f('hub_rug', 7, 11, 2), f('hub_rug', 10, 11, 2),
  f('hub_rug', 12, 8, 0), f('hub_rug', 12, 5, 0),
  f('gtahub_rug', 5, 13, 0),
  // Cordones VIP a los lados de la alfombra
  ...[3, 5, 7, 9].flatMap((x) => [f('hub_rope', x, 10, 2), f('hub_rope', x, 12, 2)]),
  ...[5, 7, 9].flatMap((y) => [f('hub_rope', 11, y, 0), f('hub_rope', 13, y, 0)]),
  // Tarima del trono
  f('hub_throne', 12, 1, 0), f('hub_crown_lamp', 11, 1, 0, ON), f('hub_crown_lamp', 13, 1, 0, ON),
  f('hub_dragon', 10, 1, 0), f('hub_dragon', 14, 1, 0),
  f('hub_holo', 9, 1, 0, ON), f('hub_holo', 15, 1, 0, ON), f('hub_flag', 9, 4, 0), f('hub_flag', 15, 4, 0),
  // Salones VIP a los lados
  f('hub_arch', 1, 2, 6, ON),
  f('hub_sofa_vip', 3, 1, 0, { color: '#FE3377' }), f('hub_sofa_vip', 6, 1, 0, { color: '#141414' }), f('table_coffee', 4, 3, 0, { color: '#f4f4f6' }),
  f('hub_sofa_vip', 1, 15, 4, { color: '#7b2cbf' }), f('hub_sofa_vip', 3, 15, 4, { color: '#FE3377' }), f('throne', 6, 14, 0),
  f('table_coffee', 1, 13, 0, { color: '#f4f4f6' }),
  f('gtahub_car', 13, 12, 0, { color: '#FE3377' }), f('gtahub_statue', 1, 9), f('gtahub_statue', 1, 13),
  f('bar_counter', 17, 6, 2, { color: '#2b2d38' }), ...[6, 7, 8].map((y) => f('stool_bar', 16, y, 0, { color: '#FE3377' })),
  f('hub_trophy', 16, 1, 0), f('hub_trophy', 17, 1, 0), f('trophy', 17, 3, 0), f('hub_trophy', 10, 16, 0),
  f('plant_big', 1, 7), f('plant_big', 17, 10), f('plant_big', 8, 16), f('neon_hex', 7, 3, 0, { state: 1, color: '#FFCC00' }),
  f('neon_hex', 16, 14, 0, { state: 1, color: '#FE3377' }), f('hub_teleport', 17, 16, 0),
  // Paredes
  w('hub_neon_wall', 'r', 11, 1.9, ON), w('poster_gtahub', 'r', 4, 1.6), w('poster_gtahub', 'r', 16, 1.6),
  w('hub_neon_wall', 'l', 5, 1.9, ON), w('hub_neon_wall', 'l', 14, 1.9, ON), w('frame_photo', 'l', 9, 1.4, { color: '#FE3377' }),
];

// Salas oficiales en el orden en que salen en el navegador
export const OFFICIAL_ROOMS = [
  { key: 'hq', model: 'hq', name: 'Oficina Central', description: 'La oficina de GTAHUB: recepción, Engineering, Gameplay, Staff, lounge y cocina', wallColor: '#e7dfd3', floorColor: '#b59a7a', items: HQ },
  { key: 'juntas', model: 'juntas', name: 'Sala de juntas', description: 'Mesa grande para las juntas del equipo', wallColor: '#d9d4ec', floorColor: '#3f4652', items: JUNTAS },
  { key: 'juegos', model: 'juegos', name: 'Sala de juegos', description: 'Maquinitas, pista de baile y DJ', wallColor: '#2b2d38', floorColor: '#3f4652', items: JUEGOS },
  { key: 'jardin', model: 'jardin', name: 'Jardín GTAHUB', description: 'Fuente, alberca y bancas para tomar aire', wallColor: '#cfe7dd', floorColor: '#6aa84f', items: JARDIN },
  { key: 'comedor', model: 'comedor', name: 'Comedor', description: 'Para comer y platicar', wallColor: '#ffd6e4', floorColor: '#d8c7ae', items: COMEDOR },
  { key: 'vip', model: 'vip', name: 'Lobby VIP HUB', description: 'Rarezas exclusivas HUB, trono y alfombra roja', wallColor: '#141414', floorColor: '#3b3346', items: VIP },
];
export const OFFICIAL_BY_KEY = Object.fromEntries(OFFICIAL_ROOMS.map((r) => [r.key, r]));
export const FLAGSHIP_KEY = 'hq';

// Valida y acomoda una sala oficial: { items: [{type,x,y,z,rot,state,color,wall}], errors: [texto] }.
//   existing: furnis que ya están en la sala (no sembrados) para no encimarse con ellos.
export function planOfficialRoom(spec, existing = []) {
  const m = ROOM_MODELS[spec.model];
  const errors = [];
  if (!m) return { items: [], errors: [`Modelo ${spec.model} no existe`] };
  const grid = buildRoom(spec.model, existing.filter((i) => !i.wall));
  const items = [];
  spec.items.forEach((s, n) => {
    const def = FURNI_BY_ID[s.type];
    const tag = `${spec.key}#${n} ${s.type}`;
    if (!def) { errors.push(`${tag}: no existe en el catálogo`); return; }
    if (s.color != null && !def.colors?.includes(s.color)) { errors.push(`${tag}: color ${s.color} no es de este furni`); return; }
    const state = Math.max(0, Math.min((def.states || 1) - 1, s.state ?? (def.interact === 'dice' ? 1 : 0)));
    if (s.wall) {
      const { wall, pos, h } = s.wall;
      const v = canPlaceWall(grid, def, wall, pos, h);
      if (!v.ok) { errors.push(`${tag} (${wall}${pos}): ${v.reason}`); return; }
      items.push({ type: s.type, x: null, y: null, z: wallBase(grid, wall, pos) + h, rot: wall === 'l' ? 2 : 4, state, color: s.color ?? null, wall: { wall, pos, h } });
      return;
    }
    const v = canPlace(grid, def, s.x, s.y, s.rot);
    if (!v.ok) { errors.push(`${tag} (${s.x},${s.y} r${s.rot}): ${v.reason}`); return; }
    const it = { id: `seed${n}`, type: s.type, x: s.x, y: s.y, z: v.z, rot: s.rot, state, color: s.color ?? null, wall: null };
    roomAddItem(grid, it);
    items.push(it);
  });
  return { items: items.map(({ id, ...rest }) => rest), errors, grid };
}
