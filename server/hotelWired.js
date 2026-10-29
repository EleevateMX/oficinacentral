// Hotel: wired básico (línea "Mecánica y Wired").
// Como en el sistema clásico, un disparador y los efectos que están APILADOS en la misma casilla se
// disparan juntos. Solo quien es dueño de la sala o tiene permisos los configura (extra.wired).
//   Disparadores: say { text } · walk { items } · enter {} · timer { secs }
//   Efectos:      toggle { items } · tele { items } · msg { text } · move { items, dir } · hand { hand }
// Protección contra ciclos: cada disparador espera MIN_GAP_MS entre disparos, la sala tiene un tope de
// disparos por ventana y una cadena (p. ej. teletransportar a un furni que dispara otro) tiene profundidad máxima.
import { FURNI_BY_ID } from '../shared/hotelCatalog.js';
import { tileInfo, ROT_VEC } from '../shared/hotelRoom.js';
import { HAND_ITEMS } from '../shared/hotelLines/mecanica.js';

export const MIN_GAP_MS = 400;
export const ROOM_WINDOW_MS = 10e3;
export const ROOM_MAX_FIRES = 40;
export const MAX_DEPTH = 3;
export const MAX_ITEMS = 10;
const TOGGLE_OK = new Set(['toggle', 'gate', 'dimmer']);

const defOf = (it) => FURNI_BY_ID[it?.type];
export const wiredOf = (it) => defOf(it)?.wired || null;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export const matchKeyword = (text, kw) => { const k = norm(kw); return !!k && norm(text).includes(k); };

// Limpia la configuración que manda el cliente (null = inválida)
export function cleanConfig(type, cfg, R, clean = (s) => String(s ?? '').trim()) {
  cfg = cfg && typeof cfg === 'object' ? cfg : {};
  const ids = () => [...new Set((Array.isArray(cfg.items) ? cfg.items : []).map(Number).filter((id) => Number.isInteger(id) && R.items.has(id)))].slice(0, MAX_ITEMS);
  switch (type) {
    case 'say': { const text = clean(cfg.text).slice(0, 40); return text ? { text } : null; }
    case 'walk': case 'toggle': case 'tele': return { items: ids() };
    case 'enter': return {};
    case 'timer': { const secs = Math.round(Number(cfg.secs)); return { secs: Number.isFinite(secs) ? Math.max(1, Math.min(600, secs)) : 5 }; }
    case 'msg': { const text = clean(cfg.text).slice(0, 120); return text ? { text } : null; }
    case 'move': return { items: ids(), dir: [0, 2, 4, 6].includes(Number(cfg.dir)) ? Number(cfg.dir) : 'rnd' };
    case 'hand': return HAND_ITEMS[cfg.hand] ? { hand: cfg.hand } : null;
    default: return null;
  }
}

let C = null, A = null;
export function initWired(ctx, api) {
  C = ctx; A = api;
  ctx.hooks.chat.push((R, U, msg) => { for (const t of triggers(R, 'say')) if (matchKeyword(msg.text, cfgOf(t).text)) fire(R, t, U); });
  ctx.hooks.arrive.push((R, U) => walkedOn(R, U, 0));
  ctx.hooks.enter.push((R, U) => { for (const t of triggers(R, 'enter')) fire(R, t, U); });
  ctx.socketInits.push((socket, uid) => {
    let ts = [];
    socket.on('hotel:wired:save', (m) => {
      const t0 = Date.now(); ts = ts.filter((x) => t0 - x < 5000);
      if (ts.length >= 10) return;
      ts.push(t0);
      const w = C.where.get(uid);
      const R = w?.socket === socket ? C.live.get(w.roomId) : null;
      const it = R?.items.get(Number(m?.itemId));
      const wd = wiredOf(it);
      if (!wd) return;
      if (!C.canEdit(R, uid)) return socket.emit('hotel:notice', { text: 'Solo quien tiene permisos puede configurar el wired', error: true });
      const cfg = cleanConfig(wd.type, m?.cfg, R, (s) => C.cleanText(s));
      if (!cfg) return socket.emit('hotel:notice', { text: 'Revisa la configuración del wired', error: true });
      it.extra = { ...(it.extra || {}), wired: cfg };
      A.persistExtra(it);
      C.io?.to(C.key(R.id)).emit('hotel:item', { op: 'update', item: it });
      socket.emit('hotel:notice', { text: '⚡ Wired guardado' });
    });
  });
}

const cfgOf = (it) => it.extra?.wired || {};
function triggers(R, type) {
  const out = [];
  for (const it of R.items.values()) { const w = wiredOf(it); if (w?.kind === 'trigger' && w.type === type && it.x != null) out.push(it); }
  return out;
}
const effectsAt = (R, t) => (R.grid.tiles[t.y]?.[t.x] || []).filter((it) => wiredOf(it)?.kind === 'effect');

