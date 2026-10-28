// Dibujo de furnis del Hotel (contrato con el motor isométrico). Arte 100% por código (canvas 2D).
//
// drawFurni(ctx, def, item, opts)
//   El motor ya trasladó el contexto: (0, 0) es el vértice NORTE de la casilla (item.x, item.y)
//   a la altura item.z (ver shared/hotel.js toScreen). Ejes en pantalla por casilla:
//     +x → ( +TILE_W/2, +TILE_H/2 ) = (+32, +16)   +y → ( -32, +16 )   +z (1 unidad) → (0, -32)
//   La huella ya rotada es footprint(def, item.rot). Dibuja TODO el furni (sombra incluida).
//   item: { type, rot, state, color, x, y, z, extra }
//   opts: { t (ms, para animaciones), hover (contorno claro), ghost (semitransparente, vista previa),
//           tint ('#rrggbb' opcional: tiñe el furni, p. ej. rojo/verde al colocar) }
//
// furniBounds(def, rot) → { x, y, w, h } rectángulo (relativo al origen) que encierra TODO lo que se dibuja
//   (cualquier estado; incluye brillos). Sirve para clics y orden.
//
// drawWallItem(ctx, def, item, opts)
//   Se dibuja PLANO: (0, 0) es la esquina inferior izquierda del furni sobre la pared;
//   x crece a lo largo de la pared (32 px por casilla, ancho = def.w * 32) y y negativa hacia arriba.
//   El motor aplica la inclinación de la pared izquierda (rot 2) o derecha (rot 4).
// wallBounds(def) → { x, y, w, h } en ese mismo plano.
//
// drawFurniIcon(canvas, def, color) → miniatura centrada y escalada (rot = def.rots[0], estado "encendido").
//
// ORIENTACIÓN (hacia dónde mira el FRENTE de un furni: asiento de la silla, pie de la cama, pantalla de la tele):
//   rot 0 → +y  (abajo-izquierda en pantalla)   respaldo/cabecera del lado −y (arriba-derecha)
//   rot 2 → −x  (arriba-izquierda)              respaldo del lado +x
//   rot 4 → −y  (arriba-derecha)                respaldo del lado +y (se ve por detrás)
//   rot 6 → +x  (abajo-derecha)                 respaldo del lado −x
//   Coincide con ROT_DIR de shared/hotel.js ({0:'down', 2:'left', 4:'up', 6:'right'}): el cuadro del sprite
//   corresponde a girar la diagonal 45° (abajo-izq → 'down', arriba-izq → 'left', arriba-der → 'up', abajo-der → 'right').
//   rotFacing(rot) → { dx, dy } = casilla hacia la que mira el frente (para orientar a quien se sienta).
//   Girar +2 = 90° en el mismo sentido siempre (0 → 2 → 4 → 6 → 0).
//
// ESTADOS (item.state):
//   lámparas, neón, letrero, tele, PC, maquinita, rocola: 0 apagado · 1 encendido
//   refri: 0 cerrado · 1 puerta abierta        dado: 0 rodando (animado) · 1–6 cara de arriba
//   teletransportador: 0 en espera · 1 activo   rejita: 0 cerrada · 1 abierta
import { Scene, BoundsRecorder, shade } from './art/iso.js';
import { FLOOR, DEFAULT_COLOR } from './art/floor.js';
import { WALL, WALL_PERIOD, wallFallback } from './art/wall.js';
import { LINE_FLOOR, LINE_WALL, LINE_PERIOD, LINE_DEFAULT_COLOR } from './art/lines/index.js';

const normRot = (r) => (r === 2 || r === 4 || r === 6 ? r : 0);

const FACING = { 0: { dx: 0, dy: 1 }, 2: { dx: -1, dy: 0 }, 4: { dx: 0, dy: -1 }, 6: { dx: 1, dy: 0 } };
export function rotFacing(rot) { return { ...FACING[normRot(rot)] }; }

