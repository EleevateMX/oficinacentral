// Dibujo de la línea "Baño". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, rgba, rng, lum, pathPts } from '../iso.js';
import { rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const PORC = '#f6f5f2', CHROME = '#c9ced6', DCHROME = '#6f7682', GOLDF = '#e0b44a', TILE = '#bfe3ef', WATER = '#8fd3ef';
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
const tiles = (x, w, h, c = TILE, n = 6) => {
  fr(x, 0, 0, w, h, '#eef4f6');
  const sz = Math.max(4, w / n);
  for (let i = 0; i * sz < w; i++) for (let j = 0; j * sz < h; j++) fr(x, i * sz + 0.5, j * sz + 0.5, sz - 1, sz - 1, (i + j) % 5 === 2 ? shade(c, -0.08) : c);
  sheen(x, w, h, 0.18);
};
// Burbujas de espuma (en pantalla)
const foam = (ctx, x, y, t, spread = 14, n = 9) => {
  const r = rng(33);
  for (let i = 0; i < n; i++) {
    const bx = x + (r() - 0.5) * spread * 2, by = y + (r() - 0.5) * spread * 0.9, rad = 2 + r() * 2.6;
    const bob = Math.sin(t / 400 + i) * 0.6;
    dotc(ctx, bx, by + bob, rad + 0.6, rgba('#b8d4e0', 0.9));
    dotc(ctx, bx, by + bob, rad, '#ffffff');
    dotc(ctx, bx - rad * 0.35, by + bob - rad * 0.35, rad * 0.3, rgba('#cfefff', 0.9));
  }
};
// Chorro de agua animado entre dos puntos de pantalla
const stream = (ctx, x0, y0, x1, y1, t, wd = 1.6) => {
  ctx.fillStyle = rgba('#bfe9ff', 0.75); ctx.fillRect(x0 - wd / 2, y0, wd, y1 - y0);
  for (let i = 0; i < 3; i++) { const k = ((t / 300 + i / 3) % 1); dotc(ctx, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 0.7, '#ffffff'); }
};

// ---------- Piso ----------
function bano_tub(s, { c, st, t }) {
  const full = st === 1, inner = PORC, dark = lum(c) < 0.3;
  s.shadowRect(0.06, 0.08, 0.94, 1.92, 0.22);
  for (const [u, v] of [[0.2, 0.26], [0.8, 0.26], [0.2, 1.74], [0.8, 1.74]]) { s.box(u - 0.04, v - 0.04, 0, u + 0.04, v + 0.04, 0.1, GOLDF); s.ball(u, v, 0.12, 0.05, GOLDF); }
  const prof = [[0.06, 0.68], [0.94, 0.68], [0.9, 0.42], [0.76, 0.2], [0.24, 0.2], [0.1, 0.42]];
  const side = (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba('#ffffff', 0.22)); g.addColorStop(1, rgba('#000000', 0.12)); x.fillStyle = g; x.fillRect(0, 0, w, h); };
  s.prism('v', prof, 0.08, 1.92, c, { decal: { e1: side, e2: side, e3: side, e4: side, e5: side, front: (x, w, h) => sheen(x, w, h, 0.2), back: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.box(0.04, 0.06, 0.68, 0.96, 1.94, 0.73, dark ? '#e9e6df' : inner, {
    decal: {
      top: (x, w, h) => {
        rr(x, 3, 3, w - 6, h - 6, 8);
        const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#d7dde3'); g.addColorStop(1, '#ffffff');
        x.fillStyle = full ? WATER : g; x.fill();
        if (full) {
          x.save(); rr(x, 3, 3, w - 6, h - 6, 8); x.clip();
          x.strokeStyle = rgba('#ffffff', 0.45); x.lineWidth = 0.8;
          for (let i = 0; i < 4; i++) { const yy = 10 + i * ((h - 20) / 3) + Math.sin(t / 500 + i) * 1.5; x.beginPath(); x.moveTo(6, yy); x.quadraticCurveTo(w / 2, yy - 2, w - 6, yy); x.stroke(); }
          x.restore();
        } else dotc(x, w / 2, h * 0.2, 1.2, '#9aa0aa');
        x.strokeStyle = rgba('#000000', 0.15); x.lineWidth = 0.8; rr(x, 3, 3, w - 6, h - 6, 8); x.stroke();
      },
    },
  });
  // llave en la cabecera
  s.cyl('z', 0.5, 0.13, 0.03, 0.03, 0.73, 0.9, CHROME, { seg: 10 });
  s.box(0.47, 0.12, 0.86, 0.53, 0.26, 0.9, CHROME);
  for (const u of [0.38, 0.62]) s.cyl('z', u, 0.12, 0.03, 0.03, 0.73, 0.8, CHROME, { seg: 8, faces: { top: u < 0.5 ? '#e5452f' : '#3a86ff' } });
  if (full) s.over((ctx) => {
    const [x, y] = s.P(0.5, 1.15, 0.74);
    foam(ctx, x, y, t, 16, 10);
    const [x2, y2] = s.P(0.5, 0.55, 0.74);
    foam(ctx, x2, y2, t + 900, 10, 5);
    for (let i = 0; i < 3; i++) { const ph = ((t / 1600 + i / 3) % 1); const bx = x + (i - 1) * 9, by = y - 6 - ph * 22; ctx.strokeStyle = rgba('#ffffff', 0.85 * (1 - ph)); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, TAU); ctx.stroke(); }
  });
}

function bano_shower(s, { st, t }) {
  const on = st === 1;
  s.shadowRect(0.02, 0.02, 0.98, 0.98, 0.22);
  s.box(0.02, 0.02, 0, 0.98, 0.98, 0.1, PORC, { decal: { top: (x, w, h) => { fr(x, 2, 2, w - 4, h - 4, '#e3e8ec'); for (let i = 0; i < 5; i++) line(x, w * 0.4, h * 0.35 + i * 1.2, w * 0.6, h * 0.35 + i * 1.2, '#9aa0aa', 0.5); if (on) { x.fillStyle = rgba(WATER, 0.5); x.fillRect(3, 3, w - 6, h - 6); } sheen(x, w, h, 0.2); } } });
  // muros de azulejo (atrás e izquierda)
  s.box(0.02, 0.02, 0.1, 0.98, 0.08, 2.2, TILE, { decal: { front: (x, w, h) => tiles(x, w, h), back: (x, w, h) => tiles(x, w, h) } });
  s.box(0.02, 0.08, 0.1, 0.08, 0.98, 2.2, TILE, { decal: { right: (x, w, h) => tiles(x, w, h), left: (x, w, h) => tiles(x, w, h) } });
  // tubo, regadera y llaves
  s.box(0.48, 0.08, 1.0, 0.52, 0.11, 1.95, CHROME);
  s.prism('v', [[0.48, 1.92], [0.52, 1.92], [0.52, 1.96], [0.48, 1.96]], 0.08, 0.4, CHROME);
  s.cyl('z', 0.5, 0.42, 0.11, 0.06, 1.82, 1.92, CHROME, { seg: 16, faces: { bottom: DCHROME } });
  s.cyl('v', 0.5, 1.2, 0.06, 0.06, 0.08, 0.12, CHROME, { seg: 12, decal: { front: (x, w, h) => { dotc(x, w / 2, h / 2, w * 0.22, on ? '#3a86ff' : DCHROME); } } });
  // botellas en repisa
  s.box(0.08, 0.08, 0.95, 0.3, 0.3, 0.98, PORC);
  s.box(0.12, 0.12, 0.98, 0.18, 0.18, 1.14, '#FE3377');
  s.box(0.2, 0.14, 0.98, 0.26, 0.2, 1.1, '#2fb67c');
  if (on) s.custom([0.3, 0.3, 0.1, 0.7, 0.62, 1.82], (ctx) => {
    const [hx, hy] = s.P(0.5, 0.42, 1.82), [, by] = s.P(0.5, 0.42, 0.1);
    ctx.save();
    const g = ctx.createLinearGradient(0, hy, 0, by); g.addColorStop(0, rgba('#4fb8ee', 0.6)); g.addColorStop(1, rgba('#4fb8ee', 0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx - 4, hy); ctx.lineTo(hx + 4, hy); ctx.lineTo(hx + 11, by); ctx.lineTo(hx - 11, by); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 9; i++) {
      const off = ((t / 90 + i * 1.7) % 6) / 6, xx = -4 + i;
      const x0 = hx + xx, x1 = hx + xx * 2.6, yy0 = hy + (by - hy) * off, yy1 = Math.min(by, yy0 + 9);
      const k1 = Math.min(1, off + 0.16);
      ctx.strokeStyle = rgba('#3a9fd8', 0.75); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * off, yy0); ctx.lineTo(x0 + (x1 - x0) * k1, yy1); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.95); ctx.lineWidth = 0.5; ctx.stroke();
    }
    for (let i = 0; i < 4; i++) { const ph = ((t / 500 + i / 4) % 1); dotc(ctx, hx - 10 + i * 6.5, by - 2 - ph * 5, 0.8, rgba('#ffffff', 1 - ph)); }
    ctx.restore();
  });
  // mampara de vidrio (frente y derecha)
  const pane = (pts, ctx) => {
    const sp = pts.map((p) => s.P(p[0], p[1], p[2]));
    ctx.fillStyle = rgba('#cfeefa', on ? 0.32 : 0.22); pathPts(ctx, sp); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.85); ctx.lineWidth = 0.9; ctx.stroke();
    // reflejo diagonal
    const a = sp[0], b = sp[1], c = sp[2], d = sp[3];
    const L = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    const p1 = L(a, b, 0.2), p2 = L(a, b, 0.32), p3 = L(d, c, 0.62), p4 = L(d, c, 0.5);
    ctx.fillStyle = rgba('#ffffff', 0.28); pathPts(ctx, [p1, p2, p3, p4]); ctx.fill();
    if (on) { ctx.fillStyle = rgba('#ffffff', 0.14); pathPts(ctx, sp); ctx.fill(); }
  };
  s.custom([0.06, 0.95, 0.1, 0.98, 0.98, 2.1], (ctx) => pane([[0.08, 0.97, 0.1], [0.97, 0.97, 0.1], [0.97, 0.97, 2.08], [0.08, 0.97, 2.08]], ctx));
  s.custom([0.95, 0.06, 0.1, 0.98, 0.95, 2.1], (ctx) => pane([[0.97, 0.08, 0.1], [0.97, 0.97, 0.1], [0.97, 0.97, 2.08], [0.97, 0.08, 2.08]], ctx));
  s.box(0.06, 0.95, 2.08, 0.99, 0.99, 2.12, CHROME, { outline: DCHROME });
  s.box(0.95, 0.06, 2.08, 0.99, 0.95, 2.12, CHROME, { outline: DCHROME });
  s.box(0.95, 0.95, 0.1, 0.99, 0.99, 2.08, CHROME, { outline: DCHROME });
}

