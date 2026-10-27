// Acciones del editor de mapa con deshacer/rehacer.
import { api } from './api.js';
import { office } from './store.js';
import { CATALOG, objSize, CHAIR_TYPES } from '@shared/catalog.js';
import { inRect } from '@shared/map.js';

const undoStack = [];
const redoStack = [];

function bump() {
  office.set((st) => ({ editor: { ...st.editor, history: { undo: undoStack.length, redo: redoStack.length } } }));
}

function fail(e) {
  office.toast({ title: e.message, kind: 'error' });
  throw e;
}

function record(entry) {
  undoStack.push(entry);
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
  bump();
}

export function resetHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  bump();
}

export async function undo() {
  const e = undoStack.pop();
  if (!e) return;
  try { await e.undo(); redoStack.push(e); } catch (err) { office.toast({ title: err.message, kind: 'error' }); }
  bump();
}

export async function redo() {
  const e = redoStack.pop();
  if (!e) return;
  try { await e.redo(); undoStack.push(e); } catch (err) { office.toast({ title: err.message, kind: 'error' }); }
  bump();
}

const snapshot = (o) => ({ type: o.type, x: o.x, y: o.y, rot: o.rot, color: o.color, ...(o.w != null ? { w: o.w } : {}), ...(o.h != null ? { h: o.h } : {}) });

export async function addObject(floorId, obj) {
  let id;
  try { ({ id } = await api.post(`/floors/${floorId}/objects`, obj)); } catch (e) { fail(e); }
  const ref = { id };
  record({
    undo: () => api.del(`/objects/${ref.id}`),
    redo: async () => { ref.id = (await api.post(`/floors/${floorId}/objects`, obj)).id; },
  });
  return id;
}

export async function updateObject(o, patch) {
  const before = snapshot(o);
  try { await api.patch(`/objects/${o.id}`, patch); } catch (e) { fail(e); }
  record({
    undo: () => api.patch(`/objects/${o.id}`, before),
    redo: () => api.patch(`/objects/${o.id}`, patch),
  });
}

export async function deleteObject(floorId, o) {
  const before = snapshot(o);
  try { await api.del(`/objects/${o.id}`); } catch (e) { fail(e); }
  const ref = { id: o.id };
  record({
    undo: async () => { ref.id = (await api.post(`/floors/${floorId}/objects`, before)).id; },
    redo: () => api.del(`/objects/${ref.id}`),
  });
  office.set((st) => ({ editor: { ...st.editor, selected: null } }));
}

// Objeto debajo del puntero (decoraciones primero, luego muebles; el último dibujado gana)
export function objectAt(floor, wx, wy, filter = () => true) {
  const list = floor.objects.filter(filter);
  const hit = (o) => {
    const { w, h } = objSize(o);
    const c = CATALOG[o.type];
    // los objetos altos se dibujan un poco por encima de su casilla
    const top = c.kind === 'furniture' && c.solid ? 0.4 : 0;
    return wx >= o.x && wx < o.x + w && wy >= o.y - top && wy < o.y + h;
  };
  const decor = list.filter((o) => CATALOG[o.type]?.kind === 'decor' && hit(o));
  if (decor.length) return decor[decor.length - 1];
  const furn = list.filter((o) => CATALOG[o.type]?.kind !== 'decor' && hit(o));
  // Las mamparas cubren escritorio y silla: se eligen solo si no hay otra cosa
  const key = (o) => (o.type === 'cubicleWalls' ? -1e9 : o.y + objSize(o).h);
  return furn.sort((a, b) => key(a) - key(b)).pop() || null;
}

export function myDesk(floor, meId) {
  const deskId = Object.entries(floor.claims).find(([, uid]) => uid === meId)?.[0];
  return deskId ? floor.desks.find((d) => d.id === Number(deskId)) : null;
}

// Igual que en el servidor (server/world.js → editRole)
export function editRole(floor, o, me) {
  if (me.role === 'admin') return 'admin';
  const d = myDesk(floor, me.id);
  if (d) {
    if (o.deskId === d.id) return 'decor';
    if (o.id === d.id) return 'desk';
    if (CHAIR_TYPES.includes(o.type) && insideZone(o, d.zone)) return 'chair';
  }
  if (o.deskId != null || floor.claims[o.id]) return null;
  const othersZone = floor.desks.some((x) => floor.claims[x.id] && floor.claims[x.id] !== me.id && insideZone(o, x.zone));
  if (CHAIR_TYPES.includes(o.type) && othersZone) return null;
  if (floor.areas.some((a) => a.leaders?.includes(me.id) && insideZone(o, a))) return 'leader';
  if (o.by === me.id && CATALOG[o.type]?.kind === 'decor' && decorAreas(floor, me).some((a) => insideZone(o, a))) return 'member';
  return null;
}

export function canEditObject(floor, o, me) {
  return !!editRole(floor, o, me);
}

export const isLeaderOf = (a, me) => !!a.leaders?.includes(me.id);

// Departamentos donde esta persona puede decorar: los que lidera y, si el
// líder lo activó, el suyo (donde está su escritorio).
export function decorAreas(floor, me) {
  const d = myDesk(floor, me.id);
  return floor.areas.filter((a) => isLeaderOf(a, me) || (a.openDecor && d && insideZone(d.object, a)));
}

// La silla que corresponde a un escritorio (la primera dentro de su zona)
export function chairOf(floor, desk) {
  return floor.objects.find((o) => CHAIR_TYPES.includes(o.type) && o.deskId == null && insideZone(o, desk.zone)) || null;
}

export function snapFor(type, wx, wy) {
  const c = CATALOG[type];
  const { w, h } = objSize({ type });
  if (c.kind === 'furniture') return { x: Math.round(wx - w / 2), y: Math.round(wy - h / 2) };
  return { x: Math.round((wx - w / 2) * 4) / 4, y: Math.round((wy - h / 2) * 4) / 4 };
}

export function insideZone(o, zone) {
  const { w, h } = objSize(o);
  return o.x >= zone.x && o.y >= zone.y && o.x + w <= zone.x + zone.w && o.y + h <= zone.y + zone.h;
}

export { inRect };
