// Dibujo de la línea "Fiesta". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { PINK, YELLOW, shade, mix, rgba, lum, outlineOf } from '../iso.js';
import { drawWord, wordWidth, hexLogo } from '../glyphs.js';

const TAU = Math.PI * 2;
const PARTY = [PINK, YELLOW, '#3a86ff', '#2fb67c', '#8e5cf7', '#ff7a3d'];
const CHROME = '#d6dbe2', BOOTH = '#1d1d24';

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
const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

// ---------- Máquina de refrescos ----------
function fiesta_soda(s, { c, st, t }) {
  const on = st === 1, trim = lum(c) < 0.2 ? PINK : '#ffffff';
  s.shadowRect(0.06, 0.12, 0.96, 0.94, 0.26);
  const front = (x, w, h) => {
    // ventana con latas
    const X = 3, Y = 9, W = w * 0.62, H = h * 0.6;
    fr(x, X - 1, Y - 1, W + 2, H + 2, shade(c, -0.5));
    const g = x.createLinearGradient(0, Y, 0, Y + H);
    g.addColorStop(0, on ? '#e9f6ff' : '#3a3f4a'); g.addColorStop(1, on ? '#b8dcf2' : '#252a33');
    x.fillStyle = g; x.fillRect(X, Y, W, H);
    const rows = 5, cols = 4;
    for (let j = 0; j < rows; j++) {
      fr(x, X, Y + ((j + 1) * H) / rows - 1, W, 1, rgba('#000000', 0.35));
      for (let i = 0; i < cols; i++) {
        const cc = PARTY[(i + j * 2) % PARTY.length], cw = W / cols;
        const bx = X + i * cw + cw * 0.22, by = Y + (j * H) / rows + 1.5, bw = cw * 0.56, bh = H / rows - 3;
        fr(x, bx, by, bw, bh, on ? cc : shade(cc, -0.55));
        fr(x, bx, by + bh * 0.35, bw, 1, rgba('#ffffff', on ? 0.7 : 0.2));
      }
    }
    if (on) for (let i = 0; i < 4; i++) { const ph = ((t / 1600 + i / 4) % 1); dotc(x, X + 3 + i * (W / 4), Y + H - ph * H, 0.8, rgba('#ffffff', 0.8 * (1 - ph))); }
    x.fillStyle = rgba('#ffffff', 0.25); x.beginPath(); x.moveTo(X + W * 0.55, Y); x.lineTo(X + W * 0.75, Y); x.lineTo(X + W * 0.35, Y + H); x.lineTo(X + W * 0.15, Y + H); x.fill();
    // botones, monedero y salida
    const bx = X + W + 3, bw = w - bx - 3;
    fr(x, bx, Y, bw, H * 0.5, shade(c, -0.4));
    for (let i = 0; i < 6; i++) fr(x, bx + 1.5 + (i % 2) * (bw / 2), Y + 2 + Math.floor(i / 2) * 5, bw / 2 - 3, 3, on ? PARTY[i] : '#555');
    fr(x, bx + bw / 2 - 1, Y + H * 0.6, 2, 5, '#141418');
    fr(x, 4, h - 13, w - 8, 8, '#141418'); fr(x, 4, h - 13, w - 8, 1.5, rgba('#ffffff', 0.15));
    // marquesina
    fr(x, 2, 2, w - 4, 5, on ? trim : shade(trim, -0.4));
    x.strokeStyle = c; x.lineWidth = 1.2; x.beginPath();
    for (let i = 0; i <= 20; i++) { const px = 3 + (i / 20) * (w - 6), py = 4.5 + Math.sin(i * 0.9) * 1.2; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    x.stroke();
    sheen(x, w, h, 0.12);
  };
  const side = (x, w, h) => {
    x.fillStyle = rgba(trim, 0.9); x.beginPath(); x.moveTo(0, h * 0.62); x.quadraticCurveTo(w * 0.5, h * 0.45, w, h * 0.5); x.lineTo(w, h * 0.6); x.quadraticCurveTo(w * 0.5, h * 0.55, 0, h * 0.72); x.closePath(); x.fill();
    hexLogo(x, w / 2, h * 0.28, 5, { inner: false });
    sheen(x, w, h, 0.16);
  };
  s.box(0.08, 0.14, 0, 0.92, 0.9, 2.02, c, { decal: { front: front, left: side, right: side, top: (x, w, h) => sheen(x, w, h, 0.2) } });
  if (on && s.faceVisible(0, 1, 0)) s.over((ctx) => { const [x, y] = s.P(0.4, 0.9, 1.2); glow(ctx, x, y, 38, '#bfe6ff', 0.22); });
}

// ---------- Máquina de helado ----------
function cone(ctx, x, y, sz, cream, withCream = true) {
  ctx.fillStyle = '#e0a458'; ctx.beginPath(); ctx.moveTo(x - sz, y - sz * 1.6); ctx.lineTo(x + sz, y - sz * 1.6); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8a5a20'; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.strokeStyle = rgba('#8a5a20', 0.6); ctx.lineWidth = 0.5;
  for (let i = 1; i < 3; i++) { line(ctx, x - sz + i * sz * 0.66, y - sz * 1.6, x - sz * 0.2 + i * sz * 0.3, y - sz * 0.5, rgba('#8a5a20', 0.6), 0.5); line(ctx, x + sz - i * sz * 0.66, y - sz * 1.6, x + sz * 0.2 - i * sz * 0.3, y - sz * 0.5, rgba('#8a5a20', 0.6), 0.5); }
  if (!withCream) return;
  const ol = shade(cream, -0.45);
  for (const [dy, r] of [[1.75, 1.1], [2.45, 0.85], [3.05, 0.55]]) {
    ctx.fillStyle = cream; ctx.beginPath(); ctx.ellipse(x, y - sz * dy, sz * r * 1.05, sz * 0.5, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 0.6; ctx.stroke();
  }
  ctx.fillStyle = cream; ctx.beginPath(); ctx.moveTo(x - sz * 0.3, y - sz * 3.2); ctx.quadraticCurveTo(x + sz * 0.1, y - sz * 4, x + sz * 0.2, y - sz * 3.3); ctx.fill();
  dotc(ctx, x - sz * 0.4, y - sz * 2.6, sz * 0.15, rgba('#ffffff', 0.7));
}
function fiesta_icecream(s, { c, st }) {
  const on = st === 1, accent = lum(c) > 0.9 ? PINK : shade(c, -0.35);
  s.shadowRect(0.1, 0.14, 0.92, 0.9, 0.26);
  const cab = (x, w, h) => {
    fr(x, 0, 2, w, 2.2, accent);
    const hh = 4.2, ww = wordWidth('HELADO', hh);
    drawWord(x, 'HELADO', (w - ww) / 2, h * 0.32, hh, accent, 1);
    for (let i = 0; i < 5; i++) dotc(x, w * (0.18 + i * 0.16), h * 0.62, 1.6, PARTY[i]);
    fr(x, 3, h - 5, w - 6, 1.4, rgba('#000000', 0.2));
    sheen(x, w, h, 0.14);
  };
  s.box(0.12, 0.16, 0, 0.88, 0.88, 0.9, c, { decal: { front: cab, left: (x, w, h) => { fr(x, 0, 2, w, 2.2, accent); sheen(x, w, h, 0.12); }, right: (x, w, h) => fr(x, 0, 2, w, 2.2, accent) } });
  s.box(0.3, 0.7, 0.9, 0.7, 0.92, 0.94, CHROME, { decal: { top: (x, w, h) => { for (let i = 2; i < w - 1; i += 2.5) fr(x, i, 0, 1, h, rgba('#000000', 0.25)); } } });
  const head = (x, w, h) => {
    fr(x, 3, 3, w - 6, h * 0.36, on ? '#1b2b3a' : '#202228');
    if (on) { fr(x, 5, 5, (w - 10) * 0.6, 1.4, '#47d7ff'); fr(x, 5, 8, (w - 10) * 0.35, 1.2, PINK); }
    for (const a of [0.3, 0.7]) { fr(x, w * a - 1, h * 0.52, 2, h * 0.3, '#2b2d38'); dotc(x, w * a, h * 0.5, 2, a < 0.5 ? PINK : '#7b4a2a'); }
    sheen(x, w, h, 0.18);
  };
  s.box(0.18, 0.2, 0.9, 0.82, 0.68, 1.48, CHROME, { decal: { front: head, left: (x, w, h) => sheen(x, w, h, 0.2), right: (x, w, h) => sheen(x, w, h, 0.15) } });
  s.box(0.42, 0.68, 1.12, 0.58, 0.78, 1.24, CHROME);
  if (on) s.custom([0.38, 0.72, 0.94, 0.62, 0.92, 1.12], (ctx) => { const [x, y] = s.P(0.5, 0.8, 0.94); cone(ctx, x, y, 3.2, '#ffd1df'); });
  s.custom([0.3, 0.3, 1.48, 0.7, 0.6, 1.95], (ctx) => {
    const [x, y] = s.P(0.5, 0.45, 1.48);
    fr(ctx, x - 0.8, y - 4, 1.6, 4, '#8b909c');
    cone(ctx, x, y - 2, 5, PINK);
    if (on) glow(ctx, x, y - 16, 16, PINK, 0.25);
  });
}

// ---------- Bola disco ----------
function fiesta_discoball(s, { st, t }) {
  const on = st === 1, f = Math.floor(t / 120);
  if (on) s.under((ctx) => {
    const [cx, cy] = s.P(0.5, 0.5, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + t / 1400, r = 26 + (i % 3) * 14;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.5;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); glow(ctx, 0, 0, 7, PARTY[i % PARTY.length], 0.75); ctx.restore();
    }
  });
  s.shadowEllipse(0.5, 0.5, 0.22, 0.22, 0.14);
  s.cyl('z', 0.5, 0.5, 0.1, 0.12, 3.02, 3.08, '#3a3d46', { seg: 12 });
  s.custom([0.12, 0.12, 2.0, 0.88, 0.88, 3.02], (ctx) => {
    const [x0, y0] = s.P(0.5, 0.5, 3.02), [x, y] = s.P(0.5, 0.5, 2.4), R = 0.36 * 34;
    ctx.strokeStyle = '#8b909c'; ctx.lineWidth = 0.9; ctx.setLineDash([1.5, 1]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y - R); ctx.stroke(); ctx.setLineDash([]);
    if (on) glow(ctx, x, y, R * 3, '#ffffff', 0.2);
    ctx.fillStyle = '#7d8591'; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
    const rows = 8, rot = on ? t / 900 : 0;
    for (let j = 0; j < rows; j++) {
      const lat0 = -Math.PI / 2 + (j / rows) * Math.PI, lat1 = lat0 + Math.PI / rows;
      const ya = y + Math.sin(lat0) * R, yb = y + Math.sin(lat1) * R, rr0 = Math.cos((lat0 + lat1) / 2) * R;
      const n = Math.max(4, Math.round(16 * Math.cos((lat0 + lat1) / 2)));
      for (let i = 0; i < n; i++) {
        const lon = (i / n) * TAU + rot, lon1 = lon + TAU / n;
        if (Math.cos(lon) < 0 && Math.cos(lon1) < 0) continue;
        const s0 = Math.sin(lon), s1 = Math.sin(lon1);
        const px0 = x + Math.min(s0, s1) * rr0, px1 = x + Math.max(s0, s1) * rr0;
        const lit = hash(i + j * 31, on ? (f + i) % 7 : 0);
        const shadeK = (Math.cos(lon) * 0.5 + 0.5) * 0.5 - (j / rows) * 0.25;
        let col = shade('#c9d0da', shadeK - 0.15 + lit * 0.25);
        if (on && lit > 0.86) col = PARTY[(i + j + f) % PARTY.length];
        if (lit > 0.95) col = '#ffffff';
        fr(ctx, px0 + 0.3, ya + 0.3, Math.max(0.4, px1 - px0 - 0.6), yb - ya - 0.6, col);
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    dotc(ctx, x - R * 0.4, y - R * 0.45, 1.6, '#ffffff');
    if (on) for (let i = 0; i < 4; i++) { const k = (f + i * 3) % 6; if (k < 3) { const a = i * 1.7; const sx = x + Math.cos(a) * R * 1.3, sy = y + Math.sin(a) * R * 1.1; ctx.fillStyle = '#ffffff'; ctx.beginPath(); for (let q = 0; q < 8; q++) { const rr2 = q % 2 ? 0.5 : [1.5, 2.6, 1.8][k]; const an = (q / 8) * TAU; ctx.lineTo(sx + rr2 * Math.cos(an), sy + rr2 * Math.sin(an)); } ctx.fill(); } }
  });
  if (on) s.over((ctx) => {
    const [x, y] = s.P(0.5, 0.5, 2.4);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + t / 1400, [fx, fy] = [s.P(0.5, 0.5, 0)[0] + Math.cos(a) * 40, s.P(0.5, 0.5, 0)[1] + Math.sin(a) * 20];
      const g = ctx.createLinearGradient(x, y, fx, fy); g.addColorStop(0, rgba(PARTY[i], 0.35)); g.addColorStop(1, rgba(PARTY[i], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx - 4, fy); ctx.lineTo(fx + 4, fy); ctx.closePath(); ctx.fill();
    }
  });
}

// ---------- Pista de baile ----------
function fiesta_dancefloor(s, { st, t }) {
  const on = st === 1, f = Math.floor(t / 350);
  s.box(0, 0, 0, 2, 2, 0.04, '#2b2d38', {
    outline: '#0e0e12',
    decal: {
      top: (x, w, h) => {
        fr(x, 0, 0, w, h, '#16161c');
        const n = 4, cw = (w - 4) / n, ch = (h - 4) / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const X = 2 + i * cw + 0.8, Y = 2 + j * ch + 0.8, W = cw - 1.6, H = ch - 1.6;
          if (on) {
            const k = (i + j * 3 + f + ((f >> 1) % 2 ? i * j : 0)) % PARTY.length, col = PARTY[k];
            const lit = hash(i * 7 + j, f % 5) > 0.25;
            const g = x.createRadialGradient(X + W / 2, Y + H / 2, 0, X + W / 2, Y + H / 2, W * 0.7);
            g.addColorStop(0, lit ? mix(col, '#ffffff', 0.3) : shade(col, -0.3)); g.addColorStop(1, lit ? col : shade(col, -0.55));
            x.fillStyle = g; x.fillRect(X, Y, W, H);
          } else {
            fr(x, X, Y, W, H, '#24232d');
            fr(x, X, Y, W, 1.2, rgba('#ffffff', 0.08));
          }
        }
        fr(x, 0, 0, w, 1.6, '#9aa0aa'); fr(x, 0, 0, 1.6, h, '#9aa0aa');
      },
    },
  });
  if (on) s.over((ctx) => floorGlow(ctx, s, 1, 1, 1.4, PARTY[f % PARTY.length], 0.18));
}

// ---------- Cabina de DJ ----------
function fiesta_dj(s, { st, t }) {
  const on = st === 1, f = Math.floor(t / 120);
  s.shadowRect(0.02, 0.1, 1.98, 0.96, 0.26);
  if (on) s.under((ctx) => floorGlow(ctx, s, 1, 0.9, 1.6, PINK, 0.24));
  const front = (x, w, h) => {
    fr(x, 0, 0, w, h, BOOTH);
    // ecualizador
    const n = 14, bw = (w - 8) / n;
    for (let i = 0; i < n; i++) {
      const lv = on ? 2 + Math.floor(hash(i, f) * 6) : 1;
      for (let k = 0; k < 7; k++) fr(x, 4 + i * bw + 0.4, h - 5 - k * 2.4, bw - 0.8, 1.6, k < lv ? (k > 4 ? PINK : k > 2 ? YELLOW : '#47ff9a') : rgba('#ffffff', 0.05));
    }
    hexLogo(x, w / 2, h * 0.3, 6, { ring: on ? YELLOW : '#6a5f40', outline: 'rgba(0,0,0,0.5)' });
    fr(x, 0, 1.5, w, 1.4, on ? PINK : '#5a3a48');
    sheen(x, w, h, 0.1);
  };
  s.box(0.04, 0.16, 0, 1.96, 0.9, 1.0, BOOTH, { decal: { front, left: (x, w, h) => { fr(x, 0, 1.5, w, 1.4, on ? PINK : '#5a3a48'); sheen(x, w, h, 0.1); }, right: (x, w, h) => fr(x, 0, 1.5, w, 1.4, on ? PINK : '#5a3a48') } });
  s.box(0.0, 0.1, 1.0, 2.0, 0.96, 1.06, '#2b2d38', { decal: { front: (x, w, h) => fr(x, 0, 0, w, h, on ? PINK : '#4a3a42') } });
  const deck = (x, w, h) => {
    fr(x, 0, 0, w, h, '#b9c0c9');
    const cx = w * 0.45, cy = h / 2, r = Math.min(w, h) * 0.4;
    dotc(x, cx, cy, r, '#141418');
    x.strokeStyle = rgba('#ffffff', 0.12); x.lineWidth = 0.5; for (const k of [0.55, 0.75]) { x.beginPath(); x.arc(cx, cy, r * k, 0, TAU); x.stroke(); }
    dotc(x, cx, cy, r * 0.3, PINK); dotc(x, cx, cy, 0.8, '#ffffff');
    const a = on ? t / 160 : 0.4; line(x, cx + Math.cos(a) * r * 0.32, cy + Math.sin(a) * r * 0.32, cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, rgba('#ffffff', 0.6), 0.8);
    line(x, w - 3, 3, w * 0.7, cy + 2, '#3a3d46', 1.2); dotc(x, w - 3, 3, 1.2, '#3a3d46');
  };
  s.box(0.1, 0.22, 1.06, 0.8, 0.84, 1.12, '#b9c0c9', { decal: { top: deck } });
  s.box(1.2, 0.22, 1.06, 1.9, 0.84, 1.12, '#b9c0c9', { decal: { top: deck } });
  s.box(0.86, 0.26, 1.06, 1.14, 0.8, 1.15, '#26282f', {
    decal: { top: (x, w, h) => { for (let i = 0; i < 3; i++) { fr(x, 2 + i * ((w - 4) / 3) + 1, 3, 1, h * 0.45, '#0e0e12'); fr(x, 1 + i * ((w - 4) / 3), 3 + ((i * 7 + (on ? f : 0)) % 8), 3, 1.6, CHROME); } for (let i = 0; i < 3; i++) dotc(x, 3 + i * ((w - 6) / 2), h * 0.75, 1.1, on ? PARTY[(i + f) % 3] : '#555'); } },
  });
}

// ---------- Bocina grande ----------
function fiesta_speaker(s, { st, t }) {
  const on = st === 1, pulse = on ? Math.abs(Math.sin(t / 140)) : 0;
  s.shadowRect(0.1, 0.18, 0.92, 0.9, 0.26);
  const front = (x, w, h) => {
    fr(x, 0, 0, w, h, '#1b1b21');
    x.strokeStyle = rgba('#ffffff', 0.08); x.lineWidth = 0.6; x.strokeRect(1.5, 1.5, w - 3, h - 3);
    const cx = w / 2;
    dotc(x, cx, h * 0.2, 4.6, '#2e2f37'); dotc(x, cx, h * 0.2, 2.4, '#4a4d58'); dotc(x, cx - 0.6, h * 0.2 - 0.6, 0.8, rgba('#ffffff', 0.5));
    const R = Math.min(w * 0.4, h * 0.3);
    if (on) { x.strokeStyle = PINK; x.lineWidth = 1.4; x.beginPath(); x.arc(cx, h * 0.62, R + 1.4, 0, TAU); x.stroke(); glow(x, cx, h * 0.62, R + 6, PINK, 0.35); }
    dotc(x, cx, h * 0.62, R, '#2a2b33');
    const r2 = R * (0.72 + pulse * 0.1);
    const g = x.createRadialGradient(cx - 2, h * 0.62 - 2, 1, cx, h * 0.62, r2);
    g.addColorStop(0, '#5a5e6a'); g.addColorStop(1, '#16161c');
    x.fillStyle = g; x.beginPath(); x.arc(cx, h * 0.62, r2, 0, TAU); x.fill();
    dotc(x, cx, h * 0.62, R * 0.22, '#3a3d46');
    hexLogo(x, cx, h - 4, 2.2, { inner: false });
  };
  const grille = (x, w, h) => { for (let i = 3; i < w - 2; i += 3) for (let j = 3; j < h - 2; j += 3) dotc(x, i, j, 0.5, rgba('#ffffff', 0.08)); };
  s.box(0.12, 0.2, 0, 0.88, 0.86, 1.62, '#26262e', { decal: { front, left: grille, right: grille, back: grille, top: (x, w, h) => sheen(x, w, h, 0.12) } });
  if (on && s.faceVisible(0, 1, 0)) s.over((ctx) => {
    const [x, y] = s.P(0.5, 0.86, 0.6);
    ctx.strokeStyle = rgba('#ffffff', 0.5 * pulse + 0.15); ctx.lineWidth = 1;
    for (const r of [16, 22]) { ctx.beginPath(); ctx.arc(x, y, r + pulse * 3, -0.5 + Math.PI / 2, 0.5 + Math.PI / 2); ctx.stroke(); }
  });
}

// ---------- Globos ----------
function fiesta_balloons(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.3, 0.26, 0.14);
  s.cyl('z', 0.5, 0.5, 0.08, 0.06, 0, 0.1, YELLOW, { seg: 10 });
  s.custom([0.1, 0.1, 0.1, 0.9, 0.9, 2.3], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.1);
    const others = PARTY.filter((p) => p !== c);
    const B = [[-12, -54, others[0]], [11, -58, others[1]], [0, -66, c], [-6, -46, others[2]], [9, -45, c]];
    for (const [dx, dy] of B) { ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(x + dx * 0.3 + 3, y + dy * 0.5, x + dx, y + dy + 8); ctx.stroke(); }
    for (const [dx, dy, col] of B) {
      const bx = x + dx, by = y + dy;
      const g = ctx.createRadialGradient(bx - 2.5, by - 3, 0.5, bx, by, 8);
      g.addColorStop(0, shade(col, 0.45)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.3));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, 6.4, 7.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = outlineOf(col); ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.moveTo(bx - 1.4, by + 8.6); ctx.lineTo(bx + 1.4, by + 8.6); ctx.lineTo(bx, by + 7); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.6); ctx.beginPath(); ctx.ellipse(bx - 2.4, by - 3, 1.2, 2, -0.5, 0, TAU); ctx.fill();
    }
  });
}

