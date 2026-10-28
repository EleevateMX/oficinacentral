// Dibujo de la línea "Vintage". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { PINK, shade, mix, rgba, outlineOf, lum } from '../iso.js';

const TAU = Math.PI * 2;
const CREAM = '#f3ead8', GOLD = '#d4a84a', WALNUT = '#6e4128', BRASS = '#d9b04f';
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const floorGlow = (ctx, s, cu, cv, ru, color, a) => {
  const [x, y] = s.P(cu, cv, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); glow(ctx, 0, 0, ru * 45, color, a); ctx.restore();
};
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
const goldFrame = (x, w, h, inset = 2) => { x.strokeStyle = rgba(GOLD, 0.9); x.lineWidth = 0.8; x.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
// Notas musicales que suben
function notes(ctx, x, y, t, cols) {
  for (let i = 0; i < 3; i++) {
    const ph = ((t / 1100 + i / 3) % 1);
    ctx.fillStyle = rgba(cols[i % cols.length], 1 - ph);
    const nx = x + i * 5 + Math.sin(ph * 6 + i) * 3, ny = y - 4 - ph * 20;
    ctx.beginPath(); ctx.ellipse(nx, ny, 1.9, 1.4, -0.4, 0, TAU); ctx.fill();
    ctx.fillRect(nx + 1.2, ny - 5.5, 0.8, 5.5);
    if (i === 1) ctx.fillRect(nx + 1.2, ny - 5.5, 3.5, 0.9);
  }
}
const ellipsePts = (cu, cz, ru, rz, n = 14, a0 = 0, a1 = TAU) => {
  const p = [];
  for (let k = 0; k < n; k++) { const a = a0 + ((a1 - a0) * k) / n; p.push([cu + ru * Math.cos(a), cz + rz * Math.sin(a)]); }
  return p;
};
const tufted = (c) => (x, w, h) => {
  const cols = Math.max(2, Math.round(w / 9)), rows = Math.max(1, Math.round(h / 9));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) dotc(x, ((i + 0.5 + (j % 2) * 0.5) * w) / (cols + 0.5), ((j + 0.5) * h) / rows, 0.7, rgba(shade(c, -0.5), 0.6));
  sheen(x, w, h, 0.14);
};

// Patas de madera curvas (cabriolé) con pie dorado
function legs(s, pts, z1, col) {
  for (const [u, v] of pts) {
    s.cyl('z', u, v, 0.03, 0.045, 0.03, z1, col, { seg: 8 });
    s.ball(u, v, 0.03, 0.035, GOLD);
  }
}