function bano_sink(s, { st, t }) {
  const on = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.32, 0.3, 0.22);
  s.cyl('z', 0.5, 0.45, 0.13, 0.09, 0, 0.66, PORC, { seg: 18 });
  s.cyl('z', 0.5, 0.5, 0.2, 0.34, 0.62, 0.84, PORC, {
    seg: 24,
    decal: {
      top: (x, w, h) => {
        const cx = w / 2, cy = h / 2 + 1, R = w * 0.38;
        const g = x.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, R);
        g.addColorStop(0, on ? '#cfeefa' : '#ffffff'); g.addColorStop(1, '#c9d2da');
        x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, R, R * 0.85, 0, 0, TAU); x.fill();
        if (on) for (let i = 0; i < 2; i++) { const ph = ((t / 700 + i / 2) % 1); x.strokeStyle = rgba('#ffffff', 0.8 * (1 - ph)); x.lineWidth = 0.7; x.beginPath(); x.arc(cx, cy, 1.5 + ph * R * 0.7, 0, TAU); x.stroke(); }
        dotc(x, cx, cy, 1.2, '#8a9099');
        x.strokeStyle = rgba('#000000', 0.12); x.lineWidth = 0.7; x.beginPath(); x.ellipse(cx, cy, R, R * 0.85, 0, 0, TAU); x.stroke();
      },
    },
  });
  // llave
  s.cyl('z', 0.5, 0.2, 0.035, 0.035, 0.8, 0.98, CHROME, { seg: 10 });
  s.prism('v', [[0.475, 0.95], [0.525, 0.95], [0.525, 0.99], [0.475, 0.99]], 0.18, 0.36, CHROME);
  for (const u of [0.36, 0.64]) s.cyl('z', u, 0.22, 0.028, 0.028, 0.8, 0.88, CHROME, { seg: 8, faces: { top: u < 0.5 ? '#e5452f' : '#3a86ff' } });
  // espejo
  s.box(0.18, 0.02, 1.1, 0.82, 0.07, 1.96, '#ffffff', {
    decal: {
      front: (x, w, h) => {
        rr(x, 0.5, 0.5, w - 1, h - 1, 4); x.fillStyle = '#f2efe8'; x.fill();
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#e8f6fb'); g.addColorStop(0.5, '#a9cfe0'); g.addColorStop(1, '#7fa9bf');
        rr(x, 2.5, 2.5, w - 5, h - 5, 3); x.fillStyle = g; x.fill();
        x.fillStyle = rgba('#ffffff', 0.55); x.beginPath(); x.moveTo(w * 0.25, 3); x.lineTo(w * 0.42, 3); x.lineTo(w * 0.18, h - 3); x.lineTo(w * 0.05, h - 3); x.closePath(); x.fill();
        x.fillStyle = rgba('#ffffff', 0.3); x.fillRect(w * 0.5, 3, 2, h - 6);
      },
    },
  });
  s.box(0.46, 0.02, 0.84, 0.54, 0.05, 1.1, CHROME);
  if (on) s.custom([0.47, 0.34, 0.8, 0.53, 0.4, 0.98], (ctx) => {
    const [x0, y0] = s.P(0.5, 0.36, 0.95), [, y1] = s.P(0.5, 0.36, 0.78);
    stream(ctx, x0, y0, x0, y1, t);
  });
}

