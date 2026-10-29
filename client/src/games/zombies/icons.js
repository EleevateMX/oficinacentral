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
};

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
