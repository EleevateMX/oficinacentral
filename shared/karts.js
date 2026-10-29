// 🏎️ Karts de oficina: lógica pura (sin DOM ni three.js), compartida por el juego y las pruebas.
//
// - VEHICLES: registro de vehículos con sus estadísticas (para agregar más autos después).
// - TRACKS: las pistas, armadas con una "tortuga" (rectas, curvas y subidas) y cerradas con una curva suave.
//   buildTrack() las convierte en muestras cada ~1 m con posición, altura, tangente, normal y ancho.
// - Física arcade (stepKart): aceleración, frenado y reversa, dirección que depende de la velocidad,
//   derrape con mini turbo, rampas y saltos, choques con las barreras y con otros karts.
// - Vueltas y orden de carrera (updateLaps, raceOrder) y la IA que sigue la línea (aiInput).
//
// Unidades: metros y segundos. Plano x (este) / z (sur); y es la altura. heading 0 = mira a +x,
// y crece girando a la derecha (hacia +z).

export const LAPS = 3;
export const MAX_RACERS = 8;
export const STEP = 1; // metros entre muestras de la pista
export const GRAVITY = 24;
export const KART_R = 0.72; // radio de choque de un kart

// ---------- Vehículos ----------
// speed: velocidad máxima (m/s) · accel: m/s² · handling: giro (rad/s) · weight: masa relativa en choques
export const VEHICLES = {
  kart: { id: 'kart', name: 'Kart de oficina', model: 'kart', speed: 25, accel: 17, handling: 2.35, weight: 1, grip: 11, driftGrip: 2.6 },
};
export const DEFAULT_VEHICLE = 'kart';
export function vehicleStats(id) { return VEHICLES[id] || VEHICLES[DEFAULT_VEHICLE]; }

// Colores del kart (el jugador escoge uno en la sala)
export const KART_COLORS = [
  { id: 'rosa', name: 'Rosa HUB', body: '#FE3377', trim: '#141414' },
  { id: 'amarillo', name: 'Amarillo', body: '#FFCC00', trim: '#141414' },
  { id: 'azul', name: 'Azul', body: '#3a86ff', trim: '#f4f4f6' },
  { id: 'verde', name: 'Verde', body: '#2bb673', trim: '#141414' },
  { id: 'morado', name: 'Morado', body: '#8B7BFF', trim: '#f4f4f6' },
  { id: 'naranja', name: 'Naranja', body: '#ff8a3d', trim: '#141414' },
];

// ---------- Objetos (originales, de oficina) ----------
export const ITEMS = {
  cafe: { id: 'cafe', name: 'Café turbo', emoji: '☕', desc: 'Un empujón de velocidad' },
  grapa: { id: 'grapa', name: 'Grapa', emoji: '📎', desc: 'Sale disparada hacia adelante' },
  postit: { id: 'postit', name: 'Post-it trampa', emoji: '🟨', desc: 'Se queda pegado en la pista' },
};
// Lo que te toca en una caja: los de atrás reciben más café
export function rollItem(place, total, r = Math.random()) {
  const back = total > 1 ? (place - 1) / (total - 1) : 0.5; // 0 = primero, 1 = último
  const pCafe = 0.2 + back * 0.5;
  const pGrapa = 0.45 - back * 0.15;
  if (r < pCafe) return 'cafe';
  if (r < pCafe + pGrapa) return 'grapa';
  return 'postit';
}

