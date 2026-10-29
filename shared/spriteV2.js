// Personajes "HUB v2": pixel-art propio, más alto y con más detalle que el clásico (shared/sprite.js).
//
// Cada cuadro mide 40×64 píxeles del dibujo; los pies pisan la fila 62 (V2_FOOT).
// El personaje se arma con un "maniquí" 3D muy sencillo (esferas, elipsoides y troncos) que se
// pinta en pixel-art: cada píxel toma el color de la pieza más cercana a la cámara, con 4 tonos por
// material (luz arriba a la izquierda), contorno de color (no negro) y líneas internas donde una
// pieza tapa a otra. Así salen las 8 direcciones, el ciclo de caminar y todas las posturas con el
// mismo estilo, a partir de la misma ficha del avatar (mismos campos y colores que el clásico).
//
// No hay sprites copiados de ningún lado: todo sale de este archivo.
//
//   renderFrameV2(avatar, o) → { data (RGBA), width, height, hands, holdArm, head, seat, crown }
//     o.dir:  'down' | 'downLeft' | 'left' | 'upLeft' | 'up' | 'upRight' | 'right' | 'downRight'
//     o.head: dirección de la cabeza (si voltea distinto del cuerpo) · o.walk: cuadro del ciclo (1–8, 0 = quieto)
//     o.pose: postura (las mismas de shared/sprite.js: POSES, 'sit', 'sign') o 'sitHalf' / 'lay'
//     o.breathe: 1 = exhalando (el torso baja 1 px) · o.blink · o.talk · o.hold / o.drink / o.sign (Hotel)
import { normalizeSpec, PARTS, STYLE_NAMES, HAND_ITEMS, POSE_DEFS, HOTEL_POSE_DEFS, paintHandItem } from './sprite.js';

export const V2_W = 40;
export const V2_H = 64;
export const V2_FOOT = 62; // fila debajo de las suelas
export const V2_WALK = 8; // cuadros del ciclo de caminar
// Las 8 vistas en orden de giro (para voltear pasando por las intermedias)
export const V2_RING = ['down', 'downLeft', 'left', 'upLeft', 'up', 'upRight', 'right', 'downRight'];
const YAW = { down: 0, downLeft: -45, left: -90, upLeft: -135, up: 180, upRight: 135, right: 90, downRight: 45 };

// Piezas nuevas (solo HUB v2; el clásico las cambia por la primera de su lista)
export const V2_EXTRA = {
  top: ['dress', 'polo'],
  hat: ['beret'],
  extra: ['necklace'],
};
export const V2_PARTS = Object.fromEntries(Object.entries(PARTS).map(([k, l]) => [k, [...l, ...(V2_EXTRA[k] || [])]]));
export const V2_NAMES = {
  ...STYLE_NAMES,
  top: { ...STYLE_NAMES.top, dress: 'Vestido', polo: 'Polo' },
  hat: { ...STYLE_NAMES.hat, beret: 'Boina' },
  extra: { ...STYLE_NAMES.extra, necklace: 'Collar' },
};

// La misma ficha que el clásico, aceptando además las piezas nuevas
export function normalizeSpecV2(av = {}) {
  const s = normalizeSpec(av);
  for (const [k, list] of Object.entries(V2_EXTRA)) if (list.includes(av[k])) s[k] = av[k];
  return s;
}

// ---------------- color ----------------
const HEX = /^#[0-9a-fA-F]{6}$/;
function hexRgb(hex, fb) {
  const h = HEX.test(String(hex)) ? hex : fb;
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const toward = (h, t, amt) => { const d = ((t - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), amt); };
// Rampa de 4 tonos (luz, base, sombra, sombra profunda) + contorno; las sombras se van hacia el violeta
// y las luces hacia el amarillo, para que no se vean "grises".
function ramp(rgb, kind = 'cloth') {
  // Sombras por "multiplicar" con un tinte frío (piel: cálido) y luces por "pantalla" con luz cálida:
  // así el color base queda idéntico y las sombras no se ven grises.
  const skin = kind === 'skin';
  const tint = skin ? [0.89, 0.77, 0.76] : [0.81, 0.79, 0.9];
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const mulT = (c, k) => c.map((v, i) => Math.round(v * tint[i] ** k));
  const screen = (c, l, k) => c.map((v, i) => Math.round(v + (255 - v) * l[i] * k));
  const warm = [1, 0.95, 0.8];
  let t, line;
  if (lum < 0.26) {
    // Colores muy oscuros: se separan los tonos subiendo las luces
    const lift = (k) => rgb.map((v, i) => Math.min(255, Math.round(v + k * [0.92, 0.9, 1][i])));
    const base = lum < 0.09 ? lift(14 - lum * 100) : rgb;
    t = [lift(lum < 0.09 ? 52 : 46), base, mulT(base, 1.2).map((v, i) => Math.max(0, v - 4)), mulT(base, 2.2).map((v) => Math.max(0, v - 8))];
    line = mulT(base, 3).map((v) => Math.round(v * 0.45));
  } else {
    t = [screen(rgb, warm, lum > 0.85 ? 0.35 : 0.24), rgb, mulT(rgb, 1), mulT(rgb, 2)];
    line = mulT(rgb, 3.6).map((v) => Math.round(v * (skin ? 0.68 : 0.72)));
  }
  return { t, line };
}
const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];

