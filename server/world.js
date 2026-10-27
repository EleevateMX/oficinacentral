// Estado del mundo: pisos, áreas y objetos (con caché en memoria).
import { db, now, tx, getSetting, setSetting } from './db.js';
import { composeFloor, getTemplate, TEMPLATES, inRect, RECEPTION_EXTRAS, areaAt } from '../shared/map.js';
import { CATALOG, objSize, DESK_DECOR_LIMIT, AREA_DECOR_LIMIT, DESK_TYPES, CHAIR_TYPES } from '../shared/catalog.js';
import { AREA_SHAPES } from '../shared/map.js';

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
  rot: r.rot, color: r.color, deskId: r.desk_id, by: r.created_by ?? null,
});
const rowToArea = (r, leaders = []) => ({
  id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h, color: r.color, private: !!r.private,
  shape: r.shape || 'soft', openDecor: !!r.open_decor, leaders,
});

function rebuild(id) {
  const row = db.prepare('SELECT * FROM floors WHERE id = ?').get(id);
  if (!row) { floors.delete(id); return null; }
  const leaders = new Map();
  for (const l of db.prepare('SELECT l.area_id, l.user_id FROM area_leaders l JOIN areas a ON a.id = l.area_id WHERE a.floor_id = ?').all(id)) {
    if (!leaders.has(l.area_id)) leaders.set(l.area_id, []);
    leaders.get(l.area_id).push(l.user_id);
  }
  const areas = db.prepare('SELECT * FROM areas WHERE floor_id = ? ORDER BY id').all(id).map((r) => rowToArea(r, leaders.get(r.id) || []));
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
    const insA = db.prepare('INSERT INTO areas (floor_id, name, x, y, w, h, color, private, shape) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of t.areas) insA.run(fid, a.name, a.x, a.y, a.w, a.h, a.color, a.private ? 1 : 0, a.shape || 'soft');
    const insO = db.prepare('INSERT INTO objects (floor_id, type, x, y, w, h, rot, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const o of t.objects) insO.run(fid, o.type, o.x, o.y, o.w ?? null, o.h ?? null, o.rot || 0, o.color ?? null, now());
    return fid;
  });
  if (template === 'hq') furnishDesks(id);
  return rebuild(id);
}

// Amuebla los escritorios de un piso: mamparas de cubículo y un equipo básico
// (monitor y teclado) en los que no tienen decoración. No toca lo ya decorado.
const DEPT_WALLS = { glassDesk: '#b9a7e6', gamingDesk: '#8fc9bb', standingDesk: '#f0a7a0', desk: '#a9b9d6', woodDesk: null };
export function furnishDesks(floorId) {
  const desks = db.prepare(`SELECT * FROM objects WHERE floor_id = ? AND type IN (${DESK_TYPES.map(() => '?').join(',')})`).all(floorId, ...DESK_TYPES);
  const hasWalls = db.prepare("SELECT 1 FROM objects WHERE floor_id = ? AND type = 'cubicleWalls' AND x = ? AND y = ?");
  const hasDecor = db.prepare('SELECT 1 FROM objects WHERE desk_id = ?');
  const ins = db.prepare('INSERT INTO objects (floor_id, type, x, y, w, h, rot, color, desk_id, created_at) VALUES (?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?)');
  let n = 0;
  tx(() => {
    for (const d of desks) {
      const wall = DEPT_WALLS[d.type];
      if (wall !== null && !hasWalls.get(floorId, d.x, d.y)) { ins.run(floorId, 'cubicleWalls', d.x, d.y, wall ?? null, null, now()); n++; }
      if (!hasDecor.get(d.id)) {
        const dual = (d.x + d.y) % 2 === 0;
        ins.run(floorId, dual ? 'dualMonitor' : 'monitor', d.x + (dual ? 0.75 : 1.125), d.y, null, d.id, now());
        ins.run(floorId, 'keyboard', d.x + 1.125, d.y + 0.5, null, d.id, now());
        n++;
      }
    }
  });
  return n;
}

export function loadWorld() {
  const rows = db.prepare('SELECT id FROM floors ORDER BY sort, id').all();
  if (!rows.length) { createFloor('Piso 1', 'hq'); setSetting('migr_cubicles_v1', '1'); setSetting('migr_reception_v1', '1'); return; }
  // Una vez: mamparas y equipo en los escritorios de oficinas ya creadas
  if (!getSetting('migr_cubicles_v1')) {
    for (const r of db.prepare("SELECT id FROM floors WHERE template = 'hq'").all()) furnishDesks(r.id);
    setSetting('migr_cubicles_v1', '1');
  }
  // Una vez: recepción renovada en oficinas ya creadas (si no hay nada en ese lugar)
  if (!getSetting('migr_reception_v1')) {
    for (const r of db.prepare("SELECT id FROM floors WHERE template = 'hq'").all()) addReceptionExtras(r.id);
    setSetting('migr_reception_v1', '1');
  }
  for (const r of rows) rebuild(r.id);
}

