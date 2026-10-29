// Personajes HUB v2 en el navegador: estilo activo (lo elige el admin), caché de cuadros y dibujo nítido.
//
// Cada cuadro (40×64 px del dibujo, ver shared/spriteV2.js) se genera una sola vez por ficha + postura
// y se guarda como un canvas chiquito. En la oficina cada píxel del dibujo mide 2/3 de píxel del mapa
// (así el personaje cabe en la misma caja que el clásico de 32×48) y se pinta a un número entero de
// píxeles de la pantalla, sin suavizar, para que se vea nítido con cualquier zoom y densidad de pantalla.
import { renderFrameV2, frameKeyV2, normalizeSpecV2, V2_W, V2_H, V2_FOOT, V2_WALK, V2_RING } from '../../../shared/spriteV2.js';
import { SPEC_KEYS } from '../../../shared/sprite.js';

import { avatarStyle } from '../../../shared/avatarStyle.js';
export { AVATAR_STYLES, setAvatarStyle, avatarStyle, onAvatarStyle } from '../../../shared/avatarStyle.js';
// Personajes subidos (hojas dibujadas a mano) siempre se ven como siempre
export const usesV2 = (avatar) => avatarStyle() === 'v2' && !avatar?.sprite;

// px del mapa de la oficina por píxel del dibujo
export const OFFICE_ART = 2 / 3;

// ---------- caché ----------
const specKeys = new Map();
function specKey(avatar) {
  const raw = avatar || {};
  const k0 = SPEC_KEYS.map((k) => raw[k] ?? '').join('|');
  let s = specKeys.get(k0);
  if (!s) {
    const n = normalizeSpecV2(raw);
    s = SPEC_KEYS.map((k) => n[k] ?? '').join('|');
    if (specKeys.size > 600) specKeys.clear();
    specKeys.set(k0, s);
  }
  return s;
}
const frames = new Map();
let budgetT = 0, budgetUsed = 0;
const BUDGET_MS = 8; // tiempo máximo por cuadro de animación para generar cuadros nuevos

function toCanvas(fr) {
  let cv;
  if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(fr.width, fr.height);
  else { cv = document.createElement('canvas'); cv.width = fr.width; cv.height = fr.height; }
  const g = cv.getContext('2d');
  const img = g.createImageData(fr.width, fr.height);
  img.data.set(fr.data);
  g.putImageData(img, 0, 0);
  return cv;
}

// Cuadro listo para dibujar: { cv, hands, head, seat, crown, holdArm } (null si se acabó el tiempo de este cuadro)
export function v2Frame(avatar, o, { force = false } = {}) {
  const key = specKey(avatar) + '#' + frameKeyV2(o);
  let e = frames.get(key);
  if (e) { frames.delete(key); frames.set(key, e); return e; }
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - budgetT > 12) { budgetT = now; budgetUsed = 0; }
  if (!force && budgetUsed > BUDGET_MS) return null;
  const t0 = now;
  const fr = renderFrameV2(avatar, o);
  e = { cv: toCanvas(fr), hands: fr.hands, head: fr.head, seat: fr.seat, crown: fr.crown, holdArm: fr.holdArm };
  budgetUsed += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  frames.set(key, e);
  if (frames.size > 4000) { let i = 0; for (const k of frames.keys()) { frames.delete(k); if (++i > 800) break; } }
  return e;
}

// Escala entera de la pantalla para s px de pantalla por píxel del dibujo
// (entero si queda a menos de 15 % del tamaño real; si no, el tamaño exacto sin suavizar para no
// verse mucho más chico o más grande que el mapa)
export function crispScale(s) {
  const k = Math.round(s);
  return k >= 1 && Math.abs(k - s) / s <= 0.15 ? k : s;
}

// Último cuadro dibujado de cada avatar (si el de ahora aún no está listo se reusa)
const lastByKey = new Map();

// Oficina: dibuja al personaje con los pies en (cx, by) del mapa.
//   dir: vista (4 de la oficina u 8 con las diagonales) · walk: cuadro del ciclo (1–8, 0 quieto)
export function drawAvatarV2(ctx, cx, by, avatar, o) {
  const lk = specKey(avatar);
  let fr = v2Frame(avatar, o);
  if (!fr) fr = lastByKey.get(lk) || v2Frame(avatar, { dir: o.dir || 'down' }, { force: true });
  else lastByKey.set(lk, fr);
  if (lastByKey.size > 800) lastByKey.clear();
  const m = ctx.getTransform();
  const s = Math.hypot(m.a, m.b) * OFFICE_ART;
  const ks = crispScale(s);
  const X = m.a * cx + m.c * by + m.e, Y = m.b * cx + m.d * by + m.f;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = ks < 0.95;
  ctx.drawImage(fr.cv, Math.round(X - (V2_W / 2) * ks), Math.round(Y - V2_FOOT * ks), Math.round(V2_W * ks), Math.round(V2_H * ks));
  ctx.restore();
  return fr;
}

// Vista previa (editor, tarjetas): el cuadro escalado a un número entero que quepa en el canvas
export function drawPreviewV2(canvas, avatar, o = {}) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const fr = v2Frame(avatar, { dir: 'down', ...o }, { force: true });
  // recorta el aire de arriba (6 px) para aprovechar el espacio
  const top = 4, h = V2_FOOT + 1 - top;
  const k = Math.max(1, Math.floor(Math.min(canvas.width / V2_W, canvas.height / h)));
  ctx.drawImage(fr.cv, 0, top, V2_W, h, Math.round((canvas.width - V2_W * k) / 2), Math.round((canvas.height - h * k) / 2), V2_W * k, h * k);
}
// Solo la cara (foto de perfil cuando no hay foto)
export function drawFaceV2(canvas, avatar) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const fr = v2Frame(avatar, { dir: 'down' }, { force: true });
  const cx = Math.round(fr.head[0]), cy = Math.round(fr.head[1]);
  ctx.drawImage(fr.cv, cx - 10, cy - 11, 20, 20, 0, 0, canvas.width, canvas.height);
}

// ---------- dirección y paso ----------
// Vista de 8 direcciones a partir de un vector de movimiento (x a la derecha, y hacia abajo)
export function viewFromVec(dx, dy, fallback = 'down') {
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return fallback;
  const a = Math.atan2(dy, dx); // 0 = derecha, π/2 = abajo
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return ['right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up', 'upRight'][i];
}
// Un paso de giro hacia la vista objetivo (pasando por las intermedias); ring = V2_RING o las 4 rectas
const RING4 = ['down', 'left', 'up', 'right'];
export function turnToward(cur, target, eight = true) {
  const ring = eight ? V2_RING : RING4;
  if (!eight) { cur = toFour(cur); target = toFour(target); }
  const a = ring.indexOf(cur), b = ring.indexOf(target);
  if (a < 0 || b < 0 || a === b) return target;
  const n = ring.length;
  const d = ((b - a + n + n / 2) % n) - n / 2;
  return ring[(a + Math.sign(d || 1) + n) % n];
}
export function toFour(v) {
  if (v === 'downLeft' || v === 'downRight') return 'down';
  if (v === 'upLeft' || v === 'upRight') return 'up';
  return v || 'down';
}
// Cuadro del ciclo de caminar a partir de la fase (0…1)
export const walkFrame = (phase) => 1 + (Math.floor(((phase % 1) + 1) % 1 * V2_WALK) % V2_WALK);
export { V2_W, V2_H, V2_FOOT, V2_WALK };
