// Dibujo de la línea "Cocina". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
import { shade, mix, rgba, rng, lum } from '../iso.js';

const TAU = Math.PI * 2;
const STEEL = '#c3c9d1', DSTEEL = '#5d636e', MARBLE = '#ecebe6', BLACKTOP = '#1f2026', WOOD = '#b5794a', DWOOD = '#6b4128';
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
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
// Vapor que sube (animado)
const steam = (ctx, x, y, t, n = 3, hgt = 18) => {
  for (let i = 0; i < n; i++) {
    const ph = ((t / 1400 + i / n) % 1);
    ctx.strokeStyle = rgba('#ffffff', 0.55 * (1 - ph)); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    const xx = x + (i - (n - 1) / 2) * 3.5, yy = y - ph * hgt;
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.bezierCurveTo(xx + 3, yy - 3, xx - 3, yy - 6, xx, yy - 9); ctx.stroke();
  }
};
const handleH = (x, cx, y, w, c = DSTEEL) => { fr(x, cx - w / 2, y, w, 1.4, c); fr(x, cx - w / 2, y, w, 0.5, rgba('#ffffff', 0.5)); };
const handleV = (x, X, cy, h, c = DSTEEL) => { fr(x, X, cy - h / 2, 1.4, h, c); fr(x, X, cy - h / 2, 0.5, h, rgba('#ffffff', 0.5)); };
const panelLine = (c) => rgba(lum(c) > 0.6 ? '#000000' : '#000000', lum(c) > 0.6 ? 0.22 : 0.4);
const marbleTop = (x, w, h) => {
  const r = rng(9); x.strokeStyle = rgba('#9a958a', 0.3); x.lineWidth = 0.6;
  for (let i = 0; i < 4; i++) { const a = r() * w; x.beginPath(); x.moveTo(a, 0); x.quadraticCurveTo(a + 6, h / 2, a - 3 + r() * 8, h); x.stroke(); }
  sheen(x, w, h, 0.22);
};

// Mueble bajo de cocina (zoclo + cuerpo + cubierta). front: decal del frente
function baseCabinet(s, c, front, top = MARBLE, topDecal = marbleTop) {
  s.shadowRect(0.02, 0.04, 0.98, 0.98, 0.22);
  s.box(0.06, 0.1, 0, 0.94, 0.86, 0.08, '#26272e', { outline: false });
  s.box(0.02, 0.06, 0.08, 0.98, 0.92, 0.92, c, { decal: { front, right: (x, w, h) => sheen(x, w, h, 0.1), left: (x, w, h) => sheen(x, w, h, 0.1) } });
  s.box(0, 0.02, 0.92, 1, 0.98, 1, top, { decal: { top: topDecal, front: (x, w, h) => fr(x, 0, h - 0.8, w, 0.8, rgba('#000', 0.15)) } });
}
const doorsFront = (c) => (x, w, h) => {
  const pl = panelLine(c);
  x.strokeStyle = pl; x.lineWidth = 0.8;
  x.strokeRect(1.5, 1.5, w - 3, h * 0.22); handleH(x, w / 2, 1.5 + h * 0.11 - 0.7, 8);
  x.strokeRect(1.5, h * 0.26 + 1.5, w / 2 - 2.2, h * 0.74 - 3); x.strokeRect(w / 2 + 0.7, h * 0.26 + 1.5, w / 2 - 2.2, h * 0.74 - 3);
  handleV(x, w / 2 - 3.5, h * 0.42, 6); handleV(x, w / 2 + 2.1, h * 0.42, 6);
  sheen(x, w, h, 0.12);
};

// ---------- Piso ----------
function cocina_counter(s, { c }) {
  baseCabinet(s, c, doorsFront(c));
  // tabla de picar con jitomate
  s.box(0.2, 0.3, 1, 0.62, 0.66, 1.03, '#d39a62', { decal: { top: (x, w, h) => { sheen(x, w, h, 0.2); fr(x, w - 4, h / 2 - 0.6, 2.5, 1.2, DWOOD); } } });
  s.ball(0.36, 0.48, 1.07, 0.05, '#e5452f');
  s.ball(0.48, 0.42, 1.06, 0.04, '#e5452f');
}

