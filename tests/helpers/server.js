// Utilidades para pruebas: levanta un servidor real con una base de datos
// temporal y ofrece un cliente HTTP mínimo con su propia cookie de sesión.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ADMIN = { username: 'admin', password: 'admin1234' };

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Arranca `node server/index.js` en un puerto libre con un DATA_DIR nuevo.
// Las pruebas corren en paralelo: si otro proceso gana el puerto entre freePort() y el arranque
// (EADDRINUSE), se reintenta con otro puerto.
export async function startServer({ env = {}, timeoutMs = 15000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await startOnce({ env, timeoutMs }); } catch (e) {
      lastErr = e;
      if (!e.portInUse) throw e;
    }
  }
  throw lastErr;
}

async function startOnce({ env, timeoutMs }) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-test-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      ADMIN_USERNAME: ADMIN.username,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_NAME: 'Yamii',
      OFFICE_NAME: 'GTAHUB',
      BACKUP_EVERY_HOURS: '0',
      PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  const fail = (msg, portInUse = false) => {
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(dataDir, { recursive: true, force: true });
    return Object.assign(new Error(`${msg}:\n${output}`), { portInUse });
  };
  for (;;) {
    if (/EADDRINUSE/.test(output)) throw fail('El puerto ya estaba ocupado', true);
    if (child.exitCode !== null) throw fail(`El servidor terminó al arrancar (código ${child.exitCode})`);
    // Solo cuenta si NUESTRO proceso ya escucha (imprime "Oficina lista"); si no, la respuesta podría ser de otro
    if (/Oficina lista en/.test(output)) {
      try {
        // Tiempo límite por intento: si algo no contesta, no esperamos minutos
        const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) break;
      } catch { /* todavía no responde */ }
    }
    if (Date.now() > deadline) throw fail('El servidor no respondió a tiempo');
    await new Promise((r) => setTimeout(r, 100));
  }

  async function stop() {
    if (child.exitCode === null) {
      const exited = new Promise((r) => child.once('exit', r));
      child.kill('SIGTERM');
      const t = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(t);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { url, port, dataDir, child, stop, output: () => output };
}

// Cliente con "tarro" de cookies de una sola sesión.
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.user = null;
  }

  async request(method, p, body) {
    const headers = {};
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${this.base}/api${p}`, {
      method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (v) this.cookies.set(k, v); else this.cookies.delete(k);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  }

  get(p) { return this.request('GET', p); }
  post(p, body = {}) { return this.request('POST', p, body); }
  patch(p, body = {}) { return this.request('PATCH', p, body); }
  put(p, body = {}) { return this.request('PUT', p, body); }
  del(p) { return this.request('DELETE', p); }

  async login(username, password) {
    const r = await this.post('/auth/login', { username, password });
    if (r.status === 200) this.user = r.data.user;
    return r;
  }
}

export async function adminClient(base) {
  const c = new Client(base);
  const r = await c.login(ADMIN.username, ADMIN.password);
  if (r.status !== 200) throw new Error(`No se pudo entrar como admin: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}

let seq = 0;
// Crea un miembro nuevo con una invitación del admin y devuelve su cliente ya con sesión.
export async function createMember(base, admin, name) {
  const inv = await admin.post('/admin/invites', {});
  if (inv.status !== 200) throw new Error(`No se pudo crear la invitación: ${inv.status} ${JSON.stringify(inv.data)}`);
  const username = `${name || 'user'}${++seq}`.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24);
  const c = new Client(base);
  const r = await c.post(`/invites/${inv.data.invite.token}/accept`, {
    displayName: name || username, username, password: 'secreto123',
  });
  if (r.status !== 200) throw new Error(`No se pudo aceptar la invitación: ${r.status} ${JSON.stringify(r.data)}`);
  c.user = r.data.user;
  return c;
}
