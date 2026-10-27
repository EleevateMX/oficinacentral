// Caché de hojas de sprites (generadas desde la ficha del avatar o subidas como PNG).
import { renderFullSheet, normalizeSpec, frameCol, SPEC_KEYS, FRAME_W, FRAME_H, DIRS } from '@shared/sprite.js';

const cache = new Map();
const listeners = new Set();

export function onSpritesLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const characterUrl = (id) => `/api/characters/${encodeURIComponent(id)}.png`;

// Hoja completa (caminar de 4 cuadros + posturas); se genera una sola vez por ficha
function fromSpec(spec) {
  const { data, width, height } = renderFullSheet(spec);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
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
  const key = JSON.stringify(SPEC_KEYS.map((k) => spec[k]));
  if (!cache.has(key)) {
    if (cache.size > 300) cache.clear();
    cache.set(key, fromSpec(spec));
  }
  return cache.get(key);
}

// step: 0 = quieto, 1-4 = ciclo de caminar. pose: nombre de una postura (POSES);
// las hojas subidas de 3 columnas no la tienen y usan el cuadro normal.
export function drawSprite(ctx, sheet, dx, dy, dir = 'down', step = 0, scale = 1, pose = null) {
  if (!sheet) return;
  const row = Math.max(0, DIRS.indexOf(dir));
  const cols = Math.max(1, Math.floor((sheet.width || FRAME_W * 3) / FRAME_W));
  const col = Math.min(cols - 1, frameCol(step, pose, cols));
  ctx.drawImage(sheet, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H, dx, dy, FRAME_W * scale, FRAME_H * scale);
}

export { FRAME_W, FRAME_H };
