// Hotel: el personaje es el MISMO de la oficina (shared/sprite.js): misma cara, peinado, ropa y
// proporciones, en 8 direcciones (las 4 de la oficina + 4 vistas de 3/4 generadas con el mismo dibujo).
// Se pinta en pixel-art nítido: cada píxel del dibujo = 2 px del mundo del Hotel a zoom 1
// (el motor lo escala sin suavizar a un número entero de píxeles de pantalla).
//
// avatarFrame(avatar, opts) → { cv, k, ax, ay, w, h, head: [x, y], top, hands, holdArm } | null
//   opts.dir: 0–7 (shared/hotelWalk.js) · opts.head: dirección de la cabeza (±1 de dir)
//   opts.pose: 'stand' | 'walk' | 'sit' | 'lay' | 'wave' | 'dance' | 'sign'
//   opts.frame: cuadro (walk 0–3, wave 0–1) · opts.blink · opts.talk · opts.seatH
//   opts.hand: objeto en la mano · opts.drink: dando un trago · opts.sign: número del cartel
//   opts.pose 'dance' | 'kiss' | 'laugh' | 'jump' (y 'wave'): opts.actT = ms desde que empezó, opts.actN = baile 1–4
//   (ver actions.js: respetan la dirección del cuerpo, así se ven en las 8 direcciones)
//   cv = canvas en píxeles del dibujo; ax, ay, w, h, head, top, hands = en px del mundo (k = 2 px por píxel)
//   (ax, ay) = píxel de los pies (o, acostado, el centro de la casilla de la almohada sobre el colchón)
import { hotelFrame, paintHandItem, normalizeSpec, DIRS8, FRAME_W, FRAME_H, WALK_COLS_LEGACY } from '../../../shared/sprite.js';
import { DIR_VEC } from '../../../shared/hotelWalk.js';
import { actPose } from './actions.js';

export const K = 2; // px del mundo por píxel del dibujo
const FOOT = 47; // fila debajo de los zapatos (los pies "pisan" aquí)
const SEAT = 44; // sentado: fila donde la cadera toca el asiento

// ---------- poses ----------
const OFFICE_DIR = { down: 3, left: 5, right: 1, up: 7 };
// Qué dibujar: vista, paso, postura y desplazamiento (en píxeles del dibujo)
export function spritePose(o) {
  const dir = ((o.dir % 8) + 8) % 8;
  let view = DIRS8[dir];
  let head = o.head != null && o.head !== o.dir ? DIRS8[((o.head % 8) + 8) % 8] : null;
  let step = 0, pose = null, dx = 0, dy = 0;
  switch (o.pose) {
    case 'walk': step = ((o.frame | 0) % 4) + 1; break;
    case 'sit': pose = 'sit'; break;
    case 'wave': pose = o.actT != null ? actPose('wave', 0, o.actT, dir).pose : o.frame & 1 ? 'wave2' : 'wave1'; break;
    case 'sign': pose = 'sign'; break;
    case 'dance': case 'kiss': case 'laugh': case 'jump': {
      const p = actPose(o.pose, o.actN ?? 1, o.actT ?? 0, dir);
      pose = p.pose;
      view = DIRS8[p.dir];
      dx = Math.round(p.dx || 0); dy = Math.round(p.dy || 0);
      head = null;
      break;
    }
    default: break;
  }
  return { view, head, step, pose, dx, dy };
}
export { OFFICE_DIR };

