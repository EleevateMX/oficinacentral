// Dibujo de la línea "Exclusivo HUB". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
// Rarezas de la marca: oro, terciopelo rosa, negro GTAHUB y un brillo sutil.
import { PINK, YELLOW, DARK, shade, mix, rgba, outlineOf } from '../iso.js';
import { drawWord, wordWidth, neonWord, neonStroke, hexLogo, hexPath, hexPts, rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const GOLD = '#f2b916', GOLD_L = '#ffe27a', GOLD_D = '#a8740a', GOLD_DD = '#5e3d00';
const VEL_D = '#a3164a', ONYX = '#1e1d24';

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
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
// Brillo metálico de oro (franja clara diagonal)
const goldSheen = (x, w, h) => {
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#fff6c8', 0.5)); g.addColorStop(0.3, rgba('#ffffff', 0)); g.addColorStop(0.62, rgba(GOLD_DD, 0.12)); g.addColorStop(0.8, rgba('#fff2b0', 0.28)); g.addColorStop(1, rgba('#ffffff', 0));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
};
const goldPanel = (x, w, h) => {
  goldSheen(x, w, h);
  if (w > 7 && h > 7) {
    x.strokeStyle = rgba(GOLD_DD, 0.55); x.lineWidth = 0.8; x.strokeRect(2.2, 2.2, w - 4.4, h - 4.4);
    x.strokeStyle = rgba('#fff4c0', 0.55); x.lineWidth = 0.6; x.strokeRect(3.2, 3.2, w - 6.4, h - 6.4);
  }
};
const goldBand = (x, w, h) => { fr(x, 0, h / 2 - 0.8, w, 1.6, GOLD); fr(x, 0, h / 2 - 0.8, w, 0.6, GOLD_L); };
const gem = (ctx, x, y, r, c = PINK) => {
  ctx.fillStyle = shade(c, -0.35); ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r * 0.35); ctx.lineTo(x - r * 0.7, y); ctx.closePath(); ctx.fill();
  dotc(ctx, x - r * 0.25, y - r * 0.3, Math.max(0.4, r * 0.22), '#ffffff');
};
function sparkle(ctx, x, y, r, a = 1, c = '#ffffff') {
  ctx.fillStyle = rgba(c, a); ctx.beginPath();
  for (let k = 0; k < 8; k++) { const q = k % 2 ? r * 0.22 : r; const an = (k / 8) * TAU - Math.PI / 2; ctx.lineTo(x + q * Math.cos(an), y + q * Math.sin(an)); }
  ctx.closePath(); ctx.fill();
}
// Dibuja en el plano vertical v = cte (x a lo largo de u, 32 px por unidad; y hacia abajo desde z1).
// Si se ve por detrás, se refleja para que el dibujo se lea al derecho.
function onPlaneV(ctx, s, v, u0, z1, wU, fn) {
  const A = s.P(u0, v, z1), B = s.P(u0 + 1, v, z1), C = s.P(u0, v, z1 - 1);
  const ax = (B[0] - A[0]) / 32, ay = (B[1] - A[1]) / 32, cx = (C[0] - A[0]) / 32, cy = (C[1] - A[1]) / 32;
  ctx.save();
  if (s.faceVisible(0, 1, 0)) ctx.transform(ax, ay, cx, cy, A[0], A[1]);
  else { const D = s.P(u0 + wU, v, z1); ctx.transform(-ax, -ay, cx, cy, D[0], D[1]); }
  fn(ctx);
  ctx.restore();
}
function crown(ctx, x, y, sz, on = true) {
  const P = [[-1, 0], [-1, -0.42], [-1.12, -1.25], [-0.52, -0.66], [0, -1.5], [0.52, -0.66], [1.12, -1.25], [1, -0.42], [1, 0]];
  ctx.beginPath(); P.forEach(([a, b], i) => (i ? ctx.lineTo(x + a * sz, y + b * sz) : ctx.moveTo(x + a * sz, y + b * sz))); ctx.closePath();
  const g = ctx.createLinearGradient(x - sz, y - sz * 1.5, x + sz, y);
  g.addColorStop(0, GOLD_L); g.addColorStop(0.45, GOLD); g.addColorStop(1, GOLD_D);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 0.9; ctx.lineJoin = 'round'; ctx.stroke();
  fr(ctx, x - sz, y - sz * 0.42, sz * 2, sz * 0.14, rgba(GOLD_DD, 0.45));
  for (const a of [-0.6, 0, 0.6]) gem(ctx, x + a * sz, y - sz * 0.2, sz * 0.17, a ? '#3a86ff' : PINK);
  for (const [a, b] of [[-1.12, -1.25], [0, -1.5], [1.12, -1.25]]) dotc(ctx, x + a * sz, y + b * sz, sz * 0.15, on ? '#fff6d0' : GOLD_L);
}

