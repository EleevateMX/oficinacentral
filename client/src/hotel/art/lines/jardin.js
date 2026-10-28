// Dibujo de la línea "Jardín". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { PINK, YELLOW, shade, rgba, lum, rng } from '../iso.js';

const TAU = Math.PI * 2;
const IRON = '#2d3a33', STONE = '#cfc8ba', WATER = '#3fb0e6', WHITE = '#f4f4f6';
const LEAF = ['#2e8b4a', '#38a35a', '#4bbf6b', '#257a3e'];

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
const grain = (c) => (x, w, h) => { line(x, 0, h * 0.5, w, h * 0.5, rgba(shade(c, -0.5), 0.25), 0.5); sheen(x, w, h, 0.12); };
const depth = (s, u, v) => { const p = s.w(u, v, 0); return p[0] + p[1]; };

// ---------- Banca de parque ----------
function jardin_bench(s, { c }) {
  s.shadowRect(0.04, 0.16, 1.96, 0.92, 0.22);
  for (const u0 of [0.1, 1.82]) {
    s.box(u0, 0.8, 0, u0 + 0.08, 0.88, 0.62, IRON);
    s.box(u0, 0.18, 0, u0 + 0.08, 0.26, 1.05, IRON);
    s.box(u0, 0.26, 0.42, u0 + 0.08, 0.8, 0.47, IRON);
    s.box(u0 - 0.01, 0.2, 0.62, u0 + 0.09, 0.94, 0.68, IRON);
    s.ball(u0 + 0.04, 0.93, 0.66, 0.035, IRON);
  }
  for (const [v0, v1] of [[0.3, 0.42], [0.44, 0.56], [0.58, 0.7], [0.72, 0.84]]) s.box(0.04, v0, 0.47, 1.96, v1, 0.53, c, { decal: { top: grain(c), front: (x, w, h) => sheen(x, w, h, 0.1) } });
  for (const [z0, z1] of [[0.6, 0.71], [0.75, 0.86], [0.9, 1.01]]) s.box(0.04, 0.26, z0, 1.96, 0.31, z1, c, { decal: { front: grain(c), back: grain(c) } });
}

// ---------- Camastro ----------
function jardin_lounger(s, { c }) {
  const fr0 = '#e9eef2', st = lum(c) > 0.85 ? '#7fc8ff' : WHITE;
  s.shadowRect(0.06, 0.12, 0.94, 1.96, 0.22);
  for (const u of [0.1, 0.84]) for (const v of [0.2, 1.84]) s.box(u, v, 0, u + 0.06, v + 0.06, 0.24, fr0);
  s.box(0.08, 0.14, 0.22, 0.92, 1.96, 0.28, fr0);
  const stripes = (x, w, h) => { const n = 5; for (let i = 0; i < n; i++) if (i % 2) fr(x, (w * i) / n, 0, w / n, h, rgba(st, 0.8)); sheen(x, w, h, 0.14); };
  s.box(0.12, 0.62, 0.28, 0.88, 1.92, 0.38, c, { decal: { top: stripes, front: (x, w, h) => sheen(x, w, h, 0.12) } });
  s.prism('u', [[0.14, 0.28], [0.62, 0.28], [0.62, 0.38], [0.3, 0.92], [0.14, 0.86]], 0.12, 0.88, c, { decal: { e3: stripes, e2: stripes, left: (x, w, h) => sheen(x, w, h, 0.1), right: (x, w, h) => sheen(x, w, h, 0.1) } });
  s.box(0.25, 0.3, 0.8, 0.75, 0.42, 0.9, WHITE, { k: 0.02 });
}

