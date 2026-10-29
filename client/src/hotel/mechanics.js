// Hotel: lado cliente de la línea "Mecánica y Wired" (sin React). Lo usan el motor y la tienda del Hotel:
//   · itemPos(it, t): posición de dibujo de un furni (deslizándose si lo movió un rodillo o el wired)
//   · mechTint(it): tinte para los furnis elegidos al configurar un wired
//   · drawRoomTint(ctx, canvas, items): capa de color del regulador de luz (color + alfa sobre la sala)
//   · mechPick(item): si estás eligiendo furnis para un wired, el clic los marca en vez de abrir la tarjeta
import { FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { vendOf } from '@shared/hotelLines/mecanica.js';

const MECH_INTERACT = new Set(['roller', 'oneway', 'vend', 'wheel', 'love', 'score', 'trophy', 'dimmer', 'wired']);
export const isMechDef = (def) => !!def && (MECH_INTERACT.has(def.interact) || !!vendOf(def));

// Al llegar una actualización con `slide`, el furni se desliza desde donde estaba (mismo tiempo que un paso)
export function mechOnItem(m) {
  if (m?.slide && m.item) m.item._slide = { from: m.slide.from, t0: performance.now(), ms: m.slide.ms || 500 };
}
export function itemPos(it, t) {
  const s = it._slide;
  if (!s) return [it.x, it.y, it.z];
  const k = (t - s.t0) / s.ms;
  if (k >= 1 || k < 0) { it._slide = null; return [it.x, it.y, it.z]; }
  const e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k); // suave al empezar y al llegar
  return [s.from[0] + (it.x - s.from[0]) * e, s.from[1] + (it.y - s.from[1]) * e, s.from[2] + (it.z - s.from[2]) * e];
}

// ---------- Elegir furnis para el wired ----------
export const pick = { on: false, ids: new Set(), forId: null, listeners: new Set() };
const emit = () => { for (const l of pick.listeners) l(); };
export function startPick(forId, ids = []) { pick.on = true; pick.forId = forId; pick.ids = new Set(ids); emit(); }
export function stopPick() { pick.on = false; pick.forId = null; emit(); }
export function mechPick(item) {
  if (!pick.on) return false;
  if (item.id === pick.forId || FURNI_BY_ID[item.type]?.wired) return true;
  if (pick.ids.has(item.id)) pick.ids.delete(item.id);
  else if (pick.ids.size < 10) pick.ids.add(item.id);
  emit();
  return true;
}
export function dropPickId(id) { pick.ids.delete(id); emit(); }
export const mechTint = (it) => (pick.on && pick.ids.has(it.id) ? '#FFCC00' : pick.on && it.id === pick.forId ? '#FE3377' : undefined);

// ---------- Regulador de luz ----------
export function dimmerOf(items) {
  for (const it of items.values()) if (FURNI_BY_ID[it.type]?.interact === 'dimmer' && it.state === 1) return it.extra?.dimmer || { color: '#2b1f4a', alpha: 0.35 };
  return null;
}
// Pinta la sala con el color elegido: multiplicar oscurece y tiñe, y un toque de color encima le da el tono
export function drawRoomTint(ctx, c, items) {
  const d = dimmerOf(items);
  if (!d) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = Math.min(0.85, d.alpha * 1.2);
  ctx.fillStyle = d.color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = d.alpha * 0.35;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}
