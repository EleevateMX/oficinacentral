// "Dashboard" de armas del HUD (canvas 2D): tarjeta del arma, barra de armas, energía de técnica,
// habilidades con enfriamiento, mira dinámica, mira telescópica, marcadores de golpe, registro de
// bajas con íconos, números de daño, avisos de munición, rueda de armas y efectos de técnica.
// Mismo estilo que el menú de Zombies: paneles oscuros, verde neón y rosa #FE3377.
import { ARMS, TECHNIQUES, ZOMBIE_TYPES, BOSSES } from '@shared/zombies.js';
import { iconImage } from './icons.js';

const PINK = '#FE3377', GREEN = '#7CFF4F', YEL = '#FFCC00', RED = '#ff4a5a';
const PANEL = 'rgba(10,12,24,.82)', PANEL2 = 'rgba(18,21,40,.9)', LINE = 'rgba(156,190,217,.22)';
const DISPLAY = "'Oxanium', 'Sora', system-ui, sans-serif";
const BODY = "'Manrope', system-ui, sans-serif";

function font(g, size, weight = 700, fam = DISPLAY) { g.font = `${weight} ${size}px ${fam}`; }
function txt(g, s, x, y, { size = 14, weight = 700, color = '#fff', align = 'left', base = 'alphabetic', fam = DISPLAY, shadow = 0, track = 0 } = {}) {
  font(g, size, weight, fam);
  g.textAlign = align; g.textBaseline = base;
  if ('letterSpacing' in g) g.letterSpacing = `${track}px`;
  if (shadow) { g.shadowColor = color; g.shadowBlur = shadow; }
  g.fillStyle = color; g.fillText(s, x, y);
  g.shadowBlur = 0;
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}
// Panel con la esquina de arriba a la izquierda cortada (estilo del menú)
function panel(g, x, y, w, h, { cut = 12, fill = PANEL, stroke = LINE, accent = null } = {}) {
  g.beginPath();
  g.moveTo(x + cut, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - cut); g.lineTo(x + w - cut, y + h); g.lineTo(x, y + h); g.lineTo(x, y + cut); g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = 1; g.strokeStyle = stroke; g.stroke(); }
  if (accent) { g.fillStyle = accent; g.fillRect(x + cut, y, Math.min(w - cut, 64), 2); }
}
function keycap(g, k, x, y, { color = '#fff', size = 18 } = {}) {
  font(g, size * 0.6, 700);
  const w = Math.max(size, g.measureText(k).width + 10);
  g.fillStyle = 'rgba(255,255,255,.1)'; g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1;
  g.beginPath(); g.roundRect(x, y, w, size, 4); g.fill(); g.stroke();
  txt(g, k, x + w / 2, y + size / 2 + 1, { size: size * 0.6, align: 'center', base: 'middle', color });
  return w;
}
function icon(g, id, x, y, w, h, alpha = 1) {
  const im = iconImage(id, 128);
  const s = Math.min(w, h);
  g.globalAlpha = alpha;
  g.drawImage(im, x + (w - s) / 2, y + (h - s) / 2, s, s);
  g.globalAlpha = 1;
}
const elemColor = (id) => TECHNIQUES[id]?.color || PINK;