// ---------------- vectores ----------------
const norm = ([x, y, z]) => { const m = Math.hypot(x, y, z) || 1; return [x / m, y / m, z / m]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const D = Math.PI / 180;
// Dirección de una extremidad: parte hacia abajo, se abre hacia afuera (roll, side = ±1) y luego va al frente (pitch)
function limbDir(pitch, roll, side) {
  const vx = side * Math.sin(roll), vy = -Math.cos(roll);
  return [vx, vy * Math.cos(pitch), -vy * Math.sin(pitch)];
}
// Giro alrededor del eje vertical (local → mundo)
const rotY = ([x, y, z], c, s) => [x * c + z * s, y, -x * s + z * c];
const unrotY = ([x, y, z], c, s) => [x * c - z * s, y, x * s + z * c];

// Luz: arriba a la izquierda y un poco al frente
const LIGHT = norm([-0.55, 0.62, 0.56]);
const SHEAR = 0.45; // lo que está más cerca de la cámara se ve un poco más abajo (cámara desde arriba)

// ---------------- lienzo de un cuadro ----------------
const W = V2_W, H = V2_H, N = W * H;
class Raster {
  constructor() {
    this.depth = new Float32Array(N).fill(-1e9);
    this.prim = new Int16Array(N).fill(-1);
    this.u = new Float32Array(N);
    this.nx = new Float32Array(N); this.ny = new Float32Array(N); this.nz = new Float32Array(N);
    this.wx = new Float32Array(N); this.wy = new Float32Array(N); this.wz = new Float32Array(N);
    this.inner = new Uint8Array(N);
    this.prims = [];
  }
  put(i, z, pi, u, n, X, Y, inner) {
    if (z <= this.depth[i]) return;
    this.depth[i] = z; this.prim[i] = pi; this.u[i] = u;
    this.nx[i] = n[0]; this.ny[i] = n[1]; this.nz[i] = n[2];
    this.wx[i] = X; this.wy[i] = Y; this.wz[i] = z; this.inner[i] = inner ? 1 : 0;
  }
  add(p) { this.prims.push(p); return this.prims.length - 1; }
}
const colOf = (X) => X + 20 - 0.5; // x del mundo → columna (centro del píxel)
const rowOf = (Y) => V2_FOOT - Y - 0.5;

// Esfera (o casco con máscara: si el frente no pasa la máscara se ve el interior)
function rasterSphere(R, pi, c, r, u = 0) {
  const p = R.prims[pi];
  const c0 = Math.max(0, Math.floor(colOf(c[0] - r))), c1 = Math.min(W - 1, Math.ceil(colOf(c[0] + r)));
  const r0 = Math.max(0, Math.floor(rowOf(c[1] + r))), r1 = Math.min(H - 1, Math.ceil(rowOf(c[1] - r)));
  const rr = r * r;
  for (let row = r0; row <= r1; row++) {
    const Y = V2_FOOT - row - 0.5, dy = Y - c[1];
    for (let col = c0; col <= c1; col++) {
      const X = col + 0.5 - 20, dx = X - c[0];
      const h = rr - dx * dx - dy * dy;
      if (h < 0) continue;
      const q = Math.sqrt(h);
      const i = row * W + col;
      let z = c[2] + q;
      if (p.mask) {
        if (!p.mask(p.local([X, Y, z]))) {
          if (!p.shell) continue;
          z = c[2] - q;
          if (z <= R.depth[i] || !p.mask(p.local([X, Y, z]))) continue;
          R.put(i, z, pi, u, [-dx / r, -dy / r, q / r], X, Y, true);
          continue;
        }
      }
      R.put(i, z, pi, u, [dx / r, dy / r, q / r], X, Y, false);
    }
  }
}
// Elipsoide girado (M: matriz mundo → local por filas, rad: radios)
function rasterEllipsoid(R, pi, c, M, rad) {
  const p = R.prims[pi];
  const ext = Math.max(...rad);
  const c0 = Math.max(0, Math.floor(colOf(c[0] - ext))), c1 = Math.min(W - 1, Math.ceil(colOf(c[0] + ext)));
  const r0 = Math.max(0, Math.floor(rowOf(c[1] + ext))), r1 = Math.min(H - 1, Math.ceil(rowOf(c[1] - ext)));
  const B = [M[0][2] / rad[0], M[1][2] / rad[1], M[2][2] / rad[2]];
  const BB = B[0] * B[0] + B[1] * B[1] + B[2] * B[2];
  for (let row = r0; row <= r1; row++) {
    const Y = V2_FOOT - row - 0.5;
    for (let col = c0; col <= c1; col++) {
      const X = col + 0.5 - 20;
      const dx = X - c[0], dy = Y - c[1];
      const A = [(M[0][0] * dx + M[0][1] * dy) / rad[0], (M[1][0] * dx + M[1][1] * dy) / rad[1], (M[2][0] * dx + M[2][1] * dy) / rad[2]];
      const AB = A[0] * B[0] + A[1] * B[1] + A[2] * B[2], AA = A[0] * A[0] + A[1] * A[1] + A[2] * A[2];
      const disc = AB * AB - BB * (AA - 1);
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      const i = row * W + col;
      for (const sgn of [1, -1]) {
        const t = (-AB + sgn * sq) / BB;
        const z = c[2] + t;
        if (z <= R.depth[i]) break;
        const q = [A[0] + t * B[0], A[1] + t * B[1], A[2] + t * B[2]];
        if (p.mask && !p.mask(p.local([X, Y, z]))) { if (p.shell) continue; break; }
        // normal: Mᵀ (q / rad)
        const g = [q[0] / rad[0], q[1] / rad[1], q[2] / rad[2]];
        let n = norm([M[0][0] * g[0] + M[1][0] * g[1] + M[2][0] * g[2], M[0][1] * g[0] + M[1][1] * g[1] + M[2][1] * g[2], M[0][2] * g[0] + M[1][2] * g[1] + M[2][2] * g[2]]);
        if (sgn < 0) n = mul(n, -1);
        R.put(i, z, pi, 0, n, X, Y, sgn < 0);
        break;
      }
    }
  }
}
// Tronco: pila de elipses horizontales (torso, cadera, falda, copas de sombrero…)
//   sec: [[y, a, b, cz?]] en coordenadas locales (y relativa a o), giro yaw
function rasterLoft(R, pi, o, cs, sn, sec) {
  const p = R.prims[pi];
  const y0 = sec[0][0], y1 = sec[sec.length - 1][0];
  const ext = Math.max(...sec.map((s) => Math.max(s[1], s[2]) + Math.abs(s[3] || 0)));
  const c0 = Math.max(0, Math.floor(colOf(o[0] - ext))), c1 = Math.min(W - 1, Math.ceil(colOf(o[0] + ext)));
  const r0 = Math.max(0, Math.floor(rowOf(o[1] + y1))), r1 = Math.min(H - 1, Math.ceil(rowOf(o[1] + y0)));
  for (let row = r0; row <= r1; row++) {
    const Y = V2_FOOT - row - 0.5, ly = Y - o[1];
    if (ly < y0 || ly > y1) continue;
    let k = 1;
    while (k < sec.length - 1 && sec[k][0] < ly) k++;
    const s0 = sec[k - 1], s1 = sec[k];
    const f = (ly - s0[0]) / (s1[0] - s0[0] || 1), fs = f * f * (3 - 2 * f);
    const a = s0[1] + (s1[1] - s0[1]) * fs, b = s0[2] + (s1[2] - s0[2]) * fs, cz = (s0[3] || 0) + ((s1[3] || 0) - (s0[3] || 0)) * fs;
    const slope = ((s1[1] + s1[2]) - (s0[1] + s0[2])) / 2 / (s1[0] - s0[0] || 1);
    for (let col = c0; col <= c1; col++) {
      const X = col + 0.5 - 20, wx = X - o[0];
      // local: lx = wx·c − u·s ; lz = wx·s + u·c − cz  (u = z del mundo − o.z)
      const A2 = (sn * sn) / (a * a) + (cs * cs) / (b * b);
      const B2 = 2 * (((wx * cs) * -sn) / (a * a) + ((wx * sn - cz) * cs) / (b * b));
      const C2 = (wx * cs) ** 2 / (a * a) + (wx * sn - cz) ** 2 / (b * b) - 1;
      const disc = B2 * B2 - 4 * A2 * C2;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      const i = row * W + col;
      for (const sgn of [1, -1]) {
        const u = (-B2 + sgn * sq) / (2 * A2);
        const z = o[2] + u;
        if (z <= R.depth[i]) break;
        const lx = wx * cs - u * sn, lz = wx * sn + u * cs - cz;
        if (p.mask && !p.mask([lx, ly, lz + cz])) { if (p.shell) continue; break; }
        const gx = lx / (a * a), gz = lz / (b * b), gm = Math.hypot(gx, gz) || 1;
        let n = rotY([gx / gm, 0, gz / gm], cs, sn);
        n = norm([n[0], -slope * 0.9, n[2]]);
        if (sgn < 0) n = mul(n, -1);
        R.put(i, z, pi, ly, n, X, Y, sgn < 0);
        break;
      }
    }
  }
}
// Cadena de esferas (extremidades, coletas…): pts = [[p, r, u]]; se muestrea cada ~0.35 px
function rasterChain(R, pi, pts, shearPer = true) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [a, ra, ua] = pts[k], [b, rb, ub] = pts[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(len / 0.35));
    for (let j = k ? 1 : 0; j <= n; j++) {
      const f = j / n;
      let c = lerp3(a, b, f);
      if (shearPer) c = [c[0], c[1] - c[2] * SHEAR * (shearPer === true ? 1 : shearPer), c[2]];
      rasterSphere(R, pi, c, ra + (rb - ra) * f, ua + (ub - ua) * f);
    }
  }
}

// ---------------- el personaje ----------------
// Posturas de los brazos: p = hacia el frente, r = hacia afuera (grados) del brazo; fp/fr = del antebrazo
const ARM = {
  idle: { p: 4, r: 7, fp: 12, fr: 5 },
  fwd: { p: 26, r: 6, fp: 46, fr: 2 },
  bwd: { p: -24, r: 6, fp: -12, fr: 4 },
  up: { p: 4, r: 168, fp: 2, fr: 174 },
  wave1: { p: 10, r: 118, fp: 8, fr: 150 },
  wave2: { p: 10, r: 118, fp: 8, fr: 192 },
  hi: { p: 35, r: 128, fp: 40, fr: 158 },
  point: { p: 6, r: 138, fp: 6, fr: 142, finger: true },
  out: { p: 2, r: 86, fp: 2, fr: 90 },
  hip: { p: -14, r: 44, fp: -10, fr: -46 },
  flex: { p: 4, r: 90, fp: 4, fr: 178 },
  robotUp: { p: 8, r: 84, fp: 8, fr: 176 },
  robotDown: { p: 8, r: 84, fp: 8, fr: 4 },
  low: { p: 14, r: 24, fp: 20, fr: 18 },
  clapOpen: { p: 52, r: 16, fp: 88, fr: -22 },
  clapShut: { p: 52, r: 16, fp: 86, fr: -44 },
  chest: { p: 24, r: 18, fp: 112, fr: -62 },
  belly: { p: 18, r: 22, fp: 76, fr: -58 },
  cross: { p: 40, r: 6, fp: 92, fr: -78 },
  across: { p: 22, r: -26, fp: 26, fr: -40 },
  head: { p: -22, r: 128, fp: -30, fr: 222 },
  lap: { p: 44, r: 10, fp: 76, fr: -8 },
  hold: { p: 16, r: 8, fp: 78, fr: -4 },
  drink: { p: 30, r: 12, fp: 152, fr: -26 },
  sign: { p: 8, r: 160, fp: 6, fr: 168 },
  side: { p: 2, r: 4, fp: 4, fr: 2 },
};
// Piernas: hp = cadera al frente, hr = abrir, k = doblar rodilla (grados)
const LEG = {
  stand: [{ hp: 0, hr: 1, k: 2 }, { hp: 0, hr: 1, k: 2 }],
  kickA: [{ hp: 42, hr: 6, k: 14 }, { hp: -4, hr: 2, k: 6 }],
  kickB: [{ hp: -4, hr: 2, k: 6 }, { hp: 42, hr: 6, k: 14 }],
  wide: [{ hp: 0, hr: 12, k: 4 }, { hp: 0, hr: 12, k: 4 }],
  squat: [{ hp: 62, hr: 12, k: 112 }, { hp: 62, hr: 12, k: 112 }],
  sit: [{ hp: 88, hr: 9, k: 90 }, { hp: 88, hr: 9, k: 90 }],
  sitHalf: [{ hp: 46, hr: 6, k: 58 }, { hp: 46, hr: 6, k: 58 }],
  lay: [{ hp: 0, hr: 2, k: 0 }, { hp: 0, hr: 2, k: 0 }],
};
// Posturas con nombre: las mismas del clásico (POSE_DEFS) + las nuevas
const POSES_V2 = {
  ...Object.fromEntries(Object.entries({ ...POSE_DEFS, ...HOTEL_POSE_DEFS }).map(([k, d]) => [k, { a: d.a, b: d.b, legs: d.legs || 'stand' }])),
  sitHalf: { a: 'low', b: 'low', legs: 'sitHalf' },
  lay: { a: 'side', b: 'side', legs: 'lay' },
};
export const V2_POSES = Object.keys(POSES_V2);

// Medidas del maniquí (px del dibujo, y = altura sobre el piso)
const BODY = {
  hipY: 21.2, hipX: 2.85, thigh: 9.2, shin: 8.3, ankleH: 1.5,
  shoulderY: 35.6, shoulderX: 6.3, upper: 7.0, fore: 6.0,
  neckY: 37.6, headY: 46.4,
};

function walkPose(f) {
  // f = 0…1 a lo largo del ciclo (0 = pie A al frente tocando el piso)
  const T = 2 * Math.PI;
  const leg = (ph) => {
    const hp = 27 * Math.cos(T * ph);
    const swing = Math.sin(T * (ph - 0.5)); // >0 mientras la pierna va al frente por el aire
    const k = 8 + (swing > 0 ? 50 * swing : 6 * Math.max(0, Math.sin(T * ph)));
    return { hp, hr: 1, k };
  };
  const arm = (ph) => {
    const p = -24 * Math.cos(T * ph);
    return { p, r: 7, fp: p + 10 + Math.max(0, p) * 0.9, fr: 5 };
  };
  return { legs: [leg(f), leg(f + 0.5)], arms: [arm(f), arm(f + 0.5)] };
}

