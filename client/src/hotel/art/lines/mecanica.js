// Dibujo de la línea "Mecánica y Wired". Mismo formato que art/floor.js y art/wall.js:
//   floor: { id: (s: Scene, { c, st, t, def }) => void }
//   wall:  { id: (ctx, { c, st, def, now }) => void }
//   period: { id: (st) => ms de animación o 0 }
//   defaultColor: { id: '#hex' }
// Estados: rueda 0 quieta · 1–10 resultado · 11 girando · amor 0 nada · 1 midiendo · 2–102 = % + 2 ·
// marcador 0–99 = puntos · máquinas 1 = despachando · puerta 1 = abierta · wired 1 = se disparó.
import { PINK, YELLOW, shade, mix, rgba, lum, outlineOf } from '../iso.js';
import { drawWord, wordWidth, hexLogo, rr } from '../glyphs.js';

const TAU = Math.PI * 2;
const STEEL = '#3a3f4a', RUBBER = '#1e1f25', CHROME = '#d6dbe2', DARK = '#1d1d24', CYAN = '#47d7ff', GREEN = '#2fb67c';
const SEG = ['#FE3377', '#FFCC00', '#3a86ff', '#2fb67c', '#ff7a3d', '#8e5cf7', '#FE3377', '#FFCC00', '#3a86ff', '#2fb67c'];

const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const line = (ctx, x0, y0, x1, y1, c, w = 1) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
const glow = (ctx, x, y, r, color, a = 0.35) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.45, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
const sheen = (ctx, w, h, a = 0.14) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba('#ffffff', a)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#000000', a * 0.4));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
};
const text = (ctx, s, x, y, size, color, weight = 800, align = 'center') => {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(s, x, y);
};
const hazard = (ctx, w, h, a = 1) => {
  fr(ctx, 0, 0, w, h, rgba(YELLOW, a));
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.fillStyle = rgba('#141414', 0.85 * a);
  for (let x = -h; x < w + h; x += 6) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 3, h); ctx.lineTo(x + 3 + h, 0); ctx.lineTo(x + h, 0); ctx.closePath(); ctx.fill(); }
  ctx.restore();
};
function heart(ctx, x, y, r, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.25, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.25, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
}
// Dígito de 7 segmentos (x, y = esquina superior izquierda)
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digit(ctx, d, x, y, w, h, on, off) {
  const t = Math.max(1, w * 0.2), m = h / 2;
  const seg = {
    a: [x + t * 0.6, y, w - t * 1.2, t], d: [x + t * 0.6, y + h - t, w - t * 1.2, t], g: [x + t * 0.6, y + m - t / 2, w - t * 1.2, t],
    f: [x, y + t * 0.6, t, m - t * 0.9], b: [x + w - t, y + t * 0.6, t, m - t * 0.9],
    e: [x, y + m + t * 0.3, t, m - t * 0.9], c: [x + w - t, y + m + t * 0.3, t, m - t * 0.9],
  };
  const lit = SEGS[d] || '';
  for (const k of 'abcdefg') { const [a, b, c, e] = seg[k]; fr(ctx, a, b, c, e, lit.includes(k) ? on : off); }
}

// ---------- Rodillo ----------
// La banda corre hacia el frente (+v del modelo = hacia donde mira el rodillo)
function mecanica_roller(s, { c, t }) {
  const off = ((t / 1000) * 32) % 8; // 1 casilla por segundo
  s.shadowRect(0.02, 0.02, 0.98, 0.98, 0.2);
  // Rieles laterales con franjas de precaución
  const rail = (x, w, h) => { hazard(x, w, h * 0.42, 0.95); fr(x, 0, h * 0.42, w, 0.8, rgba('#000000', 0.35)); sheen(x, w, h, 0.12); };
  const railTop = (x, w, h) => { fr(x, 0, 0, w, h, shade(c, 0.12)); for (let y = 2; y < h; y += 5) dotc(x, w / 2, y, 0.7, rgba('#000000', 0.35)); };
  s.box(0.02, 0.02, 0, 0.14, 0.98, 0.35, c, { decal: { left: rail, right: rail, top: railTop, front: (x, w, h) => sheen(x, w, h, 0.15) } });
  s.box(0.86, 0.02, 0, 0.98, 0.98, 0.35, c, { decal: { left: rail, right: rail, top: railTop, front: (x, w, h) => sheen(x, w, h, 0.15) } });
  // Banda de goma con flechas que avanzan
  const belt = (x, w, h) => {
    fr(x, 0, 0, w, h, RUBBER);
    for (let y = -8 + off; y < h + 8; y += 8) {
      x.strokeStyle = rgba(YELLOW, 0.9); x.lineWidth = 1.6; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(w * 0.24, y); x.lineTo(w * 0.5, y + 3.2); x.lineTo(w * 0.76, y); x.stroke();
    }
    for (let y = off % 4; y < h; y += 4) fr(x, 0, y, w, 0.5, rgba('#ffffff', 0.06));
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, rgba('#000000', 0.35)); g.addColorStop(0.2, rgba('#000000', 0)); g.addColorStop(0.8, rgba('#000000', 0)); g.addColorStop(1, rgba('#000000', 0.35));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  };
  s.box(0.14, 0.06, 0.12, 0.86, 0.94, 0.3, RUBBER, { decal: { top: belt, front: (x, w, h) => { fr(x, 0, 0, w, h, '#2a2b33'); for (let i = 0; i < w; i += 3) fr(x, i + (off % 3), 0, 1, h, rgba('#ffffff', 0.12)); } }, outline: '#0d0d10' });
  // Tambores en los extremos
  s.cyl('u', 0.06, 0.2, 0.09, 0.09, 0.14, 0.86, CHROME, { seg: 12, faces: { left: '#8b909c', right: '#8b909c' } });
  s.cyl('u', 0.94, 0.2, 0.09, 0.09, 0.14, 0.86, CHROME, { seg: 12, faces: { left: '#8b909c', right: '#8b909c' } });
}