// ---------- Pistas ----------
// Comandos de la tortuga: { s: largo, dy } recta · { r: radio, a: grados (+ derecha), dy } curva ·
// { w } cambia el ancho desde ahí · { mark: 'nombre' } guarda la distancia recorrida.
// Elementos: boosts { at, lat, len, w }, rampas { at, len, h, l0, l1, sofa }, cajas { at }.
// at = distancia desde la salida (m) o 'marca+offset'.
export const TRACKS = [
  {
    id: 'oficina', name: 'Vuelta a la Oficina', short: 'Oficina', difficulty: 1, diffLabel: 'Fácil',
    desc: 'Un óvalo tranquilo alrededor de los escritorios y la sala de Charla General.',
    theme: 'oficina', width: 10.5, accent: '#FE3377',
    start: { x: -30, z: -30, h: 0 },
    cmds: [
      { s: 24 }, { mark: 'recta1' }, { s: 56 },
      { r: 24, a: 90 }, { s: 30 }, { r: 24, a: 90 },
      { mark: 'charla' }, { s: 16 }, { r: 26, a: -24 }, { s: 4 }, { r: 26, a: 48 }, { s: 4 }, { r: 26, a: -24 }, { s: 16 }, { mark: 'recta2' }, { s: 4 },
      { r: 24, a: 90 }, { s: 30 }, { r: 24, a: 90 },
    ],
    boosts: [{ at: 'recta1+6', lat: 0, len: 5, w: 4 }, { at: 'recta2+0', lat: -2.5, len: 5, w: 3.5 }, { at: 'charla+30', lat: 2.5, len: 5, w: 3.5 }],
    ramps: [{ at: 'recta1+26', len: 6, h: 0.9, l0: 0.5, l1: 5.5 }],
    boxes: [{ at: 'recta1+16' }, { at: 'charla+8' }],
  },
  {
    id: 'juegos', name: 'Sala de Juegos', short: 'Juegos', difficulty: 2, diffLabel: 'Media',
    desc: 'Curvas cerradas entre mesas de billar, arcades y pufs, y un salto sobre el sofá.',
    theme: 'juegos', width: 9, accent: '#8B7BFF',
    start: { x: -18, z: -30, h: 0 },
    cmds: [
      { s: 16 }, { mark: 'salida' }, { s: 18 },
      { r: 9, a: 90 }, { s: 6 }, { r: 9, a: 90 }, // horquilla a la derecha
      { s: 4 }, { r: 10, a: -90 }, { s: 4 }, { r: 10, a: -90 }, // vuelve a la izquierda (S)
      { s: 10 }, { r: 11, a: 90 }, { s: 6 }, { r: 11, a: 90 }, { mark: 'billar' },
      { s: 8 }, { r: 9, a: -90 }, { s: 4 }, { r: 9, a: 90 },
      { mark: 'sofa' }, { s: 40 }, { mark: 'trasSofa' },
      { r: 10, a: 90 }, { s: 10 }, { r: 10, a: -60 }, { s: 6 }, { r: 10, a: 60 }, { s: 8 }, { r: 12, a: 90 },
    ],
    boosts: [{ at: 'salida+4', lat: 2.5, len: 5, w: 3.2 }, { at: 'sofa+2', lat: 0, len: 5, w: 4 }, { at: 'trasSofa+18', lat: -2, len: 4, w: 3 }],
    ramps: [{ at: 'sofa+12', len: 7, h: 1.6, l0: -5, l1: 5, sofa: true }],
    boxes: [{ at: 'salida+12' }, { at: 'trasSofa+6' }],
  },
  {
    id: 'torre', name: 'Torre HUB', short: 'Torre', difficulty: 3, diffLabel: 'Difícil',
    desc: 'Sube en espiral por los pisos de la torre, pasa el elevador y cruza la azotea de noche.',
    theme: 'torre', width: 9.5, accent: '#FFCC00',
    start: { x: -30, z: 0, h: 0 },
    cmds: [
      { s: 18 }, { mark: 'lobby' }, { s: 26 }, { mark: 'elevador' }, { s: 10 },
      { r: 14, a: -90 }, { mark: 'espiral' },
      { r: 14, a: -540, dy: 13 }, { mark: 'azotea' },
      { s: 34, dy: 0.5 }, { r: 12, a: 70 }, { s: 12 }, { r: 12, a: -70 }, { s: 36 }, { r: 12, a: 90 }, { mark: 'mirador' },
      { s: 20 }, { r: 16, a: 90 }, { mark: 'bajada' }, { s: 60, dy: -13.5 }, { mark: 'abajo' },
      { s: 6 }, { r: 14, a: 90 },
    ],
    boosts: [{ at: 'lobby+4', lat: 0, len: 5, w: 4 }, { at: 'azotea+4', lat: 0, len: 5, w: 4 }, { at: 'bajada+10', lat: -2, len: 5, w: 3.4 }],
    ramps: [{ at: 'mirador+10', len: 6, h: 1.2, l0: -1, l1: 5 }],
    boxes: [{ at: 'lobby+16' }, { at: 'espiral+20' }, { at: 'abajo+2' }],
  },
];
export const TRACK_IDS = TRACKS.map((t) => t.id);
export const trackDef = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
export const scoreKey = (trackId) => `karts_${trackDef(trackId).id}`;

