// Furnis de piso: cada constructor arma la escena en espacio de modelo (frente = +v).
//   (s: Scene, k: { c: color principal, st: estado, t: tiempo cuantizado en ms, def })
import { PINK, YELLOW, DARK, INK, shade, mix, rgba, lum, rng, outlineOf, pathPts } from './iso.js';
import { drawWord, wordWidth, neonStroke, hexLogo, hexPath, hexPts, rr } from './glyphs.js';

const WOOD = '#b5794a', DWOOD = '#6b4128', METAL = '#b9c0c9', DMETAL = '#4a4f5a', GRAPH = '#2b2d38', CREAM = '#f1ece3', WHITE = '#f6f5f2';
const BOOKS = ['#FE3377', '#FFCC00', '#3a86ff', '#2fb67c', '#8e5cf7', '#ff7a3d', '#e8e3d8', '#2b2d38', '#19b4c9', '#c0392b'];
const TAU = Math.PI * 2;

const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const floorGlow = (ctx, s, cu, cv, ru, color, a) => {
  const [x, y] = s.P(cu, cv, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); glow(ctx, 0, 0, ru * 45, color, a); ctx.restore();
};
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
// Brillo de tapa (barniz) en dibujo plano
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
const planks = (ctx, w, h, c, n = 3) => {
  for (let i = 1; i < n; i++) line(ctx, 0, (h * i) / n, w, (h * i) / n, rgba(shade(c, -0.5), 0.35), 0.6);
  sheen(ctx, w, h, 0.12);
};
const pipe = (ctx, w, h) => { ctx.strokeStyle = rgba('#ffffff', 0.2); ctx.lineWidth = 0.8; rr(ctx, 1.2, 1.2, w - 2.4, h - 2.4, 2); ctx.stroke(); };

// ---------- Sillas y sofás ----------
function chair_basic(s, { c }) {
  const leg = shade(c, -0.22);
  s.shadowRect(0.12, 0.12, 0.9, 0.9);
  for (const [u, v] of [[0.18, 0.18], [0.74, 0.18], [0.18, 0.74], [0.74, 0.74]]) s.box(u, v, 0, u + 0.08, v + 0.08, 0.62, leg);
  s.box(0.14, 0.14, 0.62, 0.86, 0.86, 0.7, c, { decal: { top: (x, w, h) => planks(x, w, h, c, 3) } });
  s.box(0.16, 0.15, 0.7, 0.25, 0.24, 1.6, leg);
  s.box(0.75, 0.15, 0.7, 0.84, 0.24, 1.6, leg);
  s.box(0.25, 0.16, 1.12, 0.75, 0.23, 1.52, c, { decal: { front: (x, w, h) => { fr(x, 0, h * 0.42, w, 1, rgba(shade(c, -0.5), 0.4)); sheen(x, w, h, 0.1); }, back: (x, w, h) => fr(x, 0, h * 0.42, w, 1, rgba(shade(c, -0.5), 0.4)) } });
  s.box(0.25, 0.16, 0.86, 0.75, 0.23, 0.94, c);
}

function chair_gamer(s, { c }) {
  const dk = c === '#141414' ? '#2c2c34' : '#1d1c22', acc = c === '#141414' ? PINK : c;
  s.shadowEllipse(0.5, 0.5, 0.42, 0.42, 0.22);
  s.box(0.08, 0.465, 0.04, 0.92, 0.535, 0.1, dk);
  s.box(0.465, 0.08, 0.04, 0.535, 0.465, 0.1, dk);
  s.box(0.465, 0.535, 0.04, 0.535, 0.92, 0.1, dk);
  for (const [u, v] of [[0.09, 0.5], [0.91, 0.5], [0.5, 0.09], [0.5, 0.91]]) s.ball(u, v, 0.04, 0.045, '#3a3942');
  s.cyl('z', 0.5, 0.5, 0.05, 0.035, 0.1, 0.55, METAL);
  s.box(0.2, 0.22, 0.55, 0.8, 0.84, 0.62, dk);
  s.box(0.2, 0.32, 0.62, 0.8, 0.86, 0.76, acc, {
    decal: { top: (x, w, h) => { fr(x, w * 0.3, 0, w * 0.4, h, dk); line(x, w * 0.3, 0, w * 0.3, h, rgba('#ffffff', 0.2)); line(x, w * 0.7, 0, w * 0.7, h, rgba('#ffffff', 0.2)); sheen(x, w, h, 0.12); } },
  });
  // respaldo alto con insertos
  const back = (x, w, h) => {
    fr(x, w * 0.26, h * 0.14, w * 0.48, h * 0.82, dk);
    x.strokeStyle = rgba('#ffffff', 0.12); x.lineWidth = 0.6;
    for (let i = 1; i < 5; i++) line(x, w * 0.26, h * (0.14 + i * 0.16), w * 0.74, h * (0.14 + i * 0.16), rgba('#ffffff', 0.1), 0.6);
    hexLogo(x, w / 2, h * 0.09 + 3, 3.2, { top: YELLOW, left: c === PINK ? '#ffffff' : PINK, right: c === PINK ? '#ffd1df' : '#b8195a', inner: false });
    sheen(x, w, h, 0.1);
  };
  s.box(0.2, 0.16, 0.76, 0.8, 0.32, 1.95, acc, { decal: { front: back } });
  s.box(0.3, 0.32, 1.62, 0.7, 0.38, 1.8, dk);
  s.box(0.16, 0.46, 0.62, 0.2, 0.52, 0.9, dk);
  s.box(0.8, 0.46, 0.62, 0.84, 0.52, 0.9, dk);
  s.box(0.13, 0.36, 0.9, 0.21, 0.74, 0.96, dk);
  s.box(0.79, 0.36, 0.9, 0.87, 0.74, 0.96, dk);
}

function stool_bar(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.3, 0.3, 0.24);
  s.cyl('z', 0.5, 0.5, 0.27, 0.25, 0, 0.05, DMETAL);
  s.custom([0.2, 0.2, 0.3, 0.45, 0.45, 0.34], (ctx) => ring(ctx, s, 0.33, false));
  s.cyl('z', 0.5, 0.5, 0.04, 0.04, 0.05, 0.8, METAL);
  s.custom([0.55, 0.55, 0.3, 0.8, 0.8, 0.34], (ctx) => ring(ctx, s, 0.33, true));
  s.cyl('z', 0.5, 0.5, 0.2, 0.27, 0.78, 0.84, DMETAL);
  s.cyl('z', 0.5, 0.5, 0.31, 0.3, 0.84, 0.95, c, { seg: 22, decal: { top: (x, w, h) => { x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 1; x.beginPath(); x.arc(w / 2, h / 2, w * 0.36, Math.PI * 0.9, Math.PI * 1.6); x.stroke(); } } });
}
function ring(ctx, s, z, front) {
  const [x, y] = s.P(0.5, 0.5, z), rx = 0.2 * 45, ry = 0.2 * 22.6;
  ctx.lineWidth = 2.4; ctx.strokeStyle = outlineOf(METAL);
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeStyle = METAL; ctx.stroke();
}

function sofa(s, c, W, o = {}) {
  const ft = DWOOD, base = shade(c, -0.06);
  const backH = o.backH || 1.12, armH = o.armH || 0.84, arm = o.arm || 0.22;
  s.shadowRect(0.02, 0.1, W - 0.02, 0.98, 0.22);
  for (const u of [0.08, W - 0.16]) for (const v of [0.16, 0.86]) s.box(u, v, 0, u + 0.08, v + 0.08, 0.1, ft);
  s.box(0.04, 0.12, 0.1, W - 0.04, 0.96, 0.42, base);
  const n = o.n || W, a0 = 0.04 + arm, a1 = W - 0.04 - arm, cw = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    s.box(a0 + i * cw + 0.008, 0.36, 0.42, a0 + (i + 1) * cw - 0.008, 0.94, 0.6, c, { decal: { top: pipe, front: (x, w, h) => sheen(x, w, h, 0.12) } });
  }
  const tufts = (x, w, h) => {
    const cols = Math.max(2, Math.round(w / 18));
    for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++) dotc(x, ((i + 0.5) * w) / cols, h * (0.35 + j * 0.3), 0.9, rgba(shade(c, -0.5), 0.55));
    sheen(x, w, h, 0.1);
  };
  s.box(0.04, 0.12, 0.42, W - 0.04, 0.36, backH, c, { decal: { front: tufts, top: pipe } });
  s.box(0.04, 0.36, 0.42, 0.04 + arm, 0.96, armH, c, { decal: { top: pipe } });
  s.box(W - 0.04 - arm, 0.36, 0.42, W - 0.04, 0.96, armH, c, { decal: { top: pipe } });
  if (o.pillow) s.box(a0 + 0.06, 0.36, 0.6, a0 + 0.36, 0.48, 0.92, o.pillow, { decal: { front: (x, w, h) => { hexLogo(x, w / 2, h / 2, Math.min(w, h) * 0.28, { inner: false }); } } });
}
const sofa_2 = (s, { c }) => sofa(s, c, 2, { pillow: c === PINK ? '#2b2d38' : c === '#2b2d38' ? PINK : null });
const sofa_3 = (s, { c }) => sofa(s, c, 3, { pillow: c === PINK ? '#2b2d38' : PINK });
const armchair = (s, { c }) => sofa(s, c, 1, { backH: 1.22, armH: 0.88, arm: 0.2, n: 1 });

