// Catálogo de objetos que se pueden colocar en el mapa.
// w/h están en tiles. Los muebles se alinean a la cuadrícula; las decoraciones
// se pueden colocar libremente (pasos de 1/4 de tile) y no bloquean el paso.

export const CATEGORIES = [
  { id: 'escritorio', name: 'Escritorio' },
  { id: 'piso', name: 'Piso' },
  { id: 'mascotas', name: 'Mascotas' },
  { id: 'stream', name: 'Gamer y stream' },
  { id: 'tech', name: 'Tecnología' },
  { id: 'comida', name: 'Comida' },
  { id: 'plantas', name: 'Plantas' },
  { id: 'deco', name: 'Decoración' },
  { id: 'gtahub', name: 'Marca' },
  { id: 'muebles', name: 'Muebles' },
  { id: 'salas', name: 'Salas' },
  { id: 'exterior', name: 'Exterior' },
];

const f = (name, cat, w, h, opts = {}) => ({ name, cat, w, h, kind: 'furniture', solid: true, ...opts });
const d = (name, cat, w, h, opts = {}) => ({ name, cat, w, h, kind: 'decor', solid: false, ...opts });

export const CATALOG = {
  // Muebles
  desk: f('Escritorio', 'muebles', 3, 1, { colorable: true, color: '#a0673f', claimable: true }),
  standingDesk: f('Escritorio blanco', 'muebles', 3, 1, { colorable: true, color: '#e8e8ee', claimable: true }),
  gamingDesk: f('Escritorio gamer', 'muebles', 3, 1, { colorable: true, color: '#26262e', claimable: true }),
  woodDesk: f('Escritorio de madera', 'muebles', 3, 1, { colorable: true, color: '#7a4a2b', claimable: true }),
  glassDesk: f('Escritorio de cristal', 'muebles', 3, 1, { colorable: true, color: '#a9d6e5', claimable: true }),
  cubicle: f('Cubículo', 'muebles', 4, 1, { colorable: true, color: '#f4f4f6', claimable: true }),
  cubicleWalls: f('Mamparas de cubículo', 'muebles', 3, 2, { solid: false, colorable: true, color: '#9fb1c9' }),
  chair: f('Silla', 'muebles', 1, 1, { solid: false, colorable: true, color: '#3f4652', rotatable: true }),
  gamingChair: f('Silla gamer', 'muebles', 1, 1, { solid: false, colorable: true, color: '#d9454f', rotatable: true }),
  beanBag: f('Puff', 'muebles', 1, 1, { solid: false, colorable: true, color: '#9b5de5' }),
  officeChair: f('Silla ejecutiva', 'muebles', 1, 1, { solid: false, colorable: true, color: '#1d1d22', rotatable: true }),
  stool: f('Banco', 'muebles', 1, 1, { solid: false, colorable: true, color: '#a0673f' }),
  sofa: f('Sofá', 'muebles', 5, 1, { solid: false, colorable: true, color: '#e8a27c', rotatable: true }),
  sofaSmall: f('Sofá chico', 'muebles', 3, 1, { solid: false, colorable: true, color: '#e9edf2', rotatable: true }),
  table: f('Mesa', 'muebles', 4, 2, { colorable: true, color: '#9a6a43' }),
  roundTable: f('Mesa redonda', 'muebles', 2, 1, { colorable: true, color: '#f1d39a' }),
  meetingTable: f('Mesa de juntas', 'salas', 6, 3, { colorable: true, color: '#eef0f4' }),
  confTable: f('Mesa larga', 'salas', 10, 2, { colorable: true, color: '#c88a55' }),
  bookshelf: f('Librero', 'muebles', 3, 1),
  shelf: f('Estante', 'muebles', 3, 1),
  cabinet: f('Archivero', 'muebles', 1, 1, { colorable: true, color: '#d0d4da' }),
  whiteboard: f('Pizarrón', 'salas', 3, 1, { interactive: 'board' }),
  noticeBoard: f('Tablero de anuncios', 'salas', 3, 1, { interactive: 'notices' }),
  tv: f('Pantalla', 'salas', 3, 1, { interactive: 'screen' }),
  easel: f('Rotafolio', 'salas', 1, 1, { interactive: 'board' }),
  fridge: f('Refrigerador', 'comida', 1, 1),
  counter: f('Barra de cocina', 'comida', 4, 1),
  coffee: f('Cafetera', 'comida', 2, 1),
  watercooler: f('Garrafón', 'comida', 1, 1),
  arcade: f('Arcade', 'deco', 1, 1, { colorable: true, color: '#2bb673', interactive: 'game' }),
  zombieArcade: f('Máquina Zombies', 'deco', 1, 1, { colorable: true, color: '#1f3b24', interactive: 'game', animated: true }), // shooter 3D cooperativo
  jukebox: f('Rocola', 'deco', 2, 1, { colorable: true, color: '#FE3377', interactive: 'jukebox', animated: true }),
  hotelElevator: f('Elevador a MeDed Friends', 'gtahub', 2, 1, { interactive: 'hotel', brand: true, animated: true }), // sube al Hotel (salas isométricas)
  foosball: f('Futbolito', 'deco', 3, 2, { interactive: 'game' }),
  drum: f('Tambor', 'deco', 1, 1),
  plant: f('Planta', 'plantas', 1, 1),
  tallPlant: f('Planta alta', 'plantas', 1, 1),
  tree2: f('Árbol de interior', 'plantas', 2, 2),
  hedge: f('Seto', 'exterior', 1, 1),
  flowers: f('Flores', 'exterior', 1, 1, { solid: false }),
  bush: f('Arbusto', 'exterior', 1, 1),
  tree: f('Pino', 'exterior', 1, 1),
  bench: f('Banca', 'exterior', 2, 1, { solid: false, rotatable: true }),
  fountain: f('Fuente', 'exterior', 2, 2),
  bikeRack: f('Bicicletas', 'deco', 3, 1),
  coatRack: f('Perchero', 'deco', 1, 1),
  robotArm: f('Brazo robot', 'tech', 1, 1),
  serverRack: f('Servidor', 'tech', 1, 1),
  painting: f('Cuadro', 'deco', 2, 1, { solid: false, colorable: true, color: '#e63946' }),
  clock: f('Reloj', 'deco', 1, 1, { solid: false }),
  window: f('Ventana', 'deco', 4, 1, { solid: false }),
  rug: f('Tapete', 'deco', 3, 2, { solid: false, colorable: true, color: '#8ecae6', under: true }),
  carpetRunner: f('Alfombra de bienvenida', 'deco', 2, 4, { solid: false, colorable: true, color: '#FE3377', under: true }),
  poolTable: f('Mesa de billar', 'deco', 4, 2, { colorable: true, color: '#1f8a5b', interactive: 'game' }),
  pingPong: f('Ping pong', 'deco', 4, 2, { colorable: true, color: '#2f6fd6', interactive: 'game' }),
  reception: f('Recepción', 'muebles', 5, 1, { colorable: true, color: '#101010' }),
  vending: f('Máquina de snacks', 'comida', 1, 1, { colorable: true, color: '#FE3377' }),
  planter: f('Jardinera', 'plantas', 3, 1, { colorable: true, color: '#c99c72' }),
  armchair: f('Sillón', 'muebles', 1, 1, { solid: false, colorable: true, color: '#FFCC00', rotatable: true }),
  bigScreen: f('Pantalla gigante', 'salas', 5, 1, { colorable: true, color: '#101010', interactive: 'screen' }),
  flagPole: f('Asta con bandera', 'gtahub', 1, 1, { colorable: true, brand: true }),
  confChair: f('Silla de juntas', 'salas', 1, 1, { solid: false, colorable: true, color: '#e07a3a', rotatable: true }),
  lSofa: f('Sofá en L', 'muebles', 3, 2, { solid: false, colorable: true, color: '#e8a27c' }),
  gong: f('Gong', 'deco', 2, 2),
  aquarium: f('Acuario', 'deco', 2, 1),
  fern: f('Helecho', 'plantas', 1, 1, { solid: false }),
  bamboo: f('Bambú', 'plantas', 1, 1),
  plantShelf: f('Repisa de plantas', 'plantas', 2, 1),
  willowTree: f('Sauce llorón', 'exterior', 3, 3),
  // Escenario: quien se sube lo oye toda el área (ver shared/stage.js)
  stage: f('Escenario', 'salas', 6, 3, { solid: false, under: true, colorable: true, brand: true, stage: true }),
  stageMic: f('Micrófono de escenario', 'salas', 1, 1, { solid: false, colorable: true, brand: true, stage: true }),

  // Decoraciones de escritorio (no bloquean, posición libre)
  monitor: d('Monitor', 'tech', 0.75, 0.75, { colorable: true, color: '#2b2f3a' }),
  dualMonitor: d('Doble monitor', 'tech', 1.5, 0.75, { colorable: true, color: '#2b2f3a' }),
  curvedMonitor: d('Monitor curvo', 'tech', 1.5, 0.75, { colorable: true, color: '#2b2f3a' }),
  imac: d('Computadora', 'tech', 1, 1, { colorable: true, color: '#e8e8ee' }),
  laptop: d('Laptop', 'tech', 0.75, 0.5, { colorable: true, color: '#9aa3ad' }),
  keyboard: d('Teclado', 'tech', 0.75, 0.25, { colorable: true, color: '#3a3f4b' }),
  pcTower: d('Torre PC', 'tech', 0.5, 0.75, { colorable: true, color: '#22252d' }),
  controller: d('Control', 'tech', 0.5, 0.25, { colorable: true, color: '#e63946' }),
  headphones: d('Audífonos', 'tech', 0.5, 0.5, { colorable: true, color: '#2bb673' }),
  speaker: d('Bocina', 'tech', 0.25, 0.5, { colorable: true, color: '#2b2f3a' }),
  camera: d('Cámara', 'tech', 0.5, 0.75),
  mug: d('Taza', 'comida', 0.25, 0.25, { colorable: true, color: '#ffffff' }),
  can: d('Lata', 'comida', 0.25, 0.25, { colorable: true, color: '#4361ee' }),
  burger: d('Hamburguesa', 'comida', 0.5, 0.5),
  fries: d('Papas', 'comida', 0.5, 0.5),
  pizza: d('Pizza', 'comida', 0.75, 0.5),
  cactus: d('Cactus', 'plantas', 0.5, 0.75),
  smallPlant: d('Plantita', 'plantas', 0.5, 0.5),
  blossom: d('Bonsái de cerezo', 'plantas', 0.75, 0.75),
  books: d('Libros', 'escritorio', 0.5, 0.75, { colorable: true, color: '#3a86ff' }),
  notebook: d('Libreta', 'escritorio', 0.5, 0.5),
  lamp: d('Lámpara', 'escritorio', 0.5, 0.75, { colorable: true, color: '#f4a261' }),
  photo: d('Foto', 'escritorio', 0.5, 0.5, { colorable: true, color: '#ffb703' }),
  trophy: d('Trofeo', 'escritorio', 0.5, 0.5),
  duck: d('Patito', 'deco', 0.5, 0.5, { colorable: true, color: '#ffd23f' }),
  ball: d('Balón', 'deco', 0.5, 0.5),
  figure: d('Figura', 'deco', 0.25, 0.5, { colorable: true, color: '#9b5de5' }),
  flag: d('Banderín', 'deco', 0.5, 0.5, { colorable: true, color: '#06d6a0' }),

  // Más escritorio
  mousepad: d('Mousepad', 'escritorio', 0.75, 0.5, { colorable: true, color: '#FE3377' }),
  stickyNotes: d('Notas adhesivas', 'escritorio', 0.5, 0.5, { colorable: true, color: '#ffd23f' }),
  pencilCup: d('Lapicero', 'escritorio', 0.25, 0.5, { colorable: true, color: '#3a86ff' }),
  deskCalendar: d('Calendario', 'escritorio', 0.5, 0.5, { colorable: true, color: '#e63946' }),
  tablet: d('Tableta', 'tech', 0.5, 0.5, { colorable: true, color: '#2b2f3a' }),
  phone: d('Celular', 'tech', 0.25, 0.5, { colorable: true, color: '#2b2f3a' }),
  globe: d('Globo terráqueo', 'escritorio', 0.5, 0.75),
  rubik: d('Cubo de colores', 'deco', 0.25, 0.25),
  plushie: d('Peluche', 'deco', 0.5, 0.5, { colorable: true, color: '#c98a57' }),
  vase: d('Florero', 'plantas', 0.5, 0.75, { colorable: true, color: '#f15bb5' }),
  succulent: d('Suculenta', 'plantas', 0.5, 0.5),
  // Gamer y stream
  gamingPC: d('PC con luces', 'stream', 0.5, 1, { colorable: true, color: '#FE3377' }),
  mic: d('Micrófono', 'stream', 0.5, 0.75, { colorable: true, color: '#2b2f3a' }),
  ringLight: d('Aro de luz', 'stream', 0.75, 0.75),
  streamDeck: d('Panel de botones', 'stream', 0.5, 0.25),
  handheld: d('Consola portátil', 'stream', 0.5, 0.25, { colorable: true, color: '#e63946' }),
  ledStrip: d('Tira LED', 'stream', 1.5, 0.25, { colorable: true, color: '#8B7BFF' }),
  neonSign: d('Letrero neón', 'stream', 1, 0.5, { colorable: true, color: '#FE3377' }),
  carModel: d('Auto a escala', 'deco', 0.75, 0.5, { colorable: true, color: '#e63946' }),
  // Mascotas
  cat: d('Gato', 'mascotas', 0.5, 0.5, { colorable: true, color: '#f4a261' }),
  dog: d('Perrito', 'mascotas', 0.75, 0.75, { colorable: true, color: '#c98a57' }),
  fishbowl: d('Pecera', 'mascotas', 0.5, 0.5),
  bird: d('Pajarito', 'mascotas', 0.25, 0.5, { colorable: true, color: '#3a86ff' }),
  // Comida
  donut: d('Dona', 'comida', 0.5, 0.25, { colorable: true, color: '#f15bb5' }),
  boba: d('Té de burbujas', 'comida', 0.25, 0.5, { colorable: true, color: '#c8a27c' }),
  tacos: d('Tacos', 'comida', 0.75, 0.5),
  cake: d('Pastel', 'comida', 0.5, 0.5, { colorable: true, color: '#f8a5c2' }),
  // Marca (hexágonos)
  hexLamp: d('Lámpara hexagonal', 'gtahub', 0.75, 0.75, { colorable: true, color: '#FE3377' }),
  hexBadge: d('Insignia hexagonal', 'gtahub', 0.5, 0.5, { colorable: true, color: '#FFCC00' }),
  cubeLogo: d('Cubo isométrico', 'gtahub', 0.5, 0.5, { colorable: true, color: '#FE3377' }),
  hexNeon: d('Neón hexagonal', 'gtahub', 1, 0.75, { colorable: true, color: '#FE3377' }),
  // Marca: sin color elegido toman los colores del tema de la oficina (HUB, Nuvora o propio)
  bunting: d('Banderines', 'gtahub', 4, 0.75, { colorable: true, brand: true }),
  wallBanner: d('Estandarte', 'gtahub', 1, 1.5, { colorable: true, brand: true }),
  neonLogo: d('Neón con el nombre', 'gtahub', 3, 0.75, { colorable: true, brand: true }),
  floorLogo: d('Logo en el piso', 'gtahub', 3, 3, { colorable: true, brand: true, under: true }),
  poster: d('Póster', 'gtahub', 1, 1.25, { colorable: true, brand: true }),
  fairyLights: d('Luces colgantes', 'gtahub', 4, 0.5, { colorable: true, brand: true }),
  balloons: d('Globos', 'gtahub', 1, 1.5, { colorable: true, brand: true }),
  deskFlag: d('Banderita de escritorio', 'gtahub', 0.5, 0.75, { colorable: true, brand: true }),
  // Marca premium (animated: se dibujan en cada cuadro, son pocos y baratos)
  wavingFlag: f('Bandera que ondea', 'gtahub', 1, 1, { colorable: true, brand: true, animated: true }),
  rollupBanner: f('Roll-up HUB', 'gtahub', 1, 1, { colorable: true, brand: true }),
  brandWall: d('Muro de logo iluminado', 'gtahub', 4, 1, { colorable: true, brand: true }),
  logoTotem: f('Tótem con logo', 'gtahub', 1, 1, { colorable: true, brand: true, animated: true }),
  photocall: f('Photocall', 'gtahub', 4, 1, { colorable: true, brand: true }),
  brandRug: d('Tapete con logo', 'gtahub', 3, 3, { colorable: true, brand: true, under: true }),
  trophyCase: f('Vitrina de trofeos', 'gtahub', 2, 1, { colorable: true, brand: true }),
  // Marca genérica, sin logo (crisp: se pinta nítido en cada cuadro porque lleva texto)
  neonHub: d('Neón HUB', 'gtahub', 3, 0.75, { colorable: true, brand: true }),
  ringRug: d('Tapete de anillos', 'gtahub', 3, 3, { colorable: true, brand: true, under: true }),
  // Salas temáticas de la comunidad (sin logos de juegos: solo arte genérico y texto)
  roomSign: d('Letrero con el nombre de la sala', 'deco', 4, 0.75, { colorable: true, brand: true }),
  neonGG: d('Neón GG', 'stream', 1.5, 0.75, { colorable: true, color: '#3DDC84', crisp: true }),
  gamePoster: d('Póster gamer', 'stream', 1, 1.25, { colorable: true, color: '#3a86ff' }),
  controllerRug: d('Tapete de control', 'stream', 3, 2, { colorable: true, color: '#8B7BFF', under: true }),
  voxelBlock: f('Bloque de pixeles', 'deco', 1, 1, { colorable: true, color: '#5aa83c' }),
  barrel: f('Barril', 'deco', 1, 1),
  fireplace: f('Chimenea', 'muebles', 2, 1, { animated: true }),
  // Piso (alrededor de tu lugar)
  floorPlant: d('Planta grande', 'piso', 1, 1),
  floorLamp: d('Lámpara de pie', 'piso', 0.5, 1, { colorable: true, color: '#f4a261' }),
  arcLamp: d('Lámpara de arco', 'piso', 1, 1.5, { colorable: true, color: '#f4a261' }),
  miniFridge: d('Minirefri', 'piso', 0.75, 1, { colorable: true, color: '#e8e8ee' }),
  guitar: d('Guitarra', 'piso', 0.5, 1, { colorable: true, color: '#b5651d' }),
  roundRug: d('Tapete redondo', 'piso', 1, 1, { colorable: true, color: '#8ecae6', under: true }),
  petBed: d('Camita de mascota', 'piso', 0.75, 0.5, { colorable: true, color: '#9b5de5' }),
  trashCan: d('Bote de basura', 'piso', 0.5, 0.5, { colorable: true, color: '#6b7a77' }),
  tallSpeaker: d('Bocina de piso', 'piso', 0.5, 1, { colorable: true, color: '#1d1d22' }),
};

