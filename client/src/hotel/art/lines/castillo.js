// Dibujo de la línea "Castillo". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, mix, rgba, outlineOf, pathPts } from '../iso.js';

const TAU = Math.PI * 2;
const GOLD = '#d8a92c', IRON = '#2e2c34', OAK = '#5a3620', DOAK = '#3a2214', STONE = '#8f8c99', DSTONE = '#5f5b6a', STEEL = '#b9c0c9';
const FIRE = '#ff9a2e';
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
const planks = (ctx, w, h, c, n) => {
  for (let i = 1; i < n; i++) line(ctx, 0, (h * i) / n, w, (h * i) / n, rgba(shade(c, -0.6), 0.45), 0.7);
  sheen(ctx, w, h, 0.1);
};
// Llama (dibujo libre en pantalla); k = fase para que parpadee
function flame(ctx, x, y, sz, k) {
  const sway = Math.sin(k * 2.3) * sz * 0.18, hh = sz * (1.9 + Math.sin(k * 3.1) * 0.2);
  glow(ctx, x, y - hh * 0.4, sz * 4.2, FIRE, 0.35);
  const tear = (s2, col) => {
    ctx.beginPath(); ctx.moveTo(x - sz * s2, y);
    ctx.quadraticCurveTo(x - sz * s2, y - hh * s2 * 0.6, x + sway, y - hh * s2);
    ctx.quadraticCurveTo(x + sz * s2, y - hh * s2 * 0.6, x + sz * s2, y);
    ctx.arc(x, y, sz * s2, 0, Math.PI); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  tear(1, '#ff6a1e'); tear(0.66, '#ffc23d'); tear(0.34, '#fff6c8');
}
// Arco gótico (punta) en dibujo plano
function gothicArch(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w * 0.6);
  ctx.quadraticCurveTo(x, y + w * 0.1, x + w / 2, y);
  ctx.quadraticCurveTo(x + w, y + w * 0.1, x + w, y + w * 0.6);
  ctx.lineTo(x + w, y + h); ctx.closePath();
}

// ---------- Trono gótico ----------
function castillo_trono(s, { c }) {
  const wood = '#2a1d22', trim = GOLD;
  s.shadowRect(0.04, 0.06, 0.96, 0.98, 0.26);
  const panel = (x, w, h) => { x.strokeStyle = rgba(trim, 0.7); x.lineWidth = 0.8; gothicArch(x, 3, 3, w - 6, h - 5); x.stroke(); sheen(x, w, h, 0.12); };
  s.box(0.06, 0.1, 0, 0.94, 0.96, 0.12, wood, { decal: { front: (x, w, h) => fr(x, 0, h / 2 - 0.5, w, 1, rgba(trim, 0.7)) } });
  s.box(0.14, 0.2, 0.12, 0.86, 0.92, 0.58, wood, { decal: { front: panel, right: panel, left: panel } });
  s.box(0.18, 0.36, 0.58, 0.82, 0.9, 0.74, c, {
    decal: { top: (x, w, h) => { for (const [a, b] of [[0.3, 0.35], [0.7, 0.35], [0.5, 0.7]]) dotc(x, w * a, h * b, 1, rgba(shade(c, -0.6), 0.8)); x.strokeStyle = rgba(trim, 0.6); x.lineWidth = 0.7; x.strokeRect(1.5, 1.5, w - 3, h - 3); sheen(x, w, h, 0.14); } },
  });
  const back = (x, w, h) => {
    x.fillStyle = c; gothicArch(x, w * 0.16, h * 0.08, w * 0.68, h * 0.9); x.fill();
    x.strokeStyle = trim; x.lineWidth = 1; x.stroke();
    // rosetón
    const cx = w / 2, cy = h * 0.34, r = w * 0.14;
    dotc(x, cx, cy, r + 1, trim); dotc(x, cx, cy, r, shade(c, -0.35));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; dotc(x, cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.3, shade(c, 0.25)); }
    dotc(x, cx, cy, r * 0.28, trim);
    for (let i = 0; i < 3; i++) dotc(x, w * (0.35 + i * 0.15), h * 0.72, 0.9, rgba(shade(c, -0.6), 0.9));
    sheen(x, w, h, 0.14);
  };
  s.prism('v', [[0.14, 0.58], [0.86, 0.58], [0.86, 1.8], [0.5, 2.2], [0.14, 1.8]], 0.14, 0.32, wood, { decal: { front: back, back: (x, w, h) => sheen(x, w, h, 0.12) } });
  for (const u of [0.04, 0.84]) {
    s.box(u, 0.12, 0.12, u + 0.12, 0.34, 1.95, wood, { decal: { front: (x, w, h) => { fr(x, w / 2 - 0.5, 4, 1, h - 8, rgba(trim, 0.6)); } } });
    s.cyl('z', u + 0.06, 0.23, 0.08, 0, 1.95, 2.32, wood, { seg: 4 });
    s.ball(u + 0.06, 0.23, 1.95, 0.05, trim);
  }
  for (const u of [0.08, 0.8]) {
    s.box(u, 0.34, 0.58, u + 0.12, 0.9, 0.94, wood, { decal: { right: panel, left: panel } });
    s.ball(u + 0.06, 0.92, 0.97, 0.06, trim);
  }
}