function cocina_stove(s, { c, st, t }) {
  const on = st === 1, dark = lum(c) < 0.3;
  const front = (x, w, h) => {
    fr(x, 0, 0, w, h * 0.2, dark ? '#3a3c47' : shade(c, -0.08));
    for (let i = 0; i < 4; i++) { const kx = w * (0.18 + i * 0.21); dotc(x, kx, h * 0.1, 2.2, '#1f2026'); dotc(x, kx, h * 0.1, 1.5, STEEL); line(x, kx, h * 0.1, kx + (on && i % 2 === 0 ? 1.5 : 0), h * 0.1 - 1.5, '#1f2026', 0.6); }
    handleH(x, w / 2, h * 0.27, w * 0.7, STEEL);
    const gx = 4, gy = h * 0.34, gw = w - 8, gh = h * 0.5;
    fr(x, gx - 1, gy - 1, gw + 2, gh + 2, panelLine(c));
    const g = x.createLinearGradient(0, gy, 0, gy + gh);
    if (on) { g.addColorStop(0, '#2a1208'); g.addColorStop(1, '#ff8a2b'); } else { g.addColorStop(0, '#1a1b20'); g.addColorStop(1, '#2c2e36'); }
    x.fillStyle = g; x.fillRect(gx, gy, gw, gh);
    if (on) { line(x, gx + 3, gy + gh - 4, gx + gw - 3, gy + gh - 4, '#ffd27a', 0.8); glow(x, w / 2, gy + gh * 0.7, gw * 0.6, '#ffb347', 0.5); }
    x.fillStyle = rgba('#ffffff', 0.12); x.beginPath(); x.moveTo(gx + gw * 0.55, gy); x.lineTo(gx + gw * 0.72, gy); x.lineTo(gx + gw * 0.45, gy + gh); x.lineTo(gx + gw * 0.28, gy + gh); x.fill();
    sheen(x, w, h, 0.12);
  };
  const cooktop = (x, w, h) => {
    const burner = (bx, by, r, lit) => {
      dotc(x, bx, by, r + 1.2, '#0f1014');
      x.strokeStyle = '#4a4d58'; x.lineWidth = 0.8;
      for (const a of [0, Math.PI / 2]) { x.beginPath(); x.moveTo(bx - Math.cos(a) * (r + 1), by - Math.sin(a) * (r + 1)); x.lineTo(bx + Math.cos(a) * (r + 1), by + Math.sin(a) * (r + 1)); x.stroke(); }
      if (lit) {
        const f = (Math.sin(t / 90 + bx) + 1) / 2;
        glow(x, bx, by, r * 1.8, '#4aa8ff', 0.7);
        x.strokeStyle = mix('#3a7bff', '#9fd4ff', f); x.lineWidth = 1.4; x.beginPath(); x.arc(bx, by, r * 0.62, 0, TAU); x.stroke();
      } else { x.strokeStyle = '#2c2e36'; x.lineWidth = 1.2; x.beginPath(); x.arc(bx, by, r * 0.62, 0, TAU); x.stroke(); }
      dotc(x, bx, by, 1, '#2c2e36');
    };
    fr(x, 0, 0, w, h, BLACKTOP);
    burner(w * 0.28, h * 0.3, 6, on); burner(w * 0.72, h * 0.3, 5, false); burner(w * 0.28, h * 0.72, 5, false); burner(w * 0.72, h * 0.72, 6, on);
    sheen(x, w, h, 0.18);
  };
  s.shadowRect(0.02, 0.04, 0.98, 0.98, 0.22);
  s.box(0.06, 0.1, 0, 0.94, 0.86, 0.06, '#26272e', { outline: false });
  s.box(0.02, 0.06, 0.06, 0.98, 0.92, 0.92, c, { decal: { front, right: (x, w, h) => sheen(x, w, h, 0.12), left: (x, w, h) => sheen(x, w, h, 0.12) } });
  s.box(0, 0.02, 0.92, 1, 0.98, 1, BLACKTOP, { decal: { top: cooktop } });
  // panel trasero con reloj
  s.box(0.02, 0.02, 1, 0.98, 0.1, 1.22, c, { decal: { front: (x, w, h) => { fr(x, w / 2 - 6, 2, 12, h - 4, '#14151a'); x.fillStyle = on ? '#47ff9a' : '#2f3a33'; for (let i = 0; i < 4; i++) x.fillRect(w / 2 - 4.6 + i * 2.5 + (i > 1 ? 0.6 : 0), 3.5, 1.6, h - 7); sheen(x, w, h, 0.15); } } });
  // olla
  s.cyl('z', 0.72, 0.72, 0.17, 0.17, 1.0, 1.24, STEEL, { seg: 18, faces: { top: on ? '#e9d7b0' : '#9aa0aa' } });
  s.box(0.88, 0.69, 1.18, 0.98, 0.75, 1.21, '#26272e');
  s.box(0.46, 0.69, 1.18, 0.56, 0.75, 1.21, '#26272e');
  if (on) s.over((ctx) => { const [x, y] = s.P(0.72, 0.72, 1.24); steam(ctx, x, y - 2, t, 3, 20); });
}