function bano_toilet(s, { c }) {
  const seat = c === PORC ? '#e9e6df' : c;
  s.shadowEllipse(0.5, 0.48, 0.32, 0.38, 0.22);
  s.cyl('z', 0.5, 0.56, 0.15, 0.22, 0, 0.4, c, { seg: 20 });
  s.cyl('z', 0.5, 0.56, 0.25, 0.25, 0.4, 0.45, seat, {
    seg: 22,
    decal: { top: (x, w, h) => { const cx = w / 2, cy = h / 2; x.fillStyle = '#7fb8d0'; x.beginPath(); x.ellipse(cx, cy + 0.5, w * 0.28, h * 0.32, 0, 0, TAU); x.fill(); x.strokeStyle = rgba('#000', 0.25); x.lineWidth = 0.8; x.stroke(); x.fillStyle = rgba('#ffffff', 0.4); x.fillRect(cx - 3, cy - 3, 2, 1); } },
  });
  // tapa levantada
  s.box(0.27, 0.3, 0.45, 0.73, 0.35, 0.92, seat, { decal: { front: (x, w, h) => { rr(x, 2, 2, w - 4, h - 4, 4); x.strokeStyle = rgba('#000', 0.15); x.lineWidth = 0.7; x.stroke(); sheen(x, w, h, 0.2); } } });
  // tanque
  s.box(0.2, 0.08, 0.44, 0.8, 0.3, 0.96, c, { decal: { front: (x, w, h) => { sheen(x, w, h, 0.18); }, right: (x, w, h) => sheen(x, w, h, 0.18) } });
  s.box(0.18, 0.06, 0.96, 0.82, 0.32, 1.02, c, { decal: { top: (x, w, h) => { dotc(x, w / 2, h / 2, 2.2, CHROME); dotc(x, w / 2, h / 2, 1.2, DCHROME); sheen(x, w, h, 0.2); } } });
  s.box(0.24, 0.3, 0.86, 0.34, 0.33, 0.89, CHROME);
  // rollo de papel
  s.cyl('z', 0.66, 0.19, 0.075, 0.075, 1.02, 1.15, '#ffffff', { seg: 14, faces: { top: '#ececec' }, decal: { top: (x, w, h) => dotc(x, w / 2, h / 2, w * 0.14, '#b5a58a') } });
}

