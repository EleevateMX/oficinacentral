// Dibujo de la línea "Cristal". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, mix, rgba, outlineOf, pathPts } from '../iso.js';

const TAU = Math.PI * 2;
const METAL = '#cfd5dd';
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const floorGlow = (ctx, s, cu, cv, ru, color, a) => {
  const [x, y] = s.P(cu, cv, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); glow(ctx, 0, 0, ru * 45, color, a); ctx.restore();
};
// Destello de 4 puntas
function spark(ctx, x, y, r, a = 1) {
  ctx.fillStyle = rgba('#ffffff', a); ctx.beginPath();
  for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * 0.22 : r; const an = (k / 8) * TAU - Math.PI / 2; ctx.lineTo(x + rr * Math.cos(an), y + rr * Math.sin(an)); }
  ctx.closePath(); ctx.fill();
}

// Caja de vidrio: caras traseras tenues, delanteras con brillo y aristas claras.
function glassBox(s, u0, v0, z0, u1, v1, z1, c, o = {}) {
  s.custom([u0, v0, z0, u1, v1, z1], (ctx) => {
    const a = o.a ?? 1;
    const faces = [
      [[0, 0, 1], [[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]]],
      [[0, 0, -1], [[u0, v0, z0], [u1, v0, z0], [u1, v1, z0], [u0, v1, z0]]],
      [[0, 1, 0], [[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]]],
      [[0, -1, 0], [[u0, v0, z0], [u1, v0, z0], [u1, v0, z1], [u0, v0, z1]]],
      [[1, 0, 0], [[u1, v0, z0], [u1, v1, z0], [u1, v1, z1], [u1, v0, z1]]],
      [[-1, 0, 0], [[u0, v0, z0], [u0, v1, z0], [u0, v1, z1], [u0, v0, z1]]],
    ].map(([n, pts]) => ({ n, sp: pts.map((p) => s.P(p[0], p[1], p[2])), vis: s.faceVisible(n[0], n[1], n[2]), wn: s.wv(n[0], n[1], n[2]) }));
    for (const f of faces) if (!f.vis) {
      pathPts(ctx, f.sp); ctx.fillStyle = rgba(shade(c, -0.2), 0.14 * a); ctx.fill();
      ctx.strokeStyle = rgba(shade(c, -0.35), 0.4 * a); ctx.lineWidth = 0.6; ctx.stroke();
    }
    if (o.inner) o.inner(ctx);
    for (const f of faces) if (f.vis) {
      const top = f.wn[2] > 0.5, k = top ? 0.4 : f.wn[1] > 0.5 ? 0.1 : -0.18;
      pathPts(ctx, f.sp); ctx.fillStyle = rgba(shade(c, k), (top ? 0.46 : 0.32) * a); ctx.fill();
      if (!top && o.streak !== false) {
        ctx.save(); ctx.clip();
        const xs = f.sp.map((p) => p[0]), ys = f.sp.map((p) => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), W = x1 - x0;
        ctx.fillStyle = rgba('#ffffff', 0.38 * a);
        ctx.beginPath(); ctx.moveTo(x0 + W * 0.2, y1 + 4); ctx.lineTo(x0 + W * 0.36, y1 + 4); ctx.lineTo(x0 + W * 0.66, y0 - 4); ctx.lineTo(x0 + W * 0.5, y0 - 4); ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.22 * a);
        ctx.beginPath(); ctx.moveTo(x0 + W * 0.42, y1 + 4); ctx.lineTo(x0 + W * 0.47, y1 + 4); ctx.lineTo(x0 + W * 0.77, y0 - 4); ctx.lineTo(x0 + W * 0.72, y0 - 4); ctx.fill();
        ctx.restore();
      }
    }
    ctx.lineJoin = 'round';
    for (const f of faces) if (f.vis) { pathPts(ctx, f.sp); ctx.strokeStyle = rgba(outlineOf(c), 0.55 * a); ctx.lineWidth = 1.1; ctx.stroke(); }
    for (const f of faces) if (f.vis) { pathPts(ctx, f.sp); ctx.strokeStyle = rgba('#ffffff', 0.8 * a); ctx.lineWidth = 0.55; ctx.stroke(); }
  });
}

