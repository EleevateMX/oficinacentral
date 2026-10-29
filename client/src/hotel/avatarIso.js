// Hotel: personajes isométricos (vista 3/4) en pixel-art, generados por código.
//
// Cada personaje se arma con piezas 3D sencillas (elipsoides, cápsulas y cajas) a partir de la misma
// ficha que la oficina (shared/sprite.js: piel, peinado, colores de ropa, accesorios…) y se "pinta"
// píxel por píxel lanzando un rayo por cada píxel en la dirección de la vista isométrica del Hotel
// (la misma proyección que shared/hotel.js toScreen: 1 píxel del dibujo = 1 px de pantalla a zoom 1).
// Después se le pone contorno, ojos, boca y detalles. Resultado: 8 direcciones con la misma luz que
// los furnis, nítido a cualquier zoom (se escala sin suavizar) y guardado en caché por cuadro.
//
// avatarFrame(avatar, opts) → { cv, ax, ay, w, h, head: [x, y], top } | null (si se acabó el tiempo de este cuadro)
//   opts.dir: 0–7 (ver shared/hotelWalk.js) · opts.head: dirección de la cabeza (±1 de dir)
//   opts.pose: 'stand' | 'walk' | 'sit' | 'lay' | 'wave' | 'dance'
//   opts.frame: cuadro de la animación (walk/dance 0–3, wave 0–1) · opts.blink · opts.talk
//   opts.seatH: altura del asiento sobre el piso (para doblar las piernas sin atravesar el piso)
//   (ax, ay) = píxel de los pies (o, acostado, el centro de la casilla de la almohada sobre el colchón)
//   head = centro de la cabeza respecto a (ax, ay) · top = cuántos px arriba de los pies queda la coronilla
import { normalizeSpec } from '../../../shared/sprite.js';
import { DIR_VEC } from '../../../shared/hotelWalk.js';