// ---------- Fuente ----------
function jardin_fountain(s, { st, t }) {
  const on = st === 1;
  const water = (rFrac) => (x, w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2;
    x.fillStyle = shade(STONE, -0.08); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * rFrac);
    g.addColorStop(0, on ? '#8fdcff' : '#4a8fae'); g.addColorStop(1, on ? WATER : '#2f6f8f');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * rFrac, 0, TAU); x.fill();
    x.strokeStyle = rgba('#000000', 0.18); x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, R * rFrac, 0, TAU); x.stroke();
    if (on) for (let i = 0; i < 3; i++) { const ph = ((t / 1400 + i / 3) % 1); x.strokeStyle = rgba('#ffffff', 0.55 * (1 - ph)); x.lineWidth = 0.8; x.beginPath(); x.arc(cx, cy, R * rFrac * (0.25 + ph * 0.72), 0, TAU); x.stroke(); }
    else { x.fillStyle = rgba('#ffffff', 0.18); x.fillRect(cx - R * 0.4, cy - R * 0.3, R * 0.3, 1); }
  };
  s.shadowEllipse(1, 1, 0.98, 0.98, 0.22);
  s.cyl('z', 1, 1, 0.97, 0.95, 0, 0.36, STONE, { seg: 20, decal: { top: water(0.84) } });
  s.cyl('z', 1, 1, 0.16, 0.12, 0.36, 0.98, STONE, { seg: 12 });
  s.cyl('z', 1, 1, 0.2, 0.48, 0.98, 1.16, STONE, { seg: 16, decal: { top: water(0.8) } });
  s.cyl('z', 1, 1, 0.07, 0.05, 1.16, 1.36, STONE, { seg: 10 });
  s.ball(1, 1, 1.42, 0.08, STONE);
  if (!on) return;
  s.over((ctx) => {
    const [x0, y0] = s.P(1, 1, 1.46);
    ctx.lineCap = 'round';
    ctx.setLineDash([3, 2]); ctx.lineDashOffset = -t / 40;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.5, [x1, y1] = s.P(1 + 0.4 * Math.cos(a), 1 + 0.4 * Math.sin(a), 1.16);
      ctx.strokeStyle = rgba('#d8f3ff', 0.85); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 10, x1, y1); ctx.stroke();
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU, d = s.wv(Math.cos(a), Math.sin(a), 0);
      if (d[0] + d[1] < -0.2) continue;
      const [x1, y1] = s.P(1 + 0.48 * Math.cos(a), 1 + 0.48 * Math.sin(a), 1.16), [x2, y2] = s.P(1 + 0.6 * Math.cos(a), 1 + 0.6 * Math.sin(a), 0.36);
      ctx.strokeStyle = rgba('#d8f3ff', 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(x1 + (x2 - x1) * 0.6, y1, x2, y2); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let i = 0; i < 5; i++) { const ph = ((t / 600 + i / 5) % 1); dotc(ctx, x0 - 6 + i * 3, y0 - 8 * Math.sin(ph * Math.PI), 0.7, rgba('#ffffff', 1 - ph)); }
  });
}