// ---------- Tarjeta del arma (abajo a la derecha) ----------
export function weaponCard(g, W, H, s) {
  const A = s.arms;
  if (!A) return;
  const Wp = ARMS[A.cur];
  const cw = 318, ch = 104, x = W - cw - 14, y = H - ch - 14;
  const sword = Wp.kind === 'sword';
  const col = sword ? elemColor(Wp.tech) : GREEN;
  panel(g, x, y, cw, ch, { cut: 16, accent: col });
  // franja de color a la derecha
  g.fillStyle = col; g.globalAlpha = 0.85; g.fillRect(x + cw - 3, y + 10, 3, ch - 30); g.globalAlpha = 1;
  // ícono grande con brillo
  const gr = g.createRadialGradient(x + 64, y + 58, 4, x + 64, y + 58, 60);
  gr.addColorStop(0, sword ? `${col}40` : 'rgba(124,255,79,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x + 4, y + 8, 120, 92);
  icon(g, Wp.id, x + 12, y + 22, 104, 74);
  // nombre y modo de fuego
  const mode = Wp.mode;
  font(g, 10, 700);
  const mw = g.measureText(mode).width + 14;
  const name = Wp.name.toUpperCase();
  font(g, 13, 700);
  const nfit = Math.min(13, (13 * (cw - mw - 72)) / Math.max(1, g.measureText(name).width + name.length * 1.2));
  txt(g, name, x + 18, y + 22, { size: nfit, weight: 700, color: '#eef1f5', track: 1.2 * (nfit / 13) });
  const mx = x + cw - mw - 14, my = y + 10;
  g.fillStyle = sword ? `${col}26` : 'rgba(124,255,79,.12)'; g.strokeStyle = col; g.lineWidth = 1;
  g.beginPath(); g.roundRect(mx, my, mw, 17, 3); g.fill(); g.stroke();
  txt(g, mode, mx + mw / 2, my + 9.5, { size: 10, weight: 700, color: col, align: 'center', base: 'middle', track: 1 });
  // indicador del modo (puntitos)
  const dots = Wp.burst ? 3 : Wp.auto ? 5 : Wp.kind === 'sword' ? 0 : 1;
  for (let i = 0; i < dots; i++) { g.fillStyle = col; g.globalAlpha = 0.9 - i * 0.12; g.fillRect(mx - 10 - i * 6, my + 6, 4, 6); }
  g.globalAlpha = 1;
  if (sword) {
    // espadas: combo y técnica en lugar de balas
    const T = TECHNIQUES[Wp.tech];
    txt(g, T.style.toUpperCase(), x + cw - 18, y + 52, { size: 12, weight: 700, color: col, align: 'right', track: 2, shadow: 8 });
    txt(g, A.heavy ? 'GOLPE CARGADO' : `Combo ${A.combo ? `${A.combo}/3` : '—'}`, x + cw - 18, y + 74, { size: 20, weight: 700, color: '#fff', align: 'right' });
    txt(g, 'Clic: corte · mantén: cargado', x + cw - 18, y + 92, { size: 10, weight: 600, color: '#97a2b5', align: 'right', fam: BODY });
    if (A.charge > 0) {
      const k = Math.min(1, A.charge);
      g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x + 136, y + 84, 90, 4);
      g.fillStyle = k >= 1 ? YEL : col; g.fillRect(x + 136, y + 84, 90 * k, 4);
    }
    return;
  }
  // balas: número grande + reserva + anillo de recarga
  const mag = A.mag[A.cur] ?? 0, res = A.res[A.cur];
  const low = mag <= Math.ceil(Wp.mag * 0.25);
  const reloading = A.reloadT > 0;
  const ax = x + cw - 18;
  if (reloading) {
    const k = 1 - A.reloadT / Wp.reload;
    const cx = x + cw - 52, cy = y + 62;
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = YEL; g.shadowColor = YEL; g.shadowBlur = 10;
    g.beginPath(); g.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke(); g.shadowBlur = 0;
    txt(g, `${Math.round(k * 100)}`, cx, cy + 1, { size: 14, weight: 700, align: 'center', base: 'middle', color: '#fff' });
    txt(g, 'RECARGANDO', cx - 32, cy + 5, { size: 11, weight: 700, color: YEL, align: 'right', track: 1.5 });
  } else {
    font(g, 46, 700);
    const resTxt = res === Infinity ? '∞' : String(res);
    txt(g, `/ ${resTxt}`, ax, y + 92, { size: 16, weight: 600, color: '#97a2b5', align: 'right' });
    font(g, 16, 600);
    const rw = g.measureText(`/ ${resTxt}`).width;
    txt(g, String(mag), ax - rw - 8, y + 92, { size: 46, weight: 700, color: mag === 0 ? RED : low ? YEL : '#fff', align: 'right', shadow: mag === 0 ? 12 : 0 });
    // tira de balas del cargador
    const n = Math.min(Wp.mag, 30), bw = Math.max(2, Math.min(5, 150 / n - 1.5));
    for (let i = 0; i < n; i++) {
      const on = i < Math.round((mag / Wp.mag) * n);
      g.fillStyle = on ? (low ? YEL : 'rgba(238,241,245,.85)') : 'rgba(255,255,255,.12)';
      g.fillRect(ax - (i + 1) * (bw + 1.5), y + 38, bw, 7);
    }
  }
}