// ---------- Sillón ----------
function seat(s, c, W) {
  const fr0 = CREAM;
  s.shadowRect(0.06, 0.12, W - 0.06, 0.96, 0.22);
  legs(s, [[0.16, 0.22], [W - 0.16, 0.22], [0.16, 0.84], [W - 0.16, 0.84]], 0.36, fr0);
  s.box(0.1, 0.16, 0.34, W - 0.1, 0.9, 0.44, fr0, { decal: { front: (x, w, h) => { fr(x, 0, h - 1.2, w, 1.2, GOLD); x.strokeStyle = rgba(GOLD, 0.8); x.lineWidth = 0.7; x.beginPath(); x.moveTo(w * 0.4, 2); x.quadraticCurveTo(w / 2, h, w * 0.6, 2); x.stroke(); } } });
  s.box(0.14, 0.26, 0.44, W - 0.14, 0.9, 0.6, c, { decal: { top: (x, w, h) => { x.strokeStyle = rgba('#ffffff', 0.3); x.lineWidth = 0.8; x.strokeRect(2, 2, w - 4, h - 4); sheen(x, w, h, 0.16); }, front: (x, w, h) => sheen(x, w, h, 0.12) } });
  const back = W === 1
    ? ellipsePts(0.5, 1.0, 0.33, 0.34, 18)
    : [[0.12, 0.6], [W - 0.12, 0.6], [W - 0.12, 0.98], [W - 0.36, 1.2], [W / 2, 1.32], [0.36, 1.2], [0.12, 0.98]];
  s.prism('v', back, 0.15, 0.21, fr0, {
    decal: {
      front: (x, w, h) => {
        x.fillStyle = c;
        if (W === 1) { x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 3, h / 2 - 3, 0, 0, TAU); x.fill(); x.strokeStyle = GOLD; x.lineWidth = 1; x.stroke(); }
        else { x.beginPath(); x.moveTo(3, h - 1); x.lineTo(3, h * 0.35); x.quadraticCurveTo(w / 2, -h * 0.12, w - 3, h * 0.35); x.lineTo(w - 3, h - 1); x.closePath(); x.fill(); x.strokeStyle = GOLD; x.lineWidth = 1; x.stroke(); }
        x.save(); x.clip(); tufted(c)(x, w, h); x.restore();
        dotc(x, w / 2, 2.5, 1.6, GOLD);
      },
      back: (x, w, h) => sheen(x, w, h, 0.14),
    },
  });
  for (const u of [0.06, W - 0.16]) {
    s.box(u + 0.02, 0.78, 0.44, u + 0.08, 0.86, 0.82, fr0);
    s.box(u, 0.26, 0.76, u + 0.1, 0.86, 0.84, c, { decal: { top: (x, w, h) => sheen(x, w, h, 0.2) } });
    s.ball(u + 0.05, 0.87, 0.82, 0.045, GOLD);
  }
}
const vintage_sillon = (s, { c }) => seat(s, c, 1);
const vintage_canape = (s, { c }) => seat(s, c, 2);

// ---------- Mesita de té ----------
function vintage_mesita(s, { c }) {
  const dark = lum(c) < 0.5;
  s.shadowEllipse(0.5, 0.5, 0.4, 0.4, 0.2);
  legs(s, [[0.24, 0.5], [0.76, 0.5], [0.5, 0.24], [0.5, 0.76]], 0.64, c);
  s.cyl('z', 0.5, 0.5, 0.3, 0.3, 0.3, 0.33, shade(c, -0.1), { seg: 20 });
  s.cyl('z', 0.5, 0.5, 0.42, 0.44, 0.64, 0.72, c, {
    seg: 26,
    decal: {
      top: (x, w, h) => {
        if (dark) sheen(x, w, h, 0.2);
        const cx = w / 2, cy = h / 2, R = w * 0.3;
        x.fillStyle = rgba('#ffffff', 0.92); x.beginPath();
        for (let k = 0; k <= 24; k++) { const a = (k / 24) * TAU, r = R + (k % 2 ? 1.5 : 0); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        x.fill();
        x.strokeStyle = rgba('#c9b9a0', 0.8); x.lineWidth = 0.5; x.beginPath(); x.arc(cx, cy, R * 0.65, 0, TAU); x.stroke();
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; dotc(x, cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82, 0.7, '#c9b9a0'); }
      },
      side: undefined,
    },
    faces: { side: shade(c, -0.05) },
  });
}