// ---------- Silla ----------
function cristal_silla(s, { c }) {
  s.shadowRect(0.18, 0.2, 0.84, 0.86, 0.14);
  for (const [u, v] of [[0.2, 0.26], [0.73, 0.26], [0.2, 0.77], [0.73, 0.77]]) glassBox(s, u, v, 0, u + 0.07, v + 0.07, 0.5, c);
  glassBox(s, 0.18, 0.24, 0.5, 0.82, 0.86, 0.6, c);
  glassBox(s, 0.18, 0.15, 0.5, 0.82, 0.24, 1.2, c);
}

// ---------- Banca ----------
function cristal_banca(s, { c }) {
  s.shadowRect(0.04, 0.2, 1.96, 0.82, 0.14);
  glassBox(s, 0.06, 0.22, 0, 0.2, 0.8, 0.44, c);
  glassBox(s, 1.8, 0.22, 0, 1.94, 0.8, 0.44, c);
  glassBox(s, 0.04, 0.2, 0.44, 1.96, 0.82, 0.52, c);
}

// ---------- Mesa ----------
function cristal_mesa(s, { c }) {
  s.shadowRect(0.06, 0.08, 1.94, 0.92, 0.14);
  for (const u of [0.16, 1.84]) for (const v of [0.18, 0.82]) s.cyl('z', u, v, 0.035, 0.035, 0, 0.72, METAL, { seg: 10 });
  s.box(0.14, 0.16, 0.66, 1.86, 0.2, 0.7, METAL);
  s.box(0.14, 0.8, 0.66, 1.86, 0.84, 0.7, METAL);
  glassBox(s, 0.02, 0.04, 0.72, 1.98, 0.96, 0.8, c);
  s.over((ctx) => { const [x, y] = s.P(0.5, 0.3, 0.8); spark(ctx, x, y - 1, 3.4, 0.9); });
}

// ---------- Bloque ----------
function cristal_cubo(s, { c }) {
  s.shadowRect(0.04, 0.04, 0.96, 0.96, 0.12);
  glassBox(s, 0.04, 0.04, 0, 0.96, 0.96, 0.88, c, {
    inner: (ctx) => {
      const [x, y] = s.P(0.5, 0.5, 0.44);
      glow(ctx, x, y, 18, c, 0.45);
      ctx.fillStyle = rgba(shade(c, 0.5), 0.8);
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = 0.6; ctx.stroke();
    },
  });
  s.over((ctx) => { const [x, y] = s.P(0.2, 0.96, 0.8); spark(ctx, x + 2, y, 3, 0.9); });
}

// ---------- Piso ----------
function cristal_piso(s, { c }) {
  glassBox(s, 0.01, 0.01, 0, 0.99, 0.99, 0.025, c, { streak: false });
  s.over((ctx) => {
    const p = (u, v) => s.P(u, v, 0.025);
    ctx.save(); pathPts(ctx, [p(0.01, 0.01), p(0.99, 0.01), p(0.99, 0.99), p(0.01, 0.99)]); ctx.clip();
    ctx.strokeStyle = rgba('#ffffff', 0.45); ctx.lineWidth = 2.2;
    for (const k of [0.3, 0.5]) { const a = p(k, 0), b = p(0, k); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.lineWidth = 1; }
    const q = p(0.5, 0.5); ctx.strokeStyle = rgba(shade(c, -0.3), 0.3); ctx.lineWidth = 0.6;
    pathPts(ctx, [p(0.12, 0.12), p(0.88, 0.12), p(0.88, 0.88), p(0.12, 0.88)]); ctx.stroke();
    spark(ctx, q[0] + 10, q[1] + 2, 2.6, 0.8);
    ctx.restore();
  });
}

