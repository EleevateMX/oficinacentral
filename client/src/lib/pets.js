// Dibujo de mascotas en pixel-art (coordenadas del mundo: 1 casilla = 32 px).
import { petDef } from '@shared/pets.js';

function shade(hex, k) {
  const n = parseInt(String(hex).slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k < 0 ? c * k : (255 - c) * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const HEX = /^#[0-9a-f]{6}$/i;

// Cuadrúpedo genérico (perros, gatos, zorro) a partir de su receta
function quadruped(R, d, col, t, moving, blink) {
  const s = d.size || 1;
  const dark = shade(col, -0.3);
  const legH = (d.short ? 1.6 : 3) * s;
  const bodyH = 5 * s;
  const L = 11 * s * (d.long ? 1.4 : 1);
  const bx = -L / 2 - 1;
  const by = -(legH + bodyH);
  const step = moving ? Math.sin(t * 16) : 0;
  // patas
  const legC = d.tan || d.points || dark;
  for (const [lx, ph] of [[bx + 1, 1], [bx + 3.2 * s, -1], [bx + L - 4.2 * s, 1], [bx + L - 2, -1]]) R(legC, lx, -legH + (moving ? Math.max(0, step * ph) * -1 : 0), 1.8 * s, legH);
  // cola
  const tx = bx;
  const ty = by + 1;
  const wag = Math.sin(t * (moving ? 18 : 7)) * 1.5;
  const tailC = d.points || col;
  if (d.tail === 'wag' || d.tail === 'long') R(tailC, tx - 3 * s, ty - 2 + wag * 0.6, 3.5 * s, 1.6 * s);
  if (d.tail === 'long' && d.kind === 'cat') R(tailC, tx - 3 * s, ty - 6 + wag, 1.6 * s, 5 * s);
  if (d.tail === 'curl') { R(tailC, tx - 1.5 * s, ty - 3.5 * s, 2.5 * s, 2.5 * s); R(shade(tailC, -0.15), tx - 0.5 * s, ty - 2.5 * s, 1, 1); }
  if (d.tail === 'fluffy') R(tailC, tx - 4 * s, ty - 2.5 + wag * 0.5, 4.5 * s, 3 * s);
  if (d.tail === 'pom') { R(tailC, tx - 1 * s, ty - 1, 1 * s, 1); R(tailC, tx - 3 * s, ty - 3, 2.5 * s, 2.5 * s); }
  if (d.tail === 'stub') R(tailC, tx - 1.2 * s, ty, 1.5 * s, 1.5 * s);
  if (d.tail === 'fox') { R(col, tx - 5 * s, ty - 1 + wag * 0.5, 5.5 * s, 3.5 * s); R('#f4f4f6', tx - 6 * s, ty - 1 + wag * 0.5, 2 * s, 3 * s); }
  // cuerpo
  R(col, bx, by, L, bodyH);
  if (d.belly) R(d.belly, bx + 2, by + bodyH * 0.6, L - 4, bodyH * 0.4);
  if (d.saddle) R(d.saddle, bx + 1, by, L - 3 * s, bodyH * 0.5);
  if (d.spots) for (const [px, py] of [[0.2, 0.2], [0.55, 0.5], [0.75, 0.15], [0.35, 0.6]]) R(d.spots, bx + L * px, by + bodyH * py, 1.6 * s, 1.4 * s);
  if (d.spots2) for (const [px, py] of [[0.1, 0.5], [0.65, 0.2]]) R(d.spots2, bx + L * px, by + bodyH * py, 2 * s, 1.6 * s);
  if (d.stripes) for (let k = 0; k < 3; k++) R(d.stripes, bx + L * (0.2 + k * 0.22), by, 1.2 * s, bodyH * 0.55);
  if (d.tan) R(d.tan, bx + L - 3 * s, by + bodyH * 0.55, 2.5 * s, bodyH * 0.45);
  // cabeza
  const hw = 7 * s;
  const hh = 6 * s;
  const hx = bx + L - 3.5 * s;
  const hy = by - hh * 0.55;
  // orejas detrás de la cabeza
  const earC = d.points || (d.ears === 'floppy' ? dark : col);
  if (d.ears === 'pointy') { R(earC, hx + 0.8 * s, hy - 2.2 * s, 2 * s, 2.6 * s); R(earC, hx + hw - 2.8 * s, hy - 2.2 * s, 2 * s, 2.6 * s); }
  if (d.ears === 'bat') { R(earC, hx + 0.3 * s, hy - 3.2 * s, 2.4 * s, 3.6 * s); R(earC, hx + hw - 2.7 * s, hy - 3.2 * s, 2.4 * s, 3.6 * s); R('#f5a3b7', hx + 1 * s, hy - 2.4 * s, 1 * s, 2 * s); }
  if (d.ears === 'small') { R(earC, hx + 0.5 * s, hy - 1 * s, 1.8 * s, 1.6 * s); R(earC, hx + hw - 2.3 * s, hy - 1 * s, 1.8 * s, 1.6 * s); }
  R(col, hx, hy, hw, hh);
  if (d.ears === 'floppy') { R(earC, hx - 0.6 * s, hy + 0.5, 2.2 * s, 4.5 * s); }
  if (d.ears === 'round') { R(shade(col, -0.08), hx - 1 * s, hy + 0.5, 2.6 * s, 4 * s); R(shade(col, -0.05), hx + 1, hy - 1.6 * s, hw - 2, 2.2 * s); }
  if (d.points) R(d.points, hx + hw - 3.5 * s, hy + hh * 0.35, 3.5 * s, hh * 0.65);
  if (d.mask) R(d.mask, hx + hw - 3.2 * s, hy + hh * 0.45, 3.2 * s, hh * 0.55);
  // hocico
  const muzzleC = d.tan || (d.mask && d.snout === 'flat' ? d.mask : shade(col, 0.18));
  if (d.snout === 'long') { R(muzzleC, hx + hw - 0.5, hy + hh * 0.45, 3 * s, 2.6 * s); R('#1d1d22', hx + hw + 2.2 * s, hy + hh * 0.45, 1.2, 1.2); }
  if (d.snout === 'short') { R(muzzleC, hx + hw - 0.5, hy + hh * 0.55, 1.6 * s, 2 * s); R('#1d1d22', hx + hw + 0.8 * s, hy + hh * 0.55, 1, 1); }
  if (d.snout === 'flat') R('#1d1d22', hx + hw - 1.2, hy + hh * 0.55, 1.2, 1.2);
  if (d.beard) R(d.beard, hx + hw - 1, hy + hh * 0.75, 3 * s, 2.2 * s);
  if (d.kind === 'cat') { R('#f5a3b7', hx + hw - 1, hy + hh * 0.55, 1, 1); R('rgba(255,255,255,.7)', hx + hw, hy + hh * 0.7, 2.5, 0.6); }
  // ojo
  const ex = hx + hw - 3.2 * s;
  const ey = hy + hh * 0.3;
  if (blink) R('#1d1d22', ex, ey + 1, 1.8, 0.8);
  else { R(d.eye || '#1d1d22', ex, ey, 1.6, 1.8); if (d.eye) R('#1d1d22', ex + 0.6, ey + 0.5, 0.8, 1); }
}

function special(R, d, col, t, moving, blink) {
  const dark = shade(col, -0.35);
  const eye = (ex, ey) => (blink ? R('#1d1d22', ex, ey + 1, 2, 1) : R('#1d1d22', ex, ey, 1.6, 2));
  switch (d.kind) {
    case 'chick':
      R(col, -5, -10, 10, 9); R(col, -4, -11, 8, 1); R(shade(col, 0.25), -3, -6, 5, 3);
      R('#ff8a3d', 5, -7, 2, 2); eye(2, -9); R('#ff8a3d', -2, -1, 1, 1); R('#ff8a3d', 1, -1, 1, 1);
      break;
    case 'duck':
      R(col, -6, -8, 11, 7); R(col, 1, -14, 6, 7); R('#ff8a3d', 7, -11, 3, 2); R(shade(col, -0.15), -4, -6, 6, 3);
      R('#ff8a3d', -2, -1, 2, 1); R('#ff8a3d', 1, -1, 2, 1); eye(4, -12);
      break;
    case 'bunny':
      R(col, -6, -8, 10, 7); R(col, 1, -12, 7, 6);
      if (d.ears === 'lop') { R(dark, 1, -11, 2, 7); }
      else { R(col, 2, -18, 2, 7); R(col, 5, -18, 2, 7); R('#f5a3b7', 3, -17, 1, 5); R('#f5a3b7', 6, -17, 1, 5); }
      R(dark, -6, -2, 3, 2); R(dark, 1, -2, 3, 2); R('#fff', -8, -8, 3, 3); eye(5, -10); R('#f5a3b7', 7, -8, 1, 1);
      break;
    case 'hamster':
      R(col, -5, -8, 10, 8); R('#f6ead8', -3, -5, 7, 4); R(shade(col, -0.2), -3, -10, 2, 2); R(shade(col, -0.2), 2, -10, 2, 2);
      eye(2, -6); R('#f5a3b7', 4, -4, 1, 1);
      break;
    case 'cuyo':
      R(col, -7, -8, 13, 7); if (d.spots) { R(d.spots, -4, -8, 4, 4); R(d.spots, 2, -5, 3, 3); } R(shade(col, -0.2), 2, -9, 2, 1.5);
      eye(3, -6); R('#f5a3b7', 6, -4, 1, 1);
      break;
    case 'turtle':
      R(shade(col, 0.15), 3, -5, 4, 3); R(dark, -6, -2, 2, 2); R(dark, 2, -2, 2, 2);
      R('#8a5a2a', -6, -8, 11, 6); R('#a8743a', -4, -9, 7, 2); R('#6b4420', -3, -7, 2, 2); R('#6b4420', 0, -7, 2, 2);
      eye(5, -5);
      break;
    case 'bird':
      R(col, -3, -12, 7, 9); R(d.wing || shade(col, -0.25), -3, -9, 4, 5); R(col, -5, -4, 3, 3);
      R('#f4c542', 4, -10, 2, 2); R('#1d1d22', 4, -9, 1, 1); eye(2, -11); R('#555', -1, -3, 1, 3); R('#555', 1, -3, 1, 3);
      break;
    case 'panda':
      R('#f4f4f6', -7, -9, 11, 8); R('#1d1d22', -7, -6, 11, 3); R('#f4f4f6', 1, -14, 8, 7);
      R('#1d1d22', 1, -16, 2, 2); R('#1d1d22', 7, -16, 2, 2); R('#1d1d22', 5, -12, 3, 3);
      R('#1d1d22', -6, -2, 3, 2); R('#1d1d22', 1, -2, 3, 2);
      if (!blink) R('#fff', 6, -11, 1, 1); R('#1d1d22', 8, -9, 1, 1);
      break;
    case 'axolotl':
      R(col, -8, -5, 14, 4); R(col, 2, -9, 7, 6); R(shade(col, -0.2), -11, -4, 4, 2);
      R('#e0467a', 2, -12, 1, 3); R('#e0467a', 4, -12, 1, 3); R('#e0467a', 7, -12, 1, 3);
      eye(6, -7); R('#1d1d22', 7, -5, 2, 0.8);
      break;
    case 'hedgehog':
      R('#e8cfa8', 2, -7, 5, 5); R(col, -7, -9, 10, 8);
      for (let k = 0; k < 5; k++) R(shade(col, -0.3), -7 + k * 2, -11, 1, 3);
      R('#1d1d22', 7, -5, 1, 1); eye(4, -6);
      break;
    case 'pig':
      R(col, -7, -9, 12, 7); R(col, 2, -12, 7, 7); R(shade(col, -0.12), 7, -9, 3, 3); R(dark, 8, -8, 0.8, 0.8);
      R(shade(col, -0.15), 3, -14, 2, 2); R(dark, -6, -2, 2, 2); R(dark, 2, -2, 2, 2); R(dark, -9, -8, 2, 1);
      eye(5, -10);
      break;
    default:
      break;
  }
}

// x, y: centro de los pies. face: 1 mira a la derecha, -1 a la izquierda. t en segundos.
// fx (opcional, mascotas interactivas): { dy: salto extra, rot: giro (rad), sy: aplastado vertical, eyes: 'closed' }
export function drawPet(ctx, kind, color, x, y, face, t, moving, fx) {
  const d = petDef(kind);
  if (!d || d.id === 'none') return;
  const col = HEX.test(color || '') ? color : d.color;
  const hop = (moving ? -Math.abs(Math.sin(t * 14)) * (d.kind === 'dog' || d.kind === 'cat' ? 1.2 : 2.5) : Math.sin(t * 2.2) * 0.4) + (fx?.dy || 0);
  const blink = fx?.eyes === 'closed' || (t * 1000 + x * 37) % 3800 < 130;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y, 7 * (d.size || 1) * (fx?.dy ? Math.max(0.5, 1 + fx.dy / 20) : 1), 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(Math.round(x), Math.round(y + hop));
  if (fx?.sy) ctx.scale(1, fx.sy);
  if (fx?.rot) { ctx.translate(0, -6); ctx.rotate(fx.rot * face); ctx.translate(0, 6); }
  ctx.scale(face, 1);
  const R = (c, px, py, w, h) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
  if (d.kind === 'dog' || d.kind === 'cat') quadruped(R, d, col, t, moving, blink);
  else special(R, d, col, t, moving, blink);
  ctx.restore();
}
