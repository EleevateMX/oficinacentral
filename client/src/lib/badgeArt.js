// Dibuja las placas (40×40 px lógicos) en pixel art, a mano y sin imágenes externas.
// Receta (shared/badges.js): { shape, bg, bg2, frame, glyph | text, color, fx }.
// renderBadge() es JS puro (devuelve RGBA): lo usan el navegador y las pruebas.
// badgeUrl() lo pasa a una imagen PNG chiquita (en caché) que se muestra con escalado entero
// y `image-rendering: pixelated`, así se ve nítida a 1× y 2×.
import { BADGE_SIZE, TIER_FRAMES } from '../../../shared/badges.js';

const N = BADGE_SIZE;
const OUTLINE = '#0B0C18';

// ---------- Colores ----------
const hex = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const lighten = (c, t) => mix(c, [255, 255, 255], t);
const darken = (c, t) => mix(c, [0, 0, 0], t);
const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

// ---------- Formas (máscara 40×40) ----------
const CX = 20, CY = 19;
const SHAPE_FN = {
  circle: (x, y) => (x - CX) ** 2 + (y - CY) ** 2 <= 18.4 ** 2,
  seal: (x, y) => { const dx = x - CX, dy = y - CY; const a = Math.atan2(dy, dx); return Math.hypot(dx, dy) <= 17.1 + 1.5 * Math.cos(a * 12); },
  square: (x, y) => { const dx = Math.max(0, Math.abs(x - CX) - 11.5), dy = Math.max(0, Math.abs(y - CY) - 11.5); return Math.abs(x - CX) <= 17.5 && Math.abs(y - CY) <= 17.5 && dx * dx + dy * dy <= 36; },
  shield: (x, y) => {
    const dx = Math.abs(x - CX);
    if (y < 1.2 || y > 37.6) return false;
    if (y < 4 && dx > 17.5 - (4 - y) * 0.9 - 1.2) return false; // esquinas de arriba
    if (y <= 19) return dx <= 17.5;
    const t = (y - 19) / 18.6;
    return dx <= 17.5 * (1 - t * t * 0.92) - t * 1.4;
  },
  hex: (x, y) => { const dx = Math.abs(x - CX), dy = Math.abs(y - CY); return dx <= 16.6 && dx * 0.56 + dy <= 18.6; },
  diamond: (x, y) => Math.abs(x - CX) * 0.92 + Math.abs(y - CY) <= 18.6,
};