// ---------- Barra de armas (las que tienes, con su tecla) ----------
export function loadoutBar(g, W, H, s) {
  const A = s.arms;
  if (!A) return;
  const list = A.owned.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
  if (A.scope > 0.5) return;
  const sw = 48, sh = 32, gap = 4;
  const perRow = Math.max(1, Math.floor((318 + 60) / (sw + gap)));
  const rows = Math.ceil(list.length / perRow);
  const top = H - 104 - 14 - (A.hasSword ? 40 : 8) - rows * (sh + gap) - 2;
  g.globalAlpha = 0.5 + 0.5 * Math.min(1, A.bar || 0);
  list.forEach((i, k) => {
    const row = Math.floor(k / perRow), col = k % perRow;
    const inRow = Math.min(perRow, list.length - row * perRow);
    const x = W - 14 - (inRow - col) * (sw + gap) + gap, y = top + row * (sh + gap);
    const on = i === A.cur;
    const Wp = ARMS[i];
    panel(g, x, y, sw, sh, { cut: 7, fill: on ? 'rgba(254,51,119,.22)' : PANEL, stroke: on ? PINK : LINE });
    icon(g, Wp.id, x + 4, y + 3, sw - 8, sh - 6, on ? 1 : 0.55);
    txt(g, String(k + 1), x + 5, y + 11, { size: 9, weight: 700, color: on ? '#fff' : '#97a2b5' });
    if (Wp.kind === 'gun' && A.mag[i] === 0 && A.res[i] === 0) { g.fillStyle = 'rgba(255,74,90,.7)'; g.fillRect(x + 4, y + sh - 4, sw - 8, 2); }
  });
  g.globalAlpha = 1;
}

// ---------- Energía de técnica + habilidades ----------
export function energyMeter(g, W, H, s) {
  const A = s.arms;
  if (!A || !A.hasSword) return;
  const Wp = ARMS[A.cur];
  const tech = TECHNIQUES[Wp.kind === 'sword' ? Wp.tech : A.lastTech] || TECHNIQUES.agua;
  const col = tech.color;
  const w = 318, h = 32, x = W - w - 14, y = H - 104 - 14 - h - 6;
  const ready = A.techReady;
  const pulse = ready ? 0.5 + Math.sin(s.time * 7) * 0.5 : 0;
  panel(g, x, y, w, h, { cut: 9, fill: ready ? `rgba(20,22,40,.92)` : PANEL, stroke: ready ? col : LINE });
  if (ready) { g.shadowColor = col; g.shadowBlur = 14 + pulse * 14; g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x + 1, y + 1, w - 2, h - 2); g.shadowBlur = 0; }
  txt(g, ready ? '¡TÉCNICA LISTA!' : tech.style.toUpperCase(), x + 12, y + 20, { size: 11, weight: 700, color: ready ? '#fff' : col, track: 1.5, shadow: ready ? 10 : 0 });
  // barra en segmentos
  const bx = x + 128, bw = w - 128 - 44, segs = 10, sgw = (bw - (segs - 1) * 3) / segs;
  const k = Math.min(1, A.energy / A.energyMax);
  for (let i = 0; i < segs; i++) {
    const f = Math.max(0, Math.min(1, k * segs - i));
    const sx = bx + i * (sgw + 3);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(sx, y + 11, sgw, 10);
    if (f > 0) { g.fillStyle = col; g.globalAlpha = 0.55 + 0.45 * f + pulse * 0.2; g.fillRect(sx, y + 11, sgw * f, 10); g.globalAlpha = 1; }
  }
  keycap(g, 'Q', x + w - 34, y + 7, { color: ready ? col : '#fff', size: 18 });
  // tecla Q apagada si la técnica está en espera
  if (A.tcd > 0) txt(g, `${Math.ceil(A.tcd)}s`, x + w - 40, y + 20, { size: 10, weight: 700, color: '#97a2b5', align: 'right' });
}

