// Dibujo de la línea "Pura Vida" (moderna, colores pop y madera clara). Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, mix, rgba, outlineOf } from '../iso.js';
import { rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const POP = ['#3ccfb4', '#ff6b5e', '#ffd84d', '#4aa8ff', '#b48cff'];
const OAK = '#e0b47e', DOAK = '#a87443', CHROME = '#d3d8df', WHITE = '#f8f6f1';
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
const pipe = (ctx, w, h) => { ctx.strokeStyle = rgba('#ffffff', 0.28); ctx.lineWidth = 0.8; rr(ctx, 1.2, 1.2, w - 2.4, h - 2.4, 2); ctx.stroke(); };
const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const floorGlow = (ctx, s, cu, cv, ru, color, a) => {
  const [x, y] = s.P(cu, cv, 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.5); glow(ctx, 0, 0, ru * 45, color, a); ctx.restore();
};
// Otros colores de la paleta (para acentos que contrasten con c)
const others = (c) => POP.filter((p) => p.toLowerCase() !== String(c).toLowerCase());
// Patas abiertas de madera (trípode): de (cu, cv, ztop) radio r0 a radio r1 en el piso
function splayLegs(s, cu, cv, ztop, r0, r1, n, col, lw = 1.6) {
  const legs = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU + Math.PI / 2 + (n === 4 ? Math.PI / 4 : 0); legs.push([Math.cos(a), Math.sin(a)]); }
  s.custom([cu - r1, cv - r1, 0, cu + r1, cv + r1, ztop], (ctx) => {
    const L = legs.map(([dx, dy]) => ({ a: s.P(cu + dx * r0, cv + dy * r0, ztop), b: s.P(cu + dx * r1, cv + dy * r1, 0), d: s.P(cu + dx * r1, cv + dy * r1, 0)[1] }));
    L.sort((p, q) => p.d - q.d);
    ctx.lineCap = 'round';
    for (const { a, b } of L) {
      line(ctx, a[0], a[1], b[0], b[1], outlineOf(col), lw + 1.4);
      line(ctx, a[0], a[1], b[0], b[1], col, lw);
      line(ctx, a[0] - 0.4, a[1], b[0] - 0.4, b[1], rgba('#ffffff', 0.3), 0.5);
    }
  });
}

// ---------- Silla concha ----------
function puravida_chair(s, { c }) {
  s.shadowEllipse(0.5, 0.52, 0.36, 0.36, 0.2);
  splayLegs(s, 0.5, 0.55, 0.5, 0.18, 0.32, 4, OAK, 1.5);
  s.box(0.44, 0.49, 0.46, 0.56, 0.61, 0.5, '#3b3f4a');
  s.cyl('z', 0.5, 0.55, 0.33, 0.36, 0.5, 0.62, c, { seg: 22, decal: { top: (x, w, h) => { x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 1; x.beginPath(); x.arc(w / 2, h / 2, w * 0.34, Math.PI * 0.95, Math.PI * 1.6); x.stroke(); x.strokeStyle = rgba(shade(c, -0.5), 0.25); x.beginPath(); x.arc(w / 2, h / 2, w * 0.4, 0, TAU); x.stroke(); } } });
  // respaldo ovalado (una sola pieza)
  const back = [];
  back.push([0.24, 0.62], [0.76, 0.62], [0.86, 0.86]);
  for (let k = 1; k < 12; k++) { const a = (k / 12) * Math.PI; back.push([0.5 + 0.36 * Math.cos(a), 0.86 + 0.4 * Math.sin(a)]); }
  back.push([0.14, 0.86]);
  s.prism('v', back, 0.13, 0.21, c, { decal: { front: (x, w, h) => { x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 1; x.beginPath(); x.ellipse(w / 2, h * 0.55, w * 0.36, h * 0.4, 0, Math.PI * 1.05, Math.PI * 1.5); x.stroke(); sheen(x, w, h, 0.12); } } });
}

