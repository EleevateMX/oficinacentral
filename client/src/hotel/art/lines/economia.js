// Dibujo de la línea "Economía HUB" (monedas canjeables y caja de regalo). Mismo formato que art/floor.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void } · period · defaultColor
import { PINK, YELLOW, shade, rgba, lum } from '../iso.js';
import { drawWord, wordWidth, hexLogo } from '../glyphs.js';

const TAU = Math.PI * 2;
const GOLD = '#f2b916', GOLD_L = '#ffe27a', GOLD_D = '#a8740a', GOLD_DD = '#5e3d00';
const WOOD = '#7a4a2b';

const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const sheen = (ctx, w, h, a = 0.16) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.45, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
function sparkle(ctx, x, y, r, a = 1) {
  if (a <= 0.02) return;
  ctx.fillStyle = rgba('#fffbe6', a); ctx.beginPath();
  for (let k = 0; k < 8; k++) { const q = k % 2 ? r * 0.22 : r; const an = (k / 8) * TAU - Math.PI / 2; ctx.lineTo(x + q * Math.cos(an), y + q * Math.sin(an)); }
  ctx.closePath(); ctx.fill();
}
// Destellos que aparecen y desaparecen (t en ms)
function twinkle(s, pts, t, r = 3) {
  s.over((ctx) => {
    pts.forEach(([u, v, z], i) => {
      const ph = ((t / 1400) + i * 0.37) % 1;
      const [x, y] = s.P(u, v, z);
      sparkle(ctx, x, y, r * (0.5 + Math.sin(ph * Math.PI) * 0.6), Math.sin(ph * Math.PI) * 0.95);
    });
  });
}
// Moneda acostada: canto dorado y cara con el logo
function coin(s, u, v, z, r, th = 0.06) {
  s.cyl('z', u, v, r, r, z, z + th, GOLD, { seg: 22, outline: GOLD_DD, faces: { top: GOLD_L, side: GOLD_D } });
  s.custom([u - r, v - r, z + th, u + r, v + r, z + th + 0.001], (ctx) => {
    const [x, y] = s.P(u, v, z + th);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5);
    const R = r * 45;
    ctx.strokeStyle = rgba(GOLD_DD, 0.55); ctx.lineWidth = Math.max(0.6, R * 0.08); ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, TAU); ctx.stroke();
    hexLogo(ctx, 0, 0, R * 0.45, { top: '#fff3b0', left: GOLD, right: GOLD_D, edge: rgba(GOLD_DD, 0.6) });
    ctx.restore();
  });
}

// ---------- Moneda HUB ----------
function economia_moneda(s, { t }) {
  s.shadowEllipse(0.5, 0.5, 0.34, 0.34, 0.22);
  coin(s, 0.5, 0.5, 0, 0.32, 0.12);
  twinkle(s, [[0.32, 0.4, 0.2], [0.66, 0.62, 0.16]], t, 3);
}

// ---------- Pila de monedas ----------
function economia_monedas(s, { t }) {
  s.shadowEllipse(0.5, 0.5, 0.4, 0.36, 0.22);
  // dos pilitas y una moneda suelta
  for (let i = 0; i < 4; i++) coin(s, 0.36 + (i % 2) * 0.01, 0.4, i * 0.07, 0.2, 0.07);
  for (let i = 0; i < 6; i++) coin(s, 0.62 - (i % 2) * 0.01, 0.58, i * 0.066, 0.2, 0.066);
  coin(s, 0.3, 0.74, 0, 0.14, 0.05);
  twinkle(s, [[0.36, 0.4, 0.4], [0.62, 0.58, 0.5], [0.78, 0.4, 0.2]], t, 3.2);
}

// ---------- Lingote HUB ----------
function bar(s, u0, u1, v, z, wv = 0.36, hz = 0.3) {
  const a = v - wv / 2, b = v + wv / 2, k = wv * 0.22;
  const top = (x, w, h) => {
    fr(x, 0, 0, w, h, GOLD_L);
    const hh = Math.min(h * 0.55, 6), ww = wordWidth('HUB', hh);
    drawWord(x, 'HUB', (w - ww) / 2, (h - hh) / 2, hh, GOLD_D, Math.max(0.7, hh / 5));
    sheen(x, w, h, 0.3);
  };
  s.prism('u', [[a, z], [b, z], [b - k, z + hz], [a + k, z + hz]], u0, u1, GOLD, {
    outline: GOLD_DD, faces: { e2: GOLD_L, left: GOLD_D, right: GOLD_D }, decal: { e2: top, e1: (x, w, h) => sheen(x, w, h, 0.25), e3: (x, w, h) => sheen(x, w, h, 0.25) },
  });
}
function economia_lingote(s, { t }) {
  s.shadowRect(0.12, 0.3, 0.88, 0.7, 0.24);
  bar(s, 0.12, 0.88, 0.5, 0, 0.4, 0.3);
  twinkle(s, [[0.25, 0.4, 0.34], [0.75, 0.6, 0.3]], t, 3.4);
}