const wrapAng = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (t) => t * t * (3 - 2 * t);

// La tortuga: puntos cada ~0.5 m y las marcas
export function runTurtle(def) {
  let { x, z } = def.start, y = def.start.y || 0, h = def.start.h || 0, w = def.width, dist = 0;
  const pts = [{ x, z, y, w }];
  const marks = {};
  const d0 = 0.5;
  for (const c of def.cmds) {
    if (c.mark) { marks[c.mark] = dist; continue; }
    if (c.w && c.s == null && c.r == null) { w = c.w; continue; }
    const len = c.s != null ? c.s : Math.abs((c.a * Math.PI) / 180) * c.r;
    const n = Math.max(1, Math.ceil(len / d0));
    const dh = c.s != null ? 0 : (c.a * Math.PI) / 180 / n;
    const dy = (c.dy || 0) / n;
    for (let i = 0; i < n; i++) {
      const hm = h + dh / 2;
      x += Math.cos(hm) * (len / n); z += Math.sin(hm) * (len / n); y += dy; h += dh; dist += len / n;
      pts.push({ x, z, y, w: c.w || w });
    }
    if (c.w) w = c.w;
  }
  return { pts, marks, endH: h, startH: def.start.h || 0, turtleLen: dist };
}

// Cierra el circuito con una curva de Hermite que respeta la dirección de salida y de llegada
function closeLoop(pts, endH, startH) {
  const a = pts[pts.length - 1], b = pts[0];
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  if (d < 0.6) { pts.pop(); return 0; }
  const m = d * 1.0;
  const t0 = { x: Math.cos(endH) * m, z: Math.sin(endH) * m }, t1 = { x: Math.cos(startH) * m, z: Math.sin(startH) * m };
  const n = Math.max(2, Math.ceil(d / 0.5));
  for (let i = 1; i < n; i++) {
    const t = i / n, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    pts.push({ x: h00 * a.x + h10 * t0.x + h01 * b.x + h11 * t1.x, z: h00 * a.z + h10 * t0.z + h01 * b.z + h11 * t1.z, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t });
  }
  return d;
}

const cache = new Map();
// Pista lista para correr: muestras, largo, puntos de control, parrilla y elementos
export function buildTrack(idOrDef) {
  const def = typeof idOrDef === 'string' ? trackDef(idOrDef) : idOrDef;
  if (cache.has(def)) return cache.get(def);
  const { pts, marks, endH, startH } = runTurtle(def);
  const gap = closeLoop(pts, endH, startH);
  // re-muestreo por distancia
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) { const p = pts[i - 1], q = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(q.x - p.x, q.z - p.z)); }
  const total = cum[pts.length];
  const N = Math.max(16, Math.round(total / STEP));
  const step = total / N;
  const S = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * step;
    while (cum[j + 1] < s) j++;
    const p = pts[j], q = pts[(j + 1) % pts.length];
    const k = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    S.push({ x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k, y: p.y + (q.y - p.y) * k, w: p.w + (q.w - p.w) * k, s });
  }
  // altura suavizada (sin escalones en los cambios de pendiente)
  const R = 7;
  const ys = S.map((_, i) => { let a = 0; for (let k = -R; k <= R; k++) a += S[(i + k + N) % N].y; return a / (R * 2 + 1); });
  S.forEach((p, i) => { p.y = Math.abs(ys[i]) < 0.02 ? 0 : ys[i]; });
  for (let i = 0; i < N; i++) {
    const a = S[(i - 1 + N) % N], b = S[(i + 1) % N];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    S[i].tx = dx / l; S[i].tz = dz / l;
    S[i].nx = -S[i].tz; S[i].nz = S[i].tx; // derecha
    S[i].hw = S[i].w / 2;
    S[i].slope = (b.y - a.y) / (2 * step);
  }
  // curvatura (para la IA y para escoger dónde frenar)
  for (let i = 0; i < N; i++) {
    const a = S[(i - 3 + N) % N], b = S[(i + 3) % N];
    S[i].curv = wrapAng(Math.atan2(b.tz, b.tx) - Math.atan2(a.tz, a.tx)) / (6 * step);
  }
  const at = (v) => {
    if (typeof v === 'number') return ((v % total) + total) % total;
    const [name, off] = String(v).split('+');
    return (((marks[name] ?? 0) + Number(off || 0)) % total + total) % total;
  };
  const ncp = Math.max(6, Math.min(16, Math.round(total / 45)));
  const checkpoints = Array.from({ length: ncp }, (_, i) => (i * total) / ncp);
  const T = {
    id: def.id, def, samples: S, N, step, length: total, marks, closeGap: gap, checkpoints,
    boosts: (def.boosts || []).map((b) => ({ s: at(b.at), lat: b.lat || 0, len: b.len || 5, w: b.w || 4 })),
    ramps: (def.ramps || []).map((r) => ({ s: at(r.at), len: r.len, h: r.h, l0: r.l0 ?? -99, l1: r.l1 ?? 99, sofa: !!r.sofa })),
    boxes: [],
  };
  let bid = 0;
  for (const b of def.boxes || []) {
    const s = at(b.at), hw = sampleAt(T, s).hw;
    const n = 4;
    for (let k = 0; k < n; k++) T.boxes.push({ id: bid++, s, lat: (-1 + (2 * k + 1) / n) * (hw - 1.4) });
  }
  T.grid = startGrid(T, MAX_RACERS);
  cache.set(def, T);
  return T;
}