// ---------- Sofá de brazos redondos ----------
function puravida_sofa(s, { c }) {
  const W = 2, [p1, p2] = others(c);
  s.shadowRect(0.04, 0.1, W - 0.04, 0.98, 0.22);
  for (const u of [0.12, W - 0.18]) for (const v of [0.18, 0.84]) s.box(u, v, 0, u + 0.06, v + 0.06, 0.14, OAK);
  s.box(0.06, 0.14, 0.14, W - 0.06, 0.94, 0.36, shade(c, -0.08), { decal: { front: (x, w, h) => sheen(x, w, h, 0.12) } });
  const a0 = 0.26, a1 = W - 0.26, cw = (a1 - a0) / 2;
  for (let i = 0; i < 2; i++) s.box(a0 + i * cw + 0.01, 0.36, 0.36, a0 + (i + 1) * cw - 0.01, 0.94, 0.52, c, { decal: { top: pipe, front: (x, w, h) => sheen(x, w, h, 0.12) } });
  s.prism('u', [[0.12, 0.36], [0.36, 0.36], [0.36, 0.84], [0.31, 0.93], [0.24, 0.96], [0.17, 0.93], [0.12, 0.84]], a0, a1, c, { decal: { e1: (x, w, h) => { for (let i = 0; i < 4; i++) dotc(x, ((i + 0.5) * w) / 4, h * 0.5, 0.9, rgba(shade(c, -0.5), 0.5)); sheen(x, w, h, 0.1); } } });
  const arm = (u0, u1) => [[u0, 0.36], [u1, 0.36], [u1, 0.62], [u1 - 0.04, 0.7], [(u0 + u1) / 2, 0.72], [u0 + 0.04, 0.7], [u0, 0.62]];
  s.prism('v', arm(0.04, 0.26), 0.12, 0.96, c, { decal: { front: (x, w, h) => sheen(x, w, h, 0.15) } });
  s.prism('v', arm(W - 0.26, W - 0.04), 0.12, 0.96, c, { decal: { front: (x, w, h) => sheen(x, w, h, 0.15) } });
  // cojines de colores
  s.box(0.34, 0.38, 0.52, 0.66, 0.48, 0.8, p1, { decal: { front: (x, w, h) => { dotc(x, w / 2, h / 2, Math.min(w, h) * 0.22, rgba('#ffffff', 0.7)); sheen(x, w, h, 0.15); } } });
  s.box(W - 0.66, 0.38, 0.52, W - 0.34, 0.48, 0.8, p2, { decal: { front: (x, w, h) => { for (let i = 0; i < 3; i++) fr(x, 0, h * (0.25 + i * 0.22), w, 1.4, rgba('#ffffff', 0.6)); sheen(x, w, h, 0.15); } } });
}

// ---------- Mesa redonda ----------
function puravida_table(s, { c }) {
  s.shadowEllipse(0.5, 0.5, 0.42, 0.42, 0.2);
  splayLegs(s, 0.5, 0.5, 0.68, 0.14, 0.34, 3, OAK, 1.8);
  s.cyl('z', 0.5, 0.5, 0.44, 0.44, 0.66, 0.71, c, { seg: 26 });
  s.cyl('z', 0.5, 0.5, 0.45, 0.45, 0.71, 0.76, WHITE, { seg: 26, decal: { top: (x, w, h) => { x.strokeStyle = rgba(c, 0.55); x.lineWidth = 1.2; x.beginPath(); x.arc(w / 2, h / 2, w * 0.44, 0, TAU); x.stroke(); sheen(x, w, h, 0.18); } } });
}