// Arma el maniquí: posiciones de las articulaciones en coordenadas locales del cuerpo
function skeleton(o) {
  let arms, legs;
  const P = o.pose && POSES_V2[o.pose];
  if (P) {
    arms = [ARM[P.a] || ARM.idle, ARM[P.b] || ARM.idle];
    legs = LEG[P.legs] || LEG.stand;
  } else if (o.walk) {
    const w = walkPose((o.walk - 1) / V2_WALK);
    arms = w.arms; legs = w.legs;
  } else { arms = [ARM.idle, ARM.idle]; legs = LEG.stand; }
  if (o.armOverride) for (const k of [0, 1]) if (o.armOverride[k]) arms = k ? [arms[0], ARM[o.armOverride[k]]] : [ARM[o.armOverride[k]], arms[1]];
  const sk = { legs: [], arms: [], pose: P ? o.pose : null };
  // Piernas (a = lado −x, b = lado +x)
  let minY = Infinity;
  for (const k of [0, 1]) {
    const side = k ? 1 : -1, L = legs[k];
    const hip = [side * BODY.hipX, BODY.hipY, 0];
    const td = limbDir(L.hp * D, L.hr * D, side);
    const knee = add(hip, mul(td, BODY.thigh));
    const sp = (L.hp - L.k) * D;
    const sd = limbDir(sp, L.hr * D * 0.6, side);
    const ankle = add(knee, mul(sd, BODY.shin));
    // Pie: plano en el piso; de puntitas cuando la espinilla va muy atrás
    const fpitch = Math.min(0, Math.max(-0.7, sp + 0.25)) * 0.8;
    const fwd = [0, Math.sin(fpitch), Math.cos(fpitch)];
    const foot = add(add(ankle, [side * 0.15, -0.7, 0]), mul(fwd, 1.35));
    sk.legs.push({ hip, knee, ankle, foot, fwd, fpitch });
    // (la cámara ve desde arriba: lo que va más al frente se ve más abajo; el pie más bajo en pantalla pisa)
    const yw = (YAW[o.dir] ?? 0) * D;
    const zw = -foot[0] * Math.sin(yw) + foot[2] * Math.cos(yw);
    const legK = o.pose === 'sit' || o.pose === 'sitHalf' ? 1 + 0.9 * Math.abs(Math.cos(yw)) : 1;
    minY = Math.min(minY, foot[1] - 1.7 + Math.max(0, -fpitch) * 1.6 - zw * SHEAR * legK);
  }
  // Todo el cuerpo baja o sube para que el pie más bajo pise el piso (rebote natural al caminar)
  let lift = o.pose === 'lay' ? 0 : Math.round(-minY);
  sk.lift = lift;
  sk.breathe = o.breathe ? 1 : 0;
  for (const k of [0, 1]) {
    const side = k ? 1 : -1, A = arms[k];
    const sh = [side * BODY.shoulderX, BODY.shoulderY - sk.breathe, 0.15];
    const ud = limbDir(A.p * D, A.r * D, side);
    const elbow = add(sh, mul(ud, BODY.upper));
    const fd = limbDir(A.fp * D, A.fr * D, side);
    const wrist = add(elbow, mul(fd, BODY.fore));
    const hand = add(wrist, mul(fd, 1.2));
    sk.arms.push({ sh, elbow, wrist, hand, fd, finger: !!A.finger, name: A });
  }
  return sk;
}

// ---------- materiales de la ficha ----------
function palette(s) {
  const skin = hexRgb(s.skin, '#f6c9a0'), hair = hexRgb(s.hair, '#1b1720');
  const P = {
    skin: ramp(skin, 'skin'),
    hair: ramp(hair, 'hair'),
    top: ramp(hexRgb(s.shirt, '#3d7be0')),
    accent: ramp(hexRgb(s.accent, '#f4f4f6')),
    pants: ramp(hexRgb(s.pants, '#2b2d42')),
    shoes: ramp(hexRgb(s.shoes, '#1d1d22')),
    hat: ramp(hexRgb(s.hatColor || s.accent, '#101010')),
    eye: ramp(hexRgb(s.eyeColor, '#261e30')),
    white: ramp([246, 245, 250]),
    gold: ramp([255, 200, 40]),
    gray: ramp([62, 62, 74]),
    red: ramp([232, 64, 80]),
    stub: ramp(mix(skin, hair, 0.5), 'skin'),
    buzz: ramp(mix(skin, hair, 0.78)),
  };
  const sh = hexRgb(s.shoes, '#1d1d22');
  const [, , sl] = toHsl(sh);
  P.sole = ramp(sl < 0.35 ? mix(sh, [240, 240, 244], 0.85) : mix(sh, [30, 28, 36], 0.7));
  return P;
}

// ---------- piezas ----------
// Cada pieza: { kind, mat | matAt(px), grp, mask?, shell?, local(p) }
//   grp: grupo para las líneas internas (piezas del mismo grupo no se separan con línea)
function buildFigure(s, o) {
  const R = new Raster();
  const sk = skeleton(o);
  const bodyYaw = (YAW[o.dir] ?? 0) * D;
  const headYaw = (YAW[o.head || o.dir] ?? 0) * D;
  const bc = Math.cos(bodyYaw), bs = Math.sin(bodyYaw), hc = Math.cos(headYaw), hs = Math.sin(headYaw);
  const lift = sk.lift, br = sk.breathe;
  const W3 = (p) => { const q = rotY(p, bc, bs); return [q[0], q[1] + lift, q[2]]; }; // local del cuerpo → mundo
  const top = s.top || 'tee', bottom = s.bottom || 'pants', hs0 = s.hairStyle || 'short', hat = s.hat || 'none';
  const dress = top === 'dress';
  const shortSleeve = top === 'tee' || top === 'uniform' || top === 'overalls' || top === 'polo' || top === 'dress';
  const noSleeve = top === 'tank';
  const sleeveMat = top === 'varsity' ? 'accent' : 'top';
  const sitting = sk.pose === 'sit' || sk.pose === 'sitHalf';
  const lay = sk.pose === 'lay';
  // Sentado: las piernas se ven con más inclinación de cámara, para que de frente se noten las rodillas al frente
  const legK = sitting ? 1 + 0.9 * Math.abs(bc) : 1;

  // espacio local de una pieza del cuerpo (para máscaras y calcomanías)
  const bodyLocal = (oW, dy) => (p) => unrotY(sub([p[0], p[1] + dy, p[2]], oW), bc, bs);
  const prim = (q) => R.add(q);

  // ===== Piernas =====
  const legMat = (u) => {
    if (dress || bottom === 'skirt') return u < 0.62 && sitting ? (dress ? 'top' : 'pants') : 'skin';
    if (bottom === 'shorts') return u < 0.42 ? 'pants' : 'skin';
    return 'pants';
  };
  sk.legs.forEach((L, k) => {
    const hip = W3(L.hip), knee = W3(L.knee), ankle = W3(L.ankle);
    const pi = prim({ grp: 'leg' + k, matAt: (px) => {
      const m = legMat(px.u);
      // Sentado de frente: el muslo (arriba, le da la luz) más claro y la espinilla (bajo el muslo) más oscura
      if (sitting && Math.abs(bc) > 0.6) return [m, px.u < 0.5 ? -1 : 1];
      // dobladillo del pantalón
      if (m === 'pants' && bottom === 'pants' && px.u > 0.94) return ['pants', 1];
      return m;
    } });
    rasterChain(R, pi, [[add(hip, [0, 0.6, 0]), 2.75, 0], [knee, 2.25, 0.5], [ankle, 1.75, 1]], legK);
    // Zapato
    const f = W3(L.foot);
    const fw = rotY(L.fwd, bc, bs);
    const side = [fw[2], 0, -fw[0]]; // perpendicular horizontal
    const up = norm([fw[1] * -fw[0], 1, fw[1] * -fw[2]]);
    const M = [norm(side), up, fw];
    const shift = f[2] * SHEAR * legK;
    const fp = prim({ grp: 'shoe' + k, matAt: (px) => {
      const lp = [px.wx - f[0], px.wy + shift - f[1], px.wz - f[2]];
      const ly = lp[0] * M[1][0] + lp[1] * M[1][1] + lp[2] * M[1][2];
      return ly < -0.55 ? 'sole' : 'shoes';
    } });
    rasterEllipsoid(R, fp, [f[0], f[1] - shift, f[2]], M, [2.1, 1.75, 3.2]);
  });

  // ===== Cadera y falda =====
  const pelvisO = W3([0, 0, 0]);
  const pelvisMat = dress ? 'top' : bottom === 'skirt' ? 'pants' : 'pants';
  const pv = prim({ grp: 'torso', mat: pelvisMat, local: bodyLocal(pelvisO, 0) });
  rasterLoft(R, pv, [pelvisO[0], pelvisO[1], pelvisO[2]], bc, bs, [[17.4, 4.6, 3.0], [19.2, 5.6, 3.35], [22.5, 5.7, 3.4]]);
  if ((bottom === 'skirt' || dress) && !sitting && !lay) {
    const len = dress ? 10.6 : 8.2;
    const sp = prim({ grp: 'skirt', matAt: (px) => {
      if (px.u < 21.6 - len + 1.2) return [dress ? 'top' : 'pants', 1];
      return dress ? 'top' : 'pants';
    } });
    const y0 = 22.6 - len;
    rasterLoft(R, sp, pelvisO, bc, bs, [[y0, dress ? 8.2 : 7.1, dress ? 5.6 : 4.8], [y0 + len * 0.5, dress ? 7.0 : 6.4, dress ? 4.7 : 4.3], [22.8, 5.9, 3.6]]);
  }
  if ((bottom === 'skirt' || dress) && sitting) {
    // Sentado: la falda cubre los muslos
    sk.legs.forEach((L, k) => {
      const pi = prim({ grp: 'skirt', mat: dress ? 'top' : 'pants' });
      rasterChain(R, pi, [[W3(add(L.hip, [0, 0.8, 0])), 3.3, 0], [W3(lerp3(L.hip, L.knee, 0.72)), 2.8, 1]], legK);
    });
  }

  // ===== Torso =====
  const tO = W3([0, -br, 0]);
  const torsoDecal = torsoDetails(s, top);
  const tp = prim({ grp: 'torso', matAt: (px) => torsoDecal(px.local, px), local: bodyLocal(tO, 0) });
  const longJacket = top === 'suit' || top === 'blazer';
  const T0 = longJacket ? 18.6 : 20.6;
  rasterLoft(R, tp, tO, bc, bs, [
    [T0, 5.75, 3.45], [23.5, 5.55, 3.3], [27.5, 5.95, 3.55], [31.5, 6.35, 3.75], [34.6, 6.55, 3.6], [36.3, 5.8, 3.2], [37.4, 4.2, 2.8], [38.0, 2.6, 2.3],
  ]);
  // Capucha / cuello del suéter / bufanda
  if (top === 'hoodie') {
    const c = W3([0, 37.6 - br, -3.3]);
    const M = [[bc, 0, -bs], [0, 1, 0], [bs, 0, bc]];
    const hp = prim({ grp: 'hood', mat: 'top' });
    rasterEllipsoid(R, hp, [c[0], c[1] - c[2] * SHEAR, c[2]], M, [4.4, 2.4, 2.4]);
  }
  if (s.extra === 'backpack') {
    const c = W3([0, 29.5 - br, -5.0]);
    const M = [[bc, 0, -bs], [0, 1, 0], [bs, 0, bc]];
    const bp = prim({ grp: 'pack', matAt: (px) => (px.wy + c[2] * SHEAR < c[1] - 2.2 ? ['accent', 1] : 'accent') });
    rasterEllipsoid(R, bp, [c[0], c[1] - c[2] * SHEAR, c[2]], M, [4.9, 6.0, 2.3]);
  }
  if (s.extra === 'scarf') {
    const so = W3([0, -br, 0.2]);
    const sp = prim({ grp: 'scarf', matAt: (px) => (Math.abs(px.u - 36.9) < 0.45 ? ['accent', 1] : 'accent') });
    rasterLoft(R, sp, so, bc, bs, [[35.4, 4.9, 3.9, 0.3], [36.9, 5.0, 4.1, 0.4], [38.6, 3.9, 3.5, 0.3]]);
    const tail = prim({ grp: 'scarf', mat: 'accent' });
    rasterChain(R, tail, [[W3([2.2, 36.2 - br, 3.6]), 1.55, 0], [W3([2.8, 31.5 - br, 4.2]), 1.35, 1]]);
  }
  if (s.extra === 'lanyard') {
    const lp = prim({ grp: 'badge', matAt: (px) => (px.wy < tO[1] + 27.8 - 0.4 * 0 ? 'white' : 'accent') });
    const c = W3([0, 28.6 - br, 3.95]);
    const M = [[bc, 0, -bs], [0, 1, 0], [bs, 0, bc]];
    rasterEllipsoid(R, lp, [c[0], c[1] - c[2] * SHEAR, c[2]], M, [1.55, 2.1, 0.6]);
  }

  // ===== Brazos =====
  const armMat = (u) => {
    if (u > 0.985) return 'skin';
    if (noSleeve) return 'skin';
    if (shortSleeve) return u < 0.3 ? (top === 'overalls' || top === 'dress' ? 'top' : sleeveMat) : u < 0.34 ? [sleeveMat, 1] : 'skin';
    if (u > 0.9) return 'skin';
    if (u > 0.82 && (top === 'sweater' || top === 'hoodie' || top === 'varsity')) return [top === 'varsity' ? 'top' : sleeveMat, 1];
    return sleeveMat;
  };
  const hold = o.hold && HAND_ITEMS.includes(o.hold) ? o.hold : null;
  sk.arms.forEach((A, k) => {
    const sh = W3(A.sh), el = W3(A.elbow), wr = W3(A.wrist), hd = W3(A.hand);
    const pi = prim({ grp: 'arm' + k, matAt: (px) => armMat(px.u) });
    // hombro redondo (de la manga)
    rasterChain(R, pi, [[sh, 2.15, 0], [el, 1.65, 0.48], [wr, 1.42, 0.96]]);
    const hp = prim({ grp: 'arm' + k, mat: 'skin', hand: true });
    rasterChain(R, hp, [[wr, 1.45, 1], [hd, 1.7, 1]]);
    A.hW = [hd[0], hd[1] - hd[2] * SHEAR, hd[2]];
  });

  // ===== Cuello y cabeza =====
  const nk = prim({ grp: 'neck', mat: 'skin' });
  rasterChain(R, nk, [[W3([0, 36.6 - br, 0.1]), 1.95, 0], [W3([0, 40.6 - br, 0.3]), 1.95, 1]]);
  const head = buildHead(R, s, o, W3([0, BODY.headY - br, 0.35]), hc, hs, headYaw);

  return { R, sk, head, bodyYaw, headYaw };
}

