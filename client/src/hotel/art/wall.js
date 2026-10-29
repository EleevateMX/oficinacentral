// Furnis de pared, dibujados en PLANO: x a lo largo de la pared (32 px por casilla), y negativa hacia arriba.
//   (0, 0) = esquina inferior izquierda del furni. El motor los inclina sobre la pared.
import { PINK, YELLOW, DARK, shade, mix, rgba } from './iso.js';
import { drawWord, wordWidth, neonWord, neonStroke, hexLogo, rr } from './glyphs.js';

const TAU = Math.PI * 2;
const fr = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const dotc = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const dropShadow = (ctx, x, y, w, h, r = 1) => { ctx.fillStyle = 'rgba(16,10,28,0.28)'; rr(ctx, x + 1.5, y + 2, w, h, r); ctx.fill(); };
const glow = (ctx, x, y, r, color, a) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(0.5, rgba(color, a * 0.4)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};

function poster_gtahub(ctx) {
  // Póster HUB: cartel retro genérico (sol de franjas, montañas y la palabra HUB); sin logos
  const x = 3, y = -52, w = 26, h = 42;
  dropShadow(ctx, x, y, w, h, 0.5);
  fr(ctx, x, y, w, h, DARK);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, h - 4); ctx.clip();
  const sky = ctx.createLinearGradient(0, y, 0, y + 26);
  sky.addColorStop(0, '#2a1640'); sky.addColorStop(1, '#7a2a5c');
  ctx.fillStyle = sky; ctx.fillRect(x, y, w, 26);
  // sol con franjas
  const sx = x + w / 2, sy = y + 20;
  const sun = ctx.createLinearGradient(0, sy - 9, 0, sy + 2);
  sun.addColorStop(0, YELLOW); sun.addColorStop(1, PINK);
  ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 9, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#2a1640'; for (let i = 0; i < 3; i++) ctx.fillRect(sx - 10, sy - 2.2 - i * 2.6, 20, 0.7 + i * 0.15);
  // montañas
  ctx.fillStyle = '#1d1030'; ctx.beginPath(); ctx.moveTo(x, y + 26); ctx.lineTo(x + 7, y + 17); ctx.lineTo(x + 12, y + 22); ctx.lineTo(x + 19, y + 15); ctx.lineTo(x + w, y + 24); ctx.lineTo(x + w, y + 26); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = PINK; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  const hh = 6, ww = wordWidth('HUB', hh);
  drawWord(ctx, 'HUB', x + (w - ww) / 2, y + 29, hh, '#ffffff', 1.3);
  fr(ctx, x + 6, y + 37.5, w - 12, 0.9, PINK);
  // cinta
  ctx.fillStyle = rgba('#f3ead2', 0.85);
  ctx.save(); ctx.translate(x + 2, y + 1); ctx.rotate(-0.6); ctx.fillRect(-4, -1.5, 8, 3); ctx.restore();
  ctx.save(); ctx.translate(x + w - 2, y + 1); ctx.rotate(0.6); ctx.fillRect(-4, -1.5, 8, 3); ctx.restore();
}

