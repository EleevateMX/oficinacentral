// Dibujo de la línea "Plastik" (plástico brillante de colores). Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { PINK, YELLOW, shade, mix, rgba, outlineOf, pathPts } from '../iso.js';
import { rr, hexLogo } from '../glyphs.js';

const TAU = Math.PI * 2;
const RED = '#ff3b5c', GRN = '#22c55e';
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
// Brillo de plástico: reflejo fuerte arriba a la izquierda
const gloss = (a = 0.35) => (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.35, rgba('#ffffff', 0.04)); g.addColorStop(1, rgba('#000000', 0.06));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba('#ffffff', a * 0.9); rr(ctx, 2, 1.5, Math.max(1, w * 0.3), Math.min(2, h * 0.3), 1); ctx.fill();
};
const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const floorGlow = (ctx, s, cu, cv, ru, color, a) => {
  const [x, y] = s.P(cu, cv, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); glow(ctx, 0, 0, ru * 45, color, a); ctx.restore();
};
const k = 0.04; // un poco más claro que la madera: el plástico refleja

// ---------- Silla de plástico de una pieza ----------
function plastik_chair(s, { c }) {
  s.shadowRect(0.16, 0.16, 0.86, 0.88, 0.2);
  for (const [u, v] of [[0.24, 0.24], [0.76, 0.24], [0.24, 0.8], [0.76, 0.8]]) s.cyl('z', u, v, 0.05, 0.06, 0, 0.5, shade(c, -0.08), { seg: 10, k });
  s.box(0.16, 0.16, 0.5, 0.84, 0.88, 0.6, c, { k, decal: { top: gloss(0.4), front: gloss(0.3) } });
  const back = [[0.16, 0.6], [0.84, 0.6], [0.84, 1.02]];
  for (let i = 1; i < 10; i++) { const a = (i / 10) * Math.PI; back.push([0.5 + 0.34 * Math.cos(a), 1.02 + 0.16 * Math.sin(a)]); }
  back.push([0.16, 1.02]);
  const slot = (x, w, h) => { rr(x, w * 0.3, h * 0.22, w * 0.4, h * 0.14, h * 0.07); x.fillStyle = shade(c, -0.5); x.fill(); gloss(0.35)(x, w, h); };
  s.prism('v', back, 0.16, 0.24, c, { k, decal: { front: slot, back: slot } });
}

// ---------- Sillón inflable ----------
function plastik_inflable(s, { c }) {
  const lt = mix(c, '#ffffff', 0.25);
  s.shadowEllipse(0.5, 0.52, 0.46, 0.44, 0.22);
  s.cyl('z', 0.5, 0.55, 0.42, 0.42, 0, 0.36, c, { seg: 26, k, decal: { top: (x, w, h) => { x.fillStyle = rgba(shade(c, -0.35), 0.5); x.beginPath(); x.ellipse(w / 2, h / 2, w * 0.3, h * 0.3, 0, 0, TAU); x.fill(); x.strokeStyle = rgba('#ffffff', 0.6); x.lineWidth = 1.4; x.beginPath(); x.arc(w / 2, h / 2, w * 0.4, Math.PI * 1.05, Math.PI * 1.45); x.stroke(); } } });
  s.cyl('u', 0.24, 0.62, 0.2, 0.2, 0.1, 0.9, lt, { seg: 18, k, decal: { left: (x, w, h) => dotc(x, w / 2, h / 2, 2, rgba('#ffffff', 0.5)), right: (x, w, h) => dotc(x, w / 2, h / 2, 2, rgba('#ffffff', 0.5)) } });
  for (const u of [0.15, 0.85]) s.cyl('v', u, 0.5, 0.13, 0.13, 0.44, 0.94, lt, { seg: 16, k });
  // válvula
  s.cyl('z', 0.2, 0.86, 0.035, 0.035, 0.34, 0.4, '#ffffff', { seg: 8 });
}