function beanbag(s, { c }) {
  s.shadowEllipse(0.5, 0.52, 0.44, 0.4, 0.24);
  s.custom([0, 0, 0, 1, 1, 0.6], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0);
    const ol = outlineOf(c);
    // respaldo (bulto de atrás)
    ctx.fillStyle = shade(c, -0.08);
    ctx.beginPath(); ctx.ellipse(x - 2, y - 16, 20, 13, -0.08, 0, TAU); ctx.fill();
    ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.stroke();
    // cuerpo
    const g = ctx.createLinearGradient(x - 26, y - 20, x + 26, y + 8);
    g.addColorStop(0, shade(c, 0.12)); g.addColorStop(0.55, c); g.addColorStop(1, shade(c, -0.28));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y - 6, 26, 14, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // hundido del asiento
    ctx.fillStyle = rgba(shade(c, -0.45), 0.45);
    ctx.beginPath(); ctx.ellipse(x + 1, y - 10, 13, 6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x - 4, y - 9, 19, 9, 0, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x - 3, y - 18, 13, 8, 0, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
    // costuras
    ctx.strokeStyle = rgba(shade(c, -0.55), 0.35); ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x + 10, y - 1); ctx.quadraticCurveTo(x + 16, y - 9, x + 12, y - 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 12, y + 1); ctx.quadraticCurveTo(x - 18, y - 6, x - 15, y - 13); ctx.stroke();
  });
}

function throne(s, { c }) {
  const vel = PINK, gd = shade(c, -0.18);
  s.shadowRect(0.02, 0.02, 0.98, 0.98, 0.26);
  s.box(0.02, 0.02, 0, 0.98, 0.98, 0.12, gd, { decal: { front: (x, w, h) => fr(x, 0, h * 0.4, w, 1, rgba('#7a4d00', 0.5)), top: (x, w, h) => { x.fillStyle = rgba('#8b1b45', 0.9); x.fillRect(w * 0.22, h * 0.15, w * 0.56, h * 0.85); line(x, w * 0.22, h * 0.15, w * 0.22, h, YELLOW, 0.8); line(x, w * 0.78, h * 0.15, w * 0.78, h, YELLOW, 0.8); } } });
  const panel = (x, w, h) => { x.strokeStyle = rgba('#7a4d00', 0.55); x.lineWidth = 0.8; x.strokeRect(2, 2, w - 4, h - 4); dotc(x, w / 2, h / 2, 1.6, PINK); sheen(x, w, h, 0.2); };
  s.box(0.12, 0.14, 0.12, 0.88, 0.9, 0.55, c, { decal: { front: panel, right: panel, left: panel } });
  s.box(0.2, 0.36, 0.55, 0.8, 0.88, 0.8, vel, { decal: { top: (x, w, h) => { for (const [a, b] of [[0.3, 0.35], [0.7, 0.35], [0.5, 0.7]]) dotc(x, w * a, h * b, 0.9, rgba('#6d0f33', 0.7)); pipe(x, w, h); } } });
  const backF = (x, w, h) => {
    x.fillStyle = vel; x.beginPath();
    x.moveTo(w * 0.16, h); x.lineTo(w * 0.16, h * 0.3); x.lineTo(w * 0.5, h * 0.1); x.lineTo(w * 0.84, h * 0.3); x.lineTo(w * 0.84, h); x.closePath(); x.fill();
    x.strokeStyle = rgba('#7a4d00', 0.6); x.lineWidth = 0.8; x.stroke();
    hexLogo(x, w / 2, h * 0.42, w * 0.2, { ring: YELLOW, outline: 'rgba(20,20,20,0.5)' });
    for (let i = 0; i < 3; i++) dotc(x, w * (0.3 + i * 0.2), h * 0.78, 0.8, rgba('#6d0f33', 0.8));
    sheen(x, w, h, 0.18);
  };
  s.prism('v', [[0.12, 0.55], [0.88, 0.55], [0.88, 1.92], [0.5, 2.24], [0.12, 1.92]], 0.14, 0.34, c, { decal: { front: backF, back: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.box(0.08, 0.34, 0.55, 0.2, 0.86, 0.98, c, { decal: { right: panel, left: panel } });
  s.box(0.8, 0.34, 0.55, 0.92, 0.86, 0.98, c, { decal: { right: panel, left: panel } });
  s.ball(0.14, 0.93, 0.99, 0.07, c);
  s.ball(0.86, 0.93, 0.99, 0.07, c);
  s.ball(0.5, 0.24, 2.31, 0.075, PINK);
}

// ---------- Mesas ----------
function table_small(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.42, 0.42, 0.2);
  s.cyl('z', 0.5, 0.5, 0.25, 0.22, 0, 0.05, shade(c, -0.32));
  s.cyl('z', 0.5, 0.5, 0.05, 0.05, 0.05, 0.82, shade(c, -0.22));
  s.cyl('z', 0.5, 0.5, 0.44, 0.44, 0.82, 0.9, c, { seg: 26, decal: { top: (x, w, h) => { x.strokeStyle = rgba(shade(c, -0.5), 0.25); x.lineWidth = 0.7; x.beginPath(); x.arc(w / 2, h / 2, w * 0.34, 0, TAU); x.stroke(); sheen(x, w, h, 0.16); } } });
}
function table_dining(s, { c }) {
  const leg = shade(c, -0.22);
  s.shadowRect(0.08, 0.08, 1.95, 1.95, 0.2);
  for (const u of [0.14, 1.78]) for (const v of [0.14, 1.78]) s.box(u, v, 0, u + 0.09, v + 0.09, 0.74, leg);
  s.box(0.14, 0.14, 0.74, 1.87, 1.87, 0.82, shade(c, -0.1));
  s.box(0.05, 0.05, 0.82, 1.95, 1.95, 0.9, c, { decal: { top: (x, w, h) => { planks(x, w, h, c, 5); x.fillStyle = rgba('#ffffff', 0.85); x.fillRect(w * 0.42, h * 0.08, w * 0.16, h * 0.84); x.fillStyle = rgba(PINK, 0.55); x.fillRect(w * 0.42, h * 0.08, w * 0.16, 1.5); x.fillRect(w * 0.42, h * 0.92 - 1.5, w * 0.16, 1.5); } } });
}
function table_coffee(s, { c }) {
  const leg = c === '#f4f4f6' ? '#3a3a42' : shade(c, -0.28);
  s.shadowRect(0.06, 0.1, 1.96, 0.95, 0.2);
  for (const u of [0.08, 1.85]) for (const v of [0.14, 0.8]) s.box(u, v, 0, u + 0.07, v + 0.07, 0.42, leg);
  s.box(0.15, 0.16, 0.1, 1.85, 0.86, 0.14, shade(c, -0.08));
  s.box(0.4, 0.3, 0.14, 0.82, 0.66, 0.17, PINK, { decal: { top: (x, w, h) => { fr(x, 2, 2, w * 0.5, 2, rgba('#ffffff', 0.7)); fr(x, 2, 6, w * 0.3, 1.2, rgba('#ffffff', 0.5)); } } });
  s.box(1.1, 0.28, 0.14, 1.5, 0.7, 0.2, '#3a86ff');
  s.box(0.04, 0.08, 0.42, 1.96, 0.92, 0.5, c, { decal: { top: (x, w, h) => { planks(x, w, h, c, 2); } } });
}
function desk_pc(s, { st, t }) {
  const on = st === 1, top = '#3a3e4c', cab = '#30333f';
  s.shadowRect(0.04, 0.1, 1.98, 0.95, 0.22);
  const drawers = (x, w, h) => {
    for (let i = 0; i < 3; i++) { const y0 = 2 + i * ((h - 4) / 3); x.strokeStyle = rgba('#000000', 0.35); x.lineWidth = 0.7; x.strokeRect(1.5, y0, w - 3, (h - 4) / 3 - 1.5); fr(x, w / 2 - 3, y0 + 3, 6, 1.4, '#9aa0aa'); }
  };
  s.box(0.06, 0.14, 0, 0.62, 0.88, 0.9, cab, { decal: { front: drawers } });
  s.box(1.86, 0.14, 0, 1.94, 0.22, 0.9, DMETAL);
  s.box(1.86, 0.8, 0, 1.94, 0.88, 0.9, DMETAL);
  s.box(1.3, 0.22, 0, 1.7, 0.8, 0.74, '#202229', {
    decal: {
      front: (x, w, h) => {
        fr(x, 2, 2, w - 4, h * 0.55, '#16171c');
        x.strokeStyle = on ? PINK : '#3a3a44'; x.lineWidth = 1.4; x.beginPath(); x.arc(w / 2, h * 0.3, Math.min(w, h) * 0.2, 0, TAU); x.stroke();
        if (on) { glow(x, w / 2, h * 0.3, w * 0.5, PINK, 0.35); }
        dotc(x, w / 2, h * 0.75, 1.1, on ? '#47ff9a' : '#555');
      },
      left: (x, w, h) => { if (on) { fr(x, 1, h * 0.15, 1.2, h * 0.7, rgba(PINK, 0.9)); } },
    },
  });
  s.box(0.02, 0.08, 0.9, 1.98, 0.94, 1.0, top, { decal: { front: (x, w, h) => fr(x, 0, h - 1.4, w, 1.4, on ? PINK : '#5a4a55'), top: (x, w, h) => sheen(x, w, h, 0.12) } });
  // monitor
  s.box(0.86, 0.22, 1.0, 1.14, 0.36, 1.05, '#1b1c22');
  s.box(0.97, 0.24, 1.05, 1.03, 0.3, 1.2, '#1b1c22');
  s.box(0.4, 0.3, 1.14, 1.6, 0.36, 1.8, '#17181d', {
    decal: {
      front: (x, w, h) => {
        const X = 1.6, Y = 1.6, Wd = w - 3.2, Hd = h - 4;
        if (on) {
          const g = x.createLinearGradient(0, Y, 0, Y + Hd); g.addColorStop(0, '#3b1d6e'); g.addColorStop(1, '#c4245f');
          x.fillStyle = g; x.fillRect(X, Y, Wd, Hd);
          hexLogo(x, X + Wd * 0.78, Y + Hd * 0.5, Hd * 0.22, {});
          fr(x, X + 3, Y + 3, Wd * 0.48, Hd * 0.66, rgba('#0e0f16', 0.88));
          fr(x, X + 3, Y + 3, Wd * 0.48, 2, '#3a86ff');
          const cols = ['#47ff9a', '#FFCC00', '#7fc8ff', PINK];
          for (let i = 0; i < 5; i++) fr(x, X + 5 + (i % 2) * 3, Y + 7 + i * 3, ((i * 7) % 11) + 6, 1.2, cols[i % 4]);
          if (Math.floor(t / 500) % 2 === 0) fr(x, X + 5, Y + 7 + 15, 2.5, 1.4, '#ffffff');
        } else {
          fr(x, X, Y, Wd, Hd, '#0f1014');
          x.fillStyle = rgba('#ffffff', 0.08); x.beginPath(); x.moveTo(X + Wd * 0.55, Y); x.lineTo(X + Wd * 0.75, Y); x.lineTo(X + Wd * 0.4, Y + Hd); x.lineTo(X + Wd * 0.2, Y + Hd); x.fill();
        }
        dotc(x, w / 2, h - 1.2, 0.6, on ? '#47ff9a' : '#444');
      },
    },
  });
  if (on && s.faceVisible(0, 1, 0)) s.over((ctx) => { const [x, y] = s.P(1.0, 0.45, 1.45); glow(ctx, x, y, 34, '#8e5cf7', 0.18); });
  s.box(0.6, 0.5, 1.0, 1.4, 0.7, 1.03, '#26282f', { decal: { top: (x, w, h) => { for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) fr(x, 1.5 + i * ((w - 3) / 9), 1.2 + j * ((h - 2.4) / 3), (w - 3) / 9 - 0.8, (h - 2.4) / 3 - 0.8, on ? (j === 1 && i % 3 === 0 ? PINK : '#5e6270') : '#4a4d58'); } } });
  s.box(1.5, 0.55, 1.0, 1.6, 0.7, 1.03, '#26282f');
  s.cyl('z', 0.24, 0.5, 0.07, 0.07, 1.0, 1.14, PINK, { seg: 12, faces: { top: '#5a3320' } });
}
function bar_counter(s, { c }) {
  const topc = '#ece6dd', on = true;
  s.shadowRect(0.0, 0.18, 3.0, 1.02, 0.24);
  s.box(0.06, 0.26, 0, 2.94, 0.94, 0.1, shade(c, -0.35));
  const front = (x, w, h) => {
    for (let i = 1; i < 9; i++) line(x, (w * i) / 9, 4, (w * i) / 9, h, rgba(shade(c, -0.5), 0.45), 0.7);
    if (on) { fr(x, 0, 2.2, w, 1.6, PINK); fr(x, 0, 2.6, w, 0.6, '#ffd3e1'); }
    hexLogo(x, w / 2, h * 0.55, 4.5, {});
    sheen(x, w, h, 0.1);
  };
  s.box(0.02, 0.2, 0.1, 2.98, 0.98, 1.0, c, { decal: { front, left: (x, w, h) => fr(x, 0, 2.2, w, 1.6, PINK), right: (x, w, h) => fr(x, 0, 2.2, w, 1.6, PINK) } });
  s.box(0, 0.12, 1.0, 3, 1.02, 1.1, topc, { decal: { top: (x, w, h) => { const r = rng(7); x.strokeStyle = rgba('#9a8f80', 0.35); x.lineWidth = 0.6; for (let i = 0; i < 6; i++) { const a = r() * w; x.beginPath(); x.moveTo(a, 0); x.quadraticCurveTo(a + 8, h / 2, a - 4 + r() * 10, h); x.stroke(); } sheen(x, w, h, 0.2); } } });
}

// ---------- Camas ----------
function bed(s, c, W) {
  const wd = '#8a5a3b', sheet = '#f5f3ef';
  s.shadowRect(0.02, 0.02, W - 0.02, 1.98, 0.24);
  for (const u of [0.06, W - 0.14]) for (const v of [0.14, 1.86]) s.box(u, v, 0, u + 0.08, v + 0.08, 0.12, DWOOD);
  s.box(0.04, 0.12, 0.12, W - 0.04, 1.96, 0.34, wd, { decal: { front: (x, w, h) => sheen(x, w, h, 0.15) } });
  s.box(0.08, 0.14, 0.34, W - 0.08, 0.75, 0.5, sheet, { decal: { top: (x, w, h) => sheen(x, w, h, 0.1) } });
  const blanketTop = (x, w, h) => {
    fr(x, 0, 0, w, 5, lum(c) > 0.8 ? shade(c, -0.12) : shade(c, 0.35)); fr(x, 0, 5, w, 0.8, rgba(shade(c, -0.5), 0.3));
    x.strokeStyle = rgba('#ffffff', 0.22); x.lineWidth = 0.7;
    for (let i = 1; i < 4; i++) line(x, 0, 5 + ((h - 5) * i) / 4, w, 5 + ((h - 5) * i) / 4, rgba('#ffffff', 0.18), 0.6);
    for (let i = 1; i < W * 3; i++) line(x, (w * i) / (W * 3), 6, (w * i) / (W * 3), h, rgba(shade(c, -0.4), 0.18), 0.6);
    sheen(x, w, h, 0.12);
  };
  s.box(0.05, 0.75, 0.3, W - 0.05, 1.97, 0.56, c, { decal: { top: blanketTop, front: (x, w, h) => fr(x, 0, h - 2, w, 2, shade(c, -0.25)) } });
  const pw = (W - 0.3) / W;
  for (let i = 0; i < W; i++) s.box(0.15 + i * pw + 0.03, 0.22, 0.5, 0.15 + (i + 1) * pw - 0.03, 0.6, 0.65, '#ffffff', { k: 0.02, decal: { top: pipe } });
  const head = (x, w, h) => {
    rr(x, 2.5, 3, w - 5, h * 0.62, 3); x.fillStyle = shade(c, -0.12); x.fill();
    x.strokeStyle = rgba('#000', 0.25); x.lineWidth = 0.6; x.stroke();
    const n = W * 3;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) dotc(x, 2.5 + ((i + 0.5) * (w - 5)) / n, 3 + h * 0.62 * (0.33 + j * 0.34), 0.8, rgba('#000', 0.3));
    sheen(x, w, h, 0.14);
  };
  s.box(0, 0, 0, W, 0.12, 1.2, wd, { decal: { front: head, top: (x, w, h) => sheen(x, w, h, 0.2) } });
}
const bed_single = (s, { c }) => bed(s, c, 1);
const bed_double = (s, { c }) => bed(s, c, 2);