// Calcomanías del torso según la prenda. lp = punto local (x, y, z) del torso (z al frente)
function torsoDetails(s, top) {
  const extra = s.extra;
  return (lp) => {
    const [x, y, z] = lp;
    const ax = Math.abs(x);
    const front = z > 0.6;
    // Gafete
    if (extra === 'lanyard' && front && y > 29.4 && y < 37.4) {
      const t = (37.4 - y) / 8;
      if (Math.abs(ax - (2.5 - 2.3 * t)) < 0.42) return 'accent';
    }
    if (extra === 'backpack' && front && Math.abs(ax - 4.0) < 0.62 && y > 26) return ['accent', 2];
    if (extra === 'necklace' && front && y > 34.2 && y < 37.4) {
      const t = (37.4 - y) / 3.2;
      if (Math.abs(ax - (2.6 - 2.1 * t)) < 0.42) return 'gold';
    }
    // Cuello de la prenda (escote)
    const neckOpen = top === 'tank' ? (y > 33.6 && ax < 3.4 - (37.6 - y) * 0.45 && z > 0) : (y > 36.6 && ax < 2.4 && z > 0);
    switch (top) {
      case 'tee':
        if (neckOpen) return 'skin';
        if (y > 36 && ax < 3.1 && z > 0) return ['top', 1];
        if (front && ax < 2.4 && y > 27.4 && y < 32.4) return ax < 1.6 && y > 28.2 && y < 31.6 ? ['accent', -1] : ['accent', 1];
        return y < 21.6 ? ['top', 1] : 'top';
      case 'hoodie':
        if (y > 36.8 && ax < 2.2 && z > 0) return 'skin';
        if (front && y > 31.6 && y < 36.6 && Math.abs(ax - 1.25) < 0.42) return y < 32.4 ? ['white', 1] : 'accent';
        if (front && y > 22.8 && y < 27.6 && ax < 3.6) return Math.abs(ax - 3.4) < 0.45 || Math.abs(y - 27.4) < 0.45 ? ['top', 2] : ['top', 1];
        return y < 22.4 ? ['top', 1] : 'top';
      case 'sweater':
        if (y > 36.4 && ax < 2.6 && z > 0) return y > 37.1 ? 'skin' : 'accent';
        if (y < 22.6) return (Math.floor((x + 10) * 1.4) % 2) ? ['top', 1] : ['top', 2];
        return 'top';
      case 'shirt':
      case 'polo': {
        if (y > 37.0 && ax < 1.6 && z > 0) return 'skin';
        const collar = y > 35.2 && ax < 3.6 - (37.8 - y) * 0.4 && z > 0;
        if (collar && ax > 0.9) return top === 'polo' ? ['accent', -1] : ['top', -1];
        if (top === 'shirt' && front && ax < 0.95 + (35.6 - y) * 0.035 && y > 25.6 && y < 36.4) return y > 35.4 ? ['accent', 1] : 'accent';
        if (top === 'polo' && front && ax < 0.45 && y > 31.6 && y < 36) return ['top', 2];
        if (top === 'shirt' && front && ax < 0.4 && y < 25.6) return ['top', 2];
        return y < 21.4 ? ['top', 1] : 'top';
      }
      case 'suit':
      case 'blazer': {
        const vw = y > 29.4 ? 0.6 + (y - 29.4) * 0.42 : 0;
        if (front && ax < vw && y < 37.2) {
          if (top === 'suit' && ax < 0.9 + (31 - Math.min(31, y)) * 0 && y > 29.4) return y > 36.2 ? ['accent', 1] : 'accent';
          return y > 36.8 && ax < 1.4 ? 'skin' : 'white';
        }
        if (front && ax < vw + 0.9 && y > 29.4) return ['top', -1]; // solapa
        if (front && ax < 0.45 && y < 29.4) return ['top', 2];
        if (front && ax < 1.1 && (Math.abs(y - 27.6) < 0.5 || (top === 'suit' && Math.abs(y - 24.6) < 0.5)) && ax > 0.45) return ['top', 2];
        if (front && Math.abs(ax - 3.6) < 1.2 && Math.abs(y - 23.4) < 0.45) return ['top', 2]; // bolsillos
        return 'top';
      }
      case 'varsity':
        if (y > 36.6 && ax < 2.2 && z > 0) return 'skin';
        if (y > 35.6 && ax < 3.4 && z > 0) return Math.abs(y - 36.4) < 0.4 ? 'top' : 'accent';
        if (y < 22.8) return Math.abs(y - 21.8) < 0.45 ? 'top' : 'accent';
        if (front && ax < 0.42) return ['top', 2];
        if (front && x < -1.6 && x > -4.4 && y > 30 && y < 33.6) return 'accent'; // parche liso
        if (front && Math.abs(ax - 0.9) < 0.3 && Math.abs(((y * 0.5) % 1) - 0.5) < 0.18 && y < 35) return ['accent', -1];
        return 'top';
      case 'jacket':
        if (y > 36.6 && ax < 2.0 && z > 0) return 'skin';
        if (front && ax < 1.25 && y < 36.6) return ax > 0.85 ? ['top', 2] : 'accent';
        if (y > 34.8 && ax < 3.9 && z > 0) return ['top', -1]; // cuello
        if (front && Math.abs(ax - 3.7) < 1.0 && Math.abs(y - 25.6) < 0.4) return ['top', 2];
        return y < 21.8 ? ['top', 1] : 'top';
      case 'uniform':
        if (y > 36.4 && ax < 2.0 && z > 0) return 'skin';
        if (y > 34.9 && ax < 3.5 && z > 0) return ['top', -1];
        if (y > 20.6 && y < 22.4) return front && ax < 0.9 ? 'gold' : ['pants', 2];
        if (front && ax > 1.5 && ax < 4.2 && y > 29.4 && y < 32.6) return Math.abs(y - 32.2) < 0.42 || Math.abs(ax - 1.6) < 0.4 || Math.abs(ax - 4.1) < 0.4 ? ['top', 2] : ['top', 1];
        if (front && x > 1.6 && x < 3.8 && y > 32.9 && y < 34.4) return 'accent';
        if (front && ax < 0.36) return ['top', 2];
        if (!front && y > 34.6 && ax > 4.2) return 'accent';
        return 'top';
      case 'tank':
        if (neckOpen) return 'skin';
        if (y > 33.4 && ax > 3.6) return 'skin';
        return y < 21.6 ? ['top', 1] : 'top';
      case 'overalls': {
        if (y > 36.6 && ax < 2.3 && z > 0) return 'skin';
        const bib = front && ax < 3.5 && y < 31.6;
        if (bib) return Math.abs(y - 31.2) < 0.4 || (ax > 3.1) ? ['pants', 1] : ax < 2.2 && y > 26.4 && y < 29.6 && Math.abs(y - 29.2) < 0.45 ? ['pants', 2] : 'pants';
        if (y < 23.2) return 'pants';
        if (Math.abs(ax - 2.7) < 0.6 && y >= 31.6) return 'pants'; // tirantes
        if (front && Math.abs(ax - 2.8) < 0.55 && Math.abs(y - 30.9) < 0.6) return 'accent';
        return 'top';
      }
      case 'dress':
        if (y > 36.6 && ax < 2.6 && z > 0) return 'skin';
        if (Math.abs(y - 23.6) < 0.5) return 'accent';
        return 'top';
      default:
        return 'top';
    }
  };
}

