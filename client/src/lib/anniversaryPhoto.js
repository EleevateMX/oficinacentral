// Foto conmemorativa del aniversario: todos los que están conectados, con los brazos arriba,
// en filas, con el logo, el título y la fecha sobre un fondo de fiesta.
import { drawAvatar } from './render.js';
import { officeLogo } from './themes.js';
import { anniversaryInfo } from './aniversario.js';
import { hash } from './seasonKit.js';

const COLS = ['#FE3377', '#FFCC00', '#3DDC84', '#4cc9f0', '#ff9f1c', '#b46bff', '#ffffff'];
const FW = 32, FH = 48;

function loadImage(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

// Cuántas filas/columnas y de qué tamaño caben los personajes (escala entera: pixel art nítido)
function layout(n, W, H) {
  let L = null;
  for (const k of [6, 5, 4, 3, 2, 1.5, 1]) {
    const cw = FW * k * 1.45, ch = FH * k + 14 + Math.max(18, 7 * k);
    const cols = Math.max(1, Math.floor(W / cw));
    const rows = Math.ceil(n / cols);
    L = { k, cw, ch, cols, rows };
    if (rows * ch <= H) break;
  }
  return L;
}

export async function composeAnniversaryPhoto({ people, config, date = new Date() }) {
  const W = 1600, H = 1000;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const info = anniversaryInfo(config);

  // Fondo
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d0b16'); bg.addColorStop(0.55, '#141414'); bg.addColorStop(1, '#0d0d0f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, col] of [[220, 160, 420, 'rgba(254,51,119,.28)'], [1380, 200, 380, 'rgba(255,204,0,.16)'], [800, 980, 620, 'rgba(254,51,119,.18)']]) {
    const g = ctx.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // Rayos de luz desde el centro
  ctx.save();
  ctx.translate(W / 2, 330);
  for (let i = 0; i < 18; i++) {
    ctx.rotate(Math.PI / 9);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.025)' : 'rgba(254,51,119,.04)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1400, -120); ctx.lineTo(1400, 120); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // Confeti
  for (let i = 0; i < 260; i++) {
    const x = hash(i, 1, 5) * W, y = hash(i, 2, 5) * H, a = hash(i, 3, 5) * Math.PI;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.globalAlpha = 0.35 + hash(i, 4, 5) * 0.5;
    ctx.fillStyle = COLS[i % COLS.length];
    ctx.fillRect(-6, -2.5, 12, 5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // Banderines arriba
  {
    const y0 = 18, n = 26;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.quadraticCurveTo(W / 2, y0 + 70, W, y0); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, x = W * k, y = y0 + 70 * 2 * k * (1 - k);
      ctx.fillStyle = i % 2 ? '#FFCC00' : '#FE3377';
      ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y); ctx.lineTo(x, y + 30); ctx.closePath(); ctx.fill();
    }
  }

  // Logo + títulos
  const logo = await loadImage(officeLogo(config));
  let ty = 150;
  if (logo) {
    const s = 110 / Math.max(logo.naturalWidth, logo.naturalHeight);
    ctx.drawImage(logo, W / 2 - (logo.naturalWidth * s) / 2, 92, logo.naturalWidth * s, logo.naturalHeight * s);
    ty = 250;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(254,51,119,.55)'; ctx.shadowBlur = 24;
  ctx.fillStyle = '#ffffff'; ctx.font = '900 64px "Public Sans", system-ui, sans-serif';
  ctx.fillText(info.title, W / 2, ty);
  ctx.shadowBlur = 0;
  const when = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.font = '800 30px "Public Sans", system-ui, sans-serif';
  const sub = `${info.sub} · ${when}`;
  const sw = ctx.measureText(sub).width + 48;
  ctx.fillStyle = '#FFCC00';
  ctx.beginPath(); ctx.roundRect(W / 2 - sw / 2, ty + 42, sw, 50, 25); ctx.fill();
  ctx.fillStyle = '#141414'; ctx.fillText(sub, W / 2, ty + 68);

  // Escenario
  const top = ty + 116, areaH = H - top - 44;
  const g = ctx.createRadialGradient(W / 2, H - 40, 40, W / 2, H - 40, 760);
  g.addColorStop(0, 'rgba(254,51,119,.35)'); g.addColorStop(1, 'rgba(254,51,119,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(W / 2, H - 40, 760, 120, 0, 0, Math.PI * 2); ctx.fill();

  // Personajes con los brazos arriba
  const list = people.slice(0, 120);
  const L = layout(list.length || 1, W - 120, areaH);
  ctx.imageSmoothingEnabled = false;
  const rows = [];
  for (let i = 0; i < list.length; i += L.cols) rows.push(list.slice(i, i + L.cols));
  const used = rows.length * L.ch;
  const y0 = top + (areaH - used) / 2;
  rows.forEach((row, r) => {
    const by = y0 + r * L.ch + FH * L.k;
    const x0 = W / 2 - ((row.length - 1) * L.cw) / 2;
    row.forEach((u, i) => {
      const cx = x0 + i * L.cw;
      ctx.save();
      ctx.scale(L.k, L.k);
      drawAvatar(ctx, cx / L.k, by / L.k, u.avatar || {}, 'down', 0, false, false, 'armsUp');
      ctx.restore();
      // nombre
      const name = (u.displayName || '').split(' ')[0].slice(0, 14);
      ctx.font = `700 ${Math.max(12, Math.round(5 * L.k))}px "Public Sans", system-ui, sans-serif`;
      const nw = ctx.measureText(name).width + 14;
      ctx.fillStyle = 'rgba(20,20,20,.82)';
      ctx.beginPath(); ctx.roundRect(cx - nw / 2, by + 4, nw, Math.max(18, 7 * L.k), 9); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name, cx, by + 4 + Math.max(18, 7 * L.k) / 2 + 1);
    });
  });
  if (people.length > list.length) {
    ctx.font = '700 20px "Public Sans", system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(`y ${people.length - list.length} más`, W - 120, H - 30);
  }
  // Firma
  ctx.textAlign = 'right'; ctx.font = '600 16px "Public Sans", system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillText(`${info.name} · Oficina virtual`, W - 28, H - 22);
  ctx.textAlign = 'left';
  return c;
}
