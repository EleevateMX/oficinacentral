// Genera los íconos PNG a partir del logo de client/public/logo.svg
// (cuadros redondeados), sin dependencias: se dibuja a mano y se guarda con zlib.
// electron-builder convierte build/icon.png a .ico (Windows) y .icns (macOS).
// Uso: node scripts/icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Mismas figuras que logo.svg (viewBox 64x64)
const SHAPES = [
  { x: 0, y: 0, w: 64, h: 64, r: 16, c: [0x0a, 0x2b, 0x2c] },
  { x: 8, y: 8, w: 22, h: 22, r: 6, c: [0xff, 0xff, 0xff] },
  { x: 34, y: 8, w: 22, h: 22, r: 6, c: [0xff, 0xff, 0xff] },
  { x: 8, y: 34, w: 22, h: 22, r: 6, c: [0xff, 0xff, 0xff] },
  { x: 34, y: 34, w: 22, h: 22, r: 6, c: [0xff, 0x8a, 0x3d] },
];

function inside(s, x, y) {
  if (x < s.x || y < s.y || x > s.x + s.w || y > s.y + s.h) return false;
  const cx = Math.min(Math.max(x, s.x + s.r), s.x + s.w - s.r);
  const cy = Math.min(Math.max(y, s.y + s.r), s.y + s.h - s.r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= s.r ** 2;
}

function render(size, { pad = 0 } = {}) {
  const N = 4; // submuestras por lado (suavizado)
  const buf = Buffer.alloc(size * size * 4);
  const scale = 64 / (size - pad * 2);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const x = (px - pad + (sx + 0.5) / N) * scale;
          const y = (py - pad + (sy + 0.5) / N) * scale;
          let col = null;
          for (const s of SHAPES) if (inside(s, x, y)) col = s.c;
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
        }
      }
      const i = (py * size + px) * 4;
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return buf;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const root = path.join(__dirname, '..');
const out = [
  // Ícono del instalador y de la app (macOS pide margen alrededor)
  ['build/icon.png', 1024, { pad: 100 }],
  // Ventana y bandeja del sistema
  ['assets/icon.png', 256, {}],
  ['assets/tray.png', 16, {}],
  ['assets/tray@2x.png', 32, {}],
];
for (const [file, size, opts] of out) {
  const dest = path.join(root, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png(size, render(size, opts)));
  console.log(`✓ ${file} (${size}px)`);
}