// ---------- cabeza, cara y pelo ----------
function buildHead(R, s, o, c, hc, hs, yaw) {
  const hat = s.hat || 'none', st = s.hairStyle || 'short';
  const dz = c[2] * SHEAR;
  const C = [c[0], c[1] - dz, c[2]];
  const M = [[hc, 0, -hs], [0, 1, 0], [hs, 0, hc]];
  const W3 = (p) => { const q = rotY(p, hc, hs); return [C[0] + q[0], C[1] + q[1], C[2] + q[2]]; };
  const local = (p) => unrotY(sub(p, C), hc, hs);
  const prim = (q) => R.add({ local, ...q });
  const fh = s.facialHair || 'none';
  const faceMat = (lp) => {
    if (fh === 'none') return 'skin';
    const [x, y, z] = lp;
    if (z < 0.5) return 'skin';
    const ax = Math.abs(x);
    if (fh === 'stubble' && y < -2.4 && ax < 5.6) return 'stub';
    if (fh === 'beard' && (y < -2.7 || (y < -0.6 && ax > 3.6)) && ax < 6.4) return Math.abs(y + 4.6) < 0.5 && ax < 1.3 ? ['hair', 2] : 'hair';
    if (fh === 'goatee' && y < -5.4 && ax < 1.9) return 'hair';
    return 'skin';
  };
  // Cráneo y quijada
  const head = prim({ grp: 'head', matAt: (px) => faceMat(px.local), headSkin: true });
  rasterEllipsoid(R, head, W3([0, 0.6, 0]), M, [6.9, 7.2, 6.5]);
  const jaw = prim({ grp: 'head', matAt: (px) => faceMat(px.local), headSkin: true });
  rasterEllipsoid(R, jaw, W3([0, -3.0, 0.9]), M, [5.7, 4.3, 5.2]);
  // Nariz y orejas
  const nose = prim({ grp: 'head', mat: 'skin', headSkin: true });
  rasterSphere(R, nose, W3([0, -1.6, 6.15]), 0.95);
  for (const sd of [-1, 1]) {
    const ear = prim({ grp: 'head', mat: 'skin', headSkin: true, ear: sd });
    rasterEllipsoid(R, ear, W3([sd * 6.75, -0.6, -0.3]), M, [0.95, 1.85, 1.3]);
  }
  if (fh === 'mustache' || fh === 'goatee' || fh === 'beard') {
    const mu = prim({ grp: 'head', mat: 'hair' });
    rasterEllipsoid(R, mu, W3([0, -3.05, 5.75]), M, [fh === 'goatee' ? 1.9 : 2.7, 0.75, 0.7]);
  }
  buildHair(R, s, W3, local, M, prim);
  buildHat(R, s, W3, M, prim);
  buildAudio(R, s, W3, M, prim);
  return { C, W3, local, M, yaw, hc, hs };
}

