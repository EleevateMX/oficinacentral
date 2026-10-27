// Restaura la base de datos desde un respaldo.
// Uso:
//   npm run restore -- data/backups/office-2026-01-31T03-00-00-000.db
//   npm run restore -- office-2026-01-31T03-00-00-000.db.gz        (también busca en la carpeta de respaldos)
//   npm run restore -- s3:nuvora/office-2026-01-31T03-00-00-000.db.gz
//   npm run restore -- --latest      (el más reciente del bucket si BACKUP_S3_* está configurado; si no, el local)
//   Agrega --force para restaurar aunque el servidor parezca encendido (no recomendado).
//   Con BACKUP_S3_* configurado, también descarga los adjuntos del chat que falten en $DATA_DIR/uploads
//   (--sin-adjuntos para omitirlo).
//
// Antes de reemplazar nada: comprueba que el servidor esté apagado, verifica el respaldo con
// PRAGMA integrity_check y guarda la base actual como office.db.antes-de-restaurar-<fecha>.
// Este comando NO importa server/db.js: no abre ni crea office.db por su cuenta.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import {
  dataDir, dbPath, backupDir, uploadDir, s3Config, s3Client, listLocalBackups, listRemoteBackups, activeServerLock, fmtSize,
  downloadMissingUploads,
} from '../backup-store.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const latest = args.includes('--latest');
const skipUploads = args.includes('--sin-adjuntos');
const source = args.find((a) => !a.startsWith('--'));

const fail = (msg, code = 1) => {
  console.error(`\n✖ ${msg}`);
  process.exit(code);
};

if (!source && !latest) {
  fail('Falta indicar qué respaldo restaurar.\n'
    + '  Uso: npm run restore -- <archivo .db o .db.gz | s3:clave | --latest> [--force]\n'
    + '  Para ver los respaldos disponibles: npm run backup -- --list');
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const DB = dbPath();
console.log(`Carpeta de datos: ${dataDir()}`);

// ---------- 1. ¿Está encendido el servidor? ----------
async function serverRunning() {
  const reasons = [];
  const lock = activeServerLock();
  if (lock) reasons.push(`hay un servidor usando esta carpeta (pid ${lock.pid} en ${lock.hostname}, puerto ${lock.port}, visto ${lock.updatedAt})`);
  const port = Number(process.env.PORT) || 3000;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) reasons.push(`la app responde en http://127.0.0.1:${port}/api/health`);
  } catch { /* nadie escucha: bien */ }
  return reasons;
}

const running = await serverRunning();
if (running.length) {
  if (!force) {
    fail(`El servidor parece estar encendido: ${running.join('; ')}.\n`
      + '  Apágalo antes de restaurar (Docker: docker compose stop app) y vuelve a intentarlo.\n'
      + '  Si estás seguro de que no lo está, o lo vas a reiniciar justo después, agrega --force.');
  }
  console.warn(`⚠ El servidor parece estar encendido (${running.join('; ')}), pero se usó --force.`);
}