// ---------- Puerta de un sentido ----------
// Se entra por el frente (+v) y se sale por atrás (−v): la flecha del piso apunta hacia adentro
function mecanica_oneway(s, { c, st }) {
  const open = st === 1, lit = open ? GREEN : PINK;
  s.shadowRect(0.0, 0.08, 1.0, 0.92, 0.22);
  const plate = (x, w, h) => {
    fr(x, 0, 0, w, h, '#2a2c34');
    for (let i = 0; i < w; i += 4) fr(x, i, 0, 0.6, h, rgba('#ffffff', 0.05));
    // flecha hacia atrás (hacia −v = arriba en la calcomanía)
    x.fillStyle = rgba(lit, open ? 0.95 : 0.75);
    x.beginPath(); x.moveTo(w / 2, h * 0.14); x.lineTo(w * 0.8, h * 0.46); x.lineTo(w * 0.62, h * 0.46); x.lineTo(w * 0.62, h * 0.86);
    x.lineTo(w * 0.38, h * 0.86); x.lineTo(w * 0.38, h * 0.46); x.lineTo(w * 0.2, h * 0.46); x.closePath(); x.fill();
    if (open) glow(x, w / 2, h / 2, w * 0.5, GREEN, 0.35);
  };
  s.box(0.0, 0.0, 0, 1.0, 1.0, 0.05, '#2a2c34', { decal: { top: plate }, outline: '#101014' });
  const post = (x, w, h) => {
    for (let k = 0; k < 4; k++) fr(x, w / 2 - 0.8, 8 + k * (h - 16) / 3, 1.6, 4, open ? rgba(GREEN, 0.9) : rgba(lit, 0.5 + 0.1 * k));
    sheen(x, w, h, 0.16);
  };
  s.box(0.02, 0.36, 0.05, 0.16, 0.64, 2.08, c, { decal: { front: post, right: post, left: post } });
  s.box(0.84, 0.36, 0.05, 0.98, 0.64, 2.08, c, { decal: { front: post, left: post, right: post } });
  // Travesaño con letrero de flecha
  const sign = (x, w, h) => {
    fr(x, 1.5, 1.2, w - 3, h - 2.4, '#101015');
    const cx = w / 2, cy = h / 2;
    x.fillStyle = lit;
    x.beginPath(); x.moveTo(cx - 5, cy - 2); x.lineTo(cx + 1, cy - 2); x.lineTo(cx + 1, cy - 4.5); x.lineTo(cx + 6, cy); x.lineTo(cx + 1, cy + 4.5); x.lineTo(cx + 1, cy + 2); x.lineTo(cx - 5, cy + 2); x.closePath(); x.fill();
    glow(x, cx, cy, 10, lit, 0.4);
  };
  s.box(0.0, 0.34, 2.08, 1.0, 0.66, 2.32, shade(c, -0.1), { decal: { front: (x, w, h) => { fr(x, 2, 1.5, w - 4, h - 3, '#101015'); text(x, open ? 'PASA' : 'SOLO ENTRADA', w / 2, h / 2, open ? 5 : 3.6, lit); }, left: sign, right: sign, top: (x, w, h) => sheen(x, w, h, 0.18) } });
  // Hoja de vidrio: cerrada a lo ancho; abierta, girada hacia atrás
  const glass = (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, rgba('#dff3ff', 0.55)); g.addColorStop(1, rgba('#9ccfe8', 0.35));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    fr(x, 0, h * 0.45, w, 1.4, rgba(lit, 0.85));
    x.fillStyle = rgba('#ffffff', 0.4); x.beginPath(); x.moveTo(w * 0.1, 0); x.lineTo(w * 0.3, 0); x.lineTo(w * 0.05, h); x.lineTo(0, h); x.fill();
  };
  if (!open) s.box(0.16, 0.48, 0.25, 0.84, 0.52, 1.7, '#bfe3f5', { decal: { front: glass, back: glass }, outline: rgba('#1b3a4a', 0.8), k: 0.05 });
  else s.box(0.16, 0.0, 0.25, 0.2, 0.48, 1.7, '#bfe3f5', { decal: { left: glass, right: glass }, outline: rgba('#1b3a4a', 0.8), k: 0.05 });
}