// ---------- píxeles ----------
// Acostado: el cuadro de frente visto "desde arriba" sobre la cama: el largo del cuerpo sigue el eje de la cama
// y el ancho el otro eje (pasos de 2×1 px, como el pixel-art isométrico). Sale en px del mundo (k = 1).
function layPixels(src, dir) {
  const [fx, fy] = DIR_VEC[((dir % 8) + 8) % 8];
  // F = de la cabeza a los pies (hacia donde "mira" quien se acuesta); R = su mano derecha (boca arriba)
  const scr = (a, b) => [Math.sign(a - b) * 2, Math.sign(a + b)];
  let eF = scr(fx, fy), eR = scr(fy, -fx);
  // Direcciones impares (no son de cama): a la diagonal más cercana
  if (!eF[0] || !eF[1]) { eF = [eF[0] || 2, eF[1] || 1]; eR = [-eF[0], eF[1]]; }
  if (!eR[0] || !eR[1]) eR = [-eF[0], eF[1]];
  const SW = FRAME_H, SH = FRAME_W; // X: 0 = coronilla … 47 = pies · Y: 0 = mano izquierda … 31 = derecha
  const corners = [[0, 0], [SW, 0], [0, SH], [SW, SH]].map(([X, Y]) => [X * eF[0] + Y * eR[0], X * eF[1] + Y * eR[1]]);
  const x0 = Math.floor(Math.min(...corners.map((c) => c[0]))), x1 = Math.ceil(Math.max(...corners.map((c) => c[0])));
  const y0 = Math.floor(Math.min(...corners.map((c) => c[1]))), y1 = Math.ceil(Math.max(...corners.map((c) => c[1])));
  const W = x1 - x0, H = y1 - y0;
  const det = eF[0] * eR[1] - eR[0] * eF[1];
  const out = new Uint8ClampedArray(W * H * 4);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const px = u + x0 + 0.5, py = v + y0 + 0.5;
    const X = Math.floor((px * eR[1] - py * eR[0]) / det), Y = Math.floor((eF[0] * py - eF[1] * px) / det);
    if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue;
    const x = SH - 1 - Y, y = X; // píxel del cuadro de pie
    const s = (y * FRAME_W + x) * 4;
    if (!src[s + 3]) continue;
    out.set(src.subarray(s, s + 4), (v * W + u) * 4);
  }
  // Centro de la cabeza (de pie: x 16, y 21.5 → X 21.5, Y 16)
  const hx = 21.5 * eF[0] + 16 * eR[0] - x0, hy = 21.5 * eF[1] + 16 * eR[1] - y0;
  // La almohada: la cabeza queda un poco hacia la cabecera, y el cuerpo encima del colchón
  const tf = [Math.sign(eF[0]) * 32, Math.sign(eF[1]) * 16];
  const ax = hx + 0.12 * tf[0], ay = hy + 0.12 * tf[1] + 5;
  return { data: out, w: W, h: H, ax, ay, head: [hx, hy] };
}

// Hojas subidas (96×192 de la oficina): se usa la dirección más cercana que tenga
const sheets = new Map();
function sheetPixels(id) {
  if (sheets.has(id)) return sheets.get(id);
  sheets.set(id, null);
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      sheets.set(id, { data: g.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height });
      cache.clear();
    } catch { /* sin hoja */ }
  };
  img.src = `/api/characters/${encodeURIComponent(id)}.png`;
  return null;
}
const SHEET_ROW = { down: 0, left: 1, right: 2, up: 3 };
function customFrame(sheet, p, o) {
  // 3/4 → la vista de la oficina más cercana: de frente quieto, de lado caminando, de espaldas
  const map = { downLeft: o.pose === 'walk' ? 'left' : 'down', downRight: o.pose === 'walk' ? 'right' : 'down', upLeft: 'up', upRight: 'up' };
  const view = map[p.view] || p.view;
  const cols = Math.max(1, Math.floor(sheet.w / FRAME_W));
  const col = Math.min(cols - 1, cols >= 5 ? [0, 1, 3, 2, 4][p.step] : WALK_COLS_LEGACY[p.step]);
  const row = SHEET_ROW[view] ?? 0;
  const out = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
  const sit = o.pose === 'sit';
  for (let y = 0; y < FRAME_H; y++) {
    if (sit && y >= 40) break; // sentado: sin piernas y más abajo, como en la oficina
    const ty = sit ? y + 4 : y;
    if (ty >= FRAME_H) continue;
    for (let x = 0; x < FRAME_W; x++) {
      const s = ((row * FRAME_H + y) * sheet.w + col * FRAME_W + x) * 4;
      if (s + 3 >= sheet.data.length) continue;
      out.set(sheet.data.subarray(s, s + 4), (ty * FRAME_W + x) * 4);
    }
  }
  const hands = {};
  if (o.hand && view !== 'up') {
    const hx = view === 'left' ? 9 : view === 'right' ? 21 : 21, hy = sit ? 39 : 36;
    paintHandItem((x, y, c) => { if (x >= 0 && y >= 0 && x < FRAME_W && y < FRAME_H) { const i = (y * FRAME_W + x) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255; } }, o.hand, hx, hy, 2, 2);
    hands.b = [hx + 1, hy + 1];
  }
  return { data: out, hands, holdArm: o.hand ? 'b' : null };
}