// ---------- colores ----------
const HEXRE = /^#[0-9a-fA-F]{6}$/;
const rgbOf = (hex, fb) => { const h = HEXRE.test(String(hex)) ? hex : fb; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const INK = [34, 26, 44];
const WHITE = [250, 248, 244];

// ---------- vectores ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const V = nrm([1, 1, 1]); // hacia quien mira (núcleo de la proyección isométrica)
const L = nrm([-0.45, 0.3, 1]); // luz: arriba y a la izquierda de la pantalla, como los furnis
const FAR = 40;

// Pantalla (px, relativo a los pies) de un punto del mundo (en casillas / unidades de altura)
const scr = (p) => [(p[0] - p[1]) * 32, (p[0] + p[1]) * 16 - p[2] * 32];

// ---------- primitivas ----------
// Elipsoide: centro c, ejes ortonormales a (3 vectores) y radios r. Cápsula: segmento a–b, radio r.
// Caja: centro c, ejes a, medias medidas h. Todas con: part (para contornos internos), col o tex(local, n, prim).
function ell(c, a, r, o) { return { k: 'E', c, a, r, ...o }; }
function cap(a, b, r, o) { return { k: 'C', a, b, r, ...o }; }
function box(c, a, h, o) { return { k: 'B', c, a, h, ...o }; }

function prepare(p) {
  if (p.k === 'E') {
    p.m = p.a.map((ax, i) => mul(ax, 1 / p.r[i]));
    p.R = Math.max(...p.r);
    p.cen = p.c;
  } else if (p.k === 'C') {
    p.cen = mul(add(p.a, p.b), 0.5);
    p.R = Math.hypot(...sub(p.b, p.a)) / 2 + p.r;
  } else {
    p.R = Math.hypot(...p.h);
    p.cen = p.c;
  }
  const [sx, sy] = scr(p.cen);
  p.bx = [sx - p.R * 46 - 1, sy - p.R * 40 - 1, sx + p.R * 46 + 1, sy + p.R * 40 + 1];
}

// Rayo: o + t·d con d = −V (de quien mira hacia la escena). Devuelve { t, n, l (coords locales) } o null.
const D = mul(V, -1);
function hitE(p, o) {
  const oc = sub(o, p.c);
  const lo = [dot(oc, p.m[0]), dot(oc, p.m[1]), dot(oc, p.m[2])];
  const ld = [dot(D, p.m[0]), dot(D, p.m[1]), dot(D, p.m[2])];
  const A = dot(ld, ld), B = dot(lo, ld), C = dot(lo, lo) - 1;
  const h = B * B - A * C;
  if (h < 0) return null;
  const s = Math.sqrt(h);
  for (const t of [(-B - s) / A, (-B + s) / A]) {
    const l = [lo[0] + ld[0] * t, lo[1] + ld[1] * t, lo[2] + ld[2] * t];
    if (p.clip && !p.clip(l)) continue;
    const n = nrm(add(add(mul(p.a[0], l[0] / p.r[0]), mul(p.a[1], l[1] / p.r[1])), mul(p.a[2], l[2] / p.r[2])));
    return { t, n: t === (-B - s) / A ? n : mul(n, -1), l };
  }
  return null;
}
function hitC(p, o) {
  const ba = sub(p.b, p.a), oa = sub(o, p.a);
  const baba = dot(ba, ba), bard = dot(ba, D), baoa = dot(ba, oa), rdoa = dot(D, oa), oaoa = dot(oa, oa);
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - p.r * p.r * baba;
  let h = B * B - A * C;
  let t = -1;
  if (h >= 0 && A > 1e-9) {
    t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (!(y > 0 && y < baba)) {
      const oc = y <= 0 ? oa : sub(o, p.b);
      const b = dot(D, oc), c = dot(oc, oc) - p.r * p.r;
      h = b * b - c;
      t = h > 0 ? -b - Math.sqrt(h) : -1;
    }
  } else {
    // Rayo paralelo al eje: las tapas
    for (const e of [p.a, p.b]) {
      const oc = sub(o, e), b = dot(D, oc), c = dot(oc, oc) - p.r * p.r, hh = b * b - c;
      if (hh > 0) { const tt = -b - Math.sqrt(hh); if (t < 0 || tt < t) t = tt; }
    }
  }
  if (t < 0) return null;
  const q = add(o, mul(D, t));
  const k = Math.max(0, Math.min(1, dot(sub(q, p.a), ba) / baba));
  const n = nrm(sub(q, add(p.a, mul(ba, k))));
  return { t, n, l: [k, 0, 0] };
}
function hitB(p, o) {
  const oc = sub(o, p.c);
  let t0 = -Infinity, t1 = Infinity, ax = 0, sg = 1;
  for (let i = 0; i < 3; i++) {
    const lo = dot(oc, p.a[i]), ld = dot(D, p.a[i]);
    if (Math.abs(ld) < 1e-9) { if (Math.abs(lo) > p.h[i]) return null; continue; }
    let ta = (-p.h[i] - lo) / ld, tb = (p.h[i] - lo) / ld;
    let s = -1;
    if (ta > tb) { const x = ta; ta = tb; tb = x; s = 1; }
    if (ta > t0) { t0 = ta; ax = i; sg = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  const n = mul(p.a[ax], sg);
  const q = add(oc, mul(D, t0));
  return { t: t0, n, l: [dot(q, p.a[0]), dot(q, p.a[1]), dot(q, p.a[2])] };
}
const HIT = { E: hitE, C: hitC, B: hitB };

// ---------- esqueleto ----------
// Base del cuerpo: f (al frente), r (a su derecha), z (arriba). Mundo = O + f·Bf + r·Br + z·Bz.
function basisFor(dir) {
  const [dx, dy] = DIR_VEC[((dir % 8) + 8) % 8];
  const F = nrm([dx, dy, 0]);
  return { F, R: [-F[1], F[0], 0], Z: [0, 0, 1] };
}

// Alturas (en unidades del cuerpo, de pie)
const HIP = 0.66, SHO = 1.27, HEADZ = 1.84;
const TH = 0.32, SH = 0.31; // muslo, espinilla
const UA = 0.27, FA = 0.25; // brazo, antebrazo
const HR = [0.275, 0.3, 0.315]; // radios de la cabeza (frente, lado, alto)

function legsFor(pose, frame, seatH) {
  // Ángulos: muslo desde la vertical (positivo = al frente) y doblez de rodilla
  if (pose === 'walk') {
    const sw = [0.38, 0.06, -0.38, -0.06][frame & 3];
    const bend = [0, 0.35, 0, 0.35][frame & 3];
    return { r: { th: sw, kn: frame === 3 ? bend : 0.08 }, l: { th: -sw, kn: frame === 1 ? bend : 0.08 }, bob: frame & 1 ? 0.035 : 0 };
  }
  if (pose === 'dance') {
    const k = [0.25, 0, 0.25, 0][frame & 3];
    return { r: { th: k * 0.8, kn: k * 1.6 }, l: { th: k * 0.8, kn: k * 1.6 }, bob: -k * 0.2, sway: [0, 0.035, 0, -0.035][frame & 3] };
  }
  return { r: { th: 0, kn: 0 }, l: { th: 0, kn: 0 }, bob: 0 };
}
function armsFor(pose, frame) {
  // Cada brazo: dirección del brazo y del antebrazo como [f, r(hacia afuera), z]
  const down = { up: [0.02, 0.1, -1], lo: [0.08, 0.04, -1] };
  if (pose === 'walk') {
    const sw = [-0.5, -0.05, 0.5, 0.05][frame & 3];
    return { r: { up: [sw, 0.1, -1], lo: [sw * 1.3 + 0.12, 0.04, -1] }, l: { up: [-sw, 0.1, -1], lo: [-sw * 1.3 + 0.12, 0.04, -1] } };
  }
  if (pose === 'sit') return { r: { up: [0.28, 0.06, -1], lo: [1, -0.05, -0.12] }, l: { up: [0.28, 0.06, -1], lo: [1, -0.05, -0.12] } };
  if (pose === 'lay') return { r: { up: [0.05, 0.25, -1], lo: [0.25, 0.1, -1] }, l: { up: [0.05, 0.25, -1], lo: [0.25, 0.1, -1] } };
  if (pose === 'wave') {
    const k = frame & 1 ? 0.55 : 0.12;
    return { r: { up: [0.05, 1, 0.5], lo: [0.05, k, 1] }, l: down };
  }
  if (pose === 'dance') {
    const A = [
      { r: { up: [0.2, 0.7, 0.8], lo: [0.1, 0.1, 1] }, l: { up: [0.2, 0.7, 0.8], lo: [0.1, 0.1, 1] } },
      { r: { up: [0.3, 0.9, -0.2], lo: [0.4, 0.4, 0.6] }, l: { up: [0.3, 0.9, -0.2], lo: [0.4, 0.4, 0.6] } },
      { r: { up: [0.2, 0.5, 1], lo: [0, 0.15, 1] }, l: { up: [0.3, 0.4, -1], lo: [0.4, 0.1, -0.8] } },
      { r: { up: [0.3, 0.9, -0.2], lo: [0.4, 0.4, 0.6] }, l: { up: [0.3, 0.9, -0.2], lo: [0.4, 0.4, 0.6] } },
    ];
    return A[frame & 3];
  }
  return { r: down, l: down };
}

// ---------- ropa ----------
const LONG_SLEEVES = new Set(['hoodie', 'sweater', 'shirt', 'suit', 'blazer', 'varsity', 'jacket', 'uniform']);

function buildModel(spec, o) {
  const pose = o.pose || 'stand', frame = o.frame | 0;
  const C = {
    skin: rgbOf(spec.skin, '#f6c9a0'), hair: rgbOf(spec.hair, '#1b1720'), top: rgbOf(spec.shirt, '#3d7be0'),
    acc: rgbOf(spec.accent, '#f4f4f6'), pants: rgbOf(spec.pants, '#2b2d42'), shoes: rgbOf(spec.shoes, '#1d1d22'),
    hat: rgbOf(spec.hatColor || spec.accent, '#101010'), eye: rgbOf(spec.eyeColor, '#261e30'),
  };
  const top = spec.top || 'tee', bottom = spec.bottom || 'pants', hs = spec.hairStyle || 'short';
  const prims = [];
  const P = (p) => { prims.push(p); return p; };

  // Base y origen
  let B, O, S = 1;
  const sitting = pose === 'sit';
  if (pose === 'lay') {
    // Acostado boca arriba: la cabeza hacia la cabecera (contrario a dir), la cara hacia arriba
    const b = basisFor(o.dir);
    B = { F: [0, 0, 1], R: b.R, Z: mul(b.F, -1) };
    S = 0.8;
    // La cabeza queda 0.12 casillas hacia la cabecera desde el centro; la espalda sobre el colchón
    O = add(mul(b.F, -0.12 + HEADZ * S), [0, 0, 0.13 * S]);
  } else {
    B = basisFor(o.dir);
    O = [0, 0, 0];
  }
  const W = (f, r, z) => add(O, add(add(mul(B.F, f * S), mul(B.R, r * S)), mul(B.Z, z * S)));
  const Wv = (f, r, z) => nrm(add(add(mul(B.F, f), mul(B.R, r)), mul(B.Z, z)));
  const lg = legsFor(pose, frame, o.seatH ?? 0.6);
  const bob = lg.bob || 0, sway = lg.sway || 0;
  // Sentado: la cadera queda a 0.1 del asiento y el cuerpo se recorre un poco hacia atrás
  const dz = sitting ? 0.1 - HIP : bob;
  const df = sitting ? -0.05 : 0;

  // ---- piernas ----
  const legCol = (h, upper) => (bottom === 'pants' ? C.pants : bottom === 'shorts' ? (upper && h < 0.72 ? C.pants : C.skin) : C.skin);
  for (const side of [1, -1]) {
    const hip = [df, side * 0.095 + sway, HIP + dz];
    let knee, ankle, footF;
    if (sitting) {
      // Muslos al frente; la espinilla baja hasta donde deje el piso
      const seatH = Math.max(0, o.seatH ?? 0.6);
      knee = [hip[0] + TH, hip[1], hip[2] + 0.01];
      const c = Math.min(1, (knee[2] + seatH - 0.07) / SH);
      const phi = Math.acos(Math.max(-1, c));
      ankle = [knee[0] + Math.sin(phi) * SH, knee[1], knee[2] - Math.cos(phi) * SH];
      footF = [Math.cos(phi * 0.8), 0, Math.sin(phi * 0.8)];
    } else {
      const g = side > 0 ? lg.r : lg.l;
      knee = [hip[0] + Math.sin(g.th) * TH, hip[1], hip[2] - Math.cos(g.th) * TH];
      const a2 = g.th - g.kn;
      ankle = [knee[0] + Math.sin(a2) * SH, knee[1], knee[2] - Math.cos(a2) * SH];
      footF = [1, 0, pose === 'lay' ? 0.4 : 0];
    }
    const part = side > 0 ? 'legR' : 'legL';
    P(cap(W(...hip), W(...knee), 0.075 * S, { part, tex: (l) => legCol(l[0], true) }));
    P(cap(W(...knee), W(...ankle), 0.068 * S, { part, tex: (l) => legCol(l[0], false) }));
    // Zapato: alargado hacia el frente
    const ff = nrm(footF);
    let up = nrm(cross([0, 1, 0], ff));
    if (up[2] < 0) up = mul(up, -1);
    const fc = [ankle[0] + ff[0] * 0.055, ankle[1], ankle[2] + 0.025 + ff[2] * 0.03]; // la suela queda justo en el piso
    P(ell(W(...fc), [Wv(...ff), Wv(0, 1, 0), Wv(...up)], [0.105 * S, 0.068 * S, 0.055 * S], { part, col: C.shoes }));
  }

  // ---- cadera y torso ----
  const hipZ = HIP + dz, shoZ = SHO + dz;
  const tz0 = hipZ - 0.06, tz1 = shoZ + 0.08;
  const torsoC = [df - 0.005, sway, (tz0 + tz1) / 2];
  const th = [0.125, 0.205, (tz1 - tz0) / 2];
  const bib = top === 'overalls';
  const torsoTex = (l0, n) => {
    const l = l0.map((v) => v / S);
    const fz = (l[2] + th[2]) / (2 * th[2]); // 0 abajo, 1 arriba
    const front = l[0] > th[0] - 0.012;
    const ar = Math.abs(l[1]);
    if (fz < 0.12 && !bib) return bottom === 'skirt' ? C.pants : shade(C.pants, 0); // cinturón/cadera
    switch (top) {
      case 'suit': case 'blazer':
        if (front && fz > 0.35 && ar < (fz - 0.35) * 0.16) return top === 'suit' && ar < 0.016 && fz < 0.92 ? C.acc : WHITE;
        if (front && fz > 0.35 && ar < (fz - 0.35) * 0.16 + 0.02) return shade(C.top, -0.3);
        return C.top;
      case 'shirt':
        if (front && ar < 0.017 && fz > 0.25 && fz < 0.93) return C.acc;
        if (fz > 0.9 && ar < 0.07) return WHITE;
        return C.top;
      case 'jacket':
        if (front && ar < 0.009) return C.acc;
        if (fz > 0.9) return shade(C.top, -0.22);
        return C.top;
      case 'hoodie':
        if (front && fz > 0.6 && fz < 0.86 && Math.abs(ar - 0.05) < 0.009) return C.acc;
        if (front && fz > 0.18 && fz < 0.42 && ar < 0.12) return shade(C.top, -0.14);
        return C.top;
      case 'sweater':
        if (fz < 0.2) return shade(C.top, -0.2);
        return C.top;
      case 'varsity':
        if (front && ar < 0.01) return C.acc;
        if (fz < 0.18 || fz > 0.92) return C.acc;
        return C.top;
      case 'uniform':
        if (front && fz > 0.62 && fz < 0.75 && l[1] < -0.07 && l[1] > -0.13) return C.acc;
        if (fz < 0.2) return [30, 30, 34];
        return C.top;
      case 'tank':
        if (fz > 0.9 && ar > 0.06 && ar < 0.15) return C.skin;
        return C.top;
      case 'overalls':
        if (fz < 0.12) return C.pants;
        if (front && fz < 0.7 && ar < 0.14) return C.pants;
        if (ar > 0.1 && ar < 0.14 && fz >= 0.7) return C.pants;
        return C.top;
      default:
        if (fz > 0.9 && ar < 0.06) return shade(C.top, -0.18);
        return C.top;
    }
  };
  P(box(W(...torsoC), [B.F, B.R, B.Z].map((a) => a), th.map((x) => x * S), { part: 'torso', tex: torsoTex }));
  // Hombros redondeados
  for (const side of [1, -1]) P(ell(W(df, side * 0.17 + sway, shoZ + 0.02), [B.F, B.R, B.Z], [0.12 * S, 0.075 * S, 0.075 * S], { part: 'torso', tex: (l) => (top === 'tank' ? C.skin : top === 'varsity' ? C.acc : C.top) }));
  if (bottom === 'skirt') {
    if (sitting) P(box(W(df + 0.17, sway, hipZ - 0.02), [B.F, B.R, B.Z], [0.22 * S, 0.21 * S, 0.075 * S], { part: 'torso', col: C.pants }));
    else P(ell(W(df, sway, hipZ - 0.06), [B.F, B.R, B.Z], [0.17 * S, 0.24 * S, 0.24 * S], { part: 'torso', col: C.pants, clip: (l) => l[2] > -0.65 && l[2] < 0.25 }));
  }
  if (top === 'hoodie') P(ell(W(df - 0.1, sway, shoZ + 0.07), [B.F, B.R, B.Z], [0.065 * S, 0.17 * S, 0.075 * S], { part: 'torso', col: shade(C.top, -0.1) }));
  if (spec.extra === 'backpack') P(box(W(df - 0.19, sway, shoZ - 0.25), [B.F, B.R, B.Z], [0.07 * S, 0.15 * S, 0.2 * S], { part: 'pack', tex: (l) => (Math.abs(l[2] + 0.06 * S) < 0.012 ? shade(C.acc, -0.3) : C.acc) }));
  if (spec.extra === 'scarf') P(ell(W(df + 0.01, sway, shoZ + 0.11), [B.F, B.R, B.Z], [0.15 * S, 0.19 * S, 0.06 * S], { part: 'scarf', col: C.acc }));
  // Cuello
  P(cap(W(df, sway, shoZ + 0.04), W(df, sway, shoZ + 0.22), 0.065 * S, { part: 'neck', col: shade(C.skin, -0.08) }));

  // ---- brazos ----
  const am = armsFor(pose, frame);
  for (const side of [1, -1]) {
    const g = side > 0 ? am.r : am.l;
    const sh = [df, side * 0.235 + sway, shoZ - 0.02];
    const ud = nrm([g.up[0], g.up[1] * side, g.up[2]]), ld = nrm([g.lo[0], g.lo[1] * side, g.lo[2]]);
    const el = add(sh, mul(ud, UA)), wr = add(el, mul(ld, FA));
    const part = side > 0 ? 'armR' : 'armL';
    const sleeve = top === 'tank' ? null : top === 'varsity' ? C.acc : C.top;
    const long = LONG_SLEEVES.has(top);
    P(cap(W(...sh), W(...el), 0.062 * S, { part, tex: (l) => (sleeve && (long || l[0] < 0.62) ? sleeve : C.skin) }));
    P(cap(W(...el), W(...wr), 0.055 * S, { part, tex: (l) => (long && l[0] < 0.88 ? sleeve : C.skin) }));
    P(ell(W(...add(wr, mul(ld, 0.035))), [B.F, B.R, B.Z], [0.065 * S, 0.06 * S, 0.068 * S], { part, col: C.skin }));
  }

  // ---- cabeza ----
  const hd = o.head ?? o.dir;
  const hb = pose === 'lay' ? B : basisFor(hd);
  const HA = pose === 'lay' ? [B.F, B.R, B.Z] : [hb.F, hb.R, hb.Z];
  const hc = W(df + 0.01, sway, HEADZ + dz);
  const hr = HR.map((x) => x * S);
  const beard = spec.facialHair || 'none';
  const headTex = (l, n) => {
    // l = coordenadas normalizadas del elipsoide (frente, lado, arriba)
    if (beard === 'beard' && l[2] < -0.2 && l[0] > -0.45) return C.hair;
    if (beard === 'goatee' && l[2] < -0.5 && Math.abs(l[1]) < 0.32 && l[0] > 0.4) return C.hair;
    if (beard === 'stubble' && l[2] < -0.28 && l[0] > 0.1) return mix(C.skin, C.hair, 0.32);
    return C.skin;
  };
  const head = P(ell(hc, HA, hr, { part: 'head', tex: headTex }));
  const HP = (u, v, w, k = 1) => add(hc, add(add(mul(HA[0], u * hr[0] * k), mul(HA[1], v * hr[1] * k)), mul(HA[2], w * hr[2] * k)));
  const shell = (k, clip, o2 = {}) => P(ell(o2.c || hc, HA, (o2.r || [k, k, k]).map((x, i) => hr[i] * x), { part: o2.part || 'hair', col: o2.col || C.hair, clip, tex: o2.tex }));
  const blob = (u, v, w, rr, o2 = {}) => P(ell(HP(u, v, w), HA, (Array.isArray(rr) ? rr : [rr, rr, rr]).map((x) => x * S), { part: o2.part || 'hair', col: o2.col || C.hair }));

  // ---- pelo ----
  const hat = spec.hat || 'none';
  const hairD = shade(C.hair, -0.18);
  // Huecos: la cara (frente debajo de la línea del pelo) y debajo de las orejas
  const faceHole = (line, side = -0.15, back = -0.55) => (l) => l[2] > line || (l[0] < 0.3 && l[2] > (l[0] < -0.35 ? back : side));
  switch (hs) {
    case 'buzz': shell(1.03, faceHole(0.5, 0.05, -0.3), { col: mix(C.hair, C.skin, 0.25) }); break;
    case 'slick': shell(1.1, faceHole(0.52, -0.05, -0.6), { tex: (l) => (Math.abs(((l[1] * 7) % 1 + 1) % 1 - 0.5) < 0.08 ? shade(C.hair, 0.2) : C.hair) }); break;
    case 'sidepart':
      shell(1.1, (l) => faceHole(0.46, -0.1, -0.5)(l) || (l[0] > 0 && l[2] > 0.18 + l[1] * 0.4));
      break;
    case 'spiky':
      shell(1.08, faceHole(0.48, -0.1, -0.45));
      for (const [u, v, w] of [[0.5, -0.4, 0.75], [0.55, 0.3, 0.75], [0, 0, 1.05], [-0.4, -0.5, 0.8], [-0.4, 0.5, 0.8], [0.2, 0, 1]]) {
        const tip = nrm([u, v, w * 1.4]);
        P(ell(HP(u * 0.85, v * 0.85, w * 0.85), [HA[0], HA[1], HA[2]].map((a) => a), [0.09 * S, 0.09 * S, 0.13 * S], { part: 'hair', col: C.hair, clip: (l) => dot(l, tip) > -0.4 }));
      }
      break;
    case 'mohawk':
      shell(1.03, faceHole(0.5, 0.05, -0.3), { col: mix(C.hair, C.skin, 0.55) });
      P(ell(HP(-0.05, 0, 0.9), HA, [0.3 * S, 0.06 * S, 0.17 * S], { part: 'hair', col: C.hair }));
      break;
    case 'curly':
      shell(1.08, faceHole(0.45, -0.1, -0.5));
      for (const [u, v, w] of [[0.62, -0.42, 0.62], [0.68, 0.1, 0.65], [0.55, 0.55, 0.6], [0, -0.75, 0.62], [0, 0.75, 0.62], [-0.55, -0.5, 0.55], [-0.55, 0.5, 0.55], [0, 0, 1], [-0.8, 0, 0.3]]) blob(u, v, w, 0.1);
      break;
    case 'afro':
      P(ell(HP(-0.15, 0, 0.32), HA, [0.36 * S, 0.4 * S, 0.37 * S], { part: 'hair', col: C.hair, clip: (l) => !(l[0] > 0.45 && l[2] < 0.15) }));
      break;
    case 'bob':
      shell(1.13, (l) => l[2] > 0.42 || (l[0] < 0.42 && l[2] > -0.85), { r: [1.12, 1.18, 1.1] });
      break;
    case 'long':
      shell(1.12, (l) => l[2] > 0.44 || (l[0] < 0.38 && l[2] > -0.95), { r: [1.1, 1.16, 1.1] });
      P(ell(W(df - 0.16, sway, HEADZ + dz - 0.42), [B.F, B.R, B.Z], [0.09 * S, 0.25 * S, 0.42 * S], { part: 'hair', col: hairD }));
      break;
    case 'ponytail':
      shell(1.1, faceHole(0.5, -0.1, -0.55));
      blob(-1.02, 0, 0.1, 0.1);
      P(cap(HP(-1.1, 0, -0.05), W(df - 0.33, sway, HEADZ + dz - 0.55), 0.07 * S, { part: 'hair', col: hairD }));
      break;
    case 'pigtails':
      shell(1.1, faceHole(0.5, -0.1, -0.55));
      for (const v of [-1, 1]) P(ell(HP(-0.35, v * 1.12, -0.35), HA, [0.09 * S, 0.08 * S, 0.17 * S], { part: 'hair', col: C.hair }));
      break;
    case 'bun':
      shell(1.08, faceHole(0.52, -0.1, -0.55));
      blob(-0.45, 0, 1.0, 0.12);
      break;
    default: // short
      shell(1.09, faceHole(0.48, -0.12, -0.5));
  }

  // ---- gorros ----
  if (hat === 'cap') {
    shell(1.16, (l) => l[2] > 0.18, { part: 'hat', col: C.hat });
    P(ell(HP(0.95, 0, 0.18), HA, [0.17 * S, 0.21 * S, 0.028 * S], { part: 'hat', col: shade(C.hat, -0.12) }));
  } else if (hat === 'beanie') {
    shell(1.17, (l) => l[2] > -0.05, { r: [1.15, 1.17, 1.3], part: 'hat', tex: (l) => (l[2] < 0.12 ? shade(C.hat, -0.2) : C.hat) });
  } else if (hat === 'bucket') {
    shell(1.16, (l) => l[2] > 0.1, { r: [1.12, 1.14, 1.25], part: 'hat', col: C.hat });
    P(ell(HP(0, 0, 0.18), HA, [0.4 * S, 0.42 * S, 0.035 * S], { part: 'hat', col: shade(C.hat, -0.1), clip: (l) => l[2] < 0.6 }));
  } else if (hat === 'headband') {
    shell(1.14, (l) => Math.abs(l[2] - 0.38) < 0.1, { part: 'hat', col: C.hat });
  } else if (hat === 'cowboy') {
    P(ell(HP(-0.05, 0, 0.62), HA, [0.25 * S, 0.27 * S, 0.2 * S], { part: 'hat', col: C.hat, clip: (l) => l[2] > -0.5 }));
    P(ell(HP(0, 0, 0.42), HA, [0.4 * S, 0.43 * S, 0.03 * S], { part: 'hat', col: shade(C.hat, -0.12) }));
  }
  // ---- audífonos ----
  if (spec.audio === 'headphones' || spec.audio === 'headset') {
    const band = spec.audio === 'headphones' ? C.hat : [40, 40, 46];
    shell(1.2, (l) => Math.abs(l[0]) < 0.12 && l[2] > 0, { part: 'hat', col: band });
    for (const v of [-1, 1]) P(ell(HP(0, v * 1.04, -0.05), HA, [0.11 * S, 0.06 * S, 0.12 * S], { part: 'hat', col: spec.audio === 'headphones' ? shade(C.hat, -0.2) : [40, 40, 46] }));
  }

  return { prims, C, spec, pose, head, hc, HP, hr, HA, S, W, B };
}

// ---------- pintar ----------
let budget = { until: 0, used: 0 };
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function bands(c, I) {
  if (I > 0.86) return shade(c, 0.16);
  if (I > 0.42) return c;
  if (I > 0.05) return shade(c, -0.15);
  return shade(c, -0.3);
}

function render(spec, o) {
  const M = buildModel(spec, o);
  const { prims } = M;
  for (const p of prims) prepare(p);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of prims) { x0 = Math.min(x0, p.bx[0]); y0 = Math.min(y0, p.bx[1]); x1 = Math.max(x1, p.bx[2]); y1 = Math.max(y1, p.bx[3]); }
  x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; x1 = Math.ceil(x1) + 2; y1 = Math.ceil(y1) + 2;
  const w = x1 - x0, h = y1 - y0;
  const n = w * h;
  const depth = new Float32Array(n).fill(-Infinity);
  const col = new Array(n).fill(null);
  const part = new Array(n).fill(null);
  const nz = new Float32Array(n);
  for (let j = 0; j < h; j++) {
    const sy = y0 + j + 0.5;
    for (let i = 0; i < w; i++) {
      const sx = x0 + i + 0.5;
      let best = null, bt = Infinity, bp = null;
      // Punto del rayo en z = 0 que cae en este píxel, y el origen lejos hacia quien mira
      const px = (sx / 32 + sy / 16) / 2, py = (sy / 16 - sx / 32) / 2;
      const or = [px + V[0] * FAR, py + V[1] * FAR, V[2] * FAR];
      for (const p of prims) {
        if (sx < p.bx[0] || sx > p.bx[2] || sy < p.bx[1] || sy > p.bx[3]) continue;
        const r = HIT[p.k](p, or);
        if (r && r.t < bt && r.t > 0) { bt = r.t; best = r; bp = p; }
      }
      if (!best) continue;
      const k = j * w + i;
      depth[k] = (px + py) * V[0] + FAR - bt;
      const base = bp.tex ? bp.tex(best.l, best.n, bp) : bp.col;
      col[k] = bands(base, dot(best.n, L) * 0.75 + dot(best.n, V) * 0.35);
      part[k] = bp.part;
      nz[k] = best.n[2];
    }
  }
  // ---- cara (ojos, boca, lentes, aretes) ----
  const stamp = (pt, pattern, onlyHead = true) => {
    const nrmPt = nrm(sub(pt, M.hc));
    if (dot(nrmPt, V) < 0.12) return;
    const [sx, sy] = scr(pt);
    const ci = Math.floor(sx - x0), cj = Math.floor(sy - y0);
    const k0 = cj * w + ci;
    if (ci < 0 || cj < 0 || ci >= w || cj >= h) return;
    const d = dot(pt, V);
    if (Math.abs(depth[k0] - d) > 0.07) return;
    if (onlyHead && part[k0] !== 'head') return;
    for (const [di, dj, c] of pattern) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const k = j * w + i;
      if (onlyHead && part[k] !== 'head') continue;
      col[k] = c;
    }
  };
  const { C, HP } = M;
  const eyeC = mix(C.eye, INK, 0.35);
  const eyesStyle = o.blink ? 'closed' : spec.eyes || 'normal';
  const front = (side) => side; // claridad
  for (const side of [-1, 1]) {
    const pt = HP(Math.sqrt(1 - 0.34 * 0.34 - 0.05 * 0.05) * 1.0, side * 0.34, 0.03);
    let pat;
    const st = eyesStyle === 'wink' ? (front(side) > 0 ? 'closed' : 'normal') : eyesStyle;
    if (st === 'closed' || st === 'sleepy') pat = [[0, 0, eyeC], [side > 0 ? -1 : 1, 0, eyeC]];
    else if (st === 'big') pat = [[0, -1, eyeC], [0, 0, eyeC], [side > 0 ? -1 : 1, -1, WHITE], [side > 0 ? -1 : 1, 0, eyeC]];
    else if (st === 'happy') pat = [[0, -1, eyeC], [-1, 0, eyeC], [1, 0, eyeC]];
    else pat = [[0, -1, eyeC], [0, 0, eyeC]];
    stamp(pt, pat);
    if (spec.eyewear && spec.eyewear !== 'none') {
      const fr = spec.eyewear === 'sunglasses' ? [22, 20, 26] : [40, 32, 48];
      const lens = spec.eyewear === 'sunglasses' ? [30, 28, 36] : null;
      const p2 = [];
      for (let a = -1; a <= 1; a++) for (let b = -2; b <= 1; b++) {
        const edge = a === -1 || a === 1 || b === -2 || b === 1;
        if (spec.eyewear === 'round' && (a !== 0 && (b === -2 || b === 1))) continue;
        if (edge) p2.push([a, b, fr]);
        else if (lens) p2.push([a, b, lens]);
      }
      if (lens) p2.push([0, -1, [90, 90, 110]]);
      stamp(pt, p2);
    }
    if (spec.extra === 'earrings') stamp(HP(0.05, side * 1.0, -0.38), [[0, 0, [255, 204, 0]], [0, 1, [230, 170, 0]]]);
  }
  if (spec.eyewear && spec.eyewear !== 'none') stamp(HP(0.99, 0, 0.06), [[0, -1, [40, 32, 48]], [-1, -1, [40, 32, 48]], [1, -1, [40, 32, 48]]]);
  // Boca
  const mouthC = mix(shade(C.skin, -0.45), [120, 40, 50], 0.4);
  const ms = o.talk ? 'open' : spec.mouth || 'neutral';
  const mpt = HP(Math.sqrt(1 - 0.42 * 0.42), 0, -0.42);
  let mp;
  if (ms === 'smile') mp = [[-1, -1, mouthC], [0, 0, mouthC], [1, -1, mouthC]];
  else if (ms === 'grin') mp = [[-1, 0, mouthC], [0, 0, WHITE], [1, 0, mouthC], [0, 1, mouthC]];
  else if (ms === 'open') mp = [[0, 0, mouthC], [0, 1, mouthC], [-1, 0, mouthC]];
  else mp = [[0, 0, mouthC], [-1, 0, mouthC]];
  stamp(mpt, mp);
  if (spec.facialHair === 'mustache') stamp(HP(0.92, 0, -0.27), [[-1, 0, C.hair], [0, 0, C.hair], [1, 0, C.hair], [-2, 1, C.hair], [1, 1, C.hair]]);
  if (spec.audio === 'headset') stamp(HP(0.6, 0.7, -0.45), [[0, 0, [60, 60, 66]], [-1, 0, [60, 60, 66]], [-2, 0, [254, 51, 119]]]);
  if (spec.extra === 'lanyard') {
    // Gafete sobre el pecho
    const p = M.W(0.13, 0, SHO - 0.38 + (o.pose === 'sit' ? 0.1 - HIP : 0));
    const [sx, sy] = scr(p);
    const ci = Math.floor(sx - x0), cj = Math.floor(sy - y0), k0 = cj * w + ci;
    if (ci > 1 && cj > 1 && ci < w - 2 && cj < h - 2 && part[k0] === 'torso' && Math.abs(depth[k0] - dot(p, V)) < 0.08) {
      for (let a = -1; a <= 1; a++) for (let b = 0; b <= 2; b++) col[(cj + b) * w + ci + a] = b === 0 ? [254, 51, 119] : WHITE;
    }
  }

  // ---- contornos ----
  const out = new Uint8ClampedArray(n * 4);
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    let c = col[k];
    if (c) {
      // Línea interna: del lado de atrás cuando otra pieza queda bastante más cerca
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = at(i + di, j + dj);
        if (q < 0 || !col[q]) continue;
        if (part[q] !== part[k] && depth[q] > depth[k] + 0.09) { c = mix(shade(c, -0.42), INK, 0.2); break; }
      }
    } else {
      let nb = null;
      for (const [di, dj] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) { const q = at(i + di, j + dj); if (q >= 0 && col[q]) { nb = col[q]; break; } }
      if (!nb) continue;
      c = mix(shade(nb, -0.6), INK, 0.45);
    }
    out[k * 4] = c[0]; out[k * 4 + 1] = c[1]; out[k * 4 + 2] = c[2]; out[k * 4 + 3] = 255;
  }
  // Coronilla y centro de la cabeza (para nombre y globitos)
  let topY = h;
  for (let j = 0; j < h && topY === h; j++) for (let i = 0; i < w; i++) if (out[(j * w + i) * 4 + 3]) { topY = j; break; }
  const [hx, hy] = scr(M.hc);
  return { data: out, w, h, ax: -x0, ay: -y0, head: [Math.round(hx), Math.round(hy)], top: -(y0 + topY) };
}

