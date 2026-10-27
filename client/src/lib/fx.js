// Efectos de "regresar a mi escritorio" (Ctrl+D): casi siempre uno temático que va
// cambiando (abducción, portal, cohete, escoba de bruja, murciélagos) y a veces el rápido.
const T = 32;
export const FX = {
  zap: { dur: 700 },
  alien: { dur: 3000 },
  portal: { dur: 1900 },
  rocket: { dur: 2300 },
  broom: { dur: 2600 },
  bats: { dur: 2200 },
};
export const SPECIALS = ['alien', 'broom', 'portal', 'bats', 'rocket'];

export function pickFx() {
  if (Math.random() < 0.2) return 'zap';
  let i = 0;
  try { i = Number(localStorage.getItem('nuvora:fx') || 0); localStorage.setItem('nuvora:fx', String(i + 1)); } catch { /* sin almacenamiento */ }
  return SPECIALS[i % SPECIALS.length];
}

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (k) => Math.max(0, Math.min(1, k));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = (k) => k * k * (3 - 2 * k);

// Dónde y cómo se ve el personaje en el momento p (0..1).
// Devuelve { x, y (casillas), lift (px hacia arriba), alpha, hidden, cam: {x, y} }
export function pose(fx, p) {
  const { from, to } = fx;
  const at = (q, extra = {}) => ({ x: q.x, y: q.y, lift: 0, alpha: 1, ...extra });
  switch (fx.kind) {
    case 'alien': {
      const ufoX = p < 0.5 ? from.x : p < 0.7 ? lerp(from.x, to.x, ease(seg(p, 0.5, 0.7))) : to.x;
      const ufoY = p < 0.5 ? from.y : p < 0.7 ? lerp(from.y, to.y, ease(seg(p, 0.5, 0.7))) : to.y;
      const cam = { x: ufoX, y: ufoY };
      if (p < 0.25) return at(from, { cam });
      if (p < 0.5) return at(from, { lift: ease(seg(p, 0.25, 0.5)) * 2.6 * T, alpha: 1 - seg(p, 0.42, 0.5), cam });
      if (p < 0.7) return { hidden: true, cam };
      if (p < 0.95) return at(to, { lift: (1 - ease(seg(p, 0.7, 0.95))) * 2.6 * T, alpha: seg(p, 0.7, 0.78), cam });
      return at(to, { cam });
    }
    case 'portal':
      if (p < 0.4) return at(from, { sink: ease(seg(p, 0.1, 0.4)), cam: from });
      if (p < 0.5) return { hidden: true, cam: { x: lerp(from.x, to.x, seg(p, 0.4, 0.5)), y: lerp(from.y, to.y, seg(p, 0.4, 0.5)) } };
      if (p < 0.85) return at(to, { sink: 1 - ease(seg(p, 0.5, 0.85)), cam: to });
      return at(to, { cam: to });
    case 'rocket':
      if (p < 0.15) return at(from, { cam: from });
      if (p < 0.45) return at(from, { lift: ease(seg(p, 0.15, 0.45)) ** 2 * 14 * T, cam: from });
      if (p < 0.55) return { hidden: true, cam: { x: lerp(from.x, to.x, seg(p, 0.45, 0.55)), y: lerp(from.y, to.y, seg(p, 0.45, 0.55)) } };
      if (p < 0.85) return at(to, { lift: (1 - ease(seg(p, 0.55, 0.85))) ** 2 * 14 * T, cam: to });
      return at(to, { cam: to });
    case 'broom': {
      // Vuela en escoba en arco hasta el escritorio
      if (p < 0.12) return at(from, { lift: ease(seg(p, 0, 0.12)) * 1.2 * T, cam: from });
      if (p < 0.88) {
        const k = ease(seg(p, 0.12, 0.88));
        const q = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) };
        return at(q, { lift: (1.2 + Math.sin(k * Math.PI) * 2.2) * T, cam: q, broom: true, flip: to.x < from.x });
      }
      return at(to, { lift: (1 - ease(seg(p, 0.88, 1))) * 1.2 * T, cam: to, broom: p < 0.97, flip: to.x < from.x });
    }
    case 'bats':
      // Se convierte en murciélagos que vuelan al escritorio
      if (p < 0.25) return at(from, { alpha: 1 - seg(p, 0.1, 0.25), cam: from });
      if (p < 0.75) { const k = ease(seg(p, 0.25, 0.75)); return { hidden: true, cam: { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) } }; }
      return at(to, { alpha: seg(p, 0.75, 0.9), cam: to });
    default: // zap
      if (p < 0.4) return at(from, { alpha: 1 - seg(p, 0.1, 0.4), cam: to });
      return at(to, { alpha: seg(p, 0.4, 0.7), cam: to });
  }
}