// Línea del pelo: el pelo existe donde la elevación pasa la curva del peinado (según el ángulo)
const smooth = (t) => t * t * (3 - 2 * t);
function hairline(front, side, back) {
  return (az) => {
    const a = Math.abs(az) / Math.PI; // 0 frente … 1 atrás
    return a < 0.5 ? front + (side - front) * smooth(a / 0.5) : side + (back - side) * smooth((a - 0.5) / 0.5);
  };
}
function buildHair(R, s, W3, local, M, prim) {
  const st = s.hairStyle || 'short';
  const hat = s.hat || 'none';
  const covered = hat === 'beanie' || hat === 'bucket' || hat === 'cowboy' || hat === 'beret';
  const capped = covered || hat === 'cap';
  const O = [0, 0.9, -0.15]; // centro del casco de pelo (local)
  const azOf = (lp) => Math.atan2(lp[0], lp[2]);
  const elOf = (lp, r) => Math.asin(Math.max(-1, Math.min(1, lp[1] / r)));
  const earCut = (lp, az, el) => Math.abs(Math.abs(az) - Math.PI / 2) < 0.38 && el < 0.06 && el > -0.6;
  // Casco de pelo con máscara
  const shell = (rad, hl, opt = {}) => {
    const cW = W3(O);
    const mask = (p) => {
      const lp = sub(p, O);
      const az = azOf(lp), el = elOf(lp, rad[1]);
      if (!opt.noEar && earCut(lp, az, el)) return false;
      if (opt.extra && !opt.extra(lp, az, el)) return false;
      return el > hl(az, lp);
    };
    const pi = prim({ grp: 'hair', matAt: (px) => (opt.matAt ? opt.matAt(sub(px.local, O), px) : 'hair'), mask, shell: true, hairShade: true });
    rasterEllipsoid(R, pi, cW, M, rad);
  };
  const ball = (lp, r, mat = 'hair', grp = 'hair') => {
    const pi = prim({ grp, mat, hairShade: mat === 'hair' });
    rasterSphere(R, pi, W3(lp), r);
  };
  const chain = (pts, mat = 'hair', grp = 'hair') => {
    const pi = prim({ grp, mat, hairShade: mat === 'hair' });
    rasterChain(R, pi, pts.map(([p, r, u]) => [W3(p), r, u || 0]), false);
  };
  const fringe = (k, amp) => (az) => amp * Math.abs(Math.sin(az * k));
  const R0 = [7.75, 7.9, 7.35];
  switch (st) {
    case 'buzz':
      shell([7.3, 7.6, 7.0], hairline(0.5, 0.0, -0.5), { matAt: () => 'buzz' });
      break;
    case 'short': {
      const f = fringe(6, 0.07);
      shell(R0, (az) => hairline(0.42, -0.08, -0.55)(az) + (Math.abs(az) < 1.2 ? f(az) : 0));
      break;
    }
    case 'sidepart': {
      shell(R0, (az) => (Math.abs(az) < 1.4 ? (az < 0 ? 0.36 : 0.52) - (az < 0 ? 0.08 * Math.sin(-az * 2.2) : 0) : hairline(0.4, -0.1, -0.55)(az)) + 0 * az,
        { matAt: (lp) => (Math.abs(Math.atan2(lp[0], lp[2]) - 0.62) < 0.1 && lp[1] > 3.4 ? ['hair', 2] : 'hair') });
      ball([-3.4, 5.2, 4.6], 2.6);
      break;
    }
    case 'slick':
      shell([7.7, 8.2, 7.4], hairline(0.56, -0.05, -0.52), { matAt: (lp) => (Math.abs(((lp[0] + 20) * 0.9) % 2 - 1) < 0.22 && lp[1] > 2 ? ['hair', -1] : 'hair') });
      ball([0, 6.2, 3.4], 3.6);
      break;
    case 'spiky': {
      shell(R0, (az) => hairline(0.4, -0.08, -0.55)(az) + (Math.abs(az) < 1.1 ? 0.1 * Math.abs(Math.sin(az * 7)) : 0));
      if (!capped) {
        const spikes = [[-4.6, 7.0, 1.8, -0.55, 0.85], [-1.6, 8.6, 1.4, -0.2, 1], [1.8, 8.6, 0.9, 0.25, 1], [4.8, 6.8, 1.1, 0.6, 0.85], [0, 7.6, -3.2, 0, 0.9], [-3.6, 6.4, -2.8, -0.5, 0.7], [3.6, 6.4, -2.8, 0.5, 0.7]];
        for (const [x, y, z, lean, h] of spikes) chain([[[x, y, z], 2.2, 0], [[x + lean * 3.4, y + 3.6 * h, z - 0.6], 0.55, 1]]);
      }
      break;
    }
    case 'mohawk':
      shell([7.15, 7.4, 6.9], hairline(0.6, 0.15, -0.3), { matAt: () => 'stub' });
      if (!capped) {
        for (let i = 0; i < 9; i++) {
          const th = 0.95 + i * 0.3; // de la frente, por arriba, a la nuca
          const dv = [0, Math.sin(th), Math.cos(th)];
          const base = [0, 0.9 + dv[1] * 6.9, -0.15 + dv[2] * 6.6];
          const h = i < 1 ? 2.2 : i > 6 ? 1.6 : 3.3;
          chain([[base, 1.85, 0], [add(base, [0, dv[1] * h + 0.4, dv[2] * h - 0.6]), 0.65, 1]]);
        }
      } else shell(R0, hairline(0.45, 0.1, -0.4));
      break;
    case 'curly': {
      shell([7.9, 8.1, 7.5], hairline(0.38, -0.1, -0.5));
      if (!covered) {
        for (let i = 0; i < 26; i++) {
          const y = 1 - (i + 0.5) / 26 * 1.5, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963;
          const lp = [Math.cos(th) * rr, y, Math.sin(th) * rr];
          const el = Math.asin(lp[1]), az = Math.atan2(lp[0], lp[2]);
          if (el < hairline(0.66, -0.05, -0.4)(az) || (capped && el > 0.25)) continue;
          ball([lp[0] * 7.9, 0.9 + lp[1] * 8.1, -0.15 + lp[2] * 7.5], 2.25);
        }
      }
      break;
    }
    case 'afro': {
      const rad = covered ? [8.6, 8.8, 8.2] : [10.6, 10.2, 10.0];
      const oc = [0, covered ? 1.2 : 3.0, -1.0];
      const pi = prim({ grp: 'hair', mat: 'hair', hairShade: true, shell: true, mask: (p) => {
        const lp = sub(p, oc);
        const az = Math.atan2(lp[0], lp[2]), el = Math.asin(Math.max(-1, Math.min(1, lp[1] / rad[1])));
        if (Math.abs(az) < 0.85 && el < 0.12) return false;
        return el > -0.5 || Math.abs(az) > 1.4;
      } });
      rasterEllipsoid(R, pi, W3(oc), M, rad);
      if (!covered) for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const lp = [Math.cos(a) * 9.8, 3 + Math.sin(a) * 9.4, -1.6];
        if (lp[1] < -2) continue;
        ball(lp, 2.4);
      }
      break;
    }
    case 'bob':
      shell([8.35, 8.4, 7.85], (az, lp) => {
        if (Math.abs(az) < 0.95) return 0.3 + 0.04 * Math.abs(Math.sin(az * 9));
        return -0.85;
      }, { noEar: true, extra: (lp) => lp[1] > -6.8 && !(lp[2] > 3.2 && lp[1] < 2.6) });
      break;
    case 'long':
      shell([8.0, 8.1, 7.6], (az) => (Math.abs(az) < 0.95 ? 0.36 + (Math.abs(az) < 0.12 ? 0.08 : 0) : -0.8), { noEar: true, extra: (lp) => (lp[1] > -6.4 || lp[2] < 0) && !(lp[2] > 3.4 && lp[1] < 2.6) });
      // cortina de atrás y mechones al frente
      {
        const pi = prim({ grp: 'hairBack', mat: 'hair', hairShade: true });
        rasterEllipsoid(R, pi, W3([0, -5.2, -2.6]), M, [7.9, 10.6, 4.3]);
      }
      for (const sd of [-1, 1]) chain([[[sd * 6.5, -1.5, 1.6], 1.9, 0], [[sd * 6.9, -8.5, 1.8], 1.75, 0.6], [[sd * 6.4, -12.6, 2.2], 1.35, 1]]);
      break;
    case 'ponytail':
      shell(R0, hairline(0.42, -0.1, -0.35));
      ball([0, 0.2, -7.6], 1.25, 'accent', 'hair');
      chain([[[0, 0.2, -8.3], 2.3, 0], [[0, -4.0, -9.6], 2.0, 0.5], [[0, -9.4, -8.6], 1.35, 1]]);
      break;
    case 'pigtails':
      shell(R0, (az) => hairline(0.4, -0.15, -0.45)(az) + (Math.abs(az) < 0.1 ? 0.06 : 0), { matAt: (lp) => (Math.abs(lp[0]) < 0.42 && lp[1] > 2 && lp[2] > -2 ? ['hair', 2] : 'hair') });
      for (const sd of [-1, 1]) {
        ball([sd * 7.3, 0.4, -2.2], 1.2, 'accent', 'hair');
        chain([[[sd * 8.0, 0.0, -2.4], 2.4, 0], [[sd * 9.6, -5.0, -2.0], 2.1, 0.5], [[sd * 9.3, -10.2, -1.4], 1.5, 1]]);
      }
      break;
    case 'bun':
      shell(R0, hairline(0.42, -0.12, -0.3));
      if (!covered) { ball([0, 8.2, -3.6], 3.3); ball([0, 6.0, -2.8], 1.2, 'accent'); }
      break;
    default:
      shell(R0, hairline(0.42, -0.08, -0.55));
  }
}

function buildHat(R, s, W3, M, prim) {
  const hat = s.hat || 'none';
  if (hat === 'none') return;
  const afro = s.hairStyle === 'afro';
  const k = afro ? 1.12 : 1;
  const ball = (lp, r, mat, grp = 'hat') => rasterSphere(R, prim({ grp, mat }), W3(lp), r);
  const shell = (O, rad, minEl, opt = {}) => {
    const cW = W3(O);
    const pi = prim({ grp: 'hat', shell: true, mask: (p) => {
      const lp = sub(p, O);
      const az = Math.atan2(lp[0], lp[2]);
      const el = Math.asin(Math.max(-1, Math.min(1, lp[1] / rad[1])));
      return el > minEl(az) && (!opt.band || el < opt.band);
    }, matAt: (px) => (opt.matAt ? opt.matAt(sub(px.local, O)) : 'hat') });
    rasterEllipsoid(R, pi, cW, M, rad);
    return pi;
  };
  switch (hat) {
    case 'cap': {
      shell([0, 1.4 * k, -0.2], [8.2 * k, 8.0 * k, 7.8 * k], (az) => (Math.abs(az) < 1.6 ? 0.3 : 0.2), {
        matAt: (lp) => (Math.abs(lp[0]) < 0.4 && lp[2] > 0 && lp[1] > 3 ? ['hat', 2] : lp[1] < 3.3 ? ['hat', 1] : 'hat'),
      });
      const brim = prim({ grp: 'brim', mat: 'hat', brim: true });
      rasterEllipsoid(R, brim, W3([0, 3.4 * k, 7.2 * k]), M, [5.8, 0.85, 3.9]);
      ball([0, 9.3 * k, -0.2], 0.9, 'hat');
      break;
    }
    case 'beanie':
      shell([0, 1.0 * k, -0.15], [8.3 * k, 8.8 * k, 7.9 * k], () => 0.26, {
        matAt: (lp) => (lp[1] < 4.0 * k ? (Math.floor((Math.atan2(lp[0], lp[2]) + 4) * 9) % 2 ? ['hat', 1] : ['hat', 2]) : 'hat'),
      });
      ball([0, 10.4 * k, -0.4], 2.3, 'white', 'pom');
      break;
    case 'bucket': {
      shell([0, 1.6 * k, -0.15], [7.9 * k, 7.6 * k, 7.6 * k], () => 0.34, { matAt: (lp) => (lp[1] < 4.6 ? ['hat', 1] : 'hat') });
      const br = prim({ grp: 'brim', mat: 'hat', matAt: (px) => (px.inner ? ['hat', 3] : 'hat') });
      const o = W3([0, 0, 0]);
      rasterLoft(R, br, [o[0], o[1], o[2]], M[0][0], -M[0][2], [[2.2 * k, 11.2 * k, 10.8 * k], [3.4 * k, 10.4 * k, 10.0 * k], [4.6 * k, 7.9 * k, 7.7 * k]]);
      break;
    }
    case 'headband':
      shell([0, 0.9, -0.15], [8.05 * k, 8.2 * k, 7.6 * k], () => 0.22, { band: 0.5 });
      break;
    case 'cowboy': {
      const crown = prim({ grp: 'hat', matAt: (px) => (Math.abs(px.u - 4.6) < 0.7 ? 'accent' : px.u > 9.4 ? ['hat', 1] : 'hat') });
      const o = W3([0, 0, 0]);
      rasterLoft(R, crown, o, M[0][0], -M[0][2], [[3.6, 7.6, 7.2], [6.0, 7.2, 6.8], [9.6, 6.4, 6.2], [10.6, 5.2, 5.0], [11.0, 2.4, 2.2]]);
      const brim = prim({ grp: 'brim', mat: 'hat', matAt: (px) => (px.inner ? ['hat', 2] : ['hat', 1]) });
      rasterLoft(R, brim, o, M[0][0], -M[0][2], [[3.0, 13.4, 11.2], [3.8, 13.6, 11.4], [4.3, 8.2, 7.6]]);
      break;
    }
    case 'beret': {
      const pi = prim({ grp: 'hat', mat: 'hat' });
      const MM = [[M[0][0], 0, M[0][2]], [0, 1, 0], [M[2][0], 0, M[2][2]]];
      rasterEllipsoid(R, pi, W3([-1.4, 5.6 * k, -0.6]), MM, [8.6 * k, 4.1 * k, 8.0 * k]);
      ball([-1.4, 9.8 * k, -0.6], 0.8, 'hat');
      break;
    }
    default: break;
  }
}

