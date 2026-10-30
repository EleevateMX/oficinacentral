// Interfaz encima del 3D (canvas 2D): vida, balas, hordas, jefe, equipo, mira, tienda y pantallas.
import { CELL } from '@shared/zombies.js';
import { weaponCard, loadoutBar, energyMeter, abilities, dynamicCrosshair, scope, killFeed, damageNumbers, ammoPrompts, weaponWheel, techScreen, slowMoTint } from './weaponHud.js';

const PINK = '#FE3377', YEL = '#FFCC00', GREEN = '#7CFF4F', INK = 'rgba(12,12,18,.78)';
const fmt = (n) => Math.round(n).toLocaleString('es-MX');

function plate(g, x, y, w, h, r = 10, fill = INK) { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
function text(g, s, x, y, { size = 16, weight = 800, color = '#fff', align = 'left', base = 'alphabetic', stroke = 0, font = 'system-ui, sans-serif' } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align; g.textBaseline = base;
  if (stroke) { g.lineWidth = stroke; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(s, x, y); }
  g.fillStyle = color; g.fillText(s, x, y);
}
function bar(g, x, y, w, h, k, color, back = 'rgba(255,255,255,.12)') {
  plate(g, x, y, w, h, h / 2, back);
  if (k > 0) plate(g, x, y, Math.max(h, w * Math.min(1, k)), h, h / 2, color);
}

// Mira: 'cruz' | 'punto' | 'circulo' | 'cruzpunto' (también la usa la vista previa de Opciones)
export function drawCrosshair(g, cx, cy, { style = 'cruz', color = '#ffffff', gap = 6, scale = 1 } = {}) {
  const L = 9 * scale;
  const lines = [[cx - gap - L, cy, cx - gap, cy], [cx + gap, cy, cx + gap + L, cy], [cx, cy - gap - L, cx, cy - gap], [cx, cy + gap, cx, cy + gap + L]];
  const cross = style === 'cruz' || style === 'cruzpunto';
  const dot = style === 'punto' || style === 'cruzpunto';
  g.lineCap = 'butt';
  for (const [w, c] of [[4 * scale, 'rgba(0,0,0,.6)'], [2 * scale, color]]) {
    g.strokeStyle = c; g.lineWidth = w;
    if (cross) for (const [a, b, c2, d] of lines) { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); }
    if (style === 'circulo') { g.beginPath(); g.arc(cx, cy, gap + 5 * scale, 0, Math.PI * 2); g.stroke(); }
  }
  const r = (dot ? 2.4 : 1.2) * scale;
  g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(cx, cy, r + 1.2 * scale, 0, Math.PI * 2); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
}

export class Hud {
  constructor() { this.buttons = []; this.mini = null; this.miniKey = ''; }

  button(g, id, label, x, y, w, h, { primary = false, small = false } = {}) {
    const hot = this.hover && this.hover.x >= x && this.hover.x <= x + w && this.hover.y >= y && this.hover.y <= y + h;
    plate(g, x, y, w, h, 12, primary ? (hot ? '#ff5a93' : PINK) : hot ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.12)');
    text(g, label, x + w / 2, y + h / 2 + 1, { size: small ? 13 : 16, align: 'center', base: 'middle', color: '#fff' });
    this.buttons.push({ id, x, y, w, h });
  }
  hit(x, y) { return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.id || null; }

  draw(g, W, H, s) {
    this.buttons = [];
    g.clearRect(0, 0, W, H);
    const k = Math.min(1.25, Math.max(0.7, W / 1100));
    this.k = k;
    g.save();
    g.scale(k, k);
    W /= k; H /= k;
    this.vignette(g, W, H, s);
    if (s.view === 'play' || s.view === 'watch') {
      techScreen(g, W, H, s);
      slowMoTint(g, W, H, s);
      scope(g, W, H, s);
      this.crosshair(g, W, H, s);
      this.miniBottom = 60;
      this.topBar(g, W, H, s);
      if (s.net) this.netInfo(g, W, H, s.net);
      this.teamBottom = this.team(g, W, H, s);
      if (s.showMinimap !== false) this.minimap(g, W, H, s);
      if (s.me) { this.health(g, W, H, s); this.ammo(g, W, H, s); }
      damageNumbers(g, W, H, s);
      killFeed(g, W, H, s, this.miniBottom + 12);
      this.popups(g, W, H, s);
      this.feed(g, W, H, s);
      this.prompts(g, W, H, s);
      ammoPrompts(g, W, H, s);
      if (s.touch && s.view === 'play') this.touch(g, W, H, s);
      weaponWheel(g, W, H, s);
    }
    // menús, tienda, fin y anuncios: en HTML (menu.js)
    if (s.phase === 'intro') this.intro(g, W, H, s);
    g.restore();
    // los botones se guardan en pixeles de pantalla
    for (const b of this.buttons) { b.x *= k; b.y *= k; b.w *= k; b.h *= k; }
  }