function walkedOn(R, U, depth) {
  const under = new Set((R.grid.tiles[U.y]?.[U.x] || []).map((it) => it.id));
  if (!under.size) return;
  for (const t of triggers(R, 'walk')) if ((cfgOf(t).items || []).some((id) => under.has(id))) fire(R, t, U, depth);
}

// Disparar: pasa los límites y corre los efectos de la pila
export function fire(R, trg, U = null, depth = 0) {
  const W = (R.wired ||= { last: new Map(), fires: [], timers: new Map() });
  const now = Date.now();
  if (depth > MAX_DEPTH) return false;
  if (now - (W.last.get(trg.id) || 0) < MIN_GAP_MS) return false;
  W.fires = W.fires.filter((t) => now - t < ROOM_WINDOW_MS);
  if (W.fires.length >= ROOM_MAX_FIRES) return false;
  W.last.set(trg.id, now);
  W.fires.push(now);
  A.flashState(R, trg, 500);
  for (const e of effectsAt(R, trg)) {
    A.flashState(R, e, 500);
    try { runEffect(R, e, U, depth); } catch (err) { console.error('[hotel] wired:', err); }
  }
  return true;
}

function runEffect(R, e, U, depth) {
  const w = wiredOf(e), cfg = cfgOf(e);
  const items = (cfg.items || []).map((id) => R.items.get(id)).filter((it) => it && !it.wall && it.x != null);
  const io = C.io?.to(C.key(R.id));
  switch (w.type) {
    case 'toggle':
      for (const it of (cfg.items || []).map((id) => R.items.get(id)).filter(Boolean)) {
        const d = defOf(it);
        if (!d || d.states < 2 || !TOGGLE_OK.has(d.interact)) continue;
        if (d.interact === 'gate' && it.state === 1) {
          const tiles = C.footTiles(it);
          if ([...R.users.values()].some((V) => { const p = C.logical(V); return tiles.some(([x, y]) => x === p.x && y === p.y); })) continue;
        }
        it.state = (it.state + 1) % d.states;
        C.persist(it);
        io?.emit('hotel:item', { op: 'update', item: it });
        if (!it.wall) C.refreshUsers(R, C.footTiles(it));
      }
      break;
    case 'tele': {
      if (!U || R.users.get(U.id) !== U) break;
      const taken = new Set([...R.users.values()].filter((V) => V !== U).map((V) => { const p = C.logical(V); return `${p.x},${p.y}`; }));
      const spots = items.filter((it) => !taken.has(`${it.x},${it.y}`) && tileInfo(R.grid, it.x, it.y));
      if (!spots.length) break;
      const to = spots[Math.floor(A.randomFn()() * spots.length)];
      clearTimeout(U.timer);
      U.path = null; U.onArrive = null; U.timer = null; U.sit = null; U.lay = null;
      U.x = to.x; U.y = to.y; U.z = tileInfo(R.grid, to.x, to.y).z;
      io?.emit('hotel:user', { ...C.userState(U), tp: true });
      C.refreshUsers(R, [[U.x, U.y]]);
      walkedOn(R, U, depth + 1);
      break;
    }
    case 'msg': {
      const targets = U ? [U] : [...R.users.values()];
      for (const V of targets) V.socket.emit('hotel:chat', { id: `w${e.id}-${Date.now()}`, from: 0, name: '⚡ Wired', text: cfg.text || '', mode: 'whisper', to: V.id, at: Date.now(), system: true });
      break;
    }
    case 'move':
      for (const it of items) {
        if (wiredOf(it)) continue;
        const rot = cfg.dir === 'rnd' || cfg.dir == null ? [0, 2, 4, 6][Math.floor(A.randomFn()() * 4)] : cfg.dir;
        const [dx, dy] = ROT_VEC[rot] || ROT_VEC[0];
        A.nudge(R, it, dx, dy);
      }
      break;
    case 'hand':
      if (U && cfg.hand) A.setHand(R, U, cfg.hand);
      break;
    default:
  }
}

// Disparadores "cada N segundos" (lo llama el reloj de server/hotelMechanics.js cada segundo)
export function wiredTick(R) {
  const list = triggers(R, 'timer');
  if (!list.length || !R.users.size) return;
  const W = (R.wired ||= { last: new Map(), fires: [], timers: new Map() });
  const now = Date.now();
  for (const t of list) {
    const secs = cfgOf(t).secs || 5;
    const last = W.timers.get(t.id);
    if (last == null) { W.timers.set(t.id, now); continue; }
    if (now - last >= secs * 1000 - 50) { W.timers.set(t.id, now); fire(R, t, null); }
  }
}
