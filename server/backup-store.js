// Piezas de los respaldos que NO abren la base de datos: rutas, lista de respaldos locales y remotos,
// subida a S3/R2 con limpieza de copias viejas, estado del último respaldo y el candado del servidor.
// El comando de restauración usa este módulo sin tocar office.db mientras la reemplaza.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { S3Client, s3ConfigFromEnv } from './s3.js';

const gzip = promisify(zlib.gzip);

export const dataDir = () => process.env.DATA_DIR || path.resolve('data');
export const backupDir = () => process.env.BACKUP_DIR || path.join(dataDir(), 'backups');
export const dbPath = () => path.join(dataDir(), 'office.db');
// Adjuntos del chat: un archivo por subida (nombre = id aleatorio), igual que server/files.js.
export const uploadDir = () => process.env.UPLOAD_DIR || path.join(dataDir(), 'uploads');
export const localKeep = () => Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
export const s3Config = () => s3ConfigFromEnv(process.env);

export const BACKUP_RE = /^office-.*\.db$/;
export const REMOTE_RE = /^office-[^/]*\.db\.gz$/;
// Id de adjunto aceptable como nombre de archivo (evita rutas tipo ../)
export const UPLOAD_ID_RE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/;
export const remoteUploadPrefix = (config) => `${config.prefix}uploads/`;

export const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

// Respaldos locales, del más viejo al más nuevo.
export function listLocalBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => BACKUP_RE.test(f)).sort().map((name) => {
    const st = fs.statSync(path.join(dir, name));
    return { name, path: path.join(dir, name), size: st.size, mtime: st.mtime.toISOString() };
  });
}

export function s3Client(config = s3Config(), log = (m) => console.warn(`[respaldo] ${m}`)) {
  return config ? new S3Client(config, { log }) : null;
}

