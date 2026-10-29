// Hotel: efectos sociales dibujados encima de la sala (los llama engine.js al final de cada cuadro).
// - Pulgar arriba que sube sobre quien recibe respeto.
// - Lema debajo del nombre al pasar el mouse sobre alguien.
import { social } from './socialStore.js';

const FX_MS = 1900;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Pulgar en "pixel art" (rejilla de 9×9) dentro de un círculo amarillo
const THUMB = [
  '....##...',
  '...#oo#..',
  '...#oo#..',
  '..#ooo#..',
  '##oooooo#',
  '#ooooooo#',
  '#oooooo#.',
  '#ooooo#..',
  '.#####...',
];
function drawThumb(ctx, cx, cy, r) {
  ctx.fillStyle = '#FFCC00';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#141414'; ctx.stroke();
  const px = (r * 1.15) / 9;
  const ox = Math.round(cx - px * 4.5), oy = Math.round(cy - px * 4.6);
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const c = THUMB[j][i];
    if (c === '.') continue;
    ctx.fillStyle = c === '#' ? '#141414' : '#FE3377';
    ctx.fillRect(ox + i * px, oy + j * px, Math.ceil(px), Math.ceil(px));
  }
}

export function drawSocialFx(ctx, eng, avs, t) {
  const now = performance.now();
  if (social.fx.length) social.fx = social.fx.filter((f) => now - f.t < FX_MS);
  for (const a of avs) {
    const U = a.U;
    if (!U?._tag) continue;
    const s = eng.toScr(U._tag[0], U._tag[1] - 3);
    // Respeto
    for (const f of social.fx) {
      if (f.to !== U.id) continue;
      const k = (now - f.t) / FX_MS;
      const pop = k < 0.15 ? k / 0.15 : 1;
      const r = 13 * (0.6 + 0.4 * pop) * (k < 0.15 ? 1 + 0.25 * Math.sin(pop * Math.PI) : 1);
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const y = s.y - 30 - k * 34;
      drawThumb(ctx, s.x, y, r);
      ctx.font = `800 12px ${eng.font}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#141414'; ctx.strokeText('+1', s.x + r + 3, y);
      ctx.fillStyle = '#FFCC00'; ctx.fillText('+1', s.x + r + 3, y);
      ctx.restore();
    }
    // Lema al pasar el mouse (debajo de la etiqueta del nombre, encima de la cabeza)
    const hov = eng.hover?.kind === 'user' && eng.hover.id === U.id;
    const motto = social.people.get(U.id)?.motto;
    if (hov && motto) {
      ctx.save();
      ctx.font = `italic 500 11px ${eng.font}`;
      const txt = motto.length > 40 ? `${motto.slice(0, 40)}…` : motto;
      const w = ctx.measureText(txt).width + 14;
      ctx.fillStyle = 'rgba(254,51,119,.92)';
      rr(ctx, s.x - w / 2, s.y - 38, w, 16, 8); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, s.x, s.y - 30);
      ctx.restore();
    }
  }
}