// ---------- Mesa tulipán ----------
function plastik_table(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.4, 0.4, 0.2);
  s.cyl('z', 0.5, 0.5, 0.3, 0.26, 0, 0.06, c, { seg: 24, k, decal: { top: gloss(0.3) } });
  s.cyl('z', 0.5, 0.5, 0.12, 0.05, 0.06, 0.4, c, { seg: 16, k });
  s.cyl('z', 0.5, 0.5, 0.05, 0.07, 0.4, 0.7, c, { seg: 16, k });
  s.cyl('z', 0.5, 0.5, 0.45, 0.45, 0.7, 0.78, c, { seg: 28, k, decal: { top: (x, w, h) => { x.strokeStyle = rgba('#ffffff', 0.55); x.lineWidth = 1.5; x.beginPath(); x.arc(w / 2, h / 2, w * 0.36, Math.PI * 1.0, Math.PI * 1.4); x.stroke(); x.strokeStyle = rgba(shade(c, -0.4), 0.2); x.lineWidth = 1; x.beginPath(); x.arc(w / 2, h / 2, w * 0.44, 0, TAU); x.stroke(); } } });
}

// ---------- Cubo apilable ----------
function plastik_cube(s, { c }) {
  s.shadowRect(0.12, 0.12, 0.9, 0.9, 0.22);
  const side = (x, w, h) => { rr(x, w / 2 - 5, h * 0.32, 10, 4, 2); x.fillStyle = shade(c, -0.5); x.fill(); gloss(0.32)(x, w, h); };
  s.box(0.12, 0.12, 0, 0.88, 0.88, 0.5, c, { k, decal: { front: side, right: side, left: side, back: side, top: (x, w, h) => { x.strokeStyle = rgba(shade(c, -0.4), 0.35); x.lineWidth = 1; rr(x, 3, 3, w - 6, h - 6, 3); x.stroke(); gloss(0.4)(x, w, h); } } });
}

// ---------- Cama moldeada ----------
function plastik_bed(s, { c }) {
  s.shadowRect(0.04, 0.04, 0.96, 1.98, 0.22);
  s.box(0.06, 0.12, 0, 0.94, 1.96, 0.3, c, { k, decal: { front: gloss(0.35), right: (x, w, h) => { for (let i = 0; i < 5; i++) dotc(x, ((i + 0.5) * w) / 5, h / 2, 1.6, rgba('#ffffff', 0.55)); gloss(0.3)(x, w, h); }, left: (x, w, h) => { for (let i = 0; i < 5; i++) dotc(x, ((i + 0.5) * w) / 5, h / 2, 1.6, rgba('#ffffff', 0.55)); } } });
  s.box(0.1, 0.16, 0.3, 0.9, 0.72, 0.44, '#fbfaf6', { decal: { top: gloss(0.15) } });
  const dots = mix(c, '#ffffff', 0.15);
  s.box(0.08, 0.72, 0.28, 0.92, 1.95, 0.5, '#fbfaf6', { decal: { top: (x, w, h) => { fr(x, 0, 0, w, 5, mix(c, '#ffffff', 0.6)); for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) dotc(x, 4 + i * ((w - 8) / 3) + (j % 2) * 3, 10 + j * ((h - 14) / 4), 1.8, dots); gloss(0.12)(x, w, h); }, front: (x, w, h) => fr(x, 0, h - 2, w, 2, mix(c, '#ffffff', 0.6)) } });
  s.box(0.2, 0.22, 0.44, 0.8, 0.56, 0.58, '#ffffff', { decal: { top: (x, w, h) => { rr(x, 1.5, 1.5, w - 3, h - 3, 3); x.strokeStyle = rgba(c, 0.5); x.lineWidth = 0.8; x.stroke(); } } });
  const head = [[0, 0], [1, 0], [1, 0.72]];
  for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI; head.push([0.5 + 0.5 * Math.cos(a), 0.72 + 0.4 * Math.sin(a)]); }
  head.push([0, 0.72]);
  s.prism('v', head, 0, 0.12, c, { k, decal: { front: (x, w, h) => { x.fillStyle = rgba('#ffffff', 0.85); x.beginPath(); x.arc(w / 2, h * 0.42, Math.min(w, h) * 0.18, 0, TAU); x.fill(); x.fillStyle = c; x.beginPath(); x.arc(w / 2, h * 0.42, Math.min(w, h) * 0.1, 0, TAU); x.fill(); gloss(0.35)(x, w, h); }, back: gloss(0.3) } });
}

