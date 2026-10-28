// Dibujo de la línea "Urbana" (metal cromado, blanco y negro). Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { PINK, YELLOW, shade, mix, rgba, lum, outlineOf, pathPts } from '../iso.js';
import { rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const CHROME = '#c9ced6', DCHROME = '#7d838e', INKC = '#141414', SNOW = '#f4f4f6';
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
// Cuero acolchado: costuras finas + brillo
const leather = (c) => (x, w, h) => {
  const k = lum(c) > 0.6 ? '#000000' : '#ffffff';
  for (let i = 1; i < 3; i++) line(x, (w * i) / 3, 1.5, (w * i) / 3, h - 1.5, rgba(k, 0.12), 0.6);
  sheen(x, w, h, lum(c) > 0.6 ? 0.1 : 0.2);
};
const chromeBar = (x, w, h) => { fr(x, 0, 0, w, Math.max(0.6, h * 0.35), rgba('#ffffff', 0.55)); };

// ---------- Silla cantiléver ----------
function urbana_chair(s, { c }) {
  s.shadowRect(0.14, 0.12, 0.88, 0.92, 0.2);
  // patín de tubo cromado: rieles en el piso, subida al frente y postes del respaldo
  for (const u of [0.17, 0.79]) {
    s.box(u, 0.12, 0, u + 0.04, 0.88, 0.04, CHROME, { decal: { top: chromeBar } });
    s.box(u, 0.84, 0.04, u + 0.04, 0.88, 0.58, CHROME, { decal: { front: chromeBar } });
    s.box(u, 0.12, 0.04, u + 0.04, 0.16, 1.42, CHROME, { decal: { front: chromeBar } });
  }
  s.box(0.17, 0.16, 0.58, 0.83, 0.88, 0.62, DCHROME);
  s.box(0.16, 0.16, 0.62, 0.84, 0.9, 0.74, c, { decal: { top: leather(c), front: (x, w, h) => sheen(x, w, h, 0.12) } });
  s.box(0.17, 0.16, 0.74, 0.83, 0.25, 1.46, c, { decal: { front: leather(c), back: (x, w, h) => sheen(x, w, h, 0.1) } });
}

// ---------- Sofá bajo de líneas rectas ----------
function urbana_sofa(s, { c }) {
  const W = 2, accent = lum(c) > 0.6 ? INKC : SNOW, pin = c === PINK ? INKC : PINK;
  s.shadowRect(0.04, 0.1, W - 0.04, 0.98, 0.22);
  for (const u of [0.1, W - 0.14]) for (const v of [0.16, 0.86]) s.box(u, v, 0, u + 0.04, v + 0.04, 0.16, CHROME, { decal: { front: chromeBar } });
  s.box(0.06, 0.12, 0.16, W - 0.06, 0.94, 0.2, DCHROME);
  s.box(0.04, 0.12, 0.2, W - 0.04, 0.96, 0.4, shade(c, -0.06), { decal: { front: (x, w, h) => { fr(x, 0, h - 1.4, w, 1.4, rgba('#ffffff', 0.25)); sheen(x, w, h, 0.1); } } });
  const a0 = 0.16, a1 = W - 0.16, cw = (a1 - a0) / 2;
  for (let i = 0; i < 2; i++) s.box(a0 + i * cw + 0.01, 0.34, 0.4, a0 + (i + 1) * cw - 0.01, 0.94, 0.53, c, { decal: { top: leather(c), front: (x, w, h) => sheen(x, w, h, 0.12) } });
  s.box(0.04, 0.12, 0.4, W - 0.04, 0.34, 0.92, c, { decal: { front: leather(c), top: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.box(0.04, 0.34, 0.4, 0.16, 0.96, 0.66, c, { decal: { top: (x, w, h) => sheen(x, w, h, 0.18) } });
  s.box(W - 0.16, 0.34, 0.4, W - 0.04, 0.96, 0.66, c, { decal: { top: (x, w, h) => sheen(x, w, h, 0.18) } });
  // cojín decorativo con franjas
  s.box(0.24, 0.34, 0.53, 0.6, 0.44, 0.84, accent, {
    decal: { front: (x, w, h) => { for (let i = 0; i < 3; i++) fr(x, 0, h * (0.2 + i * 0.25), w, 1.6, i === 1 ? pin : rgba(lum(accent) > 0.5 ? INKC : SNOW, 0.8)); sheen(x, w, h, 0.12); } },
  });
}

// ---------- Mesa de centro de cristal ----------
function urbana_table(s) {
  const W = 2;
  s.shadowRect(0.06, 0.1, W - 0.06, 0.92, 0.16);
  for (const u of [0.08, W - 0.12]) for (const v of [0.12, 0.84]) s.box(u, v, 0, u + 0.04, v + 0.04, 0.44, CHROME, { decal: { front: chromeBar, left: chromeBar } });
  // repisa baja negra con revista
  s.box(0.12, 0.16, 0.1, W - 0.12, 0.84, 0.13, INKC);
  s.box(0.4, 0.34, 0.13, 0.86, 0.68, 0.15, PINK, { decal: { top: (x, w, h) => { fr(x, 2, 2, w * 0.5, 2, rgba('#ffffff', 0.8)); fr(x, 2, 6, w * 0.32, 1.2, rgba('#ffffff', 0.55)); fr(x, w * 0.55, h * 0.45, w * 0.35, h * 0.4, rgba('#141414', 0.4)); } } });
  s.box(1.2, 0.3, 0.13, 1.56, 0.72, 0.2, SNOW, { decal: { top: (x, w, h) => { fr(x, 2, 2, w - 4, 2.2, INKC); fr(x, 2, 6, w * 0.5, 1, rgba('#141414', 0.5)); } } });
  // marco cromado
  s.box(0.08, 0.12, 0.44, W - 0.08, 0.16, 0.46, CHROME);
  s.box(0.08, 0.84, 0.44, W - 0.08, 0.88, 0.46, CHROME);
  s.box(0.08, 0.16, 0.44, 0.12, 0.84, 0.46, CHROME);
  s.box(W - 0.12, 0.16, 0.44, W - 0.08, 0.84, 0.46, CHROME);
  // cubierta de cristal (translúcida)
  s.custom([0.02, 0.06, 0.46, W - 0.02, 0.94, 0.5], (ctx) => {
    const T = [s.P(0.02, 0.06, 0.5), s.P(W - 0.02, 0.06, 0.5), s.P(W - 0.02, 0.94, 0.5), s.P(0.02, 0.94, 0.5)];
    const B = [s.P(0.02, 0.06, 0.46), s.P(W - 0.02, 0.06, 0.46), s.P(W - 0.02, 0.94, 0.46), s.P(0.02, 0.94, 0.46)];
    // cantos visibles
    ctx.fillStyle = rgba('#7fc4cf', 0.55);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pathPts(ctx, [T[i], T[j], B[j], B[i]]); ctx.fill(); }
    ctx.fillStyle = rgba('#d8f3f7', 0.32); pathPts(ctx, T); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.85); ctx.lineWidth = 0.8; pathPts(ctx, T); ctx.stroke();
    // reflejos diagonales
    ctx.save(); pathPts(ctx, T); ctx.clip();
    ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = 2.2;
    const a = s.P(0.5, 0.1, 0.5), b = s.P(0.25, 0.9, 0.5), a2 = s.P(0.8, 0.1, 0.5), b2 = s.P(0.6, 0.9, 0.5);
    line(ctx, a[0], a[1], b[0], b[1], rgba('#ffffff', 0.45), 2.2); line(ctx, a2[0], a2[1], b2[0], b2[1], rgba('#ffffff', 0.3), 1);
    ctx.restore();
    ctx.strokeStyle = rgba('#2c5a63', 0.7); ctx.lineWidth = 0.8;
    pathPts(ctx, [T[0], T[1], B[1], B[2], B[3], T[3]]); ctx.stroke();
  });
}

// ---------- Cama de plataforma ----------
function urbana_bed(s, { c }) {
  const W = 2, dark = lum(c) < 0.5, blanket = dark ? '#3b3e46' : '#2b2d38', sheet = '#f7f7f5';
  s.shadowRect(0.02, 0.04, W - 0.02, 1.98, 0.24);
  s.box(0.06, 0.16, 0, W - 0.06, 1.9, 0.06, DCHROME);
  s.box(0.02, 0.1, 0.06, W - 0.02, 1.98, 0.3, c, { decal: { front: (x, w, h) => { fr(x, 0, h * 0.45, w, 1.2, rgba(dark ? '#ffffff' : '#141414', 0.3)); sheen(x, w, h, 0.14); }, right: (x, w, h) => fr(x, 0, h * 0.45, w, 1.2, rgba(dark ? '#ffffff' : '#141414', 0.3)) } });
  s.box(0.08, 0.14, 0.3, W - 0.08, 0.9, 0.46, sheet, { decal: { top: (x, w, h) => sheen(x, w, h, 0.1) } });
  const top = (x, w, h) => {
    fr(x, 0, 0, w, 6, sheet); fr(x, 0, 6, w, 0.8, rgba('#000000', 0.25));
    fr(x, 0, h * 0.62, w, 3, SNOW); fr(x, 0, h * 0.62 + 3.6, w, 1.4, PINK);
    for (let i = 1; i < 6; i++) line(x, (w * i) / 6, 7, (w * i) / 6, h, rgba('#ffffff', 0.05), 0.6);
    sheen(x, w, h, 0.14);
  };
  s.box(0.06, 0.9, 0.3, W - 0.06, 1.96, 0.52, blanket, { decal: { top, front: (x, w, h) => { fr(x, 0, 0, w, 2, rgba('#ffffff', 0.12)); } } });
  for (let i = 0; i < 2; i++) s.box(0.2 + i * 0.84, 0.2, 0.46, 0.96 + i * 0.84, 0.56, 0.6, '#ffffff', { k: 0.02, decal: { top: (x, w, h) => { x.strokeStyle = rgba('#000', 0.08); x.lineWidth = 0.8; rr(x, 1.5, 1.5, w - 3, h - 3, 2); x.stroke(); } } });
  s.box(0.66, 0.56, 0.46, 1.34, 0.66, 0.68, INKC, { decal: { front: (x, w, h) => { fr(x, 0, h / 2 - 1, w, 2, PINK); sheen(x, w, h, 0.15); } } });
  const head = (x, w, h) => {
    const n = 6;
    for (let i = 0; i < n; i++) { rr(x, 2 + (i * (w - 4)) / n + 0.6, 3, (w - 4) / n - 1.2, h - 8, 1.6); x.fillStyle = shade(c, dark ? 0.08 : -0.06); x.fill(); }
    fr(x, 0, h - 3, w, 1.4, rgba('#ffffff', 0.5));
    sheen(x, w, h, 0.14);
  };
  s.box(0, 0, 0, W, 0.1, 1.2, c, { decal: { front: head, top: (x, w, h) => sheen(x, w, h, 0.2) } });
}

// ---------- Lámpara de arco ----------
function urbana_lamp(s, { st }) {
  const on = st === 1, warm = '#fff1c2';
  s.shadowRect(0.3, 0.06, 0.7, 0.44, 0.24);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.78, 1.0, warm, 0.34));
  const marble = (x, w, h) => { x.strokeStyle = rgba('#8e8a84', 0.4); x.lineWidth = 0.6; x.beginPath(); x.moveTo(w * 0.2, 0); x.quadraticCurveTo(w * 0.5, h * 0.5, w * 0.35, h); x.moveTo(w * 0.75, 0); x.quadraticCurveTo(w * 0.6, h * 0.6, w * 0.9, h); x.stroke(); sheen(x, w, h, 0.18); };
  s.box(0.3, 0.06, 0, 0.7, 0.44, 0.3, '#ecebe7', { decal: { front: marble, right: marble, left: marble, top: marble } });
  // arco de tubo cromado
  // sube recto, da la vuelta y baja: termina apuntando al piso
  const path = [[0.5, 0.25, 0.3]];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * Math.PI;
    path.push([0.5, 0.52 - 0.27 * Math.cos(a), 1.8 + 0.34 * Math.sin(a)]);
  }
  path.push([0.5, 0.79, 1.74]);
  s.custom([0.46, 0.2, 0.3, 0.54, 0.84, 2.3], (ctx) => {
    const P = path.map((p) => s.P(p[0], p[1], p[2]));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [lw, col] of [[3.4, outlineOf(CHROME)], [2, CHROME], [0.7, '#ffffff']]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    }
  });
  const end = path[path.length - 1];
  // pantalla tipo domo
  s.cyl('z', 0.5, end[1], 0.24, 0.08, end[2] - 0.42, end[2] - 0.14, INKC, { seg: 22, faces: { top: '#2b2d38' } });
  s.box(0.48, end[1] - 0.02, end[2] - 0.14, 0.52, end[1] + 0.02, end[2] - 0.02, CHROME);
  s.custom([0.3, end[1] - 0.2, end[2] - 0.5, 0.7, end[1] + 0.2, end[2] - 0.42], (ctx) => {
    const [x, y] = s.P(0.5, end[1], end[2] - 0.42);
    ctx.fillStyle = on ? '#fff6d8' : '#3a3c44';
    ctx.beginPath(); ctx.ellipse(x, y, 0.24 * 45, 0.24 * 22.6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = outlineOf(INKC); ctx.lineWidth = 1; ctx.stroke();
    dotc(ctx, x, y + 1, 3, on ? '#ffffff' : '#6a6c74');
  });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, end[1], end[2] - 0.45); glow(ctx, x, y + 4, 40, warm, 0.4); glow(ctx, x, y + 2, 12, '#ffffff', 0.5); });
}