function cocina_sink(s, { c, st, t }) {
  const on = st === 1;
  const basin = (x, w, h) => {
    marbleTop(x, w, h);
    const bx = w * 0.18, by = h * 0.28, bw = w * 0.64, bh = h * 0.56;
    fr(x, bx - 1.5, by - 1.5, bw + 3, bh + 3, '#9aa2ad');
    const g = x.createLinearGradient(bx, by, bx + bw, by + bh);
    g.addColorStop(0, '#7d8590'); g.addColorStop(1, '#c9cfd7');
    x.fillStyle = g; x.fillRect(bx, by, bw, bh);
    if (on) { x.fillStyle = rgba('#8fd3ef', 0.55); x.fillRect(bx + 1.5, by + bh * 0.4, bw - 3, bh * 0.6 - 1.5); for (let i = 0; i < 2; i++) { const ph = ((t / 700 + i / 2) % 1); x.strokeStyle = rgba('#ffffff', 0.7 * (1 - ph)); x.lineWidth = 0.7; x.beginPath(); x.ellipse(bx + bw / 2, by + bh * 0.62, 2 + ph * 7, 1 + ph * 3.5, 0, 0, TAU); x.stroke(); } }
    dotc(x, bx + bw / 2, by + bh * 0.62, 1.3, '#4a4f5a');
    // esponja
    fr(x, w * 0.84, h * 0.6, 3.5, 5, '#f2d23a'); fr(x, w * 0.84, h * 0.6, 3.5, 1.6, '#3fae5a');
  };
  baseCabinet(s, c, doorsFront(c), MARBLE, basin);
  // llave cuello de ganso
  s.cyl('z', 0.5, 0.18, 0.05, 0.05, 1, 1.04, STEEL, { seg: 12 });
  s.cyl('z', 0.5, 0.18, 0.025, 0.025, 1.04, 1.36, STEEL, { seg: 10 });
  s.prism('v', [[0.475, 1.33], [0.525, 1.33], [0.525, 1.38], [0.475, 1.38]], 0.16, 0.38, STEEL);
  s.cyl('z', 0.5, 0.36, 0.022, 0.022, 1.26, 1.34, STEEL, { seg: 10 });
  for (const u of [0.36, 0.64]) s.box(u - 0.03, 0.15, 1, u + 0.03, 0.21, 1.08, STEEL);
  if (on) s.custom([0.47, 0.34, 1.0, 0.53, 0.4, 1.27], (ctx) => {
    const [x0, y0] = s.P(0.5, 0.37, 1.26), [, y1] = s.P(0.5, 0.37, 1.0);
    ctx.fillStyle = rgba('#bfe9ff', 0.8); ctx.fillRect(x0 - 0.9, y0, 1.8, y1 - y0);
    for (let i = 0; i < 3; i++) { const k = ((t / 300 + i / 3) % 1); dotc(ctx, x0, y0 + (y1 - y0) * k, 0.7, '#ffffff'); }
  });
}

