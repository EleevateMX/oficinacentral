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
  { id: 'gtahub', name: 'GTAHUB' },
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
  chair: f('Silla', 'muebles', 1, 1, { solid: false, colorable: true, color: '#3f4652', rotatable: true }),
  gamingChair: f('Silla gamer', 'muebles', 1, 1, { solid: false, colorable: true, color: '#d9454f', rotatable: true }),
  beanBag: f('Puff', 'muebles', 1, 1, { solid: false, colorable: true, color: '#9b5de5' }),
  officeChair: f('Silla ejecutiva', 'muebles', 1, 1, { solid: false, colorable: true, color: '#1d1d22', rotatable: true }),
  stool: f('Banco', 'muebles', 1, 1, { solid: false, colorable: true, color: '#a0673f' }),
  sofa: f('Sofá', 'muebles', 5, 1, { colorable: true, color: '#e8a27c', rotatable: true }),
  sofaSmall: f('Sofá chico', 'muebles', 3, 1, { colorable: true, color: '#e9edf2', rotatable: true }),
  table: f('Mesa', 'muebles', 4, 2, { colorable: true, color: '#9a6a43' }),
  roundTable: f('Mesa redonda', 'muebles', 2, 1, { colorable: true, color: '#f1d39a' }),
  meetingTable: f('Mesa de juntas', 'salas', 6, 3, { colorable: true, color: '#eef0f4' }),
  confTable: f('Mesa larga', 'salas', 10, 2, { colorable: true, color: '#c88a55' }),
  bookshelf: f('Librero', 'muebles', 3, 1),
  shelf: f('Estante', 'muebles', 3, 1),
  cabinet: f('Archivero', 'muebles', 1, 1, { colorable: true, color: '#d0d4da' }),
  whiteboard: f('Pizarrón', 'salas', 3, 1),
  tv: f('Pantalla', 'salas', 3, 1),
  easel: f('Rotafolio', 'salas', 1, 1),
  fridge: f('Refrigerador', 'comida', 1, 1),
  counter: f('Barra de cocina', 'comida', 4, 1),
  coffee: f('Cafetera', 'comida', 2, 1),
  watercooler: f('Garrafón', 'comida', 1, 1),
  arcade: f('Arcade', 'deco', 1, 1, { colorable: true, color: '#2bb673' }),
  foosball: f('Futbolito', 'deco', 3, 2),
  drum: f('Tambor', 'deco', 1, 1),
  plant: f('Planta', 'plantas', 1, 1),
  tallPlant: f('Planta alta', 'plantas', 1, 1),
  tree2: f('Árbol de interior', 'plantas', 2, 2),
  hedge: f('Seto', 'exterior', 1, 1),
  flowers: f('Flores', 'exterior', 1, 1, { solid: false }),
  bush: f('Arbusto', 'exterior', 1, 1),
  tree: f('Pino', 'exterior', 1, 1),
  bench: f('Banca', 'exterior', 2, 1, { rotatable: true }),
  fountain: f('Fuente', 'exterior', 2, 2),
  bikeRack: f('Bicicletas', 'deco', 3, 1),
  coatRack: f('Perchero', 'deco', 1, 1),
  robotArm: f('Brazo robot', 'tech', 1, 1),
  serverRack: f('Servidor', 'tech', 1, 1),
  painting: f('Cuadro', 'deco', 2, 1, { solid: false, colorable: true, color: '#e63946' }),
  clock: f('Reloj', 'deco', 1, 1, { solid: false }),
  window: f('Ventana', 'deco', 4, 1, { solid: false }),
  rug: f('Tapete', 'deco', 3, 2, { solid: false, colorable: true, color: '#8ecae6', under: true }),
  poolTable: f('Mesa de billar', 'deco', 4, 2, { colorable: true, color: '#1f8a5b' }),
  pingPong: f('Ping pong', 'deco', 4, 2, { colorable: true, color: '#2f6fd6' }),
  reception: f('Recepción', 'muebles', 5, 1, { colorable: true, color: '#101010' }),
  vending: f('Máquina de snacks', 'comida', 1, 1, { colorable: true, color: '#FE3377' }),
  planter: f('Jardinera', 'plantas', 3, 1, { colorable: true, color: '#c99c72' }),
  armchair: f('Sillón', 'muebles', 1, 1, { colorable: true, color: '#FFCC00', rotatable: true }),
  bigScreen: f('Pantalla gigante', 'salas', 5, 1, { colorable: true, color: '#101010' }),

  // Decoraciones de escritorio (no bloquean, posición libre)
  monitor: d('Monitor', 'tech', 0.75, 0.75, { colorable: true, color: '#2b2f3a' }),
  dualMonitor: d('Doble monitor', 'tech', 1.5, 0.75, { colorable: true, color: '#2b2f3a' }),
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
  // GTAHUB
  hexLamp: d('Lámpara hexagonal', 'gtahub', 0.75, 0.75, { colorable: true, color: '#FE3377' }),
  hexBadge: d('Insignia hexagonal', 'gtahub', 0.5, 0.5, { colorable: true, color: '#FFCC00' }),
  cubeLogo: d('Cubo isométrico', 'gtahub', 0.5, 0.5, { colorable: true, color: '#FE3377' }),
  hexNeon: d('Neón hexagonal', 'gtahub', 1, 0.75, { colorable: true, color: '#FE3377' }),
  // Piso (alrededor de tu lugar)
  floorPlant: d('Planta grande', 'piso', 1, 1),
  floorLamp: d('Lámpara de pie', 'piso', 0.5, 1, { colorable: true, color: '#f4a261' }),
  miniFridge: d('Minirefri', 'piso', 0.75, 1, { colorable: true, color: '#e8e8ee' }),
  guitar: d('Guitarra', 'piso', 0.5, 1, { colorable: true, color: '#b5651d' }),
  roundRug: d('Tapete redondo', 'piso', 1, 1, { colorable: true, color: '#8ecae6', under: true }),
  petBed: d('Camita de mascota', 'piso', 0.75, 0.5, { colorable: true, color: '#9b5de5' }),
  trashCan: d('Bote de basura', 'piso', 0.5, 0.5, { colorable: true, color: '#6b7a77' }),
  tallSpeaker: d('Bocina de piso', 'piso', 0.5, 1, { colorable: true, color: '#1d1d22' }),
};

// Modelos de escritorio y de silla que cada quien puede elegir para su lugar
export const DESK_TYPES = ['desk', 'standingDesk', 'gamingDesk', 'woodDesk', 'glassDesk'];
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
