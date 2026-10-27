// Animación de las acciones del personaje: postura (hacia dónde ve, brinco, paso)
// y efectos encima (notas, corazones, Zzz…). Todo se dibuja en coordenadas del mapa.
const DIRS = ['down', 'right', 'up', 'left'];

// Hacia dónde mirar para ver a otra persona
export function faceTo(a, b) {
  const dx = b.rx - a.rx, dy = b.ry - a.ry;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

// Postura: { dir, dx, dy, step, blink }
export function emotePose(e, now, me, other) {
  const t = now - e.start;
  const k = t / (e.until - e.start);
  const out = { dir: null, dx: 0, dy: 0, step: 0, blink: false };
  switch (e.kind) {
    case 'dance': {
      out.dir = ['down', 'left', 'down', 'right'][Math.floor(t / 260) % 4];
      out.dy = -Math.abs(Math.sin(t / 130)) * 3;
      out.dx = Math.sin(t / 260) * 2;
      out.step = 1 + (Math.floor(t / 130) % 2);
      break;
    }
    case 'wave': out.dir = 'down'; out.dy = -Math.abs(Math.sin(t / 160)) * 1.5; break;
    case 'wink': out.dir = 'down'; out.blink = k > 0.3 && k < 0.6; break;
    case 'jump': out.dir = 'down'; out.dy = -Math.abs(Math.sin((t / 700) * Math.PI)) * 14; break;
    case 'spin': out.dir = DIRS[Math.floor(t / 85) % 4]; out.dy = -Math.sin(k * Math.PI) * 5; break;
    case 'clap': out.dir = 'down'; out.dy = -Math.abs(Math.sin(t / 120)) * 1.5; break;
    case 'laugh': out.dir = 'down'; out.dx = Math.sin(t / 35) * 1.2; out.dy = -Math.abs(Math.sin(t / 90)) * 2; out.blink = true; break;
    case 'love': out.dir = 'down'; out.dy = -Math.abs(Math.sin(t / 300)) * 2; break;
    case 'flex': out.dir = 'down'; out.dy = -Math.abs(Math.sin(t / 250)) * 2; break;
    case 'sleep': out.dir = 'down'; out.blink = true; out.dy = Math.sin(t / 700) * 0.8; break;
    case 'highfive': {
      if (other) out.dir = faceTo(me, other);
      // un brinquito justo al chocar
      out.dy = k > 0.25 && k < 0.5 ? -Math.sin(((k - 0.25) / 0.25) * Math.PI) * 6 : 0;
      break;
    }
    case 'hug': {
      if (other) {
        out.dir = faceTo(me, other);
        const pull = Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (k > 0.8 ? (1 - k) / 0.2 : 1);
        const d = Math.hypot(other.rx - me.rx, other.ry - me.ry) || 1;
        const reach = Math.max(0, (d - 0.55) / 2) * 32 * pull;
        out.dx = ((other.rx - me.rx) / d) * reach;
        out.dy = ((other.ry - me.ry) / d) * reach;
      }
      break;
    }
    default: break;
  }
  return out;
}

function emoji(ctx, ch, x, y, size, alpha = 1, rot = 0) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Las notas y destellos no son emoji de color: llevan relleno y contorno propios
  if (/^[♪♫✦]$/.test(ch)) {
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(30,20,50,.55)'; ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = ch === '✦' ? '#FFCC00' : '#ffffff';
  }
  ctx.fillText(ch, 0, 0);
  ctx.restore();
}

