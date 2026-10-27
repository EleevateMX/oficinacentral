// Escenario: reflectores suaves sobre la tarima (se dibujan encima de los personajes)
import { floorStages } from '@shared/stage.js';

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function drawStageSpots(ctx, f, t, T, view) {
  const stages = floorStages(f);
  if (!stages.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of stages) {
    if (s.obj.type !== 'stage') continue;
    const { x, y, w, h } = s.rect;
    if (view && (x + w < view.x0 || x > view.x1 || y + h < view.y0 - 3 || y > view.y1)) continue;
    // Dos reflectores (rosa y amarillo) que se mecen despacio
    const beams = [['#FE3377', 0.25, 0], ['#FFCC00', 0.75, 1.9]];
    for (const [col, at, ph] of beams) {
      const sway = Math.sin(t / 1700 + ph) * w * 0.18;
      const cx = (x + w * at) * T + sway;
      const cy = (y + h * 0.55) * T;
      const rx = w * T * 0.26, ry = h * T * 0.42;
      // Haz que baja desde arriba
      const top = (y - 1.6) * T;
      const g1 = ctx.createLinearGradient(0, top, 0, cy);
      g1.addColorStop(0, rgba(col, 0)); g1.addColorStop(1, rgba(col, 0.1));
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.moveTo((x + w * at) * T - 6, top); ctx.lineTo((x + w * at) * T + 6, top);
      ctx.lineTo(cx + rx * 0.8, cy); ctx.lineTo(cx - rx * 0.8, cy);
      ctx.closePath(); ctx.fill();
      // Círculo de luz en el piso
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(1, ry / rx);
      const g2 = ctx.createRadialGradient(0, 0, 2, 0, 0, rx);
      g2.addColorStop(0, rgba(col, 0.2)); g2.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}