// Respaldos remotos de Nuvora bajo el prefijo, del más viejo al más nuevo (por nombre = fecha).
export async function listRemoteBackups(config = s3Config()) {
  if (!config) return [];
  const all = await s3Client(config).listObjects(config.prefix);
  // Solo los que están directamente bajo el prefijo (no los adjuntos de <prefijo>uploads/)
  return all.filter((o) => o.key.startsWith(config.prefix) && REMOTE_RE.test(o.key.slice(config.prefix.length)))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// ---------- Estado del último respaldo (para el panel de administración) ----------

const statusFile = () => path.join(backupDir(), 'estado.json');

const EMPTY_STATUS = {
  lastBackupAt: null, // ISO del último intento de respaldo
  ok: null, // true si el respaldo local se creó bien
  file: null, // nombre del archivo local
  size: null, // bytes del archivo local
  error: null, // mensaje si falló el respaldo local
  offsite: {
    enabled: false,
    status: 'disabled', // 'disabled' | 'pending' | 'ok' | 'error'
    key: null, // clave del objeto en el bucket
    size: null, // bytes subidos (comprimido)
    uploadedAt: null, // ISO de la última subida correcta
    attempts: null,
    error: null,
    pruned: 0, // copias viejas borradas en el último respaldo
    uploads: null, // adjuntos: { local, remote, uploaded, error, syncedAt }
  },
};

function readStatusFile() {
  try {
    return JSON.parse(fs.readFileSync(statusFile(), 'utf8'));
  } catch {
    return null;
  }
}

export function writeStatus(patch) {
  const cur = readStatusFile() || structuredClone(EMPTY_STATUS);
  const next = { ...cur, ...patch, offsite: { ...EMPTY_STATUS.offsite, ...cur.offsite, ...(patch.offsite || {}) } };
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
    const tmp = `${statusFile()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, statusFile());
  } catch (e) {
    console.error('[respaldo] No se pudo guardar el estado del respaldo:', e.message);
  }
  return next;
}

/**
 * Estado del último respaldo. Lee `$BACKUP_DIR/estado.json` (lo escriben el servidor y `npm run backup`).
 * Pensado para mostrarse en el panel de administración. Nunca lanza error.
 */
export function backupStatus() {
  const cur = readStatusFile() || structuredClone(EMPTY_STATUS);
  const cfg = s3Config();
  const offsite = { ...EMPTY_STATUS.offsite, ...cur.offsite, enabled: !!cfg };
  if (!cfg) offsite.status = 'disabled';
  else if (offsite.status === 'disabled') offsite.status = 'pending';
  return {
    ...EMPTY_STATUS,
    ...cur,
    offsite: { ...offsite, bucket: cfg?.bucket ?? null, prefix: cfg?.prefix ?? null, keep: cfg?.keep ?? null },
    localCount: listLocalBackups().length,
    localKeep: localKeep(),
  };
}

// ---------- Subida fuera del servidor ----------

// Comprime el respaldo local, lo sube y borra las copias remotas más viejas que BACKUP_S3_KEEP.
// Nunca lanza error: devuelve { ok, key, size, pruned, error } y lo deja en el estado.
export async function uploadBackup(file, { config = s3Config(), log = console.log } = {}) {
  if (!config) return { ok: false, skipped: true };
  const client = s3Client(config, (m) => log(`[respaldo] ${m}`));
  const key = `${config.prefix}${path.basename(file)}.gz`;
  writeStatus({ offsite: { enabled: true, status: 'pending', key, error: null, attempts: null } });
  let body;
  try {
    body = await gzip(fs.readFileSync(file), { level: 9 });
    await client.putObject(key, body, 'application/gzip');
  } catch (e) {
    const msg = e.message || String(e);
    console.error(`[respaldo] ERROR: no se pudo subir el respaldo a ${config.bucket} (${key}): ${msg}. `
      + 'El respaldo local sigue en el servidor; se volverá a intentar en el próximo respaldo.');
    writeStatus({ offsite: { status: 'error', key, error: msg, attempts: e.attempts ?? null } });
    return { ok: false, key, error: msg };
  }
  log(`[respaldo] Subido fuera del servidor: ${config.bucket}/${key} (${fmtSize(body.length)})`);
  const uploads = await syncUploads({ config, client, log });
  let pruned = 0;
  let pruneError = null;
  try {
    const remote = await listRemoteBackups(config);
    const old = remote.slice(0, Math.max(0, remote.length - config.keep));
    for (const o of old) {
      await client.deleteObject(o.key);
      pruned++;
    }
    if (pruned) log(`[respaldo] Se borraron ${pruned} respaldo(s) remoto(s) antiguo(s); se conservan ${config.keep}.`);
  } catch (e) {
    pruneError = e.message || String(e);
    console.error(`[respaldo] AVISO: el respaldo se subió, pero no se pudieron borrar las copias viejas: ${pruneError}`);
  }
  writeStatus({
    offsite: {
      status: 'ok', key, size: body.length, uploadedAt: new Date().toISOString(), attempts: null,
      error: pruneError ? `Limpieza de copias viejas: ${pruneError}` : null, pruned, uploads,
    },
  });
  return { ok: true, key, size: body.length, pruned, pruneError, uploads };
}

// ---------- Adjuntos del chat ----------
// Cada archivo de $DATA_DIR/uploads se sube UNA vez a <prefijo>uploads/<id>: se listan los que ya
// están en el bucket (ListObjectsV2) y solo se suben los que faltan. Los adjuntos no se borran del
// bucket (no se podan con BACKUP_S3_KEEP) para que cualquier respaldo de la base los encuentre.

export function listLocalUploads() {
  const dir = uploadDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && UPLOAD_ID_RE.test(d.name) && !d.name.endsWith('.tmp'))
    .map((d) => d.name)
    .sort();
}

export async function listRemoteUploads(config, client = s3Client(config)) {
  const pre = remoteUploadPrefix(config);
  return (await client.listObjects(pre))
    .map((o) => ({ ...o, id: o.key.slice(pre.length) }))
    .filter((o) => UPLOAD_ID_RE.test(o.id));
}

// Nunca lanza error. Devuelve { local, remote, uploaded, error, syncedAt }.
export async function syncUploads({ config = s3Config(), client = s3Client(config), log = console.log } = {}) {
  const local = listLocalUploads();
  const result = { local: local.length, remote: null, uploaded: 0, error: null, syncedAt: new Date().toISOString() };
  if (!config || !local.length) return result;
  try {
    const remote = new Set((await listRemoteUploads(config, client)).map((o) => o.id));
    const missing = local.filter((id) => !remote.has(id));
    for (const id of missing) {
      let data;
      try {
        data = fs.readFileSync(path.join(uploadDir(), id));
      } catch { continue; } // lo borraron mientras tanto
      await client.putObject(remoteUploadPrefix(config) + id, data, 'application/octet-stream');
      result.uploaded++;
    }
    result.remote = remote.size + result.uploaded;
    if (result.uploaded) log(`[respaldo] Adjuntos: se subieron ${result.uploaded} nuevo(s); ${result.remote} en total fuera del servidor.`);
  } catch (e) {
    result.error = e.message || String(e);
    console.error(`[respaldo] ERROR: no se pudieron subir los adjuntos del chat (${result.uploaded} subidos antes del fallo): ${result.error}. Se reintentará en el próximo respaldo.`);
  }
  return result;
}

// Descarga los adjuntos que estén en el bucket y falten en $DATA_DIR/uploads. Lanza error si falla.
export async function downloadMissingUploads({ config = s3Config(), log = console.log } = {}) {
  const client = s3Client(config, (m) => log(`  ${m}`));
  const dir = uploadDir();
  fs.mkdirSync(dir, { recursive: true });
  const have = new Set(listLocalUploads());
  const remote = await listRemoteUploads(config, client);
  let downloaded = 0;
  for (const o of remote) {
    if (have.has(o.id)) continue;
    const data = await client.getObject(o.key);
    const tmp = path.join(dir, `${o.id}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, path.join(dir, o.id));
    downloaded++;
  }
  return { remote: remote.length, downloaded, local: have.size + downloaded };
}