// ---------- Trono dorado del logo ----------
function hub_throne(s) {
  s.shadowRect(-0.02, -0.02, 1.02, 1.02, 0.3);
  s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.1, GOLD, 0.2));
  const trim = (x, w, h) => { fr(x, 0, h / 2 - 0.7, w, 1.4, GOLD); };
  s.box(-0.02, -0.02, 0, 1.02, 1.02, 0.1, DARK, { decal: { top: (x, w, h) => { x.strokeStyle = GOLD; x.lineWidth = 1.1; x.strokeRect(2, 2, w - 4, h - 4); fr(x, w * 0.24, h * 0.3, w * 0.52, h * 0.7, '#8b1b45'); }, front: trim, right: trim, left: trim, back: trim } });
  const seatPanel = (x, w, h) => { goldPanel(x, w, h); gem(x, w / 2, h / 2, 2.2); };
  s.box(0.12, 0.18, 0.1, 0.88, 0.94, 0.5, GOLD, { decal: { front: seatPanel, right: seatPanel, left: seatPanel, back: goldPanel } });
  s.box(0.17, 0.36, 0.5, 0.83, 0.92, 0.74, PINK, {
    decal: { top: (x, w, h) => { for (const [a, b] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.62], [0.3, 0.9], [0.7, 0.9]]) dotc(x, w * a, h * b, 0.9, GOLD); x.strokeStyle = rgba('#ffffff', 0.25); x.lineWidth = 0.8; rr(x, 1.2, 1.2, w - 2.4, h - 2.4, 2); x.stroke(); sheen(x, w, h, 0.16); }, front: (x, w, h) => { fr(x, 0, h - 1.4, w, 1.4, GOLD); sheen(x, w, h, 0.1); } },
  });
  const backF = (x, w, h) => {
    goldSheen(x, w, h);
    x.fillStyle = PINK; x.beginPath();
    x.moveTo(w * 0.17, h - 2); x.lineTo(w * 0.17, h * 0.3); x.lineTo(w * 0.5, h * 0.12); x.lineTo(w * 0.83, h * 0.3); x.lineTo(w * 0.83, h - 2); x.closePath(); x.fill();
    x.strokeStyle = GOLD_L; x.lineWidth = 0.9; x.stroke();
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, rgba('#ffffff', 0.18)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', 0.15));
    x.fillStyle = g; x.fill();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) dotc(x, w * (0.3 + i * 0.2), h * (0.68 + j * 0.14), 0.8, GOLD_L);
    hexLogo(x, w / 2, h * 0.43, w * 0.17, { ring: GOLD_L, outline: 'rgba(20,20,20,0.55)' });
  };
  s.prism('v', [[0.1, 0.5], [0.9, 0.5], [0.9, 1.92], [0.5, 2.28], [0.1, 1.92]], 0.16, 0.36, GOLD, { decal: { front: backF, back: (x, w, h) => { goldPanel(x, w, h); hexLogo(x, w / 2, h * 0.45, w * 0.14, { inner: false, top: GOLD_L, left: GOLD, right: GOLD_D }); }, e1: goldSheen, e3: goldSheen } });
  const armP = (x, w, h) => { goldSheen(x, w, h); fr(x, 0, 1, w, 1, GOLD_L); };
  s.box(0.06, 0.36, 0.5, 0.2, 0.92, 0.98, GOLD, { decal: { right: armP, left: armP, front: armP } });
  s.box(0.8, 0.36, 0.5, 0.94, 0.92, 0.98, GOLD, { decal: { right: armP, left: armP, front: armP } });
  s.ball(0.13, 0.92, 1.0, 0.08, GOLD, { outline: GOLD_DD });
  s.ball(0.87, 0.92, 1.0, 0.08, GOLD, { outline: GOLD_DD });
  s.custom([0.25, 0.16, 2.3, 0.75, 0.36, 2.75], (ctx) => {
    const [x, y] = s.P(0.5, 0.26, 2.3);
    glow(ctx, x, y - 6, 18, YELLOW, 0.22);
    crown(ctx, x, y + 1, 7.5);
  });
  s.over((ctx) => { const [x, y] = s.P(0.5, 0.26, 2.0); sparkle(ctx, x + 15, y - 14, 3.2, 0.9); sparkle(ctx, x - 13, y + 18, 2.2, 0.75); });
}

// ---------- Sofá VIP de terciopelo ----------
function hub_sofa_vip(s, { c }) {
  const dk = shade(c, -0.25), but = GOLD_L;
  s.shadowRect(0.02, 0.1, 1.98, 0.98, 0.24);
  for (const u of [0.12, 1.88]) for (const v of [0.2, 0.88]) s.ball(u, v, 0.06, 0.06, GOLD, { outline: GOLD_DD });
  s.box(0.06, 0.14, 0.1, 1.94, 0.94, 0.4, dk, { decal: { front: (x, w, h) => { fr(x, 0, 1, w, 1.4, GOLD); fr(x, 0, h - 2.4, w, 1.4, GOLD); for (let i = 1; i < 8; i++) dotc(x, (w * i) / 8, h / 2, 0.7, rgba(GOLD_L, 0.8)); }, right: (x, w, h) => { fr(x, 0, 1, w, 1.4, GOLD); fr(x, 0, h - 2.4, w, 1.4, GOLD); }, left: (x, w, h) => { fr(x, 0, 1, w, 1.4, GOLD); fr(x, 0, h - 2.4, w, 1.4, GOLD); } } });
  const cush = (x, w, h) => { x.strokeStyle = rgba('#ffffff', 0.22); x.lineWidth = 0.8; rr(x, 1.2, 1.2, w - 2.4, h - 2.4, 2); x.stroke(); dotc(x, w / 2, h / 2, 0.9, but); sheen(x, w, h, 0.16); };
  s.box(0.3, 0.36, 0.4, 0.995, 0.93, 0.6, c, { decal: { top: cush, front: (x, w, h) => { fr(x, 0, h - 1.2, w, 1.2, GOLD); sheen(x, w, h, 0.1); } } });
  s.box(1.005, 0.36, 0.4, 1.7, 0.93, 0.6, c, { decal: { top: cush, front: (x, w, h) => { fr(x, 0, h - 1.2, w, 1.2, GOLD); sheen(x, w, h, 0.1); } } });
  const tufts = (x, w, h) => {
    // capitonado en diamante con botones dorados
    x.strokeStyle = rgba(shade(c, -0.55), 0.55); x.lineWidth = 0.7;
    const n = 7, rows = 2, dy = (h - 4) / rows;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= rows; j++) {
      const px = ((i + (j % 2) * 0.5) * w) / n, py = 2 + j * dy;
      if (px > w) continue;
      x.beginPath(); x.moveTo(px - w / n / 2, py - dy / 2); x.lineTo(px, py); x.lineTo(px + w / n / 2, py - dy / 2); x.stroke();
      dotc(x, px, py, 0.9, but);
    }
    fr(x, 0, 0, w, 1.6, GOLD); fr(x, 0, 0, w, 0.6, GOLD_L);
    sheen(x, w, h, 0.14);
  };
  s.box(0.06, 0.14, 0.4, 1.94, 0.36, 1.12, c, { decal: { front: tufts, back: (x, w, h) => { fr(x, 0, 0, w, 1.6, GOLD); sheen(x, w, h, 0.1); }, top: (x, w, h) => { fr(x, 0, 0, w, h, GOLD); goldSheen(x, w, h); } } });
  for (const u of [0.17, 1.83]) {
    s.box(u - 0.11, 0.36, 0.4, u + 0.11, 0.93, 0.68, c, { decal: { front: (x, w, h) => sheen(x, w, h, 0.12) } });
    s.cyl('v', u, 0.72, 0.135, 0.135, 0.34, 0.96, c, { seg: 14, decal: { front: (x, w, h) => { x.strokeStyle = GOLD; x.lineWidth = 1.4; x.beginPath(); x.arc(w / 2, h / 2, w * 0.36, 0, TAU); x.stroke(); dotc(x, w / 2, h / 2, 1.4, GOLD_L); } } });
  }
  s.custom([0.8, 0.14, 1.12, 1.2, 0.36, 1.5], (ctx) => {
    const [x, y] = s.P(1, 0.25, 1.24);
    glow(ctx, x, y, 14, YELLOW, 0.2);
    hexLogo(ctx, x, y, 6.5, { ring: GOLD, outline: 'rgba(20,20,20,0.5)' });
  });
}