// ---------- Fuentes de pixel ----------
const F5 = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], 3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], 5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], 7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], 9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'], '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'], '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
};
const F3 = {
  A: ['###', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['###', '#..', '#..', '#..', '###'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'], G: ['###', '#..', '#.#', '#.#', '###'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '###'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['###', '#.#', '#.#', '#.#', '###'], P: ['###', '#.#', '###', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'], R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['###', '#..', '###', '..#', '###'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['###', '..#', '.##', '...', '.#.'], '+': ['...', '.#.', '###', '.#.', '...'], '#': ['#.#', '###', '#.#', '###', '#.#'],
  '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
};

// ---------- Glifos (dibujos de ~16×16; '#' = color del glifo con luz y sombra automáticas) ----------
// Cada op: [tipo, ...números, char]. Chars: '#' glifo, '+' glifo oscuro, '*' glifo claro, 'z' fondo de la placa,
// '.' borrar, y colores fijos (w blanco, k oscuro, r rojo, y amarillo, g verde, b azul, o naranja, p rosa,
// c cian, m magenta, n café, N café oscuro, s plata, a ámbar, q crema, v morado).
const FIXED = {
  w: '#FFFFFF', k: '#15172A', r: '#E2524A', y: '#FFD95A', g: '#3DAA55', G: '#2A7A3C', b: '#3F8FD0', o: '#F28C28', p: '#F08AB4',
  c: '#25F4EE', m: '#FE2C55', n: '#8A5A3A', N: '#5E3A22', s: '#C9D1DC', a: '#E0B15A', q: '#ECE8DA', v: '#9146FF',
};
const heart = (cx, cy, s, ch) => [['circle', cx - 3 * s, cy - 2 * s, 3.6 * s, ch], ['circle', cx + 3 * s, cy - 2 * s, 3.6 * s, ch], ['poly', [[cx - 6.4 * s, cy - 0.8 * s], [cx + 6.4 * s, cy - 0.8 * s], [cx, cy + 6.6 * s]], ch]];
export const GLYPH_ART = {
  crown: { rows: ['y......y......y', '#.....###.....#', '##...#####...##', '###.#######.###', '###############', '###############', '##r###b#b###r##', '###############', '+++++++++++++++'] },
  star: { w: 17, h: 16, ops: [['star', 8.5, 8.6, 8.4, 3.6, '#']] },
  shieldStar: { w: 16, h: 17, ops: [['poly', [[1, 1], [15, 1], [15, 8], [8, 16.5], [1, 8]], '#'], ['star', 8, 7.6, 5, 2.1, 'a']] },
  gavel: { w: 16, h: 16, ops: [['line', 2.5, 7, 8.5, 1, 5.2, '#'], ['line', 6.5, 6.5, 13.5, 13.5, 2.3, 'n'], ['rect', 0, 13, 8, 3, '+']] },
  wrench: { w: 16, h: 16, ops: [['line', 2.5, 13.5, 9.5, 6.5, 3, '#'], ['circle', 11, 5, 4.6, '#'], ['circle', 13, 3, 2.1, '.'], ['circle', 2.6, 13.4, 0.8, '+']] },
  gem: { w: 17, h: 15, ops: [['poly', [[4, 1], [13, 1], [16.5, 5.5], [0.5, 5.5]], '*'], ['poly', [[0.5, 5.5], [16.5, 5.5], [8.5, 14.8]], '#'], ['poly', [[5.5, 5.5], [11.5, 5.5], [8.5, 14.5]], '+'], ['rect', 4, 2, 2, 1, 'w']] },
  flask: { w: 15, h: 16, ops: [['rect', 4, 0, 7, 2, 's'], ['rect', 5, 2, 5, 4, 'w'], ['poly', [[5, 5.5], [10, 5.5], [14.6, 16], [0.4, 16]], 'w'], ['poly', [[2.6, 10.5], [12.4, 10.5], [14.6, 16], [0.4, 16]], '#'], ['circle', 6, 13, 1, '*'], ['circle', 9.5, 11.8, 0.7, '*']] },
  flag: { w: 16, h: 16, ops: [['rect', 1, 0, 2, 16, 's'], ['poly', [[3, 1], [15, 1], [11.5, 5.5], [15, 10], [3, 10]], '#']] },
  palette: { w: 16, h: 15, ops: [['ellipse', 8, 7.5, 7.8, 7, '#'], ['circle', 10.5, 11, 1.8, '.'], ['circle', 4.5, 5.5, 1.6, 'r'], ['circle', 8, 3.4, 1.6, 'y'], ['circle', 11.8, 5.2, 1.6, 'b'], ['circle', 4.4, 9.8, 1.6, 'g']] },
  calendar: { w: 16, h: 16, ops: [['rect', 1, 2, 14, 14, 'w'], ['rect', 1, 2, 14, 4, 'r'], ['rect', 3, 0, 2, 4, 's'], ['rect', 11, 0, 2, 4, 's'],
    ['rect', 3, 8, 2, 2, 'k'], ['rect', 7, 8, 2, 2, 'k'], ['rect', 11, 8, 2, 2, 'k'], ['rect', 3, 12, 2, 2, 'k'], ['rect', 7, 12, 2, 2, 'r']] },
  trophy: { w: 16, h: 16, ops: [['ring', 2.8, 4.6, 3, 1.4, '#'], ['ring', 13.2, 4.6, 3, 1.4, '#'], ['poly', [[2.5, 0.5], [13.5, 0.5], [12.5, 6.5], [9.5, 9.5], [6.5, 9.5], [3.5, 6.5]], '#'],
    ['rect', 7, 9, 2, 3, '#'], ['rect', 4, 12, 8, 4, '+'], ['rect', 5, 2, 1, 4, '*']] },
  chevrons: { w: 15, h: 16, ops: [['line', 1.5, 2, 7.5, 6.5, 2.6, '#'], ['line', 7.5, 6.5, 13.5, 2, 2.6, '#'], ['line', 1.5, 7, 7.5, 11.5, 2.6, '#'], ['line', 7.5, 11.5, 13.5, 7, 2.6, '#'], ['line', 1.5, 12, 7.5, 16, 2.4, '+'], ['line', 7.5, 16, 13.5, 12, 2.4, '+']] },
  bubble: { w: 16, h: 16, ops: [['rrect', 0, 0, 16, 11, 3.5, '#'], ['poly', [[3.5, 10], [9, 10], [3.5, 15.5]], '#'], ['rect', 3, 4, 2, 3, 'z'], ['rect', 7, 4, 2, 3, 'z'], ['rect', 11, 4, 2, 3, 'z']] },
  play: { w: 14, h: 16, ops: [['poly', [[1, 0.5], [13.8, 8], [1, 15.5]], '#']] },
  note: { w: 14, h: 16, ops: [['circle', 4, 12.5, 3.3, '#'], ['rect', 5.5, 0, 2.6, 12.5, '#'], ['poly', [[8, 0], [13.5, 2.5], [13.5, 6.5], [8, 4]], '#']] },
  camera: { w: 17, h: 14, ops: [['rrect', 0, 3, 12, 10, 2, '#'], ['poly', [[12, 6], [17, 3.5], [17, 12.5], [12, 10]], '#'], ['circle', 6, 8, 3.2, 'k'], ['circle', 6, 8, 1.8, 'b'], ['rect', 5, 7, 1, 1, 'w'], ['circle', 2.2, 1.8, 2, 'r']] },
  pumpkin: { w: 17, h: 15, ops: [['ellipse', 8.5, 9, 8.3, 6, '#'], ['line', 8.5, 3.5, 8.5, 14.5, 1, '+'], ['line', 4, 4.5, 4, 13.5, 1, '+'], ['line', 13, 4.5, 13, 13.5, 1, '+'], ['rect', 7, 0, 3, 3.5, 'G'],
    ['poly', [[3.5, 9], [6.5, 9], [5, 6.5]], 'y'], ['poly', [[10.5, 9], [13.5, 9], [12, 6.5]], 'y'], ['poly', [[4, 11], [13, 11], [11.5, 13], [5.5, 13]], 'y'], ['rect', 7.5, 11, 1, 1, '#'], ['rect', 9.5, 12, 1, 1, '#']] },
  tree: { w: 15, h: 17, ops: [['poly', [[7.5, 1.5], [12, 7], [3, 7]], '#'], ['poly', [[7.5, 4.5], [13.5, 11], [1.5, 11]], '#'], ['poly', [[7.5, 8], [15, 15], [0, 15]], '#'], ['rect', 6, 15, 3, 2, 'n'],
    ['star', 7.5, 2, 2.3, 1, 'y'], ['circle', 5, 9.6, 0.9, 'r'], ['circle', 10, 12.4, 0.9, 'y'], ['circle', 4.5, 13.6, 0.9, 'b'], ['circle', 9, 6.2, 0.8, 'r']] },
  cake: { w: 16, h: 16, ops: [['rect', 1, 8, 14, 8, '#'], ['rrect', 1, 6, 14, 4, 1, 'p'], ['rect', 3, 10, 2, 1, 'p'], ['rect', 8, 10, 2, 2, 'p'], ['rect', 12, 10, 1, 1, 'p'], ['rect', 1, 13, 14, 1, '+'],
    ['rect', 7, 2, 2, 4, 'b'], ['ellipse', 8, 0.9, 1, 1.3, 'y']] },
  rocket: { w: 15, h: 17, ops: [['ellipse', 7.5, 7, 3.8, 7, '#'], ['circle', 7.5, 5.6, 1.7, 'b'], ['poly', [[3.8, 8], [0.5, 13.5], [4, 13]], 'r'], ['poly', [[11.2, 8], [14.5, 13.5], [11, 13]], 'r'],
    ['rect', 5, 12, 5, 2, '+'], ['poly', [[5.5, 14], [9.5, 14], [7.5, 17]], 'o'], ['rect', 7, 14, 1, 1.6, 'y']] },
  swords: { w: 16, h: 16, ops: [['line', 1.5, 1.5, 11, 11, 2, 's'], ['line', 14.5, 1.5, 5, 11, 2, 's'], ['line', 8.6, 13.4, 13.4, 8.6, 1.8, 'a'], ['line', 2.6, 8.6, 7.4, 13.4, 1.8, 'a'],
    ['line', 11.5, 11.5, 14.5, 14.5, 2, 'n'], ['line', 4.5, 11.5, 1.5, 14.5, 2, 'n']] },
  crosshair: { w: 16, h: 16, ops: [['ring', 8, 8, 7, 5.3, '#'], ['rect', 7, 0, 2, 5.5, '#'], ['rect', 7, 10.5, 2, 5.5, '#'], ['rect', 0, 7, 5.5, 2, '#'], ['rect', 10.5, 7, 5.5, 2, '#'], ['rect', 7, 7, 2, 2, 'r']] },
  pickaxe: { w: 16, h: 16, ops: [['line', 0.8, 6.5, 8, 1.6, 2.6, 's'], ['line', 8, 1.6, 15.2, 6.5, 2.6, 's'], ['line', 8, 2.5, 8, 15.5, 2.2, 'n'], ['rect', 6.5, 1, 3, 3, '#']] },
  cube: { w: 16, h: 16, ops: [['poly', [[8, 0.5], [15.5, 4.3], [8, 8.1], [0.5, 4.3]], '#'], ['poly', [[0.5, 4.3], [8, 8.1], [8, 15.8], [0.5, 12]], 'n'], ['poly', [[8, 8.1], [15.5, 4.3], [15.5, 12], [8, 15.8]], 'N'],
    ['poly', [[0.5, 4.3], [8, 8.1], [8, 10], [0.5, 6.2]], '+'], ['poly', [[8, 8.1], [15.5, 4.3], [15.5, 6.2], [8, 10]], '+'], ['rect', 2, 9, 1, 1, '+'], ['rect', 12, 10, 1, 1, '+']] },
  mask: { w: 16, h: 16, ops: [['ellipse', 8, 6.5, 7.6, 6.5, '#'], ['poly', [[1, 7], [15, 7], [12, 13], [8, 15.6], [4, 13]], '#'], ['poly', [[2.8, 5.5], [6.6, 6.2], [6, 8.2], [3.4, 7.6]], 'k'],
    ['poly', [[13.2, 5.5], [9.4, 6.2], [10, 8.2], [12.6, 7.6]], 'k'], ['poly', [[4.5, 10], [11.5, 10], [8, 13]], 'k'], ['rect', 1, 1, 2, 1, 'r'], ['rect', 13, 1, 2, 1, 'r']] },
  car: { w: 17, h: 13, ops: [['rrect', 0, 5, 17, 6, 2, '#'], ['poly', [[3.5, 5.5], [5.5, 1], [11.5, 1], [14, 5.5]], '#'], ['poly', [[5, 5], [6.4, 2.2], [8.1, 2.2], [8.1, 5]], 'b'], ['poly', [[9.1, 5], [9.1, 2.2], [10.9, 2.2], [12.6, 5]], 'b'],
    ['circle', 4, 11, 2.3, 'k'], ['circle', 13, 11, 2.3, 'k'], ['rect', 3.5, 10.5, 1, 1, 's'], ['rect', 12.5, 10.5, 1, 1, 's'], ['rect', 15.5, 6.5, 1.5, 1.5, 'y']] },
  ball: { w: 16, h: 16, ops: [['circle', 8, 8, 7.8, '#'], ['poly', [[8, 5], [10.9, 7.1], [9.8, 10.5], [6.2, 10.5], [5.1, 7.1]], 'k'], ['poly', [[6, 0.2], [10, 0.2], [8, 2.2]], 'k'],
    ['poly', [[0.2, 6], [2.4, 8], [0.4, 11]], 'k'], ['poly', [[15.8, 6], [13.6, 8], [15.6, 11]], 'k'], ['poly', [[4, 15], [6, 13.5], [7, 15.8]], 'k'], ['poly', [[12, 15], [10, 13.5], [9, 15.8]], 'k']] },
  controller: { w: 17, h: 12, ops: [['rrect', 0.5, 1, 16, 7, 3, '#'], ['ellipse', 3.5, 8, 3, 3.8, '#'], ['ellipse', 13.5, 8, 3, 3.8, '#'], ['rect', 2.5, 4, 4, 1.5, 'k'], ['rect', 3.75, 2.75, 1.5, 4, 'k'],
    ['circle', 12, 3.6, 1, 'r'], ['circle', 14, 5.4, 1, 'b'], ['circle', 10, 5.4, 1, 'y'], ['circle', 12, 7.2, 1, 'g']] },
  heart: { w: 15, h: 14, ops: heart(7.5, 5.4, 1, '#') },
  bolt: { w: 13, h: 17, ops: [['poly', [[8, 0], [1, 9.5], [6, 9.5], [4, 17], [12.5, 6.5], [7.5, 6.5], [10, 0]], '#']] },
  clock: { w: 16, h: 16, ops: [['circle', 8, 8, 7.8, '#'], ['circle', 8, 8, 6, 'w'], ['rect', 7.3, 3.5, 1.4, 5, 'k'], ['line', 8, 8, 11.3, 9.8, 1.4, 'k'], ['rect', 7.5, 1.6, 1, 1, '+'], ['rect', 7.5, 13.4, 1, 1, '+'], ['rect', 1.6, 7.5, 1, 1, '+'], ['rect', 13.4, 7.5, 1, 1, '+'], ['rect', 7, 7, 2, 2, 'r']] },
  building: { w: 14, h: 17, ops: [['rect', 1, 3, 12, 14, '#'], ['rect', 3, 1, 8, 2, '#'], ['rect', 6.5, 0, 1, 1, 'r'], ['rect', 3, 5, 2, 2, 'y'], ['rect', 6, 5, 2, 2, 'y'], ['rect', 9, 5, 2, 2, 'k'],
    ['rect', 3, 9, 2, 2, 'k'], ['rect', 6, 9, 2, 2, 'y'], ['rect', 9, 9, 2, 2, 'y'], ['rect', 5.5, 13, 3, 4, 'k']] },
  sun: { w: 17, h: 17, ops: [['circle', 8.5, 8.5, 4.6, '#'], ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i * Math.PI) / 4; return ['line', 8.5 + Math.cos(a) * 6.2, 8.5 + Math.sin(a) * 6.2, 8.5 + Math.cos(a) * 8, 8.5 + Math.sin(a) * 8, 1.7, '#']; })] },
  moon: { w: 16, h: 16, ops: [['circle', 7.5, 8.5, 7.2, '#'], ['circle', 11, 6, 6, '.'], ['rect', 12, 11, 1, 1, 'w'], ['rect', 14, 7, 1, 1, 'w'], ['rect', 13, 1, 1, 1, 'w']] },
  paddle: { w: 16, h: 16, ops: [['circle', 6, 6.5, 5.8, '#'], ['line', 9.6, 10.1, 14.2, 14.7, 2.8, 'n'], ['circle', 13.4, 2.6, 2, 'w']] },
  eightball: { w: 16, h: 16, ops: [['circle', 8, 8, 7.8, '#'], ['circle', 8, 6.8, 3.4, 'w'], ['text', 7, 4.5, '8', 'k', 3], ['rect', 3, 3, 2, 1, 's']] },
  invader: { rows: ['....#####....', '..#########..', '.###########.', '.##ww###ww##.', '###wk###wk###', '#############', '#############', '#############', '##.###.###.##', '#...#...#...#'] },
  music: { w: 16, h: 16, ops: [['ellipse', 3.4, 13, 3, 2.6, '#'], ['ellipse', 12.4, 11, 3, 2.6, '#'], ['rect', 4.8, 2, 1.8, 11, '#'], ['rect', 13.8, 0, 1.8, 11, '#'], ['poly', [[4.8, 2], [15.6, 0], [15.6, 3.2], [4.8, 5.2]], '#']] },
  hug: { w: 17, h: 15, ops: [...heart(5.8, 7.6, 0.72, 'p'), ...heart(11, 5, 0.72, '#')] },
  compass: { w: 16, h: 16, ops: [['circle', 8, 8, 7.8, '#'], ['circle', 8, 8, 6, 'w'], ['poly', [[8, 2.2], [10.2, 8], [5.8, 8]], 'r'], ['poly', [[5.8, 8], [10.2, 8], [8, 13.8]], 's'], ['rect', 7.5, 7.5, 1, 1, 'k']] },
  plant: { w: 16, h: 17, ops: [['rect', 7.3, 4, 1.4, 7, 'G'], ['ellipse', 4.5, 6.5, 3.8, 2.2, '#'], ['ellipse', 11.5, 5.5, 3.8, 2.2, '#'], ['ellipse', 8, 2.6, 2.2, 3, '#'],
    ['poly', [[2.5, 10], [13.5, 10], [12, 17], [4, 17]], 'o'], ['rect', 2, 10, 12, 2, 'n']] },
  medal: { w: 16, h: 17, ops: [['poly', [[2.5, 0], [7, 0], [9.5, 7], [7, 8]], 'r'], ['poly', [[13.5, 0], [9, 0], [6.5, 7], [9, 8]], 'b'], ['circle', 8, 11.5, 5.2, '#'], ['star', 8, 11.6, 3.4, 1.5, '+']] },
  skull: { w: 16, h: 16, ops: [['circle', 8, 7, 7, '#'], ['rrect', 3.5, 9, 9, 6.5, 1.5, '#'], ['circle', 5.2, 7.6, 2, 'k'], ['circle', 10.8, 7.6, 2, 'k'], ['poly', [[8, 9.6], [9.2, 11.6], [6.8, 11.6]], 'k'],
    ['rect', 6, 13, 1, 2.5, 'k'], ['rect', 9, 13, 1, 2.5, 'k']] },
  fire: { w: 15, h: 17, ops: [['poly', [[7.5, 0], [11, 4], [13.5, 8.5], [13.5, 12.5], [10.5, 16.5], [4.5, 16.5], [1.5, 12.5], [1.5, 8.5], [4, 5], [5.5, 7.5]], '#'], ['poly', [[7.5, 6], [10.5, 10.5], [10.2, 14], [8.5, 16], [6.5, 16], [4.8, 14], [4.8, 11]], 'y']] },
  headset: { w: 17, h: 16, ops: [['ring', 8.5, 9, 8, 6.1, '#', 0, 9.5], ['rrect', 0, 8, 5, 8, 2, '#'], ['rrect', 12, 8, 5, 8, 2, '#'], ['rect', 1.5, 10, 2, 4, '+'], ['rect', 13.5, 10, 2, 4, '+']] },
  mic: { w: 14, h: 17, ops: [['rrect', 4, 0, 6, 10, 3, '#'], ['rect', 5, 3, 4, 1, '+'], ['rect', 5, 5.5, 4, 1, '+'], ['ring', 7, 7, 6, 4.6, 's', 7, 14], ['rect', 6.3, 12.5, 1.4, 3, 's'], ['rect', 3.5, 15.5, 7, 1.5, 's']] },
};