function bano_towel(s, { c }) {
  s.shadowRect(0.08, 0.36, 0.92, 0.64, 0.2);
  for (const u of [0.1, 0.9]) { s.box(u - 0.04, 0.3, 0, u + 0.04, 0.7, 0.04, CHROME); s.cyl('z', u, 0.5, 0.025, 0.025, 0.04, 1.36, CHROME, { seg: 8 }); s.ball(u, 0.5, 1.38, 0.04, CHROME); }
  s.cyl('u', 0.5, 1.3, 0.02, 0.02, 0.1, 0.9, CHROME, { seg: 8 });
  s.cyl('u', 0.5, 0.7, 0.018, 0.018, 0.1, 0.9, CHROME, { seg: 8 });
  const stripes = (x, w, h) => { fr(x, 0, h - 5, w, 1.6, '#ffffff'); fr(x, 0, h - 2.6, w, 0.8, '#ffffff'); x.fillStyle = rgba('#000000', 0.08); for (let i = 0; i < w; i += 1.6) x.fillRect(i, 0, 0.6, h); sheen(x, w, h, 0.12); };
  // toalla grande colgada
  s.box(0.18, 0.47, 0.78, 0.82, 0.53, 1.32, c, { decal: { front: stripes, back: stripes } });
  s.box(0.18, 0.46, 1.3, 0.82, 0.54, 1.34, shade(c, 0.1));
  // toalla de mano en la barra baja
  const c2 = shade(c, 0.45);
  s.box(0.3, 0.48, 0.42, 0.7, 0.52, 0.72, c2, { decal: { front: (x, w, h) => { fr(x, 0, h - 3, w, 1, c); sheen(x, w, h, 0.12); } } });
  // toallas dobladas en la base
  s.box(0.22, 0.32, 0.04, 0.78, 0.68, 0.14, c, { decal: { front: (x, w, h) => { fr(x, 0, h / 2, w, 0.6, rgba('#000', 0.2)); sheen(x, w, h, 0.15); } } });
  s.box(0.26, 0.35, 0.14, 0.74, 0.65, 0.24, c2, { decal: { front: (x, w, h) => fr(x, 0, h / 2, w, 0.6, rgba('#000', 0.18)) } });
}