// ---------- Iluminación ----------
function lamp_floor(s, { c, st }) {
  const on = st === 1, warm = '#fff1c2';
  s.shadowEllipse(0.5, 0.5, 0.24, 0.24, 0.24);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.2, mix(c, warm, 0.6), 0.3));
  s.cyl('z', 0.5, 0.5, 0.2, 0.18, 0, 0.06, '#34353f');
  s.cyl('z', 0.5, 0.5, 0.025, 0.025, 0.06, 1.62, '#a7adb7', { seg: 10 });
  const shc = on ? mix(c, warm, 0.5) : shade(c, -0.08);
  s.cyl('z', 0.5, 0.5, 0.31, 0.2, 1.48, 1.96, shc, { seg: 22, k: on ? 0.08 : 0, faces: { top: on ? warm : shade(c, -0.3) }, decal: { top: (x, w, h) => { if (on) glow(x, w / 2, h / 2, w * 0.5, '#ffffff', 0.8); } } });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 1.5); glow(ctx, x, y, 44, mix(c, warm, 0.6), 0.32); glow(ctx, x, y + 2, 14, '#ffffff', 0.45); });
}

function lamp_lava(s, { c, st, t }) {
  const on = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.2, 0.2, 0.24);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 0.8, c, 0.28));
  s.cyl('z', 0.5, 0.5, 0.17, 0.09, 0, 0.32, '#3b3f4a', { seg: 20 });
  s.custom([0.38, 0.38, 0.32, 0.62, 0.62, 0.92], (ctx) => {
    const [cx, yb] = s.P(0.5, 0.5, 0.32), yt = s.P(0.5, 0.5, 0.92)[1];
    const rb = 0.095 * 45, rm = 0.12 * 45, rt = 0.065 * 45;
    const ym = yb - (yb - yt) * 0.35;
    const glass = () => {
      ctx.beginPath(); ctx.moveTo(cx - rb, yb); ctx.quadraticCurveTo(cx - rm - 1, ym, cx - rt, yt);
      ctx.lineTo(cx + rt, yt); ctx.quadraticCurveTo(cx + rm + 1, ym, cx + rb, yb);
      ctx.ellipse(cx, yb, rb, rb * 0.5, 0, 0, Math.PI); ctx.closePath();
    };
    const liq = on ? mix(c, '#ffffff', 0.1) : shade(c, -0.55);
    const g = ctx.createLinearGradient(cx - rm, 0, cx + rm, 0);
    g.addColorStop(0, shade(liq, on ? 0.2 : 0)); g.addColorStop(0.5, liq); g.addColorStop(1, shade(liq, -0.35));
    ctx.save(); glass(); ctx.fillStyle = g; ctx.fill(); ctx.clip();
    const blob = on ? YELLOW === c ? PINK : mix(YELLOW, c, 0.25) : shade(c, -0.25);
    ctx.fillStyle = blob;
    const H = yb - yt;
    if (on) {
      const ph = t / 1000;
      const bl = [[0, 0.8, 4.2, 0.6], [1.7, 0.55, 3.2, 0.9], [3.1, 0.7, 2.6, 1.3], [4.4, 0.45, 3.6, 0.7]];
      for (const [o, sp, r, wob] of bl) {
        const k = (Math.sin(ph * sp + o) + 1) / 2;
        dotc(ctx, cx + Math.sin(ph * wob + o * 2) * 2.2, yb - 3 - k * (H - 8), r, blob);
      }
      ctx.fillStyle = blob; ctx.beginPath(); ctx.ellipse(cx, yb - 1, rb, 3, 0, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(cx, yb - 2, rb, 4, 0, 0, TAU); ctx.fill();
      dotc(ctx, cx + 1, yb - 6, 2.5, blob);
    }
    ctx.fillStyle = rgba('#ffffff', 0.35); ctx.fillRect(cx - rm * 0.55, yt + 3, 1.2, H - 6);
    ctx.restore();
    glass(); ctx.strokeStyle = outlineOf(c); ctx.lineWidth = 1; ctx.stroke();
  });
  s.cyl('z', 0.5, 0.5, 0.065, 0.045, 0.92, 1.08, '#3b3f4a', { seg: 14 });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 0.62); glow(ctx, x, y, 30, c, 0.3); });
}