// ---------- Cama con dosel ----------
function vintage_cama(s, { c }) {
  const W = 2, sheet = '#fbf7ee', post = CREAM;
  s.shadowRect(0.02, 0.02, 1.98, 1.98, 0.24);
  for (const [u, v] of [[0.08, 0.08], [1.92, 0.08], [0.08, 1.92], [1.92, 1.92]]) {
    s.cyl('z', u, v, 0.05, 0.04, 0, 2.3, post, { seg: 10 });
    s.ball(u, v, 2.34, 0.06, GOLD);
    s.ball(u, v, 0.5, 0.055, GOLD);
  }
  s.box(0.06, 0.12, 0.1, 1.94, 1.9, 0.32, post, { decal: { front: (x, w, h) => { goldFrame(x, w, h, 1.5); sheen(x, w, h, 0.12); } } });
  s.box(0.1, 0.14, 0.32, 1.9, 0.75, 0.48, sheet);
  const blanketTop = (x, w, h) => {
    fr(x, 0, 0, w, 6, sheet); fr(x, 0, 6, w, 0.8, rgba(shade(c, -0.5), 0.3));
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const cx = ((i + 0.5) * w) / 6, cy = 8 + ((j + 0.5) * (h - 8)) / 4; x.strokeStyle = rgba(shade(c, -0.35), 0.35); x.lineWidth = 0.6; x.beginPath(); x.moveTo(cx, cy - 3); x.lineTo(cx + 4, cy); x.lineTo(cx, cy + 3); x.lineTo(cx - 4, cy); x.closePath(); x.stroke(); }
    sheen(x, w, h, 0.12);
  };
  s.box(0.08, 0.75, 0.3, 1.92, 1.94, 0.56, c, { decal: { top: blanketTop, front: (x, w, h) => { for (let i = 0; i < w; i += 5) { x.fillStyle = shade(c, -0.2); x.beginPath(); x.arc(i + 2.5, h, 2.5, Math.PI, TAU); x.fill(); } } } });
  for (let i = 0; i < 2; i++) s.box(0.22 + i * 0.82, 0.2, 0.48, 0.96 + i * 0.82, 0.58, 0.64, '#ffffff', { k: 0.02 });
  // cabecera
  s.prism('v', [[0.12, 0.3], [1.88, 0.3], [1.88, 1.1], [1.5, 1.32], [1.0, 1.42], [0.5, 1.32], [0.12, 1.1]], 0.04, 0.12, post, {
    decal: { front: (x, w, h) => { x.fillStyle = c; x.beginPath(); x.moveTo(6, h - 2); x.lineTo(6, h * 0.36); x.quadraticCurveTo(w / 2, -h * 0.05, w - 6, h * 0.36); x.lineTo(w - 6, h - 2); x.closePath(); x.fill(); x.strokeStyle = GOLD; x.lineWidth = 1; x.stroke(); x.save(); x.clip(); tufted(c)(x, w, h); x.restore(); dotc(x, w / 2, 4, 2, GOLD); } },
  });
  // dosel: cenefas con ondas y cortinas recogidas atrás
  const valance = (x, w, h) => {
    fr(x, 0, 0, w, h * 0.45, shade(c, 0.08));
    x.fillStyle = shade(c, 0.08);
    for (let i = 0; i < w; i += 8) { x.beginPath(); x.arc(i + 4, h * 0.45, 4, 0, Math.PI); x.fill(); }
    fr(x, 0, 1.5, w, 1, GOLD);
    for (let i = 4; i < w; i += 8) dotc(x, i, h * 0.45 + 4.5, 0.9, GOLD);
  };
  const vo = { outline: false, decal: { front: valance, back: valance, left: valance, right: valance } };
  s.box(0.04, 0.04, 2.08, 1.96, 0.08, 2.3, c, vo);
  s.box(0.04, 1.92, 2.08, 1.96, 1.96, 2.3, c, vo);
  s.box(0.04, 0.08, 2.08, 0.08, 1.92, 2.3, c, vo);
  s.box(1.92, 0.08, 2.08, 1.96, 1.92, 2.3, c, vo);
  const drape = (x, w, h) => { for (let i = 1; i < 4; i++) line(x, (w * i) / 4, 0, (w * i) / 4 + (i - 2), h, rgba(i % 2 ? '#ffffff' : '#000000', 0.15), 0.7); fr(x, 0, h * 0.55, w, 2, GOLD); };
  for (const u of [0.13, 1.75]) s.box(u, 0.1, 0.62, u + 0.12, 0.18, 2.08, shade(c, -0.06), { decal: { front: drape, left: drape, right: drape } });
}

