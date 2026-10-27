// Utilidades mínimas para WebM (Matroska/EBML) sin dependencias.
//
// MediaRecorder entrega un WebM "en vivo": la cabecera (EBML + Info + Tracks)
// solo viene al principio y no trae duración. Para los clips guardamos los
// bloques (cuadros) de los últimos segundos y, al guardar, armamos un archivo
// nuevo: la misma cabecera con Duration + clusters que empiezan en un cuadro
// clave y con tiempos corridos a 0. Así el archivo se puede reproducir y
// adelantar desde el primer segundo.

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  Tracks: 0x1654ae6b,
  Cluster: 0x1f43b675,
  Cues: 0x1c53bb6b,
  Tags: 0x1254c367,
  SeekHead: 0x114d9b74,
  Chapters: 0x1043a770,
  Attachments: 0x1941a469,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
};
const LEVEL1 = new Set([ID.Cluster, ID.Cues, ID.Tags, ID.SeekHead, ID.Chapters, ID.Attachments, ID.Info, ID.Tracks]);
const UNKNOWN_SIZE = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

// ---------- Lectura de enteros variables (vint) ----------
function vlen(first) {
  for (let n = 1; n <= 8; n++) if (first & (0x80 >> (n - 1))) return n;
  return 0;
}

// ID de elemento: se conserva el bit marcador (como en la especificación)
export function readId(b, i) {
  if (i >= b.length) return null;
  const len = vlen(b[i]);
  if (!len || len > 4 || i + len > b.length) return len && len <= 4 ? null : { bad: true };
  let id = 0;
  for (let k = 0; k < len; k++) id = id * 256 + b[i + k];
  return { id, len };
}

export function readSize(b, i) {
  if (i >= b.length) return null;
  const len = vlen(b[i]);
  if (!len) return { bad: true };
  if (i + len > b.length) return null;
  let v = b[i] & (0xff >> len);
  let allOnes = v === (0xff >> len);
  for (let k = 1; k < len; k++) {
    v = v * 256 + b[i + k];
    if (b[i + k] !== 0xff) allOnes = false;
  }
  return { size: allOnes ? -1 : v, len };
}

// Lee un elemento completo en b[i]: { id, start, dataStart, end } o null si faltan bytes
function readElement(b, i) {
  const id = readId(b, i);
  if (!id || id.bad) return id;
  const sz = readSize(b, i + id.len);
  if (!sz || sz.bad) return sz;
  const dataStart = i + id.len + sz.len;
  const end = sz.size < 0 ? -1 : dataStart + sz.size;
  return { id: id.id, start: i, dataStart, size: sz.size, end };
}

function readUint(b, s, e) {
  let v = 0;
  for (let k = s; k < e; k++) v = v * 256 + b[k];
  return v;
}

function children(b, s, e) {
  const out = [];
  let i = s;
  while (i < e) {
    const el = readElement(b, i);
    if (!el || el.bad || el.end < 0 || el.end > e) break;
    out.push(el);
    i = el.end;
  }
  return out;
}

// ---------- Escritura ----------
function encId(id) {
  const out = [];
  while (id > 0) { out.unshift(id & 0xff); id = Math.floor(id / 256); }
  return out;
}

function encSize(n) {
  // Siempre 8 bytes: simple y suficiente para cualquier tamaño
  const out = [0x01];
  for (let k = 6; k >= 0; k--) out.push(Math.floor(n / 2 ** (8 * k)) & 0xff);
  return out;
}

function encUint(n) {
  const out = [];
  do { out.unshift(n & 0xff); n = Math.floor(n / 256); } while (n > 0);
  return out;
}

function element(id, data) {
  const head = Uint8Array.from([...encId(id), ...encSize(data.length)]);
  const out = new Uint8Array(head.length + data.length);
  out.set(head, 0);
  out.set(data, head.length);
  return out;
}

