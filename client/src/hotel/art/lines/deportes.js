// Dibujo de la línea "Deportes". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { PINK, YELLOW, shade, rgba, outlineOf } from '../iso.js';
import { drawWord, wordWidth, hexLogo, rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const METAL = '#b9c0c9', DMETAL = '#3a3d46', RUBBER = '#202024', GRAPH = '#2b2d38';

const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
const pipe = (ctx, w, h) => { ctx.strokeStyle = rgba('#ffffff', 0.22); ctx.lineWidth = 0.8; rr(ctx, 1.2, 1.2, w - 2.4, h - 2.4, 2); ctx.stroke(); };

// Dígitos de 7 segmentos (x, y = esquina superior izquierda)
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function seg7(ctx, x, y, w, h, n, color, ghost) {
  const t = Math.max(1, w * 0.2), m = h / 2;
  const S = { a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + m - t / 2, w - 2 * t, t], f: [x, y + t, t, m - t * 1.2], b: [x + w - t, y + t, t, m - t * 1.2], e: [x, y + m + t * 0.2, t, m - t * 1.2], c: [x + w - t, y + m + t * 0.2, t, m - t * 1.2] };
  for (const k of 'abcdefg') { const on = n !== null && SEG[n].includes(k); fr(ctx, ...S[k], on ? color : ghost); }
}

// ---------- Caminadora ----------
function deportes_treadmill(s, { st, t }) {
  const on = st === 1;
  s.shadowRect(0.08, 0.14, 0.92, 1.96, 0.24);
  const side = (x, w, h) => { fr(x, 0, h * 0.45, w, 1.4, PINK); sheen(x, w, h, 0.12); };
  s.box(0.1, 0.16, 0, 0.9, 1.94, 0.16, GRAPH, {
    decal: {
      left: side, right: side,
      top: (x, w, h) => {
        fr(x, 0, 0, w, h, GRAPH);
        const bx = 4, bw = w - 8;
        fr(x, bx, 0, bw, h, '#141418');
        const off = on ? (t / 25) % 6 : 0;
        for (let y = -6 + off; y < h; y += 6) fr(x, bx, y, bw, 0.7, rgba('#ffffff', 0.08));
        fr(x, 0, 0, 3, h, '#4a4d58'); fr(x, w - 3, 0, 3, h, '#4a4d58');
      },
      front: (x, w, h) => { fr(x, 2, 2, w - 4, h - 4, '#1b1c22'); dotc(x, w / 2, h / 2, 1, on ? '#47ff9a' : '#555'); },
    },
  });
  for (const u0 of [0.12, 0.8]) s.box(u0, 0.22, 0.16, u0 + 0.08, 0.32, 1.12, METAL);
  for (const u0 of [0.1, 0.84]) s.box(u0, 0.32, 0.98, u0 + 0.06, 0.82, 1.04, METAL, { decal: { top: (x, w, h) => fr(x, 0, h * 0.5, w, h * 0.5, RUBBER) } });
  s.box(0.06, 0.14, 1.12, 0.94, 0.36, 1.34, GRAPH, {
    decal: {
      front: (x, w, h) => {
        fr(x, 3, 1.5, w - 6, h - 3, '#0e0f14');
        if (on) {
          seg7(x, 6, 3, 3.4, h - 6, 1, '#47ff9a', 'rgba(71,255,154,0.12)');
          seg7(x, 11, 3, 3.4, h - 6, 2, '#47ff9a', 'rgba(71,255,154,0.12)');
          for (let i = 0; i < 6; i++) { const bh = 2 + ((i * 5 + Math.floor(t / 300)) % 4); fr(x, w - 16 + i * 2, h - 2 - bh, 1.4, bh, i % 2 ? PINK : YELLOW); }
        } else hexLogo(x, w / 2, h / 2, 2.6, { inner: false });
      },
      top: (x, w, h) => { fr(x, w / 2 - 6, h / 2 - 1, 12, 2, on ? PINK : '#4a4d58'); sheen(x, w, h, 0.14); },
    },
  });
}