// ---------- Expendedora de refrescos ----------
function mecanica_vending_soda(s, { c, st, t }) {
  const on = st === 1, trim = lum(c) < 0.15 ? PINK : '#ffffff';
  s.shadowRect(0.06, 0.1, 0.96, 0.96, 0.26);
  const front = (x, w, h) => {
    // panel iluminado con botella gigante
    const X = 3, Y = 9, W = w * 0.6, H = h * 0.62;
    const g = x.createLinearGradient(0, Y, 0, Y + H);
    g.addColorStop(0, mix(c, '#ffffff', 0.55)); g.addColorStop(1, mix(c, '#ffffff', 0.15));
    x.fillStyle = g; x.fillRect(X, Y, W, H);
    // botella
    const bx = X + W / 2, by = Y + 5;
    x.fillStyle = rgba('#3b0d12', 0.85);
    x.beginPath(); x.moveTo(bx - 1.6, by); x.lineTo(bx + 1.6, by); x.lineTo(bx + 1.8, by + 7); x.quadraticCurveTo(bx + 5.5, by + 10, bx + 5, by + 16);
    x.lineTo(bx + 5, H + Y - 4); x.lineTo(bx - 5, H + Y - 4); x.lineTo(bx - 5, by + 16); x.quadraticCurveTo(bx - 5.5, by + 10, bx - 1.8, by + 7); x.closePath(); x.fill();
    fr(x, bx - 5, by + 20, 10, 6, trim); fr(x, bx - 5, by + 22.2, 10, 1.4, c);
    fr(x, bx - 3.6, by + 9, 1.2, 9, rgba('#ffffff', 0.5));
    // burbujas
    for (let i = 0; i < 6; i++) { const ph = ((t / 1400 + i / 6) % 1); dotc(x, X + 3 + ((i * 7) % (W - 6)), Y + H - ph * H, 0.6 + (i % 2) * 0.4, rgba('#ffffff', 0.85 * (1 - ph))); }
    x.fillStyle = rgba('#ffffff', 0.22); x.beginPath(); x.moveTo(X + W * 0.62, Y); x.lineTo(X + W * 0.82, Y); x.lineTo(X + W * 0.38, Y + H); x.lineTo(X + W * 0.18, Y + H); x.fill();
    x.strokeStyle = shade(c, -0.5); x.lineWidth = 1; x.strokeRect(X, Y, W, H);
    // botonera y monedero
    const kx = X + W + 3, kw = w - kx - 3;
    fr(x, kx, Y, kw, H * 0.7, shade(c, -0.45));
    for (let i = 0; i < 4; i++) { fr(x, kx + 1.5, Y + 2 + i * 5, kw - 3, 3.2, on && i === 1 ? YELLOW : mix(c, '#ffffff', 0.35)); fr(x, kx + 1.5, Y + 2 + i * 5, kw - 3, 0.8, rgba('#ffffff', 0.4)); }
    fr(x, kx + kw / 2 - 1, Y + H * 0.78, 2, 5, '#141418');
    // salida: aparece la lata al despachar
    fr(x, 4, h - 13, w - 8, 8, '#141418'); fr(x, 4, h - 13, w - 8, 1.5, rgba('#ffffff', 0.15));
    if (on) { fr(x, w / 2 - 3, h - 11.5, 6, 6, trim); fr(x, w / 2 - 3, h - 9.5, 6, 1.6, c); }
    // letrero SODA
    const ww = wordWidth('SODA', 4.4);
    fr(x, 2, 2, w - 4, 5.5, shade(c, -0.35));
    drawWord(x, 'SODA', (w - ww) / 2, 2.6, 4.4, trim, 1.1);
    sheen(x, w, h, 0.14);
  };
  const side = (x, w, h) => {
    x.fillStyle = rgba(trim, 0.9);
    x.beginPath(); x.moveTo(0, h * 0.55); x.bezierCurveTo(w * 0.3, h * 0.42, w * 0.7, h * 0.66, w, h * 0.5); x.lineTo(w, h * 0.6); x.bezierCurveTo(w * 0.7, h * 0.76, w * 0.3, h * 0.52, 0, h * 0.65); x.closePath(); x.fill();
    hexLogo(x, w / 2, h * 0.25, 5, { inner: false });
    sheen(x, w, h, 0.16);
  };
  s.box(0.08, 0.12, 0, 0.92, 0.9, 2.04, c, { decal: { front, left: side, right: side, top: (x, w, h) => sheen(x, w, h, 0.22) } });
  s.over((ctx) => { if (!s.faceVisible(0, 1, 0)) return; const [x, y] = s.P(0.4, 0.9, 1.3); glow(ctx, x, y, on ? 44 : 30, mix(c, '#ffffff', 0.5), on ? 0.32 : 0.16); });
}