// ---------- Lámpara de flecos ----------
function vintage_lampara(s, { c, st }) {
  const on = st === 1, warm = '#ffe7b0';
  s.shadowEllipse(0.5, 0.5, 0.24, 0.24, 0.22);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.2, warm, 0.3));
  s.cyl('z', 0.5, 0.5, 0.2, 0.15, 0, 0.08, BRASS, { seg: 18 });
  s.cyl('z', 0.5, 0.5, 0.03, 0.03, 0.08, 1.24, BRASS, { seg: 8 });
  for (const z of [0.4, 0.8]) s.ball(0.5, 0.5, z, 0.055, BRASS);
  const shc = on ? mix(c, warm, 0.45) : c;
  s.cyl('z', 0.5, 0.5, 0.3, 0.17, 1.24, 1.62, shc, { seg: 22, k: on ? 0.08 : 0, faces: { top: shade(c, -0.25) } });
  s.custom([0.18, 0.18, 1.1, 0.82, 0.82, 1.26], (ctx) => {
    const [cx, cy] = s.P(0.5, 0.5, 1.24), rx = 0.3 * 45, ry = rx * 0.5;
    for (let k = 0; k <= 22; k++) {
      const a = (k / 22) * Math.PI, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      line(ctx, x, y, x, y + 4.5, k % 2 ? GOLD : shade(c, -0.25), 0.9);
      dotc(ctx, x, y + 4.8, 0.8, GOLD);
    }
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); ctx.stroke();
  });
  s.ball(0.5, 0.5, 1.66, 0.04, BRASS);
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 1.36); glow(ctx, x, y, 42, warm, 0.34); glow(ctx, x, y + 6, 14, '#ffffff', 0.4); });
}

