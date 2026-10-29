// Hotel: salas OFICIALES de la comunidad (Charla General, Roleplay, League of Legends…).
// Datos puros + planOfficialRoom(): valida cada furni con canPlace / canPlaceWall (las mismas reglas
// que usa el servidor al colocar) y calcula su altura. El servidor las siembra al arrancar
// (server/hotelOfficial.js); si cambias un acomodo, sube OFFICIAL_VERSION para volver a sembrarlo.
//
// Rotaciones (hacia dónde ve el frente): 0 → +y · 2 → −x · 4 → −y · 6 → +x.
// Una silla "mira" a su mesa: silla en y−1 de la mesa → rot 0; en y+1 → rot 4; en x−1 → rot 6; en x+1 → rot 2.
import { ROOM_MODELS } from './hotel.js';
import { FURNI_BY_ID } from './hotelCatalog.js';
import { buildRoom, canPlace, canPlaceWall, roomAddItem, wallBase } from './hotelRoom.js';

export const OFFICIAL_VERSION = 2;

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

// Árbol de bloques (Minecraft): tronco y dos bloques de hojas apilados
const blockTree = (x, y) => [f('plastik_cube', x, y, 0, { color: '#ff8a1f' }), f('plastik_cube', x, y, 0, { color: '#22c55e' }), f('plastik_cube', x, y, 0, { color: '#22c55e' })];