// ---------- Banca de pesas ----------
function deportes_bench(s, { c }) {
  s.shadowRect(0.0, 0.2, 1.0, 1.94, 0.22);
  s.box(0.26, 0.52, 0, 0.74, 0.6, 0.05, DMETAL);
  s.box(0.26, 1.74, 0, 0.74, 1.82, 0.05, DMETAL);
  s.box(0.45, 0.52, 0.05, 0.55, 0.6, 0.4, DMETAL);
  s.box(0.45, 1.74, 0.05, 0.55, 1.82, 0.4, DMETAL);
  s.box(0.44, 0.5, 0.36, 0.56, 1.86, 0.42, DMETAL);
  s.box(0.29, 0.44, 0.42, 0.71, 1.92, 0.54, c, { decal: { top: (x, w, h) => { pipe(x, w, h); sheen(x, w, h, 0.18); }, front: (x, w, h) => sheen(x, w, h, 0.12) } });
  for (const u0 of [0.06, 0.88]) {
    s.box(u0 - 0.04, 0.26, 0, u0 + 0.1, 0.42, 0.05, DMETAL);
    s.box(u0, 0.31, 0.05, u0 + 0.06, 0.37, 1.08, METAL);
    s.box(u0, 0.31, 1.08, u0 + 0.06, 0.345, 1.22, METAL);
    s.box(u0, 0.455, 1.08, u0 + 0.06, 0.49, 1.22, METAL);
  }
  s.cyl('u', 0.4, 1.15, 0.026, 0.026, -0.26, 1.26, METAL, { seg: 8, sortBox: [-0.26, 0.375, 1.12, 1.26, 0.425, 1.18] });
  const plate = (x, w, h) => { const cx = w / 2, cy = h / 2; x.strokeStyle = rgba('#ffffff', 0.18); x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, w * 0.36, 0, TAU); x.stroke(); dotc(x, cx, cy, 1.4, METAL); };
  for (const [a0, a1, r, col] of [[-0.2, -0.11, 0.24, RUBBER], [-0.11, -0.05, 0.17, '#c0392b'], [1.05, 1.11, 0.17, '#c0392b'], [1.11, 1.2, 0.24, RUBBER]]) {
    s.cyl('u', 0.4, 1.15, r, r, a0, a1, col, { seg: 18, decal: { left: plate, right: plate } });
  }
}

// ---------- Rack de mancuernas ----------
function deportes_dumbbells(s) {
  s.shadowRect(0.04, 0.16, 1.96, 0.94, 0.22);
  for (const u0 of [0.06, 1.86]) {
    s.box(u0, 0.12, 0, u0 + 0.08, 0.9, 0.05, DMETAL);
    s.box(u0, 0.78, 0.05, u0 + 0.08, 0.86, 0.46, DMETAL);
    s.box(u0, 0.2, 0.05, u0 + 0.08, 0.28, 0.82, DMETAL);
  }
  s.box(0.06, 0.52, 0.42, 1.94, 0.92, 0.47, DMETAL, { decal: { front: (x, w, h) => fr(x, 0, 0, w, h, PINK) } });
  s.box(0.06, 0.16, 0.78, 1.94, 0.5, 0.83, DMETAL, { decal: { front: (x, w, h) => fr(x, 0, 0, w, h, YELLOW) } });
  const bands = ['#3a86ff', '#2fb67c', YELLOW, PINK];
  const bell = (u, v0, v1, z, r, band) => {
    const face = (x, w, h) => { x.strokeStyle = band; x.lineWidth = 1; x.beginPath(); x.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, TAU); x.stroke(); };
    s.cyl('v', u, z + r, r, r, v0, v0 + 0.09, RUBBER, { seg: 6, decal: { front: face, back: face } });
    s.cyl('v', u, z + r, 0.024, 0.024, v0 + 0.09, v1 - 0.09, METAL, { seg: 6 });
    s.cyl('v', u, z + r, r, r, v1 - 0.09, v1, RUBBER, { seg: 6, decal: { front: face, back: face } });
  };
  for (let i = 0; i < 4; i++) bell(0.36 + i * 0.42, 0.56, 0.88, 0.47, 0.065 + i * 0.012, bands[i]);
  for (let i = 0; i < 4; i++) bell(0.36 + i * 0.42, 0.18, 0.48, 0.83, 0.06 + i * 0.008, bands[3 - i]);
}