function cocina_pantry(s, { c, st }) {
  const open = st === 1, pl = panelLine(c);
  s.shadowRect(0.04, 0.06, 0.96, 0.96, 0.24);
  const closed = (x, w, h) => {
    x.strokeStyle = pl; x.lineWidth = 0.8;
    const half = w / 2;
    for (const dx of [0, half]) {
      // puertas de arriba con vidrio
      x.strokeRect(dx + 1.5, 2, half - 2.5, h * 0.52);
      fr(x, dx + 4, 5, half - 8, h * 0.52 - 6, '#c7dbe0');
      fr(x, dx + 4, 5 + (h * 0.52 - 6) / 2, half - 8, 0.8, pl);
      for (let i = 0; i < 2; i++) { fr(x, dx + 6 + i * 6, 5 + (h * 0.52 - 6) / 2 - 7, 4, 7, ['#d9a62b', '#c0392b', '#7a8f3a', '#e8e3d8'][(i + (dx ? 2 : 0)) % 4]); fr(x, dx + 6 + i * 6, h * 0.52 - 8, 4, 6, ['#e8e3d8', '#d9a62b'][i]); }
      x.fillStyle = rgba('#ffffff', 0.3); x.fillRect(dx + 5, 6, 1.5, h * 0.5 - 8);
      // puertas de abajo
      x.strokeRect(dx + 1.5, h * 0.56, half - 2.5, h * 0.42);
    }
    handleV(x, half - 3, h * 0.48, 6); handleV(x, half + 1.6, h * 0.48, 6);
    handleV(x, half - 3, h * 0.62, 6); handleV(x, half + 1.6, h * 0.62, 6);
    sheen(x, w, h, 0.12);
  };
  const inside = (x, w, h) => {
    fr(x, 1.5, 1.5, w - 3, h - 3, shade(c, -0.25));
    fr(x, 2.5, 2.5, w - 5, h - 5, '#efe4cc');
    const shelves = 5, r = rng(5);
    for (let i = 1; i <= shelves; i++) {
      const y = 2.5 + ((h - 5) * i) / (shelves + 0.3);
      fr(x, 2.5, y, w - 5, 1.4, shade('#efe4cc', -0.25));
      let px = 4;
      while (px < w - 7) {
        const kind = Math.floor(r() * 4), pw = 3 + r() * 3, ph = 4 + r() * 5;
        if (kind === 0) { fr(x, px, y - ph, pw, ph, ['#c0392b', '#2f6fb0', '#e8a33d'][Math.floor(r() * 3)]); fr(x, px + 0.6, y - ph * 0.6, pw - 1.2, ph * 0.3, '#fff6df'); }
        else if (kind === 1) { fr(x, px, y - ph + 1.5, pw, ph - 1.5, rgba('#d8eef2', 0.9)); fr(x, px + 0.4, y - ph * 0.55, pw - 0.8, ph * 0.55 - 0.3, ['#d9a62b', '#7a4a20', '#e5452f', '#f3ead6'][Math.floor(r() * 4)]); fr(x, px - 0.2, y - ph, pw + 0.4, 1.6, '#c0392b'); }
        else if (kind === 2) { fr(x, px, y - 4, pw, 4, '#b9c0c9'); fr(x, px, y - 3, pw, 1.5, ['#2fb67c', '#e8772e', '#3a86ff'][Math.floor(r() * 3)]); }
        else { dotc(x, px + 2, y - 2, 2, ['#f2d23a', '#e5452f', '#7fd36b'][Math.floor(r() * 3)]); }
        px += pw + 1;
      }
    }
  };
  s.box(0.04, 0.08, 0, 0.96, 0.92, 2.2, c, { decal: { front: open ? inside : closed, right: (x, w, h) => sheen(x, w, h, 0.12), left: (x, w, h) => sheen(x, w, h, 0.12) } });
  s.box(0.0, 0.04, 2.2, 1.0, 0.96, 2.3, shade(c, -0.06), { decal: { front: (x, w, h) => fr(x, 0, h - 1.2, w, 1.2, rgba('#000', 0.2)), top: (x, w, h) => sheen(x, w, h, 0.15) } });
  if (open) {
    const door = (x, w, h) => { x.strokeStyle = pl; x.lineWidth = 0.8; x.strokeRect(1.5, 2, w - 3, h - 4); fr(x, 3, 4, w - 6, h * 0.5, rgba('#c7dbe0', 0.9)); sheen(x, w, h, 0.15); };
    s.box(0.04, 0.92, 0.04, 0.09, 1.36, 2.12, c, { decal: { right: door, left: door } });
    s.box(0.91, 0.92, 0.04, 0.96, 1.36, 2.12, c, { decal: { right: door, left: door } });
  }
}