// Muestra (interpolada) a la distancia s
export function sampleAt(T, s) {
  s = ((s % T.length) + T.length) % T.length;
  const f = s / T.step, i = Math.floor(f) % T.N, k = f - Math.floor(f);
  const a = T.samples[i], b = T.samples[(i + 1) % T.N];
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: a.y + (b.y - a.y) * k, tx: a.tx + (b.tx - a.tx) * k, tz: a.tz + (b.tz - a.tz) * k, nx: a.nx + (b.nx - a.nx) * k, nz: a.nz + (b.nz - a.nz) * k, hw: a.hw + (b.hw - a.hw) * k, i, s };
}
// Punto del mundo a la distancia s y desplazamiento lateral lat
export function pointAt(T, s, lat = 0) {
  const p = sampleAt(T, s);
  return { x: p.x + p.nx * lat, z: p.z + p.nz * lat, y: groundAt(T, s, lat), h: Math.atan2(p.tz, p.tx) };
}

// Parrilla de salida: de dos en dos, detrás de la línea
export function startGrid(T, n = MAX_RACERS) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    const s = T.length - 4 - row * 3.6 - (i % 2) * 1.2;
    const p = sampleAt(T, s);
    const lat = side * Math.min(2.4, p.hw * 0.4);
    out.push({ s, lat, ...pointAt(T, s, lat) });
  }
  return out;
}

// Altura del piso de la pista (con rampas y el sofá)
export function groundAt(T, s, lat = 0, idx = null) {
  const p = idx != null ? T.samples[idx] : sampleAt(T, s);
  let y = p.y;
  for (const r of T.ramps) {
    let d = s - r.s;
    if (d < -T.length / 2) d += T.length;
    if (d > T.length / 2) d -= T.length;
    if (lat < r.l0 || lat > r.l1) continue;
    if (d >= 0 && d <= r.len) y = Math.max(y, p.y + r.h * (d / r.len));
    // el sofá: después de la rampa (se vuela por encima)
    if (r.sofa && d > r.len + 2.2 && d < r.len + 3.4) y = Math.max(y, p.y + 0.55);
  }
  return y;
}

// Busca la muestra más cercana alrededor de la anterior (la pista se cruza consigo misma en la torre,
// por eso no se busca en toda la pista). Regresa { i, s, lat }.
export function locate(T, x, z, hint = 0, win = 26) {
  const S = T.samples;
  let best = hint, bd = Infinity;
  for (let k = -win; k <= win; k++) {
    const i = (hint + k + T.N) % T.N;
    const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  const p = S[best];
  const dx = x - p.x, dz = z - p.z;
  const along = dx * p.tx + dz * p.tz;
  let s = p.s + along;
  s = ((s % T.length) + T.length) % T.length;
  return { i: best, s, lat: dx * p.nx + dz * p.nz };
}
// Búsqueda completa (solo al empezar o reaparecer)
export function locateGlobal(T, x, z, y = null) {
  let best = 0, bd = Infinity;
  T.samples.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2 + (y == null ? 0 : ((p.y - y) * 3) ** 2); if (d < bd) { bd = d; best = i; } });
  return locate(T, x, z, best, 2);
}