function windowItem(ctx, { now }) {
  const x = 4, y = -66, w = 56, h = 52;
  const hr = new Date(now).getHours(), night = hr >= 20 || hr < 6, dusk = hr >= 18 && hr < 20;
  dropShadow(ctx, x - 2, y - 2, w + 4, h + 4, 1);
  fr(ctx, x - 2, y - 2, w + 4, h + 4, '#e8e3da');
  fr(ctx, x - 2, y + h - 1, w + 4, 2, '#cfc8bc');
  const gx = x + 2, gy = y + 2, gw = w - 4, gh = h - 4;
  const g = ctx.createLinearGradient(0, gy, 0, gy + gh);
  if (night) { g.addColorStop(0, '#0d1033'); g.addColorStop(1, '#3a2a6e'); }
  else if (dusk) { g.addColorStop(0, '#4a3a8c'); g.addColorStop(0.6, '#f0607e'); g.addColorStop(1, '#ffc36b'); }
  else { g.addColorStop(0, '#4fb3f0'); g.addColorStop(1, '#cdeeff'); }
  ctx.fillStyle = g; ctx.fillRect(gx, gy, gw, gh);
  ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
  if (night) {
    for (let i = 0; i < 14; i++) dotc(ctx, gx + ((i * 23) % gw), gy + ((i * 11) % (gh * 0.6)), 0.5, '#ffffff');
    dotc(ctx, gx + gw * 0.75, gy + 10, 5, '#fff6d6'); dotc(ctx, gx + gw * 0.75 + 2.5, gy + 8.5, 4.5, '#1a1a44');
  } else {
    dotc(ctx, gx + gw * 0.72, gy + 13, 6, dusk ? '#ffd27a' : '#fff1a8');
    ctx.fillStyle = rgba('#ffffff', 0.9);
    for (const [cx, cy, s] of [[14, 12, 1], [36, 20, 0.8]]) { dotc(ctx, gx + cx, gy + cy, 3.5 * s, '#ffffff'); dotc(ctx, gx + cx + 4 * s, gy + cy - 1.5, 4.2 * s, '#ffffff'); dotc(ctx, gx + cx + 8.5 * s, gy + cy, 3 * s, '#ffffff'); }
  }
  // ciudad
  const bc = night ? '#1b1640' : dusk ? '#4a2a5e' : '#7c9cc4';
  const hs = [16, 24, 12, 30, 20, 14, 26, 18, 10, 22];
  hs.forEach((bh, i) => {
    fr(ctx, gx + i * 5.4, gy + gh - bh * 0.8, 5, bh * 0.8, shade(bc, (i % 2) * -0.1));
    if (night) for (let j = 0; j < bh * 0.8 - 3; j += 3) if ((i + j) % 2) fr(ctx, gx + i * 5.4 + 1.5, gy + gh - bh * 0.8 + 2 + j, 1, 1, '#ffd84a');
  });
  // palmera
  ctx.strokeStyle = night ? '#120e2a' : '#3d5a3a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(gx + 8, gy + gh); ctx.quadraticCurveTo(gx + 6, gy + gh - 12, gx + 9, gy + gh - 22); ctx.stroke();
  for (const a of [-2.6, -2, -1.2, -0.5]) { ctx.beginPath(); ctx.moveTo(gx + 9, gy + gh - 22); ctx.quadraticCurveTo(gx + 9 + Math.cos(a) * 5, gy + gh - 26 + Math.sin(a) * 2, gx + 9 + Math.cos(a) * 9, gy + gh - 20 + Math.sin(a) * 1); ctx.stroke(); }
  // reflejo
  ctx.fillStyle = rgba('#ffffff', 0.18); ctx.beginPath(); ctx.moveTo(gx + 6, gy + gh); ctx.lineTo(gx + 16, gy + gh); ctx.lineTo(gx + 30, gy); ctx.lineTo(gx + 20, gy); ctx.fill();
  ctx.restore();
  // marcos
  fr(ctx, x + w / 2 - 1.2, gy, 2.4, gh, '#e8e3da'); fr(ctx, gx, gy + gh * 0.45, gw, 2.4, '#e8e3da');
  ctx.strokeStyle = 'rgba(60,40,50,0.45)'; ctx.lineWidth = 0.8; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); ctx.strokeRect(gx, gy, gw, gh);
  // repisa
  fr(ctx, x - 5, y + h + 1, w + 10, 3, '#f2eee7'); fr(ctx, x - 5, y + h + 4, w + 10, 1.5, '#bdb5a8');
  // cortinas
  const curtain = (cx, dir) => {
    const c = PINK, top = y - 4, bot = y + h + 2;
    ctx.fillStyle = shade(c, -0.1);
    ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx + dir * 13, top);
    ctx.quadraticCurveTo(cx + dir * 7, y + h * 0.5, cx + dir * 9, bot); ctx.lineTo(cx - dir * 1, bot); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(c, -0.55); ctx.lineWidth = 0.8; ctx.stroke();
    for (let i = 1; i < 4; i++) { ctx.strokeStyle = rgba(i % 2 ? '#ffffff' : '#000000', 0.18); ctx.beginPath(); ctx.moveTo(cx + dir * i * 3, top); ctx.quadraticCurveTo(cx + dir * i * 2, y + h * 0.5, cx + dir * i * 2.4, bot); ctx.stroke(); }
    fr(ctx, cx + (dir < 0 ? -9 : 0) + dir * 0.5, y + h * 0.58, 9, 2, YELLOW);
  };
  curtain(x - 4, 1); curtain(x + w + 4, -1);
  fr(ctx, x - 7, y - 6, w + 14, 2.2, '#2b2d38');
  dotc(ctx, x - 7, y - 4.9, 2, '#2b2d38'); dotc(ctx, x + w + 7, y - 4.9, 2, '#2b2d38');
}