function bano_mat(s, { c }) {
  const clear = 'rgba(0,0,0,0)';
  s.box(0.06, 0.06, 0, 0.94, 0.94, 0.03, clear, {
    flat: true, outline: false, edges: false,
    decal: {
      top: (x, w, h) => {
        rr(x, 1.5, 3, w - 3, h - 4.5, 7); x.fillStyle = shade(c, -0.4); x.fill();
        rr(x, 1, 1.5, w - 3, h - 4.5, 7); x.fillStyle = c; x.fill();
        x.save(); rr(x, 1, 1.5, w - 3, h - 4.5, 7); x.clip();
        const r = rng(4);
        for (let i = 0; i < 260; i++) { const px = r() * w, py = r() * h; x.fillStyle = rgba(r() < 0.5 ? '#ffffff' : '#000000', 0.12); x.fillRect(px, py, 0.8, 0.8); }
        x.strokeStyle = rgba('#ffffff', 0.6); x.lineWidth = 1;
        for (const [bx, by, br] of [[0.3, 0.32, 4], [0.62, 0.24, 2.5], [0.7, 0.62, 5], [0.36, 0.72, 3], [0.18, 0.55, 2]]) { x.beginPath(); x.arc(w * bx, h * by, br, 0, TAU); x.stroke(); dotc(x, w * bx - br * 0.4, h * by - br * 0.4, br * 0.25, rgba('#ffffff', 0.7)); }
        x.restore();
        x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 0.8; rr(x, 3.5, 4, w - 8, h - 9.5, 5); x.stroke();
      },
    },
  });
}

function bano_tile(s, { c }) {
  s.box(0.01, 0.01, 0, 0.99, 0.99, 0.02, c, {
    outline: shade(c, -0.45),
    decal: {
      top: (x, w, h) => {
        fr(x, 0, 0, w, h, lum(c) < 0.3 ? '#55586a' : '#ffffff');
        const n = 3, sz = w / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) fr(x, i * sz + 0.6, j * (h / n) + 0.6, sz - 1.2, h / n - 1.2, (i + j) % 2 ? c : shade(c, lum(c) < 0.3 ? 0.12 : -0.06));
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, rgba('#ffffff', 0.3)); g.addColorStop(0.45, rgba('#ffffff', 0.04)); g.addColorStop(1, rgba('#000000', 0.06));
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      },
    },
  });
}