// ---------- Costal de box ----------
function deportes_bag(s, { c, st, t }) {
  const on = st === 1;
  s.shadowRect(0.06, 0.25, 0.42, 0.75, 0.24);
  s.shadowEllipse(0.6, 0.5, 0.2, 0.2, 0.18);
  s.box(0.06, 0.26, 0, 0.42, 0.74, 0.06, DMETAL);
  s.box(0.12, 0.45, 0.06, 0.22, 0.55, 2.3, DMETAL, { decal: { front: (x, w, h) => fr(x, w / 2 - 0.6, 6, 1.2, h - 12, PINK) } });
  s.box(0.12, 0.46, 2.3, 0.66, 0.54, 2.4, DMETAL);
  s.custom([0.38, 0.28, 0.55, 0.82, 0.72, 2.3], (ctx) => {
    const [px, py] = s.P(0.6, 0.5, 2.3);
    const a = on ? Math.sin((t / 1000) * 5.5) * 0.2 : 0;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.strokeStyle = '#8b909c'; ctx.lineWidth = 0.8;
    for (const d of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(d * 1.6, 13); ctx.stroke(); }
    const rx = 9, y0 = 13, y1 = 13 + 37;
    const g = ctx.createLinearGradient(-rx, 0, rx, 0);
    g.addColorStop(0, shade(c, 0.25)); g.addColorStop(0.45, c); g.addColorStop(1, shade(c, -0.35));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-rx, y0); ctx.lineTo(-rx, y1 - 4); ctx.quadraticCurveTo(-rx, y1 + 3, 0, y1 + 3); ctx.quadraticCurveTo(rx, y1 + 3, rx, y1 - 4); ctx.lineTo(rx, y0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = outlineOf(c); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = shade(c, -0.15); ctx.beginPath(); ctx.ellipse(0, y0, rx, 4.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
    fr(ctx, -rx, y0 + 4, rx * 2, 2, '#141414');
    fr(ctx, -rx, y1 - 9, rx * 2, 2.6, YELLOW); fr(ctx, -rx, y1 - 9, rx * 2, 0.8, '#fff2a8');
    hexLogo(ctx, -1, y0 + 16, 4, { inner: false });
    ctx.fillStyle = rgba('#ffffff', 0.25); ctx.fillRect(-rx + 2.2, y0 + 7, 1.4, 22);
    ctx.restore();
    if (on) {
      const k = Math.sign(a) || 1;
      ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 1;
      for (const dy of [26, 34, 42]) { ctx.beginPath(); ctx.moveTo(px - k * 14, py + dy); ctx.lineTo(px - k * 20, py + dy - 2); ctx.stroke(); }
    }
  });
}

// ---------- Aro de básquet ----------
function deportes_hoop(s) {
  s.shadowRect(0.12, 0.0, 0.88, 0.44, 0.24);
  s.box(0.15, 0.02, 0, 0.85, 0.4, 0.24, GRAPH, { decal: { front: (x, w, h) => { fr(x, 0, h * 0.4, w, 1.6, PINK); sheen(x, w, h, 0.12); }, right: (x, w, h) => fr(x, 0, h * 0.4, w, 1.6, PINK), left: (x, w, h) => fr(x, 0, h * 0.4, w, 1.6, PINK) } });
  s.box(0.44, 0.14, 0.24, 0.56, 0.26, 2.36, DMETAL);
  s.box(0.46, 0.2, 2.3, 0.54, 0.44, 2.4, DMETAL);
  const board = (x, w, h) => {
    fr(x, 0, 0, w, h, '#f4f6f8');
    x.strokeStyle = '#d62839'; x.lineWidth = 1.6; x.strokeRect(1.6, 1.6, w - 3.2, h - 3.2);
    x.lineWidth = 1.2; x.strokeRect(w * 0.33, h * 0.48, w * 0.34, h * 0.4);
    hexLogo(x, w / 2, h * 0.24, 3, { inner: false });
    sheen(x, w, h, 0.2);
  };
  s.box(0.04, 0.44, 2.08, 0.96, 0.5, 2.92, '#f4f6f8', { decal: { front: board, back: board } });
  s.custom([0.28, 0.5, 1.8, 0.72, 0.96, 2.2], (ctx) => {
    const [x, y] = s.P(0.5, 0.71, 2.16), [, yb] = s.P(0.5, 0.71, 1.86);
    const rx = 0.18 * 45, ry = 0.18 * 22.6, rx2 = rx * 0.6, ry2 = ry * 0.6;
    ctx.strokeStyle = '#c4510e'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI, TAU); ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.85); ctx.lineWidth = 0.6;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, a2 = ((k + 0.5) / 12) * TAU;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * ry); ctx.lineTo(x + Math.cos(a2) * rx2, yb + Math.sin(a2) * ry2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a + TAU / 12) * rx, y + Math.sin(a + TAU / 12) * ry); ctx.lineTo(x + Math.cos(a2) * rx2, yb + Math.sin(a2) * ry2); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(x, yb, rx2, ry2, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ff6a13'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI); ctx.stroke();
    ctx.strokeStyle = '#7a2e05'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, 0, Math.PI); ctx.stroke();
  });
}