// ---------- Lámpara hongo ----------
function plastik_lamp(s, { c, st }) {
  const on = st === 1, cap = on ? mix(c, '#fff4d6', 0.45) : c;
  s.shadowEllipse(0.5, 0.5, 0.3, 0.3, 0.22);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.1, mix(c, '#fff1c2', 0.5), 0.34));
  s.cyl('z', 0.5, 0.5, 0.22, 0.2, 0, 0.08, '#f4f4f6', { seg: 22, k, decal: { top: gloss(0.3) } });
  s.cyl('z', 0.5, 0.5, 0.07, 0.09, 0.08, 0.86, '#f4f4f6', { seg: 14, k });
  s.cyl('z', 0.5, 0.5, 0.4, 0.36, 0.86, 0.94, cap, { seg: 26, k, faces: { bottom: on ? '#fff6d8' : shade(c, -0.3) } });
  s.cyl('z', 0.5, 0.5, 0.36, 0.12, 0.94, 1.18, cap, { seg: 26, k, decal: { top: gloss(0.4) } });
  s.cyl('z', 0.5, 0.5, 0.12, 0.0, 1.18, 1.22, cap, { seg: 18, k });
  s.over((ctx) => {
    const [x, y] = s.P(0.5, 0.5, 1.02);
    ctx.fillStyle = rgba('#ffffff', 0.55);
    for (const [dx, dy, r] of [[-8, -2, 2.4], [-2, -5, 1.6], [6, -1, 2]]) { ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r * 1.3, r * 0.8, 0, 0, TAU); ctx.fill(); }
    if (on) { glow(ctx, x, y + 4, 40, mix(c, '#fff1c2', 0.5), 0.32); }
  });
}