// ---------- Cama con cabecera de arco ----------
function puravida_bed(s, { c }) {
  const W = 2, [p1, p2] = others(c), sheet = '#fbfaf6';
  s.shadowRect(0.02, 0.04, W - 0.02, 1.98, 0.24);
  for (const u of [0.08, W - 0.16]) for (const v of [0.18, 1.86]) s.box(u, v, 0, u + 0.08, v + 0.08, 0.1, DOAK);
  s.box(0.04, 0.14, 0.1, W - 0.04, 1.98, 0.28, OAK, { decal: { front: (x, w, h) => { fr(x, 0, h * 0.5, w, 0.8, rgba(DOAK, 0.5)); sheen(x, w, h, 0.18); } } });
  s.box(0.08, 0.16, 0.28, W - 0.08, 0.8, 0.44, sheet, { decal: { top: (x, w, h) => sheen(x, w, h, 0.1) } });
  const top = (x, w, h) => {
    fr(x, 0, 0, w, 6, sheet); fr(x, 0, 6, w, 0.8, rgba('#000', 0.18));
    x.strokeStyle = rgba('#ffffff', 0.45); x.lineWidth = 1.1;
    for (let j = 0; j < 4; j++) {
      const y0 = 12 + j * ((h - 14) / 4);
      x.beginPath();
      for (let i = 0; i <= w; i += 2) { const y = y0 + Math.sin(i / 5) * 1.6; if (i) x.lineTo(i, y); else x.moveTo(i, y); }
      x.stroke();
    }
    sheen(x, w, h, 0.12);
  };
  s.box(0.06, 0.8, 0.26, W - 0.06, 1.97, 0.5, c, { decal: { top, front: (x, w, h) => fr(x, 0, h - 2, w, 2, shade(c, -0.22)) } });
  s.box(0.2, 0.22, 0.44, 0.92, 0.58, 0.58, '#ffffff', { k: 0.02, decal: { top: pipe } });
  s.box(1.08, 0.22, 0.44, 1.8, 0.58, 0.58, '#ffffff', { k: 0.02, decal: { top: pipe } });
  s.box(0.7, 0.58, 0.44, 1.02, 0.68, 0.7, p1, { decal: { front: (x, w, h) => { dotc(x, w / 2, h / 2, 2.5, rgba('#ffffff', 0.75)); sheen(x, w, h, 0.15); } } });
  s.box(1.02, 0.58, 0.44, 1.34, 0.68, 0.7, p2, { decal: { front: (x, w, h) => sheen(x, w, h, 0.15) } });
  // cabecera en arco
  const arch = [[0, 0], [W, 0], [W, 0.78]];
  for (let k = 1; k < 16; k++) { const a = (k / 16) * Math.PI; arch.push([1 + Math.cos(a), 0.78 + 0.52 * Math.sin(a)]); }
  arch.push([0, 0.78]);
  s.prism('v', arch, 0, 0.12, c, {
    decal: {
      front: (x, w, h) => {
        x.fillStyle = shade(c, 0.22); x.beginPath();
        x.moveTo(6, h - 9); x.lineTo(6, h * 0.56); x.ellipse(w / 2, h * 0.56, w / 2 - 6, h * 0.36, 0, Math.PI, TAU); x.lineTo(w - 6, h - 9); x.closePath(); x.fill();
        x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 1; x.stroke();
        sheen(x, w, h, 0.14);
      },
    },
  });
}

// ---------- Lámpara globo ----------
function puravida_lamp(s, { c, st }) {
  const on = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.34, 0.34, 0.2);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.15, c, 0.3));
  splayLegs(s, 0.5, 0.5, 1.02, 0.05, 0.3, 3, OAK, 1.6);
  s.cyl('z', 0.5, 0.5, 0.06, 0.06, 1.02, 1.08, WHITE, { seg: 12 });
  const globe = on ? mix(c, '#ffffff', 0.55) : shade(c, -0.05);
  s.ball(0.5, 0.5, 1.44, 0.36, globe, { outline: outlineOf(c) });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 1.44); glow(ctx, x, y, 46, c, 0.32); glow(ctx, x - 2, y - 2, 12, '#ffffff', 0.55); });
}