function neon_hex(s, { c, st }) {
  const on = st === 1;
  s.shadowRect(0.28, 0.33, 0.72, 0.67, 0.22);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 0.9, c, 0.25));
  s.box(0.3, 0.35, 0, 0.7, 0.65, 0.1, '#25262e', { decal: { top: (x, w, h) => fr(x, w / 2 - 2, h / 2 - 1, 4, 2, on ? c : '#444') } });
  s.box(0.475, 0.475, 0.1, 0.525, 0.525, 0.32, '#3a3b45');
  s.custom([0.2, 0.45, 0.3, 0.8, 0.55, 1.5], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.87), r = 17;
    const p = hexPts(x, y, r);
    if (on) glow(ctx, x, y, 40, c, 0.28);
    hexPath(ctx, x, y, r);
    // hexágono interior (adorno abstracto)
    hexPts(x, y, r * 0.5).forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
    ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    neonStroke(ctx, c, on, 2.2);
    // soportes
    for (const k of [2, 4]) { fr(ctx, p[k][0] - 1, p[k][1] - 1, 2, 2, '#9aa0aa'); }
  });
}

// ---------- Decoración ----------
function bookshelf(s, { c }) {
  const inner = shade(c, -0.18), r = rng(42);
  s.shadowRect(0.0, 0.08, 2.0, 0.95, 0.24);
  s.box(0.04, 0.08, 0, 1.96, 0.16, 2.34, inner, { decal: { back: (x, w, h) => { for (let i = 1; i < 6; i++) line(x, (w * i) / 6, 0, (w * i) / 6, h, rgba(shade(c, -0.5), 0.3), 0.6); } } });
  s.box(0, 0.08, 0, 0.08, 0.92, 2.34, c, { decal: { front: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.box(1.92, 0.08, 0, 2, 0.92, 2.34, c);
  s.box(-0.02, 0.06, 2.34, 2.02, 0.94, 2.42, c, { decal: { top: (x, w, h) => sheen(x, w, h, 0.15) } });
  const levels = [0, 0.6, 1.18, 1.76];
  levels.forEach((z, li) => {
    s.box(0.08, 0.16, z, 1.92, 0.92, z + 0.07, c, { decal: { front: (x, w, h) => sheen(x, w, h, 0.18) } });
    let u = 0.12;
    const z0 = z + 0.07;
    const deco = li === 1 ? 1.25 : li === 3 ? 0.35 : -1;
    while (u < 1.86) {
      if (deco > 0 && u >= deco && u < deco + 0.3) {
        if (li === 1) { s.cyl('z', u + 0.15, 0.55, 0.1, 0.12, z0, z0 + 0.16, '#d26a3c', { seg: 12 }); s.ball(u + 0.15, 0.55, z0 + 0.3, 0.12, '#38a35a'); }
        else { s.box(u + 0.04, 0.4, z0, u + 0.26, 0.7, z0 + 0.06, '#3b2a20'); s.cyl('z', u + 0.15, 0.55, 0.05, 0.1, z0 + 0.06, z0 + 0.26, YELLOW, { seg: 12 }); }
        u += 0.34; continue;
      }
      const bw = 0.06 + r() * 0.06, bh = 0.34 + r() * 0.16;
      if (u + bw > 1.88) break;
      const col = BOOKS[Math.floor(r() * BOOKS.length)];
      const bd = 0.58 + r() * 0.12;
      s.box(u, 0.2, z0, u + bw, 0.2 + bd, z0 + bh, col, { lw: 0.8, decal: { front: (x, w, h) => { fr(x, 0, h * 0.18, w, 1, rgba('#ffffff', 0.45)); fr(x, 0, h * 0.75, w, 0.8, rgba('#000', 0.25)); } } });
      u += bw + (r() < 0.15 ? 0.04 : 0.006);
    }
  });
}

function tvScreen(x, w, h, on, t) {
  const X = 2, Y = 2, W = w - 4, H = h - 4;
  if (!on) {
    fr(x, X, Y, W, H, '#0c0d11');
    x.fillStyle = rgba('#ffffff', 0.07); x.beginPath(); x.moveTo(X + W * 0.5, Y); x.lineTo(X + W * 0.68, Y); x.lineTo(X + W * 0.38, Y + H); x.lineTo(X + W * 0.2, Y + H); x.fill();
    return;
  }
  x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
  const g = x.createLinearGradient(0, Y, 0, Y + H);
  g.addColorStop(0, '#2a1457'); g.addColorStop(0.55, '#d63470'); g.addColorStop(1, '#ffb347');
  x.fillStyle = g; x.fillRect(X, Y, W, H);
  // sol con franjas
  const sx = X + W * 0.62, sy = Y + H * 0.62, sr = H * 0.26;
  x.fillStyle = '#ffe066'; x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.fill();
  for (let i = 0; i < 3; i++) fr(x, sx - sr, sy + i * 2.4, sr * 2, 1, '#e8437a');
  // ciudad que se desplaza
  const off = (t / 40) % 64;
  x.fillStyle = '#1b0f33';
  for (let k = -1; k < Math.ceil(W / 64) + 1; k++) {
    const bx = X + k * 64 - off;
    const hs = [10, 16, 8, 20, 12, 7, 14, 18];
    hs.forEach((bh, i) => x.fillRect(bx + i * 8, Y + H - bh * (H / 34), 7, bh * (H / 34)));
  }
  x.fillStyle = rgba('#ffd84a', 0.8);
  for (let k = -1; k < Math.ceil(W / 64) + 1; k++) for (let i = 0; i < 8; i++) if ((i * 7 + k) % 3 === 0) x.fillRect(X + k * 64 - off + i * 8 + 2, Y + H - 4, 1.2, 1.2);
  // "EN VIVO"
  dotc(x, X + 4, Y + 4, 1.5, Math.floor(t / 500) % 2 ? '#ff3b3b' : '#ff9a9a');
  for (let i = 0; i < H; i += 2) fr(x, X, Y + i, W, 0.5, 'rgba(0,0,0,0.12)');
  x.restore();
}
function tv(s, { st, t }) {
  const on = st === 1;
  s.shadowRect(0.06, 0.16, 1.96, 0.92, 0.24);
  s.box(0.08, 0.18, 0, 1.92, 0.88, 0.42, '#2b2d38', { decal: { front: (x, w, h) => { line(x, w / 2, 2, w / 2, h - 2, rgba('#000', 0.4), 0.8); fr(x, w * 0.25 - 3, h / 2, 6, 1.2, '#8b909c'); fr(x, w * 0.75 - 3, h / 2, 6, 1.2, '#8b909c'); dotc(x, w - 4, h - 3, 0.8, on ? '#47ff9a' : '#ff4d4d'); }, top: (x, w, h) => sheen(x, w, h, 0.12) } });
  s.box(0.6, 0.38, 0.42, 1.4, 0.68, 0.46, '#17181d');
  s.box(0.92, 0.44, 0.46, 1.08, 0.5, 0.64, '#17181d');
  s.box(0.38, 0.7, 0.42, 1.62, 0.82, 0.5, '#1d1e24', { decal: { front: (x, w, h) => { for (let i = 2; i < w - 2; i += 2) fr(x, i, 1, 1, h - 2, rgba('#000', 0.35)); } } });
  s.box(0.04, 0.5, 0.6, 1.96, 0.58, 1.66, '#131418', { decal: { front: (x, w, h) => tvScreen(x, w, h, on, t), back: (x, w, h) => { fr(x, w * 0.2, h * 0.2, w * 0.6, h * 0.6, '#1d1e24'); hexLogo(x, w / 2, h / 2, 4, {}); } } });
  if (on && s.faceVisible(0, 1, 0)) s.over((ctx) => { const [x, y] = s.P(1, 0.7, 1.1); glow(ctx, x, y, 46, '#d63470', 0.16); });
}

function fridge(s, { c, st }) {
  const open = st === 1, gr = '#9aa0aa';
  s.shadowRect(0.08, 0.1, 0.94, 0.9, 0.24);
  const closed = (x, w, h) => {
    const fz = h * 0.33;
    line(x, 1, fz, w - 1, fz, rgba('#000', 0.35), 0.9);
    fr(x, w - 4.6, fz - 9, 1.6, 6, gr); fr(x, w - 4.6, fz + 4, 1.6, 12, gr);
    hexLogo(x, 6, h - 6, 2.2, {});
    sheen(x, w, h, 0.16);
  };
  const interior = (x, w, h) => {
    const fz = h * 0.33;
    line(x, 1, fz, w - 1, fz, rgba('#000', 0.35), 0.9);
    fr(x, w - 4.6, fz - 9, 1.6, 6, gr);
    fr(x, 1.5, fz + 1.5, w - 3, h - fz - 3, '#fff6dc');
    glow(x, w / 2, fz + 4, w * 0.8, '#fff9e8', 0.8);
    for (let i = 1; i < 3; i++) fr(x, 1.5, fz + ((h - fz) * i) / 3, w - 3, 1, '#d5cfc0');
    const y1 = fz + (h - fz) / 3, y2 = fz + ((h - fz) * 2) / 3, y3 = h - 1.5;
    fr(x, 4, y1 - 7, 3, 7, '#ffffff'); fr(x, 4, y1 - 8, 3, 1, '#3a86ff');
    fr(x, 9, y1 - 6, 3.5, 6, '#ff9d2e');
    fr(x, 15, y1 - 4, 6, 4, PINK); fr(x, 15, y1 - 4.5, 6, 1, '#ffffff');
    fr(x, 5, y2 - 3.5, 8, 3.5, '#2fb67c'); dotc(x, 17, y2 - 2.2, 2.2, '#e23b3b');
    fr(x, 4, y3 - 4, w - 8, 3.5, rgba('#9ad3ff', 0.8));
  };
  s.box(0.1, 0.12, 0, 0.9, 0.86, 2.0, c, { decal: { front: open ? interior : closed, right: (x, w, h) => sheen(x, w, h, 0.12), top: (x, w, h) => sheen(x, w, h, 0.15) } });
  if (open) {
    s.box(0.08, 0.86, 0.02, 0.16, 1.6, 1.3, c, {
      decal: {
        right: (x, w, h) => { fr(x, 2, 2, w - 4, h - 4, shade(c, -0.08)); for (let i = 1; i < 4; i++) { const y = (h * i) / 4; fr(x, 3, y, w - 6, 1.5, '#d5cfc0'); fr(x, 5, y - 5, 2.5, 5, '#7fd36b'); fr(x, 10, y - 6, 2.5, 6, '#ffcf4a'); } },
        left: (x, w, h) => { fr(x, 2.5, 4, 1.6, 12, gr); sheen(x, w, h, 0.15); },
      },
    });
    if (s.faceVisible(0, 1, 0)) s.over((ctx) => { const [x, y] = s.P(0.5, 0.95, 0.7); glow(ctx, x, y, 26, '#fff4cf', 0.22); });
  }
}

function arcadeScreen(x, w, h, on, t) {
  const X = 2, Y = 2, W = w - 4, H = h - 4;
  fr(x, 0, 0, w, h, '#0b0b10');
  if (!on) { x.fillStyle = rgba('#ffffff', 0.08); x.fillRect(X + W * 0.15, Y, W * 0.18, H); return; }
  x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
  fr(x, X, Y, W, H, '#14082a');
  const f = Math.floor(t / 100);
  for (let i = 0; i < 9; i++) fr(x, X + ((i * 37 + f * (1 + (i % 3))) % W), Y + ((i * 13) % H), 0.8, 0.8, '#ffffff');
  const cols = [PINK, YELLOW, '#47d7ff'];
  const dx = Math.sin(t / 600) * 3;
  for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) {
    const ax = X + 3 + i * 5 + dx, ay = Y + 2.5 + r * 4.5, cc = cols[(i + r) % 3];
    fr(x, ax, ay, 3, 2, cc); fr(x, ax - 0.6, ay + 2, 1, 1, cc); fr(x, ax + 2.6, ay + 2, 1, 1, cc);
  }
  const sx = X + W / 2 + Math.sin(t / 450) * (W / 3);
  fr(x, sx - 2, Y + H - 3, 4, 2, '#47ff9a'); fr(x, sx - 0.5, Y + H - 4, 1, 1, '#47ff9a');
  if (f % 4 < 3) fr(x, sx - 0.3, Y + H - 6 - (f % 4) * 3, 0.7, 1.6, '#ffffff');
  x.restore();
}
function arcade(s, { c, st, t }) {
  const on = st === 1, dk = '#1d1c24';
  const art = (x, w, h) => {
    x.fillStyle = dk; x.beginPath(); x.moveTo(0, h * 0.25); x.lineTo(w, h * 0.05); x.lineTo(w, h * 0.45); x.lineTo(0, h * 0.7); x.fill();
    x.fillStyle = c === YELLOW ? PINK : YELLOW; x.beginPath(); x.moveTo(0, h * 0.72); x.lineTo(w, h * 0.47); x.lineTo(w, h * 0.55); x.lineTo(0, h * 0.8); x.fill();
    sheen(x, w, h, 0.12);
  };
  s.shadowRect(0.12, 0.2, 0.9, 0.95, 0.26);
  s.box(0.14, 0.22, 0, 0.86, 0.82, 1.05, c, {
    decal: {
      front: (x, w, h) => {
        fr(x, w / 2 - 6, h * 0.35, 12, 14, '#141418');
        for (const k of [-3, 3]) { fr(x, w / 2 + k - 1, h * 0.35 + 3, 2, 5, on ? YELLOW : '#5a5a5a'); }
        fr(x, 0, h - 3, w, 3, dk);
      },
      left: art, right: art,
    },
  });
  s.prism('u', [[0.22, 1.05], [0.94, 1.05], [0.94, 1.12], [0.62, 1.27], [0.22, 1.27]], 0.12, 0.88, dk, {
    decal: {
      e2: (x, w, h) => {
        dotc(x, w * 0.3, h * 0.5, 2.6, '#0d0d10'); dotc(x, w * 0.3, h * 0.5 - 1.5, 1.8, '#e23b3b');
        const bc = [PINK, YELLOW, '#47d7ff'];
        for (let i = 0; i < 3; i++) dotc(x, w * (0.55 + i * 0.1), h * (0.45 + (i % 2) * 0.12), 1.4, bc[i]);
      },
    },
  });
  s.prism('u', [[0.22, 1.27], [0.62, 1.27], [0.48, 1.84], [0.22, 1.84]], 0.14, 0.86, c, {
    decal: { e1: (x, w, h) => arcadeScreen(x, w, h, on, t), left: art, right: art },
  });
  s.box(0.12, 0.18, 1.84, 0.88, 0.66, 2.12, c, {
    decal: {
      front: (x, w, h) => {
        fr(x, 1.5, 1.5, w - 3, h - 3, on ? '#2a0f1f' : '#1a1a1f');
        if (on) glow(x, w / 2, h / 2, w * 0.6, c === PINK ? YELLOW : PINK, 0.45);
        const hh = Math.min(h * 0.5, 5), ww = wordWidth('ARCADE', hh);
        drawWord(x, 'ARCADE', (w - ww) / 2, (h - hh) / 2, hh, on ? '#ffffff' : '#666', 1);
      },
    },
  });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.6, 1.55); glow(ctx, x, y, 26, '#47d7ff', 0.16); });
}