// ---------- Kart ----------
export function newKart(T, slot = 0, { id = slot, vehicle = DEFAULT_VEHICLE, color = 0 } = {}) {
  const g = T.grid[slot % T.grid.length];
  const L = locate(T, g.x, g.z, Math.floor(g.s / T.step) % T.N, 4);
  return {
    id, vehicle, color, x: g.x, z: g.z, y: g.y, h: g.h, vx: 0, vz: 0, vy: 0, speed: 0,
    i: L.i, s: L.s, lat: L.lat, air: false, airT: 0,
    drift: 0, driftT: 0, charge: 0, tier: 0, boostT: 0, spinT: 0, ghostT: 0, hop: 0,
    lap: 0, nextCp: 0, progress: -(T.length - L.s), finished: false, finishT: null,
    lapStart: null, lapTimes: [], bestLap: null, item: null, wrongT: 0, stuckT: 0, wallT: 0,
    lastBoostId: -1,
  };
}

// Un paso de física. input: { throttle -1..1, steer -1..1, drift bool }. Regresa eventos ['wall', 'land', 'boost', 'mini1'…]
export function stepKart(T, k, input, dt, { others = null, stats = vehicleStats(k.vehicle), speedMul = 1 } = {}) {
  const ev = [];
  const st = stats;
  const throttle = clamp(input?.throttle || 0, -1, 1);
  const steer = clamp(input?.steer || 0, -1, 1);
  const wantDrift = !!input?.drift;
  let fx = Math.cos(k.h), fz = Math.sin(k.h);
  let vF = k.vx * fx + k.vz * fz;
  let vL = k.vx * -fz + k.vz * fx;
  k.boostT = Math.max(0, k.boostT - dt);
  k.spinT = Math.max(0, k.spinT - dt);
  k.ghostT = Math.max(0, k.ghostT - dt);
  k.wallT = Math.max(0, k.wallT - dt);
  const boosting = k.boostT > 0;
  const vmax = st.speed * speedMul * (boosting ? 1.42 : 1);
  const control = k.spinT <= 0;

  if (!k.air) {
    // acelerar / frenar / reversa
    if (control && throttle > 0) {
      if (vF < vmax) vF = Math.min(vmax, vF + st.accel * (boosting ? 1.8 : 1) * throttle * dt * (0.35 + 0.65 * Math.max(0, 1 - vF / vmax)));
    } else if (control && throttle < 0) {
      if (vF > 0.4) vF = Math.max(0, vF - 30 * -throttle * dt);
      else vF = Math.max(-st.speed * 0.38, vF - st.accel * 0.55 * -throttle * dt);
    } else {
      const drag = 5 + Math.abs(vF) * 0.12;
      vF = Math.abs(vF) <= drag * dt ? 0 : vF - Math.sign(vF) * drag * dt;
    }
    if (boosting && vF < vmax * 0.85) vF = Math.min(vmax, vF + 30 * dt);
    if (vF > vmax) vF = Math.max(vmax, vF - (vF - vmax) * 1.6 * dt - 2 * dt);
    // derrape: empieza al apretar con dirección y velocidad
    if (control && wantDrift && !k.drift && Math.abs(steer) > 0.3 && vF > 9) {
      k.drift = Math.sign(steer); k.driftT = 0; k.charge = 0; k.tier = 0; k.hop = 1;
      ev.push('drift');
    }
    if (k.drift && (!wantDrift || vF < 6 || !control)) {
      if (control && k.tier > 0) { k.boostT = Math.max(k.boostT, k.tier === 2 ? 1.25 : 0.7); ev.push(k.tier === 2 ? 'mini2' : 'mini1'); }
      k.drift = 0; k.charge = 0; k.tier = 0;
    }
    // dirección
    const sp = Math.abs(vF);
    const sf = clamp(sp / 5, 0, 1) * (1 - 0.32 * clamp(sp / st.speed, 0, 1));
    let yaw;
    if (k.drift) {
      const tight = (steer * k.drift + 1) / 2; // 0 = abre, 1 = cierra
      yaw = k.drift * st.handling * (0.25 + 0.55 * tight) * clamp(sp / 8, 0.4, 1);
      k.driftT += dt;
      k.charge += dt * (0.55 + 0.6 * tight);
      const tier = k.charge > 2.1 ? 2 : k.charge > 1.0 ? 1 : 0;
      if (tier > k.tier) { k.tier = tier; ev.push(tier === 2 ? 'tier2' : 'tier1'); }
      vL += -k.drift * sp * 0.9 * dt; // se abre un poco (resbala hacia afuera)
    } else {
      yaw = steer * st.handling * sf * (vF < 0 ? -0.8 : 1);
    }
    if (control) k.h += yaw * dt;
    else k.h += 11 * dt;
    // agarre lateral
    const grip = k.drift ? st.driftGrip : st.grip;
    vL *= Math.exp(-grip * dt);
    if (!control) vF *= Math.exp(-2.6 * dt);
  } else {
    // en el aire: un poco de control para enderezar
    if (control) k.h += steer * st.handling * 0.35 * dt;
    vL *= Math.exp(-1.5 * dt);
  }
  k.hop = Math.max(0, k.hop - dt * 5);
  fx = Math.cos(k.h); fz = Math.sin(k.h);
  k.vx = fx * vF - fz * vL;
  k.vz = fz * vF + fx * vL;
  const prevY = k.y;
  k.x += k.vx * dt; k.z += k.vz * dt;

  // dónde quedó sobre la pista
  let L = locate(T, k.x, k.z, k.i);
  k.i = L.i; k.s = L.s; k.lat = L.lat;
  const P = T.samples[L.i];
  const lim = P.hw - KART_R;
  if (Math.abs(L.lat) > lim) {
    // barrera: se regresa a la orilla y rebota
    const side = Math.sign(L.lat);
    const push = Math.abs(L.lat) - lim;
    k.x -= P.nx * side * push; k.z -= P.nz * side * push;
    const vn = k.vx * P.nx + k.vz * P.nz;
    if (vn * side > 0) {
      const imp = Math.abs(vn);
      k.vx -= P.nx * vn * (imp > 2 ? 1.35 : 1); k.vz -= P.nz * vn * (imp > 2 ? 1.35 : 1);
      // rozar la barrera casi no frena; pegarle de frente sí
      if (imp > 2) { const keep = Math.max(0.62, 1 - (imp - 2) * 0.03); k.vx *= keep; k.vz *= keep; }
      if (imp > 3 && k.wallT <= 0) { ev.push('wall'); k.wallT = 0.25; }
      // se endereza un poco hacia la pista
      const ta = Math.atan2(P.tz, P.tx);
      const forward = Math.cos(wrapAng(k.h - ta)) > 0;
      const target = forward ? ta : ta + Math.PI;
      k.h += wrapAng(target - k.h) * Math.min(1, imp * 0.03);
      if (k.drift && imp > 5) { k.drift = 0; k.charge = 0; k.tier = 0; }
    }
    L = locate(T, k.x, k.z, k.i, 3);
    k.i = L.i; k.s = L.s; k.lat = L.lat;
  }
  // altura: sigue el piso o vuela
  const gy = groundAt(T, k.s, k.lat, null);
  if (!k.air) {
    const vyG = (gy - prevY) / dt;
    if (vyG < k.vy - GRAVITY * dt * 1.5 && gy < prevY - 0.05) { k.air = true; k.airT = 0; ev.push('jump'); }
    else { k.vy = clamp(vyG, -30, 30); k.y = gy; }
  }
  if (k.air) {
    k.airT += dt;
    k.vy -= GRAVITY * dt;
    k.y += k.vy * dt;
    if (k.y <= gy) {
      if (k.vy < -5) ev.push('land');
      k.y = gy; k.vy = 0; k.air = false;
      if (k.airT > 0.45 && k.spinT <= 0) { k.boostT = Math.max(k.boostT, 0.45); ev.push('trick'); }
    }
  }
  // turbo del piso
  for (let b = 0; b < T.boosts.length; b++) {
    const B = T.boosts[b];
    let d = k.s - B.s;
    if (d < -T.length / 2) d += T.length;
    if (!k.air && d >= 0 && d <= B.len && Math.abs(k.lat - B.lat) < B.w / 2 + 0.3) {
      if (k.boostT < 0.9) ev.push('boost');
      k.boostT = Math.max(k.boostT, 1.1);
    }
  }
  // choques entre karts
  if (others) {
    for (const o of others) {
      if (!o || o.id === k.id || o.ghostT > 0 || k.ghostT > 0) continue;
      if (Math.abs(o.y - k.y) > 1.2) continue;
      const dx = k.x - o.x, dz = k.z - o.z, d = Math.hypot(dx, dz);
      if (d >= KART_R * 2 || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      const wk = vehicleStats(k.vehicle).weight, wo = vehicleStats(o.vehicle).weight;
      const share = o.static ? 1 : wo / (wk + wo);
      const pen = KART_R * 2 - d;
      k.x += nx * pen * share; k.z += nz * pen * share;
      if (!o.static) { o.x -= nx * pen * (1 - share); o.z -= nz * pen * (1 - share); }
      const rv = (k.vx - (o.vx || 0)) * nx + (k.vz - (o.vz || 0)) * nz;
      if (rv < 0) {
        const j = -(1.5) * rv;
        k.vx += nx * j * share; k.vz += nz * j * share;
        if (!o.static) { o.vx -= nx * j * (1 - share); o.vz -= nz * j * (1 - share); }
        if (-rv > 2) ev.push('bump');
      }
    }
  }
  k.speed = k.vx * Math.cos(k.h) + k.vz * Math.sin(k.h);
  // sentido contrario
  const tdot = k.vx * P.tx + k.vz * P.tz;
  k.wrongT = tdot < -3 ? k.wrongT + dt : Math.max(0, k.wrongT - dt * 2);
  // atorado (acelerando sin avanzar)
  k.stuckT = throttle > 0.5 && Math.abs(k.speed) < 1 && control ? k.stuckT + dt : 0;
  return ev;
}

// Reaparecer en el centro de la pista, mirando hacia adelante
export function respawn(T, k) {
  const s = k.s - 2;
  const p = pointAt(T, s, 0);
  Object.assign(k, { x: p.x, z: p.z, y: p.y + 0.4, h: p.h, vx: 0, vz: 0, vy: 0, speed: 0, air: true, airT: 0, drift: 0, charge: 0, tier: 0, spinT: 0, ghostT: 1.5, stuckT: 0, wrongT: 0 });
  const L = locate(T, k.x, k.z, k.i);
  k.i = L.i; k.s = L.s; k.lat = L.lat;
}

// ---------- Vueltas ----------
// Puntos de control en orden; la línea de salida es el 0. lap = vuelta en curso (0 = antes de salir).
// Regresa eventos: { k: 'lap', lap, time } · { k: 'finish', time } · { k: 'cp', n }
export function updateLaps(T, k, raceT) {
  const ev = [];
  if (k.finished) return ev;
  const C = T.checkpoints, n = C.length;
  const seg = T.length / n;
  const target = C[k.nextCp];
  let d = k.s - target;
  if (d < -T.length / 2) d += T.length;
  if (d > T.length / 2) d -= T.length;
  if (d >= 0 && d < seg * 0.9) {
    if (k.nextCp === 0) {
      if (k.lap >= 1) {
        const time = raceT - (k.lapStart ?? 0);
        k.lapTimes.push(time);
        if (k.bestLap == null || time < k.bestLap) k.bestLap = time;
        if (k.lap >= LAPS) { k.finished = true; k.finishT = raceT; ev.push({ k: 'finish', time: raceT }); }
        else ev.push({ k: 'lap', lap: k.lap + 1, time });
      }
      k.lap += 1; k.lapStart = raceT;
    } else ev.push({ k: 'cp', n: k.nextCp });
    k.nextCp = (k.nextCp + 1) % n;
  }
  k.progress = raceProgress(T, k);
  return ev;
}
// Distancia total de carrera (para el orden): vueltas hechas × largo + dónde va
export function raceProgress(T, k) {
  if (k.finished) return LAPS * T.length + 1e6 - (k.finishT || 0);
  let s = k.s;
  // antes de cruzar la salida, o si va en reversa detrás de la línea
  if (k.lap === 0 || (k.nextCp === 1 && s > T.length * 0.6)) s -= T.length;
  if (k.nextCp === 0 && k.lap >= 1 && s < T.length * 0.3) s += T.length; // ya cruzó pero el control no ha contado
  return Math.max(0, k.lap - 1) * T.length + s;
}
// Orden de carrera: primero los que terminaron (por tiempo), luego por lo recorrido
export function raceOrder(list) {
  return [...list].sort((a, b) => {
    if (a.finished && b.finished) return a.finishT - b.finishT;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
}

// ---------- IA ----------
// Sigue la línea de carrera mirando adelante según su velocidad; frena antes de las curvas cerradas.
// lane: desplazamiento lateral preferido (cada bot uno distinto) · skill 0..1
export function aiInput(T, k, { lane = 0, skill = 0.8, t = 0 } = {}) {
  const sp = Math.max(4, Math.abs(k.speed));
  const look = 4 + sp * 0.42;
  // curvatura más fuerte que viene
  let maxC = 0, sumC = 0;
  for (let d = 2; d < 14 + sp * 1.1; d += 2) {
    const c = T.samples[Math.floor((((k.s + d) % T.length) + T.length) % T.length / T.step) % T.N].curv;
    if (Math.abs(c) > Math.abs(maxC)) maxC = c;
    sumC += c;
  }
  const P = sampleAt(T, k.s + look);
  // en las curvas busca el lado de adentro
  const inside = clamp(-Math.sign(sumC) * Math.min(1, Math.abs(maxC) * 8) * P.hw * 0.45, -P.hw + 1.4, P.hw - 1.4);
  const wob = Math.sin(t * 0.7 + k.id * 1.7) * 0.6;
  const lat = clamp(lane * (1 - Math.min(1, Math.abs(maxC) * 10)) + inside + wob, -P.hw + 1.3, P.hw - 1.3);
  const tx = P.x + P.nx * lat, tz = P.z + P.nz * lat;
  const want = Math.atan2(tz - k.z, tx - k.x);
  const err = wrapAng(want - k.h);
  const steer = clamp(err * 2.6, -1, 1);
  // velocidad segura para la curva que viene
  const safe = Math.sqrt(Math.max(4, (6.5 + skill * 4) / Math.max(0.004, Math.abs(maxC))));
  let throttle = 1;
  if (sp > safe + 1.5) throttle = -0.6;
  else if (sp > safe) throttle = 0.15;
  if (Math.abs(err) > 1.2) throttle = Math.min(throttle, 0.4);
  return { throttle, steer, drift: false };
}
// Rubber banding ligero: los bots de atrás aprietan un poco, los de adelante aflojan
export function aiSpeedMul(gapMeters, skill = 0.8) {
  const g = clamp(gapMeters / 60, -1, 1); // + = va detrás de la persona que va primero
  return (0.9 + skill * 0.08) * (1 + g * 0.07);
}

// ---------- Objetos en la pista ----------
// Grapa: avanza por la pista a lo largo (s) con su carril (lat). Post-it: se queda quieto.
export const GRAPA_SPEED = 40, GRAPA_LIFE = 2.6, POSTIT_LIFE = 30;
export function grapaPos(T, g, now) {
  const t = now - g.t0;
  return { s: g.s0 + GRAPA_SPEED * t, lat: g.lat, alive: t >= 0 && t < GRAPA_LIFE };
}
// ¿El kart toca algo que está en (s, lat)? Funciona en pistas de varios pisos porque compara sobre la pista.
export function touches(T, k, s, lat, r = 1.3) {
  let d = k.s - s;
  if (d < -T.length / 2) d += T.length;
  if (d > T.length / 2) d -= T.length;
  return Math.abs(d) < r && Math.abs(k.lat - lat) < r;
}

// ---------- Formato ----------
export function fmtTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return '--:--.---';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}
export const ordinal = (n) => `${n}º`;