// ---------- Charla General ----------
// El lobby grande (antes "Oficina Central"). Planta:
//   Atrás:     Escenario de avisos (tarima a 2) · Mesas de charla · Cafetería
//   En medio:  Jardín interior · Mesas de juegos de mesa · Salas de estar
//   Adelante:  Recepción (junto a la puerta, con Rita) · Lounge hundido · Rincón de maquinitas
const CHARLA = [
  // Pisos primero (se camina encima)
  ...tiles('cocina_floor', 21, 2, 29, 7, null),
  ...tiles('jardin_grass', 1, 9, 7, 14, '#7cbf4a'),
  f('rug_round', 2, 18, 0, { color: '#FFCC00' }),
  f('rug_round', 12, 19, 0, { color: '#FE3377' }), f('rug_round', 16, 19, 0, { color: '#2b2d38' }),
  f('rug_long', 7, 18, 2, { color: '#c0392b' }),
  f('rug_round', 26, 19, 0, { color: '#FFCC00' }),
  f('hielo_rug', 22, 11, 0, { color: '#efe6d6' }),

  // Escenario de avisos y eventos (tarima a 2)
  f('fiesta_speaker', 2, 1, 0, ON), f('tv', 3, 1, 0, ON), f('fiesta_speaker', 5, 1, 0, ON),
  f('plant_big', 1, 1), f('lamp_floor', 7, 1, 0, ON), f('lamp_floor', 1, 5, 0, ON),
  f('table_small', 4, 3, 0, { color: '#2b2b2f' }), f('oficina_laptop', 4, 3, 4, ON),
  f('fiesta_balloons', 7, 5, 0, { color: '#FE3377' }),
  ...[2, 3, 5, 6].map((x) => f('chair_basic', x, 7, 4, { color: '#2b2b2f' })),

  // Mesas de charla
  ...table8(10, 4, 'chair_basic', '#f4f4f6', 'table_dining', '#b5794a'),
  f('cocina_coffee', 11, 5, 0, ON), f('plant_small', 9, 1, 0, { color: '#FE3377' }), f('lamp_floor', 12, 1, 0, ON),
  f('sofa_3', 14, 1, 0, { color: '#2b2d38' }), f('table_coffee', 15, 3, 0, { color: '#f4f4f6' }), f('sofa_3', 14, 5, 4, { color: '#FE3377' }),
  f('armchair', 18, 3, 2, { color: '#3d7be0' }), f('armchair', 18, 4, 2, { color: '#e05ca5' }),
  f('urbana_shelf', 19, 1, 0, { color: '#141414' }), f('urbana_shelf', 20, 1, 0, { color: '#141414' }),
  f('neon_hex', 20, 4, 0, { state: 1, color: '#3a86ff' }), f('oficina_planta', 19, 6),

  // Cafetería
  f('fridge', 21, 1, 0), f('cocina_pantry', 22, 1, 0), f('cocina_counter', 23, 1, 0), f('cocina_coffee', 23, 1, 0, ON),
  f('cocina_stove', 24, 1, 0), f('cocina_sink', 25, 1, 0), f('cocina_counter', 26, 1, 0),
  f('fiesta_soda', 27, 1, 0, { state: 1, color: '#FE3377' }), f('fiesta_soda', 28, 1, 0, { state: 1, color: '#141414' }), f('oficina_garrafon', 29, 1, 0),
  f('bar_counter', 22, 4, 0, { color: '#2b2d38' }),
  ...[22, 23, 24].map((x) => f('stool_bar', x, 5, 0, { color: '#FE3377' })),
  f('cocina_table', 27, 4, 0, { color: '#c0392b' }), f('chair_basic', 26, 4, 6), f('chair_basic', 28, 4, 2),
  f('cocina_table', 27, 6, 0, { color: '#c0392b' }), f('chair_basic', 26, 6, 6), f('chair_basic', 28, 6, 2),

  // Jardineras y libreros que separan las áreas de atrás de las de en medio (con pasillos)
  f('jardin_flowerbed', 9, 8, 0, { color: '#FE3377' }), f('jardin_flowerbed', 11, 8, 0, { color: '#FFCC00' }),
  f('jardin_flowerbed', 15, 8, 0, { color: '#8e5cf7' }), f('jardin_flowerbed', 17, 8, 0, { color: '#FE3377' }),
  f('bookshelf', 22, 8, 0, { color: '#7a4a2b' }), f('plant_big', 24, 8), f('bookshelf', 27, 8, 0, { color: '#7a4a2b' }),
  f('oficina_planta', 8, 8), f('oficina_planta', 20, 8),

  // Jardín interior
  f('jardin_fountain', 3, 10, 0, ON),
  f('jardin_bench', 6, 10, 2, { color: '#b5794a' }), f('jardin_bench', 1, 10, 6, { color: '#b5794a' }),
  f('jardin_flowerbed', 3, 9, 0, { color: '#FE3377' }), f('jardin_flowerbed', 3, 13, 0, { color: '#FFCC00' }),
  f('jardin_lamp', 1, 9, 0, ON), f('jardin_lamp', 7, 9, 0, ON), f('plant_big', 1, 13), f('plant_big', 7, 13),

  // Mesas de juegos de mesa
  ...table8(10, 11, 'chair_basic', '#2b2b2f', 'table_dining', '#2b2b2f'),
  f('dice', 10, 11, 0, { state: 4 }), f('dice', 11, 12, 0, { state: 2 }),
  ...table8(15, 11, 'chair_basic', '#b5794a', 'table_dining', '#b5794a'),
  f('fiesta_cake', 15, 11, 0, ON), f('cocina_coffee', 16, 12, 0, ON),
  f('plant_big', 19, 10), f('beanbag', 19, 13, 0, { color: '#FFCC00' }), f('beanbag', 19, 14, 0, { color: '#3a86ff' }),

  // Salas de estar
  f('hielo_sofa', 21, 10, 0, { color: '#d9c7a7' }), f('hielo_table', 22, 12, 0), f('hielo_sofa', 21, 14, 4, { color: '#efe6d6' }),
  f('hielo_armchair', 24, 12, 2, { color: '#cfe3ea' }), f('hielo_lamp', 24, 10, 0, ON),
  f('puravida_sofa', 26, 10, 0, { color: '#3ccfb4' }), f('puravida_table', 26, 12, 0, { color: '#ffd84d' }), f('puravida_table', 27, 12, 0, { color: '#ffd84d' }),
  f('puravida_sofa', 26, 14, 4, { color: '#ff6b5e' }), f('puravida_chair', 28, 12, 2, { color: '#4aa8ff' }), f('puravida_lamp', 29, 10, 0, { state: 1, color: '#ffd84d' }),

  // Recepción junto a la puerta (Rita)
  f('bar_counter', 6, 20, 2, { color: '#2b2d38' }), f('oficina_silla', 7, 21, 2, { color: '#FE3377' }),
  f('cristal_geoda', 2, 16, 0, { state: 1, color: '#ff7fb6' }), f('neon_hex', 5, 16, 0, { state: 1, color: '#FE3377' }),
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

  // Rincón de maquinitas (esquina de adelante)
  f('arcade', 21, 17, 0, { state: 1, color: '#FE3377' }), f('arcade', 22, 17, 0, { state: 1, color: '#FFCC00' }), f('arcade', 23, 17, 0, { state: 1, color: '#3a86ff' }),
  f('tv', 26, 17, 0, ON), f('fiesta_soda', 29, 17, 2, { state: 1, color: '#3a86ff' }),
  f('beanbag', 26, 20, 0, { color: '#FE3377' }), f('beanbag', 27, 20, 0, { color: '#FFCC00' }), f('sofa_2', 26, 22, 4, { color: '#2b2d38' }),
  f('table_small', 23, 21, 0, { color: '#2b2b2f' }), f('dice', 23, 21, 0, { state: 6 }),
  f('chair_gamer', 22, 21, 6, { color: '#FE3377' }), f('chair_gamer', 24, 21, 2, { color: '#3a86ff' }),
  f('trophy', 29, 19, 0), f('neon_hex', 21, 22, 0, { state: 1, color: '#FFCC00' }),

  // Pared derecha (y = 1)
  w('shelf_wall', 'r', 3, 1.4), w('window', 'r', 9, 1), w('oficina_pizarron', 'r', 12, 0.9), w('window', 'r', 15, 1),
  w('clock', 'r', 20, 1.6), w('cocina_spices', 'r', 24, 1.3), w('cocina_utensils', 'r', 26, 1.2), w('puravida_poster', 'r', 28, 1.4),
  // Pared izquierda (x = 1)
  w('urbana_art', 'l', 3, 1.4, { color: '#FFCC00' }), w('window', 'l', 6, 1), w('window', 'l', 11, 0.9), w('clock', 'l', 15, 1.6),
  w('frame_photo', 'l', 17, 1.2, { color: '#FE3377' }), w('retro70_poster', 'l', 20, 1.4), w('frame_photo', 'l', 23, 1.2, { color: '#3a86ff' }),
];