// Rasteriza un glifo a una rejilla de chars
function rasterGlyph(g) {
  if (g.rows) {
    const w = Math.max(...g.rows.map((r) => r.length));
    return { w, h: g.rows.length, px: g.rows.map((r) => r.padEnd(w, '.').split('')) };
  }
  const { w, h } = g;
  const px = Array.from({ length: h }, () => Array(w).fill('.'));
  const paint = (test, ch) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) px[y][x] = ch; };
  for (const op of g.ops) {
    const [t, ...a] = op;
    if (t === 'rect') { const [x0, y0, ww, hh, ch] = a; paint((x, y) => x >= x0 && x <= x0 + ww && y >= y0 && y <= y0 + hh, ch); }
    else if (t === 'rrect') {
      const [x0, y0, ww, hh, r, ch] = a;
      paint((x, y) => {
        if (x < x0 || x > x0 + ww || y < y0 || y > y0 + hh) return false;
        const dx = Math.max(0, Math.abs(x - (x0 + ww / 2)) - (ww / 2 - r)), dy = Math.max(0, Math.abs(y - (y0 + hh / 2)) - (hh / 2 - r));
        return dx * dx + dy * dy <= r * r;
      }, ch);
    } else if (t === 'circle') { const [cx, cy, r, ch] = a; paint((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, ch); }
    else if (t === 'ellipse') { const [cx, cy, rx, ry, ch] = a; paint((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, ch); }
    else if (t === 'ring') {
      const [cx, cy, ro, ri, ch, ymin = -1e9, ymax = 1e9] = a;
      paint((x, y) => { const d = (x - cx) ** 2 + (y - cy) ** 2; return d <= ro * ro && d >= ri * ri && y >= ymin && y <= ymax; }, ch);
    } else if (t === 'poly') { const [pts, ch] = a; paint((x, y) => inPoly(pts, x, y), ch); }
    else if (t === 'star') {
      const [cx, cy, R, r, ch] = a;
      const pts = Array.from({ length: 10 }, (_, i) => { const ang = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r : R; return [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]; });
      paint((x, y) => inPoly(pts, x, y), ch);
    } else if (t === 'line') {
      const [x1, y1, x2, y2, lw, ch] = a;
      paint((x, y) => segDist(x, y, x1, y1, x2, y2) <= lw / 2, ch);
    } else if (t === 'text') {
      const [x0, y0, str, ch, size] = a;
      const font = size === 3 ? F3 : F5;
      let cx = Math.round(x0);
      for (const c of str) {
        const gl = font[c];
        if (gl) gl.forEach((row, yy) => row.split('').forEach((v, xx) => { if (v === '#' && px[Math.round(y0) + yy]?.[cx + xx] !== undefined) px[Math.round(y0) + yy][cx + xx] = ch; }));
        cx += (size === 3 ? 4 : 6);
      }
    }
  }
  return { w, h, px };
}
function inPoly(pts, x, y) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Letras: 1 → 5×7 a 3×, 2 → 5×7 a 2×, 3 → 3×5 a 2×
function rasterText(text) {
  const chars = String(text).slice(0, 3).split('');
  const small = chars.length === 3;
  const font = small ? F3 : F5;
  const scale = chars.length === 1 ? 3 : 2;
  const cw = (small ? 3 : 5) * scale, ch = (small ? 5 : 7) * scale, gap = chars.length === 1 ? 0 : 3;
  const w = chars.length * cw + (chars.length - 1) * gap;
  const px = Array.from({ length: ch }, () => Array(w).fill('.'));
  chars.forEach((c, i) => {
    const gl = font[c] || font['?'];
    gl.forEach((row, yy) => row.split('').forEach((v, xx) => {
      if (v !== '#') return;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) px[yy * scale + sy][i * (cw + gap) + xx * scale + sx] = '#';
    }));
  });
  return { w, h: ch, px };
}