function jukebox(s, { st, t }) {
  const on = st === 1, body = '#8a2338', chrome = '#d6dbe2';
  s.shadowRect(0.08, 0.2, 0.92, 0.86, 0.26);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.7, 0.9, PINK, 0.22));
  s.box(0.1, 0.22, 0, 0.9, 0.82, 0.07, chrome);
  const hue = (k) => ['#FE3377', '#FFCC00', '#47d7ff', '#2fb67c', '#8e5cf7'][(k + Math.floor(t / 140)) % 5];
  s.box(0.12, 0.24, 0.07, 0.88, 0.8, 1.1, body, {
    decal: {
      front: (x, w, h) => {
        fr(x, 4, h * 0.42, w - 8, h * 0.5, '#d9a441');
        for (let i = 0; i < 6; i++) fr(x, 4 + (i * (w - 8)) / 6 + 1.5, h * 0.42, 1.2, h * 0.5, rgba('#7a4a10', 0.6));
        fr(x, 3, h * 0.08, w - 6, h * 0.26, '#1a1418');
        for (let i = 0; i < 5; i++) fr(x, 5 + i * ((w - 10) / 5), h * 0.12, (w - 10) / 5 - 1, 2, on ? hue(i) : '#5a4a50');
        for (let i = 0; i < 6; i++) dotc(x, 6 + i * ((w - 12) / 5), h * 0.27, 0.9, chrome);
        fr(x, 1, 0, 2, h, on ? hue(0) : '#6a4250'); fr(x, w - 3, 0, 2, h, on ? hue(2) : '#6a4250');
        sheen(x, w, h, 0.12);
      },
    },
  });
  const arch = [];
  for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI; arch.push([0.5 + 0.38 * Math.cos(a), 1.1 + 0.42 * Math.sin(a)]); }
  s.prism('v', arch, 0.24, 0.8, body, {
    decal: {
      front: (x, w, h) => {
        const cx = w / 2, cy = h;
        x.lineWidth = 2.2;
        for (let i = 0; i < 3; i++) { x.strokeStyle = on ? hue(i + 1) : '#6a4250'; x.beginPath(); x.arc(cx, cy, w / 2 - 1.5 - i * 2.4, Math.PI, TAU); x.stroke(); }
        x.fillStyle = '#1a1418'; x.beginPath(); x.arc(cx, cy, w / 2 - 8.5, Math.PI, TAU); x.fill();
        x.fillStyle = '#c9ced6'; x.beginPath(); x.ellipse(cx, cy - 1, w * 0.18, 2.2, 0, 0, TAU); x.fill();
        dotc(x, cx, cy - 1, 0.9, PINK);
        if (on) glow(x, cx, cy, w * 0.5, PINK, 0.25);
      },
      e0: (x, w, h) => sheen(x, w, h, 0.2), e1: (x, w, h) => sheen(x, w, h, 0.2),
    },
  });
  if (on) s.over((ctx) => {
    const [x, y] = s.P(0.5, 0.8, 1.6);
    for (let i = 0; i < 3; i++) {
      const ph = ((t / 900 + i / 3) % 1);
      ctx.fillStyle = rgba(['#FE3377', '#FFCC00', '#47d7ff'][i], 1 - ph);
      const nx = x + 10 + i * 4 + Math.sin(ph * 6 + i) * 3, ny = y - 4 - ph * 18;
      ctx.beginPath(); ctx.ellipse(nx, ny, 1.8, 1.4, -0.4, 0, TAU); ctx.fill();
      ctx.fillRect(nx + 1.2, ny - 5, 0.8, 5);
    }
  });
}