// Modelos de escritorio y de silla que cada quien puede elegir para su lugar
export const DESK_TYPES = ['desk', 'standingDesk', 'gamingDesk', 'woodDesk', 'glassDesk'];
// Muebles donde el personaje se sienta y hacia dónde mira:
// 'rot' = sillas (rot 0 mira arriba, al escritorio); 'sofa' = sofás, sillones y bancas
// (rot 0 mira abajo, con el respaldo atrás); 'free' = sin respaldo, conserva hacia dónde miraba.
export const SEAT_TYPES = { chair: 'rot', gamingChair: 'rot', officeChair: 'rot', confChair: 'rot', armchair: 'sofa', sofa: 'sofa', sofaSmall: 'sofa', bench: 'sofa', stool: 'free', beanBag: 'down' };
const ROT_FACE = ['up', 'right', 'down', 'left'];
const SOFA_FACE = ['down', 'right', 'up', 'left'];
// Hacia dónde mira quien se sienta en o (null = conserva su dirección)
export function seatDir(o) {
  const kind = SEAT_TYPES[o?.type];
  const r = (((o?.rot || 0) % 4) + 4) % 4;
  if (kind === 'rot') return ROT_FACE[r];
  if (kind === 'sofa') return SOFA_FACE[r];
  if (kind === 'free' || !kind) return null;
  return kind;
}
const seatCache = new WeakMap();
// Asiento en la casilla (x, y): { dir } o null
export function seatAt(f, x, y) {
  if (!f?.objects) return null;
  let m = seatCache.get(f.objects);
  if (!m) {
    m = new Map();
    for (const o of f.objects) {
      const kind = SEAT_TYPES[o.type];
      if (kind === undefined) continue;
      const dir = seatDir(o);
      const { w, h } = objSize(o);
      for (let j = o.y; j < o.y + h; j++) for (let i = o.x; i < o.x + w; i++) m.set(`${i},${j}`, { dir, obj: o });
    }
    seatCache.set(f.objects, m);
  }
  return m.get(`${x},${y}`) || null;
}

export const CHAIR_TYPES = ['chair', 'gamingChair', 'officeChair', 'beanBag', 'stool'];

export const DESK_DECOR_LIMIT = 30;
// Objetos que pueden colocar los líderes y su equipo en un departamento
export const AREA_DECOR_LIMIT = 150;

export function objSize(o) {
  const c = CATALOG[o.type];
  if (!c) return { w: 1, h: 1 };
  const w = o.w ?? c.w;
  const h = o.h ?? c.h;
  return (o.rot ?? 0) % 2 === 1 && c.kind === 'furniture' ? { w: h, h: w } : { w, h };
}

export const COLORS = ['#2b2f3a', '#e8e8ee', '#a0673f', '#7a4a2b', '#e63946', '#FE3377', '#f4a261', '#FF8A3D', '#ffd23f', '#FFCC00', '#2bb673', '#157A6E', '#06d6a0', '#3a86ff', '#4361ee', '#9b5de5', '#8B7BFF', '#f15bb5', '#8ecae6', '#0A2B2C', '#101010', '#ffffff'];