// ---------- Arco de neón HUB ----------
function hub_arch(s, { st, t }) {
  const on = st === 1;
  s.shadowRect(0.1, 0.28, 0.6, 0.72, 0.26);
  s.shadowRect(2.4, 0.28, 2.9, 0.72, 0.26);
  if (on) s.under((ctx) => { floorGlow(ctx, s, 1.5, 0.5, 1.6, PINK, 0.22); });
  const pillarF = (x, w, h) => {
    fr(x, 2, 0, 1.2, h, GOLD); fr(x, w - 3.2, 0, 1.2, h, GOLD);
    fr(x, w / 2 - 0.8, 6, 1.6, h - 14, on ? PINK : '#4a3440');
    if (on) { x.fillStyle = rgba(PINK, 0.25); x.fillRect(w / 2 - 3, 6, 6, h - 14); }
    hexLogo(x, w / 2, h - 5, 3.2, { inner: false });
    sheen(x, w, h, 0.12);
  };
  for (const u0 of [0.15, 2.45]) {
    s.box(u0 - 0.06, 0.24, 0, u0 + 0.46, 0.76, 0.16, GOLD, { decal: { front: goldPanel, right: goldPanel, left: goldPanel, back: goldPanel, top: goldSheen } });
    s.box(u0, 0.3, 0.16, u0 + 0.4, 0.7, 2.0, DARK, { decal: { front: pillarF, right: pillarF, left: pillarF, back: pillarF } });
    s.box(u0 - 0.05, 0.25, 2.0, u0 + 0.45, 0.75, 2.12, GOLD, { decal: { front: goldPanel, right: goldPanel, left: goldPanel, back: goldPanel, top: goldSheen } });
  }
  s.custom([0.3, 0.45, 2.12, 2.7, 0.55, 3.05], (ctx) => {
    const arc = (ru, rz, z0) => {
      ctx.beginPath();
      for (let k = 0; k <= 28; k++) {
        const a = Math.PI - (k / 28) * Math.PI, [x, y] = s.P(1.5 + ru * Math.cos(a), 0.5, z0 + rz * Math.sin(a));
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // soporte dorado del arco
    arc(1.1, 0.82, 2.08); ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.strokeStyle = rgba(GOLD_L, 0.9); ctx.lineWidth = 1; ctx.stroke();
    arc(1.24, 0.92, 2.06); neonStroke(ctx, PINK, on, 1.8);
    arc(0.96, 0.7, 2.1); neonStroke(ctx, YELLOW, on, 1.2, '#fffbe6');
    // focos de marquesina que corren
    const ph = Math.floor(t / 180);
    for (let k = 1; k < 12; k++) {
      const a = Math.PI - (k / 12) * Math.PI, [x, y] = s.P(1.5 + 1.1 * Math.cos(a), 0.5, 2.08 + 0.82 * Math.sin(a));
      const lit = on && (k + ph) % 3 !== 0;
      if (lit) glow(ctx, x, y, 4, YELLOW, 0.6);
      dotc(ctx, x, y, 1.2, lit ? '#fff8d6' : '#8a7a5a');
    }
    // letrero colgante
    const [ax, ay] = s.P(1.12, 0.5, 2.82), [bx, by] = s.P(1.88, 0.5, 2.82), [cx, cy] = s.P(1.12, 0.5, 2.45), [dx, dy] = s.P(1.88, 0.5, 2.45);
    line(ctx, ax, ay, cx, cy, '#9aa0aa', 0.7); line(ctx, bx, by, dx, dy, '#9aa0aa', 0.7);
    onPlaneV(ctx, s, 0.5, 0.98, 2.47, 1.04, (g) => {
      const w = 33, h = 11;
      g.fillStyle = 'rgba(16,10,20,0.88)'; rr(g, 0, 0, w, h, 2); g.fill();
      g.strokeStyle = GOLD; g.lineWidth = 0.8; g.stroke();
      const hh = 5.4, ww = wordWidth('GTAHUB', hh);
      neonWord(g, 'GTAHUB', (w - ww) / 2, (h - hh) / 2, hh, PINK, on);
    });
  });
}

// ---------- Pedestal holográfico (animado) ----------
function hub_holo(s, { st, t }) {
  const on = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.42, 0.42, 0.26);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.0, PINK, 0.22));
  s.cyl('z', 0.5, 0.5, 0.42, 0.4, 0, 0.12, DARK, { seg: 24 });
  s.cyl('z', 0.5, 0.5, 0.41, 0.41, 0.12, 0.16, GOLD, { seg: 24, outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.24, 0.2, 0.16, 0.82, ONYX, { seg: 6, faces: { side: ONYX } });
  s.cyl('z', 0.5, 0.5, 0.25, 0.25, 0.46, 0.52, GOLD, { seg: 6, outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.3, 0.34, 0.82, 0.9, GOLD, { seg: 24, outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.33, 0.33, 0.9, 0.95, DARK, {
    seg: 24,
    decal: { top: (x, w, h) => { const cx = w / 2, cy = h / 2; glow(x, cx, cy, w * 0.45, on ? PINK : '#4a3440', on ? 0.8 : 0.4); x.strokeStyle = on ? '#ffd1df' : '#5a4a55'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, w * 0.3, 0, TAU); x.stroke(); x.strokeStyle = on ? YELLOW : '#5a5040'; x.beginPath(); x.arc(cx, cy, w * 0.18, 0, TAU); x.stroke(); } },
  });
  if (!on) return;
  s.over((ctx) => {
    const [x, y0] = s.P(0.5, 0.5, 0.95), y1 = s.P(0.5, 0.5, 1.85)[1];
    // cono de luz
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(PINK, 0.42)); g.addColorStop(0.6, rgba('#ff9ec0', 0.14)); g.addColorStop(1, rgba(PINK, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 8, y0); ctx.lineTo(x - 18, y1); ctx.lineTo(x + 18, y1); ctx.lineTo(x + 8, y0); ctx.closePath(); ctx.fill();
    // logo girando
    const a = (t / 1000) * 2.6, k = Math.cos(a), yc = s.P(0.5, 0.5, 1.42)[1] + Math.sin(t / 420) * 1.5;
    ctx.save(); ctx.translate(x, yc); ctx.scale(Math.max(0.08, Math.abs(k)), 1); ctx.globalAlpha = 0.85;
    glow(ctx, 0, 0, 20, PINK, 0.35);
    if (k >= 0) hexLogo(ctx, 0, 0, 11, { ring: rgba(YELLOW, 0.9) });
    else hexLogo(ctx, 0, 0, 11, { ring: rgba(YELLOW, 0.9), top: '#ffe680', left: '#ff8fb3', right: PINK });
    ctx.restore();
    // líneas de escaneo
    ctx.fillStyle = rgba('#ffffff', 0.12);
    for (let i = 0; i < 6; i++) { const yy = yc - 12 + ((i * 4 + t / 60) % 24); ctx.fillRect(x - 13, yy, 26, 0.6); }
    // chispas
    for (let i = 0; i < 6; i++) {
      const ph = ((t / 900 + i / 6) % 1);
      dotc(ctx, x - 12 + ((i * 9) % 24), y0 - ph * (y0 - y1) * 0.9, 0.8, rgba(i % 2 ? YELLOW : '#ffffff', 1 - ph));
    }
  });
}

// ---------- Lámpara corona ----------
function hub_crown_lamp(s, { st }) {
  const on = st === 1, warm = '#fff1c2';
  s.shadowEllipse(0.5, 0.5, 0.26, 0.26, 0.24);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.2, mix(PINK, warm, 0.5), 0.3));
  s.cyl('z', 0.5, 0.5, 0.22, 0.17, 0, 0.08, GOLD, { seg: 20, outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.13, 0.13, 0.08, 0.11, DARK, { seg: 20 });
  s.cyl('z', 0.5, 0.5, 0.028, 0.028, 0.11, 1.18, GOLD, { seg: 10, outline: GOLD_DD });
  s.ball(0.5, 0.5, 0.62, 0.065, GOLD, { outline: GOLD_DD });
  const shc = on ? mix(PINK, warm, 0.35) : PINK;
  s.cyl('z', 0.5, 0.5, 0.31, 0.26, 1.14, 1.58, shc, { seg: 22, k: on ? 0.06 : -0.02, faces: { top: on ? warm : VEL_D }, decal: { top: (x, w, h) => { if (on) glow(x, w / 2, h / 2, w * 0.5, '#ffffff', 0.8); } } });
  s.cyl('z', 0.5, 0.5, 0.315, 0.315, 1.12, 1.19, GOLD, { seg: 22, outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.265, 0.265, 1.55, 1.6, GOLD, { seg: 22, outline: GOLD_DD, faces: { top: on ? warm : VEL_D } });
  s.custom([0.2, 0.2, 1.6, 0.8, 0.8, 1.98], (ctx) => {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.26, u = 0.5 + 0.255 * Math.cos(a), v = 0.5 + 0.255 * Math.sin(a);
      const w = s.w(u, v, 0);
      pts.push({ u, v, d: w[0] + w[1] });
    }
    pts.sort((p, q) => p.d - q.d);
    for (const p of pts) {
      const [x, y] = s.P(p.u, p.v, 1.6);
      ctx.beginPath(); ctx.moveTo(x - 3.6, y); ctx.lineTo(x, y - 10); ctx.lineTo(x + 3.6, y); ctx.closePath();
      ctx.fillStyle = GOLD; ctx.fill(); ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 0.8; ctx.stroke();
      line(ctx, x - 1, y - 1, x - 0.2, y - 7, rgba(GOLD_L, 0.9), 0.7);
      dotc(ctx, x, y - 10.5, 1.4, PINK); dotc(ctx, x - 0.4, y - 10.9, 0.4, '#ffffff');
    }
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.8; const [x, y] = s.P(0.5 + 0.31 * Math.cos(a), 0.5 + 0.31 * Math.sin(a), 1.155); const d = s.wv(Math.cos(a), Math.sin(a), 0); if (d[0] + d[1] > 0) gem(ctx, x, y, 1.6, '#3a86ff'); }
  });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 1.36); glow(ctx, x, y, 46, mix(PINK, warm, 0.5), 0.3); glow(ctx, x, y + 6, 14, '#ffffff', 0.35); });
}

