// Utilidades compartidas por las decoraciones de temporada (Navidad, Aniversario…)
import { CATALOG, objSize } from '@shared/catalog.js';

export const T = 32;
export const OUTDOOR = new Set(['grass', 'grass2', 'path']);
export const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// Casillas ocupadas por muebles (para no encimar adornos) y si una casilla está libre
export function occupancy(f) {
  const used = new Set(), under = new Set();
  for (const o of f.objects || []) {
    const set = CATALOG[o.type]?.under ? under : used;
    const { w, h } = objSize(o);
    for (let j = Math.floor(o.y); j < Math.ceil(o.y + h); j++) for (let i = Math.floor(o.x); i < Math.ceil(o.x + w); i++) set.add(`${i},${j}`);
  }
  const free = (x, y) => x >= 0 && y >= 0 && x < f.W && y < f.H && f.floor[y]?.[x] && !f.solid[y][x] && !used.has(`${x},${y}`);
  // Libre y sin tapete/logo en el piso
  const bare = (x, y) => free(x, y) && !under.has(`${x},${y}`);
  const nearDesk = (x, y) => f.desks?.some((d) => x >= d.zone.x - 1 && x < d.zone.x + d.zone.w + 1 && y >= d.zone.y - 1 && y < d.zone.y + d.zone.h + 1);
  // Letreros o logos de la marca en el borde de arriba de un área
  const topSigns = (a) => (f.objects || []).filter((o) => CATALOG[o.type]?.brand && !CATALOG[o.type].under && o.y > a.y - 1.5 && o.y < a.y + 1.5 && o.x + objSize(o).w > a.x && o.x < a.x + a.w);
  const signAbove = (a) => topSigns(a).length > 0;
  // Tramos libres de letreros/logos a lo ancho del borde de arriba de un área: [[x0, x1], …]
  const topSpans = (a, min = 3) => {
    const cuts = topSigns(a).map((o) => [o.x - 0.4, o.x + objSize(o).w + 0.4]).sort((p, q) => p[0] - q[0]);
    const out = [];
    let x = a.x + 0.3;
    for (const [c0, c1] of cuts) { if (c0 - x >= min) out.push([x, c0]); x = Math.max(x, c1); }
    if (a.x + a.w - 0.3 - x >= min) out.push([x, a.x + a.w - 0.3]);
    return out;
  };
  return { used, free, bare, nearDesk, signAbove, topSpans, mark: (x, y) => used.add(`${x},${y}`) };
}

// Lugar para la pieza central (árbol, pastel): w×h casillas libres cerca de la recepción,
// de preferencia pegado a una pared (así nadie camina por detrás)
export function findCenterpiece(f, occ, w = 2, h = 2) {
  const rec = (f.objects || []).find((o) => o.type === 'reception');
  const c = rec ? { x: rec.x + objSize(rec).w / 2, y: rec.y } : f.spawn || { x: f.W / 2, y: f.H / 2 };
  const recArea = (f.areas || []).find((a) => c.x >= a.x && c.x < a.x + a.w && c.y >= a.y && c.y < a.y + a.h);
  let best = null;
  for (let y = 1; y < f.H - h; y++) {
    for (let x = 1; x < f.W - w; x++) {
      if (recArea && !(x >= recArea.x && x + w <= recArea.x + recArea.w && y >= recArea.y && y + h <= recArea.y + recArea.h)) continue;
      let ok = true;
      for (let j = 0; j < h && ok; j++) for (let i = -1; i <= w && ok; i++) {
        if (i < 0 || i >= w) continue;
        if (!occ.bare(x + i, y + j)) ok = false;
      }
      if (!ok) continue;
      // Que no estorbe la entrada ni el mostrador (ni quede justo enfrente)
      if (f.spawn && x <= f.spawn.x + 1 && x + w >= f.spawn.x - 1 && Math.abs(f.spawn.y - y) < 4) continue;
      if (rec) {
        const rw = objSize(rec).w, rh = objSize(rec).h;
        if (x + w > rec.x - 1 && x < rec.x + rw + 1 && y + h > rec.y - 1 && y < rec.y + rh + 2) continue;
      }
      const wall = [...Array(w)].every((_, i) => f.walls[y - 1]?.[x + i]);
      const d = Math.hypot(x + w / 2 - c.x, y + h / 2 - c.y) + (wall ? 0 : 12);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (!best) return null;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) occ.mark(best.x + i, best.y + j);
  return { x: best.x, y: best.y, w, h };
}

// Mundo → pantalla (CSS px) con la cámara del mapa
export const toScreen = (v, wx, wy) => ({ x: (wx - v.camX) * v.zoom + v.w / 2, y: (wy - v.camY) * v.zoom + v.h / 2 });

export function bubble(ctx, text, x, y) {
  ctx.save();
  ctx.font = '600 7px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(20,16,30,.85)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 11, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - 4.3);
  ctx.restore();
}

// Guirnalda colgante entre dos puntos (catenaria) con foquitos o banderines
export function sag(x0, x1, y, depth, k) {
  return { x: x0 + (x1 - x0) * k, y: y + depth * 4 * k * (1 - k) };
}