// ---------- Tele burbuja ----------
function plastik_tv(s, { c, st, t }) {
  const on = st === 1, dk = '#2b2d38', R = 0.38, zc = 0.92;
  s.shadowEllipse(0.5, 0.5, 0.3, 0.3, 0.22);
  s.cyl('z', 0.5, 0.5, 0.26, 0.22, 0, 0.06, dk, { seg: 20, decal: { top: gloss(0.2) } });
  s.cyl('z', 0.5, 0.5, 0.04, 0.04, 0.06, 0.56, '#c9ced6', { seg: 10 });
  s.ball(0.5, 0.5, zc, R, c, { outline: outlineOf(c) });
  // antena
  s.custom([0.3, 0.3, zc + 0.3, 0.7, 0.7, 1.4], (ctx) => {
    const [x, y] = s.P(0.5, 0.42, zc + R - 0.02);
    ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      ctx.strokeStyle = '#3a3c46'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + d * 6, y - 9); ctx.stroke();
      ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 1; ctx.stroke();
      dotc(ctx, x + d * 6, y - 9, 2.2, '#3a3c46'); dotc(ctx, x + d * 6, y - 9, 1.6, d < 0 ? PINK : YELLOW);
    }
  });
  if (!s.faceVisible(0, 1, 0)) {
    s.custom([0.3, 0.1, zc - 0.2, 0.7, 0.2, zc + 0.2], (ctx) => { const [x, y] = s.P(0.5, 0.18, zc); for (let i = -1; i <= 1; i++) { ctx.fillStyle = rgba('#000', 0.3); rr(ctx, x - 5, y + i * 3.4 - 0.7, 10, 1.4, 0.7); ctx.fill(); } });
    return;
  }
  // pantalla: disco en el frente de la burbuja
  s.custom([0.2, 0.86, zc - 0.25, 0.8, 0.9, zc + 0.25], (ctx) => {
    const vf = 0.5 + R * 0.7, rs = 0.27;
    const ring = (r) => { const pts = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; pts.push(s.P(0.5 + r * Math.cos(a), vf, zc + r * 0.85 * Math.sin(a))); } return pts; };
    const outer = ring(rs + 0.04), inner = ring(rs);
    pathPts(ctx, outer); ctx.fillStyle = dk; ctx.fill();
    pathPts(ctx, inner); ctx.save(); ctx.clip();
    const [cx, cy] = s.P(0.5, vf, zc);
    if (on) {
      const ph = Math.floor(t / 120);
      const g = ctx.createLinearGradient(cx - 10, cy - 10, cx + 10, cy + 10);
      g.addColorStop(0, '#47d7ff'); g.addColorStop(1, PINK);
      ctx.fillStyle = g; ctx.fillRect(cx - 14, cy - 14, 28, 28);
      const cols = [YELLOW, '#ffffff', GRN, RED];
      for (let i = 0; i < 4; i++) { const hgt = 3 + ((ph * (i + 3) + i * 5) % 7); fr(ctx, cx - 7 + i * 3.6, cy + 5 - hgt, 2.6, hgt, cols[i]); }
      dotc(ctx, cx + 6, cy - 5, 1.2, ph % 2 ? '#ffffff' : RED);
      for (let i = -12; i < 12; i += 2) fr(ctx, cx - 14, cy + i, 28, 0.5, 'rgba(0,0,0,0.12)');
    } else {
      ctx.fillStyle = '#14151c'; ctx.fillRect(cx - 14, cy - 14, 28, 28);
      ctx.fillStyle = rgba('#ffffff', 0.12); ctx.beginPath(); ctx.ellipse(cx - 3, cy - 4, 5, 2.5, -0.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = rgba('#ffffff', 0.25); ctx.lineWidth = 0.8; pathPts(ctx, inner); ctx.stroke();
  });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.9, zc); glow(ctx, x, y, 30, '#47d7ff', 0.18); });
}

// ---------- Espejo burbuja (pared) ----------
function plastik_mirror(ctx, { c }) {
  const cx = 16, cy = -34, r = 13;
  dotc(ctx, cx + 1.5, cy + 2, r + 0.5, 'rgba(16,10,28,0.28)');
  dotc(ctx, cx, cy, r, c);
  ctx.strokeStyle = outlineOf(c); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  const g = ctx.createLinearGradient(cx - 9, cy - 9, cx + 9, cy + 9);
  g.addColorStop(0, '#e9f6ff'); g.addColorStop(0.55, '#a9c9e3'); g.addColorStop(1, '#7ea6c8');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r - 3.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = 0.8; ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 3.4, 0, TAU); ctx.clip();
  ctx.fillStyle = rgba('#ffffff', 0.55);
  ctx.beginPath(); ctx.moveTo(cx - 10, cy + 2); ctx.lineTo(cx - 4, cy - 10); ctx.lineTo(cx - 1, cy - 10); ctx.lineTo(cx - 7, cy + 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - 3, cy + 6); ctx.lineTo(cx + 3, cy - 6); ctx.lineTo(cx + 4.5, cy - 6); ctx.lineTo(cx - 1.5, cy + 6); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, r - 1.6, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
  hexLogo(ctx, cx + r * 0.62, cy + r * 0.62, 2.2, { inner: false });
}

export default {
  floor: { plastik_chair, plastik_inflable, plastik_table, plastik_cube, plastik_bed, plastik_lamp, plastik_tv },
  wall: { plastik_mirror },
  period: { plastik_tv: (st) => (st === 1 ? 120 : 0) },
  defaultColor: {},
};
