// Dibujo de la línea "Cabaña" (madera rústica, piedra y cuadros escoceses). Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, mix, rgba, rng, outlineOf } from '../iso.js';
import { rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const LOG = '#9a6a3f', DLOG = '#6b4426', BARK = '#5a3a22', GRAIN = '#d9b07a', STONE = '#a79e93', IRON = '#2e2b2a', CREAM = '#efe4cf';
const BOOKS = ['#8a2f2a', '#2f5a3a', '#c9a46a', '#3b4a6b', '#6b4426', '#b8322a', '#d9c49a', '#40352c'];
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
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
// Vetas de madera a lo largo (dirección horizontal del dibujo)
const grain = (c, n = 3, seed = 1) => (x, w, h) => {
  const r = rng(seed);
  for (let i = 1; i < n; i++) line(x, 0, (h * i) / n, w, (h * i) / n, rgba(shade(c, -0.55), 0.45), 0.7);
  x.strokeStyle = rgba(shade(c, -0.45), 0.25); x.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) { const y = r() * h, x0 = r() * w * 0.6; x.beginPath(); x.moveTo(x0, y); x.quadraticCurveTo(x0 + 8, y + (r() - 0.5) * 2, x0 + 14 + r() * 10, y); x.stroke(); }
  for (let i = 0; i < 2; i++) { const kx = r() * w, ky = r() * h; x.fillStyle = rgba(shade(c, -0.5), 0.4); x.beginPath(); x.ellipse(kx, ky, 1.6, 0.9, 0, 0, TAU); x.fill(); }
  sheen(x, w, h, 0.1);
};
// Troncos apilados (frente) y sus cortes (costados)
const logsFront = (n) => (x, w, h) => {
  const lh = h / n;
  for (let i = 0; i < n; i++) {
    const y = i * lh;
    const g = x.createLinearGradient(0, y, 0, y + lh);
    g.addColorStop(0, shade(LOG, 0.15)); g.addColorStop(0.5, LOG); g.addColorStop(1, shade(LOG, -0.35));
    x.fillStyle = g; x.fillRect(0, y, w, lh);
    line(x, 0, y + lh - 0.4, w, y + lh - 0.4, rgba('#2a1a0e', 0.6), 0.8);
    const r = rng(i + 3);
    for (let k = 0; k < 3; k++) { const a = r() * w; line(x, a, y + lh * 0.3, a + 6 + r() * 6, y + lh * 0.35, rgba(BARK, 0.5), 0.6); }
  }
};
const logEnds = (n) => (x, w, h) => {
  const lh = h / n;
  fr(x, 0, 0, w, h, shade(LOG, -0.3));
  for (let i = 0; i < n; i++) for (let j = 0; j < Math.max(1, Math.round(w / lh)); j++) {
    const cx = (j + 0.5) * (w / Math.max(1, Math.round(w / lh))), cy = (i + 0.5) * lh, r = lh * 0.48;
    dotc(x, cx, cy, r, BARK); dotc(x, cx, cy, r * 0.82, GRAIN);
    x.strokeStyle = rgba('#8a5a2b', 0.5); x.lineWidth = 0.5; x.beginPath(); x.arc(cx, cy, r * 0.5, 0, TAU); x.stroke(); x.beginPath(); x.arc(cx, cy, r * 0.22, 0, TAU); x.stroke();
  }
};
// Piedras irregulares con mortero
const stones = (seed, base = STONE) => (x, w, h) => {
  fr(x, 0, 0, w, h, '#6f6860');
  const r = rng(seed), rows = Math.max(1, Math.round(h / 7));
  for (let j = 0; j < rows; j++) {
    let u = -r() * 5;
    const y = (j * h) / rows, sh = h / rows;
    while (u < w) {
      const sw = 7 + r() * 8, col = shade(base, (r() - 0.5) * 0.3);
      rr(x, u + 0.6, y + 0.6, sw - 1.2, sh - 1.2, 2.2); x.fillStyle = col; x.fill();
      x.fillStyle = rgba('#ffffff', 0.18); x.fillRect(u + 1.6, y + 1.2, sw * 0.5, 0.8);
      u += sw;
    }
  }
};

