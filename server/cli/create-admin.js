// Uso: npm run create-admin -- <usuario> <contraseña> ["Nombre visible"]
import { db, now } from '../db.js';
import { hashPassword, defaultAvatar, validateNewAccount } from '../auth.js';

const [username, password, displayName = username] = process.argv.slice(2);
const err = validateNewAccount({ username, password, displayName });
if (err) {
  console.error(err);
  console.error('Uso: npm run create-admin -- <usuario> <contraseña> ["Nombre visible"]');
  process.exit(1);
}
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  db.prepare("UPDATE users SET role = 'admin', disabled = 0, password_hash = ? WHERE id = ?").run(hashPassword(password), existing.id);
  console.log(`El usuario "${username}" ahora es administrador (contraseña actualizada).`);
} else {
  db.prepare(`INSERT INTO users (username, display_name, password_hash, role, avatar, created_at) VALUES (?, ?, ?, 'admin', ?, ?)`)
    .run(username, displayName, hashPassword(password), JSON.stringify(defaultAvatar(username)), now());
  console.log(`Administrador "${username}" creado.`);
}