// ---------- Pared ----------
function bano_mirror(ctx) {
  const cx = 16, cy = -44, r = 13;
  dotc(ctx, cx + 1.5, cy + 2, r + 2, 'rgba(16,10,28,0.26)');
  dotc(ctx, cx, cy, r + 2, '#a8833a'); dotc(ctx, cx, cy, r + 1.2, GOLDF);
  ctx.strokeStyle = rgba('#fff6d0', 0.8); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(cx, cy, r + 1.4, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, '#eaf7fc'); g.addColorStop(0.55, '#a9cfe0'); g.addColorStop(1, '#7299ae');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  ctx.fillStyle = rgba('#ffffff', 0.55); ctx.beginPath(); ctx.moveTo(cx - 8, cy - 14); ctx.lineTo(cx - 3, cy - 14); ctx.lineTo(cx - 13, cy + 8); ctx.lineTo(cx - 17, cy + 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.3); ctx.fillRect(cx + 1, cy - 14, 1.6, 28);
  ctx.restore();
  // estrellita de brillo
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const rr2 = k % 2 ? 0.6 : 2.2, a = (k / 8) * TAU; ctx.lineTo(cx + 7 + rr2 * Math.cos(a), cy - 7 + rr2 * Math.sin(a)); } ctx.closePath(); ctx.fill();
  // colgador
  ctx.strokeStyle = '#7a5a20'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(cx - 5, cy - r - 1); ctx.lineTo(cx, cy - r - 6); ctx.lineTo(cx + 5, cy - r - 1); ctx.stroke();
}

function bano_cabinet(ctx) {
  const x = 4, y = -62, w = 24, h = 30;
  ctx.fillStyle = 'rgba(16,10,28,0.26)'; ctx.fillRect(x + 1.5, y + 2, w, h);
  fr(ctx, x, y, w, h, PORC); fr(ctx, x, y, w, 1.2, '#ffffff'); fr(ctx, x + w - 1.2, y, 1.2, h, '#d9dbe0');
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#e8f6fb'); g.addColorStop(0.5, '#a9cfe0'); g.addColorStop(1, '#7fa9bf');
  ctx.fillStyle = g; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = rgba('#ffffff', 0.5); ctx.beginPath(); ctx.moveTo(x + 6, y + 2); ctx.lineTo(x + 10, y + 2); ctx.lineTo(x + 4, y + h - 2); ctx.lineTo(x + 2, y + h - 2); ctx.lineTo(x + 2, y + 12); ctx.closePath(); ctx.fill();
  fr(ctx, x + w - 4, y + h / 2 - 3, 1.2, 6, CHROME);
  ctx.strokeStyle = rgba('#5a6470', 0.6); ctx.lineWidth = 0.6; ctx.strokeRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6);
  // repisita con vaso y cepillos
  const sy = y + h + 6;
  fr(ctx, x + 2, sy, w - 4, 2, '#e9e6df'); fr(ctx, x + 2, sy + 2, w - 4, 0.8, '#b9bcc4');
  fr(ctx, x + 6, sy - 6, 5, 6, rgba('#bfe3ef', 0.9)); ctx.strokeStyle = rgba('#5a8aa0', 0.6); ctx.strokeRect(x + 6, sy - 6, 5, 6);
  line(ctx, x + 7.5, sy - 5, x + 6.5, sy - 11, '#FE3377', 1.2); line(ctx, x + 9.5, sy - 5, x + 10.5, sy - 10.5, '#3a86ff', 1.2);
  fr(ctx, x + 14, sy - 7, 3.5, 7, '#2fb67c'); fr(ctx, x + 14.6, sy - 9, 2.3, 2, '#ffffff');
  fr(ctx, x + 18.5, sy - 4, 3, 4, '#FFCC00');
}

export default {
  floor: { bano_tub, bano_shower, bano_sink, bano_toilet, bano_towel, bano_mat, bano_tile },
  wall: { bano_mirror, bano_cabinet },
  period: { bano_tub: (st) => (st === 1 ? 160 : 0), bano_shower: (st) => (st === 1 ? 90 : 0), bano_sink: (st) => (st === 1 ? 100 : 0) },
  defaultColor: { bano_shower: TILE, bano_sink: PORC, bano_mirror: GOLDF, bano_cabinet: PORC },
};
