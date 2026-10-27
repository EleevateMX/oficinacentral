// Mascotas interactivas en el mapa: comer del platito, ir por la pelota, caricias, trucos
// y alegría cuando llega su dueño. El servidor valida y transmite 'pet:action' (server/pets.js);
// aquí se guarda la acción en curso por dueño y MapView la consulta en cada cuadro.
import { petDef } from '@shared/pets.js';
import { playSound } from './sounds.js';

const T = 32;
let O = null; // la tienda (office), se recibe en initPetSocket para no importarla en círculo
export const acts = {}; // dueño -> acción en curso
export const moods = {}; // dueño -> felicidad 0–100
export const aim = { on: false }; // apuntando la pelota (clic en el mapa)

const DUR = { feed: 4400, pet: 1500, happy: 2200, ball: 9000 };
const TRICK_DUR = { sit: 1800, roll: 1300, jump: 1300, spin: 1400 };
export const TRICK_NAMES = { sit: 'Sentado', roll: 'Rodar', jump: 'Saltar', spin: 'Girar' };

export const petNameOf = (u) => u?.avatar?.petName || petDef(u?.avatar?.pet)?.name || 'Tu mascota';
const firstName = (u) => u?.displayName?.split(' ')[0] || 'Alguien';
const vol = () => O?.state.prefs?.audio?.notifVolume ?? 0.6;
const nearMe = (id) => {
  const me = O?.players[O.state.me?.id];
  const q = O?.players[id];
  return me && q && me.floorId === q.floorId && Math.hypot(me.rx - q.rx, me.ry - q.ry) < 9;
};

// Se llama al conectar el socket (store.js)
export function initPetSocket(office, s) {
  O = office;
  s.on('pet:moods', (m) => Object.assign(moods, m || {}));
  s.on('pet:action', (m) => {
    if (!m?.owner) return;
    if (m.mood != null) moods[m.owner] = m.mood;
    const start = performance.now();
    const owner = O.players[m.owner];
    const a = { ...m, start, dur: m.kind === 'trick' ? TRICK_DUR[m.trick] || 1500 : DUR[m.kind] || 1500 };
    if (m.kind === 'feed' && owner) {
      // El platito aparece junto al dueño, del lado contrario a donde mira
      const side = owner.dir === 'right' ? -1 : 1;
      a.bx = owner.rx + side * 0.95;
      a.by = owner.ry + 0.3;
    }
    acts[m.owner] = a;
    O.dispatch?.('pet:action', m);
    const meId = O.state.me?.id;
    if (!nearMe(m.owner) && m.owner !== meId) return;
    if (m.kind === 'pet') playSound('join', vol() * 0.5);
    if (m.kind === 'happy') playSound('wave', vol() * 0.4);
    if (m.kind === 'trick') playSound('power', vol() * 0.35);
    if (m.kind === 'ball') playSound('hit', vol() * 0.5);
    if (m.notify && m.owner === meId && m.by !== meId) {
      O.toast({ title: `❤️ ${firstName(O.state.users[m.by])} acarició a ${petNameOf(O.state.users[meId])}` });
    }
  });
}

// Pide una acción al servidor; devuelve la respuesta ({ ok, mood, error })
export function petAction(kind, owner, extra = {}) {
  return new Promise((resolve) => {
    const s = O?.socket;
    if (!s) return resolve({ ok: false, error: 'Sin conexión' });
    s.timeout(4000).emit('pet:action', { kind, owner, ...extra }, (err, r) => {
      const res = err ? { ok: false, error: 'Sin respuesta del servidor' } : r;
      if (res?.mood != null) moods[owner] = res.mood;
      if (!res?.ok && res?.error) O.toast({ title: res.error });
      resolve(res);
    });
  });
}
export function fetchMood(owner) {
  return new Promise((resolve) => {
    O?.socket?.timeout(4000).emit('pet:mood', owner, (err, r) => {
      if (!err && r?.ok) moods[owner] = r.happiness;
      resolve(err ? null : r);
    });
  });
}