// ---------- Pastel ----------
function fiesta_cake(s, { c, st, t }) {
  const on = st === 1, cream = c === '#f4f4f6' ? '#ffb3cf' : '#fbf6ef';
  s.shadowEllipse(0.5, 0.5, 0.34, 0.34, 0.22);
  s.cyl('z', 0.5, 0.5, 0.36, 0.36, 0, 0.03, '#f6f5f2', { seg: 24 });
  s.cyl('z', 0.5, 0.5, 0.29, 0.29, 0.03, 0.26, c, { seg: 24 });
  s.cyl('z', 0.5, 0.5, 0.3, 0.3, 0.22, 0.28, cream, { seg: 24, decal: { top: (x, w, h) => { for (let i = 0; i < 14; i++) { const a = i * 2.4, r = w * (0.3 + (i % 3) * 0.05); fr(x, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r * 0.9, 1.6, 0.8, PARTY[i % PARTY.length]); } } } });
  s.cyl('z', 0.5, 0.5, 0.19, 0.19, 0.28, 0.46, shade(c, 0.12), { seg: 22 });
  s.cyl('z', 0.5, 0.5, 0.2, 0.2, 0.43, 0.48, cream, { seg: 22, decal: { top: (x, w, h) => { dotc(x, w / 2, h / 2, 2, '#e8243c'); dotc(x, w / 2 - 0.5, h / 2 - 0.6, 0.6, '#ffffff'); } } });
  s.custom([0.3, 0.3, 0.48, 0.7, 0.7, 0.8], (ctx) => {
    const ca = [[0.4, 0.42], [0.6, 0.42], [0.5, 0.6]].map(([u, v]) => ({ u, v, d: s.w(u, v, 0)[0] + s.w(u, v, 0)[1] })).sort((a, b) => a.d - b.d);
    ca.forEach((p, i) => {
      const [x, y] = s.P(p.u, p.v, 0.48);
      fr(ctx, x - 1, y - 9, 2, 9, ['#3a86ff', PINK, YELLOW][i]);
      fr(ctx, x - 1, y - 6, 2, 1, rgba('#ffffff', 0.7)); fr(ctx, x - 1, y - 3, 2, 1, rgba('#ffffff', 0.7));
      line(ctx, x, y - 9, x, y - 10.5, '#333', 0.6);
      if (on) {
        const fl = 1 + Math.sin(t / 60 + i * 2) * 0.25;
        glow(ctx, x, y - 13, 7, '#ffcc66', 0.45);
        ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.ellipse(x, y - 12.5, 1.6, 2.8 * fl, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.ellipse(x, y - 12, 0.8, 1.5 * fl, 0, 0, TAU); ctx.fill();
      }
    });
  });
}

// ---------- Papel picado (pared) ----------
function fiesta_papel(ctx, { c }) {
  const cols = [c, ...PARTY.filter((p) => p !== c)];
  const y0 = -62, n = 5, w = 64;
  const sag = (x) => y0 + Math.sin((x / w) * Math.PI) * 4;
  for (let i = 0; i < n; i++) {
    const fx = 3 + i * 12, fw = 10, fy = sag(fx + fw / 2), fh = 14, col = cols[i % cols.length];
    ctx.fillStyle = 'rgba(16,10,28,0.2)'; ctx.fillRect(fx + 1.5, fy + 2, fw, fh);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + fw, fy);
    for (let k = 0; k <= 5; k++) ctx.lineTo(fx + fw - (k * fw) / 5, fy + fh - (k % 2 ? 1.5 : 0));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 0.4; ctx.stroke();
    // recortes
    const hole = rgba(shade(col, -0.55), 0.55), cx = fx + fw / 2, cy = fy + fh / 2;
    ctx.fillStyle = hole;
    ctx.beginPath(); ctx.moveTo(cx, cy - 3); ctx.lineTo(cx + 2.4, cy); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 2.4, cy); ctx.closePath(); ctx.fill();
    for (const [dx, dy] of [[-3, -4], [3, -4], [-3, 4], [3, 4]]) dotc(ctx, cx + dx, cy + dy, 0.8, hole);
    for (let k = 0; k < 4; k++) fr(ctx, fx + 1.5 + k * 2.2, fy + 1.4, 1, 0.8, hole);
    fr(ctx, fx, fy, fw, 0.8, rgba('#ffffff', 0.35));
  }
  ctx.strokeStyle = '#efe7d6'; ctx.lineWidth = 0.7; ctx.beginPath();
  for (let x = 0; x <= w; x += 2) { if (x) ctx.lineTo(x, sag(x)); else ctx.moveTo(x, sag(x)); }
  ctx.stroke();
  dotc(ctx, 0.5, sag(0), 1, '#9aa0aa'); dotc(ctx, w - 0.5, sag(w), 1, '#9aa0aa');
}

export default {
  floor: { fiesta_soda, fiesta_icecream, fiesta_discoball, fiesta_dancefloor, fiesta_dj, fiesta_speaker, fiesta_balloons, fiesta_cake },
  wall: { fiesta_papel },
  period: {
    fiesta_soda: (st) => (st === 1 ? 160 : 0),
    fiesta_discoball: (st) => (st === 1 ? 120 : 0),
    fiesta_dancefloor: (st) => (st === 1 ? 350 : 0),
    fiesta_dj: (st) => (st === 1 ? 120 : 0),
    fiesta_speaker: (st) => (st === 1 ? 70 : 0),
    fiesta_cake: (st) => (st === 1 ? 150 : 0),
  },
  defaultColor: { fiesta_discoball: '#c9d0da', fiesta_dancefloor: '#2b2d38', fiesta_dj: BOOTH, fiesta_speaker: '#26262e' },
};