// ---------- Máquina de café ----------
function mecanica_vending_coffee(s, { c, st, t }) {
  const on = st === 1, wood = lum(c) > 0.85 ? '#7a4a2b' : '#c58b52';
  s.shadowRect(0.08, 0.12, 0.94, 0.94, 0.26);
  const front = (x, w, h) => {
    // pantalla y menú
    fr(x, 3, 3, w - 6, h * 0.22, '#0f1418');
    text(x, on ? 'SIRVIENDO…' : 'CAFÉ', w / 2, 3 + h * 0.11, on ? 4 : 5.2, on ? YELLOW : '#ffb86b');
    glow(x, w / 2, 3 + h * 0.11, w * 0.4, '#ffb86b', 0.25);
    for (let i = 0; i < 3; i++) { fr(x, 4 + i * ((w - 8) / 3), h * 0.29, (w - 8) / 3 - 1.5, 4, ['#7a4a2b', '#c58b52', '#efe3cf'][i]); }
    // nicho con taza
    const nx = w * 0.22, ny = h * 0.4, nw = w * 0.56, nh = h * 0.34;
    fr(x, nx, ny, nw, nh, '#121216');
    const g = x.createLinearGradient(0, ny, 0, ny + nh); g.addColorStop(0, rgba('#ffb86b', on ? 0.35 : 0.12)); g.addColorStop(1, rgba('#000', 0));
    x.fillStyle = g; x.fillRect(nx, ny, nw, nh);
    fr(x, w / 2 - 2, ny, 4, 3, CHROME);
    if (on) fr(x, w / 2 - 0.6, ny + 3, 1.2, nh - 9, '#5a3218');
    fr(x, w / 2 - 4.5, ny + nh - 7, 9, 6, '#f4f4f6'); fr(x, w / 2 + 4.5, ny + nh - 6, 2, 3, '#f4f4f6');
    fr(x, w / 2 - 4.5, ny + nh - 7, 9, 1.2, '#5a3218');
    fr(x, nx, ny + nh - 1, nw, 1.5, '#8b909c');
    // panel de madera abajo
    fr(x, 3, h * 0.8, w - 6, h * 0.16, wood);
    for (let i = 0; i < 3; i++) line(x, 3, h * 0.83 + i * 2, w - 3, h * 0.83 + i * 2 + 0.4, rgba('#000', 0.18), 0.5);
    sheen(x, w, h, 0.14);
  };
  s.box(0.12, 0.16, 0, 0.88, 0.88, 1.86, c, { decal: { front, left: (x, w, h) => { fr(x, 0, h * 0.8, w, h * 0.16, wood); sheen(x, w, h, 0.14); }, right: (x, w, h) => { fr(x, 0, h * 0.8, w, h * 0.16, wood); sheen(x, w, h, 0.1); } } });
  s.box(0.1, 0.14, 1.86, 0.9, 0.9, 1.92, shade(c, -0.25));
  // vapor (siempre un poquito; más al servir)
  s.custom([0.3, 0.4, 1.92, 0.7, 0.8, 2.6], (ctx) => {
    const [x, y] = s.P(0.5, 0.6, 1.95);
    for (let i = 0; i < (on ? 4 : 2); i++) {
      const ph = ((t / 1800 + i / 4) % 1);
      ctx.strokeStyle = rgba('#ffffff', (on ? 0.55 : 0.3) * (1 - ph)); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) { const yy = y - ph * 18 - k * 1.5, xx = x - 4 + i * 3 + Math.sin(k * 0.8 + ph * 6 + i) * 2; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
  });
}

// ---------- Carrito de helados (2×1) ----------
function mecanica_icecream(s, { c, st, t }) {
  const on = st === 1, body = '#f7f4ee', trim = shade(c, -0.25);
  s.shadowRect(0.05, 0.12, 1.95, 0.92, 0.24);
  // ruedas
  for (const u of [0.35, 1.65]) s.cyl('v', u, 0.15, 0.15, 0.15, 0.82, 0.9, '#2b2d38', { seg: 14, faces: { front: '#8b909c' } });
  const cab = (x, w, h) => {
    fr(x, 0, 0, w, 3, c);
    for (let i = 0; i < w; i += 6) { x.fillStyle = i % 12 ? rgba(c, 0.7) : rgba('#ffffff', 0.7); x.beginPath(); x.arc(i + 3, 3, 3, 0, Math.PI); x.fill(); }
    // letrero con conito
    rr(x, w * 0.3, h * 0.32, w * 0.4, h * 0.42, 3); x.fillStyle = '#ffffff'; x.fill(); x.strokeStyle = trim; x.lineWidth = 0.8; x.stroke();
    text(x, 'HELADOS', w * 0.5, h * 0.53, 4.6, trim);
    for (const [k, col] of [[0.12, PINK], [0.2, '#9fe3ff'], [0.8, '#fff1a8'], [0.88, '#b98a5e']]) dotc(x, w * k, h * 0.55, 2.2, col);
    fr(x, 0, h - 2, w, 2, trim);
    sheen(x, w, h, 0.12);
  };
  s.box(0.06, 0.18, 0.16, 1.94, 0.86, 0.95, body, { decal: { front: cab, left: (x, w, h) => { fr(x, 0, 0, w, 3, c); sheen(x, w, h, 0.12); }, right: (x, w, h) => { fr(x, 0, 0, w, 3, c); sheen(x, w, h, 0.1); } } });
  // congelador con tapa de vidrio y sabores
  const freezer = (x, w, h) => {
    fr(x, 0, 0, w, h, '#c9ced6');
    const flav = [PINK, '#9fe3ff', '#fff1a8', '#b98a5e', '#c8f0b0', '#f4f4f6'];
    for (let i = 0; i < 6; i++) { const cx = (w / 6) * (i + 0.5); dotc(x, cx, h * 0.5, Math.min(w / 14, h * 0.32), flav[i]); dotc(x, cx - 1, h * 0.4, 0.9, rgba('#ffffff', 0.7)); }
    x.fillStyle = rgba('#ffffff', 0.25); x.fillRect(0, 0, w, h * 0.3);
  };
  s.box(0.12, 0.24, 0.95, 1.88, 0.8, 1.02, CHROME, { decal: { top: freezer } });
  // poste y sombrilla de rayas
  s.cyl('z', 1.0, 0.5, 0.025, 0.025, 1.02, 2.0, '#8b909c', { seg: 8 });
  s.custom([0.0, 0.0, 1.9, 2.0, 1.0, 2.6], (ctx) => {
    const [x, y] = s.P(1.0, 0.5, 2.05), R = 40;
    for (let k = 0; k < 8; k++) {
      const a0 = Math.PI + (k / 8) * Math.PI, a1 = Math.PI + ((k + 1) / 8) * Math.PI;
      ctx.fillStyle = k % 2 ? '#ffffff' : c;
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + Math.cos(a0) * R, y + Math.sin(a0) * R * 0.32 + 4); ctx.lineTo(x + Math.cos(a1) * R, y + Math.sin(a1) * R * 0.32 + 4); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = outlineOf(c); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - R, y + 4); for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; ctx.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R * 0.32 + 4 + (k % 2 ? 2 : 0)); } ctx.stroke();
    dotc(ctx, x, y - 15, 2, trim);
  });
  if (on) s.over((ctx) => { const [x, y] = s.P(1.0, 0.86, 0.95); const b = Math.sin(t / 120) * 1.5; ctx.fillStyle = '#e0a458'; ctx.beginPath(); ctx.moveTo(x - 3, y - 14 + b); ctx.lineTo(x + 3, y - 14 + b); ctx.lineTo(x, y - 6 + b); ctx.closePath(); ctx.fill(); dotc(ctx, x, y - 16 + b, 3.4, PINK); glow(ctx, x, y - 14, 14, PINK, 0.3); });
}

// ---------- Máquina de palomitas ----------
function mecanica_popcorn(s, { c, st, t }) {
  const on = st === 1;
  s.shadowRect(0.16, 0.16, 0.86, 0.86, 0.24);
  for (const [u, v] of [[0.24, 0.24], [0.76, 0.24], [0.24, 0.76], [0.76, 0.76]]) s.cyl('z', u, v, 0.03, 0.03, 0, 0.6, '#2b2d38', { seg: 8 });
  s.box(0.18, 0.18, 0.6, 0.82, 0.82, 0.86, c, { decal: { front: (x, w, h) => { fr(x, 0, 1, w, 1.4, YELLOW); text(x, 'POP!', w / 2, h * 0.58, 5.2, YELLOW); sheen(x, w, h, 0.14); }, right: (x, w, h) => { fr(x, 0, 1, w, 1.4, YELLOW); sheen(x, w, h, 0.1); } } });
  // vitrina con palomitas
  const pop = (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba('#fff8d8', 0.35)); g.addColorStop(1, rgba('#fff8d8', 0.6)); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const px = (i * 37) % w, py = h * 0.48 + ((i * 53) % (h * 0.5)); dotc(x, px, py, 1.6, i % 4 ? '#fff6dc' : '#f3d27a'); }
    fr(x, 0, 0, w, 1, rgba('#ffffff', 0.6));
    x.fillStyle = rgba('#ffffff', 0.35); x.beginPath(); x.moveTo(w * 0.1, 0); x.lineTo(w * 0.25, 0); x.lineTo(w * 0.08, h); x.lineTo(0, h); x.fill();
  };
  s.box(0.2, 0.2, 0.86, 0.8, 0.8, 1.6, '#fff6dc', { decal: { front: pop, left: pop, right: pop, back: pop }, outline: rgba('#7a1f2b', 0.8), k: 0.06 });
  // olla y techo amarillo
  s.custom([0.2, 0.2, 0.86, 0.8, 0.8, 1.6], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 1.45);
    ctx.fillStyle = '#8b909c'; ctx.beginPath(); ctx.ellipse(x, y, 6, 3, 0, 0, TAU); ctx.fill();
    if (on) for (let i = 0; i < 6; i++) { const ph = ((t / 700 + i / 6) % 1); dotc(ctx, x - 8 + ((i * 5) % 16), y - 2 - Math.sin(ph * Math.PI) * 9, 1.4, '#fff6dc'); }
  });
  s.prism('u', [[0.16, 1.6], [0.84, 1.6], [0.5, 1.82]], 0.14, 0.86, YELLOW, { faces: { e2: shade(YELLOW, -0.1), e1: shade(YELLOW, 0.05) } });
  s.ball(0.5, 0.5, 1.86, 0.05, c);
}

