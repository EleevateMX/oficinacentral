// Estados compactos por "diferencias" (deltas) para Zombies.
//
// El anfitrión manda cada ~1 s un estado completo (llave, `kf`) y en medio solo lo que cambió
// respecto a esa llave: los zombis (y jugadores) quietos no se vuelven a mandar, y de los que se
// mueven solo van las columnas que cambiaron (posición, ángulo…). Como cada delta se compara con la
// LLAVE (no con el delta anterior), perder un estado no rompe nada: el siguiente ya trae todo lo
// que cambió. Si se pierde la llave, se esperan los deltas hasta la siguiente (≤ 1 s, con la
// interpolación de netSync sigue dibujando).
//
// La columna "tiempo en el estado" (z.t) avanza sola: el que recibe la predice con el reloj del
// anfitrión (_t) y solo se manda si no cuadra (cambió de estado, reinició…).
//
// Puro (sin DOM): se prueba en Node con ida y vuelta (encode → decode = estado original).

// Filas con llave en la columna 0 (zombis). P va por asiento (índice).
const Z_CLOCK = { col: 8, ref: 7, rate: 0.1 }; // z.t ×100 avanza 0.1 por ms mientras no cambie ZSTATES (col 7)

function sameRow(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Columnas que cambiaron de `base` a `row` → [mask, ...valores] (o null si nada).
// La columna reloj no se manda mientras su referencia (el estado) no cambie y cuadre con la predicción.
function diffRow(base, row, start, clock, dtMs) {
  let mask = 0;
  const vals = [];
  for (let i = start; i < row.length; i++) {
    const same = clock && i === clock.col
      ? base[clock.ref] === row[clock.ref] && Math.abs(Math.round(base[i] + dtMs * clock.rate) - row[i]) <= 3
      : base[i] === row[i];
    if (!same) { mask |= 1 << (i - start); vals.push(row[i]); }
  }
  return mask ? [mask, ...vals] : null;
}
function applyRow(base, mask, vals, vi, start, clock, dtMs) {
  const row = base.slice();
  for (let i = start; i < row.length; i++) {
    if (mask & (1 << (i - start))) row[i] = vals[vi++];
    else if (clock && i === clock.col) row[i] = Math.round(base[i] + dtMs * clock.rate);
  }
  return [row, vi];
}

export class SnapEncoder {
  // every: estados entre llaves · maxMs: como mucho una llave cada maxMs (aunque haya pocos estados)
  constructor({ every = 20, maxMs = 1000 } = {}) {
    this.every = every;
    this.maxMs = maxMs;
    this.seq = 0;
    this.key = null; // { sq, t, P, Z (Map id → fila) }
    this.sinceKey = 0;
    this.force = true;
  }
  forceKey() { this.force = true; }
  // d: estado de sim.pack() con su _t (stamp). Devuelve lo que se manda (otro objeto; d no cambia).
  encode(d) {
    const sq = ++this.seq;
    const t = d._t ?? 0;
    const needKey = this.force || !this.key || this.sinceKey >= this.every || t - this.key.t >= this.maxMs;
    if (needKey) {
      this.force = false;
      this.sinceKey = 0;
      const Z = new Map();
      for (const r of d.Z || []) Z.set(r[0], r);
      this.key = { sq, t, P: d.P || [], Z };
      return { ...d, sq, kf: sq };
    }
    this.sinceKey++;
    const out = {};
    for (const k in d) if (k !== 'P' && k !== 'Z') out[k] = d[k];
    out.sq = sq; out.kb = this.key.sq;
    const dtMs = t - this.key.t;
    // jugadores: por asiento
    const KP = this.key.P, P = d.P || [];
    let pFull = KP.length !== P.length;
    const Pd = [];
    if (!pFull) {
      for (let s = 0; s < P.length; s++) {
        const a = KP[s], b = P[s];
        if (!a !== !b) { pFull = true; break; }
        if (!b || sameRow(a, b)) continue;
        const df = diffRow(a, b, 0, null, 0);
        if (df) Pd.push([s, ...df]);
      }
    }
    if (pFull) out.P = P; else if (Pd.length) out.Pd = Pd;
    // zombis: por id
    const Zd = [], seen = new Set();
    for (const r of d.Z || []) {
      const id = r[0];
      seen.add(id);
      const base = this.key.Z.get(id);
      if (!base) { Zd.push([-1, ...r]); continue; } // nuevo: fila completa
      const df = diffRow(base, r, 1, Z_CLOCK, dtMs);
      if (df) Zd.push([id, ...df]);
    }
    const Zx = [];
    for (const id of this.key.Z.keys()) if (!seen.has(id)) Zx.push(id);
    if (Zd.length) out.Zd = Zd;
    if (Zx.length) out.Zx = Zx;
    return out;
  }
}

export class SnapDecoder {
  constructor() { this.key = null; this.stats = { keys: 0, deltas: 0, missing: 0 }; }
  // m: lo que llegó por la red → estado completo (formato de sim.pack()) o null si falta la llave.
  // Los estados viejos (sin sq) pasan tal cual.
  decode(m) {
    if (!m || m.sq == null) return m;
    if (m.kf != null) {
      if (this.key && m.sq <= this.key.sq) return null; // llave vieja que llegó tarde
      const Z = new Map();
      for (const r of m.Z || []) Z.set(r[0], r);
      this.key = { sq: m.sq, t: m._t ?? 0, P: m.P || [], Z, order: m.Z || [] };
      this.stats.keys++;
      const out = { ...m };
      delete out.kf;
      return out;
    }
    if (!this.key || m.kb !== this.key.sq) { this.stats.missing++; return null; }
    this.stats.deltas++;
    const out = {};
    for (const k in m) if (k !== 'Pd' && k !== 'Zd' && k !== 'Zx' && k !== 'kb') out[k] = m[k];
    const dtMs = (m._t ?? 0) - this.key.t;
    // jugadores
    if (m.P) out.P = m.P;
    else {
      const P = this.key.P.slice();
      for (const e of m.Pd || []) {
        const [s, mask] = e;
        [P[s]] = applyRow(P[s], mask, e, 2, 0, null, 0);
      }
      out.P = P;
    }
    // zombis: los de la llave (menos los que se fueron) con sus cambios + los nuevos al final
    const gone = m.Zx?.length ? new Set(m.Zx) : null;
    const upd = new Map();
    const added = [];
    for (const e of m.Zd || []) {
      if (e[0] === -1) { added.push(e.slice(1)); continue; }
      const base = this.key.Z.get(e[0]);
      if (!base) continue;
      upd.set(e[0], applyRow(base, e[1], e, 2, 1, Z_CLOCK, dtMs)[0]);
    }
    const Z = [];
    for (const r of this.key.order) {
      if (gone && gone.has(r[0])) continue;
      const u = upd.get(r[0]);
      // sin cambios: solo avanza su reloj
      Z.push(u || applyRow(r, 0, null, 0, 1, Z_CLOCK, dtMs)[0]);
    }
    for (const r of added) Z.push(r);
    out.Z = Z;
    return out;
  }
}
