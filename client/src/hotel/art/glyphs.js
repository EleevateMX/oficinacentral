// Letras vectoriales (solo las que usamos) y el emblema hexagonal genérico, dibujados en plano.
import { PINK, YELLOW, rgba } from './iso.js';

// Rejilla de 4 × 6: cada letra es una lista de trazos (polilíneas)
const GLYPHS = {
  G: [[[4, 1.2], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.2], [2.2, 3.2]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  A: [[[0, 6], [0, 1.6], [1.4, 0], [2.6, 0], [4, 1.6], [4, 6]], [[0, 3.6], [4, 3.6]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  B: [[[0, 3], [0, 0], [3, 0], [4, 0.8], [4, 2.2], [3, 3], [0, 3], [0, 6], [3.2, 6], [4, 5.2], [4, 3.8], [3.2, 3]]],
  R: [[[0, 6], [0, 0], [3, 0], [4, 0.9], [4, 2.1], [3, 3], [0, 3]], [[2, 3], [4, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [2.6, 6], [4, 4.6], [4, 1.4], [2.6, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  I: [[[2, 0], [2, 6]], [[1, 0], [3, 0]], [[1, 6], [3, 6]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  ' ': [],
};
const ADV = 5.4; // avance por letra (en unidades de la rejilla)

export const wordWidth = (text, h) => (h / 6) * (text.length * ADV - 1.4);

// Traza una palabra; (x, y) = esquina superior izquierda; h = alto de letra
export function wordPath(ctx, text, x, y, h) {
  const k = h / 6;
  ctx.beginPath();
  [...text].forEach((ch, i) => {
    for (const line of GLYPHS[ch] || []) {
      line.forEach(([a, b], j) => {
        const X = x + (i * ADV + a) * k, Y = y + b * k;
        if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
    }
  });
}
export function drawWord(ctx, text, x, y, h, color, lw = Math.max(1, h / 5)) {
  wordPath(ctx, text, x, y, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}
// Palabra de neón: halo, tubo y núcleo claro (o tubo apagado)
export function neonWord(ctx, text, x, y, h, color, on, core = '#fff4f8') {
  wordPath(ctx, text, x, y, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  neonStroke(ctx, color, on, h / 5, core);
}
export function neonStroke(ctx, color, on, lw, core = '#fff4f8') {
  if (on) {
    ctx.strokeStyle = rgba(color, 0.18); ctx.lineWidth = lw * 4.2; ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.4); ctx.lineWidth = lw * 2.3; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = lw * 1.25; ctx.stroke();
    ctx.strokeStyle = core; ctx.lineWidth = Math.max(0.5, lw * 0.45); ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(20,16,24,0.55)'; ctx.lineWidth = lw * 1.5; ctx.stroke();
    ctx.strokeStyle = '#6a5f68'; ctx.lineWidth = lw * 0.95; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = Math.max(0.4, lw * 0.3); ctx.stroke();
  }
}

export function hexPts(cx, cy, r) {
  const p = [];
  for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 3; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return p;
}
export function hexPath(ctx, cx, cy, r) {
  const p = hexPts(cx, cy, r);
  ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
}
// Emblema genérico: hexágono de dos tonos (arriba `left`, abajo `right`) con un hexágono interior de `top`.
// Es un adorno abstracto (no copia ningún logo).
//   o.ring: aro exterior · o.outline: contorno · o.inner === false: sin el hexágono interior
export function hexLogo(ctx, cx, cy, r, o = {}) {
  const top = o.top || YELLOW, left = o.left || PINK, right = o.right || '#b8195a';
  const p = hexPts(cx, cy, r), k = r * 0.866;
  const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
  if (o.ring) { hexPath(ctx, cx, cy, r * 1.22); ctx.strokeStyle = o.ring; ctx.lineWidth = Math.max(1, r * 0.16); ctx.lineJoin = 'round'; ctx.stroke(); }
  poly(p, left);
  poly([[cx + k, cy], p[2], p[3], p[4], [cx - k, cy]], right);
  if (o.inner !== false) {
    poly(hexPts(cx, cy, r * 0.5), top);
    hexPath(ctx, cx, cy, r * 0.5); ctx.strokeStyle = o.edge || 'rgba(20,20,20,0.35)'; ctx.lineWidth = Math.max(0.4, r * 0.07); ctx.stroke();
  } else {
    ctx.fillStyle = top; ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, r * 0.28), 0, Math.PI * 2); ctx.fill();
  }
  if (o.outline) { hexPath(ctx, cx, cy, r); ctx.strokeStyle = o.outline; ctx.lineWidth = Math.max(0.6, r * 0.1); ctx.stroke(); }
}
export function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
