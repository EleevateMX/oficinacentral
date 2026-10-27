// Exporta los personajes prediseñados a PNG.
// Uso: node tools/characters/generate.mjs [carpeta-destino]
//   <id>.png          hoja de sprites 96×192 (formato que acepta la oficina)
//   galeria.png       todos los personajes de frente, a 4×
//   plantilla.png     cuadrícula guía 96×192 para dibujar personajes a mano
//   plantilla-4x.png  la misma guía ampliada
import fs from 'node:fs';
import path from 'node:path';
import { encodePNG } from './png.mjs';
import { renderSheet, randomSpec, PRESETS, PACKS, FRAME_W, FRAME_H, SHEET_W, SHEET_H } from '../../shared/sprite.js';

const out = path.resolve(process.argv[2] || 'docs/personajes');
fs.mkdirSync(out, { recursive: true });

function scale(src, w, h, k) {
  const dst = new Uint8ClampedArray(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const si = (Math.floor(y / k) * w + Math.floor(x / k)) * 4;
      const di = (y * w * k + x) * 4;
      dst.set(src.subarray(si, si + 4), di);
    }
  }
  return dst;
}

// Hojas individuales
const sheets = {};
for (const p of PRESETS) {
  sheets[p.id] = renderSheet(p);
  fs.writeFileSync(path.join(out, `${p.id}.png`), encodePNG(SHEET_W, SHEET_H, sheets[p.id]));
  fs.writeFileSync(path.join(out, `${p.id}-4x.png`), encodePNG(SHEET_W * 4, SHEET_H * 4, scale(sheets[p.id], SHEET_W, SHEET_H, 4)));
}

// Galerías: cuadro de frente (fila 0, columna 0) de cada personaje, a 4×
function gallery(name, specs) {
  const gw = FRAME_W * specs.length;
  const img = new Uint8ClampedArray(gw * FRAME_H * 4);
  specs.forEach((spec, n) => {
    const sheet = renderSheet(spec);
    for (let y = 0; y < FRAME_H; y++) {
      const si = y * SHEET_W * 4;
      img.set(sheet.subarray(si, si + FRAME_W * 4), (y * gw + n * FRAME_W) * 4);
    }
  });
  fs.writeFileSync(path.join(out, name), encodePNG(gw * 4, FRAME_H * 4, scale(img, gw, FRAME_H, 4)));
}
for (const pack of PACKS) gallery(pack.id === 'nuvora' ? 'galeria.png' : `galeria-${pack.id}.png`, PRESETS.filter((p) => p.pack === pack.id));
// Muestras aleatorias (semilla fija para que salgan siempre iguales)
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
gallery('galeria-aleatorios.png', Array.from({ length: 12 }, () => randomSpec(rand)));

// Plantilla con guías
const tpl = new Uint8ClampedArray(SHEET_W * SHEET_H * 4);
const put = (x, y, rgba) => tpl.set(rgba, (y * SHEET_W + x) * 4);
for (let y = 0; y < SHEET_H; y++) {
  for (let x = 0; x < SHEET_W; x++) {
    const fx = x % FRAME_W, fy = y % FRAME_H;
    if (fx === 0 || fy === 0) put(x, y, [120, 120, 140, 160]); // borde de cuadro
    else if (fy === 46) put(x, y, [229, 72, 77, 170]); // línea de pies
    else if (fy === 13) put(x, y, [61, 123, 224, 120]); // tope de la cabeza
    else if (fy === 30) put(x, y, [47, 182, 124, 120]); // inicio del torso
    else if (fx === 16) put(x, y, [120, 120, 140, 60]); // centro
  }
}
// silueta tenue del personaje base
const base = renderSheet(PRESETS[0]);
for (let i = 0; i < base.length; i += 4) if (base[i + 3]) tpl.set([0, 0, 0, 38], i);
fs.writeFileSync(path.join(out, 'plantilla.png'), encodePNG(SHEET_W, SHEET_H, tpl));
fs.writeFileSync(path.join(out, 'plantilla-4x.png'), encodePNG(SHEET_W * 4, SHEET_H * 4, scale(tpl, SHEET_W, SHEET_H, 4)));

console.log(`Listo: ${PRESETS.length} personajes en ${out}`);
