// Arsenal: armas de fuego, espadas y técnicas especiales, con sus números y funciones puras.
// No sabe nada de zombis ni de hordas: lo usa "Zombies en la oficina" y lo puede usar un
// futuro modo de arena (jugador contra jugador). Unidades: casillas del mapa y radianes.
//
// - Los "blancos" son cualquier cosa con { x, y, r } (radio en casillas).
// - Lo que depende del mapa (muros, línea de vista) llega como funciones:
//     cast(x, y, ang, max) -> distancia libre en esa dirección
//     los(ax, ay, bx, by)  -> ¿se ven los dos puntos?

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ---------- Armas de fuego ----------
// dmg por bala · every = segundos entre disparos (o entre ráfagas) · mag = cargador
// reserve = balas extra (Infinity = sin fin) · spread / ads = dispersión de cadera / apuntando
// falloff = [desde, hasta, mínimo]: el daño baja de 1 al mínimo entre esas distancias
// zoom = cuánto se acerca la cámara al apuntar · kick = retroceso · mode = indicador del HUD
export const GUNS = [
  {
    id: 'grapadora', name: 'Grapadora', short: 'Grapadora', kind: 'gun', mode: 'SEMI', sound: 'stapler',
    dmg: 24, every: 0.26, mag: 12, reserve: Infinity, reload: 1.0, spread: 0.012, ads: 0.004, pellets: 1, auto: false,
    kick: 0.5, zoom: 1.25, falloff: [10, 25, 0.6], head: 1.8, desc: 'Fiel y sin fin: nunca se acaban las grapas.',
  },
  {
    id: 'cafetera', name: 'Escopeta de café', short: 'Escopeta', kind: 'gun', mode: 'BOMBA', sound: 'shotgun',
    dmg: 15, every: 0.85, mag: 6, reserve: 24, reload: 1.6, spread: 0.09, ads: 0.065, pellets: 8, auto: false,
    kick: 1.2, zoom: 1.15, falloff: [5, 10.5, 0.35], head: 1.8, cost: 750, desc: 'Ocho granos por tiro. Brutal de cerca.',
  },
  {
    id: 'clavadora', name: 'Clavadora', short: 'Clavadora', kind: 'gun', mode: 'AUTO', sound: 'nail',
    dmg: 13, every: 0.085, mag: 40, reserve: 160, reload: 1.8, spread: 0.035, ads: 0.018, pellets: 1, auto: true,
    kick: 0.35, zoom: 1.3, falloff: [8, 22, 0.55], head: 1.8, cost: 1200, desc: 'Automática: mantén el clic y no sueltes.',
  },
  {
    id: 'toner', name: 'Rifle de tóner', short: 'Tóner', kind: 'gun', mode: 'RÁFAGA', sound: 'toner',
    dmg: 30, every: 0.42, burst: 3, burstEvery: 0.07, mag: 30, reserve: 150, reload: 2.0, spread: 0.022, ads: 0.006, pellets: 1, auto: false,
    kick: 0.42, zoom: 1.6, falloff: [12, 30, 0.7], head: 2, cost: 1600, desc: 'Ráfagas de tres cartuchos de tinta. Preciso a media distancia.',
  },
  {
    id: 'laser', name: 'Láser de presentación', short: 'Láser', kind: 'gun', mode: 'CERROJO', sound: 'laser',
    dmg: 165, every: 1.1, mag: 5, reserve: 30, reload: 2.4, spread: 0.05, ads: 0.0015, pellets: 1, auto: false,
    kick: 1.6, zoom: 3.6, scope: true, pierce: 3, falloff: [40, 60, 1], head: 2.5, cost: 2400,
    desc: 'Francotirador: atraviesa hasta 3 zombis. Clic derecho para la mira.',
  },
  {
    id: 'trituradora', name: 'Trituradora de papel', short: 'Trituradora', kind: 'gun', mode: 'AUTO', sound: 'shred',
    dmg: 17, every: 0.072, mag: 90, reserve: 270, reload: 3.6, spread: 0.05, ads: 0.03, pellets: 1, auto: true,
    kick: 0.28, zoom: 1.25, falloff: [10, 25, 0.6], head: 1.6, cost: 2800, slow: 0.85,
    desc: 'Ametralladora pesada: 90 tiras sin parar. Te hace más lento.',
  },
  {
    id: 'lanzatazas', name: 'Lanzatazas', short: 'Lanzatazas', kind: 'gun', mode: 'LANZADOR', sound: 'thunk',
    dmg: 60, every: 0.9, mag: 4, reserve: 16, reload: 2.6, spread: 0.02, ads: 0.01, pellets: 1, auto: false,
    kick: 1.4, zoom: 1.2, falloff: [40, 60, 1], head: 1.2, cost: 2200, splash: { r: 2.3, dmg: 115 },
    desc: 'Tazas de café que explotan: daño en área.',
  },
];

// ---------- Golpe rápido (con cualquier arma) ----------
export const BASH = { dmg: 45, range: 1.35, arc: 80 * DEG, every: 0.62 };