// ---------- Lámpara ----------
function cristal_lampara(s, { c, st }) {
  const on = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.22, 0.22, 0.2);
  if (on) s.under((ctx) => { floorGlow(ctx, s, 0.5, 0.5, 1.3, c, 0.3); floorGlow(ctx, s, 0.5, 0.5, 0.6, '#ffffff', 0.25); });
  s.cyl('z', 0.5, 0.5, 0.2, 0.17, 0, 0.06, METAL, { seg: 22 });
  glassBox(s, 0.45, 0.45, 0.06, 0.55, 0.55, 1.02, c, { streak: false });
  s.cyl('z', 0.5, 0.5, 0.07, 0.05, 1.0, 1.06, METAL, { seg: 12 });
  s.custom([0.22, 0.22, 1.06, 0.78, 0.78, 1.8], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 1.4);
    if (on) { glow(ctx, x, y, 46, c, 0.42); glow(ctx, x, y, 18, '#ffffff', 0.6); }
    const T = [x, y - 22], B = [x, y + 17], L = [x - 14, y - 4], R = [x + 14, y - 4], M = [x + 3, y - 1], N = [x - 4, y - 8];
    const tri = (pts, col, a) => { pathPts(ctx, pts); ctx.fillStyle = rgba(col, a); ctx.fill(); };
    const al = on ? 0.9 : 0.62;
    tri([T, L, N], shade(c, 0.55), al); tri([T, N, R], shade(c, 0.3), al);
    tri([N, L, M], shade(c, 0.15), al); tri([N, M, R], shade(c, -0.05), al);
    tri([L, B, M], shade(c, -0.05), al); tri([M, B, R], shade(c, -0.3), al);
    ctx.lineJoin = 'round';
    pathPts(ctx, [T, R, B, L]); ctx.strokeStyle = rgba(outlineOf(c), 0.75); ctx.lineWidth = 1.1; ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(N[0], N[1]); ctx.lineTo(M[0], M[1]); ctx.lineTo(B[0], B[1]); ctx.moveTo(L[0], L[1]); ctx.lineTo(N[0], N[1]); ctx.moveTo(M[0], M[1]); ctx.lineTo(R[0], R[1]); ctx.stroke();
    if (on) { spark(ctx, x - 6, y - 13, 4.5, 0.95); spark(ctx, x + 9, y + 4, 2.6, 0.85); }
  });
}

// ---------- Geoda ----------
function cristal_geoda(s, { c, st, t }) {
  const on = st === 1;
  s.shadowEllipse(0.5, 0.52, 0.38, 0.32, 0.24);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.55, 0.9, c, 0.3));
  s.custom([0.12, 0.15, 0, 0.88, 0.85, 1.1], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0);
    const rock = '#5d5566', ol = '#2a2430';
    // cristales que asoman por detrás
    for (const [dx, h, w2, k] of [[-10, 40, 4, 0.2], [-3, 46, 4.5, 0.4], [6, 38, 4, 0]]) {
      ctx.beginPath(); ctx.moveTo(x + dx - w2, y - 20); ctx.lineTo(x + dx, y - h); ctx.lineTo(x + dx + w2, y - 20); ctx.closePath();
      ctx.fillStyle = shade(c, k); ctx.fill(); ctx.strokeStyle = outlineOf(c); ctx.lineWidth = 0.9; ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.45); ctx.beginPath(); ctx.moveTo(x + dx - w2 * 0.5, y - 22); ctx.lineTo(x + dx, y - h + 2); ctx.lineTo(x + dx - 0.4, y - 22); ctx.fill();
    }
    // concha de roca
    const shell = () => {
      ctx.beginPath(); ctx.moveTo(x - 22, y - 2);
      ctx.quadraticCurveTo(x - 27, y - 22, x - 12, y - 30); ctx.quadraticCurveTo(x, y - 36, x + 13, y - 29);
      ctx.quadraticCurveTo(x + 27, y - 20, x + 22, y - 2); ctx.quadraticCurveTo(x, y + 7, x - 22, y - 2); ctx.closePath();
    };
    shell(); const g = ctx.createLinearGradient(x - 24, y - 30, x + 24, y);
    g.addColorStop(0, '#7a7184'); g.addColorStop(1, rock); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.stroke();
    for (const [dx, dy] of [[-15, -8], [14, -12], [-6, -1], [16, -4]]) dotc(ctx, x + dx, y + dy, 1, rgba('#2a2430', 0.4));
    // banda de ágata y cavidad
    ctx.beginPath(); ctx.ellipse(x, y - 15, 16, 13, 0, 0, TAU); ctx.fillStyle = '#e9e1d4'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - 15, 14, 11.2, 0, 0, TAU); ctx.fillStyle = shade(c, -0.25); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - 15, 12.4, 9.8, 0, 0, TAU); ctx.fillStyle = shade(c, -0.6); ctx.fill();
    ctx.save(); ctx.clip();
    if (on) glow(ctx, x, y - 15, 16, mix(c, '#ffffff', 0.4), 0.8);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU, r0 = 12.5, r1 = 4 + (k % 3) * 1.6;
      const bx = x + Math.cos(a) * r0, by = y - 15 + Math.sin(a) * r0 * 0.8;
      const tx = x + Math.cos(a) * r1, ty = y - 15 + Math.sin(a) * r1 * 0.8;
      const nx = -Math.sin(a) * 2.6, ny = Math.cos(a) * 2.1;
      ctx.beginPath(); ctx.moveTo(bx + nx, by + ny); ctx.lineTo(tx, ty); ctx.lineTo(bx - nx, by - ny); ctx.closePath();
      ctx.fillStyle = shade(c, on ? 0.1 + (k % 3) * 0.15 : -0.2 + (k % 3) * 0.12); ctx.fill();
      ctx.strokeStyle = rgba(shade(c, -0.5), 0.6); ctx.lineWidth = 0.5; ctx.stroke();
    }
    ctx.restore();
    if (on) {
      for (let i = 0; i < 4; i++) {
        const ph = ((t / 700 + i * 0.29) % 1), a = Math.sin(ph * Math.PI);
        spark(ctx, x - 10 + ((i * 13) % 22), y - 34 + ((i * 7) % 20), 1.5 + a * 2.5, a * 0.95);
      }
    }
  });
}