// ---------- Chimenea de piedra ----------
function cabana_fireplace(s, { st, t }) {
  const on = st === 1, W = 2;
  s.shadowRect(0, 0.1, W, 1.02, 0.26);
  if (on && s.faceVisible(0, 1, 0)) s.under((ctx) => floorGlow(ctx, s, 1, 1.2, 1.5, '#ff9a3d', 0.32));
  s.box(0, 0.12, 0, W, 1.02, 0.12, shade(STONE, 0.1), { decal: { top: stones(2, shade(STONE, 0.12)), front: stones(3) } });
  const front = (x, w, h) => {
    stones(5)(x, w, h);
    // boca de la chimenea (arco)
    const ox = w * 0.25, ow = w * 0.5, oh = h * 0.62, oy = h - oh;
    x.fillStyle = '#4a4440'; x.beginPath(); x.moveTo(ox - 3, h); x.lineTo(ox - 3, oy + ow * 0.2); x.quadraticCurveTo(w / 2, oy - 8, ox + ow + 3, oy + ow * 0.2); x.lineTo(ox + ow + 3, h); x.fill();
    const g = x.createLinearGradient(0, oy, 0, h);
    g.addColorStop(0, '#120c0a'); g.addColorStop(1, on ? '#5a2410' : '#241a16');
    x.fillStyle = g; x.beginPath(); x.moveTo(ox, h); x.lineTo(ox, oy + ow * 0.2); x.quadraticCurveTo(w / 2, oy - 4, ox + ow, oy + ow * 0.2); x.lineTo(ox + ow, h); x.fill();
    if (on) glow(x, w / 2, h - 4, ow * 0.6, '#ff7a2a', 0.5);
  };
  s.box(0.08, 0.14, 0.12, W - 0.08, 0.9, 1.3, STONE, { decal: { front, right: stones(7), left: stones(8), back: stones(9) } });
  if (s.faceVisible(0, 1, 0)) {
    s.custom([0.5, 0.9, 0.12, 1.5, 0.92, 1.0], (ctx) => {
      const P = (u, z) => s.P(u, 0.9, z);
      // leños
      const [a0, a1] = [P(0.66, 0.2), P(1.34, 0.2)];
      ctx.lineCap = 'round';
      line(ctx, a0[0], a0[1], a1[0], a1[1], '#2a1a0e', 5.5); line(ctx, a0[0], a0[1], a1[0], a1[1], DLOG, 4);
      const [b0, b1] = [P(0.74, 0.17), P(1.2, 0.3)];
      line(ctx, b0[0], b0[1], b1[0], b1[1], '#2a1a0e', 5); line(ctx, b0[0], b0[1], b1[0], b1[1], LOG, 3.6);
      dotc(ctx, a1[0], a1[1], 2, GRAIN);
      if (!on) { for (let i = 0; i < 4; i++) { const p = P(0.75 + i * 0.15, 0.16); dotc(ctx, p[0], p[1], 0.9, '#5a4a44'); } return; }
      // brasas y llamas
      for (let i = 0; i < 6; i++) { const p = P(0.7 + i * 0.12, 0.15); dotc(ctx, p[0], p[1], 1.3, i % 2 ? '#ff5a1f' : '#ffb347'); }
      const ph = t / 110;
      const flame = (u, hgt, wd, col, off) => {
        const base = P(u, 0.24), tip = P(u + Math.sin(ph * 1.3 + off) * 0.05, 0.24 + hgt * (0.85 + 0.15 * Math.sin(ph * 2.1 + off)));
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(base[0] - wd, base[1]);
        ctx.quadraticCurveTo(base[0] - wd * 1.1, (base[1] + tip[1]) / 2, tip[0], tip[1]);
        ctx.quadraticCurveTo(base[0] + wd * 1.1, (base[1] + tip[1]) / 2, base[0] + wd, base[1]);
        ctx.closePath(); ctx.fill();
      };
      for (const [u, h, off] of [[0.78, 0.42, 0], [1.0, 0.58, 1.7], [1.2, 0.46, 3.1]]) flame(u, h, 6, rgba('#ff5a1f', 0.9), off);
      for (const [u, h, off] of [[0.84, 0.3, 0.6], [1.0, 0.42, 2.2], [1.14, 0.32, 4]]) flame(u, h, 3.6, '#ffb347', off);
      for (const [u, h, off] of [[0.96, 0.22, 1], [1.06, 0.2, 2.8]]) flame(u, h, 1.8, '#fff2b0', off);
      // chispas
      for (let i = 0; i < 3; i++) { const k = ((t / 900 + i / 3) % 1), p = P(0.85 + i * 0.15 + Math.sin(k * 6 + i) * 0.04, 0.4 + k * 0.5); dotc(ctx, p[0], p[1], 0.8, rgba('#ffd27a', 1 - k)); }
    });
  }
  // repisa
  s.box(-0.02, 0.06, 1.3, W + 0.02, 0.98, 1.42, DLOG, { decal: { front: grain(DLOG, 2, 4), top: grain(DLOG, 4, 5) } });
  s.cyl('z', 0.24, 0.6, 0.05, 0.05, 1.42, 1.62, CREAM, { seg: 10, faces: { top: '#f7f0df' } });
  s.cyl('z', 0.38, 0.62, 0.05, 0.05, 1.42, 1.54, CREAM, { seg: 10, faces: { top: '#f7f0df' } });
  s.cyl('z', 1.76, 0.62, 0.09, 0.07, 1.42, 1.6, '#7f8f6a', { seg: 12, faces: { top: '#3a2a1a' } });
  s.ball(1.76, 0.62, 1.68, 0.09, '#3f8a4f');
  if (on) s.over((ctx) => { for (const [u, z] of [[0.24, 1.62], [0.38, 1.54]]) { const [x, y] = s.P(u, 0.6, z); ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.ellipse(x, y - 2.5, 1.2, 2.4, 0, 0, TAU); ctx.fill(); glow(ctx, x, y - 3, 7, '#ffb347', 0.5); } });
  else s.over((ctx) => { for (const [u, z] of [[0.24, 1.62], [0.38, 1.54]]) { const [x, y] = s.P(u, 0.6, z); line(ctx, x, y, x, y - 2, IRON, 0.8); } });
  // tiro de la chimenea
  s.box(0.42, 0.14, 1.42, W - 0.42, 0.62, 2.3, STONE, { decal: { front: stones(11), right: stones(12), left: stones(13), back: stones(14), top: stones(15) } });
  if (on && s.faceVisible(0, 1, 0)) s.over((ctx) => { const [x, y] = s.P(1, 1.0, 0.45); glow(ctx, x, y, 52, '#ff8a3d', 0.22); });
}