function sparkles(ctx, x, y, k, color) {
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = color;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + k * 2;
    const r = 6 + k * 22;
    ctx.fillRect(x + Math.cos(a) * r - 1.5, y + Math.sin(a) * r * 0.7 - 1.5, 3, 3);
  }
  ctx.restore();
}

function ufo(ctx, x, y, t) {
  const bob = Math.sin(t / 120) * 2;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(0, 8, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9fe8ff';
  ctx.beginPath(); ctx.ellipse(0, -6, 10, 9, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#7d8794';
  ctx.beginPath(); ctx.ellipse(0, 0, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#aab3bf';
  ctx.beginPath(); ctx.ellipse(0, -2, 24, 5, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = (Math.floor(t / 150) + i) % 2 ? '#3DDC84' : '#FFCC00';
    ctx.fillRect(-17 + i * 8, 1, 3, 3);
  }
  // Alien
  ctx.fillStyle = '#5fd35f';
  ctx.fillRect(-3, -11, 6, 5);
  ctx.fillStyle = '#111';
  ctx.fillRect(-2, -10, 1.5, 1.5); ctx.fillRect(1, -10, 1.5, 1.5);
  ctx.restore();
}

function beam(ctx, x, top, bottom, a) {
  ctx.save();
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, `rgba(160,255,190,${0.55 * a})`);
  g.addColorStop(1, `rgba(160,255,190,${0.15 * a})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 9, top); ctx.lineTo(x + 9, top); ctx.lineTo(x + 20, bottom); ctx.lineTo(x - 20, bottom);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function portal(ctx, x, y, k, t) {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  for (let i = 3; i >= 0; i--) {
    ctx.fillStyle = ['#2a0b4a', '#6a1fb0', '#a14df0', '#e3b6ff'][i];
    ctx.beginPath();
    ctx.ellipse(0, 0, (16 - i * 3) * k, (6 - i * 1.1) * k, Math.sin(t / 200) * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Se dibuja en coordenadas del mundo, encima del piso y antes del personaje
export function drawFxUnder(ctx, fx, p, t) {
  const { from, to } = fx;
  const fx0 = (from.x + 0.5) * T; const fy0 = (from.y + 1) * T - 2;
  const tx0 = (to.x + 0.5) * T; const ty0 = (to.y + 1) * T - 2;
  if (fx.kind === 'zap') {
    if (p < 0.5) sparkles(ctx, fx0, fy0 - 18, seg(p, 0, 0.5), '#FFCC00');
    if (p > 0.35) sparkles(ctx, tx0, ty0 - 18, seg(p, 0.35, 1), '#7ad3ff');
  }
  if (fx.kind === 'portal') {
    portal(ctx, fx0, fy0, p < 0.5 ? Math.min(1, p / 0.12) * (1 - seg(p, 0.42, 0.5)) : 0, t);
    portal(ctx, tx0, ty0, p >= 0.45 ? Math.min(1, seg(p, 0.45, 0.55)) * (1 - seg(p, 0.88, 1)) : 0, t);
  }
  if (fx.kind === 'rocket') {
    const puff = (x, y, k) => { ctx.save(); ctx.globalAlpha = 0.6 * (1 - k); ctx.fillStyle = '#d9dde3'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + Math.cos(i) * (6 + k * 18), y + Math.sin(i * 2) * 3, 5 + k * 6, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); };
    if (p < 0.5) puff(fx0, fy0, seg(p, 0.1, 0.5));
    if (p > 0.8) puff(tx0, ty0, seg(p, 0.8, 1));
  }
}

function bat(ctx, x, y, t, s = 1) {
  const flap = Math.sin(t / 45) * 0.8;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#1b1424';
  ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 3.2, 0, 0, Math.PI * 2); ctx.fill();
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * 2, -1);
    ctx.quadraticCurveTo(d * 6, -5 * flap - 2, d * 10, -2 * flap);
    ctx.quadraticCurveTo(d * 7, 0, d * 6, 2);
    ctx.quadraticCurveTo(d * 4, 0.5, d * 2, 2);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#ff5a1f';
  ctx.fillRect(-1.6, -1.2, 1, 1); ctx.fillRect(0.6, -1.2, 1, 1);
  ctx.restore();
}

function broomUnder(ctx, x, y, flip) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.fillStyle = '#7a4a2b';
  ctx.fillRect(-16, -1, 26, 3);
  ctx.fillStyle = '#d9a441';
  ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(-26, -6); ctx.lineTo(-27, 6); ctx.lineTo(-14, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b07d2a';
  ctx.fillRect(-16, -3, 3, 8);
  ctx.restore();
}

// Encima del personaje (nave, rayo, llamas, escoba, murciélagos)
export function drawFxOver(ctx, fx, p, t, pz) {
  const { from, to } = fx;
  if (fx.kind === 'broom' && !pz.hidden && pz.broom) {
    const x = (pz.x + 0.5) * T, y = (pz.y + 1) * T - 4 - pz.lift;
    broomUnder(ctx, x, y, pz.flip);
    // estela de chispas
    ctx.save();
    for (let i = 1; i < 6; i++) {
      ctx.globalAlpha = 0.5 - i * 0.08;
      ctx.fillStyle = i % 2 ? '#FFCC00' : '#b46bff';
      ctx.fillRect(x + (pz.flip ? 1 : -1) * (26 + i * 6) + Math.sin(t / 60 + i) * 2, y + Math.cos(t / 80 + i) * 3, 2.5, 2.5);
    }
    ctx.restore();
  }
  if (fx.kind === 'bats' && p > 0.12 && p < 0.88) {
    const k = ease(seg(p, 0.2, 0.8));
    const cx = (lerp(from.x, to.x, k) + 0.5) * T, cy = (lerp(from.y, to.y, k) + 1) * T - 24 - Math.sin(k * Math.PI) * 30;
    const spread = Math.sin(seg(p, 0.12, 0.88) * Math.PI) * 18 + 4;
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + t / 300;
      bat(ctx, cx + Math.cos(a) * spread, cy + Math.sin(a * 1.3) * spread * 0.5, t + i * 37, 0.9 + (i % 3) * 0.15);
    }
  }
  if (fx.kind === 'alien') {
    const k = p < 0.12 ? ease(p / 0.12) : p > 0.95 ? 1 - seg(p, 0.95, 1) : 1;
    const ux = (pz.cam.x + 0.5) * T;
    const uyBase = (pz.cam.y + 1) * T - 2 - 3.6 * T;
    const uy = uyBase - (1 - k) * 6 * T;
    const beamOn = (p > 0.18 && p < 0.5) || (p > 0.7 && p < 0.96);
    if (beamOn) beam(ctx, ux, uy + 6, (pz.cam.y + 1) * T, 1);
    ufo(ctx, ux, uy, t);
  }
  if (fx.kind === 'rocket' && !pz.hidden && pz.lift > 2) {
    const x = (pz.x + 0.5) * T;
    const y = (pz.y + 1) * T - 2 - pz.lift;
    ctx.save();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ['#ff5a1f', '#ffcc00', '#fff3b0'][i];
      ctx.beginPath();
      ctx.moveTo(x - 7 + i * 2, y + 2); ctx.lineTo(x + 7 - i * 2, y + 2); ctx.lineTo(x, y + 18 - i * 4 + Math.random() * 4);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  void from; void to;
}
