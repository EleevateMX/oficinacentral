// Uso:
//   npm run backup              crea un respaldo ahora (y lo sube a S3/R2 si está configurado)
//   npm run backup -- --list    lista los respaldos locales y remotos
const args = process.argv.slice(2);

if (args.includes('--list') || args.includes('-l')) {
  // No abre la base de datos: solo lista archivos.
  const {
    listLocalBackups, listRemoteBackups, listLocalUploads, listRemoteUploads, s3Config, backupDir, uploadDir, fmtSize, backupStatus,
  } = await import('../backup-store.js');
  const local = listLocalBackups();
  console.log(`Respaldos locales en ${backupDir()} (${local.length}):`);
  if (!local.length) console.log('  (ninguno)');
  for (const b of local) console.log(`  ${b.name.padEnd(42)} ${fmtSize(b.size).padStart(10)}   ${b.mtime}`);

  const cfg = s3Config();
  let failed = false;
  if (!cfg) {
    console.log('\nRespaldos remotos: desactivados (faltan BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY o BACKUP_S3_SECRET_KEY).');
    console.log(`Adjuntos del chat: ${listLocalUploads().length} en ${uploadDir()} (solo en este servidor).`);
  } else {
    try {
      const remote = await listRemoteBackups({ ...cfg, retries: 1 });
      console.log(`\nRespaldos remotos en ${cfg.bucket}/${cfg.prefix} (${remote.length}, se conservan ${cfg.keep}):`);
      if (!remote.length) console.log('  (ninguno)');
      for (const o of remote) console.log(`  s3:${o.key.padEnd(48)} ${fmtSize(o.size).padStart(10)}   ${o.lastModified || ''}`);
      const up = await listRemoteUploads({ ...cfg, retries: 1 });
      const bytes = up.reduce((n, o) => n + o.size, 0);
      console.log(`\nAdjuntos del chat: ${listLocalUploads().length} en ${uploadDir()}, ${up.length} en ${cfg.bucket}/${cfg.prefix}uploads/ (${fmtSize(bytes)}).`);
    } catch (e) {
      failed = true;
      console.error(`\nNo se pudieron listar los respaldos remotos de ${cfg.bucket}: ${e.message}`);
    }
  }
  const st = backupStatus();
  if (st.lastBackupAt) {
    console.log(`\nÚltimo respaldo: ${st.lastBackupAt} ${st.ok ? 'correcto' : `con error: ${st.error}`}`);
    if (st.offsite.enabled) {
      console.log(`Última subida: ${st.offsite.status === 'ok' ? `correcta (${st.offsite.uploadedAt})` : `${st.offsite.status}${st.offsite.error ? `: ${st.offsite.error}` : ''}`}`);
    }
  }
  console.log('\nPara restaurar: npm run restore -- <archivo.db | archivo.db.gz | s3:clave | --latest>');
  process.exit(failed ? 1 : 0);
} else {
  const { runBackup } = await import('../backup.js');
  try {
    const { remote } = await runBackup();
    if (remote && !remote.ok) process.exit(2);
  } catch (e) {
    console.error('No se pudo crear el respaldo:', e.message);
    process.exit(1);
  }
}