// ---------- Roleplay ----------
// Taberna elevada (atrás a la izquierda, con Beto en la barra) y plaza del pueblo con fuente, mercado y el trono del alcalde.
const ROLEPLAY = [
  // Pisos
  f('castillo_alfombra', 1, 13, 2, { color: '#8a1428' }), f('castillo_alfombra', 4, 13, 2, { color: '#8a1428' }),
  f('cabana_rug', 4, 3, 0, { color: '#2f6b43' }),
  ...tiles('jardin_grass', 1, 15, 5, 18, '#7cbf4a'),
  ...tiles('jardin_grass', 16, 15, 20, 17, '#4caf50', (x, y) => x + y > 36),
  f('castillo_alfombra', 18, 2, 0, { color: '#8a1428' }),

  // Taberna: chimenea con mecedoras, barra de troncos y mesas
  f('cabana_fireplace', 2, 1, 0, ON), f('cabana_rocker', 2, 3, 4), f('cabana_rocker', 3, 3, 4),
  f('castillo_candelabro', 5, 1, 0, ON), f('castillo_candelabro', 1, 5, 0, ON),
  f('cabana_bookshelf', 7, 1, 0), f('vintage_reloj', 9, 1, 0), f('cabana_bookshelf', 10, 1, 0), f('castillo_candelabro', 12, 1, 0, ON),
  f('cabana_bar', 7, 3, 0), f('cabana_bar', 9, 3, 0), f('cabana_bar', 11, 3, 0),
  ...[7, 8, 9, 10, 11, 12].map((x) => f('cabana_stool', x, 4)),
  f('castillo_mesa', 2, 6, 0), f('cabana_stool', 2, 5), f('cabana_stool', 3, 5), f('cabana_stool', 2, 7), f('cabana_stool', 3, 7),
  f('cabana_table', 6, 6, 0), f('cabana_stool', 6, 5), f('cabana_stool', 7, 5), f('cabana_stool', 6, 7), f('cabana_stool', 7, 7),
  f('vintage_piano', 10, 6, 0, { color: '#4a2618' }), f('vintage_sillon', 12, 6, 6, { color: '#efe0b0' }),
  f('castillo_armadura', 13, 1, 0), f('castillo_armadura', 14, 1, 0), f('castillo_cofre', 14, 4, 2),

  // Plaza: fuente con bancas y faroles
  f('jardin_fountain', 10, 11, 0, ON),
  f('jardin_bench', 10, 9, 0, { color: '#b5794a' }), f('jardin_bench', 10, 14, 4, { color: '#b5794a' }),
  f('jardin_bench', 8, 11, 6, { color: '#b5794a' }), f('jardin_bench', 13, 11, 2, { color: '#b5794a' }),
  f('jardin_lamp', 8, 9, 0, ON), f('jardin_lamp', 13, 9, 0, ON), f('jardin_lamp', 8, 14, 0, ON), f('jardin_lamp', 13, 14, 0, ON),
  f('jardin_flowerbed', 3, 9, 0, { color: '#FE3377' }), f('jardin_flowerbed', 5, 10, 0, { color: '#FFCC00' }),
  f('plant_big', 1, 9), f('plant_big', 2, 16), f('plant_big', 4, 17), f('zen_bonsai', 1, 18), f('plant_big', 22, 9),

  // Mercado
  f('cocina_table', 17, 9, 0, { color: '#c0392b' }), f('jardin_umbrella', 16, 9, 0, { color: '#FE3377' }), f('castillo_cofre', 18, 9, 2),
  f('cocina_table', 17, 11, 0, { color: '#2f6fb0' }), f('mecanica_roses', 18, 11, 0, { color: '#e63946' }),
  f('cocina_table', 17, 13, 0, { color: '#2fb67c' }), f('jardin_umbrella', 16, 13, 0, { color: '#FFCC00' }), f('fiesta_cake', 17, 13, 0, { state: 1, color: '#6b3a22' }),
  f('cabana_stool', 20, 11), f('cabana_stool', 20, 13),

  // Trono del alcalde con alfombra y guardias
  f('castillo_trono', 18, 1, 0, { color: '#8a1428' }), f('castillo_armadura', 17, 3, 0), f('castillo_armadura', 19, 3, 0),
  f('castillo_gargola', 16, 1, 0, ON), f('castillo_gargola', 20, 1, 0, ON), f('vintage_reloj', 22, 1, 0),

  // Paredes
  w('cabana_lantern', 'r', 1, 1.4, ON), w('castillo_vitral', 'r', 5, 1.0), w('cabana_lantern', 'r', 6, 1.4, ON), w('vintage_retrato', 'r', 12, 1.3, { color: '#efe0b0' }),
  w('castillo_antorcha', 'r', 15, 1.4, ON), w('castillo_vitral', 'r', 18, 1.9), w('castillo_antorcha', 'r', 21, 1.4, ON),
  w('castillo_antorcha', 'l', 3, 1.4, ON), w('vintage_retrato', 'l', 6, 1.2, { color: '#a9c6e8' }), w('window', 'l', 9, 1),
  w('castillo_antorcha', 'l', 12, 1.4, ON), w('cabana_lantern', 'l', 15, 1.4, ON),
];