function addReceptionExtras(floorId) {
  const exists = db.prepare('SELECT 1 FROM objects WHERE floor_id = ? AND type = ? AND ABS(x - ?) < 0.01 AND ABS(y - ?) < 0.01');
  const ins = db.prepare('INSERT INTO objects (floor_id, type, x, y, w, h, rot, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [type, x, y, o] of RECEPTION_EXTRAS) {
    if (!exists.get(floorId, type, x, y)) ins.run(floorId, type, x, y, o.w ?? null, o.h ?? null, o.rot || 0, o.color ?? null, now());
  }
}

// Renovar el mapa de un piso con la versión más nueva de su plantilla.
// Se conservan: los escritorios reclamados (con su modelo, color, silla y decoración,
// en el mismo departamento si existe), las áreas con el mismo nombre (líderes y
// reservaciones), y la decoración abierta. Lo demás se reemplaza por la plantilla.
export function resetFloorLayout(floorId) {
  const f = getFloor(floorId);
  if (!f) throw new WorldError('Piso no encontrado', 404);
  if (!TEMPLATES[f.template]) throw new WorldError('Este piso no tiene plantilla');
  const t = getTemplate(f.template);
  const inside = (o, z) => o.x >= z.x && o.y >= z.y && o.x < z.x + z.w && o.y < z.y + z.h;
  const saved = [];
  for (const d of f.state.desks) {
    const owner = f.claims.get(d.id);
    if (!owner) continue;
    const chair = f.state.objects.find((o) => CHAIR_TYPES.includes(o.type) && o.deskId == null && inside(o, d.zone));
    saved.push({
      owner,
      area: areaAt(f.state, d.object.x, d.object.y)?.name || null,
      type: d.object.type, color: d.object.color,
      chair: chair ? { type: chair.type, color: chair.color } : null,
      decor: db.prepare('SELECT * FROM objects WHERE desk_id = ?').all(d.id).map((o) => ({ ...o, dx: o.x - d.object.x, dy: o.y - d.object.y })),
    });
  }
  let moved = 0;
  tx(() => {
    // Áreas: se actualizan las que tienen el mismo nombre, se agregan las nuevas y se quitan las que ya no van
    const old = db.prepare('SELECT * FROM areas WHERE floor_id = ?').all(floorId);
    const byName = new Map(old.map((a) => [a.name, a]));
    const keep = new Set();
    const upd = db.prepare('UPDATE areas SET x = ?, y = ?, w = ?, h = ?, color = ?, private = ?, shape = ? WHERE id = ?');
    const ins = db.prepare('INSERT INTO areas (floor_id, name, x, y, w, h, color, private, shape) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of t.areas) {
      const prev = byName.get(a.name);
      if (prev) { upd.run(a.x, a.y, a.w, a.h, a.color, a.private ? 1 : 0, a.shape || 'soft', prev.id); keep.add(prev.id); }
      else ins.run(floorId, a.name, a.x, a.y, a.w, a.h, a.color, a.private ? 1 : 0, a.shape || 'soft');
    }
    for (const a of old) {
      if (keep.has(a.id)) continue;
      db.prepare('UPDATE events SET area_id = NULL WHERE area_id = ?').run(a.id);
      db.prepare('DELETE FROM areas WHERE id = ?').run(a.id);
    }
    // Objetos: todos los de la plantilla
    db.prepare('DELETE FROM objects WHERE floor_id = ?').run(floorId);
    const insO = db.prepare('INSERT INTO objects (floor_id, type, x, y, w, h, rot, color, desk_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const o of t.objects) insO.run(floorId, o.type, o.x, o.y, o.w ?? null, o.h ?? null, o.rot || 0, o.color ?? null, null, null, now());
    const g = rebuild(floorId);
    // Escritorios reclamados: al mismo departamento si se puede
    const free = new Set(g.state.desks.map((d) => d.id));
    const areaOf = (d) => areaAt(g.state, d.object.x, d.object.y)?.name || null;
    const pick = (area) => {
      const same = g.state.desks.find((d) => free.has(d.id) && area && areaOf(d) === area);
      return same || g.state.desks.find((d) => free.has(d.id));
    };
    const claim = db.prepare('INSERT INTO desk_claims (desk_id, owner_id, claimed_at) VALUES (?, ?, ?)');
    for (const s0 of saved) {
      const d = pick(s0.area);
      if (!d) continue;
      free.delete(d.id);
      claim.run(d.id, s0.owner, now());
      if (DESK_TYPES.includes(s0.type)) db.prepare('UPDATE objects SET type = ?, color = ? WHERE id = ?').run(s0.type, s0.color, d.id);
      const ch = s0.chair && g.state.objects.find((o) => CHAIR_TYPES.includes(o.type) && inside(o, d.zone));
      if (ch) db.prepare('UPDATE objects SET type = ?, color = ? WHERE id = ?').run(s0.chair.type, s0.chair.color, ch.id);
      for (const o of s0.decor) insO.run(floorId, o.type, d.object.x + o.dx, d.object.y + o.dy, o.w, o.h, o.rot, o.color, d.id, o.created_by, o.created_at);
      if (areaOf(d) !== s0.area) moved++;
    }
  });
  if (f.template === 'hq') furnishDesks(floorId);
  return { floor: rebuild(floorId), kept: saved.length, moved };
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
  return d ? { desk: d, zone: d.zone, decorZone: d.decorZone } : null;
}

// ---------- Departamentos: líderes y decoración abierta ----------
const isLeader = (user, a) => a.leaders.includes(user.id);

// ¿Su escritorio está dentro del área? (miembro del departamento)
function isMember(user, f, a) {
  const mine = myDeskZone(user, f);
  return !!mine && rectInside(bbox(mine.desk.object), a);
}

// Áreas donde esta persona puede decorar: las que lidera y,
// si el líder lo activó, las de su propio departamento.
export function decorAreas(user, f) {
  return f.state.areas.filter((a) => isLeader(user, a) || (a.openDecor && isMember(user, f, a)));
}

function areaFor(user, f, box, { leaderOnly = false } = {}) {
  return f.state.areas.find((a) => rectInside(box, a) && (isLeader(user, a) || (!leaderOnly && a.openDecor && isMember(user, f, a)))) || null;
}

// Zona de un escritorio que tiene dueño distinto a esta persona
function othersDeskZone(user, f, box) {
  return f.state.desks.find((d) => {
    const owner = f.claims.get(d.id);
    return owner && owner !== user.id && rectInside(box, d.zone);
  }) || null;
}

function countAreaObjects(f, a) {
  return f.state.objects.filter((x) => x.deskId == null && !CATALOG[x.type]?.claimable && rectInside(bbox(x), a)).length;
}

export function addObject(user, floorId, input) {
  const f = getFloor(floorId);
  if (!f) throw new WorldError('Piso no encontrado', 404);
  const o = normalize(input);
  const c = CATALOG[o.type];
  let deskId = null;
  if (user.role !== 'admin') {
    const box = bbox(o);
    const mine = myDeskZone(user, f);
    if (c.kind === 'decor' && mine && rectInside(box, mine.decorZone)) {
      deskId = mine.desk.id;
    } else if (c.kind === 'decor' && mine && rectInside(box, mine.zone)) {
      throw new WorldError('La decoración va sobre tu escritorio, no donde está la silla', 403);
    } else {
      const area = areaFor(user, f, box);
      if (!area) {
        throw new WorldError(mine || decorAreas(user, f).length
          ? 'Solo puedes decorar dentro de tu escritorio o de tu departamento'
          : 'Primero reclama un escritorio en este piso', 403);
      }
      if (!isLeader(user, area) && c.kind !== 'decor') throw new WorldError('Los muebles solo los coloca el líder del departamento', 403);
      if (othersDeskZone(user, f, box)) throw new WorldError('Ese lugar es el escritorio de otra persona', 403);
      if (countAreaObjects(f, area) >= AREA_DECOR_LIMIT) throw new WorldError('El departamento llegó a su límite de objetos');
    }
  } else if (c.kind === 'decor') {
    const d = f.state.desks.find((x) => rectInside(bbox(o), x.decorZone));
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
// su propio escritorio (modelo y color), la silla de su lugar y, en su
// departamento, lo que permita su papel (líder: todo menos los lugares de
// otros; miembro con decoración abierta: lo que colocó él mismo).
function editRole(user, f, row) {
  if (user.role === 'admin') return 'admin';
  const mine = myDeskZone(user, f);
  const box = bbox(rowToObject(row));
  if (mine) {
    if (row.desk_id === mine.desk.id) return 'decor';
    if (row.id === mine.desk.id) return 'desk';
    if (CHAIR_TYPES.includes(row.type) && rectInside(box, mine.zone)) return 'chair';
  }
  if (row.desk_id != null || f.claims.get(row.id)) return null;
  if (CHAIR_TYPES.includes(row.type) && othersDeskZone(user, f, box)) return null;
  if (areaFor(user, f, box, { leaderOnly: true })) return 'leader';
  if (row.created_by === user.id && CATALOG[row.type]?.kind === 'decor' && areaFor(user, f, box)) return 'member';
  return null;
}

function assertCanEdit(user, f, row) {
  const role = editRole(user, f, row);
  if (!role) throw new WorldError('Solo puedes editar tu escritorio, su decoración y lo que te toca de tu departamento', 403);
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
  if (role === 'decor') {
    if (!rectInside(bbox(o), myDeskZone(user, f).decorZone)) throw new WorldError('La decoración va sobre tu escritorio', 403);
  } else if (role === 'chair') {
    if (!rectInside(bbox(o), myDeskZone(user, f).zone)) throw new WorldError('La silla se queda en tu lugar', 403);
  } else if (role === 'leader' || role === 'member') {
    const box = bbox(o);
    if (!areaFor(user, f, box, { leaderOnly: role === 'leader' })) throw new WorldError('Solo puedes mover cosas dentro de tu departamento', 403);
    if (othersDeskZone(user, f, box)) throw new WorldError('Ese lugar es el escritorio de otra persona', 403);
  } else if (role === 'admin' && c.kind === 'decor') {
    deskId = f.state.desks.find((x) => rectInside(bbox(o), x.decorZone))?.id ?? null;
  }
  validatePlacement(f, o, row.id);
  const dx = o.x - row.x;
  const dy = o.y - row.y;
  tx(() => {
    db.prepare('UPDATE objects SET type = ?, x = ?, y = ?, w = ?, h = ?, rot = ?, color = ?, desk_id = ? WHERE id = ?')
      .run(o.type, o.x, o.y, o.w ?? null, o.h ?? null, o.rot, o.color, deskId, row.id);
    // Si se mueve un escritorio, su decoración y sus mamparas lo acompañan
    if (c.claimable && (dx || dy)) {
      db.prepare('UPDATE objects SET x = x + ?, y = y + ? WHERE desk_id = ?').run(dx, dy, row.id);
      db.prepare("UPDATE objects SET x = x + ?, y = y + ? WHERE floor_id = ? AND type = 'cubicleWalls' AND x = ? AND y = ?").run(dx, dy, row.floor_id, row.x, row.y);
    }
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
    shape: input.shape ?? existing.shape ?? 'soft',
    openDecor: input.openDecor ?? existing.openDecor ?? false,
  };
  if (!AREA_SHAPES.some((s) => s.id === a.shape)) throw new WorldError('Forma inválida');
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
  db.prepare('INSERT INTO areas (floor_id, name, x, y, w, h, color, private, shape, open_decor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(f.id, a.name, a.x, a.y, a.w, a.h, a.color, a.private ? 1 : 0, a.shape, a.openDecor ? 1 : 0);
  rebuild(f.id);
  return f.id;
}

export function updateArea(id, patch) {
  const row = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  if (!row) throw new WorldError('Área no encontrada', 404);
  const f = getFloor(row.floor_id);
  const a = normalizeArea(f, patch, rowToArea(row));
  db.prepare('UPDATE areas SET name = ?, x = ?, y = ?, w = ?, h = ?, color = ?, private = ?, shape = ?, open_decor = ? WHERE id = ?')
    .run(a.name, a.x, a.y, a.w, a.h, a.color, a.private ? 1 : 0, a.shape, a.openDecor ? 1 : 0, row.id);
  rebuild(f.id);
  return f.id;
}

// El líder de un departamento cambia su alfombra, su forma y si su equipo puede decorar
export function styleArea(user, id, patch) {
  const row = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  if (!row) throw new WorldError('Área no encontrada', 404);
  const f = getFloor(row.floor_id);
  const area = f.state.areas.find((a) => a.id === row.id);
  if (user.role !== 'admin' && !isLeader(user, area)) throw new WorldError('Solo el líder del departamento puede cambiar esto', 403);
  const allowed = {};
  for (const k of ['color', 'shape', 'openDecor']) if (patch[k] !== undefined) allowed[k] = patch[k];
  if (allowed.openDecor !== undefined) allowed.openDecor = !!allowed.openDecor;
  return updateArea(id, allowed);
}

export function setAreaLeaders(id, userIds) {
  const row = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  if (!row) throw new WorldError('Área no encontrada', 404);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter(Number.isInteger))].slice(0, 10);
  const valid = ids.length ? db.prepare(`SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')}) AND disabled = 0`).all(...ids).map((r) => r.id) : [];
  tx(() => {
    db.prepare('DELETE FROM area_leaders WHERE area_id = ?').run(row.id);
    const ins = db.prepare('INSERT INTO area_leaders (area_id, user_id) VALUES (?, ?)');
    for (const uid of valid) ins.run(row.id, uid);
  });
  rebuild(row.floor_id);
  return row.floor_id;
}

export function deleteArea(id) {
  const row = db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  if (!row) throw new WorldError('Área no encontrada', 404);
  db.prepare('DELETE FROM areas WHERE id = ?').run(id);
  rebuild(row.floor_id);
  return row.floor_id;
}

export { inRect };
