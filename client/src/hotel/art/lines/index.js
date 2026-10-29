// Junta el dibujo de todas las líneas del catálogo ampliado
import urbana from './urbana.js';
import puravida from './puravida.js';
import plastik from './plastik.js';
import hielo from './hielo.js';
import cabana from './cabana.js';
import oficina from './oficina.js';
import cristal from './cristal.js';
import castillo from './castillo.js';
import vintage from './vintage.js';
import zen from './zen.js';
import retro70 from './retro70.js';
import cocina from './cocina.js';
import bano from './bano.js';
import jardin from './jardin.js';
import deportes from './deportes.js';
import fiesta from './fiesta.js';
import hub from './hub.js';

const ALL = [urbana, puravida, plastik, hielo, cabana, oficina, cristal, castillo, vintage, zen, retro70, cocina, bano, jardin, deportes, fiesta, hub];
export const LINE_FLOOR = Object.assign({}, ...ALL.map((m) => m.floor || {}));
export const LINE_WALL = Object.assign({}, ...ALL.map((m) => m.wall || {}));
export const LINE_PERIOD = Object.assign({}, ...ALL.map((m) => m.period || {}));
export const LINE_DEFAULT_COLOR = Object.assign({}, ...ALL.map((m) => m.defaultColor || {}));

// Línea "Economía HUB" (agente A): registro aparte para no chocar con otras líneas
import economia from './economia.js';
Object.assign(LINE_FLOOR, economia.floor); Object.assign(LINE_WALL, economia.wall || {});
Object.assign(LINE_PERIOD, economia.period || {}); Object.assign(LINE_DEFAULT_COLOR, economia.defaultColor || {});