// ---------- Mesa de banquete ----------
function castillo_mesa(s) {
  s.shadowRect(0.04, 0.08, 1.96, 0.94, 0.24);
  for (const u of [0.22, 1.66]) {
    s.box(u - 0.04, 0.14, 0, u + 0.16, 0.86, 0.1, DOAK);
    s.box(u, 0.22, 0.1, u + 0.12, 0.78, 0.78, OAK, { decal: { front: (x, w, h) => { fr(x, 1, h * 0.3, w - 2, 1.4, IRON); fr(x, 1, h * 0.7, w - 2, 1.4, IRON); sheen(x, w, h, 0.1); }, right: (x, w, h) => { x.fillStyle = rgba('#000', 0.35); gothicArch(x, w * 0.3, h * 0.2, w * 0.4, h * 0.6); x.fill(); } } });
  }
  s.box(0.34, 0.46, 0.3, 1.66, 0.54, 0.38, OAK);
  s.box(0.02, 0.06, 0.78, 1.98, 0.94, 0.9, OAK, {
    decal: {
      top: (x, w, h) => {
        planks(x, w, h, OAK, 4);
        for (const a of [0.12, 0.88]) { fr(x, w * a - 2, 0, 4, h, IRON); for (let j = 0; j < 4; j++) dotc(x, w * a, h * (0.12 + j * 0.25), 0.8, '#77737f'); }
      },
      front: (x, w, h) => { sheen(x, w, h, 0.12); fr(x, w * 0.12 - 2, 0, 4, h, IRON); fr(x, w * 0.88 - 2, 0, 4, h, IRON); },
    },
  });
}