// ---------- Cubeta de rosas ----------
function mecanica_roses(s, { c, st, t }) {
  s.shadowEllipse(0.5, 0.5, 0.3, 0.3, 0.22);
  s.cyl('z', 0.5, 0.5, 0.2, 0.25, 0, 0.42, '#b9c0c9', { seg: 18, faces: { top: '#3d6b2c' } });
  s.custom([0.2, 0.2, 0.42, 0.8, 0.8, 0.95], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.42);
    const sway = st === 1 ? Math.sin(t / 140) * 1.5 : 0;
    const R = [[-7, -16], [-2, -22], [4, -18], [8, -13], [0, -12], [-5, -10], [6, -24]];
    for (const [dx, dy] of R) line(ctx, x + dx * 0.4, y - 2, x + dx + sway, y + dy, '#2f6b2a', 1);
    for (const [dx, dy] of R) {
      const rx = x + dx + sway, ry = y + dy;
      dotc(ctx, rx, ry, 3, shade(c, -0.25)); dotc(ctx, rx - 0.5, ry - 0.6, 2.2, c); dotc(ctx, rx - 0.8, ry - 1, 0.8, rgba('#ffffff', 0.5));
      ctx.strokeStyle = shade(c, -0.45); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(rx, ry, 1.4, 0, Math.PI * 1.4); ctx.stroke();
    }
    for (const [dx, dy] of [[-6, -6], [5, -7], [1, -4]]) { ctx.fillStyle = '#3f8c35'; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 2.6, 1.2, dx * 0.1, 0, TAU); ctx.fill(); }
  });
  s.box(0.32, 0.72, 0.12, 0.68, 0.74, 0.3, '#ffffff', { decal: { front: (x, w, h) => { text(x, 'ROSAS', w / 2, h / 2, 3.6, '#c0392b'); } } });
}

// ---------- Rueda de la fortuna ----------
const WHEEL_SPIN = 11;
function mecanica_wheel(s, { st, t }) {
  const spinning = st === WHEEL_SPIN;
  const n = st >= 1 && st <= 10 ? st : 1;
  const ang = spinning ? (t / 70) % TAU : -((n - 1) / 10) * TAU;
  s.shadowRect(0.12, 0.3, 0.88, 0.74, 0.24);
  s.box(0.12, 0.3, 0, 0.88, 0.72, 0.14, '#2b2d38', { decal: { front: (x, w, h) => { hazard(x, w, h * 0.5, 0.9); }, top: (x, w, h) => sheen(x, w, h, 0.15) } });
  // patas en A
  const N = 32, R = 0.49, cz = 1.66;
  s.prism('v', [[0.12, 0.14], [0.26, 0.14], [0.55, cz], [0.45, cz]], 0.32, 0.4, '#3a3f4a');
  s.prism('v', [[0.74, 0.14], [0.88, 0.14], [0.55, cz], [0.45, cz]], 0.32, 0.4, '#3a3f4a');
  s.box(0.45, 0.4, cz - 0.05, 0.55, 0.46, cz + 0.05, '#8b909c');
  // disco
  const prof = Array.from({ length: N }, (_, k) => { const a = (k / N) * TAU; return [0.5 + Math.cos(a) * R, cz + Math.sin(a) * R]; });
  const face = (x, w, h) => {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
    for (let k = 0; k < 10; k++) {
      const a0 = ang - Math.PI / 2 - Math.PI / 10 + (k / 10) * TAU, a1 = a0 + TAU / 10;
      x.fillStyle = SEG[k]; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r - 1.6, a0, a1); x.closePath(); x.fill();
      x.strokeStyle = rgba('#ffffff', 0.85); x.lineWidth = 0.6; x.stroke();
      const am = (a0 + a1) / 2;
      x.save(); x.translate(cx + Math.cos(am) * r * 0.68, cy + Math.sin(am) * r * 0.68); x.rotate(am + Math.PI / 2);
      text(x, String(k + 1), 0, 0, 5.4, k % 2 ? '#141414' : '#ffffff', 900);
      x.restore();
    }
    // aro con focos
    x.strokeStyle = YELLOW; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r - 0.8, 0, TAU); x.stroke();
    for (let k = 0; k < 20; k++) { const a = (k / 20) * TAU; const litOn = spinning ? (Math.floor(t / 90) + k) % 2 === 0 : true; dotc(x, cx + Math.cos(a) * (r - 0.8), cy + Math.sin(a) * (r - 0.8), 0.9, litOn ? '#ffffff' : '#c9a400'); }
    dotc(x, cx, cy, r * 0.16, '#141414'); hexLogo(x, cx, cy, r * 0.12, { inner: false });
    if (spinning) { x.fillStyle = rgba('#ffffff', 0.12); x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
  };
  s.prism('v', prof, 0.46, 0.56, '#c9a400', { decal: { front: face, back: (x, w, h) => { x.fillStyle = '#3a3f4a'; x.beginPath(); x.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, TAU); x.fill(); hexLogo(x, w / 2, h / 2, w * 0.18, { inner: false }); } }, outline: '#4a3a00' });
  // flecha indicadora arriba
  s.custom([0.42, 0.56, cz + R - 0.06, 0.58, 0.64, cz + R + 0.2], (ctx) => {
    if (!s.faceVisible(0, 1, 0)) return;
    const [x, y] = s.P(0.5, 0.58, cz + R + 0.02);
    ctx.fillStyle = PINK; ctx.strokeStyle = '#141414'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 4.5, y - 7); ctx.lineTo(x + 4.5, y - 7); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    dotc(ctx, x - 1.5, y - 5, 0.9, rgba('#ffffff', 0.7));
  });
  if (spinning) s.over((ctx) => { const [x, y] = s.P(0.5, 0.52, cz); glow(ctx, x, y, 34, YELLOW, 0.18); });
}