// ---------- Alberca ----------
function jardin_pool(s, { t }) {
  s.box(0, 0, 0, 3, 3, 0.04, '#eef1f4', {
    outline: '#8f9aa3',
    decal: {
      top: (x, w, h) => {
        x.strokeStyle = rgba('#9aa6b0', 0.5); x.lineWidth = 0.5;
        for (let i = 4; i < w; i += 8) line(x, i, 0, i, h, rgba('#9aa6b0', 0.4), 0.5);
        for (let j = 4; j < h; j += 8) line(x, 0, j, w, j, rgba('#9aa6b0', 0.4), 0.5);
        const X = 10, Y = 10, W = w - 20, H = h - 20;
        fr(x, X - 1.5, Y - 1.5, W + 3, H + 3, '#3a86ff');
        const g = x.createLinearGradient(X, Y, X + W, Y + H);
        g.addColorStop(0, '#2a8fd6'); g.addColorStop(0.5, WATER); g.addColorStop(1, '#6fd3f5');
        x.fillStyle = g; x.fillRect(X, Y, W, H);
        x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
        // sombra interior (profundidad)
        fr(x, X, Y, W, 6, rgba('#0b3e6b', 0.35)); fr(x, X, Y, 6, H, rgba('#0b3e6b', 0.25));
        // línea del fondo
        fr(x, X + W / 2 - 1.5, Y + 12, 3, H - 24, rgba('#0b3e6b', 0.35));
        // destellos que se mueven
        const ph = t / 900;
        x.strokeStyle = rgba('#ffffff', 0.45); x.lineWidth = 0.8;
        for (let j = 0; j < 8; j++) {
          x.beginPath();
          for (let i = 0; i <= 12; i++) { const px = X + (i / 12) * W, py = Y + 8 + j * (H / 8) + Math.sin(i * 1.3 + ph + j) * 2; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
          x.stroke();
        }
        // flotador
        const fx = X + W * 0.68 + Math.sin(ph * 0.7) * 3, fy = Y + H * 0.35;
        x.lineWidth = 5; x.strokeStyle = PINK; x.beginPath(); x.arc(fx, fy, 6, 0, TAU); x.stroke();
        x.strokeStyle = WHITE; x.setLineDash([3, 3.3]); x.beginPath(); x.arc(fx, fy, 6, 0, TAU); x.stroke(); x.setLineDash([]);
        x.strokeStyle = rgba('#ffffff', 0.6); x.lineWidth = 0.8; x.beginPath(); x.arc(fx, fy, 6, Math.PI * 1.1, Math.PI * 1.5); x.stroke();
        x.restore();
        // escalerita
        for (const dx of [W * 0.25, W * 0.25 + 9]) { x.strokeStyle = '#c9ced6'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(X + dx, Y + H + 4); x.lineTo(X + dx, Y + H - 6); x.stroke(); }
        for (let i = 0; i < 3; i++) fr(x, X + W * 0.25, Y + H - 4 - i * 3.5, 9, 0.8, '#c9ced6');
      },
    },
  });
}

// ---------- Jardinera ----------
function jardin_flowerbed(s, { c }) {
  const brick = '#b5653a';
  s.shadowRect(0.02, 0.16, 1.98, 0.86, 0.22);
  const bricks = (x, w, h) => {
    for (let j = 0; j < 3; j++) {
      const y = (h * j) / 3; line(x, 0, y, w, y, rgba('#5a2a14', 0.45), 0.6);
      for (let i = (j % 2) * 5; i < w; i += 10) line(x, i, y, i, y + h / 3, rgba('#5a2a14', 0.45), 0.6);
    }
    sheen(x, w, h, 0.1);
  };
  s.box(0.04, 0.18, 0, 1.96, 0.82, 0.32, brick, { faces: { top: '#4a3020' }, decal: { front: bricks, right: bricks, left: bricks, back: bricks, top: (x, w, h) => { fr(x, 0, 0, w, 2, brick); fr(x, 0, h - 2, w, 2, brick); fr(x, 0, 0, 2, h, brick); fr(x, w - 2, 0, 2, h, brick); } } });
  s.custom([0.06, 0.2, 0.32, 1.94, 0.8, 0.8], (ctx) => {
    const r = rng(11), fl = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) fl.push({ u: 0.18 + i * 0.235 + (j ? 0.1 : 0), v: 0.36 + j * 0.28, hh: 0.2 + r() * 0.2, k: (i + j) % 3 });
    fl.sort((a, b) => depth(s, a.u, a.v) - depth(s, b.u, b.v));
    for (const f of fl) {
      const [x, y] = s.P(f.u, f.v, 0.32), [x1, y1] = s.P(f.u, f.v, 0.32 + f.hh);
      line(ctx, x, y, x1, y1, '#2e7d3a', 1);
      ctx.fillStyle = LEAF[f.k]; ctx.beginPath(); ctx.ellipse(x - 2.5, y - 3, 3, 1.4, -0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 2.5, y - 4, 3, 1.4, 0.5, 0, TAU); ctx.fill();
      const pc = f.k === 2 ? WHITE : f.k === 1 ? shade(c, 0.3) : c;
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; dotc(ctx, x1 + Math.cos(a) * 2, y1 + Math.sin(a) * 1.6, 1.7, shade(pc, -0.4)); }
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; dotc(ctx, x1 + Math.cos(a) * 1.9, y1 + Math.sin(a) * 1.5, 1.35, pc); }
      dotc(ctx, x1, y1, 0.9, c === YELLOW ? '#ff7a3d' : YELLOW);
    }
  });
}