// Lanzar la pelota: entra en modo apuntar; el siguiente clic en el mapa la lanza
export function startAim(owner) {
  aim.on = true;
  aim.owner = owner;
  document.body.classList.add('pet-aiming');
}
export function stopAim() {
  aim.on = false;
  document.body.classList.remove('pet-aiming');
}

// Clic en el mapa (MapView): lanzar la pelota o abrir la tarjeta de una mascota. true = ya se atendió
export function petClick(floorId, w) {
  if (!O) return false;
  if (aim.on) {
    stopAim();
    petAction('ball', aim.owner, { x: Math.floor(w.x), y: Math.floor(w.y) });
    return true;
  }
  for (const [id, p] of Object.entries(O.players)) {
    if (p.floorId !== floorId || p.petX == null) continue;
    const pet = O.state.users[id]?.avatar?.pet;
    if (!pet || pet === 'none') continue;
    if (Math.abs(w.x - (p.petX + 0.5)) < 0.42 && w.y > p.petY + 0.45 && w.y < p.petY + 1.08) {
      O.set({ petPanel: Number(id) });
      // Si no es tuya y estás junto a ella, la acaricias de una vez
      const meId = O.state.me.id;
      const me = O.players[meId];
      if (Number(id) !== meId && me && Math.max(Math.abs(me.x - p.x), Math.abs(me.y - p.y)) <= 2) petAction('pet', Number(id));
      return true;
    }
  }
  return false;
}

// ---------- Por cuadro ----------
const ease = (k) => 1 - (1 - k) * (1 - k);