// ---------- Espadas ----------
// Combo de 3 golpes con arcos distintos; el pesado se carga manteniendo el clic.
// from/to: de qué lado a qué lado barre (−1 derecha, 1 izquierda), tilt = inclinación del corte.
export const COMBO = [
  { arc: 105 * DEG, mult: 1, from: -1, to: 1, tilt: -0.25, dur: 0.32 }, // de derecha a izquierda
  { arc: 115 * DEG, mult: 1.1, from: 1, to: -1, tilt: 0.55, dur: 0.34 }, // diagonal de regreso
  { arc: 70 * DEG, mult: 1.6, from: 0, to: 0, tilt: 1.57, dur: 0.46, reach: 0.35 }, // de arriba a abajo
];
export const HEAVY = { arc: 170 * DEG, mult: 2.6, charge: 0.42, dur: 0.5, reach: 0.4 };
export const COMBO_WINDOW = 0.75; // segundos para seguir el combo

export const SWORDS = [
  {
    id: 'katana', name: 'Katana de oficina', short: 'Katana', kind: 'sword', mode: 'FILO', element: 'agua', tech: 'agua',
    dmg: 40, range: 1.8, speed: 1, energy: 9, cost: 1800, color: '#4fd8ff', sound: 'swish',
    desc: 'Equilibrada y rápida. Estilo Agua.',
  },
  {
    id: 'regla', name: 'Regla afilada', short: 'Regla', kind: 'sword', mode: 'FILO', element: 'rayo', tech: 'rayo',
    dmg: 31, range: 1.65, speed: 0.8, energy: 11, cost: 1500, color: '#ffe14f', sound: 'swish',
    desc: 'Hoja ancha de regla metálica. La más veloz. Estilo Rayo.',
  },
  {
    id: 'carton', name: 'Espada de cartón corrugado', short: 'Cartón', kind: 'sword', mode: 'DOS MANOS', element: 'llama', tech: 'llama',
    dmg: 58, range: 2.05, speed: 1.4, energy: 8, cost: 2000, color: '#ff7a2a', sound: 'heavyswing', twoHand: true,
    desc: 'Mandoble enorme y lento que pega durísimo. Estilo Llama.',
  },
];

// ---------- Técnicas (una por espada) ----------
// kind: 'wave' (un corte que recorre una línea), 'dash' (embestida con giro), 'blink' (paso instantáneo)
export const TECHNIQUES = {
  agua: {
    id: 'agua', style: 'Estilo Agua', name: 'Primera Forma: Corte del Río', kind: 'wave', color: '#4fd8ff', glow: '#bff4ff',
    range: 9, width: 1.3, dmg: 150, cost: 100, cd: 9,
  },
  llama: {
    id: 'llama', style: 'Estilo Llama', name: 'Segunda Forma: Rueda del Fogón', kind: 'dash', color: '#ff7a2a', glow: '#ffd27a',
    range: 4.6, width: 1.75, dmg: 125, cost: 100, cd: 10, burn: { r: 1.5, t: 4, dps: 34 },
  },
  rayo: {
    id: 'rayo', style: 'Estilo Rayo', name: 'Tercera Forma: Paso del Relámpago', kind: 'blink', color: '#ffe14f', glow: '#fffbe0',
    range: 7, width: 1.0, dmg: 190, cost: 100, cd: 9,
  },
};
export const TECH_IDS = Object.keys(TECHNIQUES);
export const ENERGY_MAX = 100;

// Todo el arsenal en un orden fijo (el índice viaja por la red)
export const ARMS = [...GUNS, ...SWORDS];
export const ARM_IDS = ARMS.map((w) => w.id);
export const armIndex = (id) => ARM_IDS.indexOf(id);
export const isSword = (i) => ARMS[i]?.kind === 'sword';
export const isGun = (i) => ARMS[i]?.kind === 'gun';

// ---------- Funciones puras ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Dispersión (radianes) según cómo se dispara: apuntando, caminando (1) o corriendo (2), y retroceso acumulado (0..1+)
export function spreadAt(gun, { ads = false, moving = 0, recoil = 0 } = {}) {
  if (!gun || gun.kind !== 'gun') return 0;
  const base = ads ? gun.ads : gun.spread;
  const mv = moving ? (ads ? 1.25 : 1 + 0.55 * moving) : 1;
  return base * mv + gun.spread * 0.45 * clamp(recoil, 0, 1.6) * (ads ? 0.5 : 1);
}
// Límites que acepta quien decide (para que nadie mande dispersión cero de cadera)
export function spreadLimits(gun) { return [gun.ads * 0.9, gun.spread * 2.4 + 0.02]; }

// Multiplicador de daño por distancia
export function falloff(gun, d) {
  const [a, b, min] = gun.falloff || [99, 100, 1];
  if (d <= a) return 1;
  if (d >= b) return min;
  return 1 - ((d - a) / (b - a)) * (1 - min);
}

// Direcciones de los perdigones de un disparo (deterministas con la semilla)
export function pelletDirs(gun, a, p, seed, spread = gun.spread) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < (gun.pellets || 1); i++) out.push({ a: a + (r() - 0.5) * 2 * spread, p: p + (r() - 0.5) * 2 * spread * 0.6 });
  return out;
}

