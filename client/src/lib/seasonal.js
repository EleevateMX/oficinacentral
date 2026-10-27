// Decoración de temporada: elige el módulo según config.season (Halloween, Navidad, Aniversario)
// y le da a MapView una sola interfaz: armar, dibujar (piso, paseantes, cielo, pantalla) y los
// objetos de temporada con los que se puede interactuar (árbol → Amigo secreto, pastel → foto).
import { office } from './store.js';
import { buildHalloween, createNpcs, stepNpcs, drawHalloweenDecor, drawHalloweenWalkers, drawHalloweenSky } from './halloween.js';
import { buildNavidad, drawNavidadGround, drawNavidadDecor, drawNavidadWalkers, drawNavidadSky, drawNavidadScreen } from './navidad.js';
import { buildAniversario, drawAniversarioDecor, drawAniversarioSky, drawAniversarioScreen } from './aniversario.js';

let current = null; // la temporada armada para el piso que se ve
let blocked = []; // casillas que tapa la pieza central (árbol, pastel): no se camina a través

function unblock() {
  for (const [f, x, y] of blocked) if (f.solid[y]) f.solid[y][x] = false;
  blocked = [];
}

export function buildSeason(season, floor, perf, config) {
  current = null;
  unblock();
  if (!floor || !season) return null;
  const efficient = perf === 'efficient';
  let s = null;
  if (season === 'halloween') {
    const hw = buildHalloween(floor);
    s = { id: 'halloween', ...hw, npcs: efficient ? null : createNpcs(hw), objects: [] };
  } else if (season === 'navidad') s = { id: 'navidad', ...buildNavidad(floor, { efficient }) };
  else if (season === 'aniversario') s = { id: 'aniversario', ...buildAniversario(floor, { efficient, config }) };
  if (s) { s.floorId = floor.id; current = s; }
  const piece = s?.tree || s?.cake;
  if (piece) {
    for (let j = 0; j < piece.h; j++) for (let i = 0; i < piece.w; i++) {
      const x = piece.x + i, y = piece.y + j;
      if (!floor.solid[y][x]) { floor.solid[y][x] = true; blocked.push([floor, x, y]); }
    }
  }
  return s;
}

// Objetos de temporada interactivos del piso actual: { id, season, x, y, w, h, label }
export function seasonObjects(f) {
  return current && (!f || current.floorId === f.id) ? current.objects || [] : [];
}

export function interactSeason(o) {
  if (o.season === 'navidad') office.set({ modal: { type: 'santa' } });
  else if (o.season === 'aniversario') office.set({ modal: { type: 'anniversaryPhoto' } });
}

// Sobre el suelo pero debajo de los muebles (v = cámara del mapa)
export function drawSeasonGround(ctx, s, v, f) {
  if (s.id !== 'navidad') return;
  const view = { x0: v.camX - v.w / 2 / v.zoom, x1: v.camX + v.w / 2 / v.zoom, y0: v.camY - v.h / 2 / v.zoom, y1: v.camY + v.h / 2 / v.zoom };
  drawNavidadGround(ctx, s, view, f);
}

export function drawSeasonDecor(ctx, s, t, view, f) {
  if (s.id === 'halloween') drawHalloweenDecor(ctx, s, t, view);
  else if (s.id === 'navidad') drawNavidadDecor(ctx, s, t, view);
  else if (s.id === 'aniversario') drawAniversarioDecor(ctx, s, t, view);
}

export function drawSeasonWalkers(ctx, s, t, view, f, players) {
  if (!s.npcs) return;
  stepNpcs(s.npcs, f, t, players);
  if (s.id === 'halloween') drawHalloweenWalkers(ctx, s.npcs, t, view);
  else if (s.id === 'navidad') drawNavidadWalkers(ctx, s.npcs, t, view);
}

// Encima de las personas: fantasmas, trineo… y el tinte de la temporada
export function drawSeasonSky(ctx, s, t, view, f) {
  if (s.id === 'halloween') {
    if (s.npcs) drawHalloweenSky(ctx, s.npcs, t, view);
    ctx.fillStyle = 'rgba(70, 20, 110, 0.07)';
    ctx.fillRect(0, 0, f.W * 32, f.H * 32);
  } else if (s.id === 'navidad') drawNavidadSky(ctx, s, t, view, f);
  else if (s.id === 'aniversario') drawAniversarioSky(ctx, s, t, view, f);
}

// En coordenadas de pantalla (debajo de los nombres): nieve, fuegos artificiales, letreros
export function drawSeasonScreen(ctx, s, t, v) {
  if (s.id === 'navidad') drawNavidadScreen(ctx, s, t, v);
  else if (s.id === 'aniversario') drawAniversarioScreen(ctx, s, t, v);
}