// ---------- Refri retro ----------
function puravida_fridge(s, { c, st }) {
  const open = st === 1;
  s.shadowRect(0.1, 0.12, 0.92, 0.9, 0.24);
  for (const u of [0.16, 0.78]) for (const v of [0.18, 0.74]) s.box(u, v, 0, u + 0.06, v + 0.06, 0.08, CHROME);
  const badge = (x, w, h) => { rr(x, w / 2 - 5, h - 9, 10, 4.5, 2); x.fillStyle = CHROME; x.fill(); dotc(x, w / 2, h - 6.8, 1.4, POP[2] === c ? POP[1] : POP[2]); };
  const closed = (x, w, h) => {
    const fz = h * 0.3;
    line(x, 1, fz, w - 1, fz, rgba('#000', 0.3), 0.9);
    fr(x, 1.5, 1.2, 1.2, h - 2.4, rgba('#ffffff', 0.3));
    badge(x, w, h);
    sheen(x, w, h, 0.16);
  };
  const interior = (x, w, h) => {
    const fz = h * 0.3;
    line(x, 1, fz, w - 1, fz, rgba('#000', 0.3), 0.9);
    rr(x, 1.5, fz + 1.5, w - 3, h - fz - 3, 2); x.fillStyle = '#fff8e6'; x.fill();
    glow(x, w / 2, fz + 4, w * 0.8, '#fffdf2', 0.8);
    const y1 = fz + (h - fz) * 0.36, y2 = fz + (h - fz) * 0.7, y3 = h - 2;
    fr(x, 2, y1, w - 4, 1, '#d8d0bf'); fr(x, 2, y2, w - 4, 1, '#d8d0bf');
    // botellas de jugo, sandía, piña
    fr(x, 4, y1 - 8, 3, 8, POP[1]); fr(x, 4.6, y1 - 9.5, 1.8, 1.5, '#ffffff');
    fr(x, 8.5, y1 - 7, 3, 7, POP[2]); fr(x, 9.1, y1 - 8.5, 1.8, 1.5, '#ffffff');
    x.fillStyle = '#2fb67c'; x.beginPath(); x.arc(w - 7, y1 - 0.5, 5, Math.PI, TAU); x.fill();
    x.fillStyle = '#ff5c6c'; x.beginPath(); x.arc(w - 7, y1 - 0.5, 4, Math.PI, TAU); x.fill();
    for (const d of [-2, 0, 2]) dotc(x, w - 7 + d, y1 - 2.2, 0.4, '#2b2d38');
    x.fillStyle = '#f2b632'; x.beginPath(); x.ellipse(7, y2 - 3.5, 3, 3.5, 0, 0, TAU); x.fill();
    x.fillStyle = '#2e8b4a'; x.beginPath(); x.moveTo(5, y2 - 6.5); x.lineTo(7, y2 - 11); x.lineTo(9, y2 - 6.5); x.fill();
    fr(x, 12, y2 - 3.5, 8, 3.5, POP[3]); fr(x, 12, y2 - 4, 8, 0.8, '#ffffff');
    fr(x, 3, y3 - 4, w - 6, 3.4, rgba('#a8e6cf', 0.9));
  };
  s.box(0.12, 0.14, 0.08, 0.88, 0.84, 1.58, c, { decal: { front: open ? interior : closed, right: (x, w, h) => { fr(x, 0, h * 0.62, w, 2, rgba('#ffffff', 0.4)); sheen(x, w, h, 0.12); }, left: (x, w, h) => fr(x, 0, h * 0.62, w, 2, rgba('#ffffff', 0.4)) } });
  s.prism('u', [[0.14, 1.58], [0.84, 1.58], [0.84, 1.66], [0.79, 1.76], [0.68, 1.82], [0.3, 1.82], [0.19, 1.76], [0.14, 1.66]], 0.12, 0.88, c, {
    decal: { e2: (x, w, h) => sheen(x, w, h, 0.2), e3: (x, w, h) => sheen(x, w, h, 0.25) },
  });
  if (!open) {
    s.box(0.76, 0.84, 0.66, 0.8, 0.89, 1.14, CHROME, { decal: { front: (x, w, h) => fr(x, 0, 0, w * 0.4, h, '#ffffff') } });
    s.box(0.76, 0.84, 1.24, 0.8, 0.89, 1.42, CHROME);
  } else {
    s.box(0.1, 0.84, 0.1, 0.17, 1.58, 1.56, c, {
      decal: {
        right: (x, w, h) => { rr(x, 2, 2, w - 4, h - 4, 2); x.fillStyle = shade(c, 0.35); x.fill(); for (let i = 1; i < 4; i++) { const y = h * (0.3 + i * 0.17); fr(x, 3, y, w - 6, 1.4, '#e4dccb'); fr(x, 5, y - 5, 2.5, 5, POP[(i + 1) % 5]); fr(x, 10, y - 4, 3, 4, '#ffffff'); } },
        left: (x, w, h) => { fr(x, 2.5, h * 0.45, 1.6, 10, CHROME); sheen(x, w, h, 0.15); },
      },
    });
    if (s.faceVisible(0, 1, 0)) s.over((ctx) => { const [x, y] = s.P(0.5, 0.95, 0.7); glow(ctx, x, y, 26, '#fff4cf', 0.24); });
  }
}