// Efectos encima del personaje. cx: centro; top: arriba de la cabeza; me/other en casillas
export function drawEmoteFx(ctx, e, now, cx, top, me, other) {
  const t = now - e.start;
  const k = t / (e.until - e.start);
  const fade = Math.min(1, (1 - k) * 5);
  switch (e.kind) {
    case 'dance': {
      for (let i = 0; i < 3; i++) {
        const p = ((t / 1400) + i / 3) % 1;
        emoji(ctx, i % 2 ? '♫' : '♪', cx + Math.sin(p * 6 + i) * 10 + (i - 1) * 8, top - p * 18, 9, (1 - p) * fade);
      }
      // brillitos de pista de baile
      ctx.save();
      ctx.globalAlpha *= 0.25 * fade;
      ctx.fillStyle = ['#FE3377', '#FFCC00', '#3a86ff'][Math.floor(t / 260) % 3];
      ctx.beginPath(); ctx.ellipse(cx, top + 30, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    }
    case 'wave': emoji(ctx, '👋', cx + 11, top + 6, 10, fade, Math.sin(t / 110) * 0.5); break;
    case 'wink': {
      emoji(ctx, '😉', cx + 12, top - 2, 9, fade);
      if (k > 0.3 && k < 0.75) emoji(ctx, '✨', cx + 7 + (k - 0.3) * 20, top + 8 - (k - 0.3) * 20, 7, 1 - (k - 0.3) / 0.45);
      break;
    }
    case 'jump': if (k < 0.15) emoji(ctx, '💨', cx, top + 30, 8, 1 - k / 0.15); break;
    case 'spin': emoji(ctx, '💫', cx, top - 4, 9, fade, t / 120); break;
    case 'clap': {
      const s = 0.8 + Math.abs(Math.sin(t / 120)) * 0.4;
      emoji(ctx, '👏', cx, top + 14, 9 * s, fade);
      if (Math.floor(t / 240) % 2) emoji(ctx, '✨', cx + 9, top + 6, 6, fade);
      break;
    }
    case 'laugh': {
      emoji(ctx, '😂', cx + 12, top - 2, 9, fade, Math.sin(t / 60) * 0.25);
      ctx.save();
      ctx.globalAlpha *= fade;
      ctx.font = '700 6px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.textAlign = 'center';
      const y = top - 8 - (t % 800) / 80;
      ctx.strokeText('ja ja', cx - 8, y); ctx.fillText('ja ja', cx - 8, y);
      ctx.restore();
      break;
    }
    case 'love': {
      for (let i = 0; i < 4; i++) {
        const p = ((t / 1600) + i / 4) % 1;
        emoji(ctx, '❤️', cx + Math.sin(p * 7 + i * 2) * 9, top + 6 - p * 22, 6 + (1 - p) * 3, (1 - p) * fade);
      }
      break;
    }
    case 'flex': {
      const s = Math.sin(t / 250) > 0;
      emoji(ctx, '💪', cx + (s ? 12 : -12), top + 12, 9, fade, s ? 0.2 : -0.2);
      break;
    }
    case 'sleep': {
      for (let i = 0; i < 3; i++) {
        const p = ((t / 2400) + i / 3) % 1;
        ctx.save();
        ctx.globalAlpha *= (1 - p) * fade;
        ctx.font = `700 ${5 + p * 5}px system-ui, sans-serif`;
        ctx.fillStyle = '#e8f0ff'; ctx.strokeStyle = 'rgba(20,30,60,.6)'; ctx.lineWidth = 2;
        ctx.strokeText('z', cx + 8 + p * 10, top + 4 - p * 16); ctx.fillText('z', cx + 8 + p * 10, top + 4 - p * 16);
        ctx.restore();
      }
      break;
    }
    case 'highfive': {
      if (!other) break;
      const mx = ((me.rx + other.rx) / 2 + 0.5) * 32, my = ((me.ry + other.ry) / 2 + 1) * 32 - 30;
      // solo lo dibuja uno de los dos para no duplicar
      if (me.id < other.id) {
        if (k < 0.35) emoji(ctx, '✋', mx, my, 9 + k * 10, 1);
        else {
          const b = (k - 0.35) / 0.65;
          emoji(ctx, '💥', mx, my, 10 + b * 10, 1 - b);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            emoji(ctx, '✦', mx + Math.cos(a) * b * 16, my + Math.sin(a) * b * 16, 6, 1 - b);
          }
        }
      }
      break;
    }
    case 'hug': {
      if (!other || me.id > other.id) break;
      const mx = ((me.rx + other.rx) / 2 + 0.5) * 32, my = ((me.ry + other.ry) / 2 + 1) * 32 - 40;
      emoji(ctx, '💞', mx, my - Math.sin(k * Math.PI) * 6, 10 + Math.sin(k * Math.PI) * 3, fade);
      break;
    }
    default: break;
  }
}