function buildAudio(R, s, W3, M, prim) {
  const au = s.audio || 'none';
  if (au === 'none') return;
  const hat = s.hat || 'none';
  const big = s.hairStyle === 'afro' ? 2.4 : 0;
  const cupMat = au === 'headphones' ? (s.hatColor ? 'hat' : 'accent') : 'gray';
  // diadema sobre la cabeza
  const pts = [];
  const r = 8.7 + big;
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    pts.push([[Math.sin(a) * (r - 0.3), 0.6 + Math.cos(a) * (r + (hat !== 'none' ? 1.2 : 0)), -0.4], au === 'headphones' ? 0.85 : 0.6, 0]);
  }
  const band = prim({ grp: 'audio', mat: au === 'headphones' ? cupMat : 'gray' });
  rasterChain(R, band, pts.map(([p, rr]) => [W3(p), rr, 0]), false);
  const sides = au === 'headphones' ? [-1, 1] : [-1];
  for (const sd of sides) {
    const cup = prim({ grp: 'audio', matAt: (px) => (Math.abs(px.local[0]) > 7.9 + big ? [cupMat, 1] : cupMat) });
    rasterEllipsoid(R, cup, W3([sd * (7.2 + big * 0.6), -0.4, -0.3]), M, au === 'headphones' ? [1.6, 2.7, 2.5] : [1.1, 2.0, 1.9]);
  }
  if (au === 'headset') {
    const mic = prim({ grp: 'audio', mat: 'gray' });
    rasterChain(R, mic, [[W3([-7.4, -1.6, 0.6]), 0.5, 0], [W3([-5.6, -4.4, 4.0]), 0.5, 0.6], [W3([-2.6, -4.6, 5.8]), 0.5, 1]], false);
    rasterSphere(R, prim({ grp: 'audio', mat: 'red' }), W3([-2.4, -4.6, 5.9]), 0.65);
  }
}

// ---------- pintado ----------
function shadeTone(R, i, pr) {
  const d = R.nx[i] * LIGHT[0] + R.ny[i] * LIGHT[1] + R.nz[i] * LIGHT[2];
  let t;
  if (pr.hairShade) t = d > 0.86 ? 1 : d > 0.5 ? 0 : d > 0.08 ? 1 : d > -0.32 ? 2 : 3;
  else if (pr.headSkin) t = d > 0.7 ? 0 : d > 0.06 ? 1 : d > -0.4 ? 2 : 3;
  else t = d > 0.74 ? 0 : d > 0.14 ? 1 : d > -0.32 ? 2 : 3;
  if (R.inner[i]) t = Math.min(3, t + 2);
  return t;
}

function paint(fig, s, o) {
  const { R } = fig;
  const P = palette(s);
  const out = new Uint8ClampedArray(N * 4);
  const tone = new Int8Array(N).fill(-1);
  const matI = new Array(N).fill(null);
  // material y tono de cada píxel
  for (let i = 0; i < N; i++) {
    const pi = R.prim[i];
    if (pi < 0) continue;
    const pr = R.prims[pi];
    let m = pr.mat || 'top';
    if (pr.matAt) {
      const px = { u: R.u[i], wx: R.wx[i], wy: R.wy[i], wz: R.wz[i], inner: R.inner[i], local: pr.local ? pr.local([R.wx[i], R.wy[i], R.wz[i]]) : null };
      m = pr.matAt(px);
    }
    let dt = 0;
    if (Array.isArray(m)) { dt = m[1]; m = m[0]; }
    let t = shadeTone(R, i, pr);
    if (dt) t = Math.min(3, Math.max(0, t + dt));
    matI[i] = m; tone[i] = t;
  }
  // Sombra de contacto: lo que está justo debajo/derecha de algo que va más al frente
  const t2 = tone.slice();
  for (let row = 1; row < H; row++) for (let col = 0; col < W; col++) {
    const i = row * W + col;
    if (tone[i] < 0) continue;
    const g = R.prims[R.prim[i]].grp;
    for (const j of [i - W, i - W - 1]) {
      if (col === 0 && j === i - W - 1) continue;
      if (R.prim[j] < 0) continue;
      const gj = R.prims[R.prim[j]].grp;
      if (gj !== g && R.depth[j] > R.depth[i] + 1.1) { t2[i] = Math.min(3, Math.max(t2[i], tone[i] + 1)); break; }
    }
  }
  for (let i = 0; i < N; i++) {
    if (t2[i] < 0) continue;
    const c = P[matI[i]] || P.top;
    const rgb = c.t[t2[i]];
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255;
  }
  // Líneas internas: el píxel de atrás junto a una pieza de otro grupo que va claramente más al frente
  const lines = [];
  for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) {
    const i = row * W + col;
    if (tone[i] < 0) continue;
    const g = R.prims[R.prim[i]].grp;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c2 = col + dc, r2 = row + dr;
      if (c2 < 0 || r2 < 0 || c2 >= W || r2 >= H) continue;
      const j = r2 * W + c2;
      if (tone[j] < 0) continue;
      const gj = R.prims[R.prim[j]].grp;
      if (gj === g) continue;
      if (R.depth[j] > R.depth[i] + 1.4) { lines.push(i); break; }
    }
  }
  for (const i of lines) {
    const c = P[matI[i]] || P.top;
    const rgb = mix(c.t[3], c.line, 0.55);
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2];
  }
  return { out, P, matI, tone: t2 };
}

// Cara (ojos, cejas, boca) y lentes, pintados encima según hacia dónde ve la cabeza
function paintFace(fig, s, o, img) {
  const { R, head } = fig;
  const { out, P } = img;
  const proj = (lp) => {
    const q = rotY(lp, head.hc, head.hs);
    const X = head.C[0] + q[0], Y = head.C[1] + q[1];
    return [X + 20 - 0.5, V2_FOOT - Y - 0.5, q[2]]; // columna, fila (centro), profundidad relativa
  };
  const isFace = (i) => {
    const pi = R.prim[i];
    return pi >= 0 && R.prims[pi].headSkin;
  };
  const setPx = (col, row, rgb, force = false) => {
    col = Math.round(col); row = Math.round(row);
    if (col < 0 || row < 0 || col >= W || row >= H) return;
    const i = row * W + col;
    if (!force && !isFace(i)) return;
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255;
  };
  const fwdZ = Math.cos(head.yaw); // cuánto ve la cara a la cámara (1 de frente, 0 de lado, −1 de espaldas)
  if (fwdZ < -0.2) { paintBackDetails(fig, s, o, img, proj, setPx); return; }
  const side = Math.abs(Math.sin(head.yaw)) > 0.9; // perfil
  const eyes = o.blink && s.eyewear !== 'sunglasses' ? 'closed' : s.eyes || 'normal';
  const eyeC = P.eye.t[1], eyeD = mix(P.eye.line, [12, 8, 20], 0.3), white = [252, 250, 255];
  const lid = mix(P.skin.line, P.skin.t[3], 0.35);
  const brow = mix(P.hair.line, P.hair.t[3], 0.25);
  // Ojo en (x, y) local de la cabeza; w = ancho visible
  const EY = -0.35, EX = 2.75;
  const drawEye = (sd, wink) => {
    const prof = Math.abs(Math.sin(head.yaw));
    const lp = [sd * EX * (1 + prof * 0.25), EY, 6.0 - prof * 1.3];
    const q = rotY(lp, head.hc, head.hs);
    if (q[2] < 1.6) return null; // del otro lado de la cara
    const [cc, rr] = proj(lp);
    const narrow = q[2] < 4.6;
    const w = narrow ? 1 : 2;
    const c0 = Math.round(cc - (w === 2 ? 1 : 0.5) + 0.0001 * sd);
    const r0 = Math.round(rr - 1);
    const e = wink ? 'closed' : eyes;
    if (e === 'closed' || e === 'sleepy') {
      for (let k = 0; k < w; k++) setPx(c0 + k, r0 + 1, lid);
      if (e === 'sleepy') for (let k = 0; k < w; k++) setPx(c0 + k, r0, mix(P.skin.t[2], lid, 0.3));
    } else if (e === 'happy') {
      setPx(c0, r0 + 1, eyeD); setPx(c0 + w - 1, r0 + 1, eyeD);
      for (let k = 0; k < w; k++) setPx(c0 + k, r0, eyeD);
      if (w === 2) { setPx(c0 - (sd < 0 ? 1 : -2), r0 + 1, eyeD); }
    } else if (e === 'big') {
      for (let k = 0; k < w + (narrow ? 0 : 1); k++) for (let j = 0; j < 3; j++) setPx(c0 + k - (sd > 0 || narrow ? 0 : 1), r0 - 1 + j, j === 0 ? eyeD : eyeC);
      setPx(c0 + (sd > 0 || narrow ? 0 : -1), r0, white);
    } else {
      for (let k = 0; k < w; k++) { setPx(c0 + k, r0, eyeD); setPx(c0 + k, r0 + 1, eyeC); }
      setPx(narrow && Math.sin(head.yaw) > 0 ? c0 + w - 1 : c0, r0, white);
    }
    // Ceja
    if (!(s.hat === 'cap' || s.hat === 'beanie') || true) {
      const bw = narrow ? 2 : 3;
      const bc0 = narrow ? c0 - (Math.sin(head.yaw) > 0 ? 0 : 1) : sd < 0 ? c0 - 1 : c0;
      for (let k = 0; k < bw; k++) setPx(bc0 + k, r0 - 2 - (e === 'big' ? 1 : 0) + (e === 'sleepy' ? 1 : 0), brow);
    }
    return [c0, r0, w];
  };
  const eyeA = drawEye(-1, false), eyeB = drawEye(1, eyes === 'wink');
  // Nariz (sombrita)
  if (!side) {
    const [nc, nr] = proj([0, -1.9, 6.2]);
    const tq = rotY([0, 0, 1], head.hc, head.hs);
    setPx(nc + (tq[0] > 0.2 ? 0.5 : tq[0] < -0.2 ? -0.5 : 0) + 0.5, nr, P.skin.t[2]);
  }
  // Boca
  const mouth = o.talk ? (s.mouth === 'open' ? 'neutral' : 'talk') : s.mouth || 'neutral';
  {
    const lp = [0, -4.35, 5.4 - Math.abs(Math.sin(head.yaw)) * 0.9];
    const q = rotY(lp, head.hc, head.hs);
    if (q[2] > 0.5) {
      const [mc, mr] = proj(lp);
      const mC = mix(P.skin.line, [120, 30, 40], 0.25);
      const narrow = side || Math.abs(Math.sin(head.yaw)) > 0.6;
      const c0 = Math.round(mc - (narrow ? 0.5 : 1)), r0 = Math.round(mr - 0.5);
      const dirx = Math.sin(head.yaw) < 0 ? -1 : 1;
      switch (mouth) {
        case 'smile':
          if (narrow) { setPx(c0, r0, mC); setPx(c0 + dirx, r0 - 1, mC); }
          else { setPx(c0 - 1, r0 - 1, mC); setPx(c0, r0, mC); setPx(c0 + 1, r0, mC); setPx(c0 + 2, r0 - 1, mC); }
          break;
        case 'grin':
          for (let k = narrow ? 0 : -1; k < (narrow ? 2 : 3); k++) { setPx(c0 + k, r0 - 1, white); setPx(c0 + k, r0, mC); }
          break;
        case 'open':
        case 'talk':
          for (let k = 0; k < (narrow ? 1 : 2); k++) { setPx(c0 + k, r0 - (mouth === 'open' ? 1 : 0), mC); setPx(c0 + k, r0 + (mouth === 'open' ? 0 : 0), mouth === 'open' ? [200, 70, 90] : mC); }
          if (mouth === 'talk') for (let k = 0; k < (narrow ? 1 : 2); k++) setPx(c0 + k, r0 + 1, [196, 72, 92]);
          break;
        default:
          for (let k = 0; k < (narrow ? 1 : 2); k++) setPx(c0 + k, r0, mC);
      }
    }
  }
  // Rubor
  if (!side) for (const sd of [-1, 1]) {
    const lp = [sd * 4.3, -2.6, 4.9];
    const q = rotY(lp, head.hc, head.hs);
    if (q[2] < 2.5) continue;
    const [bc, brr] = proj(lp);
    const blush = mix(P.skin.t[1], [240, 96, 110], 0.28);
    setPx(Math.round(bc - 0.5), Math.round(brr), blush);
    setPx(Math.round(bc + 0.5), Math.round(brr), blush);
  }
  // Aretes
  if (s.extra === 'earrings') for (const sd of [-1, 1]) {
    const lp = [sd * 6.8, -2.6, 0.2];
    const q = rotY(lp, head.hc, head.hs);
    if (q[2] < -2.6) continue;
    const [ec, er] = proj(lp);
    const i = Math.round(er) * W + Math.round(ec);
    if (R.depth[i] > head.C[2] + q[2] + 1.5 && !isFace(i)) continue;
    setPx(ec, er, [255, 214, 64], true); setPx(ec, er + 1, [214, 150, 20], true);
  }
  // Lentes
  const ew = s.eyewear || 'none';
  if (ew !== 'none') {
    const sun = ew === 'sunglasses';
    const fr = sun ? [24, 22, 32] : ew === 'round' ? [150, 112, 52] : [92, 62, 112];
    const rim = mix(fr, P.skin.t[1], 0.45);
    const lens = [30, 30, 44];
    const glint = sun ? [150, 156, 190] : [255, 255, 255];
    const eyesAt = [eyeA, eyeB].filter(Boolean);
    for (const e of eyesAt) {
      const [c0, r0, w] = e;
      const x0 = c0 - 1, y0 = r0 - 1, x1 = c0 + w, y1 = r0 + 2;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const side = x === x0 || x === x1;
        const corner = side && (y === y0 || y === y1);
        if (ew === 'round' && corner) continue;
        if (y === y0) setPx(x, y, fr, true);
        else if (y === y1) setPx(x, y, sun ? fr : rim, true);
        else if (side) setPx(x, y, fr, true);
        else if (sun) setPx(x, y, lens, true);
      }
      if (sun) setPx(x0 + 1, y0 + 1, glint, true);
    }
    if (eyesAt.length === 2) {
      const a = eyesAt[0], b = eyesAt[1];
      for (let x = a[0] + a[2] + 1; x < b[0] - 1; x++) setPx(x, a[1], fr, true);
    }
    // Patita hacia la oreja (de lado / 3/4)
    const sn = Math.sin(head.yaw);
    if (Math.abs(sn) > 0.3 && eyesAt.length) {
      const e = sn < 0 ? eyesAt[eyesAt.length - 1] : eyesAt[0];
      const [ec] = proj([(sn < 0 ? 1 : -1) * 6.6, -0.4, 0]);
      const from = sn < 0 ? e[0] + e[2] + 1 : e[0] - 2;
      const step = sn < 0 ? 1 : -1;
      for (let x = from; sn < 0 ? x <= ec : x >= ec; x += step) {
        const i = (e[1]) * W + x;
        if (x < 0 || x >= W) break;
        if (!isFace(i)) break;
        setPx(x, e[1], fr);
      }
    }
  }
}
function paintBackDetails() { /* de espaldas no se ve la cara */ }