// ---------- Librero de cubos ----------
function puravida_cubes(s) {
  const W = 2, frame = WHITE, V0 = 0.4, V1 = 0.92;
  s.shadowRect(0.02, V0, W - 0.02, V1 + 0.02, 0.22);
  const zs = [0, 0.52, 1.04, 1.56], us = [0.02, 0.5, 0.98, 1.46, W - 0.02];
  s.box(0.04, V0, 0.04, W - 0.04, V0 + 0.06, 1.56, frame, {
    decal: {
      front: (x, w, h) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) fr(x, (i * w) / 4, (j * h) / 3, w / 4, h / 3, mix(POP[(i + j * 2) % 5], WHITE, 0.55)); },
      back: (x, w, h) => { for (let i = 1; i < 4; i++) fr(x, (i * w) / 4 - 0.5, 0, 1, h, rgba('#000', 0.06)); sheen(x, w, h, 0.1); },
    },
  });
  for (const z of zs) s.box(0.02, V0, z, W - 0.02, V1, z + (z === 1.56 ? 0.05 : 0.04), frame, { decal: { front: (x, w, h) => fr(x, 0, 0, w, Math.max(0.5, h * 0.4), rgba('#000', 0.06)), top: (x, w, h) => sheen(x, w, h, 0.1) } });
  for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) {
    const u0 = i === 0 ? 0.02 : i === 4 ? W - 0.06 : us[i] - 0.02;
    s.box(u0, V0 + 0.06, zs[j] + 0.04, u0 + 0.04, V1, zs[j + 1], frame);
  }
  const mid = (i) => (us[i] + us[i + 1]) / 2, vm = 0.69;
  // cajas de tela de colores con asa
  const bin = (i, j, col) => {
    const u0 = us[i] + 0.04, u1 = us[i + 1] - 0.04, z0 = zs[j] + 0.04, z1 = zs[j + 1] - 0.06;
    s.box(u0, V0 + 0.1, z0, u1, V1 - 0.01, z1, col, { decal: { front: (x, w, h) => { rr(x, w / 2 - 4, h * 0.22, 8, 3, 1.5); x.fillStyle = shade(col, -0.45); x.fill(); fr(x, 0, 0, w, 1.2, rgba('#ffffff', 0.35)); sheen(x, w, h, 0.14); } } });
  };
  bin(0, 0, POP[3]); bin(2, 1, POP[1]); bin(0, 2, POP[0]); bin(3, 2, POP[4]);
  // fila de abajo
  s.ball(mid(1), vm, 0.19, 0.15, POP[1]);
  let u = us[2] + 0.06;
  for (const col of [POP[0], POP[2], POP[4], '#2b2d38', POP[1]]) { s.box(u, V0 + 0.12, 0.04, u + 0.07, V1 - 0.04, 0.38 + ((u * 13) % 5) * 0.02, col, { lw: 0.8 }); u += 0.075; }
  s.cyl('z', mid(3), vm, 0.11, 0.14, 0.04, 0.26, '#e8806b', { seg: 14, faces: { top: '#4a3020' } });
  s.custom([mid(3) - 0.2, V0 + 0.1, 0.26, mid(3) + 0.2, V1, 0.5], (ctx) => {
    const [x, y] = s.P(mid(3), vm, 0.26);
    for (const [dx, dy, r, col] of [[-4, -3, 3.6, '#2e8b4a'], [4, -3, 3.6, '#38a35a'], [0, -7, 4, '#4bbf6b']]) { dotc(ctx, x + dx, y + dy, r + 0.7, '#1f5a2c'); dotc(ctx, x + dx, y + dy, r, col); }
  });
  // fila de en medio
  u = us[0] + 0.08;
  for (const col of [POP[4], WHITE, POP[1], POP[0]]) { s.box(u, V0 + 0.12, 0.56, u + 0.07, V1 - 0.04, 0.9, col, { lw: 0.8 }); u += 0.075; }
  s.cyl('z', mid(1), vm, 0.12, 0.08, 0.56, 0.86, WHITE, { seg: 16, faces: { top: shade(WHITE, -0.35) } });
  s.box(mid(3) - 0.15, V0 + 0.14, 0.56, mid(3) + 0.15, V1 - 0.06, 0.66, POP[2]);
  s.box(mid(3) - 0.12, V0 + 0.16, 0.66, mid(3) + 0.12, V1 - 0.08, 0.74, POP[0]);
  // fila de arriba
  s.box(mid(1) - 0.14, V0 + 0.14, 1.08, mid(1) + 0.14, V1 - 0.06, 1.34, WHITE, { decal: { front: (x, w, h) => { fr(x, 2, 2, w - 4, h - 4, POP[1]); dotc(x, w / 2, h / 2, 2, '#ffffff'); } } });
  s.ball(mid(2), vm, 1.2, 0.12, POP[2]);
}