// ---------- Candelabro ----------
function castillo_candelabro(s, { st, t }) {
  const on = st === 1;
  s.shadowEllipse(0.5, 0.5, 0.26, 0.26, 0.24);
  if (on) s.under((ctx) => floorGlow(ctx, s, 0.5, 0.5, 1.3, FIRE, 0.26));
  s.cyl('z', 0.5, 0.5, 0.24, 0.16, 0, 0.08, IRON, { seg: 6 });
  s.cyl('z', 0.5, 0.5, 0.03, 0.03, 0.08, 1.46, IRON, { seg: 8 });
  for (const z of [0.5, 1.0]) s.ball(0.5, 0.5, z, 0.06, IRON);
  s.box(0.18, 0.47, 1.4, 0.82, 0.53, 1.45, IRON);
  const cups = [[0.2, 1.45, 0.24], [0.5, 1.45, 0.34], [0.8, 1.45, 0.24]];
  for (const [u, z, hgt] of cups) {
    s.cyl('z', u, 0.5, 0.07, 0.08, z, z + 0.05, GOLD, { seg: 10 });
    s.cyl('z', u, 0.5, 0.04, 0.04, z + 0.05, z + 0.05 + hgt, '#f1e9d6', { seg: 10, faces: { top: '#e6dcc4' } });
  }
  s.custom([0.1, 0.4, 1.7, 0.9, 0.6, 2.05], (ctx) => {
    cups.forEach(([u, z, hgt], i) => {
      const [x, y] = s.P(u, 0.5, z + 0.05 + hgt);
      line(ctx, x, y, x, y - 2, '#2a2420', 0.8);
      ctx.fillStyle = rgba('#d8ccb0', 0.9); ctx.fillRect(x + 1.2, y + 1, 1.2, 3 + i);
      if (on) flame(ctx, x, y - 1.5, 2.4, t / 150 + i * 1.7);
    });
  });
}