// ---------- Trofeo de oro legendario ----------
function hub_trophy(s, { t }) {
  s.shadowRect(0.18, 0.18, 0.82, 0.82, 0.26);
  s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 0.8, YELLOW, 0.2));
  s.box(0.18, 0.18, 0, 0.82, 0.82, 0.12, DARK, { decal: { front: goldBand, right: goldBand, left: goldBand, back: goldBand, top: (x, w, h) => sheen(x, w, h, 0.2) } });
  const plaque = (x, w, h) => {
    fr(x, 3, h * 0.3, w - 6, h * 0.42, GOLD); fr(x, 3.6, h * 0.3 + 0.6, w - 7.2, h * 0.42 - 1.2, '#e0a800');
    const hh = Math.min(3.6, h * 0.24), ww = wordWidth('GTAHUB', hh);
    drawWord(x, 'GTAHUB', (w - ww) / 2, h * 0.51 - hh / 2, hh, GOLD_DD, 0.7);
    sheen(x, w, h, 0.18);
  };
  s.box(0.26, 0.26, 0.12, 0.74, 0.74, 0.42, ONYX, { decal: { front: plaque, right: (x, w, h) => sheen(x, w, h, 0.18), left: plaque, back: (x, w, h) => sheen(x, w, h, 0.18) } });
  s.box(0.22, 0.22, 0.42, 0.78, 0.78, 0.46, GOLD, { outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.13, 0.08, 0.46, 0.54, GOLD, { seg: 16, outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.04, 0.04, 0.54, 0.68, GOLD, { seg: 10, outline: GOLD_DD });
  s.ball(0.5, 0.5, 0.68, 0.07, GOLD, { outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.09, 0.28, 0.72, 1.14, GOLD, { seg: 24, k: 0.04, outline: GOLD_DD, faces: { top: GOLD_D } });
  s.cyl('z', 0.5, 0.5, 0.295, 0.295, 1.12, 1.16, GOLD_L, { seg: 24, outline: GOLD_DD, faces: { top: '#c78a00' } });
  s.custom([0.15, 0.45, 0.75, 0.85, 0.55, 1.12], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.98);
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(x + d * 13, y - 2, 4.5, 6, 0, d < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, d < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
      ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.8; ctx.stroke();
    }
  });
  s.over((ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.98);
    ctx.fillStyle = rgba('#ffffff', 0.6); ctx.fillRect(x - 7, y - 8, 1.4, 9);
    hexLogo(ctx, x + 1, y - 1, 4.6, { ring: GOLD_L, outline: 'rgba(20,20,20,0.5)' });
  });
  s.custom([0.4, 0.4, 1.16, 0.6, 0.6, 1.45], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 1.3);
    ctx.fillStyle = GOLD; ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 0.8;
    ctx.beginPath(); for (let k = 0; k < 10; k++) { const q = k % 2 ? 2.4 : 5.6, an = (k / 10) * TAU - Math.PI / 2; ctx.lineTo(x + q * Math.cos(an), y + q * Math.sin(an)); } ctx.closePath(); ctx.fill(); ctx.stroke();
    dotc(ctx, x, y, 1.3, PINK);
  });
  s.over((ctx) => {
    const [x, y] = s.P(0.5, 0.5, 1.1), f = Math.floor(t / 220);
    const sp = [[15, -16], [-17, -6], [11, 8], [-6, -26]];
    sp.forEach(([dx, dy], i) => { const k = (f + i * 2) % 5; if (k < 3) sparkle(ctx, x + dx, y + dy, [1.8, 3.2, 2.2][k], 0.9); });
  });
}

