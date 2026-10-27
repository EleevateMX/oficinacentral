// Quita la verificación en dos pasos de una cuenta (si alguien perdió su teléfono
// y no hay otro administrador). Uso: npm run reset-2fa -- <usuario>
import { db } from '../db.js';
import { audit } from '../security.js';

const username = process.argv[2];
if (!username) {
  console.error('Uso: npm run reset-2fa -- <usuario>');
  process.exit(1);
}
const u = db.prepare('SELECT id, display_name FROM users WHERE username = ?').get(username);
if (!u) {
  console.error(`No existe el usuario "${username}"`);
  process.exit(1);
}
db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_recovery = NULL, totp_last = -1 WHERE id = ?').run(u.id);
audit({ action: `Se quitó la verificación en dos pasos de ${u.display_name} desde la consola` });
console.log(`Listo: ${u.display_name} ya puede entrar solo con su contraseña.`);