// ---------- Estante de metal ----------
function urbana_shelf(s, { c }) {
  const dark = lum(c) < 0.5, obj = dark ? [SNOW, '#c9ced6', PINK] : [INKC, '#4a4f5a', PINK];
  s.shadowRect(0.06, 0.1, 0.94, 0.9, 0.22);
  for (const u of [0.06, 0.9]) for (const v of [0.1, 0.86]) s.box(u, v, 0, u + 0.04, v + 0.04, 2.2, c, { decal: { front: (x, w, h) => fr(x, 0, 0, Math.max(0.6, w * 0.3), h, rgba('#ffffff', dark ? 0.25 : 0.5)) } });
  const levels = [0.08, 0.62, 1.16, 1.7, 2.16];
  for (const z of levels) s.box(0.06, 0.1, z, 0.94, 0.9, z + 0.04, c, { decal: { front: (x, w, h) => fr(x, 0, 0, w, Math.max(0.5, h * 0.4), rgba('#ffffff', dark ? 0.22 : 0.5)), top: (x, w, h) => sheen(x, w, h, 0.12) } });
  // nivel 1: libros acostados + cubo
  let z = 0.12;
  s.box(0.18, 0.28, z, 0.62, 0.72, z + 0.06, obj[0]);
  s.box(0.2, 0.3, z + 0.06, 0.58, 0.68, z + 0.11, obj[2]);
  s.box(0.2, 0.3, z + 0.11, 0.6, 0.7, z + 0.16, obj[1]);
  s.box(0.68, 0.36, z, 0.86, 0.6, z + 0.22, obj[0], { decal: { front: (x, w, h) => sheen(x, w, h, 0.2) } });
  // nivel 2: jarrones
  z = 0.66;
  s.cyl('z', 0.32, 0.5, 0.1, 0.06, z, z + 0.3, obj[0], { seg: 16, faces: { top: shade(obj[0], -0.4) } });
  s.cyl('z', 0.62, 0.5, 0.07, 0.1, z, z + 0.18, obj[1], { seg: 16, faces: { top: shade(obj[1], -0.4) } });
  s.ball(0.8, 0.5, z + 0.07, 0.07, obj[2]);
  // nivel 3: libros parados
  z = 1.2;
  const bk = dark ? [SNOW, '#9aa0aa', PINK, SNOW, '#3a3c44'] : [INKC, '#6b7280', PINK, INKC, '#c9ced6'];
  let u = 0.14;
  bk.forEach((col, i) => { const bw = 0.07 + (i % 2) * 0.02, bh = 0.32 + ((i * 7) % 4) * 0.03; s.box(u, 0.3, z, u + bw, 0.7, z + bh, col, { lw: 0.8, decal: { front: (x, w, h) => fr(x, 0, h * 0.2, w, 1, rgba(lum(col) > 0.5 ? '#000' : '#fff', 0.35)) } }); u += bw + 0.01; });
  s.box(0.64, 0.4, z, 0.84, 0.6, z + 0.05, obj[1]);
  s.ball(0.74, 0.5, z + 0.13, 0.08, YELLOW === obj[2] ? PINK : '#3fa66a');
  // nivel 4: planta colgante
  z = 1.74;
  s.cyl('z', 0.5, 0.5, 0.12, 0.1, z, z + 0.18, obj[0], { seg: 16, faces: { top: '#4a3020' } });
  s.custom([0.3, 0.3, z + 0.18, 0.7, 0.7, z + 0.42], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, z + 0.18);
    for (const [dx, dy, r, col] of [[-5, -3, 4, '#2e8b4a'], [5, -3, 4, '#38a35a'], [0, -7, 4.5, '#4bbf6b'], [-8, 3, 2.6, '#38a35a'], [8, 5, 2.4, '#2e8b4a']]) { dotc(ctx, x + dx, y + dy, r + 0.7, '#1f5a2c'); dotc(ctx, x + dx, y + dy, r, col); }
  });
}