// ---------- League of Legends ----------
// Arena gamer azul y dorado: escenario con pantalla gigante (5 pantallas), mesa de casters, gradas
// para ver partidas y cuatro filas de PCs (equipo azul a la izquierda, dorado a la derecha).
const LOL_BLUE = '#3a86ff', LOL_GOLD = '#FFCC00';
const LOL = [
  ...tiles('floor_tile', 6, 1, 18, 3, LOL_BLUE),
  ...tiles('floor_tile', 6, 4, 18, 4, (x) => (x % 2 ? LOL_GOLD : '#141414')),
  // Escenario
  ...[8, 10, 12, 14, 16].map((x) => f('tv', x, 1, 0, ON)),
  f('fiesta_speaker', 18, 1, 0, ON),
  f('oficina_escritorio', 7, 3, 0, { color: '#3a3e4c' }), f('oficina_laptop', 7, 3, 4, ON), f('oficina_laptop', 8, 3, 4, ON),
  f('oficina_silla', 7, 2, 0, { color: LOL_BLUE }), f('oficina_silla', 8, 2, 0, { color: LOL_BLUE }),
  f('mecanica_trophy', 12, 3, 0, { color: LOL_GOLD }),
  f('neon_hex', 15, 3, 0, { state: 1, color: LOL_BLUE }), f('neon_hex', 17, 3, 0, { state: 1, color: LOL_GOLD }),
  // Gradas para la watch party
  ...[8, 9, 10, 11, 12, 13, 14, 15, 16].map((x) => f('beanbag', x, 6, 0, { color: x % 2 ? LOL_BLUE : LOL_GOLD })),
  ...[7, 11, 15].map((x) => f('sofa_3', x, 8, 4, { color: '#2b2d38' })),
  // Mesa de estrategia (coaching)
  ...table8(3, 3, 'oficina_silla', LOL_BLUE, 'table_dining', '#2b2b2f'),
  f('oficina_laptop', 3, 3, 0, ON), f('cocina_coffee', 4, 4, 0, ON),
  f('plant_big', 1, 1), f('lamp_floor', 1, 7, 0, ON), f('oficina_planta', 5, 7),
  // Vitrina de trofeos y marcador
  f('table_small', 20, 2, 0, { color: '#2b2b2f' }), f('trophy', 20, 2, 0, { color: '#FFCC00' }),
  f('table_small', 22, 2, 0, { color: '#2b2b2f' }), f('trophy', 22, 2, 0, { color: '#c0c6cf' }),
  f('table_small', 24, 2, 0, { color: '#2b2b2f' }), f('trophy', 24, 2, 0, { color: '#d08a4a' }),
  f('mecanica_scoreboard', 22, 5, 0, { color: '#2b4a8a' }), f('sofa_2', 21, 8, 4, { color: LOL_BLUE }), f('lamp_floor', 24, 7, 0, ON),
  // Filas de PCs
  ...[4, 7, 10].flatMap((x) => [...pcPod(x, 13, 'n', [LOL_BLUE]), ...pcPod(x, 14, 's', [LOL_BLUE]), ...pcPod(x, 18, 'n', [LOL_BLUE]), ...pcPod(x, 19, 's', [LOL_BLUE])]),
  ...[14, 17, 20].flatMap((x) => [...pcPod(x, 13, 'n', [LOL_GOLD]), ...pcPod(x, 14, 's', [LOL_GOLD]), ...pcPod(x, 18, 'n', [LOL_GOLD]), ...pcPod(x, 19, 's', [LOL_GOLD])]),
  // Botanas y descanso
  f('mecanica_vending_soda', 1, 12, 6, { color: LOL_BLUE }), f('mecanica_vending_coffee', 1, 14, 6, { color: '#2b2d38' }), f('mecanica_popcorn', 1, 16, 6), f('plant_big', 1, 19),
  f('fiesta_soda', 24, 12, 2, { state: 1, color: LOL_BLUE }), f('beanbag', 23, 14, 0, { color: LOL_GOLD }), f('sofa_2', 24, 15, 2, { color: '#2b2d38' }),
  f('lamp_lava', 24, 18, 0, { state: 1, color: LOL_BLUE }), f('plant_big', 24, 20),
  // Paredes
  w('clock', 'r', 3, 1.6), w('deportes_scoreboard', 'r', 12, 1.75, ON), w('urbana_art', 'r', 20, 1.3, { color: LOL_BLUE }), w('urbana_art', 'r', 22, 1.3, { color: LOL_GOLD }),
  w('oficina_pizarron', 'l', 2, 0.9), w('window', 'l', 6, 1), w('urbana_art', 'l', 13, 1.9, { color: LOL_BLUE }), w('frame_photo', 'l', 18, 1.2, { color: '#3a86ff' }),
];

