// Dibujo de la línea "Hielo" (tonos beige, crema y hielo; formas suaves). Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, mix, rgba, rng, outlineOf } from '../iso.js';
import { rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const ASH = '#d8b98f', DASH = '#a9875e', GOLD = '#c9a24a', STONE = '#e6dccb';
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
// Tela suave (bouclé): puntitos claros y oscuros
const boucle = (c, seed = 1) => (x, w, h) => {
  const r = rng(seed);
  const n = Math.min(60, Math.round((w * h) / 14));
  for (let i = 0; i < n; i++) dotc(x, r() * w, r() * h, 0.5, rgba(r() < 0.6 ? '#ffffff' : shade(c, -0.4), 0.16));
  sheen(x, w, h, 0.1);
};
const seam = (c) => (x, w, h) => { x.strokeStyle = rgba(shade(c, -0.5), 0.25); x.lineWidth = 0.7; rr(x, 1.5, 1.5, w - 3, h - 3, 3); x.stroke(); boucle(c, 7)(x, w, h); };

// Sofá de formas redondas (sillón = 1 plaza)
function softSofa(s, c, W, o = {}) {
  const base = shade(c, -0.06);
  s.shadowRect(0.03, 0.08, W - 0.03, 0.98, 0.2);
  for (const u of [0.12, W - 0.18]) for (const v of [0.16, 0.84]) s.box(u, v, 0, u + 0.06, v + 0.06, 0.1, ASH);
  s.box(0.05, 0.12, 0.1, W - 0.05, 0.95, 0.36, base, { decal: { front: boucle(c, 3) } });
  const arm = o.arm || 0.24, a0 = 0.04 + arm, a1 = W - 0.04 - arm, n = o.n || W, cw = (a1 - a0) / n;
  for (let i = 0; i < n; i++) s.box(a0 + i * cw + 0.01, 0.38, 0.36, a0 + (i + 1) * cw - 0.01, 0.95, 0.55, c, { decal: { top: seam(c), front: boucle(c, 5 + i) } });
  s.prism('u', [[0.12, 0.36], [0.4, 0.36], [0.4, 0.86], [0.34, 0.96], [0.25, 0.99], [0.16, 0.95], [0.12, 0.86]], a0, a1, c, { decal: { e1: boucle(c, 9), e2: boucle(c, 11) } });
  const armP = (u0, u1) => { const p = [[u0, 0.36], [u1, 0.36], [u1, 0.62]]; for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; p.push([(u0 + u1) / 2 + ((u1 - u0) / 2) * Math.cos(a), 0.62 + 0.1 * Math.sin(a)]); } p.push([u0, 0.62]); return p; };
  s.prism('v', armP(0.04, 0.04 + arm), 0.12, 0.97, c, { decal: { front: boucle(c, 13), left: boucle(c, 14), right: boucle(c, 15) } });
  s.prism('v', armP(W - 0.04 - arm, W - 0.04), 0.12, 0.97, c, { decal: { front: boucle(c, 16), left: boucle(c, 17), right: boucle(c, 18) } });
  if (o.throw) {
    // manta tejida doblada sobre el respaldo
    const tc = o.throw;
    s.box(a1 - 0.62, 0.4, 0.55, a1 - 0.14, 0.58, 0.6, tc, { decal: { top: (x, w, h) => { for (let i = 2; i < w; i += 3) line(x, i, 0, i, h, rgba(shade(tc, -0.4), 0.35), 0.6); } } });
  }
  if (o.pillow) s.box(a0 + 0.08, 0.4, 0.55, a0 + 0.44, 0.5, 0.86, o.pillow, { decal: { front: (x, w, h) => { x.strokeStyle = rgba(shade(o.pillow, -0.45), 0.4); x.lineWidth = 0.7; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(2, h * (0.3 + i * 0.2)); x.lineTo(w - 2, h * (0.3 + i * 0.2)); x.stroke(); } sheen(x, w, h, 0.15); } } });
}

function hielo_armchair(s, { c }) { softSofa(s, c, 1, { arm: 0.2, n: 1 }); }
function hielo_sofa(s, { c }) { softSofa(s, c, 3, { pillow: c === '#cfe3ea' ? '#efe6d6' : '#cfe3ea', throw: mix(c, '#8e7a5e', 0.35) }); }

