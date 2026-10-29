// Hotel: modelos (mapas de alturas) de las salas OFICIALES del Hotel (MeDed Friends).
// Se suman a ROOM_MODELS (shared/hotel.js) con `official: true`, así servidor, motor y parseModel
// usan exactamente la misma fuente. No se pueden elegir al crear una sala normal.
// Sin imports a propósito (shared/hotel.js lo importa).
//
// Formato igual que los modelos a–f: fila 0 y columna 0 vacías ('x') salvo la puerta (x = 0),
// 'x' = vacío, '0'–'9' = altura del piso.

// Arma un mapa: base = altura general; ops = [[x0, y0, x1, y1, ch], …] (inclusivos) en orden.
function makeMap(W, H, base, door, ops = []) {
  const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 ? 'x' : String(base))));
  for (const [x0, y0, x1, y1, ch] of ops) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x > 0 && y > 0 && x < W && y < H) g[y][x] = ch;
  g[door.y][0] = g[door.y][1];
  return g.map((r) => r.join(''));
}
// Esquina recortada (chaflán) abajo a la derecha, como el edificio de la oficina
const chamfer = (W, H, n) => {
  const out = [];
  for (let k = 0; k < n; k++) out.push([W - 1 - (n - 1 - k), H - 1 - k, W - 1, H - 1 - k, 'x']);
  return out;
};

const CHARLA_DOOR = { x: 0, y: 19, rot: 2 };
const ROLEPLAY_DOOR = { x: 0, y: 13, rot: 2 };
const LOL_DOOR = { x: 0, y: 10, rot: 2 };
const FPS_DOOR = { x: 0, y: 12, rot: 2 };
const MINECRAFT_DOOR = { x: 0, y: 14, rot: 2 };
const MUSICA_DOOR = { x: 0, y: 11, rot: 2 };
const CINE_DOOR = { x: 0, y: 14, rot: 2 };
const VIP_DOOR = { x: 0, y: 11, rot: 2 };

export const OFFICIAL_MODELS = {
  // Charla General: 29×23 (el lobby grande). Piso general a 1, escenario a 2 (atrás a la izquierda),
  // lounge hundido a 0 (adelante al centro) y esquina recortada.
  charla: {
    name: 'Charla General', size: '29×23', official: true,
    map: makeMap(30, 24, 1, CHARLA_DOOR, [
      [1, 1, 7, 5, '2'], // escenario
      [10, 17, 18, 22, '0'], // lounge hundido
      ...chamfer(30, 24, 3),
    ]),
    door: CHARLA_DOOR,
  },
  // Roleplay: 22×18. Taberna elevada atrás a la izquierda y plaza del pueblo al frente
  roleplay: {
    name: 'Roleplay', size: '22×18', official: true,
    map: makeMap(23, 19, 0, ROLEPLAY_DOOR, [[1, 1, 14, 7, '1'], ...chamfer(23, 19, 2)]),
    door: ROLEPLAY_DOOR,
  },
  // League of Legends: 24×20. Escenario a 2 con escalón a 1 frente a la pantalla gigante
  lol: {
    name: 'League of Legends', size: '24×20', official: true,
    map: makeMap(25, 21, 0, LOL_DOOR, [[6, 1, 18, 3, '2'], [6, 4, 18, 4, '1']]),
    door: LOL_DOOR,
  },
  // Valorant y FPS: 20×16 con galería de tiro elevada a la derecha
  fps: {
    name: 'Valorant y FPS', size: '20×16', official: true,
    map: makeMap(21, 17, 0, FPS_DOOR, [[14, 1, 20, 7, '1'], ...chamfer(21, 17, 2)]),
    door: FPS_DOOR,
  },
  // Minecraft: 20×18 con terrenos en escalones (colina de dos niveles atrás)
  minecraft: {
    name: 'Minecraft', size: '20×18', official: true,
    map: makeMap(21, 19, 0, MINECRAFT_DOOR, [[1, 1, 8, 7, '1'], [1, 1, 4, 3, '2'], [16, 1, 20, 3, 'x'], ...chamfer(21, 19, 3)]),
    door: MINECRAFT_DOOR,
  },
  // Música y Karaoke: 18×16 con escenario del DJ
  musica: {
    name: 'Música y Karaoke', size: '18×16', official: true,
    map: makeMap(19, 17, 0, MUSICA_DOOR, [[11, 1, 18, 3, '1'], ...chamfer(19, 17, 2)]),
    door: MUSICA_DOOR,
  },
  // Cine y Anime: 18×16 con gradas (dos niveles) frente a la pantalla
  cine: {
    name: 'Cine y Anime', size: '18×16', official: true,
    map: makeMap(19, 17, 0, CINE_DOOR, [[1, 8, 14, 10, '1'], [1, 11, 14, 16, '2']]),
    door: CINE_DOOR,
  },
  // Lobby VIP: 17×16 con tarima del trono (dos escalones) en la pared del fondo
  vip: {
    name: 'Lobby VIP HUB', size: '17×16', official: true,
    map: makeMap(18, 17, 0, VIP_DOOR, [[9, 1, 15, 4, '1'], [11, 1, 13, 2, '2']]),
    door: VIP_DOOR,
  },
};