function toCanvas(r) {
  let cv;
  if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(r.w, r.h);
  else { cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h; }
  const g = cv.getContext('2d');
  const img = g.createImageData(r.w, r.h);
  img.data.set(r.data);
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------- caché ----------
const cache = new Map();
const specCache = new Map();
const SPEC_KEYS = ['skin', 'hair', 'hairStyle', 'eyes', 'mouth', 'facialHair', 'top', 'bottom', 'hat', 'eyewear', 'audio', 'extra', 'eyeColor', 'shirt', 'accent', 'pants', 'shoes', 'hatColor', 'preset'];
function specOf(avatar) {
  const raw = avatar || {};
  const k0 = SPEC_KEYS.map((k) => raw[k] ?? '').join('|');
  let s = specCache.get(k0);
  if (!s) {
    s = normalizeSpec(raw);
    s.key = SPEC_KEYS.map((k) => s[k] ?? '').join('|');
    if (specCache.size > 400) specCache.clear();
    specCache.set(k0, s);
  }
  return s;
}

// Tiempo máximo por cuadro de pantalla para pintar personajes nuevos (el resto espera al siguiente)
export function avatarBudget(ms = 10) { budget = { until: nowMs() + ms, used: 0 }; }

export function frameKey(avatar, o) {
  const s = specOf(avatar);
  const seat = o.pose === 'sit' ? Math.round(Math.max(0, Math.min(1.2, o.seatH ?? 0.6)) * 10) : 0;
  return `${s.key}#${o.pose || 'stand'}|${o.dir}|${o.head ?? o.dir}|${o.frame | 0}|${o.blink ? 1 : 0}|${o.talk ? 1 : 0}|${seat}`;
}

export function avatarFrame(avatar, o, { force = false } = {}) {
  const key = frameKey(avatar, o);
  let e = cache.get(key);
  if (e) { cache.delete(key); cache.set(key, e); return e; }
  if (!force && budget.until && nowMs() > budget.until && budget.used > 0) return null;
  budget.used++;
  const spec = specOf(avatar);
  const seatH = o.pose === 'sit' ? Math.round(Math.max(0, Math.min(1.2, o.seatH ?? 0.6)) * 10) / 10 : 0;
  const r = render(spec, { ...o, seatH });
  e = { cv: toCanvas(r), ax: r.ax, ay: r.ay, w: r.w, h: r.h, head: r.head, top: r.top };
  cache.set(key, e);
  if (cache.size > 900) { let i = 0; for (const k of cache.keys()) { cache.delete(k); if (++i > 200) break; } }
  return e;
}

// Solo para pruebas: los píxeles sin canvas
export function renderAvatarPixels(avatar, o) { return render(specOf(avatar), o); }
