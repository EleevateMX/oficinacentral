// Respaldos de la base de datos con "VACUUM INTO" (copia consistente sin detener la app).
// Si BACKUP_S3_* está configurado, cada respaldo se comprime y se sube a un almacenamiento
// compatible con S3 (Cloudflare R2, AWS S3, Backblaze B2, MinIO). Ver server/backup-store.js.
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { backupDir, localKeep, BACKUP_RE, fmtSize, uploadBackup, writeStatus, s3Config, startServerLock } from './backup-store.js';

export { backupStatus, listLocalBackups, listRemoteBackups } from './backup-store.js';

// Crea el respaldo local y borra los locales que sobran. Devuelve la ruta del archivo.
export function backupNow() {
  const dir = backupDir();
  const startedAt = new Date().toISOString();
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Con milisegundos para que dos respaldos seguidos no choquen (VACUUM INTO no sobrescribe).
    const stamp = startedAt.replace(/[:.]/g, '-').slice(0, 23);
    const file = path.join(dir, `office-${stamp}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = fs.readdirSync(dir).filter((f) => BACKUP_RE.test(f)).sort();
    for (const f of old.slice(0, Math.max(0, old.length - localKeep()))) fs.unlinkSync(path.join(dir, f));
    writeStatus({ lastBackupAt: startedAt, ok: true, file: path.basename(file), size: fs.statSync(file).size, error: null });
    return file;
  } catch (e) {
    writeStatus({ lastBackupAt: startedAt, ok: false, error: e.message });
    throw e;
  }
}

// Respaldo local + subida fuera del servidor (si está configurada). Lanza error solo si falla el local;
// un fallo de la subida queda en el registro y en backupStatus(), sin tirar el servidor.
export async function runBackup({ log = console.log } = {}) {
  const file = backupNow();
  log(`Respaldo creado: ${file} (${fmtSize(fs.statSync(file).size)})`);
  const remote = s3Config() ? await uploadBackup(file, { log }) : null;
  return { file, remote };
}

export function scheduleBackups() {
  startServerLock(); // para que `npm run restore` sepa que el servidor está encendido
  const hours = Number(process.env.BACKUP_EVERY_HOURS ?? 24);
  if (!hours) return;
  const cfg = s3Config();
  console.log(cfg
    ? `Respaldos: cada ${hours} h, copia fuera del servidor en ${cfg.bucket}/${cfg.prefix} (se conservan ${cfg.keep}).`
    : `Respaldos: cada ${hours} h, solo en este servidor (${backupDir()}). Configura BACKUP_S3_* para guardar copias fuera.`);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runBackup();
    } catch (e) {
      console.error('No se pudo crear el respaldo:', e.message);
    } finally {
      running = false;
    }
  };
  setTimeout(run, 60e3).unref();
  setInterval(run, hours * 3600e3).unref();
}
