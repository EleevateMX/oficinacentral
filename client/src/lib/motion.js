// Movimiento suave de los personajes en la oficina.
//
// - Los demás: cada casilla que manda el servidor se guarda con la hora en que llegó y el personaje
//   se dibuja un poquito en el pasado (DELAY), interpolando entre esas muestras. Así, aunque los
//   mensajes lleguen a destiempo, se mueve a velocidad pareja, sin tirones ni saltos.
// - Tú: tu personaje se mueve en cuanto aprietas la tecla (predicción) a la misma velocidad que tus
//   pasos; si el servidor no acepta un paso, te regresa y el personaje vuelve deslizándose.
// - El ciclo de caminar avanza según la distancia recorrida (no según el tiempo), para que los pies
//   no "patinen", y al voltear pasa por las direcciones intermedias.
import { viewFromVec, turnToward, toFour, walkFrame } from './avatarV2.js';

export const DELAY = 175; // ms en el pasado para los demás
const KEEP = 1500;

// Lo llama store.js al recibir 'move' de otra persona (p.x/p.y ya traen la casilla nueva)
export function trackRemoteMove(p, reset = false, now = performance.now(), stepMs = 135) {
  if (reset) { p.buf = [{ t: now, x: p.x, y: p.y }]; return; }
  const buf = p.buf || (p.buf = []);
  let last = buf[buf.length - 1];
  if (!last) {
    last = { t: now - stepMs, x: p.rx ?? p.x, y: p.ry ?? p.y };
    buf.push(last);
  } else if (now - last.t > stepMs * 1.6) {
    // Estaba parado: el primer paso dura un paso normal (no todo el tiempo que estuvo quieto)
    last.t = now - stepMs;
  }
  // Muestras muy juntas (llegaron en bola): se reparten para no acelerar de golpe
  buf.push({ t: Math.max(now, last.t + stepMs * 0.45), x: p.x, y: p.y });
  while (buf.length > 2 && buf[1].t < now - DELAY - KEEP) buf.shift();
}

// Posición de un personaje remoto en el instante rt (interpolada entre sus muestras)
export function sampleAt(buf, rt) {
  if (!buf?.length) return null;
  if (rt <= buf[0].t) return { x: buf[0].x, y: buf[0].y };
  for (let i = 1; i < buf.length; i++) {
    const b = buf[i];
    if (rt <= b.t) {
      const a = buf[i - 1];
      const k = (rt - a.t) / (b.t - a.t || 1);
      // Una casilla a la vez: si hay un salto grande (teletransporte) no se interpola
      if (Math.abs(b.x - a.x) > 2 || Math.abs(b.y - a.y) > 2) return { x: b.x, y: b.y };
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const z = buf[buf.length - 1];
  return { x: z.x, y: z.y };
}

// Avanza a un personaje un cuadro de animación.
//   mine: es el tuyo · stepMs: duración de tu paso (caminar o correr) · eight: hay vistas diagonales (HUB v2)
//   stride: casillas por ciclo de caminar completo (dos pasos)
export function stepPlayer(p, { now, dt, mine, stepMs = 135, eight = true, stride = 2 }) {
  if (p.rx == null) { p.rx = p.x; p.ry = p.y; }
  const ox = p.rx, oy = p.ry;
  if (mine || !p.buf?.length) {
    // A la velocidad exacta de tus pasos: llega justo cuando empieza el siguiente (sin tironcitos)
    const dx = p.x - p.rx, dy = p.y - p.ry;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) { p.rx = p.x; p.ry = p.y; } else if (dist > 0) {
      let speed = (1000 / stepMs) * 1.06;
      if (dist > 1.6) speed *= 2.5; // se quedó atrás (corrección del servidor)
      if (!mine) speed = Math.max(speed, dist * 9);
      const s = Math.min(dist, speed * dt);
      p.rx += (dx / dist) * s;
      p.ry += (dy / dist) * s;
    }
  } else {
    const q = sampleAt(p.buf, now - DELAY);
    // Si se atrasó mucho (pestaña en segundo plano) se pone al día
    if (Math.hypot(p.x - q.x, p.y - q.y) > 4) { p.buf = [{ t: now, x: p.x, y: p.y }]; p.rx = p.x; p.ry = p.y; } else { p.rx = q.x; p.ry = q.y; }
  }
  const mx = p.rx - ox, my = p.ry - oy;
  const d = Math.hypot(mx, my);
  if (d > 1.5) { p.walkPhase = 0; p.moving = false; return p; } // teletransporte
  if (d > 1e-5) {
    p.lastMoveT = now;
    p.walkPhase = ((p.walkPhase || 0) + d / stride) % 1;
    p.anim = (p.anim || 0) + dt; // compatibilidad
    const v = viewFromVec(mx, my, p.view || p.dir);
    p.moveView = v;
    p.moveDir = p.dir;
  }
  // Entre paso y paso (casillas) no se detiene un instante: sigue "caminando" un momento
  p.moving = d > 1e-5 || (p.lastMoveT != null && now - p.lastMoveT < 60 && (p.rx !== p.x || p.ry !== p.y));
  if (!p.moving && d <= 1e-5 && now - (p.lastMoveT || 0) > 90) p.walkPhase = 0;
  // Hacia dónde ve: caminando, hacia donde avanza (8 direcciones); parado, hacia su dirección
  // (si se detuvo en diagonal se queda así hasta que voltee a otro lado)
  let target = p.dir || 'down';
  if (eight && p.moveView && (p.moving || p.moveDir === p.dir)) target = p.moveView;
  if (!eight) target = toFour(p.dir || 'down');
  if (!p.view) p.view = target;
  if (p.view !== target) {
    if (now - (p.turnT || 0) > (p.moving ? 30 : 55)) {
      p.view = turnToward(p.view, target, eight);
      p.turnT = now;
    }
  }
  if (!eight && p.view !== toFour(p.view)) p.view = toFour(p.view);
  return p;
}

// Cuadro de caminar (HUB v2: 1–8) y paso del clásico (1–4) según la fase
export const walkStepV2 = (p) => (p.moving ? walkFrame(p.walkPhase || 0) : 0);
export const walkStepClassic = (p) => (p.moving ? (Math.floor((p.walkPhase || 0) * 4) % 4) + 1 : 0);
// Respiración: 1 px abajo un ratito cada ~1.2 s (cada quien a su ritmo)
export const breathing = (t, id) => ((t + (Number(id) || 0) * 619) % 1250) > 700;
