// Íconos de armas y de la tienda, dibujados con código (canvas 2D) en un espacio de 64×64.
// Estilo: siluetas planas con contorno oscuro y un toque neón.

const INK = '#0b0c14';

function rr(g, x, y, w, h, r, fill, stroke = INK, lw = 2.5) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function poly(g, pts, fill, stroke = INK, lw = 2.5) {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(); }
}
function circle(g, x, y, r, fill, stroke = INK, lw = 2.5) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}

const DRAW = {
  // Grapadora: cuerpo rojo con tapa gris
  grapadora(g) {
    rr(g, 8, 36, 46, 12, 4, '#2b2f3a');
    poly(g, [[10, 36], [50, 26], [56, 30], [56, 36]], '#d62f3a');
    rr(g, 6, 30, 16, 8, 3, '#9aa3ad');
    rr(g, 40, 46, 16, 6, 2, '#7CFF4F', INK, 2);
  },
  // Escopeta de café: cañón ancho con taza
  cafetera(g) {
    rr(g, 6, 28, 40, 10, 3, '#5a3a1a');
    rr(g, 30, 24, 28, 9, 3, '#3a3f4b');
    rr(g, 30, 34, 24, 6, 2, '#2b2f3a');
    poly(g, [[8, 38], [20, 38], [16, 52], [6, 52]], '#7a4a2b');
    rr(g, 44, 10, 12, 12, 2, '#f4f6f8');
    g.strokeStyle = '#c9a227'; g.lineWidth = 2; g.beginPath(); g.moveTo(47, 6); g.quadraticCurveTo(50, 2, 47, -1); g.stroke();
  },
  // Clavadora: cuerpo amarillo, cargador de clavos
  clavadora(g) {
    rr(g, 8, 20, 40, 16, 4, '#FFCC00');
    rr(g, 44, 24, 14, 8, 2, '#3a3f4b');
    poly(g, [[16, 36], [28, 36], [24, 54], [12, 54]], '#2b2f3a');
    rr(g, 30, 36, 16, 6, 2, '#9aa3ad');
    for (let i = 0; i < 4; i++) { g.fillStyle = INK; g.fillRect(32 + i * 3.5, 37, 1.6, 4); }
  },
  // Caja de grapas
  ammo(g) {
    rr(g, 10, 22, 44, 30, 4, '#3d7be0');
    rr(g, 10, 16, 44, 10, 3, '#5a95f5');
    rr(g, 18, 32, 28, 10, 2, '#f4f6f8', INK, 2);
    g.fillStyle = INK; for (let i = 0; i < 5; i++) g.fillRect(21 + i * 5, 35, 2, 4);
  },
  // Dona y café
  heal(g) {
    rr(g, 34, 20, 20, 30, 4, '#f4f6f8');
    rr(g, 34, 20, 20, 7, 3, '#FE3377');
    g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.arc(56, 36, 6, -1.2, 1.2); g.stroke();
    circle(g, 22, 40, 14, '#d99a52');
    circle(g, 22, 40, 11, '#ff7ab6', null);
    circle(g, 22, 40, 4.5, '#12111a');
    g.fillStyle = '#7CFF4F'; g.fillRect(15, 33, 3, 1.6); g.fillStyle = '#FFCC00'; g.fillRect(27, 35, 3, 1.6); g.fillStyle = '#fff'; g.fillRect(20, 47, 3, 1.6);
  },
  // Chaleco reflectante
  armor(g) {
    poly(g, [[16, 12], [26, 12], [32, 20], [38, 12], [48, 12], [54, 24], [50, 54], [14, 54], [10, 24]], '#ff8a3d');
    g.fillStyle = '#e6ff4a'; g.fillRect(13, 34, 38, 5); g.fillRect(13, 44, 38, 4);
    g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 20); g.lineTo(32, 54); g.stroke();
  },
  // Grapas de titanio (mejora de daño)
  upgrade(g) {
    poly(g, [[32, 6], [52, 18], [52, 42], [32, 56], [12, 42], [12, 18]], '#2a2d44');
    g.strokeStyle = '#4FD8FF'; g.lineWidth = 4; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(22, 40); g.lineTo(22, 26); g.lineTo(42, 26); g.lineTo(42, 40); g.stroke();
    poly(g, [[32, 12], [38, 20], [26, 20]], '#7CFF4F', null);
  },
  // Rifle de tóner: cuerpo largo, cartucho rosa y culata
  toner(g) {
    rr(g, 4, 26, 12, 10, 2, '#3a3f4b');
    rr(g, 14, 22, 32, 14, 3, '#2b2f3a');
    rr(g, 44, 26, 16, 5, 2, '#141414');
    poly(g, [[24, 36], [34, 36], [36, 52], [26, 52]], '#141414');
    rr(g, 25, 40, 10, 4, 1, '#FE3377', INK, 1.5);
    poly(g, [[14, 36], [20, 36], [18, 48], [12, 48]], '#1d1f26');
    for (const [i, c] of ['#29d3ff', '#ff3fa4', '#ffe14f'].entries()) { g.fillStyle = c; g.fillRect(30 + i * 5, 26, 3.5, 4); }
  },
  // Láser de presentación: tubo plateado, mira y punto rojo
  laser(g) {
    rr(g, 4, 30, 50, 7, 3, '#c9ced6');
    rr(g, 20, 21, 22, 7, 3, '#141414');
    rr(g, 40, 22, 3, 5, 1, '#4FD8FF', null);
    circle(g, 57, 33.5, 4, '#ff2d55');
    g.strokeStyle = 'rgba(255,45,85,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(60, 33.5); g.lineTo(64, 33.5); g.stroke();
    poly(g, [[12, 37], [22, 37], [20, 54], [10, 54]], '#1d1f26');
    circle(g, 16, 43, 1.8, '#FE3377', null); circle(g, 16, 48, 1.8, '#7CFF4F', null);
  },
  // Trituradora de papel: cabezal, boca y tiras
  trituradora(g) {
    rr(g, 8, 18, 44, 18, 4, '#d9dde2');
    rr(g, 8, 26, 44, 3, 1, '#FE3377', null);
    rr(g, 50, 22, 8, 10, 2, '#0d0e12');
    for (let i = 0; i < 4; i++) rr(g, 52 + (i % 2) * 3, 32 + i * 0.5, 2, 10 + (i % 2) * 6, 1, '#f4f6f8', INK, 1);
    rr(g, 14, 36, 30, 14, 3, '#3a3f4b');
    rr(g, 20, 12, 18, 5, 2, '#1d1f26');
  },
  // Lanzatazas: tubo rosa con una taza en la boca
  lanzatazas(g) {
    rr(g, 6, 22, 44, 16, 6, '#FE3377');
    for (const x of [14, 30]) { g.fillStyle = INK; g.fillRect(x, 22, 3, 16); }
    rr(g, 46, 20, 14, 20, 3, '#f4f6f8');
    g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.arc(46, 30, 5, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
    rr(g, 48, 21, 10, 4, 1, '#6b3f22', null);
    poly(g, [[16, 38], [24, 38], [22, 52], [14, 52]], '#1d1f26');
  },
  // Katana de oficina: hoja larga con filo azul y guarda de disco
  katana(g) {
    poly(g, [[14, 50], [54, 8], [58, 6], [56, 11], [18, 54]], '#e8eef5');
    g.strokeStyle = '#4FD8FF'; g.lineWidth = 2; g.beginPath(); g.moveTo(17, 53); g.lineTo(56, 10); g.stroke();
    circle(g, 15, 51, 7, '#d9dde2');
    circle(g, 15, 51, 2, '#333844', null);
    poly(g, [[4, 62], [12, 54], [14, 56], [6, 64]], '#2a7fd4');
  },
  // Regla afilada: hoja ancha con marcas y punta en diagonal
  regla(g) {
    poly(g, [[12, 46], [44, 14], [56, 10], [52, 22], [20, 54]], '#d9dde2');
    g.fillStyle = INK; for (let i = 0; i < 8; i++) { const t = i / 8; g.fillRect(18 + t * 30, 46 - t * 30, 2, 2); }
    g.strokeStyle = '#FFCC00'; g.lineWidth = 2; g.beginPath(); g.moveTo(21, 53); g.lineTo(52, 22); g.stroke();
    rr(g, 8, 48, 14, 5, 2, '#FFCC00');
    poly(g, [[4, 60], [10, 52], [14, 55], [8, 62]], '#3a2a1a');
  },
  // Espada de cartón corrugado: hoja enorme de caja con cinta
  carton(g) {
    poly(g, [[14, 42], [46, 6], [58, 4], [56, 16], [22, 50]], '#b98a52');
    g.strokeStyle = '#8a6234'; g.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(17 + i * 2, 44 + i * 2); g.lineTo(49 + i * 2, 9 + i * 2); g.stroke(); }
    poly(g, [[28, 26], [34, 20], [38, 24], [32, 30]], '#e8d9a8', null);
    g.strokeStyle = '#ff7a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(22, 50); g.lineTo(56, 15); g.stroke();
    rr(g, 6, 44, 20, 6, 2, '#a8763e');
    poly(g, [[2, 60], [10, 50], [15, 54], [7, 63]], '#7a7f88');
  },
  // Caja misteriosa: caja con signo de interrogación neón
  box(g) {
    poly(g, [[8, 22], [32, 12], [56, 22], [32, 32]], '#5a3a8a');
    poly(g, [[8, 22], [32, 32], [32, 58], [8, 48]], '#3a2460');
    poly(g, [[56, 22], [32, 32], [32, 58], [56, 48]], '#2a1848');
    g.font = '900 22px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#7CFF4F'; g.fillText('?', 20, 40); g.fillStyle = '#FE3377'; g.fillText('?', 44, 40);
  },
  // Filo de acero (mejora de espadas)
  swordup(g) {
    poly(g, [[32, 6], [52, 18], [52, 42], [32, 56], [12, 42], [12, 18]], '#2a2d44');
    poly(g, [[32, 12], [36, 16], [36, 40], [32, 44], [28, 40], [28, 16]], '#e8eef5');
    rr(g, 22, 40, 20, 4, 1, '#FFCC00', INK, 1.5);
    rr(g, 30, 44, 4, 8, 1, '#3a2a1a', INK, 1.5);
  },
  // Respiración profunda (más energía)
  energy(g) {
    poly(g, [[32, 6], [52, 18], [52, 42], [32, 56], [12, 42], [12, 18]], '#2a2d44');
    g.strokeStyle = '#4FD8FF'; g.lineWidth = 3.5; g.lineCap = 'round';
    for (const [y, w] of [[22, 16], [32, 22], [42, 14]]) { g.beginPath(); g.moveTo(32 - w / 2, y); g.quadraticCurveTo(32, y - 6, 32 + w / 2, y); g.stroke(); }
    poly(g, [[34, 26], [28, 34], [33, 34], [30, 42], [38, 32], [33, 32]], '#FFCC00', null);
  },
  // Golpe rápido (puño)
  bash(g) {
    rr(g, 16, 18, 30, 26, 8, '#f6c9a0');
    for (let i = 0; i < 3; i++) { g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(24 + i * 8, 18); g.lineTo(24 + i * 8, 30); g.stroke(); }
    rr(g, 20, 44, 22, 12, 3, '#3d7be0');
  },
  // Estilos de las técnicas
  agua(g) {
    g.strokeStyle = '#4FD8FF'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(8, 40); g.bezierCurveTo(20, 18, 30, 54, 42, 28); g.quadraticCurveTo(48, 16, 58, 20); g.stroke();
    g.strokeStyle = '#e8fbff'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 40); g.bezierCurveTo(22, 22, 30, 50, 42, 30); g.stroke();
    circle(g, 56, 20, 4, '#e8fbff', null);
  },
  llama(g) {
    poly(g, [[32, 4], [46, 24], [44, 40], [52, 34], [50, 50], [32, 60], [14, 50], [12, 34], [20, 40], [18, 24]], '#ff6a1a');
    poly(g, [[32, 22], [40, 36], [38, 50], [32, 54], [26, 50], [24, 36]], '#ffd27a', null);
  },
  rayo(g) {
    poly(g, [[38, 4], [16, 36], [30, 36], [24, 60], [48, 26], [34, 26], [42, 4]], '#ffe14f');
  },
};

// Lienzos de íconos ya dibujados (para el HUD: se dibujan una vez y se reusan)
const imgCache = new Map();
export function iconImage(id, px = 64) {
  const k = `${id}:${px}`;
  if (!imgCache.has(k)) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    drawIcon(c, id);
    imgCache.set(k, c);
  }
  return imgCache.get(k);
}
export const hasIcon = (id) => !!DRAW[id];

// Dibuja el ícono `id` en un canvas (de cualquier tamaño, nítido en pantallas densas)
export function drawIcon(canvas, id) {
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const k = Math.min(canvas.width, canvas.height) / 64;
  g.save();
  g.scale(k, k);
  (DRAW[id] || DRAW.ammo)(g);
  g.restore();
}

// Crea un <canvas> con el ícono
export function iconCanvas(id, px = 56) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  c.width = c.height = Math.round(px * dpr);
  c.style.width = c.style.height = `${px}px`;
  drawIcon(c, id);
  return c;
}