// ---------- Barra de troncos ----------
function cabana_bar(s) {
  const W = 2;
  s.shadowRect(0, 0.14, W, 1.0, 0.24);
  s.box(0.04, 0.2, 0, W - 0.04, 0.92, 1.0, LOG, { decal: { front: logsFront(6), back: logsFront(6), left: logEnds(6), right: logEnds(6) } });
  s.box(0.04, 0.92, 0.1, W - 0.04, 0.98, 0.16, IRON);
  s.box(0, 0.12, 1.0, W, 1.0, 1.1, '#b07a45', { decal: { top: grain('#b07a45', 3, 7), front: (x, w, h) => { fr(x, 0, h - 1, w, 1, rgba('#2a1a0e', 0.4)); sheen(x, w, h, 0.15); } } });
}

// ---------- Banco de tronco ----------
function cabana_stool(s) {
  s.shadowEllipse(0.5, 0.5, 0.32, 0.32, 0.24);
  s.cyl('z', 0.5, 0.5, 0.3, 0.27, 0, 0.5, BARK, { seg: 16, faces: { side: BARK } });
  s.custom([0.2, 0.2, 0, 0.8, 0.8, 0.5], (ctx) => {
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * 0.1 + (k / 6) * Math.PI * 0.8;
      const p0 = s.P(0.5 + 0.3 * Math.cos(a), 0.5 + 0.3 * Math.sin(a), 0.04), p1 = s.P(0.5 + 0.27 * Math.cos(a), 0.5 + 0.27 * Math.sin(a), 0.46);
      line(ctx, p0[0], p0[1], p1[0] + (k % 2 ? 1 : -1), p1[1], rgba('#2a1a0e', 0.55), 0.8);
    }
  });
  s.cyl('z', 0.5, 0.5, 0.28, 0.28, 0.5, 0.55, GRAIN, {
    seg: 18, faces: { side: BARK },
    decal: { top: (x, w, h) => { x.strokeStyle = rgba('#8a5a2b', 0.55); x.lineWidth = 0.7; for (let i = 1; i < 5; i++) { x.beginPath(); x.arc(w / 2 + 1, h / 2, (w * i) / 11, 0, TAU); x.stroke(); } line(x, w / 2, h / 2, w * 0.86, h * 0.3, rgba('#5a3a22', 0.6), 0.7); sheen(x, w, h, 0.14); } },
  });
}

