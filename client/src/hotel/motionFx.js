// Hotel: detalles de movimiento que son solo de dibujo (el servidor no se entera).
//   turnVisual: el cuerpo y la cabeza giran pasando por las direcciones intermedias (no "saltan")
//   sitTransition: al sentarse o pararse se ve un cuadro intermedio (medio agachado) en vez de un salto
//   breathing: respiración de quieto (1 px cada ~1.2 s, cada quien a su ritmo)
const TURN_MS = 55, TURN_MS_WALK = 35, HALF_MS = 120;

const stepToward = (cur, target) => {
  const d = ((target - cur + 12) % 8) - 4;
  return d === 0 ? cur : (cur + Math.sign(d) + 8) % 8;
};

export function turnVisual(U, head, t, moving) {
  if (U._vd == null) { U._vd = U.dir; U._vdT = t; }
  if (U._vh == null) { U._vh = head; U._vhT = t; }
  const wait = moving ? TURN_MS_WALK : TURN_MS;
  if (U._vd !== U.dir && t - U._vdT >= wait) { U._vd = stepToward(U._vd, U.dir); U._vdT = t; }
  // La cabeza sigue al cuerpo y luego a donde mira (máximo una dirección de diferencia, como el original)
  const want = head;
  if (U._vh !== want && t - U._vhT >= wait) { U._vh = stepToward(U._vh, want); U._vhT = t; }
  let h = U._vh;
  const diff = ((h - U._vd + 12) % 8) - 4;
  if (Math.abs(diff) > 1) h = (U._vd + Math.sign(diff) + 8) % 8;
  return { dir: U._vd, head: h };
}

export function sitTransition(U, pose, t) {
  const sitting = pose === 'sit';
  if (U._wasSit == null) U._wasSit = sitting;
  if (sitting !== U._wasSit) {
    U._wasSit = sitting;
    U._sitT = t;
  }
  return U._sitT != null && t - U._sitT < HALF_MS && (pose === 'sit' || pose === 'stand' || pose === 'walk');
}

export const breathing = (t, id) => ((t + (Math.abs(Number(id)) || 0) * 619) % 1250) > 700;
