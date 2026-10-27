// Dibujo de mascotas en pixel-art (coordenadas del mundo: 1 casilla = 32 px).
import { PETS } from '@shared/pets.js';

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k < 0 ? c * k : (255 - c) * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// x, y: centro de los pies. face: 1 mira a la derecha, -1 a la izquierda. t en segundos.
export function drawPet(ctx, kind, color, x, y, face, t, moving) {
  const def = PETS.find((p) => p.id === kind);
  if (!def || kind === 'none') return;
  const col = /^#[0-9a-f]{6}$/i.test(color || '') ? color : def.color;
  const dark = shade(col, -0.35);
  const hop = moving ? -Math.abs(Math.sin(t * 14)) * 2.5 : Math.sin(t * 2.2) * 0.4;
  const blink = (t * 1000 + x * 37) % 3800 < 130;
  const R = (c, px, py, w, h) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y, 7, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(Math.round(x), Math.round(y + hop));
  ctx.scale(face, 1);
  const eye = (ex, ey) => (blink ? R('#1d1d22', ex, ey + 1, 2, 1) : R('#1d1d22', ex, ey, 1.6, 2));
  if (kind === 'chick') {
    R(col, -5, -10, 10, 9); R(col, -4, -11, 8, 1); R(shade(col, 0.25), -3, -6, 5, 3);
    R('#ff8a3d', 5, -7, 2, 2); eye(2, -9); R('#ff8a3d', -2, -1, 1, 1); R('#ff8a3d', 1, -1, 1, 1);
  } else if (kind === 'bunny') {
    R(col, -6, -8, 10, 7); R(col, 1, -12, 7, 6);
    R(col, 2, -18, 2, 7); R(col, 5, -18, 2, 7); R('#f5a3b7', 3, -17, 1, 5); R('#f5a3b7', 6, -17, 1, 5);
    R(dark, -6, -2, 3, 2); R(dark, 1, -2, 3, 2); R('#fff', -8, -8, 3, 3); eye(5, -10); R('#f5a3b7', 7, -8, 1, 1);
  } else if (kind === 'panda') {
    R('#f4f4f6', -7, -9, 11, 8); R('#1d1d22', -7, -6, 11, 3); R('#f4f4f6', 1, -14, 8, 7);
    R('#1d1d22', 1, -16, 2, 2); R('#1d1d22', 7, -16, 2, 2); R('#1d1d22', 5, -12, 3, 3);
    R('#1d1d22', -6, -2, 3, 2); R('#1d1d22', 1, -2, 3, 2);
    if (!blink) R('#fff', 6, -11, 1, 1); R('#1d1d22', 8, -9, 1, 1);
  } else {
    // cuadrúpedos: perro, gato, zorro
    const wag = Math.sin(t * (moving ? 18 : 8)) * 1.5;
    R(col, -7, -9, 11, 6);
    R(dark, -7, -3, 2, 3); R(dark, -3, -3, 2, 3); R(dark, 0, -3, 2, 3); R(dark, 2, -3, 2, 3);
    R(col, 1, -14, 8, 7);
    if (kind === 'dog') { R(dark, 1, -14, 2, 5); R(shade(col, 0.2), 6, -10, 4, 3); R('#1d1d22', 9, -10, 1, 1); R(col, -10, -11 + wag, 3, 2); }
    if (kind === 'cat') { R(col, 1, -16, 2, 2); R(col, 7, -16, 2, 2); R(col, -10, -16 + wag, 2, 8); R('#f5a3b7', 8, -9, 1, 1); }
    if (kind === 'fox') {
      R(col, 1, -17, 2, 3); R(col, 7, -17, 2, 3); R('#f4f4f6', 5, -9, 4, 2); R('#1d1d22', 9, -10, 1, 1);
      R(col, -12, -10 + wag, 5, 4); R('#f4f4f6', -13, -10 + wag, 2, 3); R('#f4f4f6', -5, -5, 7, 2);
    }
    eye(6, -12);
  }
  ctx.restore();
}