function trophy(s, { c }) {
  s.shadowRect(0.3, 0.3, 0.7, 0.7, 0.24);
  s.box(0.3, 0.3, 0, 0.7, 0.7, 0.16, '#3b2a20', { decal: { front: (x, w, h) => fr(x, w * 0.25, h * 0.3, w * 0.5, h * 0.4, YELLOW), right: (x, w, h) => sheen(x, w, h, 0.1) } });
  s.box(0.37, 0.37, 0.16, 0.63, 0.63, 0.22, shade(c, -0.2));
  s.cyl('z', 0.5, 0.5, 0.035, 0.035, 0.22, 0.42, c, { seg: 10 });
  s.cyl('z', 0.5, 0.5, 0.07, 0.2, 0.4, 0.74, c, { seg: 22, k: 0.04, faces: { top: shade(c, -0.45) } });
  s.custom([0.2, 0.45, 0.45, 0.8, 0.55, 0.72], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.6);
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(x + d * 9.5, y - 2, 3.5, 4.5, 0, d < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, d < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
      ctx.strokeStyle = outlineOf(c); ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // brillo y estrella
    ctx.fillStyle = rgba('#ffffff', 0.55); ctx.fillRect(x - 5, y - 6, 1.4, 7);
    star(ctx, x + 7, y - 16, 3, '#ffffff', 0.9);
  });
}
function star(ctx, x, y, r, c, a = 1) {
  ctx.fillStyle = rgba(c, a); ctx.beginPath();
  for (let k = 0; k < 8; k++) { const rr2 = k % 2 ? r * 0.3 : r; const an = (k / 8) * TAU - Math.PI / 2; ctx.lineTo(x + rr2 * Math.cos(an), y + rr2 * Math.sin(an)); }
  ctx.closePath(); ctx.fill();
}

// ---------- Plantas ----------
const LEAF = ['#2e8b4a', '#38a35a', '#4bbf6b', '#257a3e'];
function leaf(ctx, x0, y0, ang, len, wd, col) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const x1 = x0 + dx * len, y1 = y0 + dy * len;
  const mx = x0 + dx * len * 0.5, my = y0 + dy * len * 0.5;
  ctx.beginPath(); ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx + nx * wd, my + ny * wd, x1, y1);
  ctx.quadraticCurveTo(mx - nx * wd, my - ny * wd, x0, y0);
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = shade(col, -0.45); ctx.lineWidth = 0.8; ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.28); ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx + nx * wd * 0.15, my + ny * wd * 0.15, x1, y1); ctx.stroke();
}
function pot(s, r0, r1, h, col, rim = true) {
  s.cyl('z', 0.5, 0.5, r0, r1, 0, h, col, { seg: 20, faces: { top: '#4a3020' }, decal: { top: (x, w, hh) => { dotc(x, w * 0.4, hh * 0.45, 1, '#6b4a30'); dotc(x, w * 0.62, hh * 0.6, 0.8, '#6b4a30'); } } });
  if (rim) s.cyl('z', 0.5, 0.5, r1 + 0.02, r1 + 0.02, h - 0.06, h, shade(col, 0.08), { seg: 20, faces: { top: '#4a3020' } });
}
function plant_big(s) {
  s.shadowEllipse(0.5, 0.5, 0.34, 0.34, 0.24);
  pot(s, 0.2, 0.28, 0.5, '#c4683f');
  s.custom([0, 0, 0.5, 1, 1, 1.9], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.5);
    const L = [
      [-2.2, 36, 9, 3], [-0.9, 38, 9, 3], [-1.6, 44, 10, 0], [-2.7, 30, 8, 1], [-0.45, 30, 8, 1],
      [-1.2, 26, 9, 2], [-1.95, 27, 9, 2], [-2.95, 22, 7, 1], [-0.2, 22, 7, 1], [-1.55, 20, 8, 2],
    ];
    ctx.strokeStyle = '#2a5e34'; ctx.lineWidth = 1.4;
    for (const [a, len] of L) { ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x + Math.cos(a) * len * 0.35, y - 1 + Math.sin(a) * len * 0.35); ctx.stroke(); }
    for (const [a, len, wd, ci] of L) leaf(ctx, x + Math.cos(a) * len * 0.25, y - 1 + Math.sin(a) * len * 0.25, a, len * 0.85, wd, LEAF[ci]);
  });
}
function plant_small(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.22, 0.22, 0.24);
  pot(s, 0.13, 0.17, 0.32, c, false);
  s.custom([0.25, 0.25, 0.32, 0.75, 0.75, 0.8], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.32);
    const B = [[-6, -5, 5.5, 3], [6, -5, 5.5, 0], [0, -9, 6.5, 1], [-3, -14, 5, 2], [4, -13, 5, 1], [0, -4, 5.5, 2]];
    for (const [dx, dy, r, ci] of B) {
      dotc(ctx, x + dx, y + dy, r + 0.8, shade(LEAF[ci], -0.5));
      dotc(ctx, x + dx, y + dy, r, LEAF[ci]);
      dotc(ctx, x + dx - r * 0.3, y + dy - r * 0.35, r * 0.4, rgba('#ffffff', 0.25));
    }
    for (const [dx, dy, cc] of [[-4, -12, PINK], [3, -8, YELLOW], [6, -14, PINK], [-6, -6, '#ffffff']]) { dotc(ctx, x + dx, y + dy, 1.4, cc); dotc(ctx, x + dx, y + dy, 0.5, YELLOW); }
  });
}
function cactus(s) {
  s.shadowEllipse(0.5, 0.5, 0.22, 0.22, 0.24);
  pot(s, 0.14, 0.18, 0.3, '#d97b4a');
  s.custom([0.3, 0.3, 0.3, 0.7, 0.7, 1.45], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.3);
    const g = '#3f9a52', ol = '#1f5a2c';
    const cap = (cx, top, bot, w2) => { rr(ctx, cx - w2, top, w2 * 2, bot - top, w2); };
    const part = (fn) => { fn(); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.stroke(); };
    // brazos
    part(() => { ctx.beginPath(); rr(ctx, x - 14, y - 26, 6, 14, 3); });
    part(() => { ctx.beginPath(); rr(ctx, x - 14, y - 16, 10, 5, 2.5); });
    part(() => { ctx.beginPath(); rr(ctx, x + 8, y - 34, 6, 16, 3); });
    part(() => { ctx.beginPath(); rr(ctx, x + 4, y - 22, 10, 5, 2.5); });
    part(() => cap(x, y - 38, y - 2, 6));
    ctx.strokeStyle = rgba('#ffffff', 0.25); ctx.lineWidth = 0.8;
    line(ctx, x - 2.5, y - 34, x - 2.5, y - 5, rgba('#ffffff', 0.28), 0.8);
    line(ctx, x + 2, y - 34, x + 2, y - 5, rgba('#000', 0.18), 0.8);
    for (let i = 0; i < 6; i++) dotc(ctx, x + (i % 2 ? 4 : -4), y - 8 - i * 5, 0.5, '#e9f5d0');
    // flor
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; dotc(ctx, x + Math.cos(a) * 2.2, y - 39 + Math.sin(a) * 1.6, 1.7, PINK); }
    dotc(ctx, x, y - 39, 1, YELLOW);
  });
}

// ---------- Pisos y tapetes ----------
function rug_round(s, { c }) {
  const lt = shade(c, 0.35), dk = shade(c, -0.3);
  s.cyl('z', 1, 1, 0.96, 0.96, 0, 0.025, c, {
    seg: 36, outline: shade(c, -0.55),
    decal: {
      top: (x, w, h) => {
        const cx = w / 2, cy = h / 2, R = w / 2;
        const ringc = (r, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke(); };
        ringc(R - 3, lt, 2); ringc(R - 7, dk, 1.2);
        for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; dotc(x, cx + Math.cos(a) * (R - 11), cy + Math.sin(a) * (R - 11), 1.4, lt); }
        ringc(R * 0.42, lt, 1.5);
        x.fillStyle = dk; x.beginPath(); x.arc(cx, cy, R * 0.3, 0, TAU); x.fill();
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; x.fillStyle = lt; x.beginPath(); x.ellipse(cx + Math.cos(a) * R * 0.18, cy + Math.sin(a) * R * 0.18, 3.5, 1.5, a, 0, TAU); x.fill(); }
        dotc(x, cx, cy, 2.2, lt);
      },
    },
  });
}
function rug_long(s, { c }) {
  const lt = shade(c, 0.45), dk = shade(c, -0.35);
  const fringe = (x, w, h) => { for (let i = 1; i < w; i += 1.6) fr(x, i, 0, 0.7, h, '#e9e1d2'); };
  s.box(0.12, 0.03, 0, 0.88, 0.12, 0.01, '#e9e1d2', { outline: false, edges: false, decal: { top: fringe } });
  s.box(0.12, 2.88, 0, 0.88, 2.97, 0.01, '#e9e1d2', { outline: false, edges: false, decal: { top: fringe } });
  s.box(0.08, 0.12, 0, 0.92, 2.88, 0.025, c, {
    outline: shade(c, -0.55),
    decal: {
      top: (x, w, h) => {
        x.strokeStyle = lt; x.lineWidth = 1.4; x.strokeRect(2.5, 2.5, w - 5, h - 5);
        x.strokeStyle = dk; x.lineWidth = 0.8; x.strokeRect(5, 5, w - 10, h - 10);
        for (let i = 0; i < 3; i++) {
          const cy = h * (0.2 + i * 0.3), cx = w / 2, r = w * 0.26;
          x.fillStyle = i === 1 ? lt : dk; x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r * 0.75, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r * 0.75, cy); x.closePath(); x.fill();
          x.fillStyle = i === 1 ? dk : lt; x.beginPath(); x.moveTo(cx, cy - r * 0.45); x.lineTo(cx + r * 0.32, cy); x.lineTo(cx, cy + r * 0.45); x.lineTo(cx - r * 0.32, cy); x.closePath(); x.fill();
        }
        for (let i = 0; i < 14; i++) dotc(x, 7.5 + ((i % 2) * (w - 15)), 9 + i * ((h - 18) / 13), 0.8, lt);
      },
    },
  });
}
function floor_tile(s, { c }) {
  s.box(0.01, 0.01, 0, 0.99, 0.99, 0.025, c, {
    outline: shade(c, -0.45),
    decal: {
      top: (x, w, h) => {
        x.strokeStyle = rgba(lum(c) > 0.5 ? '#000000' : '#ffffff', 0.12); x.lineWidth = 1.2; x.strokeRect(2.5, 2.5, w - 5, h - 5);
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, rgba('#ffffff', 0.22)); g.addColorStop(0.45, rgba('#ffffff', 0.04)); g.addColorStop(1, rgba('#000000', 0.08));
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      },
    },
  });
}