// ---------- 2. Conseguir el respaldo ----------
const tmp = path.join(dataDir(), `office.db.restaurando-${stamp()}`);
const cleanup = () => { for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`, `${tmp}-journal`]) fs.rmSync(f, { force: true }); };

async function fetchBackup() {
  const cfg = s3Config();
  let name;
  let data;
  if (latest || source.startsWith('s3:')) {
    let key = latest ? null : source.slice(3);
    if (latest) {
      if (cfg) {
        console.log(`Buscando el respaldo más reciente en ${cfg.bucket}/${cfg.prefix}…`);
        const remote = await listRemoteBackups(cfg);
        if (!remote.length) fail(`No hay respaldos en ${cfg.bucket}/${cfg.prefix}.`);
        key = remote.at(-1).key;
      } else {
        const local = listLocalBackups();
        if (!local.length) fail(`No hay respaldos locales en ${backupDir()} y BACKUP_S3_* no está configurado.`);
        name = local.at(-1).path;
        console.log(`BACKUP_S3_* no está configurado: se usa el respaldo local más reciente.`);
      }
    }
    if (key !== null) {
      if (!cfg) fail('Para restaurar desde s3: hay que configurar BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY y BACKUP_S3_SECRET_KEY.');
      if (!key.includes('/') && cfg.prefix) key = cfg.prefix + key;
      console.log(`Descargando s3:${key} de ${cfg.bucket}…`);
      try {
        data = await s3Client(cfg).getObject(key);
      } catch (e) {
        fail(`No se pudo descargar ${key}: ${e.message}`);
      }
      name = `s3:${key}`;
      console.log(`  descargado (${fmtSize(data.length)})`);
    }
  } else {
    name = path.resolve(source);
    if (!fs.existsSync(name) && fs.existsSync(path.join(backupDir(), source))) name = path.join(backupDir(), source);
    if (!fs.existsSync(name)) fail(`No existe el archivo ${source} (tampoco en ${backupDir()}).`);
  }
  if (!data) data = fs.readFileSync(name);
  if (data[0] === 0x1f && data[1] === 0x8b) {
    try {
      data = zlib.gunzipSync(data);
    } catch (e) {
      fail(`El archivo ${name} parece comprimido pero no se pudo descomprimir: ${e.message}`);
    }
  }
  if (data.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0') fail(`${name} no es una base de datos SQLite.`);
  fs.writeFileSync(tmp, data);
  return name;
}

const from = await fetchBackup();
console.log(`Respaldo elegido: ${from}`);

// ---------- 3. Verificarlo ----------
try {
  const check = new DatabaseSync(tmp);
  try {
    const rows = check.prepare('PRAGMA integrity_check').all().map((r) => Object.values(r)[0]);
    if (rows.length !== 1 || rows[0] !== 'ok') throw new Error(`integrity_check: ${rows.slice(0, 5).join('; ')}`);
    const hasUsers = check.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    if (!hasUsers) throw new Error('no tiene la tabla de usuarios; no parece un respaldo de Nuvora');
    const users = check.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    console.log(`✔ Respaldo verificado (PRAGMA integrity_check = ok, ${users} usuario(s)).`);
  } finally {
    check.close();
  }
} catch (e) {
  cleanup();
  fail(`El respaldo está dañado o no es válido: ${e.message}\n  No se cambió nada en la base actual.`);
}

// ---------- 4. Guardar la base actual aparte ----------
if (fs.existsSync(DB)) {
  const aside = `${DB}.antes-de-restaurar-${stamp()}`;
  try {
    // Copia consistente que incluye lo que esté en office.db-wal
    const cur = new DatabaseSync(DB);
    try {
      cur.exec(`VACUUM INTO '${aside.replace(/'/g, "''")}'`);
    } finally {
      cur.close();
    }
  } catch (e) {
    // La base actual puede estar dañada (quizá por eso se restaura): copiar los archivos tal cual.
    console.warn(`  No se pudo copiar la base actual con SQLite (${e.message}); se copian los archivos tal cual.`);
    fs.rmSync(aside, { force: true });
    fs.copyFileSync(DB, aside);
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(DB + ext)) fs.copyFileSync(DB + ext, aside + ext);
  }
  console.log(`✔ Base actual guardada aparte en ${aside}`);
} else {
  console.log('  No había base actual; se crea una nueva desde el respaldo.');
}

// ---------- 5. Reemplazar ----------
// El -wal y el -shm viejos pertenecen a la base anterior: si quedaran, SQLite los aplicaría a la nueva.
for (const ext of ['-wal', '-shm', '-journal']) fs.rmSync(DB + ext, { force: true });
fs.renameSync(tmp, DB);
cleanup();
console.log(`\n✔ Base de datos restaurada en ${DB} desde ${from}.`);

// ---------- 6. Adjuntos del chat ----------
let uploadsFailed = false;
const cfgUploads = s3Config();
if (cfgUploads && !skipUploads) {
  console.log(`Buscando adjuntos del chat que falten en ${uploadDir()}…`);
  try {
    const r = await downloadMissingUploads({ config: cfgUploads });
    console.log(`✔ Adjuntos: se descargaron ${r.downloaded} de ${r.remote} guardados fuera del servidor (${r.local} en la carpeta).`);
  } catch (e) {
    uploadsFailed = true;
    console.error(`⚠ La base quedó restaurada, pero no se pudieron descargar los adjuntos: ${e.message}\n`
      + '  Vuelve a correr el mismo comando más tarde: solo baja los que falten.');
  }
} else if (!cfgUploads) {
  console.log(`  Adjuntos del chat: BACKUP_S3_* no está configurado; se usan los que ya estén en ${uploadDir()}.`);
}
if (running.length) console.log('⚠ Reinicia el servidor AHORA: lo que guarde hasta que se reinicie se perderá.');
else console.log('  Ya puedes encender la app (Docker: docker compose start app).');
if (uploadsFailed) process.exitCode = 3;