// Fichas de habilidad (golpe rápido y técnica) a la izquierda de la tarjeta
export function abilities(g, W, H, s) {
  const A = s.arms;
  if (!A) return;
  const size = 50, y = H - 14 - size;
  let x = W - 318 - 14 - 10 - size;
  const tile = (id, key, cd, ready, col) => {
    panel(g, x, y, size, size, { cut: 8, fill: PANEL, stroke: ready ? col : LINE });
    icon(g, id, x + 8, y + 6, size - 16, size - 16, cd > 0 ? 0.45 : 1);
    if (cd > 0) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.beginPath(); g.moveTo(x + size / 2, y + size / 2); g.arc(x + size / 2, y + size / 2, size * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd); g.closePath();
      g.save(); g.beginPath(); g.rect(x, y, size, size); g.clip();
      g.beginPath(); g.moveTo(x + size / 2, y + size / 2); g.arc(x + size / 2, y + size / 2, size * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd); g.closePath(); g.fill();
      g.restore();
    }
    if (ready) { g.shadowColor = col; g.shadowBlur = 12; g.strokeStyle = col; g.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3); g.shadowBlur = 0; }
    keycap(g, key, x + size - 18, y + size - 15, { size: 13 });
    x -= size + 8;
  };
  if (A.hasSword) {
    const Wp = ARMS[A.cur];
    const tid = Wp.kind === 'sword' ? Wp.tech : A.lastTech || 'agua';
    const T = TECHNIQUES[tid];
    const cd = A.tcd > 0 ? A.tcd / T.cd : A.energy < A.energyMax ? 1 - A.energy / A.energyMax : 0;
    tile(tid, 'Q', cd, A.techReady, T.color);
  }
  tile('bash', 'V', A.bashCd, false, GREEN);
}

// ---------- Mira ----------
export function dynamicCrosshair(g, W, H, s, drawCrosshair) {
  if (s.menu || s.shopOpen || s.phase === 'over' || (s.me && !s.me.alive) || s.wheel?.open) return;
  const A = s.arms;
  const cx = W / 2, cy = H / 2;
  if (A && A.scope > 0.85) return; // la mira telescópica dibuja la suya
  if (A && ARMS[A.cur]?.kind === 'sword') {
    // espadas: un arco (el corte) y un anillo que se llena al cargar
    const col = s.cross?.color || '#fff';
    g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.55)';
    g.beginPath(); g.arc(cx, cy, 16, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = col;
    g.beginPath(); g.arc(cx, cy, 16, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 1.8, 0, Math.PI * 2); g.fill();
    if (A.charge > 0) {
      const k = Math.min(1, A.charge);
      g.lineWidth = 3; g.strokeStyle = k >= 1 ? YEL : 'rgba(255,255,255,.8)';
      if (k >= 1) { g.shadowColor = YEL; g.shadowBlur = 10; }
      g.beginPath(); g.arc(cx, cy, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke(); g.shadowBlur = 0;
    }
  } else {
    const gap = Math.max(2, Math.min(70, s.crossGap ?? 6));
    g.globalAlpha = A ? 1 - Math.min(0.6, (A.ads || 0) * 0.5) : 1;
    drawCrosshair(g, cx, cy, { style: s.cross?.style, color: s.cross?.color, gap });
    g.globalAlpha = 1;
    // recarga: anillito alrededor de la mira
    if (A?.reloadT > 0) {
      const k = 1 - A.reloadT / ARMS[A.cur].reload;
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,204,0,.85)';
      g.beginPath(); g.arc(cx, cy, gap + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
    }
  }
  // marcador de golpe: normal (blanco), a la cabeza (amarillo) y baja (X roja)
  if (s.hitT > 0) {
    const a = Math.min(1, s.hitT * 5);
    const r = (s.hitKill ? 10 : 8) + (1 - a) * (s.hitKill ? 8 : 4);
    const L = s.hitKill ? 10 : s.hitHead ? 8 : 6;
    g.lineCap = 'round';
    for (const [w, c] of [[s.hitKill ? 5 : 4, `rgba(0,0,0,${a * 0.5})`], [s.hitKill ? 3 : 2, s.hitKill ? `rgba(255,60,80,${a})` : s.hitHead ? `rgba(255,204,0,${a})` : `rgba(255,255,255,${a})`]]) {
      g.strokeStyle = c; g.lineWidth = w;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(cx + dx * r, cy + dy * r); g.lineTo(cx + dx * (r + L), cy + dy * (r + L)); g.stroke(); }
    }
    g.lineCap = 'butt';
    if (s.hitHead && !s.hitKill) txt(g, '¡A LA CABEZA!', cx, cy - 34, { size: 11, weight: 700, color: `rgba(255,204,0,${a})`, align: 'center', track: 1.5 });
  }
}