// ---------- Espejo (pared) ----------
function cristal_espejo(ctx, { c }) {
  const x = 5, y = -58, w = 22, h = 46;
  const shape = (ox, oy, ww, hh) => {
    ctx.beginPath(); ctx.moveTo(ox, oy + hh); ctx.lineTo(ox, oy + ww / 2);
    ctx.arc(ox + ww / 2, oy + ww / 2, ww / 2, Math.PI, TAU); ctx.lineTo(ox + ww, oy + hh); ctx.closePath();
  };
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; shape(x + 1.5, y + 2, w, h); ctx.fill();
  shape(x - 1.5, y - 1.5, w + 3, h + 3); ctx.fillStyle = rgba(shade(c, 0.3), 0.9); ctx.fill();
  ctx.strokeStyle = rgba(outlineOf(c), 0.7); ctx.lineWidth = 0.8; ctx.stroke();
  shape(x, y, w, h);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, mix(c, '#ffffff', 0.75)); g.addColorStop(0.5, mix(c, '#cfe3f0', 0.55)); g.addColorStop(1, mix(c, '#7f97b0', 0.5));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = rgba('#ffffff', 0.55);
  ctx.beginPath(); ctx.moveTo(x + 2, y + 24); ctx.lineTo(x + 8, y + 24); ctx.lineTo(x + 22, y + 6); ctx.lineTo(x + 16, y + 6); ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.35);
  ctx.beginPath(); ctx.moveTo(x + 4, y + 36); ctx.lineTo(x + 6, y + 36); ctx.lineTo(x + 22, y + 16); ctx.lineTo(x + 20, y + 16); ctx.fill();
  ctx.restore();
  shape(x + 1.5, y + 1.5, w - 3, h - 3); ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 0.6; ctx.stroke();
  spark(ctx, x + w - 4, y + 9, 3.4, 0.95); spark(ctx, x + 5, y + h - 6, 2.2, 0.8);
}

export default {
  floor: { cristal_silla, cristal_banca, cristal_mesa, cristal_cubo, cristal_piso, cristal_lampara, cristal_geoda },
  wall: { cristal_espejo },
  period: { cristal_geoda: (st) => (st === 1 ? 120 : 0) },
  defaultColor: {},
};