// ---------- Dragón guardián dorado ----------
const bez = (p0, p1, p2, p3, t) => {
  const m = 1 - t;
  return [m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]];
};
function hub_dragon(s) {
  s.shadowRect(0.1, 0.1, 0.9, 0.9, 0.28);
  s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 0.9, YELLOW, 0.16));
  s.box(0.12, 0.12, 0, 0.88, 0.88, 0.1, GOLD, { outline: GOLD_DD, decal: { front: goldSheen, right: goldSheen } });
  const ped = (x, w, h) => { fr(x, 0, 2, w, 1.2, GOLD); fr(x, 0, h - 3.2, w, 1.2, GOLD); hexLogo(x, w / 2, h / 2 + 0.5, 4, { inner: false }); sheen(x, w, h, 0.14); };
  s.box(0.18, 0.18, 0.1, 0.82, 0.82, 0.5, DARK, { decal: { front: ped, right: ped, left: ped, back: ped } });
  s.box(0.14, 0.14, 0.5, 0.86, 0.86, 0.58, GOLD, { outline: GOLD_DD, decal: { top: (x, w, h) => { goldSheen(x, w, h); }, front: goldSheen, right: goldSheen } });
  s.custom([0.2, 0.2, 0.58, 0.8, 0.8, 2.4], (ctx) => {
    const [bx, by] = s.P(0.5, 0.5, 0.58);
    const f = s.wv(0, 1, 0), m = f[0] - f[1] > 0 ? -1 : 1; // m = 1 → mira a la izquierda de la pantalla
    ctx.save(); ctx.translate(bx, by + 1); ctx.scale(-m, 1); // dibujado mirando a +x
    const gradG = ctx.createLinearGradient(-14, -54, 16, 0);
    gradG.addColorStop(0, GOLD_L); gradG.addColorStop(0.5, GOLD); gradG.addColorStop(1, GOLD_D);
    // alas (detrás)
    const wing = (sx, sy, k) => {
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx - 6 * k, sy - 16, sx - 16 * k, sy - 20);
      ctx.quadraticCurveTo(sx - 14 * k, sy - 12, sx - 19 * k, sy - 8);
      ctx.quadraticCurveTo(sx - 13 * k, sy - 6, sx - 14 * k, sy - 1);
      ctx.quadraticCurveTo(sx - 8 * k, sy - 2, sx - 3 * k, sy + 4);
      ctx.closePath();
      ctx.fillStyle = k > 0 ? VEL_D : PINK; ctx.fill(); ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 0.8;
      for (const [ex, ey] of [[-16, -20], [-19, -8], [-14, -1]]) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ex * k * 0.92, sy + ey * 0.92); ctx.stroke(); }
    };
    wing(-2, -30, 1);
    // cuerpo en S (cola enroscada → cuello)
    const C1 = [[-16, -2], [-4, 3], [14, 0], [12, -10]], C2 = [[12, -10], [10, -20], [-8, -16], [-6, -27]], C3 = [[-6, -27], [-4, -36], [4, -40], [8, -41]];
    const body = () => { ctx.beginPath(); ctx.moveTo(...C1[0]); ctx.bezierCurveTo(...C1[1], ...C1[2], ...C1[3]); ctx.bezierCurveTo(...C2[1], ...C2[2], ...C2[3]); ctx.bezierCurveTo(...C3[1], ...C3[2], ...C3[3]); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // púas rosas a lo largo del lomo
    ctx.fillStyle = PINK; ctx.strokeStyle = '#6d0f33'; ctx.lineWidth = 0.6;
    for (const [C, ts] of [[C1, [0.55, 0.8]], [C2, [0.15, 0.45, 0.75]], [C3, [0.25, 0.6]]]) for (const tt of ts) {
      const p = bez(...C, tt), q = bez(...C, Math.min(1, tt + 0.05));
      let nx = -(q[1] - p[1]), ny = q[0] - p[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (ny > 0) { nx = -nx; ny = -ny; }
      ctx.beginPath(); ctx.moveTo(p[0] - ny * 2.4 + nx * 3, p[1] + nx * 2.4 + ny * 3); ctx.lineTo(p[0] + nx * 7, p[1] + ny * 7); ctx.lineTo(p[0] + ny * 2.4 + nx * 3, p[1] - nx * 2.4 + ny * 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    body(); ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 8.4; ctx.stroke();
    body(); ctx.strokeStyle = gradG; ctx.lineWidth = 6.4; ctx.stroke();
    ctx.save(); ctx.translate(-0.8, -1.2); body(); ctx.strokeStyle = rgba('#fff6c8', 0.7); ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
    // escamas del vientre
    for (const [C, ts] of [[C1, [0.3, 0.5, 0.7]], [C2, [0.3, 0.55, 0.8]], [C3, [0.2, 0.45]]]) for (const tt of ts) { const p = bez(...C, tt); ctx.strokeStyle = rgba(GOLD_DD, 0.55); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(p[0], p[1] + 1, 1.8, 0, Math.PI); ctx.stroke(); }
    // punta de la cola
    ctx.fillStyle = PINK; ctx.beginPath(); ctx.moveTo(-15, -2); ctx.lineTo(-22, -6); ctx.lineTo(-20, 1); ctx.lineTo(-23, 3); ctx.lineTo(-15, 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#6d0f33'; ctx.lineWidth = 0.7; ctx.stroke();
    // patita delantera
    ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(4, -22); ctx.lineTo(10, -17); ctx.lineTo(13, -19); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    wing(2, -31, -1);
    // cabeza
    const hx = 9, hy = -42;
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy + 3); ctx.lineTo(hx - 4, hy - 4); ctx.lineTo(hx + 2, hy - 6); ctx.lineTo(hx + 7, hy - 4);
    ctx.lineTo(hx + 15, hy - 2.5); ctx.lineTo(hx + 16, hy + 1); ctx.lineTo(hx + 12, hy + 2); ctx.lineTo(hx + 15, hy + 5); ctx.lineTo(hx + 6, hy + 5.5); ctx.lineTo(hx, hy + 5);
    ctx.closePath(); ctx.fillStyle = gradG; ctx.fill(); ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 1; ctx.stroke();
    // cuernos
    ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(hx - 2, hy - 4); ctx.quadraticCurveTo(hx - 8, hy - 8, hx - 11, hy - 14); ctx.stroke();
    ctx.strokeStyle = GOLD_L; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = GOLD_DD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + 2, hy - 5); ctx.quadraticCurveTo(hx - 1, hy - 10, hx - 3, hy - 15); ctx.stroke();
    ctx.strokeStyle = GOLD_L; ctx.lineWidth = 1; ctx.stroke();
    // ojo y fosa
    glow(ctx, hx + 5, hy - 1.5, 5, PINK, 0.6);
    dotc(ctx, hx + 5, hy - 1.5, 1.4, PINK); dotc(ctx, hx + 5.3, hy - 1.8, 0.45, '#ffffff');
    dotc(ctx, hx + 14, hy - 0.8, 0.6, GOLD_DD);
    line(ctx, hx + 6, hy + 2.8, hx + 13, hy + 2.2, rgba(GOLD_DD, 0.8), 0.6);
    ctx.restore();
  });
  s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 1.9); sparkle(ctx, x + 14, y - 10, 2.8, 0.9); sparkle(ctx, x - 15, y + 20, 2, 0.7); });
}

