// Rocola en pixel-art: arco de neón, disco detrás del cristal y bocina.
// Cuando suena, el neón respira y cambia de tono, el disco gira y salen notas.
// Rocolas que tienen canción sonando (lo llena lib/jukebox.js con el estado del servidor)
export const jukeboxPlaying = new Set();

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `#${((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1)}`;
}
const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

// Forma del gabinete: rectángulo con arco arriba
function arch(ctx, x0, x1, yTop, yBot) {
  const r = (x1 - x0) / 2;
  ctx.beginPath();
  ctx.moveTo(x0, yBot);
  ctx.lineTo(x0, yTop + r);
  ctx.arc(x0 + r, yTop + r, r, Math.PI, 0);
  ctx.lineTo(x1, yBot);
  ctx.closePath();
}

export function drawJukebox(ctx, x, y, w, h, color, t, playing) {
  const col = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#FE3377';
  const s = t / 1000;
  const on = playing && t > 0;
  const pulse = on ? 0.65 + Math.sin(s * 4) * 0.35 : 0.35;
  const cx = x + w / 2;
  const x0 = x + 5, x1 = x + w - 5, top = y - 40, bot = y + h - 5;

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(cx + 3, bot + 1, w / 2 - 2, 5, 0, 0, Math.PI * 2); ctx.fill();

  // halo en el piso cuando suena
  if (on) {
    const g = ctx.createRadialGradient(cx, bot, 4, cx, bot, w * 0.9);
    g.addColorStop(0, `${col}55`); g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, bot, w * 0.9, 14, 0, 0, Math.PI * 2); ctx.fill();
  }

  // gabinete
  const body = ctx.createLinearGradient(x0, 0, x1, 0);
  body.addColorStop(0, '#3a2440'); body.addColorStop(0.5, '#24162a'); body.addColorStop(1, '#170d1b');
  ctx.fillStyle = body; arch(ctx, x0, x1, top, bot); ctx.fill();
  ctx.strokeStyle = '#0d070f'; ctx.lineWidth = 1.5; arch(ctx, x0, x1, top, bot); ctx.stroke();

  // neón exterior (rosa) e interior (amarillo)
  const hueShift = on ? (Math.sin(s * 1.3) + 1) / 2 : 0;
  const neon = on ? shade(col, 0.1 * hueShift) : shade(col, -0.1);
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 12 * pulse;
  ctx.strokeStyle = neon; ctx.lineWidth = 3;
  arch(ctx, x0 + 3, x1 - 3, top + 3, bot - 13); ctx.stroke();
  ctx.shadowColor = '#FFCC00'; ctx.shadowBlur = 8 * pulse;
  ctx.strokeStyle = on ? '#FFCC00' : '#b8952a'; ctx.lineWidth = 1.5;
  arch(ctx, x0 + 7, x1 - 7, top + 7, bot - 15); ctx.stroke();
  ctx.restore();

  // cristal con el disco
  const gx0 = x0 + 10, gx1 = x1 - 10, gTop = top + 10, gBot = y - 3;
  ctx.save();
  arch(ctx, gx0, gx1, gTop, gBot); ctx.clip();
  const glass = ctx.createLinearGradient(0, gTop, 0, gBot);
  glass.addColorStop(0, on ? shade(col, -0.35) : '#3b2b45'); glass.addColorStop(1, '#120a16');
  ctx.fillStyle = glass; ctx.fillRect(gx0, gTop, gx1 - gx0, gBot - gTop);
  // disco
  const dcx = cx, dcy = gBot - 9, dr = 11;
  ctx.fillStyle = '#0b0b0e'; ctx.beginPath(); ctx.arc(dcx, dcy, dr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  for (const r of [9, 7, 5]) { ctx.beginPath(); ctx.arc(dcx, dcy, r, 0, Math.PI * 2); ctx.stroke(); }
  const ang = on ? s * 5 : 0.6;
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(dcx, dcy, 8, ang, ang + 0.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(dcx, dcy, 8, ang + Math.PI, ang + Math.PI + 0.9); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(dcx, dcy, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFCC00'; ctx.beginPath(); ctx.arc(dcx, dcy, 1, 0, Math.PI * 2); ctx.fill();
  // brazo del tocadiscos
  R(ctx, '#c9ced6', dcx + 9, dcy - 12, 1.5, 9); R(ctx, '#c9ced6', dcx + 5, dcy - 4, 5, 1.5);
  // reflejo
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.moveTo(gx0, gTop + 14); ctx.lineTo(gx0 + 10, gTop); ctx.lineTo(gx0 + 15, gTop); ctx.lineTo(gx0, gTop + 22); ctx.closePath(); ctx.fill();
  ctx.restore();

  // panel de selección (botoncitos)
  R(ctx, '#2e2033', x0 + 6, y - 2, x1 - x0 - 12, 6);
  for (let i = 0; i < 7; i++) {
    const lit = on && Math.floor(s * 3) % 7 === i;
    R(ctx, lit ? '#FFCC00' : i % 2 ? '#e9e3ee' : '#cfc6d6', x0 + 9 + i * 6.3, y - 1, 4, 3);
  }

  // bocina con rejilla iluminada
  const sy = y + 6, sh = bot - sy - 3;
  const grill = ctx.createLinearGradient(0, sy, 0, sy + sh);
  grill.addColorStop(0, on ? shade(col, -0.15) : '#4a2a44'); grill.addColorStop(1, on ? shade(col, -0.45) : '#2a1729');
  ctx.fillStyle = grill; ctx.beginPath(); ctx.roundRect(x0 + 7, sy, x1 - x0 - 14, sh, 3); ctx.fill();
  for (let gx = x0 + 10; gx < x1 - 9; gx += 4) R(ctx, 'rgba(10,5,12,.55)', gx, sy + 2, 2, sh - 4);
  if (on) { // la bocina "late" con la música
    const beat = Math.max(0, Math.sin(s * 8));
    ctx.fillStyle = `rgba(255,255,255,${0.12 * beat})`; ctx.beginPath(); ctx.roundRect(x0 + 7, sy, x1 - x0 - 14, sh, 3); ctx.fill();
  }

  // columnas laterales con burbujas de colores
  for (const px of [x0 + 1, x1 - 4]) {
    R(ctx, '#120a16', px, top + 30, 3, bot - top - 32);
    for (let k = 0; k < 4; k++) {
      const yy = on ? bot - 4 - ((s * 14 + k * 9) % (bot - top - 34)) : bot - 8 - k * 9;
      ctx.fillStyle = k % 2 ? '#FFCC00' : col;
      ctx.globalAlpha = on ? 0.95 : 0.5;
      ctx.fillRect(px + 0.5, yy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // zócalo
  R(ctx, '#0d070f', x0 - 1, bot - 3, x1 - x0 + 2, 4);
  R(ctx, shade(col, -0.25), x0, bot - 3, x1 - x0, 1);

  // notas musicales que suben
  if (on) {
    for (let k = 0; k < 3; k++) {
      const ph = (s * 0.45 + k / 3) % 1;
      const nx = cx + Math.sin((s + k * 2.1) * 1.7) * 14 + (k - 1) * 10;
      const ny = top - 4 - ph * 26;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.95;
      ctx.fillStyle = ['#FFCC00', col, '#ffffff'][k];
      ctx.beginPath(); ctx.ellipse(nx, ny, 2.6, 2, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(nx + 1.6, ny - 8, 1.2, 8);
      ctx.fillRect(nx + 1.6, ny - 8, 4, 1.4);
    }
    ctx.globalAlpha = 1;
  }
}