// ---------- Sombrilla ----------
function jardin_umbrella(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.7, 0.7, 0.18);
  s.cyl('z', 0.5, 0.5, 0.2, 0.17, 0, 0.08, '#3a3d46', { seg: 16 });
  s.cyl('z', 0.5, 0.5, 0.026, 0.026, 0.08, 2.05, WHITE, { seg: 8 });
  s.custom([-0.25, -0.25, 1.65, 1.25, 1.25, 2.3], (ctx) => {
    const n = 12, R = 0.74, zr = 1.74, apex = s.P(0.5, 0.5, 2.18);
    const rim = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU; rim.push({ a, u: 0.5 + R * Math.cos(a), v: 0.5 + R * Math.sin(a) }); }
    const panels = rim.map((p, k) => { const q = rim[(k + 1) % n], am = (p.a + q.a + (k === n - 1 ? TAU : 0)) / 2; return { p, q, k, d: depth(s, 0.5 + Math.cos(am), 0.5 + Math.sin(am)), am }; });
    panels.sort((a, b) => a.d - b.d);
    for (const pn of panels) {
      const A = s.P(pn.p.u, pn.p.v, zr), B = s.P(pn.q.u, pn.q.v, zr);
      const dir = s.wv(Math.cos(pn.am), Math.sin(pn.am), 0);
      const col = pn.k % 2 ? WHITE : c, lk = 0.08 - 0.12 * Math.max(0, dir[0]) - 0.04 * Math.max(0, dir[1]);
      const fill = shade(col, lk);
      ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = shade(fill, -0.2); ctx.lineWidth = 0.6; ctx.stroke();
      if (dir[0] + dir[1] > 0) { // faldón festoneado al frente
        ctx.fillStyle = shade(col, lk - 0.08); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        ctx.quadraticCurveTo((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + 6, A[0], A[1]); ctx.fill();
      }
    }
    ctx.strokeStyle = shade(c, -0.55); ctx.lineWidth = 1; ctx.beginPath();
    rim.forEach((p, k) => { const [x, y] = s.P(p.u, p.v, zr); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath();
    ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
    dotc(ctx, apex[0], apex[1] - 1.5, 2, shade(c, -0.2)); dotc(ctx, apex[0] - 0.5, apex[1] - 2, 0.7, '#ffffff');
  });
}

// ---------- Farol ----------
function jardin_lamp(s, { st }) {
  const on = st === 1, iron = '#22262b', warm = '#ffe7a3';
  s.shadowEllipse(0.5, 0.5, 0.2, 0.2, 0.24);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.3, warm, 0.32));
  s.cyl('z', 0.5, 0.5, 0.18, 0.15, 0, 0.1, iron, { seg: 8 });
  s.cyl('z', 0.5, 0.5, 0.06, 0.04, 0.1, 0.3, iron, { seg: 8 });
  s.cyl('z', 0.5, 0.5, 0.032, 0.032, 0.3, 1.55, iron, { seg: 8 });
  s.cyl('z', 0.5, 0.5, 0.08, 0.12, 1.55, 1.62, iron, { seg: 8 });
  s.cyl('z', 0.5, 0.5, 0.12, 0.15, 1.62, 1.92, on ? warm : '#5d6a73', { seg: 8, k: on ? 0.1 : 0, flat: on, outline: iron, faces: { side: on ? warm : '#5d6a73' } });
  s.custom([0.33, 0.33, 1.62, 0.67, 0.67, 1.92], (ctx) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU, d = s.wv(Math.cos(a), Math.sin(a), 0); if (d[0] + d[1] < 0) continue;
      const [x0, y0] = s.P(0.5 + 0.12 * Math.cos(a), 0.5 + 0.12 * Math.sin(a), 1.62), [x1, y1] = s.P(0.5 + 0.15 * Math.cos(a), 0.5 + 0.15 * Math.sin(a), 1.92);
      line(ctx, x0, y0, x1, y1, iron, 1);
    }
    if (on) { const [x, y] = s.P(0.5, 0.5, 1.75); dotc(ctx, x, y, 2.6, '#ffffff'); }
  });
  s.cyl('z', 0.5, 0.5, 0.2, 0.03, 1.92, 2.08, iron, { seg: 8 });
  s.ball(0.5, 0.5, 2.1, 0.035, iron);
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 1.77); glow(ctx, x, y, 40, warm, 0.35); });
}

