// Respaldos de la base de datos con "VACUUM INTO" (copia consistente sin detener la app).
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.env.DATA_DIR || path.resolve('data'), 'backups');
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

export function backupNow() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(BACKUP_DIR, `office-${stamp}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^office-.*\.db$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return file;
}

export function scheduleBackups() {
  const hours = Number(process.env.BACKUP_EVERY_HOURS ?? 24);
  if (!hours) return;
  const run = () => {
    try {
      console.log(`Respaldo creado: ${backupNow()}`);
    } catch (e) {
      console.error('No se pudo crear el respaldo:', e.message);
    }
  };
  setTimeout(run, 60e3).unref();
  setInterval(run, hours * 3600e3).unref();
}