// ---------- Medidor de amor (banca para dos) ----------
const LOVE_MEASURING = 1, LOVE_BASE = 2;
function mecanica_love(s, { c, st, t }) {
  const measuring = st === LOVE_MEASURING, pct = st >= LOVE_BASE ? st - LOVE_BASE : null;
  s.shadowRect(0.04, 0.12, 1.96, 0.96, 0.24);
  for (const [u, v] of [[0.12, 0.88], [1.88, 0.88], [0.12, 0.2], [1.88, 0.2]]) s.box(u - 0.05, v - 0.05, 0, u + 0.05, v + 0.05, 0.3, '#2b2d38');
  const cush = (x, w, h) => {
    for (const k of [0, 1]) { rr(x, 1 + (k * w) / 2, 1, w / 2 - 2, h - 2, 3); x.fillStyle = shade(c, 0.08); x.fill(); x.strokeStyle = shade(c, -0.25); x.lineWidth = 0.7; x.stroke(); }
    for (const k of [0.25, 0.75]) heart(x, w * k, h / 2, 2.4, rgba('#ffffff', 0.35));
  };
  s.box(0.04, 0.3, 0.3, 1.96, 0.96, 0.52, c, { decal: { top: cush, front: (x, w, h) => { fr(x, 0, h - 1.5, w, 1.5, rgba('#000', 0.25)); sheen(x, w, h, 0.12); } } });
  const back = (x, w, h) => {
    for (let i = 0; i < 7; i++) heart(x, (w / 7) * (i + 0.5), h * 0.45, 2.6, rgba('#ffffff', i === 3 ? 0 : 0.28));
    sheen(x, w, h, 0.14);
  };
  s.box(0.04, 0.12, 0.3, 1.96, 0.3, 1.02, shade(c, -0.08), { decal: { front: back, back, top: (x, w, h) => sheen(x, w, h, 0.2) } });
  // apoyabrazos
  s.box(0.0, 0.3, 0.3, 0.1, 0.94, 0.72, shade(c, -0.15));
  s.box(1.9, 0.3, 0.3, 2.0, 0.94, 0.72, shade(c, -0.15));
  // pantalla con corazón arriba del respaldo
  const screen = (x, w, h) => {
    fr(x, 0, 0, w, h, '#120a14');
    if (pct != null) { text(x, `${pct}%`, w / 2, h * 0.55, 7, pct >= 70 ? '#ff8fb8' : pct >= 40 ? YELLOW : '#9fe3ff'); glow(x, w / 2, h / 2, w * 0.6, PINK, 0.25); }
    else if (measuring) { const v = Math.floor((t / 60) % 100); text(x, `${v}%`, w / 2, h * 0.55, 7, rgba('#ff8fb8', 0.7)); }
    else { for (let i = 0; i < 3; i++) dotc(x, w * (0.3 + i * 0.2), h / 2, 1.2, rgba(PINK, 0.6)); }
  };
  s.box(0.72, 0.13, 1.02, 1.28, 0.29, 1.4, '#2b2d38', { decal: { front: screen, back: screen } });
  s.custom([0.8, 0.12, 1.4, 1.2, 0.3, 1.95], (ctx) => {
    const [x, y] = s.P(1.0, 0.21, 1.62);
    const beat = measuring ? 1 + 0.18 * Math.abs(Math.sin(t / 120)) : 1;
    if (measuring || (pct != null && pct >= 70)) glow(ctx, x, y, 22 * beat, PINK, 0.4);
    heart(ctx, x, y, 7 * beat, PINK, '#7a0f33');
    heart(ctx, x - 2.4, y - 2.4, 2 * beat, rgba('#ffffff', 0.55));
  });
}

// ---------- Marcador ----------
function mecanica_scoreboard(s, { c, st }) {
  const score = Math.max(0, Math.min(99, st | 0));
  s.shadowRect(0.12, 0.36, 0.88, 0.68, 0.22);
  for (const u of [0.18, 0.82]) s.box(u - 0.04, 0.48, 0, u + 0.04, 0.56, 0.7, '#8b909c');
  s.box(0.1, 0.4, 0, 0.9, 0.64, 0.06, '#2b2d38');
  const board = (x, w, h) => {
    fr(x, 0, 0, w, h, c);
    const sw = wordWidth('SCORE', 3.4);
    drawWord(x, 'SCORE', (w - sw) / 2, 2, 3.4, YELLOW, 0.9);
    fr(x, 2.5, 8, w - 5, h - 11, '#08080b');
    const dw = (w - 12) / 2, dh = h - 16;
    const on = PINK, off = rgba(PINK, 0.12);
    digit(x, Math.floor(score / 10), 4.5, 10, dw - 1.5, dh, on, off);
    digit(x, score % 10, 6 + dw, 10, dw - 1.5, dh, on, off);
    glow(x, w / 2, 10 + dh / 2, w * 0.45, PINK, 0.18);
    sheen(x, w, h, 0.1);
  };
  s.box(0.06, 0.44, 0.7, 0.94, 0.6, 1.66, c, { decal: { front: board, back: (x, w, h) => { hexLogo(x, w / 2, h / 2, 6, { inner: false }); sheen(x, w, h, 0.12); } } });
  s.box(0.04, 0.42, 1.66, 0.96, 0.62, 1.72, shade(c, -0.3));
}