// ---------- Cofre de lingotes ----------
function economia_cofre(s, { t }) {
  s.shadowRect(0.08, 0.18, 0.92, 0.84, 0.26);
  const band = (x, w, h) => {
    fr(x, w * 0.16, 0, 2.2, h, GOLD); fr(x, w * 0.84 - 2.2, 0, 2.2, h, GOLD);
    fr(x, 0, 0, w, 1.6, GOLD_D); fr(x, 0, h - 1.6, w, 1.6, GOLD_D);
    for (let i = 3; i < w - 2; i += 6) fr(x, i, h * 0.5, 2.5, 0.6, rgba('#000000', 0.18));
    sheen(x, w, h, 0.12);
  };
  const front = (x, w, h) => {
    band(x, w, h);
    // cerradura
    fr(x, w / 2 - 3.5, h * 0.12, 7, 8, GOLD); fr(x, w / 2 - 3.5, h * 0.12, 7, 1.2, GOLD_L);
    dotc(x, w / 2, h * 0.12 + 3.6, 1.2, GOLD_DD); fr(x, w / 2 - 0.5, h * 0.12 + 4, 1, 2.6, GOLD_DD);
  };
  s.box(0.1, 0.22, 0, 0.9, 0.8, 0.46, WOOD, { outline: shade(WOOD, -0.6), decal: { front, back: band, left: band, right: band } });
  // tapa abombada
  const strap = (x, w, h) => { fr(x, w * 0.16, 0, 2.2, h, GOLD); fr(x, w * 0.84 - 2.2, 0, 2.2, h, GOLD); sheen(x, w, h, 0.14); };
  s.prism('u', [[0.22, 0.46], [0.8, 0.46], [0.8, 0.6], [0.7, 0.71], [0.51, 0.75], [0.32, 0.71], [0.22, 0.6]], 0.1, 0.9, WOOD, {
    outline: shade(WOOD, -0.6), faces: { left: shade(WOOD, -0.05), right: shade(WOOD, -0.05) },
    decal: { left: (x, w, h) => { fr(x, 0, h - 1.6, w, 1.6, GOLD_D); sheen(x, w, h, 0.12); }, right: (x, w, h) => { fr(x, 0, h - 1.6, w, 1.6, GOLD_D); sheen(x, w, h, 0.12); }, e1: strap, e2: strap, e3: strap, e4: strap, e5: strap, e6: strap },
  });
  s.over((ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.56);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, rgba(YELLOW, 0.35)); g.addColorStop(1, rgba(YELLOW, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
  });
  twinkle(s, [[0.3, 0.5, 0.62], [0.7, 0.5, 0.6], [0.5, 0.7, 0.8]], t, 3.6);
}

// ---------- Regalo (caja envuelta con moño) ----------
export const ribbonOf = (c) => (lum(c) < 0.2 ? PINK : c.toLowerCase() === '#ffcc00' ? PINK : YELLOW);
function economia_regalo(s, { c }) {
  const rb = ribbonOf(c);
  s.shadowRect(0.16, 0.16, 0.86, 0.86, 0.26);
  const side = (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgba('#ffffff', 0.12)); g.addColorStop(1, rgba('#000000', 0.12));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // puntitos del papel
    for (let j = 3; j < h; j += 5) for (let i = 3 + ((j / 5) % 2) * 2.5; i < w; i += 5) dotc(x, i, j, 0.55, rgba('#ffffff', 0.35));
    fr(x, w / 2 - 2.2, 0, 4.4, h, rb); fr(x, w / 2 - 2.2, 0, 1, h, rgba('#ffffff', 0.4));
  };
  const top = (x, w, h) => { fr(x, w / 2 - 2.2, 0, 4.4, h, rb); fr(x, 0, h / 2 - 2.2, w, 4.4, rb); sheen(x, w, h, 0.2); };
  s.box(0.2, 0.2, 0, 0.8, 0.8, 0.56, c, { decal: { front: side, back: side, left: side, right: side, top } });
  s.box(0.16, 0.16, 0.56, 0.84, 0.84, 0.68, shade(c, 0.06), { decal: { front: side, back: side, left: side, right: side, top } });
  // moño
  s.custom([0.3, 0.3, 0.68, 0.7, 0.7, 0.8], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.68);
    ctx.lineJoin = 'round';
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x, y - 2);
      ctx.bezierCurveTo(x + d * 4, y - 14, x + d * 15, y - 12, x + d * 11, y - 3);
      ctx.bezierCurveTo(x + d * 8, y + 1, x + d * 3, y, x, y - 2);
      ctx.fillStyle = rb; ctx.fill(); ctx.strokeStyle = shade(rb, -0.45); ctx.lineWidth = 0.9; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + d * 2, y - 4); ctx.quadraticCurveTo(x + d * 6, y - 10, x + d * 9, y - 6);
      ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = 0.8; ctx.stroke();
      // listones colgando
      ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x + d * 6, y + 7); ctx.lineTo(x + d * 3.5, y + 7.5); ctx.closePath();
      ctx.fillStyle = shade(rb, -0.12); ctx.fill();
    }
    dotc(ctx, x, y - 2.5, 3, shade(rb, -0.1)); dotc(ctx, x - 0.8, y - 3.4, 1, rgba('#ffffff', 0.6));
  });
}

export default {
  floor: { economia_moneda, economia_monedas, economia_lingote, economia_cofre, economia_regalo },
  period: { economia_moneda: () => 140, economia_monedas: () => 140, economia_lingote: () => 140, economia_cofre: () => 140 },
  defaultColor: { economia_moneda: GOLD, economia_monedas: GOLD, economia_lingote: GOLD, economia_cofre: WOOD, economia_regalo: PINK },
};