function cocina_coffee(s, { c, st, t }) {
  const on = st === 1;
  s.shadowRect(0.26, 0.28, 0.76, 0.76, 0.24);
  s.box(0.28, 0.3, 0, 0.72, 0.74, 0.07, c, { decal: { front: (x, w, h) => dotc(x, w * 0.82, h / 2, 1, on ? '#ff3b3b' : '#552222') } });
  s.box(0.3, 0.3, 0.07, 0.7, 0.46, 0.46, c, { decal: { front: (x, w, h) => { sheen(x, w, h, 0.15); }, right: (x, w, h) => sheen(x, w, h, 0.15) } });
  s.box(0.3, 0.3, 0.46, 0.7, 0.68, 0.55, shade(c, 0.06), { decal: { top: (x, w, h) => { fr(x, 2, 2, w - 4, h - 4, shade(c, -0.2)); sheen(x, w, h, 0.2); }, front: (x, w, h) => fr(x, w / 2 - 3, h - 1.5, 6, 1, '#14151a') } });
  // jarra de vidrio
  s.custom([0.38, 0.48, 0.07, 0.62, 0.72, 0.38], (ctx) => {
    const [cx, yb] = s.P(0.5, 0.6, 0.08), yt = s.P(0.5, 0.6, 0.36)[1];
    const r = 0.1 * 45;
    const body = () => { ctx.beginPath(); ctx.moveTo(cx - r * 0.7, yt); ctx.lineTo(cx + r * 0.7, yt); ctx.quadraticCurveTo(cx + r * 1.15, yt + (yb - yt) * 0.4, cx + r, yb); ctx.ellipse(cx, yb, r, r * 0.5, 0, 0, Math.PI); ctx.closePath(); };
    body(); ctx.fillStyle = rgba('#d8eef5', 0.45); ctx.fill();
    ctx.save(); body(); ctx.clip();
    const lvl = yb - (yb - yt) * (on ? 0.35 + 0.15 * ((t / 4000) % 1) : 0.45);
    ctx.fillStyle = '#4a2a14'; ctx.fillRect(cx - r * 1.2, lvl, r * 2.4, yb - lvl + r);
    ctx.fillStyle = '#6b3d1e'; ctx.fillRect(cx - r * 1.2, lvl, r * 2.4, 1);
    ctx.restore();
    body(); ctx.strokeStyle = rgba('#1b2a33', 0.7); ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.55); ctx.fillRect(cx - r * 0.55, yt + 2, 0.9, (yb - yt) - 4);
    // asa
    ctx.strokeStyle = '#1f2026'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx + r * 0.8, yt + 2); ctx.quadraticCurveTo(cx + r * 1.9, yt + (yb - yt) * 0.45, cx + r * 0.98, yb - 3); ctx.stroke();
    fr(ctx, cx - r * 0.75, yt - 1.2, r * 1.5, 1.6, '#1f2026');
    if (on) { const k = (t / 260) % 1; dotc(ctx, cx, yt + 1 + k * 4, 0.8, '#4a2a14'); }
  });
  if (on) s.over((ctx) => { const [x, y] = s.P(0.5, 0.6, 0.62); steam(ctx, x, y, t, 2, 12); });
}