// ---------- Mira telescópica del láser ----------
export function scope(g, W, H, s) {
  const A = s.arms;
  if (!A || !(A.scope > 0)) return;
  const k = Math.min(1, A.scope);
  const R = Math.min(W, H) * 0.42 * (0.85 + 0.15 * k);
  const cx = W / 2, cy = H / 2;
  g.save();
  g.globalAlpha = Math.min(1, k * 1.4);
  g.fillStyle = '#040508';
  g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, cy, R, 0, Math.PI * 2, true); g.fill('evenodd');
  const gr = g.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.85)');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(20,24,34,.95)'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(79,216,255,.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R - 6, 0, Math.PI * 2); g.stroke();
  // retícula
  g.strokeStyle = 'rgba(10,10,14,.9)'; g.lineWidth = 2;
  for (const [x1, y1, x2, y2] of [[cx - R, cy, cx - 22, cy], [cx + 22, cy, cx + R, cy], [cx, cy - R, cx, cy - 22], [cx, cy + 22, cx, cy + R]]) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  g.strokeStyle = 'rgba(255,45,85,.9)'; g.lineWidth = 1;
  for (const [x1, y1, x2, y2] of [[cx - 22, cy, cx - 6, cy], [cx + 6, cy, cx + 22, cy], [cx, cy + 6, cx, cy + 22]]) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  for (let i = 1; i <= 4; i++) { g.fillStyle = 'rgba(10,10,14,.9)'; g.fillRect(cx - 5, cy + 22 + i * 18, 10, 2); g.fillRect(cx - 22 - i * 18, cy - 4, 2, 8); g.fillRect(cx + 20 + i * 18, cy - 4, 2, 8); }
  g.fillStyle = '#ff2d55'; g.shadowColor = '#ff2d55'; g.shadowBlur = 8; g.beginPath(); g.arc(cx, cy, 2.2, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
  txt(g, `×${(A.zoom || 1).toFixed(1)}`, cx + R * 0.62, cy + R * 0.62, { size: 14, weight: 700, color: 'rgba(79,216,255,.85)' });
  g.restore();
}

// ---------- Registro de bajas (con el ícono del arma) ----------
export function killFeed(g, W, H, s, top) {
  let y = top;
  for (const f of (s.killFeed || []).slice(-5)) {
    g.globalAlpha = Math.max(0, Math.min(1, f.t));
    font(g, 12, 700, BODY);
    const victim = f.boss ? BOSSES[f.victim]?.name || 'Jefe' : ZOMBIE_TYPES[f.victim]?.name || 'Zombi';
    const ww = g.measureText(f.who).width, vw = g.measureText(victim).width;
    const w = ww + vw + 74;
    const x = W - 14 - w;
    panel(g, x, y, w, 26, { cut: 6, fill: PANEL, stroke: f.me ? 'rgba(254,51,119,.7)' : LINE });
    g.fillStyle = f.color || PINK; g.fillRect(x + 2, y + 6, 3, 14);
    txt(g, f.who, x + 10, y + 17, { size: 12, weight: 800, color: '#fff', fam: BODY });
    if (f.w >= 0 && ARMS[f.w]) icon(g, ARMS[f.w].id, x + 14 + ww, y + 1, 40, 24);
    else txt(g, '✦', x + 26 + ww, y + 18, { size: 12, color: '#fff' });
    txt(g, victim, x + w - 10, y + 17, { size: 12, weight: 700, color: f.boss ? '#ff9aa6' : '#cfd6e2', align: 'right', fam: BODY });
    y += 30;
  }
  g.globalAlpha = 1;
}