// ---------- Cordón VIP (rejita) ----------
function hub_rope(s, { st }) {
  const open = st === 1;
  for (const u of [0.14, 0.86]) {
    s.shadowEllipse(u, 0.5, 0.13, 0.13, 0.24);
    s.cyl('z', u, 0.5, 0.13, 0.1, 0, 0.06, GOLD, { seg: 16, outline: GOLD_DD });
    s.cyl('z', u, 0.5, 0.032, 0.032, 0.06, 0.94, GOLD, { seg: 10, outline: GOLD_DD });
    s.ball(u, 0.5, 0.99, 0.065, GOLD, { outline: GOLD_DD });
  }
  s.custom([0.2, 0.42, 0.2, 0.8, 0.58, 0.93], (ctx) => {
    const pts = [];
    if (!open) for (let k = 0; k <= 16; k++) { const f = k / 16, u = 0.17 + f * 0.66; pts.push(s.P(u, 0.5, 0.86 - 0.3 * 4 * f * (1 - f))); }
    else for (let k = 0; k <= 12; k++) { const f = k / 12; pts.push(s.P(0.17 + Math.sin(f * Math.PI) * 0.07, 0.5 + Math.sin(f * Math.PI) * 0.04, 0.86 - f * 0.56)); }
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(); ctx.strokeStyle = '#4a0820'; ctx.lineWidth = 4.6; ctx.stroke();
    path(); ctx.strokeStyle = '#d0185c'; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.save(); ctx.translate(0, -0.8); path(); ctx.strokeStyle = rgba('#ff9ec0', 0.7); ctx.lineWidth = 0.9; ctx.stroke(); ctx.restore();
    for (const p of [pts[0], pts[pts.length - 1]]) { dotc(ctx, p[0], p[1], 2.2, GOLD_DD); dotc(ctx, p[0], p[1], 1.6, GOLD); dotc(ctx, p[0] - 0.4, p[1] - 0.5, 0.5, GOLD_L); }
  });
}