  vignette(g, W, H, s) {
    if (s.hurt > 0) {
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      gr.addColorStop(0, 'rgba(255,0,40,0)'); gr.addColorStop(1, `rgba(200,0,30,${Math.min(0.6, s.hurt)})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (s.hurtDir != null) {
        // de dónde vino el golpe
        g.save(); g.translate(W / 2, H / 2); g.rotate(s.hurtDir);
        g.fillStyle = `rgba(255,40,60,${Math.min(0.8, s.hurt * 1.4)})`;
        g.beginPath(); g.moveTo(0, -H * 0.36); g.lineTo(-22, -H * 0.31); g.lineTo(22, -H * 0.31); g.fill();
        g.restore();
      }
    }
    if (s.me && !s.me.alive) { g.fillStyle = 'rgba(40,0,0,.35)'; g.fillRect(0, 0, W, H); }
    if (s.lowHp) {
      const a = 0.18 + Math.sin(s.time * 6) * 0.08;
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.9);
      gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(255,0,0,${a})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  }

  crosshair(g, W, H, s) {
    dynamicCrosshair(g, W, H, s, drawCrosshair);
  }

  topBar(g, W, H, s) {
    const cx = W / 2;
    plate(g, cx - 120, 12, 240, 50, 14);
    text(g, s.wave ? `HORDA ${s.wave}` : 'PREPÁRATE', cx, 36, { size: 22, weight: 900, align: 'center', color: s.bossWave ? '#ff5050' : YEL });
    const sub = s.phase === 'break' ? `Descanso · ${Math.ceil(s.pt)} s` : s.phase === 'fight' ? `🧟 Quedan ${s.left}` : s.phase === 'intro' ? 'Llegan en un momento…' : '';
    text(g, sub, cx, 55, { size: 13, weight: 700, align: 'center', color: '#e8e8ee' });
    if (s.boss) {
      const bw = Math.min(520, W * 0.5);
      plate(g, cx - bw / 2 - 10, 70, bw + 20, 44, 12, 'rgba(30,0,6,.82)');
      text(g, `☠ ${s.boss.name}`, cx, 88, { size: 15, weight: 900, align: 'center', color: '#ffb3b3' });
      bar(g, cx - bw / 2, 96, bw, 10, s.boss.hp / s.boss.max, s.boss.hp / s.boss.max < 0.4 ? '#ff2a2a' : '#ff6b3d', 'rgba(255,255,255,.1)');
    }
    // puntos
    plate(g, W - 170, 12, 158, 40, 12);
    text(g, '💰', W - 158, 39, { size: 18 });
    text(g, fmt(s.me?.pts ?? s.watchPts ?? 0), W - 24, 39, { size: 21, weight: 900, align: 'right', color: YEL });
  }

  // Arriba a la izquierda: fps y ping (opcional) y el aviso de si lo trabado es la red o la compu
  netInfo(g, W, H, n) {
    let y = 12;
    if (n.show) {
      const parts = [`${n.fps || 0} fps`];
      if (n.ping != null) parts.push(`${n.ping} ms`);
      if (n.loss != null) parts.push(`${Math.round(n.loss * 100)}% pérdida`);
      if (n.q) parts.push(n.q);
      const t = parts.join(' · ');
      g.font = '800 12px system-ui, sans-serif';
      const w = g.measureText(t).width + 30;
      plate(g, 12, y, w, 24, 8);
      const bad = (n.fps && n.fps < 40) || (n.ping != null && n.ping > 180) || (n.loss != null && n.loss > 0.03);
      const ok = (n.fps || 0) >= 55 && (n.ping == null || n.ping < 100);
      g.fillStyle = bad ? '#ff5050' : ok ? '#4cd964' : '#ffb03b';
      g.beginPath(); g.arc(23, y + 12, 4, 0, Math.PI * 2); g.fill();
      text(g, t, 32, y + 16.5, { size: 12, weight: 800, color: '#e8e8ee' });
      y += 28;
    }
    if (n.warn) {
      const t = n.level === 'net' ? `⚠ ${n.warn}` : `🐢 ${n.warn}`;
      g.font = '800 12.5px system-ui, sans-serif';
      const w = g.measureText(t).width + 22;
      plate(g, 12, y, w, 24, 8, n.level === 'net' ? 'rgba(120,10,20,.82)' : 'rgba(110,70,0,.82)');
      text(g, t, 23, y + 16.5, { size: 12.5, weight: 800, color: n.level === 'net' ? '#ffd0d6' : '#ffe2a6' });
    }
  }

  team(g, W, H, s) {
    const list = s.team || [];
    if (list.length < 2 && !s.watching) return 74;
    let y = 74;
    for (const p of list) {
      plate(g, 12, y, 190, 40, 10);
      g.fillStyle = p.color; g.fillRect(20, y + 9, 6, 22);
      text(g, p.name + (p.host ? ' ★' : ''), 34, y + 17, { size: 13, weight: 800, color: p.me ? YEL : '#fff' });
      const st = p.down ? `CAÍDO ${Math.ceil(p.downT)}s` : !p.alive ? 'Fuera' : `${p.hp}`;
      text(g, st, 194, y + 17, { size: 12, weight: 800, align: 'right', color: p.down ? '#ff8080' : !p.alive ? '#999' : '#bff7c0' });
      bar(g, 34, y + 25, 160, 7, p.alive ? p.hp / 100 : p.down ? p.downT / 30 : 0, p.down ? '#ff5050' : p.hp > 40 ? '#4cd964' : '#ffb03b');
      y += 46;
    }
    return y;
  }

  minimap(g, W, H, s) {
    const L = s.level;
    if (!L) return;
    const c = Math.min(4, 150 / L.W);
    const mw = L.W * c, mh = L.H * c;
    const x0 = W - mw - 14, y0 = 60;
    const key = `${L.W}x${L.H}:${c}`;
    if (this.miniKey !== key) {
      this.miniKey = key;
      this.mini = document.createElement('canvas');
      this.mini.width = mw; this.mini.height = mh;
      const m = this.mini.getContext('2d');
      for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
        const v = L.grid[y * L.W + x];
        m.fillStyle = v === CELL.EMPTY ? 'rgba(255,255,255,.08)' : v === CELL.PORTAL ? 'rgba(124,255,79,.55)' : v === CELL.SOLID ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.5)';
        m.fillRect(x * c, y * c, c, c);
      }
    }
    plate(g, x0 - 6, y0 - 6, mw + 12, mh + 12, 10, 'rgba(12,12,18,.6)');
    this.miniBottom = y0 + mh + 6;
    g.drawImage(this.mini, x0, y0);
    for (const z of s.zombies || []) { g.fillStyle = z.boss ? '#ff2a2a' : '#ff6b6b'; const r = z.boss ? 3 : 1.6; g.fillRect(x0 + z.x * c - r, y0 + z.y * c - r, r * 2, r * 2); }
    for (const p of s.team || []) {
      if (!p.alive && !p.down) continue;
      g.save(); g.translate(x0 + p.x * c, y0 + p.y * c); g.rotate(p.a);
      g.fillStyle = p.color; g.beginPath(); g.moveTo(5, 0); g.lineTo(-3, -3.5); g.lineTo(-3, 3.5); g.fill();
      g.restore();
    }
  }

  health(g, W, H, s) {
    const P = s.me;
    plate(g, 14, H - 78, 270, 64, 14);
    text(g, '❤', 28, H - 38, { size: 22, color: '#ff4d6d' });
    text(g, String(Math.max(0, Math.ceil(P.hp))), 56, H - 36, { size: 30, weight: 900 });
    bar(g, 120, H - 56, 150, 12, P.hp / 100, P.hp > 40 ? '#4cd964' : '#ff4d4d');
    if (P.armor > 0) { text(g, '🦺', 120, H - 22, { size: 13 }); bar(g, 142, H - 32, 128, 8, P.armor / 100, '#57c7ff'); }
    if (P.dmgLvl) text(g, '★'.repeat(P.dmgLvl), 270, H - 64, { size: 11, color: YEL, align: 'right' });
  }

  // dashboard de armas (weaponHud.js)
  ammo(g, W, H, s) {
    if (!s.arms) return;
    abilities(g, W, H, s);
    energyMeter(g, W, H, s);
    loadoutBar(g, W, H, s);
    weaponCard(g, W, H, s);
  }

  popups(g, W, H, s) {
    const list = s.popups || [];
    for (const [i, p] of list.entries()) {
      const a = Math.min(1, p.t * 2);
      g.globalAlpha = a;
      text(g, p.text, W / 2 + 34, H / 2 - 20 - (1 - p.t) * 40 - (list.length - 1 - i) * 24, { size: p.big ? 22 : 16, weight: 900, color: p.color || YEL, stroke: 4 });
    }
    g.globalAlpha = 1;
  }

  feed(g, W, H, s) {
    let y = (this.teamBottom || 74) + 8;
    for (const f of (s.feed || []).slice(-4)) {
      g.globalAlpha = Math.min(1, f.t);
      g.font = '700 12.5px system-ui, sans-serif';
      const w = Math.max(160, g.measureText(f.text).width + 22);
      plate(g, 12, y, w, 26, 8);
      text(g, f.text, 22, y + 18, { size: 12.5, weight: 700, color: f.color || '#fff' });
      y += 30;
    }
    g.globalAlpha = 1;
  }

  prompts(g, W, H, s) {
    const lines = [];
    if (s.me && s.me.down) lines.push([`¡Caíste! Un compañero puede levantarte · ${Math.ceil(s.me.downT)} s`, '#ff8080']);
    else if (s.me && !s.me.alive && s.phase !== 'over') lines.push(['Quedaste fuera de esta horda · vuelves en el descanso', '#ffb3b3']);
    if (s.revivePrompt) lines.push([`Mantén E para levantar a ${s.revivePrompt.name}`, GREEN]);
    if (s.phase === 'break' && !s.shopOpen) lines.push([s.touch ? 'Toca 🛒 para la tienda' : `B: tienda · Enter: ${s.ready ? 'listo ✓' : 'estoy listo'}`, '#fff']);
    if (s.watching) lines.push([`👀 Mirando a ${s.watching} · clic para cambiar`, '#fff']);
    if (s.prot) lines.push(['🛡 Protección de llegada', '#9fe3ff']);
    let y = H - 120;
    for (const [t, c] of lines) {
      g.font = '800 15px system-ui, sans-serif';
      const w = g.measureText(t).width + 28;
      plate(g, W / 2 - w / 2, y - 22, w, 32, 10);
      text(g, t, W / 2, y, { size: 15, align: 'center', color: c });
      y -= 40;
    }
    if (s.revivePrompt?.k > 0) { g.strokeStyle = GREEN; g.lineWidth = 5; g.beginPath(); g.arc(W / 2, H / 2, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.revivePrompt.k); g.stroke(); }
    if (s.joinable) this.button(g, 'join', 'Unirse a la partida', W / 2 - 110, H - 70, 220, 44, { primary: true });
  }

  touch(g, W, H, s) {
    const T = s.touch;
    g.globalAlpha = 0.5;
    plate(g, 40, H - 210, 150, 150, 75, 'rgba(255,255,255,.12)');
    g.globalAlpha = 0.8;
    plate(g, 115 + (T.sx || 0) * 45 - 28, H - 135 + (T.sy || 0) * 45 - 28, 56, 56, 28, 'rgba(255,255,255,.35)');
    g.globalAlpha = 1;
    this.button(g, 'fire', s.arms?.sword ? '⚔' : '🔫', W - 150, H - 210, 110, 110, { primary: true });
    this.button(g, 'bash', 'V', W - 300, H - 310, 60, 60, { small: true });
    if (s.arms?.hasSword) this.button(g, 'tech', 'Q', W - 230, H - 310, 60, 60, { small: true, primary: s.arms.techReady });
    if (s.arms && !s.arms.sword) this.button(g, 'ads', '◎', W - 150, H - 310, 60, 60, { small: true, primary: s.arms.ads > 0.5 });
    this.button(g, 'reload', 'R', W - 230, H - 150, 60, 60, { small: true });
    this.button(g, 'swap', '⇄', W - 230, H - 230, 60, 60, { small: true });
    this.button(g, 'menu', '☰', W - 66, 64, 50, 40, { small: true });
    if (s.phase === 'break') this.button(g, 'shop', '🛒', W - 300, H - 150, 60, 60, { small: true });
    if (s.revivePrompt) this.button(g, 'revive', '⛑', W - 300, H - 230, 60, 60, { small: true });
  }

  intro(g, W, H, s) {
    if (s.menu) return;
    const n = Math.ceil(s.pt);
    text(g, n > 0 ? String(n) : '', W / 2, H / 2 + 80, { size: 64, weight: 900, align: 'center', color: YEL, stroke: 10 });
  }
}