// ---------- Tapete de ajedrez ----------
function urbana_rug(s) {
  s.box(0.04, 0.04, 0, 1.96, 1.96, 0.025, INKC, {
    outline: '#050505',
    decal: {
      top: (x, w, h) => {
        fr(x, 0, 0, w, h, SNOW); fr(x, 2.5, 2.5, w - 5, h - 5, INKC); fr(x, 4.5, 4.5, w - 9, h - 9, SNOW);
        const n = 6, cw = (w - 12) / n, ch = (h - 12) / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) fr(x, 6 + i * cw, 6 + j * ch, cw, ch, INKC);
        x.strokeStyle = PINK; x.lineWidth = 0.9; x.strokeRect(5.5, 5.5, w - 11, h - 11);
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, rgba('#ffffff', 0.12)); g.addColorStop(1, rgba('#000000', 0.12));
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      },
    },
  });
}

// ---------- Cuadro abstracto (pared) ----------
function urbana_art(ctx, { c }) {
  const x = 4, y = -52, w = 24, h = 38;
  ctx.fillStyle = 'rgba(16,10,28,0.28)'; ctx.fillRect(x + 1.5, y + 2, w, h);
  fr(ctx, x, y, w, h, INKC);
  fr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, '#f7f6f2');
  ctx.save(); ctx.beginPath(); ctx.rect(x + 1.5, y + 1.5, w - 3, h - 3); ctx.clip();
  // composición: gran círculo, bloque de color y líneas
  dotc(ctx, x + 9, y + 13, 7, INKC);
  fr(ctx, x + 12, y + 17, 9, 14, c);
  fr(ctx, x + 12, y + 17, 9, 1.2, shade(c, 0.4));
  line(ctx, x + 2, y + 25, x + 22, y + 25, INKC, 1.2);
  line(ctx, x + 6, y + 6, x + 6, y + 36, rgba('#141414', 0.6), 0.7);
  ctx.strokeStyle = INKC; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 17, y + 8, 3.2, 0, TAU); ctx.stroke();
  fr(ctx, x + 3, y + 29, 6, 4, mix(c, '#141414', 0.5));
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.6; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export default {
  floor: { urbana_chair, urbana_sofa, urbana_table, urbana_bed, urbana_lamp, urbana_shelf, urbana_rug },
  wall: { urbana_art },
  period: {},
  defaultColor: { urbana_table: '#c9ced6', urbana_lamp: '#141414', urbana_rug: '#141414' },
};