// ---------- Pasto ----------
function jardin_grass(s, { c }) {
  s.box(0, 0, 0, 1, 1, 0.02, c, {
    outline: shade(c, -0.45),
    decal: {
      top: (x, w, h) => {
        const r = rng(5);
        for (let i = 0; i < 70; i++) { const px = r() * w, py = r() * h; line(x, px, py, px + (r() - 0.5) * 2, py - 2 - r() * 2, rgba(r() < 0.5 ? shade(c, -0.35) : shade(c, 0.3), 0.7), 0.6); }
        for (let i = 0; i < 3; i++) { const px = 6 + r() * (w - 12), py = 6 + r() * (h - 12); dotc(x, px, py, 1.1, i % 2 ? WHITE : YELLOW); }
      },
    },
  });
}

// ---------- Casita de pájaros (pared) ----------
function jardin_birdhouse(ctx, { c }) {
  const x = 8, y = -40, w = 16, h = 20;
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; ctx.fillRect(x + 2, y + 2, w, h + 6);
  fr(ctx, x + w / 2 - 1.5, y + h, 3, 10, '#6b4128');
  fr(ctx, x, y, w, h, c); fr(ctx, x, y, 2, h, shade(c, 0.2)); fr(ctx, x + w - 2, y, 2, h, shade(c, -0.2));
  ctx.strokeStyle = shade(c, -0.55); ctx.lineWidth = 0.7; ctx.strokeRect(x, y, w, h);
  for (let i = 4; i < h; i += 4) fr(ctx, x + 1, y + i, w - 2, 0.5, rgba(shade(c, -0.5), 0.35));
  dotc(ctx, x + w / 2, y + 8, 3.3, '#2a1a12'); dotc(ctx, x + w / 2 - 0.8, y + 7.4, 1, rgba('#ffffff', 0.15));
  fr(ctx, x + w / 2 - 0.6, y + 13, 1.2, 4, '#6b4128'); fr(ctx, x + w / 2 - 2.5, y + 13, 5, 1.2, '#8a5a3b');
  ctx.fillStyle = '#7a3a22'; ctx.beginPath(); ctx.moveTo(x - 3, y + 1); ctx.lineTo(x + w / 2, y - 10); ctx.lineTo(x + w + 3, y + 1); ctx.lineTo(x + w + 3, y + 3); ctx.lineTo(x + w / 2, y - 8); ctx.lineTo(x - 3, y + 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a160a'; ctx.stroke();
  ctx.fillStyle = shade(c, -0.1); ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + w / 2, y - 7.5); ctx.lineTo(x + w, y + 0.5); ctx.closePath(); ctx.fill();
  // pajarito
  const bx = x + w - 2, by = y - 6;
  dotc(ctx, bx, by, 3, YELLOW); dotc(ctx, bx + 2.4, by - 2.2, 2, YELLOW);
  ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.moveTo(bx + 4.2, by - 2.6); ctx.lineTo(bx + 6, by - 2); ctx.lineTo(bx + 4.2, by - 1.4); ctx.fill();
  dotc(ctx, bx + 2.9, by - 2.6, 0.5, '#141414');
  ctx.fillStyle = '#e0a800'; ctx.beginPath(); ctx.ellipse(bx - 0.6, by - 0.4, 2, 1.2, -0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e0a800'; ctx.beginPath(); ctx.moveTo(bx - 2.5, by); ctx.lineTo(bx - 5, by - 1.5); ctx.lineTo(bx - 4, by + 1.5); ctx.fill();
}

export default {
  floor: { jardin_bench, jardin_lounger, jardin_fountain, jardin_pool, jardin_flowerbed, jardin_umbrella, jardin_lamp, jardin_grass },
  wall: { jardin_birdhouse },
  period: { jardin_fountain: (st) => (st === 1 ? 120 : 0), jardin_pool: () => 300 },
  defaultColor: { jardin_fountain: STONE, jardin_pool: WATER, jardin_lamp: '#22262b' },
};