// ---------- Mecedora ----------
function cabana_rocker(s) {
  const wd = '#a06a3c';
  s.shadowRect(0.14, 0.04, 0.86, 0.96, 0.2);
  for (const u of [0.18, 0.78]) {
    s.custom([u, 0, 0, u + 0.04, 1, 0.2], (ctx) => {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const v = 0.02 + (i / 12) * 0.96; pts.push(s.P(u + 0.02, v, 0.02 + 0.55 * (v - 0.5) ** 2)); }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [lw, col] of [[4.2, outlineOf(wd)], [2.8, wd], [0.8, rgba('#ffffff', 0.25)]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
    });
    s.box(u, 0.32, 0.06, u + 0.05, 0.37, 0.54, wd);
    s.box(u, 0.74, 0.06, u + 0.05, 0.79, 0.54, wd);
  }
  s.box(0.16, 0.28, 0.54, 0.84, 0.84, 0.62, wd, { decal: { top: grain(wd, 4, 3) } });
  s.box(0.22, 0.34, 0.62, 0.78, 0.8, 0.68, '#b8322a', { decal: { top: (x, w, h) => { for (let i = 1; i < 4; i++) { fr(x, (w * i) / 4 - 0.6, 0, 1.2, h, rgba('#1a1010', 0.35)); fr(x, 0, (h * i) / 4 - 0.6, w, 1.2, rgba('#1a1010', 0.35)); } sheen(x, w, h, 0.14); } } });
  // respaldo: postes, travesaños y barrotes
  for (const u of [0.16, 0.79]) s.box(u, 0.22, 0.54, u + 0.05, 0.28, 1.32, wd, { decal: { front: (x, w, h) => fr(x, 0, 0, w * 0.35, h, rgba('#ffffff', 0.2)) } });
  s.box(0.21, 0.22, 1.16, 0.79, 0.28, 1.28, wd, { decal: { front: grain(wd, 2, 9) } });
  for (let i = 0; i < 5; i++) { const u = 0.27 + i * 0.105; s.box(u, 0.235, 0.68, u + 0.035, 0.265, 1.16, wd); }
  // brazos
  for (const u of [0.12, 0.82]) {
    s.box(u + 0.02, 0.76, 0.62, u + 0.05, 0.79, 0.9, wd);
    s.box(u, 0.28, 0.9, u + 0.07, 0.84, 0.95, wd, { decal: { top: grain(wd, 2, 11) } });
  }
}