function clock(ctx, { now }) {
  const cx = 16, cy = -36, r = 12;
  dotc(ctx, cx + 1.5, cy + 2, r + 1.5, 'rgba(16,10,28,0.28)');
  dotc(ctx, cx, cy, r + 1.6, '#2b2d38');
  dotc(ctx, cx, cy, r, '#fbfaf6');
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r - 1, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, r0 = k % 3 ? r - 2.2 : r - 3.4;
    ctx.strokeStyle = k % 3 ? '#8a8a96' : '#2b2d38'; ctx.lineWidth = k % 3 ? 0.7 : 1.3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1)); ctx.stroke();
  }
  hexLogo(ctx, cx, cy + 5, 2.2, { inner: false });
  const d = new Date(now), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
  const hand = (frac, len, lw, col) => {
    const a = frac * TAU - Math.PI / 2;
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 1.5, cy - Math.sin(a) * 1.5); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
  };
  hand(h / 12, r * 0.5, 1.8, '#2b2d38');
  hand(m / 60, r * 0.78, 1.2, '#2b2d38');
  hand(s / 60, r * 0.86, 0.6, PINK);
  dotc(ctx, cx, cy, 1.2, PINK);
}

function shelf_wall(ctx) {
  const y = -22;
  // libros
  const books = [[5, 15, '#3a86ff'], [8.2, 13, PINK], [11.6, 16, '#FFCC00'], [15, 12, '#2fb67c']];
  for (const [x, h, c] of books) { fr(ctx, x, y - h, 3, h, c); fr(ctx, x, y - h, 0.8, h, rgba('#ffffff', 0.3)); fr(ctx, x, y - h * 0.75, 3, 0.8, rgba('#000', 0.25)); ctx.strokeStyle = shade(c, -0.55); ctx.lineWidth = 0.6; ctx.strokeRect(x, y - h, 3, h); }
  ctx.save(); ctx.translate(18.4, y); ctx.rotate(0.28); fr(ctx, 0, -14, 3, 14, '#8e5cf7'); ctx.strokeStyle = '#3a1f73'; ctx.lineWidth = 0.6; ctx.strokeRect(0, -14, 3, 14); ctx.restore();
  // maceta con planta
  ctx.fillStyle = '#d26a3c'; ctx.beginPath(); ctx.moveTo(26, y - 8); ctx.lineTo(34, y - 8); ctx.lineTo(33, y); ctx.lineTo(27, y); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#6b2e14'; ctx.lineWidth = 0.6; ctx.stroke();
  for (const [dx, dy, r, c] of [[30, -12, 3.2, '#38a35a'], [27.5, -14, 2.6, '#2e8b4a'], [32.5, -15, 2.6, '#4bbf6b'], [30, -17, 2.4, '#38a35a']]) { dotc(ctx, dx, y + dy, r + 0.6, '#1f5a2c'); dotc(ctx, dx, y + dy, r, c); }
  // adorno hexagonal
  hexLogo(ctx, 42, y - 6, 5.5, { outline: 'rgba(20,20,20,0.5)' });
  // trofeo
  fr(ctx, 50, y - 3, 8, 3, '#3b2a20');
  fr(ctx, 53.2, y - 6, 1.6, 3, YELLOW);
  ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.moveTo(50.5, y - 13); ctx.lineTo(57.5, y - 13); ctx.quadraticCurveTo(57.5, y - 6, 54, y - 6); ctx.quadraticCurveTo(50.5, y - 6, 50.5, y - 13); ctx.fill();
  ctx.strokeStyle = '#8a6a00'; ctx.lineWidth = 0.6; ctx.stroke();
  // repisa y soportes
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; ctx.fillRect(3.5, y + 4, 59, 3);
  fr(ctx, 2, y, 60, 4, '#a8693c'); fr(ctx, 2, y, 60, 1.2, '#c98d5c'); fr(ctx, 2, y + 3, 60, 1, '#7a4a28');
  ctx.strokeStyle = '#4a2a14'; ctx.lineWidth = 0.6; ctx.strokeRect(2, y, 60, 4);
  for (const bx of [10, 52]) { ctx.fillStyle = '#2b2d38'; ctx.beginPath(); ctx.moveTo(bx - 1, y + 4); ctx.lineTo(bx + 1, y + 4); ctx.lineTo(bx + 1, y + 10); ctx.lineTo(bx - 1, y + 6); ctx.closePath(); ctx.fill(); }
}

