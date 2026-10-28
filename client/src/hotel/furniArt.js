// Dibujo de furnis del Hotel (contrato con el motor isométrico).
//
// drawFurni(ctx, def, item, opts)
//   El motor ya trasladó el contexto: (0, 0) es el vértice NORTE de la casilla (item.x, item.y)
//   a la altura item.z (ver shared/hotel.js toScreen). Ejes en pantalla por casilla:
//     +x → ( +TILE_W/2, +TILE_H/2 ) = (+32, +16)   +y → ( -32, +16 )   +z (1 unidad) → (0, -32)
//   La huella ya rotada es footprint(def, item.rot). Dibuja TODO el furni (sombra incluida).
//   item: { type, rot, state, color, x, y, z, extra }   opts: { t (ms), hover, ghost (vista previa al colocar) }
//
// furniBounds(def, rot) → { x, y, w, h } rectángulo (relativo al origen) para detectar clics.
//
// drawWallItem(ctx, def, item, opts)
//   Se dibuja PLANO: (0, 0) es la esquina inferior izquierda del furni sobre la pared;
//   x crece a lo largo de la pared (32 px por casilla, ancho = def.w * 32) y y negativa hacia arriba.
//   El motor aplica la inclinación de la pared izquierda (rot 2) o derecha (rot 4).
// wallBounds(def) → { x, y, w, h } en ese mismo plano.
//
// Versión provisional: cajas simples. La reemplaza el dibujo final.
import { footprint } from '@shared/hotelCatalog.js';

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function isoBox(ctx, w, l, h, color) {
  const X = (x, y, z) => [(x - y) * 32, (x + y) * 16 - z * 32];
  const poly = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill(); };
  poly([X(0, l, 0), X(w, l, 0), X(w, l, h), X(0, l, h)], shade(color, -0.2));
  poly([X(w, 0, 0), X(w, l, 0), X(w, l, h), X(w, 0, h)], shade(color, -0.35));
  poly([X(0, 0, h), X(w, 0, h), X(w, l, h), X(0, l, h)], color);
}

export function drawFurni(ctx, def, item) {
  const { w, l } = footprint(def, item.rot);
  isoBox(ctx, w, l, Math.max(0.05, def.h), item.color || def.colors?.[0] || '#9aa3ad');
}

export function furniBounds(def, rot) {
  const { w, l } = footprint(def, rot);
  const h = Math.max(0.05, def.h) * 32;
  return { x: -l * 32, y: -h, w: (w + l) * 32, h: (w + l) * 16 + h };
}

export function drawWallItem(ctx, def, item) {
  ctx.fillStyle = item.color || def.colors?.[0] || '#FE3377';
  ctx.fillRect(4, -60, def.w * 32 - 8, 40);
}

export function wallBounds(def) {
  return { x: 4, y: -60, w: def.w * 32 - 8, h: 40 };
}