// ---------- Trofeo con dedicatoria ----------
function mecanica_trophy(s, { c }) {
  s.shadowRect(0.22, 0.22, 0.78, 0.78, 0.24);
  const plaque = (x, w, h) => {
    fr(x, 0, 0, w, h, '#2a1d16');
    fr(x, w * 0.14, h * 0.2, w * 0.72, h * 0.6, mix(c, '#ffffff', 0.25));
    x.strokeStyle = shade(c, -0.35); x.lineWidth = 0.6; x.strokeRect(w * 0.14, h * 0.2, w * 0.72, h * 0.6);
    for (let i = 0; i < 3; i++) fr(x, w * 0.24, h * (0.32 + i * 0.14), w * (0.52 - i * 0.12), 0.8, rgba('#000', 0.45));
  };
  s.box(0.22, 0.22, 0, 0.78, 0.78, 0.32, '#3b2a20', { decal: { front: plaque, right: plaque, top: (x, w, h) => sheen(x, w, h, 0.2) } });
  s.box(0.3, 0.3, 0.32, 0.7, 0.7, 0.4, shade(c, -0.25));
  s.cyl('z', 0.5, 0.5, 0.05, 0.05, 0.4, 0.62, c, { seg: 10 });
  s.cyl('z', 0.5, 0.5, 0.1, 0.06, 0.6, 0.66, c, { seg: 14 });
  s.cyl('z', 0.5, 0.5, 0.08, 0.26, 0.66, 1.08, c, { seg: 24, k: 0.04, faces: { top: shade(c, -0.45) } });
  s.custom([0.16, 0.45, 0.7, 0.84, 0.55, 1.05], (ctx) => {
    const [x, y] = s.P(0.5, 0.5, 0.9);
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(x + d * 11.5, y - 1, 4, 5.5, 0, d < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, d < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
      ctx.strokeStyle = outlineOf(c); ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.stroke();
    }
    hexLogo(ctx, x, y - 3, 4.5, { inner: false });
    ctx.fillStyle = rgba('#ffffff', 0.55); ctx.fillRect(x - 6.5, y - 9, 1.4, 9);
  });
  s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 1.15); for (let k = 0; k < 2; k++) { ctx.fillStyle = rgba('#ffffff', 0.9); ctx.beginPath(); const sx = x + (k ? 10 : -9), sy = y - (k ? 6 : 12), r = k ? 2.2 : 3; for (let i = 0; i < 8; i++) { const rr2 = i % 2 ? r * 0.3 : r, an = (i / 8) * TAU - Math.PI / 2; ctx.lineTo(sx + rr2 * Math.cos(an), sy + rr2 * Math.sin(an)); } ctx.closePath(); ctx.fill(); } });
}

// ---------- Wired ----------
const WIRED_ICON = {
  say: (x, cx, cy, col) => { rr(x, cx - 6, cy - 4.5, 12, 8, 2.5); x.fillStyle = col; x.fill(); x.beginPath(); x.moveTo(cx - 3, cy + 3); x.lineTo(cx - 4.5, cy + 6.5); x.lineTo(cx, cy + 3); x.fill(); for (let i = -1; i <= 1; i++) dotc(x, cx + i * 3, cy - 0.5, 0.9, DARK); },
  walk: (x, cx, cy, col) => { for (const [dx, dy, r] of [[-3, 2, 0], [3, -2, 0]]) { x.fillStyle = col; x.beginPath(); x.ellipse(cx + dx, cy + dy, 2, 3.2, r, 0, TAU); x.fill(); dotc(x, cx + dx, cy + dy - 4.4, 1.1, col); } },
  enter: (x, cx, cy, col) => { x.strokeStyle = col; x.lineWidth = 1.4; x.strokeRect(cx - 4, cy - 6, 8, 12); x.fillStyle = col; x.beginPath(); x.moveTo(cx - 8, cy - 2); x.lineTo(cx - 2, cy - 2); x.lineTo(cx - 2, cy - 4.5); x.lineTo(cx + 2, cy); x.lineTo(cx - 2, cy + 4.5); x.lineTo(cx - 2, cy + 2); x.lineTo(cx - 8, cy + 2); x.closePath(); x.fill(); },
  timer: (x, cx, cy, col) => { x.strokeStyle = col; x.lineWidth = 1.4; x.beginPath(); x.arc(cx, cy, 5.5, 0, TAU); x.stroke(); line(x, cx, cy, cx, cy - 3.8, col, 1.2); line(x, cx, cy, cx + 2.8, cy + 1, col, 1.2); },
  toggle: (x, cx, cy, col) => { rr(x, cx - 6, cy - 3, 12, 6, 3); x.strokeStyle = col; x.lineWidth = 1.3; x.stroke(); dotc(x, cx + 3, cy, 2.2, col); },
  tele: (x, cx, cy, col) => { x.strokeStyle = col; x.lineWidth = 1.3; for (let r = 2; r <= 6; r += 2) { x.beginPath(); x.arc(cx, cy, r, r, r + 4.5); x.stroke(); } },
  msg: (x, cx, cy, col) => { x.fillStyle = col; x.fillRect(cx - 6, cy - 4, 12, 8); x.strokeStyle = DARK; x.lineWidth = 1; x.beginPath(); x.moveTo(cx - 6, cy - 4); x.lineTo(cx, cy + 0.5); x.lineTo(cx + 6, cy - 4); x.stroke(); },
  move: (x, cx, cy, col) => { x.fillStyle = col; for (const a of [0, 1, 2, 3]) { x.save(); x.translate(cx, cy); x.rotate(a * Math.PI / 2); x.beginPath(); x.moveTo(0, -6.5); x.lineTo(2.6, -3.5); x.lineTo(-2.6, -3.5); x.closePath(); x.fill(); x.restore(); } dotc(x, cx, cy, 1.4, col); },
  hand: (x, cx, cy, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(cx - 4, cy - 4); x.lineTo(cx + 4, cy - 4); x.lineTo(cx + 3, cy + 5); x.lineTo(cx - 3, cy + 5); x.closePath(); x.fill(); fr(x, cx - 4.5, cy - 5.5, 9, 1.5, col); line(x, cx + 1, cy - 5.5, cx + 3, cy - 9, col, 1.1); },
};
function wiredBox(type, trigger) {
  return (s, { st, t }) => {
    const fired = st === 1, col = trigger ? PINK : YELLOW, body = trigger ? '#2a1420' : '#2a2414';
    s.shadowRect(0.14, 0.14, 0.86, 0.86, 0.24);
    const side = (x, w, h) => {
      fr(x, 0, 0, w, h, body);
      x.strokeStyle = rgba(col, fired ? 1 : 0.65); x.lineWidth = 1; x.strokeRect(1.5, 1.5, w - 3, h - 3);
      // rayo
      const cx = w / 2, cy = h / 2;
      x.fillStyle = fired ? '#ffffff' : col;
      x.beginPath(); x.moveTo(cx + 1.5, cy - 5); x.lineTo(cx - 3, cy + 1); x.lineTo(cx - 0.2, cy + 1); x.lineTo(cx - 1.5, cy + 5); x.lineTo(cx + 3, cy - 1); x.lineTo(cx + 0.2, cy - 1); x.closePath(); x.fill();
      if (fired) glow(x, cx, cy, w * 0.6, col, 0.5);
    };
    const top = (x, w, h) => {
      fr(x, 0, 0, w, h, shade(body, 0.08));
      x.strokeStyle = rgba(col, fired ? 1 : 0.7); x.lineWidth = 1.2; x.strokeRect(1.5, 1.5, w - 3, h - 3);
      for (const [px, py] of [[3, 3], [w - 3, 3], [3, h - 3], [w - 3, h - 3]]) dotc(x, px, py, 0.9, rgba(col, 0.9));
      WIRED_ICON[type]?.(x, w / 2, h / 2, fired ? '#ffffff' : col);
      if (fired) glow(x, w / 2, h / 2, w * 0.7, col, 0.45);
    };
    s.box(0.16, 0.16, 0, 0.84, 0.84, 0.44, body, { decal: { top, front: side, right: side, left: side, back: side }, outline: '#0a0a0c' });
    if (fired) s.over((ctx) => { const [x, y] = s.P(0.5, 0.5, 0.5); glow(ctx, x, y, 26, col, 0.35 + 0.1 * Math.sin(t / 60)); });
  };
}
const WIRED_TYPES = { wf: ['say', 'walk', 'enter', 'timer'], we: ['toggle', 'tele', 'msg', 'move', 'hand'] };
const wiredFloor = {};
for (const ty of WIRED_TYPES.wf) wiredFloor[`mecanica_wf_${ty}`] = wiredBox(ty, true);
for (const ty of WIRED_TYPES.we) wiredFloor[`mecanica_we_${ty}`] = wiredBox(ty, false);