function neon_sign(ctx, { st }) {
  const on = st === 1, x = 2, y = -36, w = 60, h = 28;
  if (on) { ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(1, 0.48); glow(ctx, 0, 0, 44, PINK, 0.32); ctx.restore(); }
  ctx.fillStyle = 'rgba(16,10,28,0.25)'; rr(ctx, x + 1.5, y + 2, w, h, 3); ctx.fill();
  ctx.fillStyle = on ? 'rgba(30,14,26,0.82)' : 'rgba(24,22,30,0.85)'; rr(ctx, x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8; ctx.stroke();
  for (const [a, b] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 3], [x + w - 3, y + h - 3]]) dotc(ctx, a, b, 0.9, '#9aa0aa');
  const cx = x + 10, cy = y + h / 2, r = 6;
  // Letrero genérico: estrella de neón amarilla + HUB rosa
  ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr2 = k % 2 ? r * 0.45 : r; const X = cx + Math.cos(a) * rr2, Y = cy + Math.sin(a) * rr2; if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
  ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  neonStroke(ctx, YELLOW, on, 1.3, '#fffbe6');
  const hh = 11, ww = wordWidth('HUB', hh);
  neonWord(ctx, 'HUB', x + 19 + (w - 23 - ww) / 2, cy - hh / 2, hh, PINK, on);
}

function frame_photo(ctx, { c }) {
  const x = 4, y = -44, w = 24, h = 32;
  dropShadow(ctx, x, y, w, h, 0.5);
  fr(ctx, x, y, w, h, c);
  fr(ctx, x, y, w, 1.5, shade(c, 0.35)); fr(ctx, x, y, 1.5, h, shade(c, 0.2)); fr(ctx, x + w - 1.5, y, 1.5, h, shade(c, -0.25)); fr(ctx, x, y + h - 1.5, w, 1.5, shade(c, -0.35));
  fr(ctx, x + 3, y + 3, w - 6, h - 6, '#f6f2ea');
  const px = x + 6, py = y + 6, pw = w - 12, ph = h - 12;
  const g = ctx.createLinearGradient(0, py, 0, py + ph);
  g.addColorStop(0, '#3b2a7a'); g.addColorStop(0.55, '#ff6f91'); g.addColorStop(1, '#ffcf70');
  fr(ctx, px, py, pw, ph, '#000'); ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
  ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  dotc(ctx, px + pw * 0.6, py + ph * 0.6, 3.4, '#ffe28a');
  ctx.fillStyle = '#2a1a4a'; ctx.beginPath(); ctx.moveTo(px, py + ph); ctx.lineTo(px, py + ph * 0.7); ctx.quadraticCurveTo(px + pw * 0.3, py + ph * 0.55, px + pw * 0.55, py + ph * 0.78); ctx.quadraticCurveTo(px + pw * 0.8, py + ph * 0.66, px + pw, py + ph * 0.72); ctx.lineTo(px + pw, py + ph); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = shade(c, -0.6); ctx.lineWidth = 0.7; ctx.strokeRect(x, y, w, h);
}

export const WALL = { poster_gtahub, window: windowItem, clock, shelf_wall, neon_sign, frame_photo };
export function wallFallback(ctx, { c, def }) { fr(ctx, 4, -50, def.w * 32 - 8, 36, c); }
// Furnis de pared que cambian con el reloj (periodo en ms)
export const WALL_PERIOD = { clock: 1000, window: 60000 };
export { mix };
