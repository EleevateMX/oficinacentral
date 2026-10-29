// Hotel: siembra de las salas OFICIALES (Oficina Central, Sala de juntas, …).
// Idempotente: crea las salas que falten y, si cambió OFFICIAL_VERSION (setting 'hotel_official_v'),
// vuelve a acomodar los furnis sembrados (los marcados con extra.official) sin duplicarlos.
// Las salas y sus furnis son de la cuenta admin más antigua; nunca pasan por un inventario.
import { db, now, getSetting, setSetting, tx } from './db.js';
import { OFFICIAL_ROOMS, OFFICIAL_VERSION, planOfficialRoom } from '../shared/hotelOfficialRooms.js';

const SETTING = 'hotel_official_v';
const isSeed = (extra) => { try { return !!JSON.parse(extra || '{}').official; } catch { return false; } };

export const systemOwner = () => db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get()?.id ?? null;

// Devuelve { created: [keys], reseeded: [keys], errors: [texto] } o null si todavía no hay admin.
export function seedOfficialRooms({ force = false } = {}) {
  const owner = systemOwner();
  if (!owner) return null;
  const stale = force || Number(getSetting(SETTING, 0)) !== OFFICIAL_VERSION;
  const out = { created: [], reseeded: [], errors: [] };
  tx(() => {
    OFFICIAL_ROOMS.forEach((spec, order) => {
      let row = db.prepare('SELECT * FROM hotel_rooms WHERE official_key = ?').get(spec.key);
      const fresh = !row;
      if (fresh) {
        const id = Number(db.prepare(`INSERT INTO hotel_rooms (owner_id, name, description, model, access, wall_color, floor_color, official, official_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`).run(owner, spec.name, spec.description, spec.model, spec.wallColor, spec.floorColor, order + 1, spec.key, now(), now()).lastInsertRowid);
        row = db.prepare('SELECT * FROM hotel_rooms WHERE id = ?').get(id);
        out.created.push(spec.key);
      } else if (stale) {
        // Nueva versión: modelo, orden y colores oficiales (el nombre y la descripción los puede cambiar un admin)
        db.prepare('UPDATE hotel_rooms SET model = ?, official = ?, wall_color = ?, floor_color = ?, updated_at = ? WHERE id = ?')
          .run(spec.model, order + 1, spec.wallColor, spec.floorColor, now(), row.id);
      }
      if (!fresh && !stale) return;
      // Quitar los furnis sembrados antes (no los que un admin haya puesto después) y volver a sembrar
      const all = db.prepare('SELECT * FROM hotel_items WHERE room_id = ?').all(row.id);
      const del = db.prepare('DELETE FROM hotel_items WHERE id = ?');
      for (const it of all) if (isSeed(it.extra)) del.run(it.id);
      const keep = all.filter((it) => !isSeed(it.extra)).map((r) => ({
        id: r.id, type: r.type, x: r.x, y: r.y, z: r.z, rot: r.rot, state: r.state, wall: r.wall_pos ? JSON.parse(r.wall_pos) : null,
      }));
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