// ---------- Piano antiguo ----------
function vintage_piano(s, { c, st, t }) {
  const on = st === 1, light = lum(c) > 0.6, trim = GOLD, keysDk = light ? '#2b2420' : '#141414';
  s.shadowRect(0.04, 0.08, 1.96, 0.96, 0.26);
  const panel = (x, w, h) => {
    for (const a of [0.08, 0.54]) { x.strokeStyle = rgba(trim, 0.75); x.lineWidth = 0.8; x.strokeRect(w * a, h * 0.14, w * 0.38, h * 0.72); x.strokeStyle = rgba(light ? '#000000' : '#ffffff', 0.12); x.strokeRect(w * a + 2, h * 0.14 + 2, w * 0.38 - 4, h * 0.72 - 4); }
    sheen(x, w, h, light ? 0.1 : 0.2);
  };
  s.box(0.06, 0.1, 0, 1.94, 0.58, 1.38, c, { decal: { front: panel, right: (x, w, h) => sheen(x, w, h, 0.15), left: (x, w, h) => sheen(x, w, h, 0.15), back: (x, w, h) => sheen(x, w, h, 0.12) } });
  s.box(0.02, 0.08, 1.38, 1.98, 0.62, 1.45, shade(c, 0.06), { decal: { top: (x, w, h) => sheen(x, w, h, 0.22) } });
  for (const u of [0.16, 1.84]) {
    s.cyl('z', u, 0.8, 0.035, 0.05, 0.0, 0.62, c, { seg: 8 });
    s.ball(u, 0.8, 0.02, 0.04, trim);
  }
  s.box(0.1, 0.58, 0.62, 1.9, 0.9, 0.7, c);
  s.box(0.16, 0.6, 0.7, 1.84, 0.88, 0.74, '#fbf8f0', {
    decal: {
      top: (x, w, h) => {
        const n = 26, kw = w / n;
        for (let i = 1; i < n; i++) line(x, i * kw, 0, i * kw, h, rgba('#000', 0.3), 0.5);
        for (let i = 0; i < n - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) fr(x, (i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.58, keysDk);
        if (on) { const k = Math.floor(t / 240) % n; fr(x, k * kw, h * 0.6, kw, h * 0.4, rgba(PINK, 0.5)); }
      },
    },
  });
  s.box(0.1, 0.58, 0.74, 1.9, 0.66, 0.92, c, { decal: { front: (x, w, h) => { fr(x, w / 2 - 6, h / 2 - 0.6, 12, 1.2, trim); } } });
  // atril con partitura
  s.box(0.7, 0.58, 0.92, 1.3, 0.6, 1.24, '#f6f0e0', { decal: { front: (x, w, h) => { for (let j = 0; j < 3; j++) { for (let i = 0; i < 5; i++) fr(x, 2, 2.5 + j * 3.6 + i * 0.6, w - 4, 0.3, '#8a7f6a'); for (let i = 0; i < 4; i++) dotc(x, 4 + i * ((w - 8) / 3), 3.5 + j * 3.6 + ((i * 3) % 4) * 0.5, 0.6, '#2b2420'); } } } });
  // candeleros
  for (const u of [0.12, 1.88]) {
    s.box(u - 0.06, 0.6, 0.98, u + 0.06, 0.66, 1.02, BRASS);
    s.cyl('z', u, 0.63, 0.025, 0.025, 1.02, 1.16, '#f6f0e0', { seg: 8 });
  }
  if (on) s.over((ctx) => { const [x, y] = s.P(1.0, 0.6, 1.5); notes(ctx, x - 6, y, t, [PINK, '#FFCC00', '#7fc8ff']); });
}

// ---------- Reloj de pie ----------
function vintage_reloj(s, { t }) {
  const wd = WALNUT;
  s.shadowRect(0.22, 0.28, 0.8, 0.74, 0.26);
  s.box(0.22, 0.28, 0, 0.78, 0.72, 0.5, wd, { decal: { front: (x, w, h) => { x.strokeStyle = rgba(GOLD, 0.7); x.lineWidth = 0.8; x.strokeRect(3, 3, w - 6, h - 6); sheen(x, w, h, 0.14); } } });
  const sw = Math.sin(((t % 2000) / 2000) * TAU) * 0.35;
  s.box(0.28, 0.32, 0.5, 0.72, 0.68, 1.72, wd, {
    decal: {
      front: (x, w, h) => {
        x.fillStyle = '#2a1a12'; x.beginPath(); x.moveTo(3, h - 3); x.lineTo(3, 6); x.quadraticCurveTo(w / 2, -1, w - 3, 6); x.lineTo(w - 3, h - 3); x.closePath(); x.fill();
        x.save(); x.clip();
        // pesas
        for (const [a, k] of [[0.3, 0.42], [0.7, 0.55]]) { line(x, w * a, 0, w * a, h * k, '#9a8a6a', 0.5); fr(x, w * a - 1.4, h * k, 2.8, 7, BRASS); }
        // péndulo
        const px = w / 2, py = 3, L = h * 0.72;
        const ex = px + Math.sin(sw) * L, ey = py + Math.cos(sw) * L;
        line(x, px, py, ex, ey, BRASS, 0.9);
        dotc(x, ex, ey, 3.6, BRASS); dotc(x, ex - 1, ey - 1, 1.6, '#fff1b8');
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, rgba('#ffffff', 0.22)); g.addColorStop(0.5, rgba('#ffffff', 0)); x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.restore();
        x.strokeStyle = GOLD; x.lineWidth = 0.8; x.beginPath(); x.moveTo(3, h - 3); x.lineTo(3, 6); x.quadraticCurveTo(w / 2, -1, w - 3, 6); x.lineTo(w - 3, h - 3); x.closePath(); x.stroke();
      },
      right: (x, w, h) => sheen(x, w, h, 0.12),
    },
  });
  s.box(0.24, 0.3, 1.72, 0.76, 0.7, 1.76, shade(wd, 0.1));
  s.box(0.24, 0.3, 1.76, 0.76, 0.7, 2.3, wd, {
    decal: {
      front: (x, w, h) => {
        const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;
        dotc(x, cx, cy, r + 1.4, GOLD); dotc(x, cx, cy, r, '#fbf6e8');
        for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; line(x, cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, '#2b2420', k % 3 ? 0.5 : 1); }
        const m = (t / 60000) % 1, hr = (t / 720000) % 1 + 0.25;
        x.lineCap = 'round';
        line(x, cx, cy, cx + Math.cos(hr * TAU - Math.PI / 2) * r * 0.45, cy + Math.sin(hr * TAU - Math.PI / 2) * r * 0.45, '#2b2420', 1.2);
        line(x, cx, cy, cx + Math.cos(m * TAU - Math.PI / 2) * r * 0.72, cy + Math.sin(m * TAU - Math.PI / 2) * r * 0.72, '#2b2420', 0.8);
        dotc(x, cx, cy, 0.9, GOLD);
      },
      right: (x, w, h) => sheen(x, w, h, 0.12),
    },
  });
  s.prism('v', [[0.22, 2.3], [0.78, 2.3], [0.78, 2.36], [0.5, 2.5], [0.22, 2.36]], 0.28, 0.72, shade(wd, 0.06), { decal: { front: (x, w, h) => dotc(x, w / 2, h * 0.55, 1.4, GOLD) } });
  for (const u of [0.26, 0.74]) s.ball(u, 0.7, 2.38, 0.045, GOLD);
}