// ---------- Gárgola ----------
function castillo_gargola(s, { st, t }) {
  const on = st === 1, mirror = s.rot === 6;
  s.shadowRect(0.12, 0.12, 0.88, 0.88, 0.26);
  const blocks = (x, w, h) => {
    for (let j = 0; j < 3; j++) { const y = (h * j) / 3; line(x, 0, y, w, y, rgba('#000', 0.25), 0.7); for (let i = 0; i < 2; i++) { const xx = (w * (i + (j % 2) * 0.5)) / 2; line(x, xx, y, xx, y + h / 3, rgba('#000', 0.25), 0.7); } }
    sheen(x, w, h, 0.12);
  };
  s.box(0.12, 0.12, 0, 0.88, 0.88, 0.12, DSTONE);
  s.box(0.18, 0.18, 0.12, 0.82, 0.82, 0.62, STONE, { decal: { front: blocks, right: blocks, left: blocks, back: blocks } });
  s.box(0.14, 0.14, 0.62, 0.86, 0.86, 0.7, DSTONE, { decal: { top: (x, w, h) => sheen(x, w, h, 0.15) } });
  s.custom([0.15, 0.15, 0.7, 0.85, 0.85, 1.75], (ctx) => {
    const [px, py] = s.P(0.5, 0.5, 0.7);
    ctx.save(); ctx.translate(px, py + 2); if (mirror) ctx.scale(-1, 1);
    const st0 = '#9a97a4', dk = '#6c6878', ol = '#2b2833';
    const shape = (fn, col) => { fn(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke(); };
    // alas
    shape(() => { ctx.beginPath(); ctx.moveTo(2, -16); ctx.lineTo(10, -40); ctx.lineTo(12, -31); ctx.lineTo(19, -37); ctx.lineTo(17, -26); ctx.lineTo(23, -27); ctx.lineTo(15, -14); ctx.lineTo(8, -9); ctx.closePath(); }, dk);
    shape(() => { ctx.beginPath(); ctx.moveTo(-1, -17); ctx.lineTo(1, -37); ctx.lineTo(5, -29); ctx.lineTo(8, -14); ctx.closePath(); }, shade(dk, -0.1));
    // cola
    ctx.strokeStyle = ol; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, -3); ctx.quadraticCurveTo(18, -1, 16, -9); ctx.stroke();
    ctx.strokeStyle = st0; ctx.lineWidth = 1.6; ctx.stroke();
    shape(() => { ctx.beginPath(); ctx.moveTo(16, -9); ctx.lineTo(13, -12); ctx.lineTo(18, -12); ctx.closePath(); }, st0);
    // cuerpo agazapado
    shape(() => { ctx.beginPath(); ctx.ellipse(3, -11, 9, 10, 0.2, 0, TAU); }, st0);
    shape(() => { ctx.beginPath(); ctx.ellipse(6, -4, 7, 5, 0, 0, TAU); }, shade(st0, -0.08));
    // brazos y garras
    shape(() => { ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(-8, -3); ctx.lineTo(-4, -2); ctx.lineTo(0, -11); ctx.closePath(); }, st0);
    shape(() => { ctx.beginPath(); ctx.ellipse(-7, -1.5, 4, 2, 0, 0, TAU); }, shade(st0, -0.05));
    for (const d of [-10, -8, -6]) line(ctx, d, -1, d - 1, 1.2, ol, 0.8);
    // cabeza con cuernos
    shape(() => { ctx.beginPath(); ctx.moveTo(-3, -27); ctx.quadraticCurveTo(0, -34, 4, -33); ctx.quadraticCurveTo(0, -31, -1, -26); ctx.closePath(); }, '#d9d4c6');
    shape(() => { ctx.beginPath(); ctx.arc(-4, -22, 6.2, 0, TAU); }, st0);
    shape(() => { ctx.beginPath(); ctx.moveTo(-8, -24); ctx.lineTo(-14, -20); ctx.lineTo(-13, -17); ctx.lineTo(-7, -17); ctx.closePath(); }, st0);
    shape(() => { ctx.beginPath(); ctx.moveTo(1, -25); ctx.lineTo(6, -29); ctx.lineTo(3, -21); ctx.closePath(); }, dk);
    line(ctx, -13, -18, -8, -18.5, ol, 0.7);
    fr(ctx, -12, -18, 1, 1.4, '#ffffff'); fr(ctx, -10, -18, 1, 1.4, '#ffffff');
    line(ctx, -9, -24.8, -5, -23.4, ol, 1.1);
    if (on) { const k = 0.75 + 0.25 * Math.sin(t / 160); glow(ctx, -7, -22, 9, '#ff2a2a', 0.55 * k); dotc(ctx, -7, -22.4, 1.5, '#ff5a3a'); dotc(ctx, -7, -22.4, 0.6, '#fff0b0'); }
    else dotc(ctx, -7, -22.4, 1.2, '#2b2833');
    ctx.fillStyle = rgba('#ffffff', 0.22); ctx.beginPath(); ctx.ellipse(0, -15, 3, 5, 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  });
}

// ---------- Armadura ----------
function castillo_armadura(s) {
  const st = STEEL, dk = shade(STEEL, -0.35);
  s.shadowRect(0.22, 0.24, 0.92, 0.8, 0.24);
  s.box(0.24, 0.28, 0, 0.76, 0.74, 0.08, OAK, { decal: { front: (x, w, h) => sheen(x, w, h, 0.15) } });
  for (const u of [0.36, 0.54]) {
    s.box(u, 0.42, 0.08, u + 0.1, 0.64, 0.17, dk);
    s.box(u + 0.01, 0.45, 0.17, u + 0.09, 0.56, 0.8, st, { decal: { front: (x, w, h) => { fr(x, 0, h * 0.42, w, 1.2, dk); sheen(x, w, h, 0.2); } } });
    s.ball(u + 0.05, 0.53, 0.5, 0.055, st);
  }
  s.box(0.33, 0.42, 0.8, 0.67, 0.6, 0.96, dk, { decal: { front: (x, w, h) => { for (let i = 1; i < 4; i++) fr(x, (w * i) / 4, 0, 0.8, h, rgba('#000', 0.3)); } } });
  s.cyl('z', 0.5, 0.51, 0.15, 0.2, 0.96, 1.46, st, { seg: 16 });
  s.box(0.44, 0.71, 1.0, 0.56, 0.735, 1.38, '#8a1428', { decal: { front: (x, w, h) => { fr(x, 0, 2, w, 1, GOLD); dotc(x, w / 2, h * 0.4, 1.4, GOLD); } } });
  for (const u of [0.25, 0.68]) {
    s.box(u, 0.46, 1.0, u + 0.07, 0.56, 1.36, st);
    s.box(u - 0.005, 0.5, 0.94, u + 0.075, 0.62, 1.02, dk);
  }
  s.ball(0.27, 0.51, 1.45, 0.1, st);
  s.ball(0.73, 0.51, 1.45, 0.1, st);
  s.cyl('z', 0.5, 0.51, 0.1, 0.09, 1.46, 1.54, dk, { seg: 14 });
  s.cyl('z', 0.5, 0.51, 0.12, 0.12, 1.54, 1.82, st, { seg: 16, faces: { top: shade(st, 0.1) } });
  s.box(0.42, 0.63, 1.66, 0.58, 0.65, 1.7, '#141418');
  s.box(0.47, 0.63, 1.58, 0.53, 0.645, 1.66, '#141418');
  s.ball(0.5, 0.51, 1.84, 0.1, st);
  s.box(0.48, 0.4, 1.86, 0.52, 0.56, 2.02, '#c0233a');
  s.cyl('z', 0.84, 0.62, 0.02, 0.02, 0.08, 2.0, OAK, { seg: 8 });
  s.cyl('z', 0.84, 0.62, 0.04, 0, 1.98, 2.16, st, { seg: 6 });
  s.box(0.84, 0.6, 1.72, 0.96, 0.64, 1.92, st);
}

// ---------- Cofre ----------
function castillo_cofre(s, { st }) {
  const open = st === 1;
  s.shadowRect(0.16, 0.24, 0.84, 0.78, 0.26);
  const bands = (x, w, h) => {
    planks(x, w, h, OAK, 3);
    for (const a of [0.15, 0.85]) fr(x, w * a - 1.5, 0, 3, h, IRON);
    fr(x, 0, 0, w, 1.4, IRON); fr(x, 0, h - 1.4, w, 1.4, IRON);
  };
  for (const u of [0.18, 0.76]) for (const v of [0.28, 0.66]) s.box(u, v, 0, u + 0.06, v + 0.06, 0.05, IRON);
  s.box(0.18, 0.28, 0.05, 0.82, 0.72, 0.4, OAK, {
    decal: { front: (x, w, h) => { bands(x, w, h); if (!open) { fr(x, w / 2 - 3, 0, 6, 7, GOLD); dotc(x, w / 2, 3.5, 1, '#3a2a10'); } }, right: bands, left: bands, back: bands },
  });
  const arc = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; arc.push([0.5 + 0.22 * Math.cos(a), 0.4 + 0.15 * Math.sin(a)]); }
  if (!open) {
    s.prism('u', arc, 0.18, 0.82, OAK, {
      decal: Object.fromEntries(arc.slice(0, -1).map((_, i) => ['e' + i, (x, w, h) => { fr(x, w * 0.15 - 1.5, 0, 3, h, IRON); fr(x, w * 0.85 - 1.5, 0, 3, h, IRON); sheen(x, w, h, 0.1); }]).concat([['left', (x, w, h) => fr(x, 0, h - 1.4, w, 1.4, IRON)], ['right', (x, w, h) => fr(x, 0, h - 1.4, w, 1.4, IRON)]])),
    });
  } else {
    s.box(0.2, 0.3, 0.4, 0.8, 0.7, 0.44, '#c99a2a', { decal: { top: (x, w, h) => { for (let i = 0; i < 18; i++) dotc(x, ((i * 37) % 100) / 100 * w, ((i * 53) % 100) / 100 * h, 2, i % 5 ? '#f2c94c' : '#fff1a8'); } } });
    s.box(0.18, 0.18, 0.4, 0.82, 0.28, 0.84, OAK, { decal: { front: (x, w, h) => { fr(x, 2, 2, w - 4, h - 4, '#6b1a24'); sheen(x, w, h, 0.12); }, back: bands } });
    s.custom([0.25, 0.32, 0.44, 0.75, 0.68, 0.7], (ctx) => {
      const [x, y] = s.P(0.5, 0.5, 0.44);
      glow(ctx, x, y - 4, 26, '#ffd75e', 0.4);
      for (const [dx, dy, r] of [[-8, -2, 3], [-3, -5, 3.2], [3, -3, 3], [8, -1, 2.8], [0, -8, 3], [-5, 0, 2.6], [5, 1, 2.6]]) { dotc(ctx, x + dx, y + dy, r, '#b8860b'); dotc(ctx, x + dx - 0.5, y + dy - 0.6, r * 0.75, '#f2c94c'); }
      for (const [dx, dy, col] of [[-2, -10, '#e0245e'], [6, -6, '#3a86ff'], [-8, -6, '#2fb67c']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + dx, y + dy - 2.5); ctx.lineTo(x + dx + 2, y + dy); ctx.lineTo(x + dx, y + dy + 2.5); ctx.lineTo(x + dx - 2, y + dy); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; for (const [dx, dy] of [[-3, -12], [9, -9]]) { ctx.beginPath(); ctx.moveTo(x + dx, y + dy - 3); ctx.lineTo(x + dx + 0.8, y + dy); ctx.lineTo(x + dx, y + dy + 3); ctx.lineTo(x + dx - 0.8, y + dy); ctx.fill(); }
    });
  }
}

// ---------- Alfombra real ----------
function castillo_alfombra(s, { c }) {
  const fringe = (x, w, h) => { for (let i = 1; i < w; i += 1.6) fr(x, i, 0, 0.7, h, GOLD); };
  s.box(0.12, 0.03, 0, 0.88, 0.12, 0.01, GOLD, { outline: false, edges: false, decal: { top: fringe } });
  s.box(0.12, 2.88, 0, 0.88, 2.97, 0.01, GOLD, { outline: false, edges: false, decal: { top: fringe } });
  s.box(0.08, 0.12, 0, 0.92, 2.88, 0.025, c, {
    outline: shade(c, -0.6),
    decal: {
      top: (x, w, h) => {
        fr(x, 2, 2, w - 4, h - 4, GOLD); fr(x, 3.6, 3.6, w - 7.2, h - 7.2, shade(c, -0.3)); fr(x, 5, 5, w - 10, h - 10, c);
        x.strokeStyle = rgba(GOLD, 0.8); x.lineWidth = 0.7;
        for (let i = 0; i < 5; i++) {
          const cy = h * (0.12 + i * 0.19), cx = w / 2;
          if (i === 2) {
            // emblema: corona
            x.fillStyle = GOLD; x.beginPath(); x.moveTo(cx - 7, cy + 4); x.lineTo(cx - 7, cy - 3); x.lineTo(cx - 3.5, cy); x.lineTo(cx, cy - 5); x.lineTo(cx + 3.5, cy); x.lineTo(cx + 7, cy - 3); x.lineTo(cx + 7, cy + 4); x.closePath(); x.fill();
            dotc(x, cx, cy - 5.5, 1.2, '#ffffff'); fr(x, cx - 7, cy + 4.5, 14, 1.6, shade(GOLD, -0.3));
          } else {
            x.beginPath(); x.moveTo(cx, cy - 6); x.lineTo(cx + 5, cy); x.lineTo(cx, cy + 6); x.lineTo(cx - 5, cy); x.closePath(); x.stroke();
            dotc(x, cx, cy, 1.4, GOLD);
          }
        }
        for (let i = 0; i < 16; i++) dotc(x, 7.5 + (i % 2) * (w - 15), 9 + Math.floor(i / 2) * ((h - 18) / 7), 0.8, rgba(GOLD, 0.8));
      },
    },
  });
}

// ---------- Vitral (pared) ----------
function castillo_vitral(ctx) {
  const x = 5, y = -66, w = 22, h = 52;
  ctx.fillStyle = 'rgba(16,10,28,0.28)'; gothicArch(ctx, x - 1, y + 1, w + 6, h + 3); ctx.fill();
  ctx.fillStyle = STONE; gothicArch(ctx, x - 3, y - 3, w + 6, h + 5); ctx.fill();
  ctx.strokeStyle = '#3a3742'; ctx.lineWidth = 0.8; ctx.stroke();
  for (let j = 0; j < 5; j++) line(ctx, x - 3, y + 14 + j * 9, x, y + 14 + j * 9, rgba('#000', 0.3), 0.6);
  gothicArch(ctx, x, y, w, h); ctx.fillStyle = '#1a1622'; ctx.fill();
  ctx.save(); gothicArch(ctx, x, y, w, h); ctx.clip();
  const cols = ['#e0245e', '#f2c94c', '#3a86ff', '#8e5cf7', '#2fb67c', '#ff7a3d'];
  const cell = 5.5;
  for (let j = 0; j < 10; j++) for (let i = 0; i < 4; i++) {
    const col = cols[(i * 3 + j * 2 + (i * j) % 3) % cols.length];
    fr(ctx, x + i * cell + 0.6, y + 18 + j * cell + 0.6, cell - 1.2, cell - 1.2, mix(col, '#ffffff', 0.12));
  }
  const cx = x + w / 2, cy = y + 11, r = 8;
  dotc(ctx, cx, cy, r, '#1a1622');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    ctx.fillStyle = cols[k % cols.length]; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r - 0.8, a + 0.06, a + TAU / 8 - 0.06); ctx.closePath(); ctx.fill();
  }
  dotc(ctx, cx, cy, 2.4, '#f2c94c');
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, rgba('#ffffff', 0.3)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', 0.15));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = '#3a3742'; ctx.lineWidth = 1; gothicArch(ctx, x, y, w, h); ctx.stroke();
  fr(ctx, x - 4, y + h + 1, w + 8, 3, '#a8a5b2'); fr(ctx, x - 4, y + h + 4, w + 8, 1, '#5f5b6a');
}

