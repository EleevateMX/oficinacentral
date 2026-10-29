// Hotel: lo que acompaña al personaje (agente D): objeto en la mano, cartel, efectos (brillos, fuego,
// fantasma, reflector, neón), Zzz al dormir y el globito de "escribiendo…".
// Todo es dibujo procedural y barato; se pinta en coordenadas del mundo del Hotel (como el motor).
import { HAND_ITEMS } from '@shared/sprite.js';

export const EFFECTS = {
  brillos: { label: 'Brillos', emoji: '✨' },
  fuego: { label: 'Aura de fuego', emoji: '🔥' },
  fantasma: { label: 'Fantasma', emoji: '👻' },
  neon: { label: 'Neón HUB', emoji: '💗' },
  reflector: { label: 'Reflector', emoji: '🔦' },
};

// Opciones extra del cuadro del personaje (se mezclan con las del motor)
export function avatarOpts(U, t, moving) {
  const o = { actT: t - (U.actT || 0), actN: U.dance || 1 };
  if (U.hand && HAND_ITEMS.includes(U.hand)) {
    o.hand = U.hand;
    // De vez en cuando le da un trago / una mordida
    o.drink = !moving && !U.lay && (t + Math.abs(U.id | 0) * 977) % 9000 < 1300;
  }
  if (U.sign != null) o.sign = U.sign;
  if (U.act === 'sleep' || (U.act === 'laugh' && !moving)) o.blink = true;
  return o;
}

export function avatarAlpha(U, t) {
  if (U.effect === 'fantasma') return 0.42 + Math.sin(t / 420) * 0.08;
  return 1;
}

const TAU = Math.PI * 2;
const rnd = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