// ---------- Valorant y FPS ----------
// Bootcamp de shooters: dos filas de PCs, galería de tiro elevada con blancos, mesa de estrategia y sala de descanso.
const FPS_RED = '#FE3377';
const FPS = [
  // Galería de tiro (tarima a 1)
  ...tiles('floor_tile', 14, 1, 20, 4, '#141414'),
  f('deportes_bag', 15, 1, 0, { color: '#d62839' }), f('deportes_bag', 17, 1, 0, { color: '#d62839' }), f('deportes_bag', 19, 1, 0, { color: '#d62839' }),
  f('oficina_mampara', 16, 3, 2, { color: '#5b6b8a' }), f('oficina_mampara', 18, 3, 2, { color: '#5b6b8a' }),
  f('bar_counter', 14, 5, 0, { color: '#2b2d38' }), f('bar_counter', 18, 5, 0, { color: '#2b2d38' }),
  // Bootcamp
  ...[2, 5, 8, 11].flatMap((x) => [...pcPod(x, 1, 's', ['#141414', FPS_RED]), ...pcPod(x, 6, 'n', [FPS_RED, '#141414'])]),
  f('neon_hex', 13, 3, 0, { state: 1, color: FPS_RED }),
  // Sala de descanso con tele
  f('tv', 1, 10, 6, ON), f('table_coffee', 3, 10, 2, { color: '#b5794a' }), f('sofa_3', 5, 9, 2, { color: '#2b2d38' }),
  f('beanbag', 3, 14, 0, { color: '#FE3377' }), f('beanbag', 4, 14, 0, { color: '#3a86ff' }), f('lamp_lava', 1, 15, 0, { state: 1, color: '#FE3377' }), f('plant_big', 1, 16),
  // Mesa de estrategia
  ...table8(10, 11, 'chair_gamer', '#141414', 'table_dining', '#2b2b2f'),
  f('oficina_laptop', 10, 11, 0, ON), f('oficina_laptop', 11, 12, 4, ON),
  // Botanas y marcador
  f('mecanica_vending_soda', 20, 9, 2, { color: '#e63946' }), f('fiesta_soda', 20, 10, 2, { state: 1, color: '#141414' }), f('mecanica_vending_coffee', 20, 11, 2, { color: '#2b2d38' }),
  f('mecanica_scoreboard', 16, 11, 0, { color: '#7a1f2b' }), f('sofa_2', 16, 13, 4, { color: '#2b2d38' }), f('lamp_lava', 19, 13, 0, { state: 1, color: '#FE3377' }),
  f('plant_big', 14, 16), f('arcade', 7, 16, 4, { state: 1, color: '#FE3377' }), f('arcade', 8, 16, 4, { state: 1, color: '#3a86ff' }),
  // Paredes
  w('clock', 'r', 6, 1.6), w('urbana_art', 'r', 9, 1.4, { color: FPS_RED }), w('deportes_scoreboard', 'r', 16, 1.8, ON),
  w('urbana_art', 'l', 3, 1.3, { color: FPS_RED }), w('frame_photo', 'l', 7, 1.2, { color: '#FE3377' }), w('oficina_pizarron', 'l', 14, 0.9),
];

