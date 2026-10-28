// Líneas de furnis del Hotel (catálogo ampliado). Cada línea vive en su propio archivo
// y exporta un arreglo de definiciones con el mismo formato que shared/hotelCatalog.js,
// más `line: '<id>'`. Ids con prefijo de la línea (ej. 'urbana_chair') para no chocar.
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

export const HOTEL_LINES = [
  { id: 'urbana', name: 'Urbana', desc: 'Metal y blanco-negro: elegante y moderna' },
  { id: 'puravida', name: 'Pura Vida', desc: 'Moderna en colores: refris, lámparas, camas' },
  { id: 'plastik', name: 'Plastik', desc: 'Plástico de colores, divertida' },
  { id: 'hielo', name: 'Hielo', desc: 'Beige y suave: sillones y bancas' },
  { id: 'cabana', name: 'Cabaña', desc: 'Madera rústica: chimenea, barra, libreros' },
  { id: 'oficina', name: 'Oficina', desc: 'Escritorios, archiveros y sillas de trabajo' },
  { id: 'cristal', name: 'Cristal', desc: 'Transparente y brillante' },
  { id: 'castillo', name: 'Castillo', desc: 'Gótica: tronos, candelabros, gárgolas' },
  { id: 'vintage', name: 'Vintage', desc: 'Francesa antigua: piano, reloj de pie' },
  { id: 'zen', name: 'Zen', desc: 'Japonesa: tatami, biombos, bonsái' },
  { id: 'retro70', name: 'Retro 70s', desc: 'Hippie: lámparas de lava, sofá redondo' },
  { id: 'cocina', name: 'Cocina', desc: 'Estufa, alacena, cafetera' },
  { id: 'bano', name: 'Baño', desc: 'Tina, regadera, lavabo' },
  { id: 'jardin', name: 'Jardín', desc: 'Exterior: fuente, bancas, flores, alberca' },
  { id: 'deportes', name: 'Deportes', desc: 'Gym, porterías, aros de básquet' },
  { id: 'fiesta', name: 'Fiesta', desc: 'Máquinas de bebidas y helado, bola disco' },
  { id: 'hub', name: 'Exclusivo HUB', desc: 'Solo admins: rarezas de la marca' },
];

export const LINE_FURNI = [urbana, puravida, plastik, hielo, cabana, oficina, cristal, castillo, vintage, zen, retro70, cocina, bano, jardin, deportes, fiesta, hub].flat();