// ---------- Teletransportador HUB ----------
function hub_teleport(s, { st, t }) {
  const act = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.48, 0.48, 0.28);
  s.cyl('z', 0.5, 0.5, 0.47, 0.45, 0, 0.12, DARK, { seg: 24 });
  s.cyl('z', 0.5, 0.5, 0.46, 0.46, 0.12, 0.16, GOLD, { seg: 24, outline: GOLD_DD });
  s.cyl('z', 0.5, 0.5, 0.4, 0.4, 0.16, 0.18, ONYX, {
    seg: 24,
    decal: { top: (x, w, h) => { const cx = w / 2, cy = h / 2; glow(x, cx, cy, w * 0.48, act ? PINK : '#5a2a40', act ? 0.85 : 0.5); x.strokeStyle = act ? '#ffffff' : rgba(PINK, 0.7); x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, w * 0.36, 0, TAU); x.stroke(); hexLogo(x, cx, cy, w * 0.16, { inner: false }); } },
  });
  for (const a of [Math.PI * 1.05, Math.PI * 1.5, Math.PI * 1.95]) {
    const u = 0.5 + 0.39 * Math.cos(a), v = 0.5 + 0.39 * Math.sin(a);
    s.cyl('z', u, v, 0.045, 0.045, 0.16, 2.1, GOLD, { seg: 10, outline: GOLD_DD });
  }
  s.cyl('z', 0.5, 0.5, 0.47, 0.47, 2.1, 2.24, DARK, { seg: 24, faces: { side: DARK } });
  s.cyl('z', 0.5, 0.5, 0.48, 0.46, 2.24, 2.3, GOLD, { seg: 24, outline: GOLD_DD, decal: { top: (x, w, h) => { fr(x, 0, 0, w, h, DARK); hexLogo(x, w / 2, h / 2, w * 0.2, { ring: GOLD_L }); } } });
  s.over((ctx) => {
    const [x, y0] = s.P(0.5, 0.5, 0.18), y1 = s.P(0.5, 0.5, 2.1)[1];
    const rx = 0.4 * 45, ry = 0.4 * 22.6;
    if (act) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba('#ffffff', 0.75)); g.addColorStop(0.35, rgba(PINK, 0.42)); g.addColorStop(1, rgba(YELLOW, 0.18));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y0, rx - 4, ry - 2, 0, 0, Math.PI); ctx.lineTo(x - rx + 4, y1); ctx.lineTo(x + rx - 4, y1); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 3; i++) { const ph = ((t / 700 + i / 3) % 1), yy = y0 - ph * (y0 - y1); ctx.strokeStyle = rgba(i % 2 ? YELLOW : '#ffffff', 0.85 * (1 - ph)); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, yy, rx - 5, ry - 2.5, 0, 0, TAU); ctx.stroke(); }
      for (let i = 0; i < 7; i++) { const ph = ((t / 500 + i * 0.37) % 1); dotc(ctx, x - 12 + ((i * 7) % 24), y0 - ph * (y0 - y1), 0.9, '#ffffff'); }
      glow(ctx, x, (y0 + y1) / 2, 40, PINK, 0.2);
    }
    // vidrio
    ctx.fillStyle = rgba('#d8ecff', act ? 0.06 : 0.12);
    ctx.beginPath(); ctx.ellipse(x, y0, rx, ry, 0, 0, Math.PI); ctx.lineTo(x - rx, y1); ctx.ellipse(x, y1, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.35); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(x, y0, rx, ry, 0, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.22); ctx.fillRect(x - rx + 4, y1 + 4, 2, y0 - y1 - 2); ctx.fillRect(x - rx + 8, y1 + 6, 0.8, y0 - y1 - 6);
  });
}

