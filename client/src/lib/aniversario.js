// Aniversario de la comunidad: pastel gigante en la recepción (velitas = años; abre la foto
// del aniversario), letrero "¡Feliz aniversario!", globos, confeti en el piso y en el aire,
// y fuegos artificiales sobre el mapa. Todo se calcula en el navegador.
import { T, hash, occupancy, findCenterpiece, toScreen } from './seasonKit.js';
import { anniversaryYears } from '@shared/seasons.js';

const COLS = ['#FE3377', '#FFCC00', '#3DDC84', '#4cc9f0', '#ff9f1c', '#b46bff', '#ffffff'];

export function anniversaryInfo(config = {}) {
  const a = config.anniversary || {};
  const years = anniversaryYears(a.year, a.date);
  const name = (config.officeName || 'HUB').toUpperCase();
  return { years, name, title: `¡Feliz aniversario ${name}!`, sub: years ? `${years} ${years === 1 ? 'año' : 'años'} juntos` : 'Gracias por ser parte' };
}

export function buildAniversario(f, { efficient = false, config } = {}) {
  const occ = occupancy(f);
  const decor = [];
  const cake = findCenterpiece(f, occ, 2, 2);
  for (let y = 1; y < f.H - 1; y++) {
    for (let x = 1; x < f.W - 1; x++) {
      if (!f.floor[y]?.[x] || f.solid[y][x]) continue;
      const r = hash(x, y, 31);
      if (r < 0.1) decor.push({ type: 'confetti', x, y, seed: r * 10 });
      else if (occ.free(x, y) && f.walls[y - 1]?.[x] && !occ.nearDesk(x, y) && r < 0.16) { occ.mark(x, y); decor.push({ type: 'balloons', x, y, seed: r * 6 }); }
    }
  }
  for (const a of f.areas || []) {
    for (const [x0, x1] of occ.topSpans(a)) decor.push({ type: 'bunting', x: x0, y: a.y + 0.12, w: x1 - x0 });
  }
  const info = anniversaryInfo(config);
  const obj = cake && { id: 'season:cake', season: 'aniversario', x: cake.x, y: cake.y - 1, w: 2, h: 3, label: 'Foto del aniversario 📸' };
  return {
    decor, cake, info, efficient, objects: obj ? [obj] : [],
    confetti: Array.from({ length: efficient ? 30 : 90 }, (_, i) => ({ x: hash(i, 7, 1), y: hash(i, 8, 1), sp: 25 + hash(i, 9, 1) * 40, c: COLS[i % COLS.length], r: hash(i, 10, 1) * 6 })),
  };
}