// ---------- Mesa de tablones ----------
function cabana_table(s) {
  const W = 2, wd = '#a8723f';
  s.shadowRect(0.04, 0.08, W - 0.04, 0.94, 0.22);
  for (const u of [0.26, W - 0.26]) {
    s.box(u - 0.07, 0.14, 0, u + 0.07, 0.86, 0.08, DLOG);
    s.box(u - 0.05, 0.42, 0.08, u + 0.05, 0.58, 0.7, DLOG, { decal: { front: grain(DLOG, 2, 2) } });
    s.box(u - 0.07, 0.16, 0.7, u + 0.07, 0.84, 0.76, DLOG);
  }
  s.box(0.31, 0.46, 0.3, W - 0.31, 0.54, 0.38, DLOG);
  s.box(0, 0.06, 0.76, W, 0.94, 0.85, wd, { decal: { top: grain(wd, 4, 13), front: (x, w, h) => sheen(x, w, h, 0.15) } });
}

// ---------- Librero rústico ----------
function cabana_bookshelf(s) {
  const W = 2, r = rng(17), wd = '#8a5a34';
  s.shadowRect(0, 0.08, W, 0.95, 0.24);
  s.box(0.08, 0.08, 0, W - 0.08, 0.14, 2.24, shade(wd, -0.25), { decal: { front: (x, w, h) => { for (let i = 1; i < 7; i++) line(x, (w * i) / 7, 0, (w * i) / 7, h, rgba('#1a0e06', 0.35), 0.7); }, back: grain(wd, 6, 2) } });
  for (const u of [0.0, W - 0.1]) s.box(u, 0.06, 0, u + 0.1, 0.94, 2.3, wd, { decal: { front: grain(wd, 1, 3), right: grain(wd, 1, 4), left: grain(wd, 1, 5) } });
  const levels = [0.04, 0.6, 1.16, 1.72];
  for (const z of levels) s.box(0.1, 0.14, z, W - 0.1, 0.9, z + 0.08, wd, { decal: { front: grain(wd, 1, 6) } });
  s.box(-0.04, 0.02, 2.24, W + 0.04, 0.98, 2.34, shade(wd, -0.1), { decal: { top: grain(wd, 3, 7), front: grain(wd, 1, 8) } });
  levels.forEach((z, li) => {
    const z0 = z + 0.08;
    let u = 0.16;
    const deco = [1.3, 0.3, 1.1, 0.5][li];
    while (u < W - 0.18) {
      if (u >= deco && u < deco + 0.36) {
        if (li === 0 || li === 2) {
          // frascos de conserva
          s.cyl('z', u + 0.1, 0.52, 0.07, 0.07, z0, z0 + 0.22, li ? '#d97b3a' : '#9bb86a', { seg: 12, faces: { top: '#c9ced6' } });
          s.cyl('z', u + 0.26, 0.52, 0.06, 0.06, z0, z0 + 0.18, '#c23b2f', { seg: 12, faces: { top: '#c9ced6' } });
        } else if (li === 1) {
          // farolito
          s.box(u + 0.06, 0.4, z0, u + 0.3, 0.64, z0 + 0.04, IRON);
          s.box(u + 0.08, 0.42, z0 + 0.04, u + 0.28, 0.62, z0 + 0.3, rgba('#ffe7a8', 1), { decal: { front: (x, w, h) => { fr(x, 0, 0, 1.2, h, IRON); fr(x, w - 1.2, 0, 1.2, h, IRON); dotc(x, w / 2, h * 0.6, 2, '#ff9a3d'); } } });
          s.box(u + 0.06, 0.4, z0 + 0.3, u + 0.3, 0.64, z0 + 0.34, IRON);
        } else {
          // canasta
          s.box(u + 0.04, 0.3, z0, u + 0.34, 0.78, z0 + 0.2, '#c9a46a', { decal: { front: (x, w, h) => { for (let i = 0; i < w; i += 2.4) line(x, i, 0, i, h, rgba('#7a5a2a', 0.5), 0.6); for (let j = 2; j < h; j += 2.4) line(x, 0, j, w, j, rgba('#7a5a2a', 0.3), 0.5); } } });
        }
        u += 0.4; continue;
      }
      const bw = 0.06 + r() * 0.06, bh = 0.32 + r() * 0.16, col = BOOKS[Math.floor(r() * BOOKS.length)];
      if (u + bw > W - 0.16) break;
      s.box(u, 0.2, z0, u + bw, 0.2 + 0.56 + r() * 0.1, z0 + bh, col, { lw: 0.8, decal: { front: (x, w, h) => { fr(x, 0, h * 0.18, w, 0.9, rgba('#e8d5a0', 0.6)); fr(x, 0, h * 0.78, w, 0.9, rgba('#e8d5a0', 0.6)); } } });
      u += bw + (r() < 0.15 ? 0.04 : 0.006);
    }
  });
}