// ---------- Póster atardecer (pared) ----------
function puravida_poster(ctx) {
  const x = 3, y = -54, w = 26, h = 40;
  ctx.fillStyle = 'rgba(16,10,28,0.28)'; ctx.fillRect(x + 1.5, y + 2, w, h);
  fr(ctx, x, y, w, h, WHITE);
  const px = x + 2, py = y + 2, pw = w - 4, ph = h - 9;
  ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  const g = ctx.createLinearGradient(0, py, 0, py + ph);
  g.addColorStop(0, POP[4]); g.addColorStop(0.45, POP[1]); g.addColorStop(0.7, POP[2]);
  ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
  dotc(ctx, px + pw * 0.55, py + ph * 0.66, 6, '#fff3b0');
  for (let i = 0; i < 3; i++) fr(ctx, px, py + ph * 0.6 + i * 2.2, pw, 0.8, rgba(POP[1], 0.6));
  // mar con olas
  fr(ctx, px, py + ph * 0.7, pw, ph * 0.3, POP[0]);
  ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 0.8;
  for (let j = 0; j < 3; j++) { ctx.beginPath(); for (let i = 0; i <= pw; i += 1.5) { const yy = py + ph * 0.76 + j * 3 + Math.sin(i / 2 + j) * 0.7; if (i) ctx.lineTo(px + i, yy); else ctx.moveTo(px + i, yy); } ctx.stroke(); }
  // palmera
  ctx.strokeStyle = '#3b2240'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(px + 5, py + ph); ctx.quadraticCurveTo(px + 3, py + ph * 0.6, px + 7, py + ph * 0.32); ctx.stroke();
  ctx.lineWidth = 1.2;
  for (const a of [-2.8, -2.2, -1.4, -0.7, -0.2]) { ctx.beginPath(); ctx.moveTo(px + 7, py + ph * 0.32); ctx.quadraticCurveTo(px + 7 + Math.cos(a) * 5, py + ph * 0.32 + Math.sin(a) * 3 - 2, px + 7 + Math.cos(a) * 9, py + ph * 0.32 + 3 + Math.sin(a) * 1.5); ctx.stroke(); }
  // pájaros
  ctx.strokeStyle = '#3b2240'; ctx.lineWidth = 0.7;
  for (const [bx, by] of [[16, 8], [20, 11]]) { ctx.beginPath(); ctx.moveTo(px + bx - 2, py + by); ctx.quadraticCurveTo(px + bx - 1, py + by - 1.5, px + bx, py + by); ctx.quadraticCurveTo(px + bx + 1, py + by - 1.5, px + bx + 2, py + by); ctx.stroke(); }
  ctx.restore();
  // pie del póster con puntos de color
  for (let i = 0; i < 5; i++) dotc(ctx, x + 6 + i * 3.5, y + h - 3.5, 1.1, POP[i]);
  ctx.strokeStyle = 'rgba(60,40,50,0.35)'; ctx.lineWidth = 0.6; ctx.strokeRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6);
  ctx.fillStyle = rgba('#f3ead2', 0.85);
  ctx.save(); ctx.translate(x + w / 2, y + 0.5); ctx.fillRect(-4, -1.5, 8, 3); ctx.restore();
}

export default {
  floor: { puravida_chair, puravida_sofa, puravida_table, puravida_bed, puravida_lamp, puravida_fridge, puravida_cubes },
  wall: { puravida_poster },
  period: {},
  defaultColor: { puravida_cubes: '#f8f6f1', puravida_poster: '#ff6b5e' },
};