// ---------- Placa completa ----------
// opts: { tier } para los logros (marco bronce/plata/oro; 0 = bloqueada)
export function renderBadge(art = {}, opts = {}) {
  const out = new Uint8ClampedArray(N * N * 4);
  const shapeFn = SHAPE_FN[art.shape] || SHAPE_FN.circle;
  const ach = opts.tier !== undefined && opts.tier !== null;
  const frameHex = ach ? TIER_FRAMES[Math.max(0, Math.min(3, opts.tier || 0))] : (art.frame || '#ECE8DA');
  const F = ach ? 3 : 2; // grosor del marco
  const bg = hex(art.bg || '#5D7E9F'), bg2 = hex(art.bg2 || art.bg || '#222640'), fr = hex(frameHex), gc = hex(art.color || '#ECE8DA');
  const outl = hex(OUTLINE);

  // Máscara y anillos (distancia en pasos de 4 vecinos desde el borde)
  const inside = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) inside[y * N + x] = shapeFn(x + 0.5, y + 0.5) ? 1 : 0;
  const dist = new Int16Array(N * N).fill(-1);
  let ring = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inside[y * N + x]) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= N || ny >= N || !inside[ny * N + nx]; });
    if (edge) { dist[y * N + x] = 0; ring.push([x, y]); }
  }
  for (let d = 1; ring.length; d++) {
    const next = [];
    for (const [x, y] of ring) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, i = ny * N + nx;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N && inside[i] && dist[i] < 0) { dist[i] = d; next.push([nx, ny]); }
    }
    ring = next;
  }
  // Alto real de la forma (para el degradado del fondo)
  let top = N, bot = 0;
  for (let i = 0; i < N * N; i++) if (dist[i] > F + 1) { const y = Math.floor(i / N); top = Math.min(top, y); bot = Math.max(bot, y); }
  const bayer = [0, 2, 3, 1];
  const set = (x, y, c, a = 255) => { const i = (y * N + x) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = a; };
  const get = (x, y) => { const i = (y * N + x) * 4; return [out[i], out[i + 1], out[i + 2]]; };
  const light = (x, y) => -((x + 0.5 - CX) + (y + 0.5 - CY)) / 26; // >0 arriba a la izquierda
  const frHi = lighten(fr, 0.45), frLo = darken(fr, 0.32), frLine = darken(fr, 0.55);

  // Sombra abajo (1 px, debajo de la forma)
  for (let y = N - 1; y > 0; y--) for (let x = 0; x < N; x++) if (!inside[y * N + x] && inside[(y - 1) * N + x]) set(x, y, [0, 0, 0], 70);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = dist[y * N + x];
    if (d < 0) continue;
    const L = light(x, y);
    if (d === 0) set(x, y, outl);
    else if (d <= F) set(x, y, d === 1 && L > 0.2 ? frHi : L < -0.25 ? frLo : L > 0.45 ? frHi : fr);
    else if (d === F + 1) set(x, y, L > 0.35 ? darken(fr, 0.25) : frLine);
    else {
      const t = bot > top ? (y - top) / (bot - top) : 0;
      const levels = 4, v = t * (levels - 1), base = Math.floor(v), frac = v - base;
      const thr = bayer[(x & 1) + (y & 1) * 2] / 4 + 0.125;
      const lvl = Math.min(levels - 1, base + (frac > thr ? 1 : 0));
      let c = mix(bg, bg2, lvl / (levels - 1));
      if (d === F + 2 && L > 0.25) c = lighten(c, 0.22); // brillo del borde interior
      if (d === F + 2 && L < -0.35) c = darken(c, 0.18);
      set(x, y, c);
    }
  }

  // Glifo o letras
  const g = art.text ? rasterText(art.text) : GLYPH_ART[art.glyph] ? rasterGlyph(GLYPH_ART[art.glyph]) : null;
  if (g) {
    const x0 = Math.round(CX - g.w / 2), y0 = Math.round(CY - g.h / 2) + (art.shape === 'shield' ? -1 : 0);
    const isG = (gx, gy) => gy >= 0 && gy < g.h && gx >= 0 && gx < g.w && g.px[gy][gx] !== '.';
    const fixed = Object.fromEntries(Object.entries(FIXED).map(([k, v]) => [k, hex(v)]));
    const gHi = lighten(gc, lum(gc) > 0.8 ? 0.6 : 0.38), gLo = darken(gc, 0.3);
    const colorOf = (gx, gy) => {
      const c = g.px[gy][gx];
      if (c === '#') {
        const upOpen = !isG(gx, gy - 1), downOpen = !isG(gx, gy + 1);
        if (upOpen && !downOpen) return gHi;
        if (downOpen && !upOpen) return gLo;
        return gc;
      }
      if (c === '+') return darken(gc, 0.35);
      if (c === '*') return lighten(gc, 0.45);
      if (c === 'z') return bg;
      return fixed[c] || gc;
    };
    const inB = (x, y) => x >= 0 && y >= 0 && x < N && y < N && dist[y * N + x] >= 0;
    // Sombra (abajo a la derecha) y contorno oscuro de 1 px
    const solid = (x, y) => isG(x - x0, y - y0);
    const near4 = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => solid(x + dx, y + dy));
    for (let y = y0 - 2; y < y0 + g.h + 3; y++) for (let x = x0 - 2; x < x0 + g.w + 3; x++) {
      if (!inB(x, y) || solid(x, y) || near4(x, y)) continue;
      if (solid(x - 1, y - 1) || solid(x - 2, y - 1) || solid(x - 1, y - 2) || near4(x - 1, y - 1)) set(x, y, darken(get(x, y), 0.3));
    }
    for (let y = y0 - 1; y < y0 + g.h + 1; y++) for (let x = x0 - 1; x < x0 + g.w + 1; x++) if (inB(x, y) && !solid(x, y) && near4(x, y)) set(x, y, outl);
    if (art.fx === 'tiktok') {
      for (let gy = 0; gy < g.h; gy++) for (let gx = 0; gx < g.w; gx++) if (isG(gx, gy)) {
        if (inB(x0 + gx - 1, y0 + gy - 1)) set(x0 + gx - 1, y0 + gy - 1, fixed.c);
        if (inB(x0 + gx + 1, y0 + gy + 1)) set(x0 + gx + 1, y0 + gy + 1, fixed.m);
      }
      for (let gy = 0; gy < g.h; gy++) for (let gx = 0; gx < g.w; gx++) if (isG(gx, gy) && inB(x0 + gx, y0 + gy)) set(x0 + gx, y0 + gy, gc);
    } else {
      for (let gy = 0; gy < g.h; gy++) for (let gx = 0; gx < g.w; gx++) if (isG(gx, gy) && inB(x0 + gx, y0 + gy)) set(x0 + gx, y0 + gy, colorOf(gx, gy));
    }
  }
  // Oro: destello en el marco
  if (ach && opts.tier >= 3) {
    const w = [255, 255, 255], sx = 31, sy = 6;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) set(sx + dx, sy + dy, w);
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) set(sx + dx, sy + dy, hex('#FFE38A'));
  }
  return out;
}

// ---------- Navegador: imagen en caché ----------
const urlCache = new Map();
export function badgeUrl(art, opts = {}) {
  const key = JSON.stringify([art, opts.tier ?? null]);
  let u = urlCache.get(key);
  if (u) return u;
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  ctx.putImageData(new ImageData(renderBadge(art, opts), N, N), 0, 0);
  u = cv.toDataURL('image/png');
  if (urlCache.size > 600) urlCache.clear();
  urlCache.set(key, u);
  return u;
}
// Para dibujar una placa dentro de otro canvas (sin suavizado)
const cvCache = new Map();
export function badgeCanvas(art, opts = {}) {
  const key = JSON.stringify([art, opts.tier ?? null]);
  let cv = cvCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  cv.getContext('2d').putImageData(new ImageData(renderBadge(art, opts), N, N), 0, 0);
  cvCache.set(key, cv);
  return cv;
}