// ---------- Números de daño ----------
export function damageNumbers(g, W, H, s) {
  for (const d of s.dmgNums || []) {
    if (d.sx == null) continue;
    const a = Math.min(1, d.t * 2.5);
    const rise = (1 - d.t) * 36;
    const sc = d.big ? 1.25 : 1;
    const pop = 1 + Math.max(0, d.t - 0.85) * 3;
    g.globalAlpha = a;
    font(g, 17 * sc * pop, 700);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineJoin = 'round';
    g.strokeText(d.text, d.sx, d.sy - rise);
    g.fillStyle = d.color; g.fillText(d.text, d.sx, d.sy - rise);
  }
  g.globalAlpha = 1;
}

// ---------- Avisos: poca munición, recargar, sin balas ----------
export function ammoPrompts(g, W, H, s) {
  const A = s.arms;
  if (!A || s.menu || s.wheel?.open || (s.me && !s.me.alive)) return;
  const Wp = ARMS[A.cur];
  if (Wp.kind !== 'gun' || A.reloadT > 0) return;
  const mag = A.mag[A.cur], res = A.res[A.cur];
  let msg = null, col = YEL, key = null;
  if (mag === 0 && res === 0) { msg = 'SIN MUNICIÓN'; col = RED; }
  else if (mag === 0) { msg = 'RECARGAR'; key = 'R'; }
  else if (mag <= Math.ceil(Wp.mag * 0.25)) { msg = res === 0 ? 'ÚLTIMAS BALAS' : 'POCA MUNICIÓN'; key = res === 0 ? null : 'R'; }
  if (!msg) return;
  const blink = mag === 0 ? 0.65 + Math.sin(s.time * 8) * 0.35 : 1;
  g.globalAlpha = blink;
  font(g, 13, 700);
  const tw = g.measureText(msg).width + (key ? 28 : 0);
  const x = W / 2 - tw / 2, y = H / 2 + 64;
  if (key) keycap(g, key, x, y - 13, { size: 18, color: col });
  txt(g, msg, x + (key ? 28 : 0), y + 1, { size: 13, weight: 700, color: col, track: 2, shadow: 8 });
  g.globalAlpha = 1;
}

