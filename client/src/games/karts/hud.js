// Interfaz de la carrera encima del 3D (canvas 2D): lugar, vuelta, tiempos, objeto, velocidad,
// minimapa, cuenta regresiva, avisos y la tabla de posiciones.
import { drawCountdown } from '../netSync.js';
import { fmtTime, ITEMS, LAPS } from '@shared/karts.js';

const PINK = '#FE3377', YEL = '#FFCC00', INK = 'rgba(12,12,20,.72)';

function plate(g, x, y, w, h, r = 12, fill = INK) { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
function text(g, s, x, y, { size = 16, weight = 800, color = '#fff', align = 'left', base = 'alphabetic', stroke = 0, font = 'system-ui, sans-serif' } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align; g.textBaseline = base;
  if (stroke) { g.lineWidth = stroke; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(s, x, y); }
  g.fillStyle = color; g.fillText(s, x, y);
}
const DISPLAY = '"Archivo Black", "Sora", system-ui, sans-serif';

// Dibujo chico de cada objeto (para la casilla del objeto)
export function drawItemIcon(g, id, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 64, s / 64);
  if (id === 'cafe') {
    g.fillStyle = '#f4f4f6'; g.beginPath(); g.roundRect(-18, -14, 36, 38, 6); g.fill();
    g.fillStyle = PINK; g.fillRect(-18, -2, 36, 10);
    g.strokeStyle = '#f4f4f6'; g.lineWidth = 6; g.beginPath(); g.arc(22, 6, 9, -1.2, 1.2); g.stroke();
    g.fillStyle = '#6b3f22'; g.fillRect(-15, -14, 30, 5);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3;
    for (const k of [-8, 2, 12]) { g.beginPath(); g.moveTo(k - 4, -20); g.quadraticCurveTo(k + 4, -26, k - 2, -34); g.stroke(); }
  } else if (id === 'grapa') {
    g.strokeStyle = '#dfe5ec'; g.lineWidth = 8; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(-20, 20); g.lineTo(-20, -16); g.lineTo(20, -16); g.lineTo(20, 20); g.stroke();
    g.strokeStyle = '#8a95a3'; g.lineWidth = 2; g.beginPath(); g.moveTo(-16, -12); g.lineTo(16, -12); g.stroke();
    g.fillStyle = '#ff8a3d'; g.beginPath(); g.moveTo(-26, 26); g.lineTo(-30, 34); g.lineTo(-20, 30); g.fill();
  } else if (id === 'postit') {
    g.rotate(-0.12);
    g.fillStyle = '#ffe14d'; g.fillRect(-22, -22, 44, 44);
    g.fillStyle = '#ffd21a'; g.beginPath(); g.moveTo(22, 8); g.lineTo(22, 22); g.lineTo(8, 22); g.fill();
    g.fillStyle = '#c9a400'; g.fillRect(-14, -10, 26, 3); g.fillRect(-14, -2, 20, 3); g.fillRect(-14, 6, 14, 3);
  }
  g.restore();
}

export class Hud {
  constructor() { this.map = null; this.k = 1; }