// ---------- Bandera pixel HUB (animada) ----------
const FLAG = [
  'YYYYYYYYYYYY',
  'kkkkkkkkkkkk',
  'kkkkkYYkkkkk',
  'kkkYYYYYYkkk',
  'kkYYYYYYYYkk',
  'kkPPYYYYDDkk',
  'kkPPPPDDDDkk',
  'kkPPPPDDDDkk',
  'kkPPPPDDDDkk',
  'kkkPPPDDDkkk',
  'kkkkkPDkkkkk',
  'PPPPPPPPPPPP',
];
const FLAG_C = { Y: YELLOW, k: DARK, P: PINK, D: '#b8195a' };
function hub_flag(s, { t }) {
  s.shadowRect(0.08, 0.38, 0.32, 0.62, 0.26);
  s.box(0.06, 0.36, 0, 0.34, 0.64, 0.12, DARK, { decal: { front: goldBand, right: goldBand, left: goldBand, back: goldBand, top: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.cyl('z', 0.2, 0.5, 0.03, 0.025, 0.12, 2.6, GOLD, { seg: 10, outline: GOLD_DD });
  s.ball(0.2, 0.5, 2.64, 0.06, GOLD, { outline: GOLD_DD });
  s.custom([0.22, 0.48, 1.6, 1.0, 0.52, 2.58], (ctx) => {
    const ph = t / 1000 * 5;
    onPlaneV(ctx, s, 0.5, 0.23, 2.54, 0.75, (g) => {
      const cs = 2, cols = 12;
      for (let i = 0; i < cols; i++) {
        const k = i / (cols - 1), dy = Math.sin(ph - i * 0.55) * 2.2 * k, sl = Math.cos(ph - i * 0.55) * k;
        for (let j = 0; j < FLAG.length; j++) {
          const col = FLAG_C[FLAG[j][i]];
          fr(g, i * cs, j * cs + dy, cs + 0.15, cs + 0.15, sl > 0 ? shade(col, -0.18 * sl) : shade(col, 0.12 * -sl));
        }
      }
      g.strokeStyle = rgba('#000000', 0.35); g.lineWidth = 0.6;
      g.beginPath();
      for (let i = 0; i <= cols; i++) { const k = Math.min(1, i / (cols - 1)), dy = Math.sin(ph - i * 0.55) * 2.2 * k; if (i) g.lineTo(i * cs, dy); else g.moveTo(0, dy); }
      for (let i = cols; i >= 0; i--) { const k = Math.min(1, i / (cols - 1)), dy = Math.sin(ph - i * 0.55) * 2.2 * k; g.lineTo(i * cs, FLAG.length * cs + dy); }
      g.closePath(); g.stroke();
      fr(g, -0.6, 0, 1.4, FLAG.length * cs, GOLD_L);
    });
  });
}

// ---------- Alfombra roja VIP ----------
function hub_rug(s) {
  const red = '#c8124a';
  const fringe = (x, w, h) => { for (let i = 1; i < w; i += 1.6) fr(x, i, 0, 0.8, h, GOLD); };
  s.box(0.14, 0.02, 0, 0.86, 0.1, 0.01, GOLD, { outline: false, edges: false, decal: { top: fringe } });
  s.box(0.14, 2.9, 0, 0.86, 2.98, 0.01, GOLD, { outline: false, edges: false, decal: { top: fringe } });
  s.box(0.1, 0.1, 0, 0.9, 2.9, 0.025, red, {
    outline: '#5a0620',
    decal: {
      top: (x, w, h) => {
        x.strokeStyle = GOLD; x.lineWidth = 1.4; x.strokeRect(2.4, 2.4, w - 4.8, h - 4.8);
        x.strokeStyle = rgba(GOLD_L, 0.6); x.lineWidth = 0.6; x.strokeRect(4.6, 4.6, w - 9.2, h - 9.2);
        for (let i = 0; i < 3; i++) hexLogo(x, w / 2, h * (0.2 + i * 0.3), w * 0.16, { inner: false, top: GOLD_L, left: GOLD, right: GOLD_D });
        x.fillStyle = rgba('#000000', 0.08); for (let i = 6; i < h - 6; i += 3) x.fillRect(6, i, w - 12, 0.6);
      },
    },
  });
}

// ---------- Neón de pared HUB ----------
function hub_neon_wall(ctx, { st }) {
  const on = st === 1, x = 3, y = -50, w = 58, h = 38;
  if (on) { ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(1, 0.62); glow(ctx, 0, 0, 46, PINK, 0.3); ctx.restore(); }
  ctx.fillStyle = 'rgba(16,10,28,0.28)'; rr(ctx, x + 1.5, y + 2, w, h, 4); ctx.fill();
  ctx.fillStyle = on ? 'rgba(26,12,22,0.86)' : 'rgba(24,22,30,0.88)'; rr(ctx, x, y, w, h, 4); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = rgba(GOLD_L, 0.5); ctx.lineWidth = 0.5; rr(ctx, x + 2, y + 2, w - 4, h - 4, 3); ctx.stroke();
  for (const [a, b] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) { dotc(ctx, a, b, 1.3, GOLD_D); dotc(ctx, a - 0.3, b - 0.3, 0.6, GOLD_L); }
  // corona
  const cx = x + w / 2, cyc = y + 11;
  ctx.beginPath();
  const P = [[-7, 3], [-8, -4], [-3.5, 0], [0, -6], [3.5, 0], [8, -4], [7, 3]];
  P.forEach(([a, b], i) => (i ? ctx.lineTo(cx + a, cyc + b) : ctx.moveTo(cx + a, cyc + b))); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  neonStroke(ctx, YELLOW, on, 1.2, '#fffbe6');
  // HUB grande
  const hh = 12, ww = wordWidth('HUB', hh);
  neonWord(ctx, 'HUB', cx - ww / 2, y + 18, hh, PINK, on);
  // hexágonos a los lados
  for (const d of [-1, 1]) { hexPath(ctx, cx + d * 22, y + 24, 4.2); neonStroke(ctx, YELLOW, on, 0.9, '#fffbe6'); }
}

export default {
  floor: { hub_throne, hub_sofa_vip, hub_arch, hub_holo, hub_crown_lamp, hub_trophy, hub_dragon, hub_rope, hub_teleport, hub_flag, hub_rug },
  wall: { hub_neon_wall },
  period: {
    hub_holo: (st) => (st === 1 ? 90 : 0),
    hub_arch: (st) => (st === 1 ? 180 : 0),
    hub_teleport: (st) => (st === 1 ? 70 : 0),
    hub_trophy: () => 220,
    hub_flag: () => 120,
  },
  defaultColor: { hub_throne: GOLD, hub_arch: DARK, hub_holo: DARK, hub_crown_lamp: PINK, hub_trophy: GOLD, hub_dragon: GOLD, hub_rope: GOLD, hub_teleport: DARK, hub_flag: DARK, hub_rug: '#c8124a', hub_neon_wall: PINK },
};
