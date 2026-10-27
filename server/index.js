import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { db, now } from './db.js';
import { hashPassword, defaultAvatar, randomToken } from './auth.js';
import { loadWorld } from './world.js';
import { api } from './api.js';
import { initRealtime } from './realtime.js';
import { scheduleBackups } from './backup.js';
import { alert, watchProcess } from './alerts.js';
import { startPushScheduler } from './push.js';

watchProcess();

const PORT = Number(process.env.PORT) || 3000;

loadWorld();

// Primer arranque: crear un administrador si no existe ninguno.
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || randomToken(12);
  db.prepare(`INSERT INTO users (username, email, display_name, password_hash, role, avatar, created_at)
    VALUES (?, ?, ?, ?, 'admin', ?, ?)`).run(username, process.env.ADMIN_EMAIL || '', process.env.ADMIN_NAME || 'Administrador', hashPassword(password), JSON.stringify(defaultAvatar(username)), now());
  console.log('\n================================================');
  console.log(' Se creó el primer administrador:');
  console.log(`   usuario:    ${username}`);
  console.log(`   contraseña: ${process.env.ADMIN_PASSWORD ? '(la de ADMIN_PASSWORD)' : password}`);
  console.log(' Cámbiala desde Preferencias > Cuenta.');
  console.log('================================================\n');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use('/api', api);

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, {
    index: false,
    maxAge: '1h',
    setHeaders(res, file) {
      const name = path.basename(file);
      // El service worker, el manifiesto y la página siempre se revisan (si no, las actualizaciones tardan en llegar)
      if (name === 'sw.js' || name === 'manifest.webmanifest' || name === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
        if (name === 'sw.js') res.setHeader('Service-Worker-Allowed', '/');
        if (name === 'manifest.webmanifest') res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      } else if (file.includes(`${path.sep}assets${path.sep}`)) {
        // Archivos con hash de Vite: no cambian nunca
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  app.get(/^(?!\/api|\/socket\.io).*/, (req, res) => res.sendFile('index.html', { root: dist }));
}

const server = http.createServer(app);
initRealtime(server);
scheduleBackups();
startPushScheduler();

// Cierre ordenado (docker stop)
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close();
    try { db.close(); } catch { /* ya cerrada */ }
    alert('La oficina se está apagando', `Señal ${sig} (actualización o reinicio)`, { level: 'warn', key: 'shutdown' })
      .finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

server.listen(PORT, () => {
  console.log(`Oficina lista en http://localhost:${PORT}`);
  alert('La oficina está en línea', `Puerto ${PORT} · Node ${process.version}`, { level: 'info', key: 'startup' });
});
