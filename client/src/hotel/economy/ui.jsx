// Piezas chicas de la economía: moneda, precio y vista previa grande (con rotación y animación).
import React, { useEffect, useRef } from 'react';
import { footprint } from '@shared/hotelCatalog.js';
import { priceOf } from '@shared/hotelEconomy.js';
import { drawFurni, furniBounds, drawWallItem, wallBounds } from '../furniArt.js';
import { fmtC } from './ecoStore.js';

// Moneda HUB (hexágono dorado)
export function Coin({ size = 14 }) {
  return (
    <svg className="eco-coin" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9.2" fill="#a8740a" />
      <circle cx="10" cy="9.4" r="8.4" fill="#f2b916" />
      <circle cx="10" cy="9.4" r="6.4" fill="none" stroke="#ffe27a" strokeWidth="1.2" />
      <path d="M10 4.6 14.2 7v4.8L10 14.2 5.8 11.8V7Z" fill="#fff3b0" />
      <path d="M10 9.4 14.2 7v4.8L10 14.2Z" fill="#d79a0c" />
      <path d="M10 9.4 5.8 7v4.8L10 14.2Z" fill="#FE3377" />
    </svg>
  );
}
export function Price({ def, admin = false, n = 1, className = '' }) {
  if (def.exclusive) return <span className={`eco-price excl ${className}`}>{admin ? 'Gratis para admins' : 'Exclusivo'}</span>;
  return <span className={`eco-price ${className}`}><Coin size={12} /> {fmtC(priceOf(def) * n)}</span>;
}

// Vista previa grande: piso en rombos (o un pedazo de pared) y el furni girado; se anima si el furni se mueve
export function BigPreview({ def, color, rot = 0, state = null, w = 220, h = 170 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !def) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d');
    const st = state ?? (def.interact === 'dice' ? 6 : def.states > 1 ? 1 : 0);
    const item = { type: def.id, x: 0, y: 0, z: 0, rot, state: st, color: color || def.colors?.[0] || null, extra: {} };
    let raf = 0, last = 0;
    const draw = (t) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 66) return; // ~15 cuadros por segundo alcanzan
      last = t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      try {
        if (def.kind === 'wall') {
          const b = wallBounds(def);
          const k = Math.min((w - 40) / b.w, (h - 40) / b.h, 2.2);
          ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 - (b.x + b.w / 2) * k), dpr * (h / 2 - (b.y + b.h / 2) * k));
          ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
          drawWallItem(ctx, def, { ...item, rot: 4 }, { t });
        } else {
          const fp = footprint(def, rot);
          const b = furniBounds(def, rot);
          const tiles = { x: (fp.w - fp.l) * 32 - 32 * fp.l, y: 0, w: (fp.w + fp.l) * 32, h: (fp.w + fp.l) * 16 };
          const bx = Math.min(b.x, -fp.l * 32), by = Math.min(b.y, 0), bw = Math.max(b.x + b.w, fp.w * 32) - bx, bh = Math.max(b.y + b.h, tiles.h) - by;
          const k = Math.min((w - 40) / bw, (h - 30) / bh, 1.8);
          ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 - (bx + bw / 2) * k), dpr * (h / 2 - (by + bh / 2) * k));
          // Piso: rombos de la huella (más uno de margen) para dar escala
          for (let j = -1; j <= fp.l; j++) for (let i = -1; i <= fp.w; i++) {
            const inFp = i >= 0 && j >= 0 && i < fp.w && j < fp.l;
            const x0 = (i - j) * 32, y0 = (i + j) * 16;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 32, y0 + 16); ctx.lineTo(x0, y0 + 32); ctx.lineTo(x0 - 32, y0 + 16); ctx.closePath();
            ctx.fillStyle = inFp ? 'rgba(254,51,119,.13)' : 'rgba(255,255,255,.035)'; ctx.fill();
            ctx.strokeStyle = inFp ? 'rgba(254,51,119,.35)' : 'rgba(255,255,255,.07)'; ctx.lineWidth = 1 / k; ctx.stroke();
          }
          drawFurni(ctx, def, item, { t });
        }
      } catch { /* dibujo provisional */ }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [def, color, rot, state, w, h]);
  return <canvas ref={ref} className="eco-preview" style={{ width: w, height: h }} />;
}