// ---------- Regulador de luz (pared) ----------
function mecanica_dimmer(ctx, { st, now }) {
  const on = st === 1, w = 32;
  const x0 = 7, y0 = -40, pw = 18, ph = 30;
  ctx.fillStyle = rgba('#000000', 0.18); rr(ctx, x0 + 1.5, y0 + 1.5, pw, ph, 3); ctx.fill();
  const g = ctx.createLinearGradient(x0, y0, x0 + pw, y0 + ph); g.addColorStop(0, '#f6f6f8'); g.addColorStop(1, '#c9ced6');
  ctx.fillStyle = g; rr(ctx, x0, y0, pw, ph, 3); ctx.fill();
  ctx.strokeStyle = '#8b909c'; ctx.lineWidth = 0.8; ctx.stroke();
  // perilla con aro de color
  const cx = x0 + pw / 2, cy = y0 + 11;
  const hue = on ? (now / 30) % 360 : 0;
  if (on) { glow(ctx, cx, cy, 14, '#ffd9a8', 0.5); ctx.strokeStyle = `hsl(${hue}, 85%, 62%)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, TAU); ctx.stroke(); }
  dotc(ctx, cx, cy, 4.6, '#2b2d38'); dotc(ctx, cx - 1, cy - 1, 1.6, rgba('#ffffff', 0.4));
  line(ctx, cx, cy, cx + 3, cy - 3, '#f4f4f6', 1);
  // deslizador
  fr(ctx, x0 + 4, y0 + 21, pw - 8, 2, '#6a707a');
  fr(ctx, x0 + 4, y0 + 21, (pw - 8) * (on ? 0.7 : 0.15), 2, on ? YELLOW : '#9aa0aa');
  fr(ctx, x0 + 4 + (pw - 8) * (on ? 0.7 : 0.15) - 1.2, y0 + 19.5, 2.4, 5, '#2b2d38');
  dotc(ctx, x0 + pw - 3, y0 + 3, 1, on ? GREEN : '#9aa0aa');
  void w;
}

export default {
  floor: { mecanica_roller, mecanica_oneway, mecanica_vending_soda, mecanica_vending_coffee, mecanica_icecream, mecanica_popcorn, mecanica_roses, mecanica_wheel, mecanica_love, mecanica_scoreboard, mecanica_trophy, ...wiredFloor },
  wall: { mecanica_dimmer },
  period: {
    mecanica_roller: () => 60,
    mecanica_vending_soda: () => 140,
    mecanica_vending_coffee: () => 120,
    mecanica_icecream: (st) => (st === 1 ? 100 : 0),
    mecanica_popcorn: (st) => (st === 1 ? 80 : 0),
    mecanica_roses: (st) => (st === 1 ? 100 : 0),
    mecanica_wheel: (st) => (st === WHEEL_SPIN ? 45 : 0),
    mecanica_love: (st) => (st === LOVE_MEASURING ? 60 : 0),
    mecanica_dimmer: (st) => (st === 1 ? 120 : 0),
    ...Object.fromEntries(Object.keys(wiredFloor).map((k) => [k, (st) => (st === 1 ? 60 : 0)])),
  },
  defaultColor: { mecanica_wheel: '#c9a400', mecanica_dimmer: '#f6f6f8' },
};