// ---------- HUB (ids gtahub_* por compatibilidad) ----------
function gtahub_rug(s) {
  s.box(0.05, 0.05, 0, 2.95, 2.95, 0.03, '#17161b', {
    outline: '#0a0a0c',
    decal: {
      top: (x, w, h) => {
        fr(x, 3, 3, w - 6, h - 6, PINK); fr(x, 7, 7, w - 14, h - 14, '#17161b');
        x.strokeStyle = YELLOW; x.lineWidth = 1; x.strokeRect(10, 10, w - 20, h - 20);
        for (const [a, b] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { dotc(x, a, b, 2.4, YELLOW); dotc(x, a, b, 1, PINK); }
        // patrón de hexágonos tenue
        x.strokeStyle = rgba('#ffffff', 0.05); x.lineWidth = 0.8;
        for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { hexPath(x, 16 + i * 11 + (j % 2) * 5.5, 16 + j * 9.5, 5); x.stroke(); }
        // Palabra HUB al centro dentro de un rombo de neón (sin logo)
        const cx = w / 2, cy = h / 2;
        x.strokeStyle = rgba(PINK, 0.9); x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(cx, cy - h * 0.3); x.lineTo(cx + w * 0.3, cy); x.lineTo(cx, cy + h * 0.3); x.lineTo(cx - w * 0.3, cy); x.closePath(); x.stroke();
        const hh = 12, ww = wordWidth('HUB', hh);
        drawWord(x, 'HUB', cx - ww / 2 + 0.7, cy - hh / 2 + 0.7, hh, '#000', 3);
        drawWord(x, 'HUB', cx - ww / 2, cy - hh / 2, hh, '#ffffff', 2.6);
      },
    },
  });
}
function gtahub_statue(s) {
  const marble = '#ece9e3', gold = YELLOW;
  s.shadowRect(0.08, 0.08, 0.94, 0.94, 0.26);
  s.box(0.08, 0.08, 0, 0.92, 0.92, 0.12, '#cfcbc3');
  const plaque = (x, w, h) => {
    const r = rng(3); x.strokeStyle = rgba('#9b968c', 0.3); x.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(r() * w, 0); x.quadraticCurveTo(r() * w, h / 2, r() * w, h); x.stroke(); }
    fr(x, 3, h * 0.36, w - 6, 9, gold); fr(x, 3.8, h * 0.36 + 0.8, w - 7.6, 7.4, '#e0b400');
    const hh = Math.min(4.4, ((w - 9) * 6) / 31), ww = wordWidth('HUB', hh);
    drawWord(x, 'HUB', (w - ww) / 2, h * 0.36 + 4.5 - hh / 2, hh, '#3b2a00', 0.8);
    sheen(x, w, h, 0.12);
  };
  s.box(0.18, 0.18, 0.12, 0.82, 0.82, 0.86, marble, { decal: { front: plaque, right: (x, w, h) => { const r = rng(5); x.strokeStyle = rgba('#9b968c', 0.3); x.lineWidth = 0.6; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(r() * w, 0); x.quadraticCurveTo(r() * w, h / 2, r() * w, h); x.stroke(); } } } });
  s.box(0.12, 0.12, 0.86, 0.88, 0.88, 0.96, '#cfcbc3', { decal: { front: (x, w, h) => fr(x, 0, h / 2 - 0.6, w, 1.2, gold), right: (x, w, h) => fr(x, 0, h / 2 - 0.6, w, 1.2, gold) } });
  s.cyl('z', 0.5, 0.5, 0.06, 0.035, 0.96, 1.45, gold, { seg: 12 });
  s.custom([0.2, 0.2, 1.3, 0.28, 0.28, 2.0], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 1.66);
    hexPath(ctx, x, y, 21); ctx.lineJoin = 'round';
    ctx.strokeStyle = outlineOf(gold); ctx.lineWidth = 4.6; ctx.stroke();
    ctx.strokeStyle = gold; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = 0.8; ctx.stroke();
    glow(ctx, x, y, 30, PINK, 0.2);
  });
  // Esfera de cristal rosa flotando dentro del aro
  s.custom([0.3, 0.3, 1.45, 0.7, 0.7, 1.87], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 1.66), r = 9;
    const g = ctx.createRadialGradient(x - 3, y - 3.5, 1, x, y, r);
    g.addColorStop(0, '#ffe3ee'); g.addColorStop(0.35, '#ff7aa6'); g.addColorStop(1, '#a3164f');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a0a1c'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.strokeStyle = rgba(YELLOW, 0.8); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r * 0.35, -0.35, 0, TAU); ctx.stroke();
    dotc(ctx, x - 3.2, y - 3.6, 1.6, rgba('#ffffff', 0.85));
  });
  s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 2.05); star(ctx, x + 14, y - 6, 3.5, '#ffffff', 0.9); star(ctx, x - 16, y + 12, 2.5, '#ffffff', 0.7); });
}

function gtahub_car(s, { c }) {
  const stripe = c === YELLOW ? '#141414' : c === '#141414' ? PINK : YELLOW;
  const glass = '#1d2736', tire = '#18181c';
  s.shadowRect(0.06, 0.12, 1.94, 2.9, 0.3);
  const wheels = [[0.62, 0.24], [2.36, 0.24]];
  const rim = (x, w, h) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
    dotc(x, cx, cy, R * 0.68, '#c9ced6'); dotc(x, cx, cy, R * 0.5, '#7d838e');
    x.strokeStyle = '#d9dde3'; x.lineWidth = 1.1;
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62); x.stroke(); }
    dotc(x, cx, cy, R * 0.16, stripe);
  };
  const side = (x, w, h, info) => {
    // franja, línea de puerta, faldón y arcos de rueda
    const p0 = info.at(info.n ? 0 : 0, 0.3, 0.38), p1 = info.at(0, 2.9, 0.38);
    x.strokeStyle = stripe; x.lineWidth = 2.4; x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); x.stroke();
    const d0 = info.at(0, 1.0, 0.18), d1 = info.at(0, 1.0, 0.54), d2 = info.at(0, 1.9, 0.18), d3 = info.at(0, 1.9, 0.52);
    line(x, d0[0], d0[1], d1[0], d1[1], rgba('#000', 0.35), 0.7); line(x, d2[0], d2[1], d3[0], d3[1], rgba('#000', 0.35), 0.7);
    const hd = info.at(0, 1.62, 0.44); fr(x, hd[0] - 2, hd[1], 4, 1.2, rgba('#000', 0.5));
    for (const [v, z] of wheels) { const q = info.at(0, v, z); x.fillStyle = '#111114'; x.beginPath(); x.arc(q[0], q[1], 9.2, Math.PI, TAU); x.fill(); x.fillRect(q[0] - 9.2, q[1], 18.4, 9); }
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba('#ffffff', 0.18)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000', 0.15));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  };
  for (const [v, z] of wheels) {
    s.cyl('u', v, z, 0.24, 0.24, 0.0, 0.26, tire, { seg: 16, sortBox: [0, v - 0.24, 0, 0.06, v + 0.24, 0.48], decal: { left: rim, right: rim } });
    s.cyl('u', v, z, 0.24, 0.24, 1.74, 2.0, tire, { seg: 16, sortBox: [1.94, v - 0.24, 0, 2.0, v + 0.24, 0.48], decal: { left: rim, right: rim } });
  }
  const prof = [[0.05, 0.15], [2.95, 0.15], [2.97, 0.33], [2.6, 0.5], [0.1, 0.56], [0.03, 0.45]];
  s.prism('u', prof, 0.06, 1.94, c, {
    decal: {
      left: side, right: side,
      e1: (x, w, h) => { fr(x, w * 0.3, 0.5, w * 0.4, h - 1, '#141418'); for (let i = 0; i < 6; i++) fr(x, w * 0.3 + 1 + i * (w * 0.4 / 6), 1, 0.8, h - 2, '#3a3a44'); fr(x, 2, h * 0.3, w * 0.16, h * 0.4, '#ffe9a6'); fr(x, w * 0.84 - 2, h * 0.3, w * 0.16, h * 0.4, '#ffe9a6'); },
      e2: (x, w, h) => { fr(x, 2, h - 4, w * 0.18, 3, '#fff6cf'); fr(x, w * 0.82 - 2, h - 4, w * 0.18, 3, '#fff6cf'); fr(x, w / 2 - 3, 0, 6, h, stripe); sheen(x, w, h, 0.25); },
      e3: (x, w, h) => { fr(x, w / 2 - 3, 0, 6, h, stripe); sheen(x, w, h, 0.22); },
      e4: (x, w, h) => fr(x, w / 2 - 3, 0, 6, h, stripe),
      e5: (x, w, h) => { fr(x, 2, 1, w * 0.26, h * 0.32, '#ff2d4a'); fr(x, w * 0.74 - 2, 1, w * 0.26, h * 0.32, '#ff2d4a'); fr(x, w * 0.36, h * 0.5, w * 0.28, h * 0.3, '#141418'); dotc(x, w * 0.42, h * 0.8, 1.3, '#9aa0aa'); dotc(x, w * 0.58, h * 0.8, 1.3, '#9aa0aa'); },
    },
  });
  const win = (x, w, h, info) => {
    const a = info.at(0, 0.82, 0.58), b = info.at(0, 2.02, 0.54), cc = info.at(0, 1.64, 0.86), d = info.at(0, 1.02, 0.88);
    x.fillStyle = glass; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(cc[0], cc[1]); x.lineTo(d[0], d[1]); x.closePath(); x.fill();
    const m0 = info.at(0, 1.42, 0.56), m1 = info.at(0, 1.38, 0.9); line(x, m0[0], m0[1], m1[0], m1[1], c, 1.6);
    x.fillStyle = rgba('#ffffff', 0.25); x.beginPath(); x.moveTo(d[0] + 3, d[1] + 1); x.lineTo(d[0] + 7, d[1] + 1); x.lineTo(a[0] + 5, a[1] - 1); x.lineTo(a[0] + 2, a[1] - 1); x.fill();
  };
  const glassF = (x, w, h) => { fr(x, 1.5, 1.2, w - 3, h - 2.4, glass); x.fillStyle = rgba('#ffffff', 0.22); x.beginPath(); x.moveTo(w * 0.2, h - 1.5); x.lineTo(w * 0.32, h - 1.5); x.lineTo(w * 0.5, 1.5); x.lineTo(w * 0.38, 1.5); x.fill(); };
  s.prism('u', [[0.75, 0.545], [2.1, 0.512], [1.65, 0.9], [1.0, 0.925], [0.62, 0.62]], 0.3, 1.7, c, {
    decal: { left: win, right: win, e1: glassF, e3: glassF, e2: (x, w, h) => { fr(x, w / 2 - 3, 0, 6, h, stripe); sheen(x, w, h, 0.25); } },
  });
  s.box(0.32, 0.1, 0.55, 0.4, 0.22, 0.74, '#1d1d22');
  s.box(1.6, 0.1, 0.55, 1.68, 0.22, 0.74, '#1d1d22');
  s.box(0.1, 0.03, 0.74, 1.9, 0.3, 0.8, c, { decal: { top: (x, w, h) => fr(x, w / 2 - 3, 0, 6, h, stripe) } });
}