// ---------- Candado del servidor ----------
// El servidor escribe $DATA_DIR/servidor.lock y lo renueva cada 30 s; lo borra al apagarse.
// `npm run restore` se niega a correr si el candado es reciente (además de probar /api/health).

const lockFile = () => path.join(dataDir(), 'servidor.lock');
export const LOCK_STALE_MS = 2 * 60e3;

export function startServerLock() {
  const file = lockFile();
  const info = { pid: process.pid, hostname: os.hostname(), port: Number(process.env.PORT) || 3000, startedAt: new Date().toISOString() };
  const write = () => {
    try {
      fs.writeFileSync(file, JSON.stringify({ ...info, updatedAt: new Date().toISOString() }));
    } catch { /* sin permiso de escritura: el chequeo por /api/health sigue funcionando */ }
  };
  write();
  setInterval(write, 30e3).unref();
  process.on('exit', () => {
    try {
      const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (cur.pid === process.pid && cur.hostname === info.hostname) fs.unlinkSync(file);
    } catch { /* ya no existe */ }
  });
}

// Devuelve la info del candado si un servidor parece estar usando esta carpeta de datos.
export function activeServerLock() {
  let cur;
  try {
    cur = JSON.parse(fs.readFileSync(lockFile(), 'utf8'));
  } catch {
    return null;
  }
  if (Date.now() - Date.parse(cur.updatedAt) > LOCK_STALE_MS) return null;
  if (cur.hostname === os.hostname()) {
    try {
      process.kill(cur.pid, 0);
    } catch (e) {
      if (e.code === 'ESRCH') return null; // el proceso ya no existe
    }
  }
  return cur;
}