// Detrás del personaje: fuego, reflector, aro de neón
export function drawAvatarBehind(ctx, a, t) {
  const U = a.U, fx = a.fx, fy = a.fy;
  const eff = U.effect;
  if (!eff || !a.fr) return;
  const top = a.fr.top || 70;
  ctx.save();
  if (eff === 'reflector') {
    const g = ctx.createLinearGradient(fx, fy - top - 120, fx, fy);
    g.addColorStop(0, 'rgba(255,240,190,0)');
    g.addColorStop(1, 'rgba(255,240,190,.32)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(fx - 7, fy - top - 120); ctx.lineTo(fx + 7, fy - top - 120); ctx.lineTo(fx + 26, fy); ctx.lineTo(fx - 26, fy); ctx.closePath(); ctx.fill();
    const r = ctx.createRadialGradient(fx, fy, 2, fx, fy, 30);
    r.addColorStop(0, 'rgba(255,246,210,.75)'); r.addColorStop(1, 'rgba(255,246,210,0)');
    ctx.fillStyle = r;
    ctx.beginPath(); ctx.ellipse(fx, fy, 30, 15, 0, 0, TAU); ctx.fill();
  } else if (eff === 'neon') {
    const k = (t / 900) % 1;
    for (const [c, ph] of [['#FE3377', 0], ['#FFCC00', 0.5]]) {
      const q = (k + ph) % 1;
      ctx.strokeStyle = c; ctx.globalAlpha = 1 - q; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(fx, fy, 10 + q * 16, 5 + q * 8, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#FE3377';
    ctx.beginPath(); ctx.ellipse(fx, fy - top / 2, 22, top / 2 + 6, 0, 0, TAU); ctx.fill();
  } else if (eff === 'fuego') {
    const r = ctx.createRadialGradient(fx, fy - 20, 4, fx, fy - 20, 42);
    r.addColorStop(0, 'rgba(255,170,40,.35)'); r.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = r;
    ctx.beginPath(); ctx.ellipse(fx, fy - 22, 34, 44, 0, 0, TAU); ctx.fill();
    flames(ctx, fx, fy, t, top, 0);
  }
  ctx.restore();
}

function flames(ctx, fx, fy, t, top, front) {
  // Lengüitas de fuego en pixel-art (rectángulos de 2 px) alrededor de los pies
  const n = 9;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + t / 1400;
    const front_ = Math.sin(ang) > 0;
    if (front_ !== !!front) continue;
    const x = fx + Math.cos(ang) * 18, y = fy + Math.sin(ang) * 7;
    const ph = ((t / 380) + rnd(i)) % 1;
    const h = 10 + rnd(i + 3) * (top * 0.35) * (1 - ph * 0.5);
    for (let j = 0; j < h; j += 2) {
      const w = Math.max(2, Math.round((1 - j / h) * 5));
      ctx.fillStyle = j < h * 0.3 ? '#fff1a8' : j < h * 0.65 ? '#ffb02e' : '#ff5a1f';
      ctx.globalAlpha = 0.85 * (1 - j / h);
      ctx.fillRect(Math.round(x - w / 2 + Math.sin(t / 120 + i + j / 4) * 1.5), Math.round(y - j - ph * 6), w, 2);
    }
  }
  ctx.globalAlpha = 1;
}

// Delante: llamas de enfrente, brillos, cartel y Zzz
export function drawAvatarFront(ctx, a, t) {
  const U = a.U, fr = a.fr;
  if (!fr) return;
  const fx = a.fx, fy = a.fy;
  const top = fr.top || 70;
  ctx.save();
  if (U.effect === 'fuego') flames(ctx, fx, fy, t, top, 1);
  if (U.effect === 'brillos') {
    for (let i = 0; i < 7; i++) {
      const ph = ((t / 1600) + rnd(i)) % 1;
      const x = fx + (rnd(i + 11) - 0.5) * 44, y = fy - 6 - rnd(i + 5) * (top + 8) - ph * 10;
      // destellos de pixel-art: punto central y brazos que crecen y se encogen
      const s = Math.round(Math.sin(ph * Math.PI) * 2);
      const X = Math.round(x / 2) * 2, Y = Math.round(y / 2) * 2;
      ctx.globalAlpha = 0.35 + 0.65 * Math.sin(ph * Math.PI);
      ctx.fillStyle = i % 3 === 0 ? '#FE3377' : i % 2 ? '#FFCC00' : '#fff6d6';
      ctx.fillRect(X, Y, 2, 2);
      if (s > 0) {
        ctx.fillStyle = i % 2 ? '#ffe680' : '#ffffff';
        for (let k = 1; k <= s; k++) { ctx.fillRect(X, Y - 2 * k, 2, 2); ctx.fillRect(X, Y + 2 * k, 2, 2); ctx.fillRect(X - 2 * k, Y, 2, 2); ctx.fillRect(X + 2 * k, Y, 2, 2); }
      }
    }
    ctx.globalAlpha = 1;
  }
  if (U.sign != null && a.pose === 'sign') drawSign(ctx, a, U.sign, t);
  if (U.act === 'kiss') drawKiss(ctx, a, t - (U.actT || 0));
  if (U.act === 'laugh') drawLaugh(ctx, a, t - (U.actT || 0));
  if (U.act === 'sleep') {
    const hx = fx + fr.head[0], hy = fy + fr.head[1];
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const ph = ((t / 2400) + i / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      ctx.font = `800 ${8 + ph * 8}px system-ui, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,20,20,.75)';
      const x = hx + 14 + ph * 14 + Math.sin(ph * 6) * 3, y = hy - 16 - ph * 26;
      ctx.strokeText('z', x, y);
      ctx.fillStyle = '#e8e6ff';
      ctx.fillText('z', x, y);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// Cartel: una tablita con el número, sostenida arriba con la mano cercana
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};
function drawSign(ctx, a, n, t) {
  const fr = a.fr;
  const h = fr.hands?.[fr.holdArm] || [12, -40];
  const k = fr.k || 2;
  const hx = Math.round(a.fx + h[0]), hy = Math.round(a.fy + h[1]);
  const txt = String(Math.max(0, Math.min(10, n | 0)));
  const bw = (txt.length * 4 + 5) * k, bh = 11 * k;
  const bx = Math.round(hx - bw / 2), by = hy - bh - 3 * k + Math.round(Math.sin(t / 260) * 1);
  // palito
  ctx.fillStyle = '#7a4a2b'; ctx.fillRect(hx - k / 2, by + bh - k, k, 4 * k);
  // tabla
  ctx.fillStyle = '#28222e'; ctx.fillRect(bx - k, by - k, bw + 2 * k, bh + 2 * k);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#FE3377'; ctx.fillRect(bx, by, bw, 2 * k);
  ctx.fillStyle = '#FFCC00'; ctx.fillRect(bx, by + bh - k, bw, k);
  ctx.fillStyle = '#141414';
  [...txt].forEach((ch, ci) => {
    const g = DIGITS[ch];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === '1') ctx.fillRect(bx + (3 + ci * 4 + c) * k - k, by + (3 + r) * k, k, k);
  });
}

// "Escribiendo…": globito blanco con colita y tres puntos que brincan en ola (coordenadas de pantalla)
export function drawTyping(ctx, x, y, t, age = 0) {
  const pop = Math.min(1, age / 160);
  const w = 38 * (0.7 + 0.3 * pop), h = 20 * (0.7 + 0.3 * pop);
  const bx = Math.round(x - w / 2), by = Math.round(y - h - 7);
  ctx.save();
  ctx.globalAlpha = pop;
  ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(bx + r, by); ctx.lineTo(bx + w - r, by); ctx.arc(bx + w - r, by + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + 4, by + h); ctx.lineTo(x - 1, by + h + 6); ctx.lineTo(x - 3, by + h);
  ctx.lineTo(bx + r, by + h); ctx.arc(bx + r, by + r, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(20,20,20,.18)'; ctx.lineWidth = 1; ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const ph = Math.sin(t / 150 - i * 0.9);
    const lift = Math.max(0, ph) * 3.5;
    ctx.fillStyle = ph > 0.3 ? '#FE3377' : '#8d8a96';
    ctx.beginPath(); ctx.arc(x - 9 + i * 9, by + h / 2 - lift + 0.5, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- Acciones: beso (corazones) y risa ("jaja") ----------
// Corazón de pixel-art (7×6), en px del mundo (2 px por píxel)
const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
function heart(ctx, x, y, s, fill, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(40,10,30,.55)';
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) if (HEART[r][c] === '1') ctx.fillRect(Math.round(x + (c - 3.5) * s) + 1, Math.round(y + (r - 3) * s) + 1, s, s);
  ctx.fillStyle = fill;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) if (HEART[r][c] === '1') ctx.fillRect(Math.round(x + (c - 3.5) * s), Math.round(y + (r - 3) * s), s, s);
  ctx.fillStyle = '#ffd1e1';
  ctx.fillRect(Math.round(x - 2.5 * s), Math.round(y - 2 * s), s, s);
}
function drawKiss(ctx, a, e) {
  if (e < 450) return; // primero la mano a la boca
  const fr = a.fr;
  const hx = a.fx + fr.head[0], hy = a.fy + fr.head[1];
  // Salen hacia donde mira (a la derecha o izquierda de la pantalla) y suben
  const side = [1, 1, 1, 0, -1, -1, -1, 0][a.U.dir] || (a.U.id % 2 ? 1 : -1);
  for (let i = 0; i < 3; i++) {
    const k = (e - 450 - i * 220) / 1300;
    if (k <= 0 || k >= 1) continue;
    const x = hx + side * (8 + k * 30) + Math.sin(k * 9 + i) * 4;
    const y = hy - 4 - k * 34 - i * 4;
    heart(ctx, x, y, k < 0.15 ? 1 : 2, i === 1 ? '#FE3377' : '#ff5c93', Math.min(1, (1 - k) * 2.2));
  }
  ctx.globalAlpha = 1;
}
function drawLaugh(ctx, a, e) {
  const fr = a.fr;
  const hx = a.fx + fr.head[0], hy = a.fy + fr.head[1];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    const k = ((e / 1100) + i / 3) % 1;
    if (e < i * 360) continue;
    const side = i % 2 ? -1 : 1;
    const x = hx + side * (14 + k * 10), y = hy - 10 - k * 26;
    const txt = i === 1 ? 'ja' : 'jaja';
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.font = `900 ${9 + Math.round(k * 3)}px system-ui, sans-serif`;
    const w = ctx.measureText(txt).width + 8, h = 13;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(20,20,20,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect?.(x - w / 2, y - h / 2, w, h, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FE3377';
    ctx.fillText(txt, x, y + 0.5);
  }
  ctx.globalAlpha = 1;
}

// ---------- Voz: ondita sobre quien está hablando (coordenadas de pantalla) ----------
export function drawSpeaking(ctx, x, y, t, level = 1) {
  ctx.save();
  const bars = 4, gap = 4;
  const w = bars * gap + 10, h = 14;
  const bx = Math.round(x - w / 2), by = Math.round(y - h);
  ctx.fillStyle = 'rgba(20,20,20,.82)';
  ctx.beginPath(); ctx.roundRect?.(bx, by, w, h, 7); ctx.fill();
  ctx.fillStyle = '#2fd18b';
  for (let i = 0; i < bars; i++) {
    const v = 0.35 + 0.65 * Math.abs(Math.sin(t / 110 + i * 1.3)) * Math.min(1, 0.5 + level);
    const bh = Math.max(2, Math.round(v * 9));
    ctx.fillRect(bx + 6 + i * gap, Math.round(by + h / 2 - bh / 2), 2, bh);
  }
  ctx.restore();
}
