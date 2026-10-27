// Estado del mundo: pisos, áreas y objetos (con caché en memoria).
import { db, now, tx } from './db.js';
import { composeFloor, getTemplate, TEMPLATES, inRect } from '../shared/map.js';
import { CATALOG, objSize, DESK_DECOR_LIMIT, DESK_TYPES, CHAIR_TYPES } from '../shared/catalog.js';

const floors = new Map(); // id -> { id, name, template, sort, state, claims: Map(deskId -> userId) }

export class WorldError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const rowToObject = (r) => ({
  id: r.id, type: r.type, x: r.x, y: r.y,
  ...(r.w != null ? { w: r.w } : {}), ...(r.h != null ? { h: r.h } : {}),
  rot: r.rot, color: r.color, deskId: r.desk_id,
});
const rowToArea = (r) => ({ id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, color: r.color, private: !!r.private });

function rebuild(id) {
  const row = db.prepare('SELECT * FROM floors WHERE id = ?').get(id);
  if (!row) { floors.delete(id); return null; }
  const areas = db.prepare('SELECT * FROM areas WHERE floor_id = ? ORDER BY id').all(id).map(rowToArea);
  const objects = db.prepare('SELECT * FROM objects WHERE floor_id = ? ORDER BY id').all(id).map(rowToObject);
  const claims = new Map(
    db.prepare('SELECT c.desk_id, c.owner_id FROM desk_claims c JOIN objects o ON o.id = c.desk_id WHERE o.floor_id = ?')
      .all(id).map((r) => [r.desk_id, r.owner_id]),
  );
  const state = composeFloor({ template: row.template, areas, objects });
  const f = { id: row.id, name: row.name, template: row.template, sort: row.sort, state, claims };
  floors.set(id, f);
  return f;
}