// ---------- Portería ----------
function deportes_goal(s) {
  const post = '#f4f6f8';
  s.shadowRect(0.04, 0.08, 2.96, 0.95, 0.16);
  s.under((ctx) => {
    const P = (u, v, z) => s.P(u, v, z);
    const quad = (pts, nx, ny, map) => {
      ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = 0.6;
      for (let i = 0; i <= nx; i++) { const a = map(i / nx, 0), b = map(i / nx, 1); ctx.beginPath(); ctx.moveTo(...P(...a)); ctx.lineTo(...P(...b)); ctx.stroke(); }
      for (let j = 0; j <= ny; j++) { const a = map(0, j / ny), b = map(1, j / ny); ctx.beginPath(); ctx.moveTo(...P(...a)); ctx.lineTo(...P(...b)); ctx.stroke(); }
    };
    const topZ = (v) => 1.0 + ((v - 0.1) / 0.8) * 0.46;
    quad(null, 24, 8, (a, b) => [0.08 + a * 2.84, 0.1, b * 1.0]); // fondo
    quad(null, 24, 7, (a, b) => [0.08 + a * 2.84, 0.1 + b * 0.8, topZ(0.1 + b * 0.8)]); // techo
    for (const u of [0.08, 2.92]) quad(null, 7, 8, (a, b) => [u, 0.1 + a * 0.8, b * topZ(0.1 + a * 0.8)]); // lados
    ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 1.4;
    for (const u of [0.08, 2.92]) { ctx.beginPath(); ctx.moveTo(...P(u, 0.9, 1.46)); ctx.lineTo(...P(u, 0.1, 1.0)); ctx.lineTo(...P(u, 0.1, 0)); ctx.lineTo(...P(u, 0.9, 0)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(...P(0.08, 0.1, 1.0)); ctx.lineTo(...P(2.92, 0.1, 1.0)); ctx.moveTo(...P(0.08, 0.1, 0)); ctx.lineTo(...P(2.92, 0.1, 0)); ctx.stroke();
  });
  const stripes = (x, w, h) => sheen(x, w, h, 0.15);
  s.box(0.04, 0.86, 0, 0.12, 0.94, 1.5, post, { decal: { front: stripes } });
  s.box(2.88, 0.86, 0, 2.96, 0.94, 1.5, post, { decal: { front: stripes } });
  s.box(0.12, 0.86, 1.42, 2.88, 0.94, 1.5, post, { decal: { front: (x, w, h) => sheen(x, w, h, 0.2) } });
}

// ---------- Balón ----------
function deportes_ball(s, { st }) {
  const basket = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.2, 0.2, 0.26);
  s.custom([0.3, 0.3, 0, 0.7, 0.7, 0.44], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.22), R = 8;
    const base = basket ? '#e8742a' : '#fbfaf7';
    const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, R);
    g.addColorStop(0, shade(base, 0.35)); g.addColorStop(0.7, base); g.addColorStop(1, shade(base, -0.3));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
    if (basket) {
      ctx.strokeStyle = '#3a1a08'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x - R, y); ctx.quadraticCurveTo(x, y - 2, x + R, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 1, y - R); ctx.quadraticCurveTo(x - 2, y, x + 1, y + R); ctx.stroke();
      ctx.beginPath(); ctx.arc(x - R * 1.15, y, R * 0.85, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + R * 1.2, y, R * 0.85, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    } else {
      const pent = (cx, cy, r, rot) => { ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = rot + (k / 5) * TAU; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = '#1b1b20'; ctx.fill(); };
      pent(x - 0.5, y - 0.5, 2.8, -Math.PI / 2);
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * TAU + Math.PI / 5; pent(x + Math.cos(a) * 7.6, y + Math.sin(a) * 7.6, 2.6, a); }
      ctx.strokeStyle = rgba('#1b1b20', 0.5); ctx.lineWidth = 0.5;
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 2.8, y + Math.sin(a) * 2.8); ctx.lineTo(x + Math.cos(a) * 5.6, y + Math.sin(a) * 5.6); ctx.stroke(); }
    }
    ctx.restore();
    ctx.strokeStyle = basket ? '#6b2a08' : '#5a5a66'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    dotc(ctx, x - 3, y - 3.4, 1.4, rgba('#ffffff', 0.55));
  });
}