// ---------- Banca acolchada ----------
function hielo_bench(s, { c }) {
  const W = 2;
  s.shadowRect(0.04, 0.2, W - 0.04, 0.84, 0.2);
  for (const u of [0.1, W - 0.16]) for (const v of [0.24, 0.72]) s.box(u, v, 0, u + 0.06, v + 0.06, 0.32, ASH, { decal: { front: (x, w, h) => fr(x, 0, 0, w * 0.35, h, rgba('#ffffff', 0.25)) } });
  s.box(0.12, 0.28, 0.12, W - 0.12, 0.74, 0.15, DASH);
  s.box(0.06, 0.2, 0.32, W - 0.06, 0.82, 0.38, ASH, { decal: { front: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.box(0.08, 0.22, 0.38, W - 0.08, 0.8, 0.5, c, {
    decal: {
      top: (x, w, h) => { for (let i = 1; i < 6; i++) dotc(x, (w * i) / 6, h / 2, 1, rgba(shade(c, -0.5), 0.5)); seam(c)(x, w, h); },
      front: boucle(c, 21),
    },
  });
}

// ---------- Puf tejido ----------
function hielo_pouf(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.38, 0.38, 0.2);
  s.cyl('z', 0.5, 0.5, 0.34, 0.37, 0, 0.36, c, { seg: 26, faces: { side: c } });
  s.custom([0.12, 0.12, 0, 0.88, 0.88, 0.36], (ctx) => {
    // trenzas del tejido en la cara visible
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.08 + (i / (n - 1)) * Math.PI * 0.84;
      const p0 = s.P(0.5 + 0.345 * Math.cos(a), 0.5 + 0.345 * Math.sin(a), 0.03);
      const p1 = s.P(0.5 + 0.37 * Math.cos(a), 0.5 + 0.37 * Math.sin(a), 0.34);
      ctx.save(); ctx.translate(0, 0);
      for (let j = 0; j < 4; j++) {
        const t = (j + 0.5) / 4, x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t;
        ctx.fillStyle = rgba(shade(c, -0.4), 0.35); ctx.beginPath(); ctx.ellipse(x + 0.6, y, 1.6, 2.4, 0.35, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.35); ctx.beginPath(); ctx.ellipse(x - 0.6, y, 1.2, 2, -0.35, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  });
  s.cyl('z', 0.5, 0.5, 0.37, 0.35, 0.36, 0.42, c, {
    seg: 26,
    decal: { top: (x, w, h) => { const cx = w / 2, cy = h / 2; x.strokeStyle = rgba(shade(c, -0.4), 0.35); x.lineWidth = 0.8; for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * w * 0.44, cy + Math.sin(a) * h * 0.44); x.stroke(); } dotc(x, cx, cy, 2, shade(c, -0.2)); sheen(x, w, h, 0.14); } },
  });
}

// ---------- Mesa de travertino ----------
function hielo_table(s) {
  const W = 2, c = STONE;
  const pores = (seed) => (x, w, h) => { const r = rng(seed); x.strokeStyle = rgba('#a8957a', 0.35); x.lineWidth = 0.6; for (let i = 0; i < 5; i++) { const y = r() * h; x.beginPath(); x.moveTo(0, y); x.quadraticCurveTo(w / 2, y + (r() - 0.5) * 4, w, y + (r() - 0.5) * 3); x.stroke(); } for (let i = 0; i < 14; i++) fr(x, r() * w, r() * h, 1.2, 0.6, rgba('#a8957a', 0.4)); sheen(x, w, h, 0.16); };
  s.shadowRect(0.06, 0.1, W - 0.06, 0.92, 0.2);
  s.box(0.24, 0.2, 0, 0.6, 0.8, 0.36, shade(c, -0.04), { decal: { front: pores(1), right: pores(2), left: pores(3), back: pores(4) } });
  s.box(W - 0.6, 0.2, 0, W - 0.24, 0.8, 0.36, shade(c, -0.04), { decal: { front: pores(5), right: pores(6), left: pores(7), back: pores(8) } });
  s.box(0.04, 0.08, 0.36, W - 0.04, 0.92, 0.45, c, { decal: { top: pores(9), front: pores(10), right: pores(11) } });
}

// ---------- Lámpara de buró ----------
function hielo_lamp(s, { c, st }) {
  const on = st === 1, warm = '#fff1c2';
  s.shadowEllipse(0.5, 0.5, 0.2, 0.2, 0.22);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 0.75, warm, 0.3));
  s.cyl('z', 0.5, 0.5, 0.12, 0.13, 0, 0.04, shade(c, -0.15), { seg: 18 });
  s.ball(0.5, 0.5, 0.2, 0.17, c);
  s.cyl('z', 0.5, 0.5, 0.025, 0.025, 0.36, 0.5, GOLD, { seg: 8 });
  const shadeC = on ? '#fbf3df' : '#efe7d8';
  s.cyl('z', 0.5, 0.5, 0.25, 0.2, 0.48, 0.84, shadeC, { seg: 22, k: on ? 0.06 : 0, faces: { top: on ? '#fff8e4' : shade(shadeC, -0.3) }, decal: { top: (x, w, h) => { if (on) glow(x, w / 2, h / 2, w * 0.5, '#ffffff', 0.8); } } });
  s.custom([0.25, 0.25, 0.48, 0.75, 0.75, 0.84], (ctx) => {
    // textura de lino en la pantalla
    ctx.strokeStyle = rgba('#8e7a5e', 0.18); ctx.lineWidth = 0.5;
    const [x, y] = s.P(0.5, 0.5, 0.48), yt = s.P(0.5, 0.5, 0.84)[1];
    for (let i = -9; i <= 9; i += 2) { ctx.beginPath(); ctx.moveTo(x + i * 1.2, y + 4 - Math.abs(i) * 0.25); ctx.lineTo(x + i * 0.95, yt + 3 - Math.abs(i) * 0.2); ctx.stroke(); }
  });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 0.62); glow(ctx, x, y, 36, warm, 0.36); });
}