// ---------- Gramófono ----------
function vintage_gramofono(s, { st, t }) {
  const on = st === 1, mirror = s.rot === 6;
  s.shadowRect(0.2, 0.26, 0.8, 0.8, 0.24);
  s.box(0.2, 0.28, 0, 0.8, 0.78, 0.4, WALNUT, {
    decal: {
      front: (x, w, h) => { x.strokeStyle = rgba(GOLD, 0.8); x.lineWidth = 0.8; x.strokeRect(2.5, 2.5, w - 5, h - 5); dotc(x, w / 2, h / 2, 1.4, GOLD); sheen(x, w, h, 0.16); },
      right: (x, w, h) => { fr(x, w / 2 - 1, h / 2 - 1, 2, 2, BRASS); line(x, w / 2, h / 2, w / 2 + 5, h / 2 - 3, BRASS, 1); sheen(x, w, h, 0.12); },
    },
  });
  s.cyl('z', 0.5, 0.53, 0.22, 0.22, 0.4, 0.43, '#141414', {
    seg: 22,
    decal: {
      top: (x, w, h) => {
        const cx = w / 2, cy = h / 2;
        x.strokeStyle = rgba('#ffffff', 0.12); x.lineWidth = 0.4;
        for (let r = w * 0.18; r < w * 0.48; r += 1.6) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke(); }
        dotc(x, cx, cy, w * 0.14, '#c0233a');
        const a = on ? (t / 300) % TAU : 0.4;
        x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, w * 0.34, a, a + 0.7); x.stroke();
        dotc(x, cx, cy, 0.8, BRASS);
      },
    },
  });
  // brazo y corneta (dibujo libre, espejado al girar)
  s.custom([0.2, 0.2, 0.43, 0.9, 0.8, 1.3], (ctx) => {
    const [bx, by] = s.P(0.5, 0.53, 0.43);
    ctx.save(); ctx.translate(bx, by); if (mirror) ctx.scale(-1, 1);
    line(ctx, 10, -2, 3, 1, BRASS, 1.4);
    dotc(ctx, 10, -2, 1.6, BRASS);
    ctx.lineCap = 'round';
    ctx.strokeStyle = shade(BRASS, -0.35); ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(10, -2); ctx.quadraticCurveTo(14, -12, 6, -20); ctx.stroke();
    ctx.strokeStyle = BRASS; ctx.lineWidth = 2; ctx.stroke();
    // corneta acampanada
    const g = ctx.createLinearGradient(-16, -40, 8, -18);
    g.addColorStop(0, '#fff1b8'); g.addColorStop(0.5, BRASS); g.addColorStop(1, shade(BRASS, -0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(4, -18); ctx.quadraticCurveTo(-2, -24, -16, -40); ctx.lineTo(-2, -44); ctx.quadraticCurveTo(2, -28, 8, -21); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = outlineOf(BRASS); ctx.lineWidth = 0.9; ctx.stroke();
    ctx.save(); ctx.translate(-9, -42); ctx.rotate(-0.28);
    ctx.fillStyle = shade(BRASS, -0.5); ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = BRASS; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = rgba('#fff1b8', 0.7); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 4, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.restore();
    for (const k of [0.35, 0.65]) { ctx.strokeStyle = rgba(shade(BRASS, -0.45), 0.5); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(4 - k * 18, -18 - k * 22); ctx.lineTo(8 - k * 10, -21 - k * 23); ctx.stroke(); }
    if (on) notes(ctx, -14, -46, t, [PINK, '#FFCC00', '#7fc8ff']);
    ctx.restore();
  });
}

// ---------- Retrato (pared) ----------
function vintage_retrato(ctx, { c }) {
  const cx = 16, cy = -36, rx = 11, ry = 15;
  ctx.fillStyle = 'rgba(16,10,28,0.28)'; ctx.beginPath(); ctx.ellipse(cx + 1.5, cy + 2, rx + 3, ry + 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 3, ry + 3, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = shade(GOLD, -0.5); ctx.lineWidth = 0.7; ctx.stroke();
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; dotc(ctx, cx + Math.cos(a) * (rx + 1.6), cy + Math.sin(a) * (ry + 1.6), 0.8, k % 2 ? '#fff1b8' : shade(GOLD, -0.3)); }
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry); g.addColorStop(0, shade(c, 0.35)); g.addColorStop(1, shade(c, -0.1));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // silueta de perfil (camafeo)
  ctx.fillStyle = '#2b2026';
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy + 16); ctx.quadraticCurveTo(cx - 8, cy + 6, cx - 2, cy + 5);
  ctx.lineTo(cx - 1, cy + 2); ctx.quadraticCurveTo(cx - 4, cy + 1, cx - 4, cy - 2); ctx.lineTo(cx - 5.5, cy - 3.5);
  ctx.lineTo(cx - 4, cy - 5); ctx.quadraticCurveTo(cx - 4.5, cy - 10, cx, cy - 11);
  ctx.quadraticCurveTo(cx + 7, cy - 12, cx + 7, cy - 4); ctx.quadraticCurveTo(cx + 9, cy - 1, cx + 6, cy + 2);
  ctx.quadraticCurveTo(cx + 4, cy + 4, cx + 4, cy + 6); ctx.quadraticCurveTo(cx + 10, cy + 8, cx + 11, cy + 16); ctx.closePath(); ctx.fill();
  dotc(ctx, cx + 5, cy - 10, 3, '#2b2026');
  ctx.strokeStyle = rgba('#ffffff', 0.3); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(cx, cy, rx - 1.5, ry - 1.5, 0, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(cx - 4, cy - ry - 3); ctx.quadraticCurveTo(cx, cy - ry - 9, cx + 4, cy - ry - 3); ctx.fill();
  dotc(ctx, cx, cy - ry - 6, 1.3, '#fff1b8');
}

export default {
  floor: { vintage_sillon, vintage_canape, vintage_mesita, vintage_cama, vintage_lampara, vintage_piano, vintage_reloj, vintage_gramofono },
  wall: { vintage_retrato },
  period: { vintage_piano: (st) => (st === 1 ? 120 : 0), vintage_reloj: () => 125, vintage_gramofono: (st) => (st === 1 ? 120 : 0) },
  defaultColor: { vintage_reloj: WALNUT, vintage_gramofono: WALNUT },
};