// ---------- Cama de troncos ----------
function cabana_bed(s, { c }) {
  const W = 2, sheet = CREAM;
  s.shadowRect(0.02, 0.02, W - 0.02, 1.98, 0.26);
  for (const [u, v, z] of [[0.08, 0.08, 1.2], [W - 0.08, 0.08, 1.2], [0.08, 1.9, 0.7], [W - 0.08, 1.9, 0.7]]) {
    s.cyl('z', u, v, 0.075, 0.075, 0, z, LOG, { seg: 12, faces: { top: GRAIN } });
  }
  s.cyl('v', 0.08, 0.26, 0.07, 0.07, 0.16, 1.82, LOG, { seg: 12, decal: { back: logEnds(1), front: logEnds(1) } });
  s.cyl('v', W - 0.08, 0.26, 0.07, 0.07, 0.16, 1.82, LOG, { seg: 12, decal: { back: logEnds(1), front: logEnds(1) } });
  for (const z of [0.42, 0.66, 0.9]) s.cyl('u', 0.08, z, 0.07, 0.07, 0.16, W - 0.16, LOG, { seg: 12, sortBox: [0.16, 0.01, z - 0.07, W - 0.16, 0.15, z + 0.07] });
  s.cyl('u', 1.9, 0.5, 0.07, 0.07, 0.16, W - 0.16, LOG, { seg: 12 });
  s.box(0.16, 0.16, 0.16, W - 0.16, 1.84, 0.3, DLOG);
  s.box(0.16, 0.18, 0.3, W - 0.16, 0.8, 0.46, sheet);
  const plaid = (x, w, h) => {
    fr(x, 0, 0, w, 5, sheet); fr(x, 0, 5, w, 0.8, rgba('#000', 0.2));
    const sq = 6, dk = shade(c, -0.55);
    for (let i = 0; i * sq < w; i++) for (let j = 0; (j * sq) + 6 < h; j++) {
      const y = 6 + j * sq;
      if (i % 2 === 0 && j % 2 === 0) fr(x, i * sq, y, sq, sq, dk);
      else if (i % 2 === 0 || j % 2 === 0) fr(x, i * sq, y, sq, sq, mix(c, dk, 0.45));
    }
    sheen(x, w, h, 0.1);
  };
  s.box(0.14, 0.8, 0.28, W - 0.14, 1.86, 0.52, c, { decal: { top: plaid, front: (x, w, h) => { for (let i = 0; i < w; i += 12) fr(x, i, 0, 6, h, shade(c, -0.5)); } } });
  s.box(0.24, 0.24, 0.46, 0.92, 0.56, 0.6, '#f7f0df', { decal: { top: (x, w, h) => sheen(x, w, h, 0.15) } });
  s.box(1.08, 0.24, 0.46, 1.76, 0.56, 0.6, '#f7f0df', { decal: { top: (x, w, h) => sheen(x, w, h, 0.15) } });
}