// ---------- Antorcha (pared) ----------
function castillo_antorcha(ctx, { st, now }) {
  const on = st === 1, x = 16;
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; ctx.fillRect(x - 4, -27, 9, 13);
  fr(ctx, x - 5, -28, 10, 13, IRON); fr(ctx, x - 5, -28, 10, 1, '#5a5764');
  dotc(ctx, x, -24, 1, '#77737f'); dotc(ctx, x, -18, 1, '#77737f');
  ctx.save(); ctx.translate(x, -22); ctx.rotate(-0.22);
  fr(ctx, -2, -20, 4, 24, OAK); fr(ctx, -2, -20, 1.2, 24, shade(OAK, 0.25));
  fr(ctx, -3, -2, 6, 3, IRON);
  fr(ctx, -3.2, -26, 6.4, 7, on ? '#4a2a14' : '#231812');
  ctx.strokeStyle = IRON; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3.6, -26); ctx.lineTo(-3.6, -19); ctx.moveTo(3.6, -26); ctx.lineTo(3.6, -19); ctx.stroke();
  if (on) flame(ctx, 0, -26, 3.8, (now || 0) / 1000);
  else { ctx.strokeStyle = rgba('#9a97a4', 0.45); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -27); ctx.quadraticCurveTo(3, -31, 0, -35); ctx.quadraticCurveTo(-3, -38, 0, -42); ctx.stroke(); }
  ctx.restore();
}

export default {
  floor: { castillo_trono, castillo_mesa, castillo_candelabro, castillo_gargola, castillo_armadura, castillo_cofre, castillo_alfombra },
  wall: { castillo_vitral, castillo_antorcha },
  period: { castillo_candelabro: (st) => (st === 1 ? 150 : 0), castillo_gargola: (st) => (st === 1 ? 200 : 0) },
  defaultColor: { castillo_mesa: OAK, castillo_candelabro: IRON, castillo_gargola: STONE, castillo_armadura: STEEL, castillo_cofre: OAK, castillo_vitral: STONE, castillo_antorcha: IRON },
};