function colorOf(def, item) {
  const c = item && item.color;
  if (typeof c === 'string' && /^#[0-9a-f]{3,6}$/i.test(c)) return c;
  return def.colors?.[0] || DEFAULT_COLOR[def.id] || LINE_DEFAULT_COLOR[def.id] || '#9aa3ad';
}
function stateOf(def, item) {
  const n = Math.max(1, def.states || 1);
  const s = Math.floor(Number(item?.state) || 0);
  return Math.max(0, Math.min(n - 1, s));
}
// Periodo de animación (ms) o 0 si el furni es estático en ese estado
function periodOf(def, st) {
  switch (def.id) {
    case 'tv': case 'arcade': return st === 1 ? 100 : 0;
    case 'jukebox': return st === 1 ? 140 : 0;
    case 'lamp_lava': return st === 1 ? 80 : 0;
    case 'desk_pc': return st === 1 ? 500 : 0;
    case 'teleport': return st === 1 ? 70 : 0;
    case 'dice': return st === 0 ? 90 : 0;
    default: return LINE_PERIOD[def.id] ? LINE_PERIOD[def.id](st) || 0 : 0;
  }
}
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function renderFloor(ctx, def, rot, c, st, t) {
  const s = new Scene(def.w || 1, def.l || 1, rot);
  (FLOOR[def.id] || LINE_FLOOR[def.id] || FLOOR._fallback)(s, { c, st, t, def });
  s.draw(ctx);
}
function renderWall(ctx, def, c, st, now) {
  (WALL[def.id] || LINE_WALL[def.id] || wallFallback)(ctx, { c, st, def, now });
}

// ---------- Límites ----------
const boundsCache = new Map();
function measure(fn) {
  const r = new BoundsRecorder();
  fn(r);
  const b = r.result() || [0, 0, 1, 1];
  const x = Math.floor(b[0]) - 1, y = Math.floor(b[1]) - 1;
  return { x, y, w: Math.ceil(b[2]) + 1 - x, h: Math.ceil(b[3]) + 1 - y };
}
export function furniBounds(def, rot) {
  rot = normRot(rot);
  const key = def.id + '|' + rot;
  let b = boundsCache.get(key);
  if (b) return { ...b };
  b = measure((r) => {
    const n = Math.max(1, def.states || 1);
    for (let st = 0; st < n; st++) {
      const p = periodOf(def, st);
      const frames = p ? 12 : 1;
      for (let f = 0; f < frames; f++) renderFloor(r, def, rot, colorOf(def, {}), st, f * (p || 1) * 7);
    }
  });
  boundsCache.set(key, b);
  return { ...b };
}
export function wallBounds(def) {
  const key = 'wall|' + def.id;
  let b = boundsCache.get(key);
  if (b) return { ...b };
  b = measure((r) => {
    const n = Math.max(1, def.states || 1);
    for (let st = 0; st < n; st++) renderWall(r, def, colorOf(def, {}), st, Date.UTC(2026, 0, 1, 12));
  });
  boundsCache.set(key, b);
  return { ...b };
}

// ---------- Caché de sprites ----------
const canMake = typeof OffscreenCanvas !== 'undefined' || (typeof document !== 'undefined' && !!document.createElement);
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
const sprites = new Map(); // estáticos: clave → sprite
const live = new Map(); // animados: clave → { frame, sprite }
function scaleOf(ctx) {
  try {
    const m = ctx.getTransform();
    const s = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
    return Math.min(4, Math.max(1, Math.ceil(s * 2 - 0.05) / 2));
  } catch { return 1; }
}
function buildSprite(b, sc, draw) {
  const W = Math.max(1, Math.ceil((b.w + 4) * sc)), H = Math.max(1, Math.ceil((b.h + 4) * sc));
  const cv = makeCanvas(W, H), g = cv.getContext('2d');
  g.setTransform(sc, 0, 0, sc, (2 - b.x) * sc, (2 - b.y) * sc);
  draw(g);
  return { cv, x: b.x - 2, y: b.y - 2, w: W / sc, h: H / sc, sc, outline: null, tints: null };
}
function remember(map, key, val, cap) {
  if (map.size >= cap) { let i = 0; for (const k of map.keys()) { map.delete(k); if (++i > cap / 4) break; } }
  map.set(key, val);
}
function outlineOfSprite(spr) {
  if (spr.outline) return spr.outline;
  const W = spr.cv.width, H = spr.cv.height, cv = makeCanvas(W, H), g = cv.getContext('2d');
  const d = Math.max(1, Math.round(spr.sc * 1.2));
  for (const [ox, oy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, d], [-d, d], [d, -d]]) g.drawImage(spr.cv, ox, oy);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(0, 0, W, H);
  spr.outline = cv;
  return cv;
}
function tintOfSprite(spr, tint) {
  spr.tints = spr.tints || new Map();
  let cv = spr.tints.get(tint);
  if (cv) return cv;
  const W = spr.cv.width, H = spr.cv.height;
  cv = makeCanvas(W, H); const g = cv.getContext('2d');
  g.drawImage(spr.cv, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.5; g.fillStyle = tint; g.fillRect(0, 0, W, H);
  spr.tints.set(tint, cv);
  return cv;
}
function blit(ctx, spr, opts) {
  ctx.save();
  if (opts.ghost) ctx.globalAlpha *= 0.55;
  if (opts.hover) ctx.drawImage(outlineOfSprite(spr), spr.x, spr.y, spr.w, spr.h);
  const tint = typeof opts.tint === 'string' && opts.tint ? opts.tint : null;
  ctx.drawImage(tint ? tintOfSprite(spr, tint) : spr.cv, spr.x, spr.y, spr.w, spr.h);
  if (opts.hover) { ctx.globalAlpha *= 0.12; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(spr.cv, spr.x, spr.y, spr.w, spr.h); }
  ctx.restore();
}
function getSprite(key, frame, bounds, sc, draw) {
  const k = key + '|' + sc;
  if (frame === null) {
    let spr = sprites.get(k);
    if (!spr) { spr = buildSprite(bounds, sc, draw); remember(sprites, k, spr, 700); }
    return spr;
  }
  let e = live.get(k);
  if (!e || e.frame !== frame) { e = { frame, spr: buildSprite(bounds, sc, draw) }; remember(live, k, e, 120); }
  return e.spr;
}

// ---------- API ----------
export function drawFurni(ctx, def, item = {}, opts = {}) {
  if (!def) return;
  if (def.kind === 'wall') return drawWallItem(ctx, def, item, opts);
  const rot = normRot(item.rot), c = colorOf(def, item), st = stateOf(def, item);
  const p = periodOf(def, st);
  const t = p ? Math.floor((opts.t ?? nowMs()) / p) * p : 0;
  if (!canMake || opts.direct) {
    ctx.save();
    if (opts.ghost) ctx.globalAlpha *= 0.55;
    renderFloor(ctx, def, rot, c, st, t);
    ctx.restore();
    return;
  }
  const b = furniBounds(def, rot), sc = scaleOf(ctx);
  const spr = getSprite(`f|${def.id}|${rot}|${c}|${st}`, p ? t : null, b, sc, (g) => renderFloor(g, def, rot, c, st, t));
  blit(ctx, spr, opts);
}

export function drawWallItem(ctx, def, item = {}, opts = {}) {
  if (!def) return;
  const c = colorOf(def, item), st = stateOf(def, item);
  const p = WALL_PERIOD[def.id] || LINE_PERIOD[def.id]?.(st) || 0;
  const now = Date.now(), frame = p ? Math.floor(now / p) : null;
  if (!canMake || opts.direct) {
    ctx.save();
    if (opts.ghost) ctx.globalAlpha *= 0.55;
    renderWall(ctx, def, c, st, now);
    ctx.restore();
    return;
  }
  const b = wallBounds(def), sc = scaleOf(ctx);
  const spr = getSprite(`w|${def.id}|${c}|${st}`, frame, b, sc, (g) => renderWall(g, def, c, st, now));
  blit(ctx, spr, opts);
}

function iconState(def) {
  if (def.interact === 'dice') return 6;
  if (def.interact === 'gate' || def.id === 'fridge') return 0;
  return def.states > 1 ? 1 : 0;
}
export function drawFurniIcon(canvas, def, color) {
  if (!canvas || !def) return;
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const wall = def.kind === 'wall', rot = normRot(def.rots?.[0]);
  const b = wall ? wallBounds(def) : furniBounds(def, rot);
  const pad = Math.max(2, Math.round(Math.min(W, H) * 0.06));
  const sc = Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h, 2.5);
  g.setTransform(sc, 0, 0, sc, W / 2 - (b.x + b.w / 2) * sc, H / 2 - (b.y + b.h / 2) * sc);
  g.imageSmoothingEnabled = true;
  const item = { rot, state: iconState(def), color: color || undefined };
  const c = colorOf(def, item), st = stateOf(def, item);
  if (wall) renderWall(g, def, c, st, Date.now());
  else renderFloor(g, def, rot, c, st, 0);
  g.restore();
}

// Caja isométrica simple (se conserva por compatibilidad con la versión provisional)
export function isoBox(ctx, w, l, h, color) {
  const X = (x, y, z) => [(x - y) * 32, (x + y) * 16 - z * 32];
  const poly = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill(); };
  poly([X(0, l, 0), X(w, l, 0), X(w, l, h), X(0, l, h)], shade(color, -0.2));
  poly([X(w, 0, 0), X(w, l, 0), X(w, l, h), X(w, 0, h)], shade(color, -0.35));
  poly([X(0, 0, h), X(w, 0, h), X(w, l, h), X(0, l, h)], color);
}