// ---------- Minecraft ----------
// Jardín de bloques: colina en escalones con pasto a cuadros, árboles de bloques, cama, horno, mesa de crafteo,
// cofre, lago con arena, desierto con cactus y antorchas.
const MINECRAFT = [
  ...tiles('jardin_grass', 1, 1, 8, 7, (x, y) => ((x + y) % 2 ? '#4caf50' : '#2e8b57')),
  ...tiles('jardin_grass', 9, 8, 12, 9, (x, y) => ((x + y) % 2 ? '#7cbf4a' : '#4caf50')),
  f('jardin_pool', 13, 12, 0),
  // Cima de la colina: "minerales"
  f('cristal_geoda', 1, 1, 0, { state: 1, color: '#7fe0ff' }), f('cristal_geoda', 3, 1, 0, { state: 1, color: '#ffd75e' }),
  f('cristal_cubo', 2, 3, 0, { color: '#d6c8ff' }), f('cristal_cubo', 4, 3, 0, { color: '#9ee7ff' }),
  // Casa: cama, horno, mesa de crafteo y cofre
  f('cabana_bed', 6, 1, 0, { color: '#b8322a' }),
  f('cabana_fireplace', 10, 1, 0, ON), f('cabana_table', 12, 3, 0), f('cabana_stool', 12, 4), f('castillo_cofre', 14, 3, 0),
  f('jardin_lamp', 9, 4, 0, ON),
  // Árboles de bloques
  ...blockTree(2, 5), ...blockTree(7, 6), ...blockTree(15, 6), ...blockTree(18, 5), ...blockTree(3, 17), ...blockTree(10, 17),
  // Calabazas y melones
  f('plastik_cube', 5, 5, 0, { color: '#ff8a1f' }), f('plastik_cube', 6, 4, 0, { color: '#22c55e' }), f('plastik_cube', 12, 7, 0, { color: '#ff8a1f' }),
  // Lago con arena
  f('plastik_cube', 12, 12, 0, { color: '#ffd21f' }), f('plastik_cube', 12, 14, 0, { color: '#ffd21f' }), f('plastik_cube', 16, 13, 0, { color: '#ffd21f' }),
  f('jardin_bench', 14, 16, 4, { color: '#2fb67c' }),
  // Desierto
  f('cactus', 18, 10), f('cactus', 19, 12), f('cactus', 17, 15), f('plastik_cube', 18, 13, 0, { color: '#ffd21f' }), f('plastik_cube', 19, 14, 0, { color: '#ffd21f' }),
  // Flores y faroles
  f('jardin_flowerbed', 9, 11, 0, { color: '#FE3377' }), f('jardin_flowerbed', 4, 10, 0, { color: '#FFCC00' }), f('jardin_flowerbed', 6, 15, 0, { color: '#8e5cf7' }),
  f('jardin_lamp', 8, 12, 0, ON), f('jardin_lamp', 11, 16, 0, ON), f('jardin_lamp', 2, 12, 0, ON),
  f('zen_bonsai', 16, 9), f('plant_big', 20, 7),
  // Paredes
  w('castillo_antorcha', 'r', 3, 1.2, ON), w('jardin_birdhouse', 'r', 9, 1.9), w('window', 'r', 12, 1), w('castillo_antorcha', 'r', 15, 1.4, ON),
  w('castillo_antorcha', 'l', 5, 1.2, ON), w('window', 'l', 9, 1), w('jardin_birdhouse', 'l', 12, 1.8, { color: '#3a86ff' }), w('castillo_antorcha', 'l', 16, 1.4, ON),
];

// ---------- Música y Karaoke ----------
const MUSICA = [
  // Pista de baile 6×4 frente al DJ
  ...[11, 13, 15].flatMap((x) => [f('fiesta_dancefloor', x, 5, 0, ON), f('fiesta_dancefloor', x, 7, 0, ON)]),
  f('fiesta_dj', 13, 2, 0, ON), f('fiesta_speaker', 11, 1, 0, ON), f('fiesta_speaker', 17, 1, 0, ON),
  f('fiesta_discoball', 14, 6, 0, ON), f('neon_hex', 12, 1, 0, { state: 1, color: '#FE3377' }), f('neon_hex', 16, 1, 0, { state: 1, color: '#3a86ff' }),
  f('fiesta_balloons', 18, 4, 0, { color: '#FFCC00' }),
  // Escenario de karaoke: pantalla con la letra, bocinas, piano y rocola
  f('retro70_rug', 4, 3, 0, { color: '#c23bd4' }),
  f('tv', 4, 1, 0, ON), f('fiesta_speaker', 2, 1, 0, ON), f('fiesta_speaker', 7, 1, 0, ON), f('vintage_piano', 8, 1, 0, { state: 1, color: '#1b1b1f' }),
  f('plant_big', 1, 1), f('lamp_lava', 1, 3, 0, ON), f('jukebox', 1, 5, 6, ON),
  ...[['#FE3377', 3], ['#FFCC00', 4], ['#3a86ff', 5], ['#2fb67c', 6]].map(([c, x]) => f('beanbag', x, 6, 0, { color: c })),
  f('sofa_3', 3, 8, 4, { color: '#FE3377' }), f('retro70_egg', 8, 5, 2, { color: '#e8772e' }), f('retro70_egg', 8, 7, 2, { color: '#d9a62b' }),
  // Rincón chill con tocadiscos
  f('rug_round', 3, 12, 0, { color: '#2b2d38' }), f('retro70_record', 3, 10, 0, ON),
  ...[['#FE3377', 2], ['#FFCC00', 3], ['#3a86ff', 4], ['#2fb67c', 5]].map(([c, x]) => f('beanbag', x, 14, 0, { color: c })),
  f('lamp_lava', 1, 10, 0, ON), f('lamp_lava', 6, 10, 0, { state: 1, color: '#3a86ff' }),
  // Barra (Beto)
  f('fiesta_soda', 18, 9, 2, { state: 1, color: '#FE3377' }), f('fiesta_icecream', 18, 10, 2, ON), f('fiesta_soda', 18, 11, 2, { state: 1, color: '#3a86ff' }),
  f('bar_counter', 14, 11, 0, { color: '#2b2d38' }), f('fiesta_cake', 15, 11, 0, ON),
  ...[14, 15, 16].map((x) => f('stool_bar', x, 12, 0, { color: '#FE3377' })),
  f('mecanica_love', 9, 15, 4, { color: '#FE3377' }), f('mecanica_roses', 12, 15, 0, { color: '#e63946' }),
  f('sofa_3', 2, 16, 4, { color: '#FE3377' }), f('plant_big', 1, 16), f('lamp_lava', 5, 16, 0, { state: 1, color: '#2fb67c' }), f('plant_small', 8, 15, 0, { color: '#FE3377' }),
  // Paredes
  w('retro70_poster', 'r', 14, 1.9), w('fiesta_papel', 'r', 9, 1.9, { color: '#FE3377' }), w('fiesta_papel', 'r', 16, 1.9, { color: '#FFCC00' }),
  w('puravida_poster', 'r', 6, 1.9), w('vintage_retrato', 'l', 3, 1.4, { color: '#e9b8c4' }), w('retro70_macrame', 'l', 7, 1.2), w('frame_photo', 'l', 14, 1.2, { color: '#FE3377' }),
];