function build(avatar, o) {
  const p = spritePose(o);
  const custom = avatar?.sprite ? sheetPixels(avatar.sprite) : null;
  if (avatar?.sprite && !custom && typeof Image !== 'undefined') return null; // aún cargando
  let fr;
  const lay = o.pose === 'lay';
  if (custom) fr = customFrame(custom, lay ? { ...p, view: 'down', step: 0 } : p, lay ? { ...o, pose: 'stand' } : o);
  else {
    fr = hotelFrame(avatar || {}, {
      dir: lay ? 'down' : p.view, head: lay ? null : p.head, step: lay ? 0 : p.step, pose: lay ? null : p.pose,
      hold: lay ? null : o.hand, drink: !!o.drink, sign: o.pose === 'sign' ? (o.sign ?? 0) : null,
      blink: !!o.blink, talk: !!o.talk,
    });
  }
  if (lay) {
    const L = layPixels(fr.data, o.dir);
    return { data: L.data, w: L.w, h: L.h, ax: L.ax, ay: L.ay, head: [L.head[0] - L.ax, L.head[1] - L.ay], hands: {}, holdArm: null, k: 1 };
  }
  const ax = 16 - p.dx, ay = (o.pose === 'sit' ? SEAT : FOOT) - p.dy;
  const rel = {};
  for (const [k, v] of Object.entries(fr.hands || {})) rel[k] = [v[0] - ax, v[1] - ay];
  return { data: fr.data, w: FRAME_W, h: FRAME_H, ax, ay, head: [16 - ax, 21.5 - ay], hands: rel, holdArm: fr.holdArm };
}

function crownRow(r) {
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) if (r.data[(j * r.w + i) * 4 + 3]) return j;
  return 0;
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
const SPEC_KEYS = ['skin', 'hair', 'hairStyle', 'eyes', 'mouth', 'facialHair', 'top', 'bottom', 'hat', 'eyewear', 'audio', 'extra', 'eyeColor', 'shirt', 'accent', 'pants', 'shoes', 'hatColor', 'preset', 'sprite'];
function specKey(avatar) {
  const raw = avatar || {};
  const k0 = SPEC_KEYS.map((k) => raw[k] ?? '').join('|');
  let s = specCache.get(k0);
  if (!s) {
    const n = normalizeSpec(raw);
    s = SPEC_KEYS.map((k) => n[k] ?? '').join('|');
    if (specCache.size > 400) specCache.clear();
    specCache.set(k0, s);
  }
  return s;
}

// Compatibilidad con el motor: ya no hace falta repartir tiempo (cada cuadro cuesta muy poco)
export function avatarBudget() {}

export function frameKey(avatar, o) {
  const p = spritePose(o);
  const lay = o.pose === 'lay';
  return [specKey(avatar), o.pose || 'stand', lay ? o.dir : p.view, p.head || '', p.step, p.pose || '', p.dx, p.dy,
    o.blink ? 1 : 0, o.talk ? 1 : 0, o.hand || '', o.drink ? 1 : 0, o.pose === 'sign' ? o.sign ?? 0 : ''].join('#');
}

export function avatarFrame(avatar, o) {
  const key = frameKey(avatar, o);
  let e = cache.get(key);
  if (e) { cache.delete(key); cache.set(key, e); return e; }
  const r = build(avatar, o);
  if (!r) return null;
  const k = r.k || K;
  const top = (r.ay - crownRow(r)) * k;
  e = {
    cv: toCanvas(r), k, sw: r.w, sh: r.h, sax: r.ax, say: r.ay,
    ax: r.ax * k, ay: r.ay * k, w: r.w * k, h: r.h * k, top,
    head: [r.head[0] * k, r.head[1] * k],
    hands: Object.fromEntries(Object.entries(r.hands).map(([kk, v]) => [kk, [v[0] * k, v[1] * k]])),
    holdArm: r.holdArm,
  };
  cache.set(key, e);
  if (cache.size > 1500) { let i = 0; for (const k of cache.keys()) { cache.delete(k); if (++i > 300) break; } }
  return e;
}

// Pruebas: los píxeles ya escalados ×K (sin canvas), con el ancla y la coronilla en px del mundo
export function renderAvatarPixels(avatar, o) {
  const r = build(avatar, o);
  const w = Math.round(r.w * K), h = Math.round(r.h * K);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((Math.floor(y / K)) * r.w + Math.floor(x / K)) * 4;
    data.set(r.data.subarray(s, s + 4), (y * w + x) * 4);
  }
  return { data, w, h, ax: Math.round(r.ax * K), ay: Math.round(r.ay * K), top: (r.ay - crownRow(r)) * K, head: [r.head[0] * K, r.head[1] * K], hands: r.hands };
}
