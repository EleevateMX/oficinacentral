// Confeti de celebración (canvas encima de todo, se borra solo)
const COLORS = ['#FE3377', '#FFCC00', '#3a86ff', '#2bb673', '#9b5de5', '#ff8a3d'];

export function confetti({ count = 160, duration = 3800 } = {}) {
  if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti-canvas';
  c.width = innerWidth * devicePixelRatio;
  c.height = innerHeight * devicePixelRatio;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.scale(devicePixelRatio, devicePixelRatio);
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.5,
    y: innerHeight * 0.35 + Math.random() * 40,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    c: COLORS[(Math.random() * COLORS.length) | 0],
  }));
  const t0 = performance.now();
  const tick = (t) => {
    const k = (t - t0) / duration;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = Math.max(0, Math.min(1, (1 - k) * 3));
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      g.restore();
    }
    if (k < 1) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}