// ---------- Cine y Anime ----------
// Pantalla gigante, butacas en gradas (dos niveles), dulcería con palomitas y un rincón anime con tatamis.
const CINE = [
  f('rug_long', 8, 5, 0, { color: '#c0392b' }), f('rug_long', 9, 5, 0, { color: '#c0392b' }),
  ...[15, 16, 17, 18].flatMap((x) => [f('zen_tatami', x, 9, 0), f('zen_tatami', x, 11, 0)]),
  // Pantalla
  ...[4, 6, 8, 10, 12].map((x) => f('tv', x, 1, 0, ON)),
  f('fiesta_speaker', 2, 1, 0, ON), f('fiesta_speaker', 14, 1, 0, ON),
  // Butacas (ven hacia la pantalla)
  ...[5, 9, 12, 15].flatMap((y) => [
    f('sofa_3', 2, y, 4, { color: '#FE3377' }), f('sofa_3', 5, y, 4, { color: '#FE3377' }),
    f('sofa_3', 10, y, 4, { color: '#FE3377' }), f('sofa_2', 13, y, 4, { color: '#FE3377' }),
  ]),
  // Dulcería
  f('mecanica_popcorn', 18, 2, 2), f('mecanica_icecream', 18, 4, 2, { color: '#ffb3cf' }), f('mecanica_vending_soda', 18, 6, 2, { color: '#e63946' }), f('plant_big', 16, 1),
  // Rincón anime
  f('zen_table', 16, 10, 0, { color: '#6b3f26' }),
  f('zen_zabuton', 16, 9, 0, { color: '#9b2f3f' }), f('zen_zabuton', 17, 9, 0, { color: '#2f4f74' }), f('zen_zabuton', 16, 11, 0, { color: '#d9a441' }), f('zen_zabuton', 17, 11, 0, { color: '#5f6f3a' }),
  f('zen_lantern', 15, 8, 0, ON), f('zen_lantern', 18, 8, 0, ON), f('plastik_tv', 18, 13, 2, { state: 1, color: '#ff3b5c' }),
  f('zen_screen', 15, 14, 0), f('zen_bonsai', 18, 14), f('zen_fountain', 15, 16, 0, ON), f('zen_lantern', 18, 16, 0, ON),
  // Paredes
  w('zen_scroll', 'r', 15, 1.2), w('zen_scroll', 'r', 17, 1.2),
  w('frame_photo', 'l', 3, 1.2, { color: '#FE3377' }), w('urbana_art', 'l', 6, 1.4, { color: '#3a86ff' }), w('retro70_poster', 'l', 10, 1.2),
  w('zen_scroll', 'l', 12, 1.2), w('frame_photo', 'l', 16, 1.2, { color: '#2fb67c' }),
];