export function createFloor(name, template = 'open') {
  if (!TEMPLATES[template]) throw new WorldError('Plantilla inválida');
  const id = tx(() => {
    const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM floors').get().s;
    const fid = Number(db.prepare('INSERT INTO floors (name, template, sort, created_at) VALUES (?, ?, ?, ?)').run(name, template, sort, now()).lastInsertRowid);
    const t = getTemplate(template);
    const insA = db.prepare('INSERT INTO areas (floor_id, name, x, y, w, h, color, private) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of t.areas) insA.run(fid, a.name, a.x, a.y, a.w, a.h, a.color, a.private ? 1 : 0);
    const insO = db.prepare('INSERT INTO objects (floor_id, type, x, y, w, h, rot, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const o of t.objects) insO.run(fid, o.type, o.x, o.y, o.w ?? null, o.h ?? null, o.rot || 0, o.color ?? null, now());
    return fid;
  });
  return rebuild(id);
}

export function loadWorld() {
  const rows = db.prepare('SELECT id FROM floors ORDER BY sort, id').all();
  if (!rows.length) createFloor('Piso 1', 'main');
  else for (const r of rows) rebuild(r.id);
}

export function getFloor(id) {
  return floors.get(Number(id)) || null;
}

export function listFloors() {
  return [...floors.values()].sort((a, b) => a.sort - b.sort || a.id - b.id).map((f) => ({ id: f.id, name: f.name, template: f.template }));
}

export function defaultFloorId() {
  return listFloors()[0]?.id;
}

export function floorPayload(id) {
  const f = getFloor(id);
  if (!f) return null;
  return {
    id: f.id, name: f.name, template: f.template,
    areas: f.state.areas, objects: f.state.objects,
    claims: Object.fromEntries(f.claims),
  };
}

export function renameFloor(id, name) {
  if (!getFloor(id)) throw new WorldError('Piso no encontrado', 404);
  db.prepare('UPDATE floors SET name = ? WHERE id = ?').run(name, id);
  return rebuild(id);
}

export function deleteFloor(id) {
  if (!getFloor(id)) throw new WorldError('Piso no encontrado', 404);
  if (floors.size <= 1) throw new WorldError('No puedes borrar el único piso');
  db.prepare('DELETE FROM floors WHERE id = ?').run(id);
  floors.delete(Number(id));
}

// ---------- Escritorios ----------
export function deskOf(userId) {
  for (const f of floors.values()) for (const [deskId, owner] of f.claims) if (owner === userId) return { floorId: f.id, deskId };
  return null;
}

function findDesk(deskId) {
  for (const f of floors.values()) {
    const d = f.state.desks.find((x) => x.id === deskId);
    if (d) return { floor: f, desk: d };
  }
  return null;
}

export function claimDesk(userId, deskId) {
  const found = findDesk(deskId);
  if (!found) throw new WorldError('Escritorio no encontrado', 404);
  const owner = found.floor.claims.get(deskId);
  if (owner && owner !== userId) throw new WorldError('Ese escritorio ya tiene dueño');
  const prev = deskOf(userId);
  tx(() => {
    db.prepare('DELETE FROM desk_claims WHERE owner_id = ?').run(userId);
    db.prepare('INSERT INTO desk_claims (desk_id, owner_id, claimed_at) VALUES (?, ?, ?)').run(deskId, userId, now());
  });
  const changed = new Set([found.floor.id]);
  if (prev) changed.add(prev.floorId);
  changed.forEach(rebuild);
  return [...changed];
}

export function releaseDesk(deskId, byUser) {
  const found = findDesk(deskId);
  if (!found) throw new WorldError('Escritorio no encontrado', 404);
  const owner = found.floor.claims.get(deskId);
  if (!owner) return [found.floor.id];
  if (owner !== byUser.id && byUser.role !== 'admin') throw new WorldError('No es tu escritorio', 403);
  db.prepare('DELETE FROM desk_claims WHERE desk_id = ?').run(deskId);
  rebuild(found.floor.id);
  return [found.floor.id];
}

// ---------- Objetos ----------
const round = (v, step) => Math.round(v / step) * step;

function bbox(o) {
  const { w, h } = objSize(o);
  return { x: o.x, y: o.y, w, h };
}

const rectInside = (inner, outer) =>
  inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 &&
  inner.x + inner.w <= outer.x + outer.w + 1e-6 && inner.y + inner.h <= outer.y + outer.h + 1e-6;

function validatePlacement(f, o, ignoreId) {
  const c = CATALOG[o.type];
  const b = bbox(o);
  const { W, H, walls } = f.state;
  if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) throw new WorldError('Fuera del mapa');
  if (c.kind !== 'furniture' || !c.solid) return;
  const others = f.state.objects.filter((x) => x.id !== ignoreId && x.deskId == null && CATALOG[x.type]?.solid);
  for (let j = Math.floor(b.y); j < Math.ceil(b.y + b.h); j++) {
    for (let i = Math.floor(b.x); i < Math.ceil(b.x + b.w); i++) {
      if (walls[j][i]) throw new WorldError('No se puede colocar sobre un muro');
      for (const x of others) {
        const ob = bbox(x);
        if (i >= ob.x && i < ob.x + ob.w && j >= ob.y && j < ob.y + ob.h) throw new WorldError('Se encima con otro objeto');
      }
    }
  }
}

// Cambio de modelo permitido solo dentro del mismo grupo (escritorios o sillas)
function swapType(existing, wanted) {
  if (!wanted || wanted === existing) return existing;
  if (DESK_TYPES.includes(existing) && DESK_TYPES.includes(wanted)) return wanted;
  if (CHAIR_TYPES.includes(existing) && CHAIR_TYPES.includes(wanted)) return wanted;
  throw new WorldError('Ese objeto no se puede cambiar por ese modelo');
}

function normalize(input, existing) {
  const type = existing ? swapType(existing.type, input.type) : input.type;
  const c = CATALOG[type];
  if (!c) throw new WorldError('Tipo de objeto inválido');
  const step = c.kind === 'furniture' ? 1 : 0.25;
  const o = {
    type,
    x: round(Number(input.x ?? existing?.x), step),
    y: round(Number(input.y ?? existing?.y), step),
    rot: c.rotatable || c.kind === 'furniture' ? (((Number(input.rot ?? existing?.rot ?? 0) % 4) + 4) % 4) : 0,
    color: input.color !== undefined ? input.color : existing?.color ?? null,
  };
  if (o.color != null && !/^#[0-9a-fA-F]{6}$/.test(o.color)) throw new WorldError('Color inválido');
  const w = input.w ?? existing?.w;
  const h = input.h ?? existing?.h;
  if (w != null) o.w = Math.max(1, Math.min(20, Math.round(w)));
  if (h != null) o.h = Math.max(1, Math.min(20, Math.round(h)));
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) throw new WorldError('Posición inválida');
  return o;
}

function myDeskZone(user, f) {
  const mine = deskOf(user.id);
  if (!mine || mine.floorId !== f.id) return null;
  const d = f.state.desks.find((x) => x.id === mine.deskId);
  return d ? { desk: d, zone: d.zone } : null;
}

export function addObject(user, floorId, input) {
  const f = getFloor(floorId);
  if (!f) throw new WorldError('Piso no encontrado', 404);
  const o = normalize(input);
  const c = CATALOG[o.type];
  let deskId = null;
  if (user.role !== 'admin') {
    if (c.kind !== 'decor') throw new WorldError('Solo los administradores pueden colocar muebles', 403);
    const mine = myDeskZone(user, f);
    if (!mine) throw new WorldError('Primero reclama un escritorio en este piso', 403);
    if (!rectInside(bbox(o), mine.zone)) throw new WorldError('Solo puedes decorar dentro de tu escritorio', 403);
    deskId = mine.desk.id;
  } else if (c.kind === 'decor') {
    const d = f.state.desks.find((x) => rectInside(bbox(o), x.zone));
    deskId = d?.id ?? null;
  }
  if (deskId != null) {
    const count = f.state.objects.filter((x) => x.deskId === deskId).length;
    if (count >= DESK_DECOR_LIMIT) throw new WorldError('Llegaste al límite de objetos de tu escritorio');
  }
  validatePlacement(f, o);
  const id = Number(db.prepare('INSERT INTO objects (floor_id, type, x, y, w, h, rot, color, desk_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(f.id, o.type, o.x, o.y, o.w ?? null, o.h ?? null, o.rot, o.color, deskId, user.id, now()).lastInsertRowid);
  rebuild(f.id);
  return id;
}

function getObjectRow(id) {
  const r = db.prepare('SELECT * FROM objects WHERE id = ?').get(id);
  if (!r) throw new WorldError('Objeto no encontrado', 404);
  return r;
}

// Qué puede tocar alguien que no es admin: la decoración de su escritorio,
// su propio escritorio (modelo y color) y la silla de su lugar.
function editRole(user, f, row) {
  if (user.role === 'admin') return 'admin';
  const mine = myDeskZone(user, f);
  if (!mine) return null;
  if (row.desk_id === mine.desk.id) return 'decor';
  if (row.id === mine.desk.id) return 'desk';
  if (CHAIR_TYPES.includes(row.type) && rectInside(bbox(rowToObject(row)), mine.zone)) return 'chair';
  return null;
}

function assertCanEdit(user, f, row) {
  const role = editRole(user, f, row);
  if (!role) throw new WorldError('Solo puedes editar tu escritorio y su decoración', 403);
  return role;
}

export function updateObject(user, id, patch) {
  const row = getObjectRow(id);
  const f = getFloor(row.floor_id);
  const role = assertCanEdit(user, f, row);
  const existing = rowToObject(row);
  // Tu escritorio: solo modelo y color, sin moverlo ni girarlo
  if (role === 'desk') patch = { type: patch.type, color: patch.color };
  const o = normalize(patch, existing);
  const c = CATALOG[o.type];
  let deskId = row.desk_id;
  if (role === 'decor' || role === 'chair') {
    if (!rectInside(bbox(o), myDeskZone(user, f).zone)) throw new WorldError('Solo puedes decorar dentro de tu escritorio', 403);
  } else if (role === 'admin' && c.kind === 'decor') {
    deskId = f.state.desks.find((x) => rectInside(bbox(o), x.zone))?.id ?? null;
  }
  validatePlacement(f, o, row.id);
  const dx = o.x - row.x;
  const dy = o.y - row.y;
  tx(() => {
    db.prepare('UPDATE objects SET type = ?, x = ?, y = ?, w = ?, h = ?, rot = ?, color = ?, desk_id = ? WHERE id = ?')
      .run(o.type, o.x, o.y, o.w ?? null, o.h ?? null, o.rot, o.color, deskId, row.id);
    // Si se mueve un escritorio, su decoración lo acompaña
    if (c.claimable && (dx || dy)) db.prepare('UPDATE objects SET x = x + ?, y = y + ? WHERE desk_id = ?').run(dx, dy, row.id);
  });
  rebuild(f.id);
  return f.id;
}

export function deleteObject(user, id) {
  const row = getObjectRow(id);
  const f = getFloor(row.floor_id);
  const role = assertCanEdit(user, f, row);
  if (role === 'desk' || role === 'chair') throw new WorldError('Tu escritorio y tu silla se pueden cambiar de modelo, pero no borrar', 403);
  db.prepare('DELETE FROM objects WHERE id = ?').run(row.id);
  rebuild(f.id);
  return f.id;
}

// ---------- Áreas ----------
function normalizeArea(f, input, existing = {}) {
  const a = {
    name: String(input.name ?? existing.name ?? '').trim().slice(0, 48),
    x: Math.round(input.x ?? existing.x), y: Math.round(input.y ?? existing.y),
    w: Math.round(input.w ?? existing.w), h: Math.round(input.h ?? existing.h),
    color: input.color ?? existing.color ?? 'none',
    private: input.private ?? existing.private ?? false,
  };
  if (!a.name) throw new WorldError('El área necesita un nombre');
  if (![a.x, a.y, a.w, a.h].every(Number.isFinite) || a.w < 2 || a.h < 2) throw new WorldError('El área debe medir al menos 2×2');
  if (a.x < 0 || a.y < 0 || a.x + a.w > f.state.W || a.y + a.h > f.state.H) throw new WorldError('Fuera del mapa');
  if (!/^[a-z0-9]+$/.test(a.color)) throw new WorldError('Color inválido');
  return a;
}

export function addArea(floorId, input) {
  const f = getFloor(floorId);
  if (!f) throw new WorldError('Piso no encontrado', 404);
  const a = normalizeArea(f, input);
  db.prepare('INSERT INTO areas (floor_id, name, x, y, w, h, color, private) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(f.id, a.name, a.x, a.y, a.w, a.h, a.color, a.private ? 1 : 0);
  rebuild(f.id);
  return f.id;
}

export function updateArea(id, patch) {
  const row = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  if (!row) throw new WorldError('Área no encontrada', 404);
  const f = getFloor(row.floor_id);
  const a = normalizeArea(f, patch, rowToArea(row));
  db.prepare('UPDATE areas SET name = ?, x = ?, y = ?, w = ?, h = ?, color = ?, private = ? WHERE id = ?')
    .run(a.name, a.x, a.y, a.w, a.h, a.color, a.private ? 1 : 0, row.id);
  rebuild(f.id);
  return f.id;
}

export function deleteArea(id) {
  const row = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  if (!row) throw new WorldError('Área no encontrada', 404);
  db.prepare('DELETE FROM areas WHERE id = ?').run(id);
  rebuild(row.floor_id);
  return row.floor_id;
}

export { inRect };