// ---------- Tapete trenzado ----------
function cabana_rug(s, { c }) {
  s.cyl('z', 1, 1, 0.95, 0.95, 0, 0.025, c, {
    seg: 40, outline: shade(c, -0.55),
    decal: {
      top: (x, w, h) => {
        const cx = w / 2, cy = h / 2, R = w / 2, cols = [c, CREAM, shade(c, -0.35), '#c9a46a', c, '#6b4426'];
        for (let i = 0; i < 9; i++) {
          const r = R - 2 - i * (R / 9.5);
          if (r <= 1) break;
          x.strokeStyle = cols[i % cols.length]; x.lineWidth = R / 9.5 + 0.3; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke();
          x.strokeStyle = rgba('#000000', 0.18); x.lineWidth = 0.6; x.setLineDash([2, 2]); x.stroke(); x.setLineDash([]);
        }
        dotc(x, cx, cy, 3, CREAM);
      },
    },
  });
}

// ---------- Farol de pared ----------
function cabana_lantern(ctx, { st }) {
  const on = st === 1, cx = 16, y = -46;
  if (on) glow(ctx, cx, y + 14, 21, '#ffb347', 0.4);
  // soporte
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; ctx.fillRect(cx - 3 + 1.5, y + 22, 6, 10);
  fr(ctx, cx - 3, y + 21, 6, 10, IRON);
  ctx.strokeStyle = IRON; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, y + 22); ctx.quadraticCurveTo(cx + 9, y + 20, cx + 8, y + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, y + 2); ctx.lineTo(cx + 8, y + 2); ctx.stroke();
  // farol
  ctx.fillStyle = IRON; ctx.beginPath(); ctx.moveTo(cx - 6, y + 6); ctx.lineTo(cx, y + 1); ctx.lineTo(cx + 6, y + 6); ctx.fill();
  const g = ctx.createLinearGradient(0, y + 6, 0, y + 20);
  g.addColorStop(0, on ? '#fff3c4' : '#9fa7a8'); g.addColorStop(1, on ? '#ffb347' : '#6f7778');
  ctx.fillStyle = g; ctx.fillRect(cx - 5, y + 6, 10, 13);
  if (on) { ctx.fillStyle = '#fff8dc'; ctx.beginPath(); ctx.ellipse(cx, y + 13.5, 1.6, 3, 0, 0, TAU); ctx.fill(); }
  else { line(ctx, cx, y + 16, cx, y + 13, '#2a2a2a', 0.8); fr(ctx, cx - 1.5, y + 16, 3, 3, CREAM); }
  ctx.strokeStyle = IRON; ctx.lineWidth = 1; ctx.strokeRect(cx - 5, y + 6, 10, 13);
  line(ctx, cx - 1.7, y + 6, cx - 1.7, y + 19, IRON, 0.6); line(ctx, cx + 1.7, y + 6, cx + 1.7, y + 19, IRON, 0.6);
  fr(ctx, cx - 6, y + 19, 12, 2, IRON);
  fr(ctx, cx - 4, y + 7, 1, 10, rgba('#ffffff', 0.35));
  dotc(ctx, cx, y + 0.5, 1.4, IRON);
}

export default {
  floor: { cabana_fireplace, cabana_bar, cabana_stool, cabana_rocker, cabana_table, cabana_bookshelf, cabana_bed, cabana_rug },
  wall: { cabana_lantern },
  period: { cabana_fireplace: (st) => (st === 1 ? 110 : 0) },
  defaultColor: { cabana_fireplace: STONE, cabana_bar: LOG, cabana_stool: BARK, cabana_rocker: '#a06a3c', cabana_table: '#a8723f', cabana_bookshelf: '#8a5a34', cabana_lantern: IRON },
};