// ¿El blanco t {x,y,r} está dentro del arco (cono) que sale de o {x,y,a}?
export function inArc(o, t, range, arc) {
  const dx = t.x - o.x, dy = t.y - o.y;
  const d = Math.hypot(dx, dy);
  const r = t.r || 0;
  if (d - r > range) return false;
  if (d < 1e-6) return true;
  const slack = Math.asin(Math.min(1, r / d)); // un blanco grande cabe aunque su centro quede fuera
  return Math.abs(angDiff(o.a, Math.atan2(dy, dx))) <= arc / 2 + slack;
}

// Blancos dentro del arco, del más cercano al más lejano (los tapados por un muro no cuentan)
export function arcHits(o, targets, { range, arc, los = null, max = Infinity }) {
  const out = [];
  for (const t of targets) {
    if (!inArc(o, t, range, arc)) continue;
    if (los && !los(o.x, o.y, t.x, t.y)) continue;
    out.push({ t, d: Math.hypot(t.x - o.x, t.y - o.y) });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, max).map((h) => h.t);
}

// Distancia de un punto a un segmento; k = dónde cae (0 = inicio, 1 = final)
export function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const L2 = vx * vx + vy * vy;
  const k = L2 > 1e-9 ? clamp(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1) : 0;
  const cx = ax + vx * k, cy = ay + vy * k;
  return { d: Math.hypot(px - cx, py - cy), k, cx, cy };
}

// Blancos a lo largo de un camino (con ancho), en el orden en que los cruza
export function pathHits(ax, ay, bx, by, width, targets, { los = null } = {}) {
  const out = [];
  for (const t of targets) {
    const s = segDist(t.x, t.y, ax, ay, bx, by);
    if (s.d > width + (t.r || 0)) continue;
    if (los && !los(s.cx, s.cy, t.x, t.y) && !los(ax, ay, t.x, t.y)) continue;
    out.push({ t, k: s.k });
  }
  out.sort((a, b) => a.k - b.k);
  return out.map((h) => h.t);
}

// Hasta dónde llega una técnica desde (x, y) mirando a `a`, sin atravesar muros
export function techPath(tech, x, y, a, cast) {
  const free = cast ? cast(x, y, a, tech.range) : tech.range;
  const len = clamp(Math.min(tech.range, free - (tech.kind === 'wave' ? 0.05 : 0)), 0, tech.range);
  return { ax: x, ay: y, bx: x + Math.cos(a) * len, by: y + Math.sin(a) * len, len };
}

// Datos de un golpe de espada: kind 'light' (step 0..2) o 'heavy'; lvl = mejoras de filo
export function swingOf(sword, kind = 'light', step = 0, lvl = 0) {
  const up = 1 + 0.2 * (lvl || 0);
  if (kind === 'heavy') return { dmg: sword.dmg * HEAVY.mult * up, range: sword.range + HEAVY.reach, arc: HEAVY.arc, dur: HEAVY.dur * sword.speed, kind };
  const st = ((step % 3) + 3) % 3;
  const c = COMBO[st];
  return { dmg: sword.dmg * c.mult * up, range: sword.range + (c.reach || 0), arc: c.arc, dur: c.dur * sword.speed, kind, step: st };
}

// Energía que da un golpe que conecta (lvl = mejoras de respiración)
export function energyGain(sword, kind = 'light', lvl = 0) {
  return sword.energy * (kind === 'heavy' ? 2 : 1) * (1 + 0.25 * (lvl || 0));
}
// Daño de una técnica (las mejoras de filo también la suben)
export const techDamage = (tech, lvl = 0) => tech.dmg * (1 + 0.15 * (lvl || 0));

// ---------- Caja misteriosa ----------
// Peso de cada arma (las más fuertes salen menos). La de inicio no sale.
export const BOX_WEIGHTS = { cafetera: 10, clavadora: 10, toner: 9, laser: 5, trituradora: 4, lanzatazas: 6, katana: 7, regla: 8, carton: 6 };
export function boxPool(owned = []) {
  const all = ARMS.map((w, i) => i).filter((i) => BOX_WEIGHTS[ARM_IDS[i]]);
  const fresh = all.filter((i) => !owned[i]);
  return fresh.length ? fresh : all;
}
// Escoge un arma (índice de ARMS) con rand() en [0, 1)
export function boxPick(rand, owned = []) {
  const pool = boxPool(owned);
  const total = pool.reduce((a, i) => a + BOX_WEIGHTS[ARM_IDS[i]], 0);
  let r = clamp(rand(), 0, 0.999999) * total;
  for (const i of pool) { r -= BOX_WEIGHTS[ARM_IDS[i]]; if (r < 0) return i; }
  return pool[pool.length - 1];
}

// Bits de "qué armas tengo" (para mandarlo por la red)
export const ownedBits = (owned) => owned.reduce((m, v, i) => (v ? m | (1 << i) : m), 0);
export const bitsOwned = (bits) => ARMS.map((_, i) => !!(bits & (1 << i)));