// ---------- Rueda de armas (mantén Tab) ----------
export function weaponWheel(g, W, H, s) {
  const Wh = s.wheel;
  if (!Wh?.open) return;
  const A = s.arms;
  const items = Wh.items;
  const k = Math.min(1, Wh.t * 6);
  const cx = W / 2, cy = H / 2;
  // la oficina sigue (la simulación no se detiene); solo la vista se oscurece y se pone en cámara lenta
  const gr = g.createRadialGradient(cx, cy, 60, cx, cy, Math.max(W, H) * 0.7);
  gr.addColorStop(0, `rgba(6,8,16,${0.55 * k})`); gr.addColorStop(1, `rgba(6,8,16,${0.85 * k})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const R = 190 * (0.85 + 0.15 * k), r = 74;
  const n = Math.max(3, items.length);
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI * 2 / n) + 0.02, a1 = a0 + Math.PI * 2 / n - 0.04;
    const it = items[i];
    const on = it != null && it === Wh.sel;
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.arc(cx, cy, r, a1, a0, true); g.closePath();
    g.fillStyle = on ? 'rgba(254,51,119,.32)' : it != null ? 'rgba(14,16,30,.88)' : 'rgba(14,16,30,.5)';
    g.fill();
    g.lineWidth = on ? 2 : 1; g.strokeStyle = on ? PINK : LINE; g.stroke();
    if (on) { g.save(); g.shadowColor = PINK; g.shadowBlur = 18; g.strokeStyle = PINK; g.beginPath(); g.arc(cx, cy, R + 4, a0, a1); g.stroke(); g.restore(); }
    if (it == null) continue;
    const am = (a0 + a1) / 2, rm = (R + r) / 2;
    const ix = cx + Math.cos(am) * rm, iy = cy + Math.sin(am) * rm;
    const Wp = ARMS[it];
    icon(g, Wp.id, ix - 34, iy - 26, 68, 46, on ? 1 : 0.7);
    txt(g, Wp.short.toUpperCase(), ix, iy + 30, { size: 10, weight: 700, color: on ? '#fff' : '#97a2b5', align: 'center', track: 1 });
    if (Wp.kind === 'gun') txt(g, `${A.mag[it]}/${A.res[it] === Infinity ? '∞' : A.res[it]}`, ix, iy - 28, { size: 10, weight: 600, color: A.mag[it] + (A.res[it] || 0) === 0 ? RED : '#cfd6e2', align: 'center' });
  }
  // centro
  g.beginPath(); g.arc(cx, cy, r - 8, 0, Math.PI * 2); g.fillStyle = 'rgba(8,10,20,.95)'; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(124,255,79,.5)'; g.stroke();
  const S = Wh.sel != null ? ARMS[Wh.sel] : null;
  if (S) {
    txt(g, S.name, cx, cy - 4, { size: 12, weight: 700, color: '#fff', align: 'center' });
    txt(g, S.mode, cx, cy + 14, { size: 10, weight: 700, color: S.kind === 'sword' ? elemColor(S.tech) : GREEN, align: 'center', track: 2 });
  }
  txt(g, 'SUELTA TAB PARA ELEGIR · MUEVE EL MOUSE', cx, cy + R + 30, { size: 11, weight: 700, color: '#cfd6e2', align: 'center', track: 2 });
}

// ---------- Efecto de pantalla de una técnica (tinte + líneas de velocidad) ----------
export function techScreen(g, W, H, s) {
  const T = s.techFx;
  if (!T || T.t <= 0) return;
  const k = Math.min(1, T.t / T.max);
  const cx = W / 2, cy = H / 2;
  const col = T.color;
  // destello inicial
  if (T.t > T.max - 0.1) { g.fillStyle = T.id === 'rayo' ? 'rgba(255,250,220,.4)' : `${col}33`; g.fillRect(0, 0, W, H); }
  const gr = g.createRadialGradient(cx, cy, H * 0.2, cx, cy, H * 0.9);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col + Math.round(95 * k).toString(16).padStart(2, '0'));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // líneas de velocidad
  g.save();
  g.strokeStyle = T.id === 'rayo' ? `rgba(255,250,220,${0.6 * k})` : `rgba(255,255,255,${0.42 * k})`;
  for (const L of T.lines) {
    const r0 = Math.max(W, H) * (0.28 + L.r * 0.2) + (1 - k) * 60, r1 = r0 + L.len * (0.6 + k);
    g.lineWidth = L.w;
    g.beginPath(); g.moveTo(cx + Math.cos(L.a) * r0, cy + Math.sin(L.a) * r0); g.lineTo(cx + Math.cos(L.a) * r1, cy + Math.sin(L.a) * r1); g.stroke();
  }
  g.restore();
}
export function speedLines(n = 46) {
  return Array.from({ length: n }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), len: 60 + Math.random() * 160, w: 1 + Math.random() * 2.5 }));
}

// Pantalla en cámara lenta mientras la rueda está abierta (solo la vista local)
export function slowMoTint(g, W, H, s) {
  if (!s.wheel?.open) return;
  g.fillStyle = 'rgba(40,60,90,.12)'; g.fillRect(0, 0, W, H);
}

// Para la Arena HUB (y quien quiera): piezas de dibujo del HUD
export { panel, txt, keycap, icon, font, PANEL, PANEL2, LINE, DISPLAY, BODY };
