// Interfaz encima del 3D (canvas 2D): vida, balas, hordas, jefe, equipo, mira, tienda y pantallas.
import { WEAPONS, SHOP, CELL } from '@shared/zombies.js';
import { itemCost } from './sim.js';

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
      this.crosshair(g, W, H, s);
      this.topBar(g, W, H, s);
      this.team(g, W, H, s);
      this.minimap(g, W, H, s);
      if (s.me) { this.health(g, W, H, s); this.ammo(g, W, H, s); }
      this.popups(g, W, H, s);
      this.feed(g, W, H, s);
      this.prompts(g, W, H, s);
      if (s.touch && s.view === 'play') this.touch(g, W, H, s);
    }
    this.banner(g, W, H, s);
    if (s.phase === 'intro') this.intro(g, W, H, s);
    if (s.shopOpen) this.shop(g, W, H, s);
    if (s.phase === 'over') this.over(g, W, H, s);
    else if (s.menu) this.menu(g, W, H, s);
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
    if (s.menu || s.shopOpen || s.phase === 'over' || (s.me && !s.me.alive)) return;
    const cx = W / 2, cy = H / 2, gap = 6 + s.spread * 16;
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4;
    const lines = [[cx - gap - 9, cy, cx - gap, cy], [cx + gap, cy, cx + gap + 9, cy], [cx, cy - gap - 9, cx, cy - gap], [cx, cy + gap, cx, cy + gap + 9]];
    for (const [a, b, c, d] of lines) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    for (const [a, b, c, d] of lines) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    g.fillStyle = '#fff'; g.fillRect(cx - 1, cy - 1, 2, 2);
    if (s.hitT > 0) {
      const a = Math.min(1, s.hitT * 6), r = 9 + (1 - a) * 4;
      g.strokeStyle = s.hitKill ? `rgba(255,60,80,${a})` : s.hitHead ? `rgba(255,204,0,${a})` : `rgba(255,255,255,${a})`;
      g.lineWidth = s.hitKill ? 3.5 : 2.5;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(cx + dx * r, cy + dy * r); g.lineTo(cx + dx * (r + 7), cy + dy * (r + 7)); g.stroke(); }
    }
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

  team(g, W, H, s) {
    const list = s.team || [];
    if (list.length < 2 && !s.watching) return;
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

  ammo(g, W, H, s) {
    const L = s.loadout;
    if (!L) return;
    const Wp = WEAPONS[L.cur];
    plate(g, W - 300, H - 78, 286, 64, 14);
    text(g, Wp.name, W - 286, H - 52, { size: 14, weight: 800, color: '#e8e8ee' });
    const res = L.res[L.cur] === Infinity ? '∞' : L.res[L.cur];
    text(g, L.reloadT > 0 ? 'Recargando…' : `${L.mag[L.cur]}`, W - 286, H - 22, { size: L.reloadT > 0 ? 18 : 30, weight: 900, color: L.mag[L.cur] === 0 ? '#ff6b6b' : '#fff' });
    if (L.reloadT <= 0) text(g, `/ ${res}`, W - 286 + g.measureText(`${L.mag[L.cur]}`).width + 8, H - 22, { size: 16, weight: 700, color: '#aab' });
    for (let i = 0; i < 3; i++) {
      const x = W - 120 + i * 34, y = H - 66;
      plate(g, x, y, 28, 40, 8, i === L.cur ? PINK : L.owned[i] ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.05)');
      text(g, String(i + 1), x + 14, y + 26, { size: 15, weight: 900, align: 'center', color: L.owned[i] ? '#fff' : '#666' });
    }
    if (L.reloadT > 0) bar(g, W - 286, H - 16, 150, 4, 1 - L.reloadT / Wp.reload, YEL);
  }

  popups(g, W, H, s) {
    for (const p of s.popups || []) {
      const a = Math.min(1, p.t * 2);
      g.globalAlpha = a;
      text(g, p.text, W / 2 + 34, H / 2 - 20 - (1 - p.t) * 40, { size: p.big ? 22 : 16, weight: 900, color: p.color || YEL, stroke: 4 });
    }
    g.globalAlpha = 1;
  }

  feed(g, W, H, s) {
    let y = 230;
    for (const f of (s.feed || []).slice(-4)) {
      g.globalAlpha = Math.min(1, f.t);
      plate(g, W - 250, y, 236, 26, 8);
      text(g, f.text, W - 240, y + 18, { size: 12.5, weight: 700, color: f.color || '#fff' });
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
    this.button(g, 'fire', '🔫', W - 150, H - 210, 110, 110, { primary: true });
    this.button(g, 'reload', 'R', W - 230, H - 150, 60, 60, { small: true });
    this.button(g, 'swap', '⇄', W - 230, H - 230, 60, 60, { small: true });
    this.button(g, 'menu', '☰', W - 66, 64, 50, 40, { small: true });
    if (s.phase === 'break') this.button(g, 'shop', '🛒', W - 300, H - 150, 60, 60, { small: true });
    if (s.revivePrompt) this.button(g, 'revive', '⛑', W - 300, H - 230, 60, 60, { small: true });
  }

  banner(g, W, H, s) {
    const b = s.banner;
    if (!b) return;
    const life = b.t / b.dur;
    const inK = Math.min(1, (1 - life) * 6), outK = Math.min(1, life * 3);
    const a = Math.min(inK, outK);
    g.save();
    g.globalAlpha = a;
    g.translate(W / 2, H * 0.32);
    const sc = 0.8 + 0.2 * inK;
    g.scale(sc, sc);
    if (b.boss) { g.fillStyle = 'rgba(80,0,10,.55)'; g.fillRect(-W, -60, W * 2, 120); }
    text(g, b.title, 0, 0, { size: b.boss ? 58 : 66, weight: 900, align: 'center', base: 'middle', color: b.color || '#fff', stroke: 10 });
    if (b.sub) text(g, b.sub, 0, 50, { size: 22, weight: 800, align: 'center', base: 'middle', color: '#fff', stroke: 6 });
    g.restore();
  }

  intro(g, W, H, s) {
    if (s.menu) return;
    const n = Math.ceil(s.pt);
    text(g, n > 0 ? String(n) : '', W / 2, H / 2 + 80, { size: 64, weight: 900, align: 'center', color: YEL, stroke: 10 });
  }

  shop(g, W, H, s) {
    const P = s.me;
    const w = 520, h = 70 + SHOP.length * 54, x = W / 2 - w / 2, y = H / 2 - h / 2;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, H);
    plate(g, x, y, w, h, 18, 'rgba(18,17,26,.96)');
    text(g, '🛒 Tienda de la oficina', x + 22, y + 38, { size: 21, weight: 900 });
    text(g, `💰 ${fmt(P?.pts || 0)}`, x + w - 22, y + 38, { size: 18, weight: 900, align: 'right', color: YEL });
    SHOP.forEach((it, i) => {
      const yy = y + 58 + i * 54;
      const cost = itemCost(P, it);
      const owned = it.weapon != null && P?.owned[it.weapon];
      const maxed = it.id === 'upgrade' && P?.dmgLvl >= 3;
      const can = P && !owned && !maxed && P.pts >= cost;
      const hot = this.hover && this.hover.x >= x + 12 && this.hover.x <= x + w - 12 && this.hover.y >= yy && this.hover.y <= yy + 48;
      plate(g, x + 12, yy, w - 24, 48, 12, hot && can ? 'rgba(254,51,119,.28)' : 'rgba(255,255,255,.06)');
      text(g, `${i + 1}`, x + 32, yy + 30, { size: 16, weight: 900, color: '#888', align: 'center' });
      text(g, it.name, x + 52, yy + 21, { size: 15.5, weight: 800, color: can ? '#fff' : '#9a9aa6' });
      text(g, it.desc, x + 52, yy + 39, { size: 12, weight: 600, color: '#9a9aa6' });
      text(g, owned ? 'Ya la tienes' : maxed ? 'Máximo' : `💰 ${fmt(cost)}`, x + w - 28, yy + 30, { size: 15, weight: 900, align: 'right', color: can ? YEL : '#77777f' });
      this.buttons.push({ id: `buy:${it.id}`, x: x + 12, y: yy, w: w - 24, h: 48 });
    });
    this.button(g, 'closeShop', 'Cerrar (B)', x + w - 150, y + h + 10, 150, 40);
    this.button(g, 'ready', s.ready ? 'Listo ✓' : 'Estoy listo (Enter)', x, y + h + 10, 200, 40, { primary: !s.ready });
  }

  menu(g, W, H, s) {
    g.fillStyle = 'rgba(6,6,10,.62)'; g.fillRect(0, 0, W, H);
    const w = 460, x = W / 2 - w / 2, y = H / 2 - 170;
    plate(g, x, y, w, 340, 20, 'rgba(18,17,26,.96)');
    text(g, '🧟 Zombies en la oficina', W / 2, y + 46, { size: 26, weight: 900, align: 'center', color: GREEN });
    text(g, s.solo ? 'En pausa' : 'La partida sigue corriendo', W / 2, y + 74, { size: 14, weight: 700, align: 'center', color: '#bbb' });
    const help = s.touch ? ['Palanca: moverte · arrastra a la derecha: apuntar', 'Botón rosa: disparar'] : ['WASD moverte · mouse apuntar · clic disparar', '1-3 o rueda: arma · R recargar · Shift correr', '← → girar · E levantar · B tienda · Esc pausa'];
    help.forEach((t, i) => text(g, t, W / 2, y + 108 + i * 22, { size: 13.5, weight: 600, align: 'center', color: '#e8e8ee' }));
    this.button(g, 'resume', s.view === 'watch' ? 'Mirar' : s.touch ? 'Jugar' : 'Jugar (clic)', x + 40, y + 190, w - 80, 46, { primary: true });
    this.button(g, 'quality', `Calidad: ${s.quality === 'alta' ? 'Alta' : 'Baja'}`, x + 40, y + 246, (w - 90) / 2, 40);
    this.button(g, 'leave', 'Volver a la oficina', x + 50 + (w - 90) / 2, y + 246, (w - 90) / 2, 40);
    if (s.fps) text(g, `${s.fps} fps`, x + w - 16, y + 330, { size: 11, weight: 600, align: 'right', color: '#666' });
  }

  over(g, W, H, s) {
    g.fillStyle = 'rgba(20,0,4,.68)'; g.fillRect(0, 0, W, H);
    const w = 500, h = 330, x = W / 2 - w / 2, y = H / 2 - h / 2;
    plate(g, x, y, w, h, 20, 'rgba(18,17,26,.97)');
    text(g, '☠ Los zombis tomaron la oficina', W / 2, y + 50, { size: 25, weight: 900, align: 'center', color: '#ff6b6b' });
    const st = s.summary || {};
    const cells = [['Horda', st.wave ?? s.wave], ['Zombis', st.kills ?? 0], ['Puntuación', fmt(st.score ?? 0)]];
    cells.forEach(([l, v], i) => {
      const cx = x + 90 + i * 160;
      text(g, String(v), cx, y + 125, { size: 38, weight: 900, align: 'center', color: i === 2 ? YEL : '#fff' });
      text(g, l, cx, y + 150, { size: 13, weight: 700, align: 'center', color: '#aab' });
    });
    if (st.best) text(g, '🏆 ¡Tu mejor puntuación!', W / 2, y + 190, { size: 16, weight: 800, align: 'center', color: YEL });
    if (s.canRestart) this.button(g, 'restart', 'Jugar otra vez', x + 40, y + 230, 200, 48, { primary: true });
    else text(g, 'Esperando a que alguien empiece otra…', x + 140, y + 260, { size: 13, weight: 600, align: 'center', color: '#bbb' });
    this.button(g, 'leave', 'Volver a la oficina', x + w - 240, y + 230, 200, 48);
  }
}
