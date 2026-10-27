// Caché de hojas de sprites (generadas desde la ficha del avatar o subidas como PNG).
import { renderSheet, normalizeSpec, SHEET_W, SHEET_H, FRAME_W, FRAME_H, DIRS } from '@shared/sprite.js';

const cache = new Map();
const listeners = new Set();

export function onSpritesLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const characterUrl = (id) => `/api/characters/${encodeURIComponent(id)}.png`;

function fromSpec(spec) {
  const c = document.createElement('canvas');
  c.width = SHEET_W;
  c.height = SHEET_H;
  c.getContext('2d').putImageData(new ImageData(renderSheet(spec), SHEET_W, SHEET_H), 0, 0);
  return c;
}

// Devuelve un canvas/imagen con la hoja completa, o null si aún se está cargando.
export function getSheet(avatar = {}) {
  if (avatar.sprite) {
    const key = `img:${avatar.sprite}`;
    if (!cache.has(key)) {
      const img = new Image();
      cache.set(key, null);
      img.onload = () => { cache.set(key, img); listeners.forEach((fn) => fn()); };
      img.onerror = () => cache.set(key, fromSpec(normalizeSpec({})));
      img.src = characterUrl(avatar.sprite);
    }
    return cache.get(key);
  }
  const spec = normalizeSpec(avatar);
  const key = JSON.stringify([spec.skin, spec.hair, spec.hairStyle, spec.top, spec.shirt, spec.accent, spec.pants, spec.shoes, spec.accessory]);
  if (!cache.has(key)) {
    if (cache.size > 300) cache.clear();
    cache.set(key, fromSpec(spec));
  }
  return cache.get(key);
}

export function drawSprite(ctx, sheet, dx, dy, dir = 'down', step = 0, scale = 1) {
  if (!sheet) return;
  const row = Math.max(0, DIRS.indexOf(dir));
  ctx.drawImage(sheet, (step % 3) * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, dx, dy, FRAME_W * scale, FRAME_H * scale);
}

export { FRAME_W, FRAME_H };