function cocina_table(s, { c }) {
  s.shadowRect(0.04, 0.04, 0.96, 0.96, 0.22);
  for (const [u, v] of [[0.12, 0.12], [0.8, 0.12], [0.12, 0.8], [0.8, 0.8]]) s.box(u, v, 0, u + 0.08, v + 0.08, 0.62, DWOOD);
  const gingham = (x, w, h, sz = 4) => {
    fr(x, 0, 0, w, h, '#ffffff');
    x.fillStyle = rgba(c, 0.5);
    for (let i = 0; i < w; i += sz * 2) x.fillRect(i, 0, sz, h);
    for (let j = 0; j < h; j += sz * 2) x.fillRect(0, j, w, sz);
  };
  const skirt = (x, w, h) => { gingham(x, w, h, 3); fr(x, 0, h - 1, w, 1, shade(c, -0.2)); };
  s.box(0.03, 0.03, 0.56, 0.97, 0.97, 0.86, '#ffffff', { flat: true, outline: shade(c, -0.55), decal: { front: skirt, right: skirt, left: skirt, back: skirt } });
  s.box(0.02, 0.02, 0.86, 0.98, 0.98, 0.9, '#ffffff', {
    flat: true, outline: shade(c, -0.55),
    decal: {
      top: (x, w, h) => { gingham(x, w, h, 4); sheen(x, w, h, 0.12); },
      front: (x, w, h) => gingham(x, w, h, 3), right: (x, w, h) => gingham(x, w, h, 3), left: (x, w, h) => gingham(x, w, h, 3), back: (x, w, h) => gingham(x, w, h, 3),
    },
  });
}

function cocina_floor(s, { c }) {
  s.box(0.01, 0.01, 0, 0.99, 0.99, 0.02, c, {
    outline: shade(c, -0.45),
    decal: {
      top: (x, w, h) => {
        fr(x, 0, 0, w, h, '#f1efe9');
        fr(x, 0, 0, w / 2, h / 2, c); fr(x, w / 2, h / 2, w / 2, h / 2, c);
        x.strokeStyle = rgba('#000000', 0.15); x.lineWidth = 0.6; x.strokeRect(0.5, 0.5, w - 1, h - 1);
        line(x, w / 2, 0, w / 2, h, rgba('#000000', 0.12), 0.5); line(x, 0, h / 2, w, h / 2, rgba('#000000', 0.12), 0.5);
        const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, rgba('#ffffff', 0.22)); g.addColorStop(0.5, rgba('#ffffff', 0.02)); g.addColorStop(1, rgba('#000000', 0.06));
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      },
    },
  });
}

// ---------- Pared ----------
function cocina_spices(ctx) {
  const y = -24;
  const jars = [['#c0392b', 'CH'], ['#e8a33d', 'CU'], ['#7a8f3a', 'OR'], ['#7a4a20', 'CA'], ['#f2d23a', 'AJ']];
  jars.forEach(([col], i) => {
    const x = 4.5 + i * 5;
    fr(ctx, x, y - 10, 4, 10, rgba('#dff1f5', 0.85));
    fr(ctx, x + 0.4, y - 6.5, 3.2, 6.1, col);
    fr(ctx, x - 0.2, y - 12, 4.4, 2.2, i % 2 ? '#2b2d38' : '#c9ced6');
    fr(ctx, x + 0.5, y - 5, 3, 2.4, '#fff6df');
    fr(ctx, x + 0.6, y - 9.4, 0.7, 8.6, rgba('#ffffff', 0.55));
    ctx.strokeStyle = rgba('#1b2a33', 0.5); ctx.lineWidth = 0.5; ctx.strokeRect(x, y - 10, 4, 10);
  });
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; ctx.fillRect(3.5, y + 3.5, 27, 3);
  fr(ctx, 2, y, 28, 3.5, WOOD); fr(ctx, 2, y, 28, 1, shade(WOOD, 0.25)); fr(ctx, 2, y + 2.5, 28, 1, DWOOD);
  // barandal
  fr(ctx, 2, y - 6, 28, 0.9, DWOOD);
  for (const bx of [2, 29]) fr(ctx, bx, y - 6.5, 1.2, 7, DWOOD);
  for (const bx of [6, 26]) { ctx.fillStyle = DWOOD; ctx.beginPath(); ctx.moveTo(bx - 1, y + 3.5); ctx.lineTo(bx + 1, y + 3.5); ctx.lineTo(bx + 1, y + 8); ctx.closePath(); ctx.fill(); }
}