// Hacia dónde va la mascota y cómo se ve durante la acción. p = jugador dueño (con petX/petY).
// Devuelve null si no hay acción, o { tx, ty, speed, face, fx, moving }
export function petStep(id, p, now) {
  const a = acts[id];
  if (!a) return null;
  const el = now - a.start;
  if (el > a.dur || el < 0) { delete acts[id]; return null; }
  const k = el / a.dur;
  switch (a.kind) {
    case 'feed': {
      const tx = a.bx + (a.bx > p.rx ? -0.55 : 0.55);
      const near = p.petX != null && Math.hypot(tx - p.petX, a.by - p.petY) < 0.25;
      if (near && !a.eatAt) a.eatAt = now;
      const eating = a.eatAt && now - a.eatAt < 2000;
      if (eating && Math.floor((now - a.eatAt) / 330) !== a.lastBite) {
        a.lastBite = Math.floor((now - a.eatAt) / 330);
        if (nearMe(id)) playSound('eat', vol() * 0.5);
      }
      const done = a.eatAt && now - a.eatAt >= 2000;
      if (done && !a.heartAt) a.heartAt = now;
      return {
        tx, ty: a.by, speed: 6, face: a.bx > (p.petX ?? p.rx) ? 1 : -1,
        fx: eating ? { rot: 0.22 + Math.sin(now / 55) * 0.08, dy: 1 } : done ? { dy: -Math.abs(Math.sin((now - a.heartAt) / 90)) * 3 } : null,
      };
    }
    case 'ball': {
      const flight = 650;
      const thrower = O.players[a.by] || p;
      if (!a.phase) a.phase = 'chase';
      const px = p.petX ?? p.rx, py = p.petY ?? p.ry;
      if (a.phase === 'chase' && el > flight && Math.hypot(a.x - px, a.y - py) < 0.3) { a.phase = 'pick'; a.pickAt = now; }
      if (a.phase === 'pick') {
        // La recoge con un meneíto antes de regresar
        if (now - a.pickAt > 350) a.phase = 'back';
        return { tx: a.x, ty: a.y, speed: 6, fx: { rot: 0.25 * Math.sin((now - a.pickAt) / 40), dy: 1 } };
      }
      if (a.phase === 'chase' && el > 4500) { a.phase = 'back'; a.pickAt = now; }
      if (a.phase === 'back') {
        const bx = thrower.rx + (thrower.rx >= px ? -0.7 : 0.7), by = thrower.ry + 0.25;
        if ((Math.hypot(bx - px, by - py) < 0.3 || now - a.pickAt > 4000) && !a.dropAt) { a.dropAt = now; a.dropX = px; a.dropY = py; if (nearMe(id)) playSound('score', vol() * 0.4); }
        if (a.dropAt && now - a.dropAt > 1200) { delete acts[id]; return null; }
        return { tx: bx, ty: by, speed: 2.6, fx: a.dropAt ? { dy: -Math.abs(Math.sin((now - a.dropAt) / 90)) * 3 } : null };
      }
      // Corre detrás de la sombra de la pelota y llega un poquito después de que cae
      const q = Math.max(0, Math.min(1, (el - 120) / flight));
      return { tx: a.fx + (a.x - a.fx) * q, ty: a.fy + (a.y - a.fy) * q, speed: 4, moving: true };
    }
    case 'pet': {
      const by = O.players[a.by];
      return { face: by ? (by.rx > (p.petX ?? p.rx) ? 1 : -1) : undefined, fx: { eyes: 'closed', dy: -Math.abs(Math.sin(el / 110)) * 1.5, sy: 1 - Math.abs(Math.sin(el / 160)) * 0.06 } };
    }
    case 'happy': {
      const j = Math.abs(Math.sin(el / 140));
      return { face: Math.floor(el / 280) % 2 ? -1 : 1, fx: { dy: -j * 7 * (1 - k * 0.5), sy: 1 - (1 - j) * 0.12 } };
    }
    case 'trick': {
      if (a.trick === 'sit') return { fx: { sy: 0.8 + 0.2 * Math.max(0, 1 - el / 200), dy: 0.5, eyes: el > 600 && el < 1200 ? 'closed' : undefined } };
      if (a.trick === 'roll') return { fx: { rot: ease(Math.min(1, el / 1000)) * Math.PI * 2, dy: -2 * Math.sin(Math.min(1, el / 1000) * Math.PI) } };
      if (a.trick === 'jump') return { fx: { dy: -Math.sin(Math.min(1, el / 900) * Math.PI) * 14, rot: Math.min(1, el / 900) * Math.PI * 2 } };
      return { face: Math.floor(el / 170) % 2 ? -1 : 1, fx: { dy: -Math.abs(Math.sin(el / 170)) * 2 } };
    }
    default:
      return null;
  }
}

// Corazón de pixel-art (7×6) centrado en x, y
function heart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < 7; c++) if (rows[r][c] === '#') ctx.fillRect(x + (c - 3.5) * s, y + (r - 3) * s, s, s);
}
function hearts(ctx, x, y, el, n = 3, life = 1200) {
  for (let i = 0; i < n; i++) {
    const e = el - i * 220;
    if (e < 0 || e > life) continue;
    const q = e / life;
    ctx.globalAlpha = Math.min(1, (1 - q) * 2);
    heart(ctx, x + Math.sin(i * 2.1 + q * 4) * 5 + (i - 1) * 4, y - q * 16, 0.8 + 0.4 * (1 - q), i % 2 ? '#FFCC00' : '#FE3377');
  }
  ctx.globalAlpha = 1;
}
function ball(ctx, x, y, r = 2.6) {
  ctx.fillStyle = '#d7f24a';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.arc(x - r * 0.9, y, r * 0.8, -0.9, 0.9); ctx.stroke();
}
function bowl(ctx, x, y, food) {
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y + 0.5, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FE3377';
  ctx.fillRect(x - 6, y - 4, 12, 4);
  ctx.fillRect(x - 5, y, 10, 1);
  ctx.fillStyle = '#c4185a';
  ctx.fillRect(x - 6, y - 4, 12, 1);
  if (food > 0) {
    ctx.fillStyle = '#9a5a2a';
    const n = Math.ceil(food * 6);
    for (let i = 0; i < n; i++) ctx.fillRect(x - 5 + i * 1.7, y - 5 - (i % 2), 1.6, 1.6);
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 1.5, y - 2.7, 3, 1.2);
}