// ---------- Tapete de ejercicio ----------
function deportes_mat(s, { c }) {
  s.box(0.12, 0.08, 0, 0.88, 1.92, 0.03, c, {
    outline: shade(c, -0.55),
    decal: {
      top: (x, w, h) => {
        x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 0.8; rr(x, 2, 2, w - 4, h - 4, 3); x.stroke();
        for (let y = 8; y < h - 6; y += 3) fr(x, 4, y, w - 8, 0.5, rgba(shade(c, -0.45), 0.35));
        hexLogo(x, w / 2, h - 9, 3, { inner: false, top: '#ffffff', left: rgba('#ffffff', 0.7), right: rgba('#ffffff', 0.5) });
        sheen(x, w, h, 0.12);
      },
    },
  });
}

// ---------- Marcador (pared) ----------
function deportes_scoreboard(ctx, { st }) {
  const on = st === 1, x = 2, y = -58, w = 60, h = 40;
  ctx.fillStyle = 'rgba(16,10,28,0.28)'; rr(ctx, x + 1.5, y + 2, w, h, 2); ctx.fill();
  fr(ctx, x, y, w, h, '#3a3d46'); fr(ctx, x + 2, y + 2, w - 4, h - 4, '#101015');
  ctx.strokeStyle = '#1b1c22'; ctx.lineWidth = 0.8; ctx.strokeRect(x, y, w, h);
  fr(ctx, x, y, w, 1.2, '#5a5e6a');
  const lab = (txt, cx) => { const hh = 3, ww = wordWidth(txt, hh); drawWord(ctx, txt, cx - ww / 2, y + 5, hh, on ? '#ffffff' : '#4a4a52', 0.7); };
  lab('LOCAL', x + 13); lab('VISITA', x + w - 13);
  const ghost = 'rgba(255,255,255,0.05)';
  seg7(ctx, x + 8, y + 13, 10, 18, on ? 3 : null, PINK, ghost);
  seg7(ctx, x + w - 18, y + 13, 10, 18, on ? 2 : null, '#3a86ff', ghost);
  seg7(ctx, x + 22.5, y + 15, 5, 9, on ? 4 : null, YELLOW, ghost);
  seg7(ctx, x + 32.5, y + 15, 5, 9, on ? 5 : null, YELLOW, ghost);
  dotc(ctx, x + 30, y + 17.5, 0.6, on ? YELLOW : ghost); dotc(ctx, x + 30, y + 21.5, 0.6, on ? YELLOW : ghost);
  hexLogo(ctx, x + w / 2, y + 31, 3.6, { inner: false });
  if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + 13, y + 22, 12, PINK, 0.25); glow(ctx, x + w - 13, y + 22, 12, '#3a86ff', 0.25); ctx.restore(); }
  for (const bx of [x + 10, x + w - 10]) { fr(ctx, bx - 1, y + h, 2, 4, '#3a3d46'); }
}

export default {
  floor: { deportes_treadmill, deportes_bench, deportes_dumbbells, deportes_bag, deportes_hoop, deportes_goal, deportes_ball, deportes_mat },
  wall: { deportes_scoreboard },
  period: { deportes_treadmill: (st) => (st === 1 ? 80 : 0), deportes_bag: (st) => (st === 1 ? 90 : 0) },
  defaultColor: { deportes_treadmill: GRAPH, deportes_dumbbells: DMETAL, deportes_hoop: '#f4f6f8', deportes_goal: '#f4f6f8', deportes_ball: '#fbfaf7', deportes_scoreboard: '#3a3d46' },
};