// ---------- Diversión ----------
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
const SIDES = { 1: [2, 3], 2: [3, 1], 3: [1, 2], 4: [2, 6], 5: [1, 3], 6: [2, 4] };
const pipF = (n) => (x, w, h) => {
  for (const [i, j] of PIPS[n]) dotc(x, w * (0.24 + i * 0.26), h * (0.24 + j * 0.26), Math.min(w, h) * (n === 1 ? 0.14 : 0.085), n === 1 ? PINK : '#25222c');
  x.fillStyle = rgba('#ffffff', 0.35); x.fillRect(1, 1, w - 2, 1);
};
function dice(s, { st, t }) {
  const rolling = st === 0, f = Math.floor(t / 90);
  const bounce = rolling ? [0, 0.12, 0.2, 0.24, 0.2, 0.12][f % 6] : 0;
  const n = rolling ? (f * 7 + 3) % 6 + 1 : Math.min(6, Math.max(1, st));
  const [a, b] = SIDES[n];
  s.shadowRect(0.27 + bounce * 0.3, 0.27 + bounce * 0.3, 0.75 - bounce * 0.3, 0.75 - bounce * 0.3, 0.26 - bounce * 0.5);
  s.box(0.29, 0.29, bounce, 0.71, 0.71, 0.42 + bounce, '#fbfaf7', { outline: '#4a3a4a', faces: {}, decal: { top: pipF(n), front: pipF(a), right: pipF(b), left: pipF(a), back: pipF(b) } });
  if (rolling) s.over((ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.2 + bounce);
    ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 1;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + d * 17, y - 4); ctx.lineTo(x + d * 21, y - 8); ctx.moveTo(x + d * 16, y + 1); ctx.lineTo(x + d * 21, y); ctx.stroke(); }
  });
}

function teleport(s, { st, t }) {
  const act = st === 1, frame = '#3a3f52', wall = '#566080', cy = '#47d7ff';
  s.shadowRect(0.04, 0.04, 0.98, 0.98, 0.26);
  s.box(0.06, 0.06, 0, 0.94, 0.94, 0.14, frame, {
    decal: { top: (x, w, h) => { const cx = w / 2, cyy = h / 2 + 2; x.strokeStyle = act ? '#ffffff' : rgba(cy, 0.75); x.lineWidth = 1.6; x.beginPath(); x.arc(cx, cyy, w * 0.3, 0, TAU); x.stroke(); x.strokeStyle = rgba(act ? PINK : cy, 0.6); x.lineWidth = 0.8; x.beginPath(); x.arc(cx, cyy, w * 0.2, 0, TAU); x.stroke(); glow(x, cx, cyy, w * 0.4, act ? PINK : cy, act ? 0.7 : 0.35); } },
  });
  const strip = (x, w, h) => {
    const pulse = act ? 0.5 + 0.5 * Math.sin(t / 120) : 0;
    for (const a of [0.3, 0.7]) { fr(x, w * a - 1, 4, 2, h - 8, act ? mix(cy, '#ffffff', pulse * 0.6) : rgba(cy, 0.55)); }
    hexLogo(x, w / 2, 8, 3, { inner: false });
    sheen(x, w, h, 0.14);
  };
  s.box(0.08, 0.06, 0.14, 0.2, 0.94, 2.02, wall, { decal: { right: (x, w, h) => fr(x, w * 0.5 - 1, 6, 2, h - 12, act ? '#ffffff' : rgba(cy, 0.5)), front: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.box(0.8, 0.06, 0.14, 0.92, 0.94, 2.02, wall, { decal: { left: (x, w, h) => fr(x, w * 0.5 - 1, 6, 2, h - 12, act ? '#ffffff' : rgba(cy, 0.5)), right: (x, w, h) => sheen(x, w, h, 0.12), front: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.box(0.2, 0.08, 0.14, 0.8, 0.2, 2.02, shade(wall, -0.12), { decal: { front: strip } });
  if (act) {
    s.custom([0.2, 0.2, 0.14, 0.8, 0.8, 2.02], (ctx) => {
      const [x, y0] = s.P(0.5, 0.55, 0.14), y1 = s.P(0.5, 0.55, 2.0)[1];
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba('#ffffff', 0.7)); g.addColorStop(0.4, rgba(cy, 0.35)); g.addColorStop(1, rgba(PINK, 0.1));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y0, 13, 6.5, 0, 0, Math.PI); ctx.lineTo(x - 13, y1); ctx.lineTo(x + 13, y1); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const ph = ((t / 700 + i / 3) % 1), yy = y0 - ph * (y0 - y1);
        ctx.strokeStyle = rgba('#ffffff', 0.8 * (1 - ph)); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, yy, 12, 6, 0, 0, TAU); ctx.stroke();
      }
      for (let i = 0; i < 6; i++) { const ph = ((t / 500 + i * 0.37) % 1); dotc(ctx, x - 10 + ((i * 7) % 20), y0 - ph * (y0 - y1), 0.9, '#ffffff'); }
    });
  }
  s.box(0.04, 0.04, 2.02, 0.96, 0.96, 2.2, frame, {
    decal: {
      front: (x, w, h) => { fr(x, 3, 1.5, w - 6, h - 3, act ? PINK : '#25283a'); if (act) glow(x, w / 2, h / 2, w * 0.4, '#ffffff', 0.5); },
      right: (x, w, h) => fr(x, 3, h / 2 - 0.5, w - 6, 1, rgba(cy, 0.7)),
      left: (x, w, h) => fr(x, 3, h / 2 - 0.5, w - 6, 1, rgba(cy, 0.7)),
      top: (x, w, h) => sheen(x, w, h, 0.15),
    },
  });
  if (act) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 1.1); glow(ctx, x, y, 44, cy, 0.18); });
}

function gate(s, { st }) {
  const iron = '#2b2d38', gold = YELLOW, open = st === 1;
  s.shadowRect(0.04, 0.4, 0.96, 0.62, 0.22);
  s.box(0.04, 0.42, 0, 0.16, 0.58, 1.0, iron);
  s.box(0.84, 0.42, 0, 0.96, 0.58, 1.0, iron);
  s.ball(0.1, 0.5, 1.06, 0.065, gold);
  s.ball(0.9, 0.5, 1.06, 0.065, gold);
  const spear = (a0, a1) => [[a0, 0.08], [a1, 0.08], [a1, 0.8], [(a0 + a1) / 2, 0.9], [a0, 0.8]];
  if (!open) {
    s.box(0.16, 0.47, 0.2, 0.84, 0.5, 0.26, iron);
    s.box(0.16, 0.47, 0.66, 0.84, 0.5, 0.72, iron);
    for (let i = 0; i < 5; i++) { const u = 0.21 + i * 0.12; s.prism('v', spear(u, u + 0.05), 0.5, 0.53, iron, { faces: { e2: gold, e3: gold } }); }
  } else {
    s.box(0.16, 0.58, 0.2, 0.19, 1.24, 0.26, iron);
    s.box(0.16, 0.58, 0.66, 0.19, 1.24, 0.72, iron);
    for (let i = 0; i < 5; i++) { const v = 0.63 + i * 0.12; s.prism('u', spear(v, v + 0.05), 0.19, 0.22, iron, { faces: { e2: gold, e3: gold } }); }
  }
}

function fallback(s, { c, def }) {
  s.shadowRect(0.05, 0.05, def.w - 0.05, def.l - 0.05);
  s.box(0.08, 0.08, 0, def.w - 0.08, def.l - 0.08, Math.max(0.05, def.h || 0.5), c);
}

export const FLOOR = {
  chair_basic, chair_gamer, stool_bar, sofa_2, sofa_3, armchair, beanbag, throne,
  table_small, table_dining, table_coffee, desk_pc, bar_counter,
  bed_single, bed_double,
  lamp_floor, lamp_lava, neon_hex,
  bookshelf, tv, fridge, arcade, jukebox, trophy,
  plant_big, plant_small, cactus,
  rug_round, rug_long, floor_tile,
  gtahub_rug, gtahub_statue, gtahub_car,
  dice, teleport, gate,
  _fallback: fallback,
};
// Color por defecto si el catálogo no trae variantes
export const DEFAULT_COLOR = { desk_pc: '#3a3e4c', tv: '#2b2d38', jukebox: '#8a2338', plant_big: '#c4683f', cactus: '#d97b4a', gtahub_rug: '#17161b', gtahub_statue: PINK, dice: '#fbfaf7', teleport: '#566080', gate: '#2b2d38' };
export { DARK, INK, WHITE, CREAM, GRAPH, WOOD, METAL, pathPts };
