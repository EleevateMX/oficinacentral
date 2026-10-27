// Versión de la app (cambia con cada build): sirve para avisar a quien tenga una versión vieja abierta.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let version = 'dev';
try {
  version = crypto.createHash('sha1').update(fs.readFileSync(path.resolve('dist', 'index.html'))).digest('hex').slice(0, 10);
} catch { /* sin build (pruebas o desarrollo) */ }
export const APP_VERSION = version;