// ---------- Lobby VIP HUB ----------
// Alfombra roja desde la puerta, da vuelta y sube a la tarima del trono (pared del fondo).
// La única pieza con la marca es el neón de pared detrás del trono.
const VIP = [
  f('hub_rug', 1, 11, 2), f('hub_rug', 4, 11, 2), f('hub_rug', 7, 11, 2), f('hub_rug', 10, 11, 2),
  f('hub_rug', 12, 8, 0), f('hub_rug', 12, 5, 0),
  f('rug_round', 5, 13, 0, { color: '#2b2d38' }),
  // Cordones VIP a los lados de la alfombra
  ...[3, 5, 7, 9].flatMap((x) => [f('hub_rope', x, 10, 2), f('hub_rope', x, 12, 2)]),
  ...[5, 7, 9].flatMap((y) => [f('hub_rope', 11, y, 0), f('hub_rope', 13, y, 0)]),
  // Tarima del trono
  f('hub_throne', 12, 1, 0), f('hub_crown_lamp', 11, 1, 0, ON), f('hub_crown_lamp', 13, 1, 0, ON),
  f('hub_dragon', 10, 1, 0), f('hub_dragon', 14, 1, 0),
  f('hub_holo', 9, 1, 0, ON), f('hub_holo', 15, 1, 0, ON), f('lamp_floor', 9, 4, 0, { state: 1, color: '#FE3377' }), f('lamp_floor', 15, 4, 0, { state: 1, color: '#FE3377' }),
  // Salones VIP a los lados
  f('hub_arch', 1, 2, 6, ON),
  f('hub_sofa_vip', 3, 1, 0, { color: '#FE3377' }), f('hub_sofa_vip', 6, 1, 0, { color: '#141414' }), f('table_coffee', 4, 3, 0, { color: '#f4f4f6' }),
  f('hub_sofa_vip', 1, 15, 4, { color: '#7b2cbf' }), f('hub_sofa_vip', 3, 15, 4, { color: '#FE3377' }), f('throne', 6, 14, 0),
  f('table_coffee', 1, 13, 0, { color: '#f4f4f6' }),
  f('gtahub_car', 13, 12, 0, { color: '#FE3377' }), f('cristal_geoda', 1, 9, 0, { state: 1, color: '#c48bff' }), f('castillo_candelabro', 3, 13, 0, ON),
  f('bar_counter', 17, 6, 2, { color: '#2b2d38' }), ...[6, 7, 8].map((y) => f('stool_bar', 16, y, 0, { color: '#FE3377' })),
  f('hub_trophy', 16, 1, 0), f('hub_trophy', 17, 1, 0), f('trophy', 17, 3, 0), f('hub_trophy', 10, 16, 0),
  f('plant_big', 1, 7), f('plant_big', 17, 10), f('plant_big', 8, 16), f('neon_hex', 7, 3, 0, { state: 1, color: '#FFCC00' }),
  f('neon_hex', 16, 14, 0, { state: 1, color: '#FE3377' }), f('hub_teleport', 17, 16, 0),
  // Paredes
  w('hub_neon_wall', 'r', 11, 1.9, ON), w('urbana_art', 'r', 4, 1.6, { color: '#FE3377' }), w('frame_photo', 'r', 16, 1.6, { color: '#FE3377' }),
  w('vintage_retrato', 'l', 5, 1.4, { color: '#e9b8c4' }), w('urbana_art', 'l', 14, 1.4, { color: '#FFCC00' }), w('frame_photo', 'l', 9, 1.4, { color: '#FE3377' }),
];

// Salas oficiales en el orden en que salen en el navegador (y en el elevador: la primera es PB).
//   legacy: claves viejas (de cuando eran la oficina); la siembra las migra a la nueva en su lugar.
export const OFFICIAL_ROOMS = [
  { key: 'charla', legacy: ['hq'], model: 'charla', name: 'Charla General', description: 'El lobby de la comunidad: platica, conoce gente y entérate de todo', wallColor: '#e7dfd3', floorColor: '#b59a7a', items: CHARLA },
  { key: 'roleplay', legacy: ['comedor'], model: 'roleplay', name: 'Roleplay', description: 'Taberna y plaza del pueblo para armar tus historias', wallColor: '#6b4a34', floorColor: '#8f8a7e', items: ROLEPLAY },
  { key: 'lol', model: 'lol', name: 'League of Legends', description: 'Arena gamer: filas de PCs, pantalla gigante y escenario para ver partidas', wallColor: '#13204a', floorColor: '#24345c', items: LOL },
  { key: 'fps', model: 'fps', name: 'Valorant y FPS', description: 'Bootcamp de shooters: PCs, galería de tiro y mesa de estrategia', wallColor: '#2a2c35', floorColor: '#3f4450', items: FPS },
  { key: 'minecraft', legacy: ['jardin'], model: 'minecraft', name: 'Minecraft', description: 'Jardín de bloques: colina, lago, árboles, cama y cofre', wallColor: '#a9dcf5', floorColor: '#7cbf4a', items: MINECRAFT },
  { key: 'musica', legacy: ['juegos'], model: 'musica', name: 'Música y Karaoke', description: 'Cabina de DJ, pista de baile y escenario de karaoke', wallColor: '#2b2d38', floorColor: '#3f4652', items: MUSICA },
  { key: 'cine', legacy: ['juntas'], model: 'cine', name: 'Cine y Anime', description: 'Pantalla gigante, gradas, palomitas y rincón anime', wallColor: '#221a33', floorColor: '#4a2a3a', items: CINE },
  { key: 'vip', model: 'vip', name: 'Lobby VIP HUB', description: 'Rarezas exclusivas HUB, trono y alfombra roja', wallColor: '#141414', floorColor: '#3b3346', items: VIP },
];
export const OFFICIAL_BY_KEY = Object.fromEntries(OFFICIAL_ROOMS.map((r) => [r.key, r]));
export const FLAGSHIP_KEY = 'charla';
// Clave vieja → nueva (salas que ya existían en producción con otro tema)
export const LEGACY_OFFICIAL_KEYS = Object.fromEntries(OFFICIAL_ROOMS.flatMap((r) => (r.legacy || []).map((k) => [k, r.key])));
export const officialKey = (k) => LEGACY_OFFICIAL_KEYS[k] || k;

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
