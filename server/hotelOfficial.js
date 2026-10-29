// Hotel: siembra de las salas OFICIALES (Charla General, Roleplay, League of Legends, …).
// Idempotente: crea las salas que falten y, si cambió OFFICIAL_VERSION (setting 'hotel_official_v'),
// vuelve a acomodar los furnis sembrados (los marcados con extra.official) sin duplicarlos.
// Migración: una sala con clave vieja (spec.legacy, p. ej. 'hq' → 'charla') se convierte EN SU LUGAR
// (mismo id, misma gente, mismos furnis que haya puesto un admin) en la nueva; una sala oficial cuya
// clave ya no existe deja de ser oficial (pierde sus furnis sembrados) para no quedar huérfana.
// Las salas y sus furnis son de la cuenta admin más antigua; nunca pasan por un inventario.
import { db, now, getSetting, setSetting, tx } from './db.js';
import { OFFICIAL_ROOMS, OFFICIAL_VERSION, planOfficialRoom } from '../shared/hotelOfficialRooms.js';
import { FURNI_BY_ID } from '../shared/hotelCatalog.js';
import { buildRoom, canPlace, canPlaceWall, roomAddItem } from '../shared/hotelRoom.js';

const SETTING = 'hotel_official_v';
const isSeed = (extra) => { try { return !!JSON.parse(extra || '{}').official; } catch { return false; } };

export const systemOwner = () => db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get()?.id ?? null;

// Devuelve { created: [keys], reseeded: [keys], migrated: ['vieja→nueva'], retired: [keys], errors: [texto] } o null si todavía no hay admin.
export function seedOfficialRooms({ force = false } = {}) {
  const owner = systemOwner();
  if (!owner) return null;
  let stale = force || Number(getSetting(SETTING, 0)) !== OFFICIAL_VERSION;
  const out = { created: [], reseeded: [], migrated: [], retired: [], errors: [] };
  tx(() => {
    // 1) Claves viejas → nuevas (en su lugar)
    for (const spec of OFFICIAL_ROOMS) {
      if (db.prepare('SELECT id FROM hotel_rooms WHERE official_key = ?').get(spec.key)) continue;
      for (const old of spec.legacy || []) {
        const r = db.prepare('SELECT id FROM hotel_rooms WHERE official_key = ?').get(old);
        if (!r) continue;
        db.prepare('UPDATE hotel_rooms SET official_key = ?, updated_at = ? WHERE id = ?').run(spec.key, now(), r.id);
        out.migrated.push(`${old}→${spec.key}`);
        break;
      }
    }
    // 2) Oficiales que ya no existen: vuelven a ser salas normales, sin los furnis sembrados
    const keys = new Set(OFFICIAL_ROOMS.map((s) => s.key));
    for (const r of db.prepare('SELECT id, official_key FROM hotel_rooms WHERE official_key IS NOT NULL').all()) {
      if (keys.has(r.official_key)) continue;
      for (const it of db.prepare('SELECT id, extra FROM hotel_items WHERE room_id = ?').all(r.id)) if (isSeed(it.extra)) db.prepare('DELETE FROM hotel_items WHERE id = ?').run(it.id);
      db.prepare('UPDATE hotel_rooms SET official = 0, official_key = NULL, updated_at = ? WHERE id = ?').run(now(), r.id);
      out.retired.push(r.official_key);
    }
    if (out.migrated.length || out.retired.length) stale = true;
    OFFICIAL_ROOMS.forEach((spec, order) => {
      let row = db.prepare('SELECT * FROM hotel_rooms WHERE official_key = ?').get(spec.key);
      const fresh = !row;
      if (fresh) {
        const id = Number(db.prepare(`INSERT INTO hotel_rooms (owner_id, name, description, model, access, wall_color, floor_color, official, official_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`).run(owner, spec.name, spec.description, spec.model, spec.wallColor, spec.floorColor, order + 1, spec.key, now(), now()).lastInsertRowid);
        row = db.prepare('SELECT * FROM hotel_rooms WHERE id = ?').get(id);
        out.created.push(spec.key);
      }
      const oldModel = row.model;
      if (!fresh && stale) {
        // Nueva versión: nombre, descripción, modelo, orden y colores oficiales (un admin los puede volver a cambiar después)
        db.prepare('UPDATE hotel_rooms SET name = ?, description = ?, model = ?, official = ?, wall_color = ?, floor_color = ?, updated_at = ? WHERE id = ?')
          .run(spec.name, spec.description, spec.model, order + 1, spec.wallColor, spec.floorColor, now(), row.id);
      }
      if (!fresh && !stale) return;
      // Quitar los furnis sembrados antes (no los que un admin haya puesto después) y volver a sembrar
      const all = db.prepare('SELECT * FROM hotel_items WHERE room_id = ?').all(row.id);
      const del = db.prepare('DELETE FROM hotel_items WHERE id = ?');
      for (const it of all) if (isSeed(it.extra)) del.run(it.id);
      let keep = all.filter((it) => !isSeed(it.extra)).map((r) => ({
        id: r.id, owner: r.owner_id, type: r.type, x: r.x, y: r.y, z: r.z, rot: r.rot, state: r.state, wall: r.wall_pos ? JSON.parse(r.wall_pos) : null,
      }));
      // Cambió el mapa (sala migrada a otro tema): lo que puso un admin y ya no cabe regresa a su inventario
      if (!fresh && oldModel !== spec.model && keep.length) {
        const grid = buildRoom(spec.model, []);
        const fits = [];
        const back = db.prepare('UPDATE hotel_items SET room_id = NULL, x = NULL, y = NULL, z = 0, wall_pos = NULL, state = 0 WHERE id = ?');
        for (const it of [...keep].sort((a, b) => a.z - b.z)) {
          const def = FURNI_BY_ID[it.type];
          const v = !def ? { ok: false } : it.wall ? canPlaceWall(grid, def, it.wall.wall, it.wall.pos, it.wall.h) : canPlace(grid, def, it.x, it.y, it.rot);
          if (!v.ok) { back.run(it.id); continue; }
          if (!it.wall) { if (Math.abs(v.z - it.z) > 1e-6) db.prepare('UPDATE hotel_items SET z = ? WHERE id = ?').run(v.z, it.id); it.z = v.z; roomAddItem(grid, it); }
          fits.push(it);
        }
        keep = fits;
      }
      const plan = planOfficialRoom(spec, keep);
      out.errors.push(...plan.errors);
      const ins = db.prepare(`INSERT INTO hotel_items (owner_id, room_id, type, x, y, z, rot, state, color, wall_pos, extra, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const extra = JSON.stringify({ official: spec.key });
      for (const it of plan.items) ins.run(owner, row.id, it.type, it.x, it.y, it.z, it.rot, it.state, it.color, it.wall ? JSON.stringify(it.wall) : null, extra, now());
      if (!fresh) out.reseeded.push(spec.key);
    });
    setSetting(SETTING, OFFICIAL_VERSION);
  });
  if (out.errors.length) console.warn('[hotel] Furnis oficiales que no se pudieron acomodar:', out.errors);
  return out;
}

export const isSeedItem = (it) => !!it?.extra?.official;