  setTrack(T) {
    const S = T.samples;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of S) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const W = 200, H = 150;
    const sc = Math.min((W - 20) / (x1 - x0 || 1), (H - 20) / (z1 - z0 || 1));
    const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
    const proj = (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc];
    const pts = S.filter((_, i) => i % 2 === 0).map((p) => ({ xy: proj(p.x, p.z), y: p.y }));
    const maxY = Math.max(1, ...S.map((p) => p.y));
    this.map = { W, H, proj, pts, maxY, start: proj(S[0].x, S[0].z) };
  }

  draw(g, W, H, s) {
    g.clearRect(0, 0, W, H);
    const k = Math.min(1.3, Math.max(0.62, Math.min(W / 1150, H / 650)));
    this.k = k;
    g.save();
    g.scale(k, k);
    W /= k; H /= k;
    if (s.boost > 0) this.speedLines(g, W, H, s);
    if (s.race) {
      this.place(g, W, H, s);
      this.laps(g, W, H, s);
      this.item(g, W, H, s);
      this.speed(g, W, H, s);
      this.minimap(g, W, H, s);
      this.standings(g, W, H, s);
      if (s.drift) this.driftMeter(g, W, H, s);
    }
    if (s.cd != null) drawCountdown(g, W / 2, H * 0.36, s.cd, { size: 130, go: '¡YA!', color: YEL });
    if (s.banner) this.banner(g, W, H, s.banner);
    if (s.wrong) this.center(g, W, H * 0.3, '¡SENTIDO CONTRARIO!', '#ff5a5a', 0.5 + Math.sin(s.time * 10) * 0.5);
    if (s.watching) {
      plate(g, W / 2 - 170, 14, 340, 40, 20);
      text(g, `👀 Viendo a ${s.watching}`, W / 2, 41, { size: 17, align: 'center' });
      text(g, '← → para cambiar', W / 2, 70, { size: 13, align: 'center', color: 'rgba(255,255,255,.7)', stroke: 3 });
    }
    if (s.hint) { plate(g, W / 2 - 200, H - 58, 400, 34, 17); text(g, s.hint, W / 2, H - 35, { size: 14, align: 'center', color: 'rgba(255,255,255,.9)' }); }
    if (s.fps != null && s.showFps) text(g, `${s.fps} fps`, W - 10, H - 8, { size: 11, align: 'right', color: 'rgba(255,255,255,.5)' });
    g.restore();
  }

  place(g, W, H, s) {
    if (!s.place) return;
    const x = W - 26, y = H - 34;
    const col = s.place === 1 ? YEL : s.place === 2 ? '#dfe5ec' : s.place === 3 ? '#e0a060' : '#fff';
    text(g, String(s.place), x - 46, y, { size: 96, font: DISPLAY, color: col, align: 'right', stroke: 10, weight: 900 });
    text(g, 'º', x - 26, y - 46, { size: 40, font: DISPLAY, color: col, align: 'right', stroke: 6, weight: 900 });
    text(g, `/${s.total}`, x, y - 4, { size: 24, font: DISPLAY, color: '#fff', align: 'right', stroke: 5 });
  }

  laps(g, W, H, s) {
    plate(g, 16, 16, 236, 106, 16);
    text(g, 'VUELTA', 32, 44, { size: 13, color: 'rgba(255,255,255,.65)' });
    text(g, `${Math.min(LAPS, Math.max(1, s.lap))}`, 32, 86, { size: 44, font: DISPLAY });
    text(g, `/${LAPS}`, 32 + g.measureText(`${Math.min(LAPS, Math.max(1, s.lap))}`).width + 2, 86, { size: 22, font: DISPLAY, color: 'rgba(255,255,255,.7)' });
    text(g, fmtTime(s.raceT > 0 ? s.raceT : 0), 236, 50, { size: 22, align: 'right', font: 'ui-monospace, Menlo, monospace', weight: 700 });
    text(g, `vuelta ${fmtTime(s.lapT > 0 ? s.lapT : 0)}`, 236, 76, { size: 13, align: 'right', color: 'rgba(255,255,255,.75)', font: 'ui-monospace, Menlo, monospace', weight: 600 });
    text(g, `mejor ${fmtTime(s.best)}`, 236, 98, { size: 13, align: 'right', color: s.best != null ? YEL : 'rgba(255,255,255,.45)', font: 'ui-monospace, Menlo, monospace', weight: 700 });
    if (s.record != null) text(g, `récord ${fmtTime(s.record)}`, 236, 116, { size: 11, align: 'right', color: 'rgba(255,255,255,.5)', font: 'ui-monospace, Menlo, monospace', weight: 600 });
  }

  item(g, W, H, s) {
    const cx = W / 2, cy = 58, r = 40;
    g.save();
    g.fillStyle = INK; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = s.item || s.roulette ? YEL : 'rgba(255,255,255,.25)'; g.lineWidth = 4; g.stroke();
    if (s.roulette) {
      const ids = Object.keys(ITEMS);
      drawItemIcon(g, ids[Math.floor(s.time * 14) % ids.length], cx, cy, 52);
    } else if (s.item) {
      drawItemIcon(g, s.item, cx, cy, 56);
      text(g, s.touch ? 'Objeto' : 'E', cx, cy + r + 18, { size: 13, align: 'center', color: '#fff', stroke: 4 });
    }
    g.restore();
  }

  speed(g, W, H, s) {
    const x = W - 150, y = H - 150;
    const kmh = Math.round(Math.abs(s.kmh || 0));
    text(g, String(kmh), x + 92, y, { size: 30, align: 'right', font: DISPLAY, stroke: 6 });
    text(g, 'km/h', x + 98, y, { size: 12, align: 'left', color: 'rgba(255,255,255,.8)', stroke: 3 });
  }

  driftMeter(g, W, H, s) {
    const tier = s.drift.tier, ch = Math.min(1, s.drift.charge / 2.1);
    const x = W / 2 - 80, y = H - 92;
    plate(g, x, y, 160, 14, 7, 'rgba(0,0,0,.45)');
    const col = tier === 2 ? '#ff8a3d' : tier === 1 ? '#3ad1ff' : '#ffe9a8';
    plate(g, x + 2, y + 2, Math.max(10, 156 * ch), 10, 5, col);
    plate(g, x + 156 * (1 / 2.1) + 2, y, 2, 14, 0, 'rgba(255,255,255,.6)');
    text(g, tier === 2 ? '¡TURBO MAX!' : tier === 1 ? 'MINI TURBO' : 'DERRAPE', W / 2, y - 6, { size: 13, align: 'center', color: col, stroke: 4 });
  }

  minimap(g, W, H, s) {
    const M = this.map;
    if (!M) return;
    const x = 16, y = H - M.H - 16;
    plate(g, x, y, M.W, M.H, 14, 'rgba(12,12,20,.55)');
    g.save(); g.translate(x, y);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); M.pts.forEach((p, i) => (i ? g.lineTo(p.xy[0], p.xy[1]) : g.moveTo(p.xy[0], p.xy[1]))); g.closePath(); };
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 7; path(); g.stroke();
    g.strokeStyle = '#3a3e48'; g.lineWidth = 4; path(); g.stroke();
    // lo alto se ve más claro (pisos de la torre)
    for (let i = 1; i < M.pts.length; i++) {
      const a = M.pts[i - 1], b = M.pts[i];
      if (a.y < 0.6) continue;
      g.strokeStyle = `rgba(255,204,0,${0.25 + (a.y / M.maxY) * 0.6})`; g.lineWidth = 4;
      g.beginPath(); g.moveTo(a.xy[0], a.xy[1]); g.lineTo(b.xy[0], b.xy[1]); g.stroke();
    }
    g.fillStyle = '#fff'; g.fillRect(M.start[0] - 4, M.start[1] - 4, 8, 8);
    g.fillStyle = '#141414'; g.fillRect(M.start[0] - 4, M.start[1] - 4, 4, 4); g.fillRect(M.start[0], M.start[1], 4, 4);
    const list = [...(s.karts || [])].sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0));
    for (const kk of list) {
      const [px, pz] = M.proj(kk.x, kk.z);
      g.fillStyle = kk.color; g.strokeStyle = kk.me ? '#fff' : 'rgba(0,0,0,.7)'; g.lineWidth = kk.me ? 3 : 1.5;
      g.beginPath(); g.arc(px, pz, kk.me ? 6.5 : 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.restore();
  }

  standings(g, W, H, s) {
    const list = s.standings || [];
    if (!list.length) return;
    const x = 16, y0 = 134, rh = 24;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const y = y0 + i * (rh + 3);
      plate(g, x, y, 190, rh, 8, r.me ? 'rgba(254,51,119,.85)' : 'rgba(12,12,20,.6)');
      text(g, `${i + 1}`, x + 18, y + 17, { size: 14, align: 'center', font: DISPLAY });
      g.fillStyle = r.color; g.fillRect(x + 32, y + 6, 8, 12);
      text(g, r.name, x + 48, y + 17, { size: 13, weight: 700, color: '#fff' });
      if (r.finished) text(g, '🏁', x + 180, y + 17, { size: 13, align: 'right' });
      else if (r.ai) text(g, 'bot', x + 182, y + 17, { size: 10, align: 'right', color: 'rgba(255,255,255,.5)' });
    }
  }

  speedLines(g, W, H, s) {
    g.save();
    g.globalAlpha = Math.min(0.5, s.boost * 0.6);
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + s.time * 0.5;
      const r0 = Math.min(W, H) * (0.42 + ((i * 37 + Math.floor(s.time * 30)) % 10) / 40);
      g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0 * 0.7); g.lineTo(W / 2 + Math.cos(a) * (r0 + 90), H / 2 + Math.sin(a) * (r0 + 90) * 0.7); g.stroke();
    }
    g.restore();
  }

  banner(g, W, H, b) {
    const a = Math.min(1, b.t * 2.5, (b.dur - b.t) * 5);
    g.save(); g.globalAlpha = Math.max(0, Math.min(1, a));
    const y = H * 0.24;
    text(g, b.title, W / 2, y, { size: b.big ? 64 : 44, font: DISPLAY, color: b.color || '#fff', align: 'center', stroke: 9, weight: 900 });
    if (b.sub) text(g, b.sub, W / 2, y + 34, { size: 18, align: 'center', color: '#fff', stroke: 4 });
    g.restore();
  }

  center(g, W, y, t, color, alpha = 1) {
    g.save(); g.globalAlpha = alpha;
    text(g, t, W / 2, y, { size: 34, font: DISPLAY, color, align: 'center', stroke: 8, weight: 900 });
    g.restore();
  }
}