// Contorno exterior de color (el lado con luz un poco más suave)
function outline(img) {
  const { out, P, matI } = img;
  const src = out.slice();
  for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) {
    const i = row * W + col;
    if (src[i * 4 + 3]) continue;
    let best = -1, lit = false;
    for (const [dc, dr, l] of [[0, 1, true], [1, 0, true], [-1, 0, false], [0, -1, false]]) {
      const c2 = col + dc, r2 = row + dr;
      if (c2 < 0 || r2 < 0 || c2 >= W || r2 >= H) continue;
      const j = r2 * W + c2;
      if (src[j * 4 + 3]) { best = j; lit = l; break; }
    }
    if (best < 0) continue;
    const c = P[matI[best]] || P.top;
    const rgb = lit && matI[best] ? mix(c.line, c.t[3], 0.28) : c.line;
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255;
  }
}

// ---------- API ----------
const VIEWS = new Set(V2_RING);
export function renderFrameV2(avatar, o = {}) {
  const s = normalizeSpecV2(avatar || {});
  const dir = VIEWS.has(o.dir) ? o.dir : 'down';
  const opt = { ...o, dir, head: VIEWS.has(o.head) ? o.head : null };
  if (opt.pose && !POSES_V2[opt.pose]) opt.pose = null;
  // Objeto en la mano / cartel (Hotel): el brazo cercano a la cámara
  const holdArm = dir === 'right' || dir === 'downRight' || dir === 'upRight' ? 0 : 1;
  const hold = HAND_ITEMS.includes(o.hold) ? o.hold : null;
  if (hold || o.sign != null) {
    const cur = POSES_V2[opt.pose]?.[holdArm ? 'b' : 'a'];
    const free = !opt.pose || cur === 'idle' || cur === 'lap' || opt.pose === 'sign';
    const g = o.sign != null ? 'sign' : o.drink ? 'drink' : 'hold';
    if (free || o.sign != null) opt.armOverride = holdArm ? [null, g] : [g, null];
  }
  if (opt.pose === 'sign') opt.pose = null;
  const fig = buildFigure(s, opt);
  const img = paint(fig, s, opt);
  paintFace(fig, s, opt, img);
  // Mano con objeto
  const hands = {};
  fig.sk.arms.forEach((A, k) => {
    const h = A.hW;
    hands[k ? 'b' : 'a'] = [h[0] + 20, V2_FOOT - h[1]];
  });
  if (hold && o.sign == null) {
    const [hx, hy] = hands[holdArm ? 'b' : 'a'];
    const set = (x, y, c) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      img.out[i] = c[0]; img.out[i + 1] = c[1]; img.out[i + 2] = c[2]; img.out[i + 3] = 255;
      img.matI[y * W + x] = 'white';
    };
    // de espaldas el objeto queda detrás del cuerpo: se pinta solo si su mano se ve
    paintHandItem(set, hold, Math.round(hx - 1), Math.round(hy - 1.5), 2, 2, { drink: !!o.drink });
  }
  outline(img);
  // Fila del asiento (sentado: la cadera) y coronilla
  let crown = H;
  for (let i = 0; i < N; i++) if (img.out[i * 4 + 3]) { crown = Math.floor(i / W); break; }
  const seat = Math.round(V2_FOOT - (BODY.hipY + fig.sk.lift) + 1.5);
  const hc = fig.head.C;
  return {
    data: img.out, width: W, height: H, hands, holdArm: hold || o.sign != null ? (holdArm ? 'b' : 'a') : null,
    head: [hc[0] + 20, V2_FOOT - hc[1]], seat, crown,
  };
}

// Clave de caché de un cuadro
export function frameKeyV2(o) {
  return [o.dir || 'down', o.head || '', o.walk | 0, o.pose || '', o.breathe ? 1 : 0, o.blink ? 1 : 0, o.talk ? 1 : 0, o.hold || '', o.drink ? 1 : 0, o.sign ?? ''].join('|');
}

// Hoja de referencia (vistas previas y pruebas): filas = 8 vistas; columnas = quieto, respira, 8 de caminar,
// y las posturas en V2_POSES
export const V2_SHEET_COLS = ['idle', 'breathe', ...Array.from({ length: V2_WALK }, (_, i) => `walk${i + 1}`), ...V2_POSES];
export function renderSheetV2(avatar, views = V2_RING, cols = V2_SHEET_COLS) {
  const Wd = W * cols.length, Ht = H * views.length;
  const data = new Uint8ClampedArray(Wd * Ht * 4);
  views.forEach((dir, row) => cols.forEach((c, col) => {
    const o = { dir };
    if (c === 'breathe') o.breathe = 1;
    else if (c.startsWith('walk')) o.walk = Number(c.slice(4));
    else if (c !== 'idle') o.pose = c;
    const fr = renderFrameV2(avatar, o);
    for (let y = 0; y < H; y++) data.set(fr.data.subarray(y * W * 4, (y + 1) * W * 4), ((row * H + y) * Wd + col * W) * 4);
  }));
  return { data, width: Wd, height: Ht };
}
