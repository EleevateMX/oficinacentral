// Arranque en contenedores: los discos de Railway, Render y otros hostings se
// montan como root. Si arrancamos como root, se le da la carpeta de datos al
// usuario "node" y se bajan los privilegios antes de cargar la app.
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.DATA_DIR || path.resolve('data');

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  const uid = Number(process.env.RUN_UID || 1000);
  const gid = Number(process.env.RUN_GID || 1000);
  fs.mkdirSync(DATA, { recursive: true });
  const own = (p) => {
    try { fs.lchownSync(p, uid, gid); } catch (e) { console.warn(`Aviso: no se pudo cambiar el dueño de ${p}: ${e.message}`); }
    let st;
    try { st = fs.lstatSync(p); } catch { return; }
    if (st.isDirectory()) for (const f of fs.readdirSync(p)) own(path.join(p, f));
  };
  own(DATA);
  process.setgid(gid);
  process.setuid(uid);
}

await import('./index.js');
