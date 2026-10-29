// Hotel: acciones del personaje (menú "Acciones" y comandos del chat). Todo disponible para todos.
// actPose() da la postura de cada cuadro con las posturas del sprite de la oficina (POSE_DEFS de
// shared/sprite.js) y respeta hacia dónde ve el cuerpo (0–7), así se ven bien en las 8 direcciones.
// Las cuatro rutinas de baile son distintas entre sí y todos las ven igual (viaja el número del baile).

export const ACT_LIST = {
  dances: [
    { n: 1, label: 'Bailar 1', name: 'Disco', emoji: '🕺' },
    { n: 2, label: 'Bailar 2', name: 'Brincos', emoji: '🙌' },
    { n: 3, label: 'Bailar 3', name: 'Robot', emoji: '🤖' },
    { n: 4, label: 'Bailar 4', name: 'Shuffle', emoji: '👟' },
  ],
  actions: [
    { id: 'wave', label: 'Saludar', emoji: '👋', cmd: ':saludar' },
    { id: 'kiss', label: 'Mandar beso', emoji: '😘', cmd: ':beso' },
    { id: 'laugh', label: 'Reír', emoji: '😂', cmd: ':reir' },
    { id: 'jump', label: 'Saltar', emoji: '🤸', cmd: ':saltar' },
  ],
};

const rot = (d, k) => (((d + k) % 8) + 8) % 8;

function dance(n, t, dir, out) {
  switch (n) {
    case 2: {
      // Brincos: manos arriba, se agacha y rebota; cada 8 tiempos da un cuarto de vuelta
      const beat = Math.floor(t / 260);
      out.pose = beat % 2 ? 'squatUp' : 'armsUp';
      out.dy = beat % 2 ? 0 : -Math.sin(((t % 260) / 260) * Math.PI) * 5;
      out.dir = rot(dir, [0, 2, 4, 6][Math.floor(beat / 8) % 4]);
      break;
    }
    case 3: {
      // Robot: brazos en escuadra, giros secos a un lado y al otro, sin rebote
      const beat = Math.floor(t / 340);
      out.pose = beat % 2 ? 'robotB' : 'robotA';
      out.dir = rot(dir, [0, 0, -1, -1, 0, 0, 1, 1][beat % 8]);
      out.dx = [0, 0, -1, -2, 0, 0, 1, 2][beat % 8];
      out.dy = beat % 4 === 3 ? -1 : 0;
      break;
    }
    case 4: {
      // Shuffle: patea un pie y luego el otro deslizándose de lado; a la mitad, floss
      const beat = Math.floor(t / 190);
      const floss = Math.floor(beat / 16) % 2 === 1;
      out.pose = floss ? (beat % 2 ? 'flossB' : 'flossA') : beat % 2 ? 'shuffleB' : 'shuffleA';
      const slide = Math.floor(beat / 4) % 2 ? 1 : -1;
      out.dx = floss ? (beat % 2 ? -2 : 2) : slide * ((beat % 4) - 1.5) * 1.5;
      out.dy = -Math.abs(Math.sin((t / 190) * Math.PI)) * 1.5;
      break;
    }
    default: {
      // Disco: señala arriba a un lado y al otro con la cadera hacia el dedo
      const b = Math.floor(t / 420) % 2;
      out.pose = b ? 'pointB' : 'pointA';
      out.dx = (b ? 2 : -2) * Math.min(1, (t % 420) / 140);
      out.dy = -Math.abs(Math.sin((t / 420) * Math.PI)) * 2;
      break;
    }
  }
}

// → { pose, dir, dx, dy, blink } (dx/dy en píxeles del dibujo; dy negativo = arriba)
export function actPose(act, n, t, dir) {
  const out = { pose: null, dir, dx: 0, dy: 0, blink: false };
  t = Math.max(0, t || 0);
  switch (act) {
    case 'dance': dance(n | 0, t, dir, out); break;
    case 'wave': out.pose = Math.floor(t / 280) % 2 ? 'wave2' : 'wave1'; break;
    case 'kiss':
      // La mano a la boca y luego la lanza hacia el frente
      out.pose = t < 550 ? 'heart' : t < 1700 ? 'reach' : null;
      out.blink = t > 300 && t < 700;
      out.dy = t > 550 && t < 800 ? -1 : 0;
      break;
    case 'laugh':
      out.pose = 'belly';
      out.blink = true;
      out.dx = Math.round(Math.sin(t / 45) * 1);
      out.dy = -Math.round(Math.abs(Math.sin(t / 110)) * 2);
      break;
    case 'jump': {
      // Dos brincos: se agacha, sube con los brazos arriba y aterriza flexionando
      const ph = (t % 650) / 650;
      out.dy = ph < 0.12 || ph > 0.9 ? 0 : -Math.sin(((ph - 0.12) / 0.78) * Math.PI) * 13;
      out.pose = ph < 0.12 || ph > 0.9 ? 'crouch' : 'armsUp';
      break;
    }
    default: break;
  }
  return out;
}