// ---------- Tapete peludo ----------
function hielo_rug(s, { c }) {
  s.cyl('z', 1, 1, 0.95, 0.95, 0, 0.03, c, {
    seg: 40, outline: shade(c, -0.4),
    decal: {
      top: (x, w, h) => {
        const r = rng(5), cx = w / 2, cy = h / 2, R = w / 2;
        x.save(); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
        for (let i = 0; i < 420; i++) {
          const a = r() * TAU, d = Math.sqrt(r()) * R, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
          x.strokeStyle = rgba(r() < 0.5 ? '#ffffff' : shade(c, -0.35), 0.35);
          x.lineWidth = 0.8; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py + 2 + r() * 1.5); x.stroke();
        }
        x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, R * 0.62, 0, TAU); x.stroke();
        x.restore();
      },
    },
  });
}

// ---------- Espejo de arco (pared) ----------
function hielo_mirror(ctx) {
  const x = 6, y = -62, w = 20, h = 52, r = w / 2;
  const arch = (ox, oy, ww, hh) => { const rr2 = ww / 2; ctx.beginPath(); ctx.moveTo(ox, oy + hh); ctx.lineTo(ox, oy + rr2); ctx.arc(ox + rr2, oy + rr2, rr2, Math.PI, TAU); ctx.lineTo(ox + ww, oy + hh); ctx.closePath(); };
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; arch(x + 1.5, y + 2, w, h); ctx.fill();
  ctx.fillStyle = GOLD; arch(x, y, w, h); ctx.fill();
  ctx.strokeStyle = outlineOf(GOLD); ctx.lineWidth = 0.8; ctx.stroke();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#f2f6f7'); g.addColorStop(0.5, '#cfdde2'); g.addColorStop(1, '#b7c8cf');
  ctx.fillStyle = g; arch(x + 1.6, y + 1.6, w - 3.2, h - 3.2); ctx.fill();
  ctx.save(); arch(x + 1.6, y + 1.6, w - 3.2, h - 3.2); ctx.clip();
  // reflejo del cuarto, muy tenue
  fr(ctx, x, y + h * 0.72, w, h * 0.3, rgba('#d9c7a7', 0.5));
  ctx.fillStyle = rgba('#ffffff', 0.5);
  ctx.beginPath(); ctx.moveTo(x + 3, y + h * 0.55); ctx.lineTo(x + 11, y + 6); ctx.lineTo(x + 14, y + 6); ctx.lineTo(x + 6, y + h * 0.55); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba('#fff3c4', 0.8); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x + r, y + r, r - 0.8, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
}

export default {
  floor: { hielo_armchair, hielo_sofa, hielo_bench, hielo_pouf, hielo_table, hielo_lamp, hielo_rug },
  wall: { hielo_mirror },
  period: {},
  defaultColor: { hielo_table: STONE, hielo_mirror: GOLD },
};