function cakeDraw(ctx, X, Y, t, years) {
  const cx = X + T, by = Y + 2 * T - 6;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, by + 2, 32, 7, 0, 0, Math.PI * 2); ctx.fill();
  // mesa / base
  ctx.fillStyle = '#e9e4ef'; ctx.beginPath(); ctx.ellipse(cx, by - 2, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
  // tres pisos
  const tiers = [[by - 4, 26, 16, '#FE3377', '#ff7aa6'], [by - 20, 19, 14, '#fff5e6', '#ffffff'], [by - 34, 13, 12, '#FFCC00', '#ffe066']];
  for (const [ty, hw, h, c, top] of tiers) {
    ctx.fillStyle = c; ctx.fillRect(cx - hw, ty - h, hw * 2, h);
    ctx.beginPath(); ctx.ellipse(cx, ty, hw, 4, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(cx, ty - h, hw, 4, 0, 0, Math.PI * 2); ctx.fill();
    // betún que escurre
    ctx.fillStyle = c === '#fff5e6' ? '#FE3377' : '#ffffff';
    for (let i = -hw + 2; i < hw - 2; i += 5) ctx.fillRect(cx + i, ty - h + 1, 3, 2 + (Math.abs(i * 7) % 4));
  }
  // chispas de colores en el piso de abajo
  for (let i = 0; i < 10; i++) { ctx.fillStyle = COLS[i % COLS.length]; ctx.fillRect(cx - 22 + i * 4.5, by - 12 + (i % 3) * 3, 2, 1.3); }
  // velitas = años (hasta 15 a la vista)
  const n = Math.max(1, Math.min(15, years || 1));
  const topY = by - 46, span = Math.min(22, n * 3.2);
  for (let i = 0; i < n; i++) {
    const vx = n === 1 ? cx : cx - span / 2 + (span * i) / (n - 1);
    const vy = topY - (i % 2) * 2;
    ctx.fillStyle = COLS[i % 6]; ctx.fillRect(vx - 1, vy - 8, 2, 8);
    const fl = Math.sin(t / 70 + i * 1.7);
    const g = ctx.createRadialGradient(vx, vy - 11, 0.5, vx, vy - 11, 6);
    g.addColorStop(0, 'rgba(255,210,90,.6)'); g.addColorStop(1, 'rgba(255,210,90,0)');
    ctx.fillStyle = g; ctx.fillRect(vx - 6, vy - 17, 12, 12);
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.ellipse(vx, vy - 11 + fl * 0.3, 1.4, 2.6 + fl * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  // número de años
  if (years) {
    ctx.fillStyle = '#141414'; ctx.font = '800 9px "Public Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(years), cx, by - 13);
    ctx.textAlign = 'left';
  }
}
function balloons(ctx, X, Y, t, seed) {
  for (let i = 0; i < 3; i++) {
    const bx = X + 9 + i * 7, by = Y + 2 - (i % 2) * 6 + Math.sin(t / 700 + seed + i) * 1.5;
    ctx.strokeStyle = 'rgba(40,40,40,.5)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(bx, by + 6); ctx.quadraticCurveTo(bx + 2, by + 14, X + 16, Y + 26); ctx.stroke();
    ctx.fillStyle = COLS[(Math.floor(seed * 3) + i) % 6];
    ctx.beginPath(); ctx.ellipse(bx, by, 4.5, 5.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(bx - 2.5, by - 3, 1.5, 2);
  }
  ctx.fillStyle = '#9a9aa5'; ctx.fillRect(X + 13, Y + 25, 6, 3);
}
function bunting(ctx, d, t) {
  const x0 = d.x * T, x1 = (d.x + d.w) * T, yy = d.y * T;
  ctx.strokeStyle = 'rgba(40,30,30,.6)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x0, yy); ctx.quadraticCurveTo((x0 + x1) / 2, yy + 10, x1, yy); ctx.stroke();
  const n = Math.max(3, Math.floor((x1 - x0) / 12));
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n, px = x0 + (x1 - x0) * k, py = yy + 10 * 4 * k * (1 - k) * 0.5;
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(t / 650 + i) * 0.08);
    ctx.fillStyle = i % 2 ? '#FFCC00' : '#FE3377';
    ctx.beginPath(); ctx.moveTo(-4.5, 0); ctx.lineTo(4.5, 0); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

export function drawAniversarioDecor(ctx, s, t, view) {
  for (const d of s.decor) {
    const px = d.x * T, py = d.y * T;
    if (d.type !== 'bunting' && (px < view.x0 - 64 || px > view.x1 + 64 || py < view.y0 - 64 || py > view.y1 + 64)) continue;
    if (d.type === 'confetti') {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = COLS[(Math.floor(d.seed * 7) + i) % COLS.length];
        ctx.fillRect(px + hash(i, 1, d.seed) * 28, py + hash(i, 2, d.seed) * 28, 3, 1.6);
      }
    } else if (d.type === 'balloons') balloons(ctx, px, py, t, d.seed);
    else if (d.type === 'bunting') bunting(ctx, d, t);
  }
  if (s.cake) cakeDraw(ctx, s.cake.x * T, s.cake.y * T, t, s.info.years);
}

// Fuegos artificiales sin estado: cada "ranura" de tiempo lanza uno en un lugar distinto
function fireworks(ctx, t, W, H, slots) {
  const period = 2600;
  for (let s = 0; s < slots; s++) {
    const tt = t + s * (period / slots) * 1.37;
    const id = Math.floor(tt / period), age = (tt % period) / period;
    const x = W * (0.12 + hash(id, s, 41) * 0.76), y = H * (0.1 + hash(id, s, 42) * 0.3);
    const col = COLS[Math.floor(hash(id, s, 43) * 6)];
    if (age < 0.22) {
      // cohete subiendo
      const k = age / 0.22;
      ctx.fillStyle = 'rgba(255,230,160,.9)';
      ctx.fillRect(x - 1, y + (1 - k) * H * 0.45, 2, 6);
      continue;
    }
    const k = (age - 0.22) / 0.78, R = 18 + 70 * Math.sqrt(k);
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = col;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + id;
      ctx.fillRect(x + Math.cos(a) * R - 1.5, y + Math.sin(a) * R + k * k * 30 - 1.5, 3, 3);
    }
    ctx.fillStyle = '#fff';
    for (let i = 0; i < n; i += 3) {
      const a = (i / n) * Math.PI * 2 + id + 0.1;
      ctx.fillRect(x + Math.cos(a) * R * 0.6 - 1, y + Math.sin(a) * R * 0.6 + k * k * 20 - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

export function drawAniversarioSky(ctx, s, t, view, f) {
  ctx.fillStyle = 'rgba(254, 51, 119, 0.035)';
  ctx.fillRect(0, 0, f.W * T, f.H * T);
}

// En pantalla: fuegos artificiales, confeti que cae y el letrero sobre el pastel
export function drawAniversarioScreen(ctx, s, t, v) {
  const W = v.w, H = v.h, sec = t / 1000;
  fireworks(ctx, t, W, H, s.efficient ? 1 : 3);
  for (const p of s.confetti) {
    const y = ((p.y * H + sec * p.sp) % (H + 10)) - 5;
    const x = p.x * W + Math.sin(sec * 1.3 + p.r) * 16;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sec * 2 + p.r);
    ctx.fillStyle = p.c; ctx.fillRect(-3, -1.5, 6, 3);
    ctx.restore();
  }
  if (s.cake) {
    const p = toScreen(v, (s.cake.x + 1) * T, s.cake.y * T - 112);
    if (p.x > -300 && p.x < W + 300 && p.y > -80 && p.y < H + 80) {
      const z = Math.max(0.7, Math.min(1.3, v.zoom / 1.5));
      ctx.save();
      ctx.translate(p.x, p.y); ctx.scale(z, z);
      ctx.font = '800 15px "Public Sans", system-ui, sans-serif';
      const tw = Math.max(ctx.measureText(s.info.title).width, 120) + 34;
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#141414';
      ctx.beginPath(); ctx.roundRect(-tw / 2, -24, tw, 46, 12); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#FE3377'; ctx.fillRect(-tw / 2 + 12, -24, tw - 24, 3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(s.info.title, 0, -7);
      ctx.font = '700 11px "Public Sans", system-ui, sans-serif';
      ctx.fillStyle = '#FFCC00'; ctx.fillText(`🎉 ${s.info.sub} 🎉`, 0, 10);
      ctx.restore();
    }
  }
}