function cocina_utensils(ctx) {
  const y = -54;
  ctx.fillStyle = 'rgba(16,10,28,0.22)'; ctx.fillRect(3, y + 2, 28, 2);
  // sartén de cobre
  const px = 22, py = y + 20;
  ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, y + 2); ctx.lineTo(px, py - 7); ctx.stroke();
  dotc(ctx, px + 0.8, py + 1, 7.5, 'rgba(16,10,28,0.22)');
  dotc(ctx, px, py, 7.5, '#a8582c'); dotc(ctx, px, py, 6, '#d27a44'); dotc(ctx, px - 2, py - 2, 2, rgba('#ffffff', 0.35));
  // cucharón
  const lx = 7;
  line(ctx, lx, y + 2, lx, y + 20, STEEL, 1.4); line(ctx, lx - 0.5, y + 2, lx - 0.5, y + 20, rgba('#ffffff', 0.5), 0.4);
  ctx.fillStyle = STEEL; ctx.beginPath(); ctx.arc(lx, y + 22, 3.2, 0, Math.PI); ctx.lineTo(lx - 3.2, y + 20); ctx.lineTo(lx + 3.2, y + 20); ctx.fill();
  ctx.strokeStyle = DSTEEL; ctx.lineWidth = 0.5; ctx.stroke();
  // espátula
  const sx = 12;
  line(ctx, sx, y + 2, sx, y + 16, '#2b2d38', 1.4);
  fr(ctx, sx - 2.2, y + 16, 4.4, 6, '#c0392b'); for (let i = 0; i < 2; i++) fr(ctx, sx - 1 + i * 1.6, y + 17, 0.6, 4, '#7d1f17');
  // batidor
  const wx = 16.5;
  line(ctx, wx, y + 2, wx, y + 11, '#b5794a', 1.6);
  ctx.strokeStyle = STEEL; ctx.lineWidth = 0.6;
  for (const k of [-2, 0, 2]) { ctx.beginPath(); ctx.moveTo(wx, y + 11); ctx.quadraticCurveTo(wx + k * 1.6, y + 18, wx, y + 21); ctx.stroke(); }
  // barra
  fr(ctx, 3, y - 0.5, 27, 2, STEEL); fr(ctx, 3, y - 0.5, 27, 0.6, '#ffffff');
  for (const bx of [3, 29]) dotc(ctx, bx, y + 0.5, 1.6, DSTEEL);
  for (const hx of [7, 12, 16.5, 22]) { ctx.strokeStyle = DSTEEL; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(hx, y + 2.6, 1.2, Math.PI * 1.1, Math.PI * 2.2); ctx.stroke(); }
}

export default {
  floor: { cocina_counter, cocina_stove, cocina_sink, cocina_pantry, cocina_coffee, cocina_table, cocina_floor },
  wall: { cocina_spices, cocina_utensils },
  period: { cocina_stove: (st) => (st === 1 ? 140 : 0), cocina_sink: (st) => (st === 1 ? 100 : 0), cocina_coffee: (st) => (st === 1 ? 160 : 0) },
  defaultColor: { cocina_spices: WOOD, cocina_utensils: STEEL },
};
