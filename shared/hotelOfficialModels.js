// Hotel: modelos (mapas de alturas) de las salas OFICIALES de GTAHUB.
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

const HQ_DOOR = { x: 0, y: 19, rot: 2 };
const JUNTAS_DOOR = { x: 0, y: 9, rot: 2 };
const JUEGOS_DOOR = { x: 0, y: 11, rot: 2 };
const JARDIN_DOOR = { x: 0, y: 13, rot: 2 };
const COMEDOR_DOOR = { x: 0, y: 8, rot: 2 };
const VIP_DOOR = { x: 0, y: 11, rot: 2 };

export const OFFICIAL_MODELS = {
  // Oficina Central: 29×23. Piso general a 1, tarima de juntas a 2 (atrás a la izquierda),
  // lounge hundido a 0 (adelante al centro) y esquina recortada.
  hq: {
    name: 'Oficina Central', size: '29×23', official: true,
    map: makeMap(30, 24, 1, HQ_DOOR, [
      [1, 1, 7, 5, '2'], // tarima / escenario
      [10, 17, 18, 22, '0'], // lounge hundido
      ...chamfer(30, 24, 3),
    ]),
    door: HQ_DOOR,
  },
  // Sala de juntas: 15×13 con tarima para quien presenta
  juntas: {
    name: 'Sala de juntas', size: '15×13', official: true,
    map: makeMap(16, 14, 0, JUNTAS_DOOR, [[1, 1, 15, 2, '1']]),
    door: JUNTAS_DOOR,
  },
  // Sala de juegos: 18×16 con escenario del DJ
  juegos: {
    name: 'Sala de juegos', size: '18×16', official: true,
    map: makeMap(19, 17, 0, JUEGOS_DOOR, [[11, 1, 18, 3, '1'], ...chamfer(19, 17, 2)]),
    door: JUEGOS_DOOR,
  },
  // Jardín: 20×18 con terraza elevada
  jardin: {
    name: 'Jardín GTAHUB', size: '20×18', official: true,
    map: makeMap(21, 19, 0, JARDIN_DOOR, [[1, 1, 7, 6, '1'], [15, 1, 20, 3, 'x'], [17, 4, 20, 4, 'x'], ...chamfer(21, 19, 3)]),
    door: JARDIN_DOOR,
  },
  // Comedor: 14×12
  comedor: {
    name: 'Comedor', size: '14×12', official: true,
    map: makeMap(15, 13, 0, COMEDOR_DOOR, []),
    door: COMEDOR_DOOR,
  },
  // Lobby VIP: 17×16 con tarima del trono (dos escalones) en la pared del fondo
  vip: {
    name: 'Lobby VIP HUB', size: '17×16', official: true,
    map: makeMap(18, 17, 0, VIP_DOOR, [[9, 1, 15, 4, '1'], [11, 1, 13, 2, '2']]),
    door: VIP_DOOR,
  },
};
