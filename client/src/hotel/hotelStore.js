// Hotel: estado del cliente y eventos del socket (usa el mismo socket de la oficina: office.socket).
// Lo de la interfaz (paneles, sala, inventario) vive en `hotel.state` (React lo lee con useHotel);
// lo que cambia cada cuadro (posiciones, globitos) vive en `hotel.live` y lo lee el motor.
import { useSyncExternalStore } from 'react';
import { office } from '../lib/store.js';
import { api } from '../lib/api.js';
import { ROOM_MODELS } from '@shared/hotel.js';
import { FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { buildRoom } from '@shared/hotelRoom.js';
import { FLAGSHIP_KEY } from '@shared/hotelOfficialRooms.js';
import { walkVisual, strideAdvance, toDir8, dirToward } from '@shared/hotelWalk.js';
import { playSound } from '../lib/sounds.js';
import { mechOnItem } from './mechanics.js';

const FAIL = {
  missing: 'Esa sala ya no existe',
  banned: 'No puedes entrar a esta sala por un rato',
  full: 'La sala está llena',
  closed: 'Esta sala está cerrada: solo entra quien tiene permiso',
  password: 'Contraseña incorrecta',
  nobody: 'No hay nadie dentro que te pueda abrir. Intenta más tarde',
  wait: 'Espera un momento antes de volver a tocar',
  denied: 'No te dejaron pasar 😕',
};
const LEFT = {
  kick: '👢 Te sacaron de la sala',
  ban: '⛔ Te vetaron de la sala por un rato',
  deleted: 'La sala fue borrada',
  elsewhere: 'Entraste a una sala desde otra pestaña',
};

class Hotel {
  state = this.initial();
  listeners = new Set();
  live = { room: null, grid: null, items: new Map(), users: new Map(), bubbles: [], typing: new Map(), lastShift: 0 };
  attached = null;
  password = null;

  initial() {
    return {
      screen: 'nav', // 'nav' | 'room'
      roomId: null, room: null, rights: [], isOwner: false, admin: false,
      inventory: null, panel: null, placing: null, selected: null,
      waiting: null, bells: [], chatLog: [], itemsV: 0, usersV: 0,
      chatMode: 'say', whisperTo: null, entering: null,
    };
  }

  set(patch) {
    this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    for (const l of this.listeners) l();
  }
  subscribe = (l) => { this.listeners.add(l); return () => this.listeners.delete(l); };

  get me() { return office.state.me?.id; }
  get socket() { return office.socket; }
  canEdit() { const s = this.state; if (s.room?.official) return !!s.admin; return !!(s.isOwner || s.admin || s.rights.includes(this.me)); }

  // ---------- Socket ----------
  attach() {
    const s = this.socket;
    if (!s || this.attached === s) return;
    this.detach();
    this.attached = s;
    const on = (ev, fn) => { s.on(ev, fn); this.handlers.push([ev, fn]); };
    this.handlers = [];
    on('hotel:room', (m) => this.onRoom(m));
    on('hotel:enter:fail', (m) => {
      this.set({ waiting: null, entering: null });
      if (m.reason === 'password') this.set({ entering: { roomId: m.roomId, askPassword: true, error: FAIL.password } });
      else office.toast({ title: FAIL[m.reason] || 'No se pudo entrar' });
    });
    on('hotel:waiting', (m) => this.set({ waiting: m.roomId, entering: null }));
    on('hotel:left', (m) => {
      this.clearRoom();
      if (LEFT[m.reason]) office.toast({ title: LEFT[m.reason] });
      if (m.reason === 'door') this.refreshRooms();
    });
    on('hotel:user:join', (u) => { this.addUser(u); this.bump('usersV'); });
    on('hotel:user:leave', (m) => { this.live.users.delete(m.id); this.bump('usersV'); if (this.state.selected?.userId === m.id) this.set({ selected: null }); });
    on('hotel:path', (m) => this.onPath(m));
    on('hotel:user', (m) => this.onUser(m));
    on('hotel:nopath', () => {});
    on('hotel:chat', (m) => this.onChat(m));
    on('hotel:typing', (m) => { if (m.on) this.live.typing.set(m.id, Date.now()); else this.live.typing.delete(m.id); });
    on('hotel:item', (m) => this.onItem(m));
    on('hotel:inv', (m) => this.onInv(m));
    on('hotel:notice', (m) => office.toast({ title: m.text, kind: m.error ? 'error' : undefined }));
    on('hotel:bell', (m) => {
      playSound('wave', office.state.prefs?.audio?.notifVolume ?? 0.6);
      this.set((st) => ({ bells: [...st.bells.filter((b) => b.userId !== m.userId), m] }));
    });
    on('hotel:bell:done', (m) => this.set((st) => ({ bells: st.bells.filter((b) => b.userId !== m.userId) })));
    on('hotel:room:update', (m) => this.set({ room: m.room, rights: m.rights }));
    // Al reconectar, volver a entrar a la sala donde estaba
    on('connect', () => { if (this.state.roomId) this.socket.emit('hotel:enter', { roomId: this.state.roomId, password: this.password }); });
  }
  detach() {
    if (this.attached) for (const [ev, fn] of this.handlers || []) this.attached.off(ev, fn);
    this.attached = null;
  }

  bump(k) { this.set((st) => ({ [k]: st[k] + 1 })); }

  // ---------- Navegador ----------
  async refreshRooms(tab = this.state.navTab || 'official', q = '', category = this.state.navCat || '') {
    try {
      // B: navegador social (/hotel/nav: eventos, favoritas, búsqueda owner:/#etiqueta, categorías)
      const r = await api.get(`/hotel/nav?tab=${tab === 'all' ? 'search' : tab}${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${category}` : ''}`);
      this.set({ rooms: r.rooms, navTab: tab, myRooms: r.mine, maxRooms: r.maxRooms });
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  }
  enter(roomId, password) {
    this.attach();
    this.password = password ?? null;
    this.set({ entering: { roomId }, waiting: null });
    this.socket?.emit('hotel:enter', { roomId, password });
  }
  // Al subir al Hotel: directo a la sala oficial principal (Charla General)
  async enterOfficial() {
    try {
      const r = await api.get('/hotel/rooms?tab=official');
      this.set({ rooms: r.rooms, navTab: 'official', myRooms: r.mine, maxRooms: r.maxRooms });
      const hq = r.rooms.find((x) => x.officialKey === FLAGSHIP_KEY) || r.rooms[0];
      if (hq && !this.state.roomId && !this.state.entering) this.enter(hq.id);
    } catch { /* se queda en el navegador */ }
  }
  leave() {
    this.socket?.emit('hotel:leave');
    this.clearRoom();
    this.refreshRooms();
  }
  clearRoom() {
    this.live.room = null; this.live.grid = null; this.live.items = new Map(); this.live.users = new Map(); this.live.bubbles = [];
    this.set({ screen: 'nav', roomId: null, room: null, panel: this.state.panel === 'catalog' ? null : null, placing: null, selected: null, bells: [], chatLog: [], waiting: null, entering: null });
  }
  cancelWaiting() {
    this.socket?.emit('hotel:leave');
    this.set({ waiting: null });
  }

  // ---------- Sala ----------
  onRoom(m) {
    const L = this.live;
    L.room = m;
    L.items = new Map(m.items.map((i) => [i.id, i]));
    this.rebuildGrid();
    L.users = new Map();
    L.bubbles = [];
    for (const u of m.users) this.addUser(u);
    this.set({
      screen: 'room', roomId: m.room.id, room: m.room, rights: m.rights, isOwner: m.isOwner, admin: m.admin,
      chatLog: m.chat || [], entering: null, waiting: null, placing: null, selected: null, bells: [],
    });
    this.bump('itemsV');
    if (this.state.inventory == null) this.loadInventory();
    window.dispatchEvent(new CustomEvent('hotel:entered'));
  }
  rebuildGrid() {
    const L = this.live;
    if (!L.room) return;
    L.grid = buildRoom(L.room.room.model, [...L.items.values()].filter((i) => !i.wall));
  }
  addUser(u) {
    const U = {
      id: u.id, name: u.name, avatar: u.avatar, x: u.x, y: u.y, z: u.z, dir: toDir8(u.dir), head: u.head ?? null, sit: u.sit, lay: u.lay, act: u.act || null, dance: u.dance ?? null, hand: u.hand ?? null, bot: u.bot || null,
      rx: u.x, ry: u.y, rz: u.z, walk: null, moving: false, steps: 0, look: null, actT: performance.now(),
      hand: u.hand ?? null, effect: u.effect ?? null, sign: u.sign ?? null,
    };
    this.live.users.set(u.id, U);
    if (u.path?.length) this.onPath({ id: u.id, from: u.from || [u.x, u.y, u.z], path: u.path, t0: u.t0, n0: u.n0, now: u.now });
  }
  // Caminata del servidor: misma cuenta de tiempo que él (shared/hotelWalk.js), pasada a nuestro reloj.
  // m.now − m.t0 = cuánto llevaba del primer paso cuando el servidor lo mandó.
  onPath(m) {
    const U = this.live.users.get(m.id);
    if (!U) return;
    const ago = m.now != null && m.t0 != null ? Math.max(0, m.now - m.t0) : 0;
    const from = m.from ? [...m.from] : [U.rx, U.ry, U.rz];
    U.walk = { from, path: m.path.map((p) => [...p]), t0: performance.now() - ago, n0: m.n0 || 0, slide: !!m.slide };
    U.sit = null; U.lay = null; U.act = null; U.dance = null; U.head = null; U.look = null; U.pending = null;
    this.stepUser(U, performance.now());
  }
  stepUser(U, t) {
    const p = walkVisual(U.walk, t);
    // Ciclo de caminar según lo que avanza (no según el tiempo): sin pies que patinen en diagonal
    if (!U.walk.slide && !p.done) U.walkPhase = ((U.walkPhase || 0) + strideAdvance(p.x - U.rx, p.y - U.ry)) % 1;
    U.rx = p.x; U.ry = p.y; U.rz = p.z;
    if (p.dir != null && !U.walk.slide) U.dir = p.dir; // en un rodillo no se voltea
    U.steps = p.steps;
    if (p.done) {
      // Al llegar queda justo en el centro de la casilla
      U.walk = null; U.moving = false; U.walkPhase = 0;
      [U.x, U.y, U.z] = p.to;
      if (U.pending) { this.applyUser(U, U.pending); U.pending = null; }
    } else { U.moving = true; U.x = p.from[0]; U.y = p.from[1]; }
  }
  // Avanza las animaciones (lo llama el motor cada cuadro)
  tick(t) {
    for (const U of this.live.users.values()) {
      if (U.walk) this.stepUser(U, t);
      if (U.look && t > U.look.until) U.look = null;
    }
  }
  applyUser(U, m) {
    const act = m.act || null, dance = m.dance ?? null;
    if (act !== U.act || dance !== U.dance) U.actT = performance.now();
    Object.assign(U, { x: m.x, y: m.y, z: m.z, dir: toDir8(m.dir, U.dir), head: m.head ?? null, sit: m.sit, lay: m.lay, act, dance, hand: m.hand ?? null, effect: m.effect ?? null, sign: m.sign ?? null });
    U.rx = m.x; U.ry = m.y; U.rz = m.z;
  }
  onUser(m) {
    const U = this.live.users.get(m.id);
    if (!U) return;
    Object.assign(U, { hand: m.hand ?? null, effect: m.effect ?? null, sign: m.sign ?? null }); // se ve al momento, aunque vaya caminando
    if (m.tp || !U.walk) { U.walk = null; U.moving = false; U.pending = null; this.applyUser(U, m); }
    // Aún va dando su último paso aquí: se aplica al llegar (sentarse, acostarse…)
    else U.pending = m;
    if (m.tp && m.id === this.me) playSound('power', 0.5);
  }
  // Acciones (menú "Acciones"): bailes 1–4, saludar, beso, reír, saltar; lo demás va como comando del chat
  act(act, n) { this.socket?.emit('hotel:act', { act, n }); }
  command(text) { this.socket?.emit('hotel:chat', { text }); }
  // Voltear hacia una casilla o hacia alguien (el servidor decide si gira el cuerpo o solo la cabeza)
  look(x, y) { this.socket?.emit('hotel:look', { x, y }); }
  lookAtUser(id) {
    const U = this.live.users.get(id), me = this.live.users.get(this.me);
    if (U && me && U !== me && !me.walk) this.look(Math.round(U.rx), Math.round(U.ry));
  }
  // Voltear la cabeza hacia quien habla (solo la cabeza, como en el original)
  lookAt(id) {
    const S = this.live.users.get(id);
    if (!S) return;
    const t = performance.now();
    for (const U of this.live.users.values()) {
      if (U === S || U.walk || U.lay) continue;
      if (Math.hypot(U.rx - S.rx, U.ry - S.ry) > 9) continue;
      const d = dirToward(U.rx, U.ry, S.rx, S.ry);
      if (d == null) continue;
      U.look = { dir: d, until: t + 4500 };
    }
  }

  // ---------- Furnis ----------
  onItem(m) {
    const L = this.live;
    if (m.op === 'remove') {
      L.items.delete(m.id);
      if (this.state.selected?.itemId === m.id) this.set({ selected: null });
    } else {
      const prev = L.items.get(m.item.id);
      mechOnItem(m);
      L.items.set(m.item.id, m.item);
      // Dado: anunciar el resultado
      if (m.roll && prev) this.live.diceAt = { id: m.item.id, t: performance.now() };
    }
    this.rebuildGrid();
    this.bump('itemsV');
  }
  async loadInventory() {
    try { const r = await api.get('/hotel/inventory'); this.set({ inventory: r.items }); } catch { /* sin inventario */ }
  }
  onInv(m) {
    if (m.refresh) return this.loadInventory();
    this.set((st) => {
      let inv = st.inventory || [];
      if (m.remove) inv = inv.filter((i) => !m.remove.includes(i.id));
      if (m.add) inv = [...inv.filter((i) => !m.add.some((a) => a.id === i.id)), ...m.add.map((i) => ({ ...i, roomId: null }))];
      return { inventory: inv };
    });
  }
  startPlacing(item, { move = false } = {}) {
    const def = FURNI_BY_ID[item.type];
    if (!def) return;
    this.set({ placing: { itemId: item.id, type: item.type, color: item.color, state: item.state, extra: item.extra, rot: item.rot ?? def.rots[0], move }, selected: null, panel: move ? this.state.panel : this.state.panel });
  }
  rotatePlacing() {
    const p = this.state.placing;
    if (!p) return;
    const def = FURNI_BY_ID[p.type];
    if (def.kind === 'wall') return;
    const rots = def.rots;
    this.set({ placing: { ...p, rot: rots[(rots.indexOf(p.rot) + 1) % rots.length] } });
  }
  place(target) {
    const p = this.state.placing;
    if (!p) return;
    const ev = p.move ? 'hotel:move' : 'hotel:place';
    this.socket.emit(ev, { itemId: p.itemId, ...target, rot: target.rot ?? p.rot });
    // Seguir colocando otro igual del inventario (como en el original): solo si hay más del mismo tipo
    if (!p.move) {
      const more = (this.state.inventory || []).find((i) => i.id !== p.itemId && i.type === p.type && i.color === p.color);
      this.set({ placing: more ? { ...p, itemId: more.id, extra: more.extra } : null });
    } else this.set({ placing: null });
  }

  // ---------- Chat ----------
  onChat(m) {
    const L = this.live;
    this.set((st) => ({ chatLog: [...st.chatLog.slice(-99), m] }));
    L.typing.delete(m.from);
    L.pendingBubbles = L.pendingBubbles || [];
    L.pendingBubbles.push(m);
    if (m.mode !== 'whisper') this.lookAt(m.from);
    if (m.mode === 'whisper' && m.from !== this.me) playSound('message', 0.4);
  }
  say(text) {
    const t = String(text || '').trim();
    if (!t) return;
    const st = this.state;
    if (t === ':sit' || t === ':sentar') return this.socket.emit('hotel:sit');
    if (t === 'o/') this.socket.emit('hotel:act', { act: 'wave' }); // :saludar, :bailar 1–4, :beso… los resuelve el servidor
    if (t.startsWith(':shout ') || t.startsWith(':gritar ')) return this.socket.emit('hotel:chat', { text: t.replace(/^:\S+\s/, ''), mode: 'shout' });
    if (st.chatMode === 'whisper' && st.whisperTo && this.live.users.has(st.whisperTo)) return this.socket.emit('hotel:chat', { text: t, mode: 'whisper', to: st.whisperTo });
    this.socket.emit('hotel:chat', { text: t, mode: st.chatMode === 'shout' ? 'shout' : 'say' });
  }
}

export const hotel = new Hotel();
if (typeof window !== 'undefined') window.__hotel = hotel;

export function useHotel(sel) {
  return useSyncExternalStore(hotel.subscribe, () => sel(hotel.state));
}

export const modelName = (m) => ROOM_MODELS[m]?.name || m;