function concat(parts) {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function float64(v) {
  const a = new Uint8Array(8);
  new DataView(a.buffer).setFloat64(0, v);
  return a;
}

// Info con Duration (en unidades de TimecodeScale)
function infoWithDuration(b, info, duration) {
  const kids = children(b, info.dataStart, info.end).filter((c) => c.id !== ID.Duration).map((c) => b.subarray(c.start, c.end));
  kids.push(element(ID.Duration, float64(duration)));
  return element(ID.Info, concat(kids));
}

// ---------- Búfer circular de clips ----------
export class WebmClipBuffer {
  constructor({ keepMs = 30000, marginMs = 6000 } = {}) {
    this.keepMs = keepMs;
    this.marginMs = marginMs;
    this.buf = new Uint8Array(0);
    this.mode = 'top'; // 'top' | 'segment' | 'cluster'
    this.ebml = null;
    this.infoBytes = null; // Info original (bytes completos)
    this.tracksBytes = null;
    this.scale = 1_000_000; // ns por unidad (1 ms por omisión)
    this.videoTrack = null;
    this.clusterTc = 0;
    this.clusterEnd = -1; // offset absoluto del fin del cluster (o -1 si es de tamaño desconocido)
    this.consumed = 0; // bytes ya descartados del inicio de buf
    this.blocks = []; // { t, key, video, bytes, tcAt }
    this.broken = false;
  }

  get ready() {
    return !!(this.ebml && this.infoBytes && this.tracksBytes);
  }

  // Milisegundos guardados (aproximado)
  get spanMs() {
    if (this.blocks.length < 2) return 0;
    return ((this.blocks[this.blocks.length - 1].t - this.blocks[0].t) * this.scale) / 1e6;
  }

  push(chunk) {
    if (this.broken) return;
    const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const next = new Uint8Array(this.buf.length + u8.length);
    next.set(this.buf, 0);
    next.set(u8, this.buf.length);
    this.buf = next;
    try {
      this.parse();
    } catch (e) {
      this.broken = true;
      console.warn('webm: no se pudo leer', e);
    }
    this.prune();
  }

  parse() {
    const b = this.buf;
    let i = 0;
    for (;;) {
      if (this.mode === 'cluster' && this.clusterEnd >= 0 && this.consumed + i >= this.clusterEnd) this.mode = 'segment';
      const el = readElement(b, i);
      if (!el) break; // faltan bytes
      if (el.bad) throw new Error('vint inválido');
      if (this.mode === 'top') {
        if (el.id === ID.Segment) { this.mode = 'segment'; i = el.dataStart; continue; }
        if (el.end < 0 || el.end > b.length) break;
        if (el.id === ID.EBML) this.ebml = b.slice(el.start, el.end);
        i = el.end;
        continue;
      }
      if (this.mode === 'cluster' && LEVEL1.has(el.id)) this.mode = 'segment';
      if (this.mode === 'segment') {
        if (el.id === ID.Cluster) {
          this.mode = 'cluster';
          this.clusterEnd = el.end < 0 ? -1 : this.consumed + el.end;
          i = el.dataStart;
          continue;
        }
        if (el.end < 0 || el.end > b.length) break;
        if (el.id === ID.Info) this.readInfo(b, el);
        else if (el.id === ID.Tracks) this.readTracks(b, el);
        i = el.end;
        continue;
      }
      // Dentro de un cluster
      if (el.end < 0 || el.end > b.length) break;
      if (el.id === ID.Timecode) this.clusterTc = readUint(b, el.dataStart, el.end);
      else if (el.id === ID.SimpleBlock) this.addBlock(b, el, el.dataStart, null);
      else if (el.id === ID.BlockGroup) {
        const blk = children(b, el.dataStart, el.end).find((c) => c.id === ID.Block);
        if (blk) this.addBlock(b, el, blk.dataStart, blk);
      }
      i = el.end;
    }
    if (i > 0) {
      this.buf = b.slice(i);
      this.consumed += i;
    }
  }

  readInfo(b, el) {
    this.infoBytes = b.slice(el.start, el.end);
    const ts = children(b, el.dataStart, el.end).find((c) => c.id === ID.TimecodeScale);
    if (ts) this.scale = readUint(b, ts.dataStart, ts.end) || 1_000_000;
  }

  readTracks(b, el) {
    this.tracksBytes = b.slice(el.start, el.end);
    for (const te of children(b, el.dataStart, el.end)) {
      if (te.id !== ID.TrackEntry) continue;
      const kids = children(b, te.dataStart, te.end);
      const num = kids.find((c) => c.id === ID.TrackNumber);
      const type = kids.find((c) => c.id === ID.TrackType);
      if (num && type && readUint(b, type.dataStart, type.end) === 1) this.videoTrack = readUint(b, num.dataStart, num.end);
    }
  }

  // body: offset donde empieza el contenido del (Simple)Block
  addBlock(b, el, body, inner) {
    const tl = readSize(b, body); // número de pista (vint)
    if (!tl || tl.bad) return;
    const track = tl.size;
    const tcPos = body + tl.len;
    const rel = new DataView(b.buffer, b.byteOffset + tcPos, 2).getInt16(0);
    const flags = b[tcPos + 2];
    const video = track === this.videoTrack;
    const key = inner ? !children(b, el.dataStart, el.end).some((c) => c.id === 0xfb) : !!(flags & 0x80); // ReferenceBlock = no clave
    this.blocks.push({ t: this.clusterTc + rel, key, video, bytes: b.slice(el.start, el.end), tcAt: tcPos - el.start });
  }

  // Descarta lo viejo, pero conserva desde un cuadro clave anterior al corte
  prune() {
    const n = this.blocks.length;
    if (!n) return;
    const unit = this.scale / 1e6; // ms por unidad
    const cutoff = this.blocks[n - 1].t - (this.keepMs + this.marginMs) / unit;
    let keepFrom = 0;
    for (let k = 0; k < n; k++) {
      const bl = this.blocks[k];
      if (bl.t > cutoff) break;
      if (bl.video ? bl.key : this.videoTrack == null) keepFrom = k;
    }
    if (keepFrom > 0) this.blocks.splice(0, keepFrom);
  }

  // Arma un WebM reproducible con los últimos `ms` milisegundos
  build(ms = this.keepMs) {
    if (!this.ready || !this.blocks.length) return null;
    const unit = this.scale / 1e6;
    const blocks = this.blocks;
    const last = blocks[blocks.length - 1].t;
    const cutoff = last - ms / unit;
    const isStart = (bl) => (this.videoTrack == null ? true : bl.video && bl.key);
    let start = -1;
    for (let k = 0; k < blocks.length; k++) {
      if (!isStart(blocks[k])) continue;
      if (blocks[k].t <= cutoff || start < 0) start = k;
      if (blocks[k].t > cutoff) break;
    }
    if (start < 0) return null;
    const t0 = blocks[start].t;
    const parts = [];
    let cluster = null;
    const flush = () => {
      if (!cluster) return;
      parts.push(element(ID.Cluster, concat([element(ID.Timecode, Uint8Array.from(encUint(cluster.tc))), ...cluster.blocks])));
      cluster = null;
    };
    const maxRel = 30000 / unit; // el tiempo relativo de un bloque es int16
    for (let k = start; k < blocks.length; k++) {
      const bl = blocks[k];
      if (bl.t < t0) continue; // audio de antes del primer cuadro clave
      const t = bl.t - t0;
      if (!cluster || (bl.video && bl.key && t > cluster.tc) || t - cluster.tc > maxRel) {
        flush();
        cluster = { tc: t, blocks: [] };
      }
      const copy = bl.bytes.slice();
      new DataView(copy.buffer).setInt16(bl.tcAt, t - cluster.tc);
      cluster.blocks.push(copy);
    }
    flush();
    const durUnits = last - t0 + 33 / unit;
    const info = readElement(this.infoBytes, 0);
    const head = concat([
      this.ebml,
      Uint8Array.from(encId(ID.Segment)), UNKNOWN_SIZE,
      infoWithDuration(this.infoBytes, info, durUnits),
      this.tracksBytes,
    ]);
    return { parts: [head, ...parts], durationMs: durUnits * unit };
  }
}

// Agrega Duration a la cabecera de una grabación completa de MediaRecorder.
// Recibe los primeros bytes del archivo (deben incluir Info) y devuelve
// { head, skip }: escribir `head` y luego el archivo original desde `skip`.
// Devuelve null si el formato no es el esperado (se guarda tal cual).
export function durationPatch(bytes, durationMs) {
  const b = bytes;
  const ebml = readElement(b, 0);
  if (!ebml || ebml.bad || ebml.id !== ID.EBML || ebml.end < 0 || ebml.end > b.length) return null;
  const seg = readElement(b, ebml.end);
  if (!seg || seg.bad || seg.id !== ID.Segment) return null;
  let i = seg.dataStart;
  let scale = 1_000_000;
  for (;;) {
    const el = readElement(b, i);
    if (!el || el.bad || el.end < 0 || el.end > b.length) return null;
    if (el.id === ID.SeekHead || el.id === ID.Cluster) return null; // posiciones absolutas: no tocar
    if (el.id === ID.Info) {
      const ts = children(b, el.dataStart, el.end).find((c) => c.id === ID.TimecodeScale);
      if (ts) scale = readUint(b, ts.dataStart, ts.end) || scale;
      const info = infoWithDuration(b, el, durationMs / (scale / 1e6));
      const head = concat([b.subarray(0, ebml.end), Uint8Array.from(encId(ID.Segment)), UNKNOWN_SIZE, b.subarray(seg.dataStart, el.start), info]);
      return { head, skip: el.end };
    }
    i = el.end;
  }
}

// Recorre un WebM y resume su estructura (para pruebas)
export function inspectWebm(bytes) {
  const buf = new WebmClipBuffer({ keepMs: 1e12, marginMs: 0 });
  buf.push(bytes);
  const b = bytes;
  let duration = null;
  const ebml = readElement(b, 0);
  const seg = ebml && !ebml.bad ? readElement(b, ebml.end) : null;
  if (seg && !seg.bad) {
    const info = readElement(b, seg.dataStart);
    if (info && info.id === ID.Info) {
      const d = children(b, info.dataStart, info.end).find((c) => c.id === ID.Duration);
      if (d) duration = d.size === 8 ? new DataView(b.buffer, b.byteOffset + d.dataStart, 8).getFloat64(0) : new DataView(b.buffer, b.byteOffset + d.dataStart, 4).getFloat32(0);
    }
  }
  const v = buf.blocks.filter((x) => x.video);
  return {
    ready: buf.ready,
    scale: buf.scale,
    videoTrack: buf.videoTrack,
    blocks: buf.blocks.length,
    videoBlocks: v.length,
    keyframes: v.filter((x) => x.key).map((x) => x.t),
    firstT: buf.blocks[0]?.t ?? null,
    lastT: buf.blocks[buf.blocks.length - 1]?.t ?? null,
    duration,
  };
}