// Lo que va en el suelo (platito, pelota tirada): antes de dibujar a la mascota
export function drawPetFxUnder(ctx, id, p, now) {
  const a = acts[id];
  if (!a) return;
  const el = now - a.start;
  if (a.kind === 'feed' && a.bx != null) {
    const food = a.eatAt ? Math.max(0, 1 - (now - a.eatAt) / 2000) : 1;
    ctx.globalAlpha = Math.min(1, el / 200, (a.dur - el) / 400);
    bowl(ctx, (a.bx + 0.5) * T, (a.by + 1) * T - 3, food);
    ctx.globalAlpha = 1;
  }
  if (a.kind === 'ball' && a.phase === 'chase' && el > 650) ball(ctx, (a.x + 0.5) * T, (a.y + 1) * T - 5);
  if (a.kind === 'ball' && a.dropAt) ball(ctx, (a.dropX + 0.5) * T + 6 * (p.petFace || 1), (a.dropY + 1) * T - 5);
}

// Lo que va encima: pelota volando o en el hocico, corazones y la carita del ánimo
export function drawPetFxOver(ctx, id, p, now, face) {
  if (p.petX == null) return;
  const x = (p.petX + 0.5) * T, y = (p.petY + 1) * T - 3;
  const a = acts[id];
  if (a) {
    const el = now - a.start;
    if (a.kind === 'ball') {
      if (el <= 650) {
        // Arco de la pelota desde quien la lanzó
        const q = el / 650;
        const bx = ((a.fx + (a.x - a.fx) * q) + 0.5) * T, gy = ((a.fy + (a.y - a.fy) * q) + 1) * T - 5;
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.beginPath(); ctx.ellipse(bx, gy + 2, 2.6, 1, 0, 0, Math.PI * 2); ctx.fill();
        ball(ctx, bx, gy - (1 - q) * 13 - Math.sin(q * Math.PI) * 30);
      } else if ((a.phase === 'back' || a.phase === 'pick') && !a.dropAt) ball(ctx, x + 8 * face, y - 6, 2.3);
      if (a.dropAt) hearts(ctx, x, y - 16, now - a.dropAt, 2, 1000);
    }
    if (a.kind === 'feed' && a.heartAt) hearts(ctx, x, y - 16, now - a.heartAt, 3);
    if (a.kind === 'pet' || a.kind === 'happy') hearts(ctx, x, y - 16, el, a.kind === 'happy' ? 5 : 3);
    if (a.kind === 'trick' && el > 900) {
      // Destellos al terminar el truco
      ctx.fillStyle = '#FFCC00';
      for (let i = 0; i < 4; i++) {
        const ang = i * 1.57 + el / 300, r = 8 + (el - 900) / 60;
        ctx.globalAlpha = Math.max(0, 1 - (el - 900) / 500);
        ctx.fillRect(x + Math.cos(ang) * r - 1, y - 8 + Math.sin(ang) * r - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    return;
  }
  // Ánimo muy alto o muy bajo: una carita chiquita de vez en cuando
  const m = moods[id];
  if (m == null || (m > 25 && m < 90)) return;
  const ph = (now + Number(id) * 977) % 7000;
  if (ph > 1600) return;
  ctx.globalAlpha = Math.sin((ph / 1600) * Math.PI) * 0.9;
  if (m >= 90) heart(ctx, x, y - 20 - ph / 200, 0.8, '#FE3377');
  else {
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💤', x + 4, y - 18 - ph / 250);
    ctx.textAlign = 'start';
  }
  ctx.globalAlpha = 1;
}
