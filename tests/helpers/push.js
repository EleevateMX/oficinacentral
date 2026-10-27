// Servicio push falso para pruebas: un servidor HTTPS local (certificado propio)
// que hace las veces de FCM/Mozilla/Apple, más llaves de navegador y el descifrado
// del cuerpo (RFC 8291, aes128gcm) para comprobar lo que llegó.
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Certificado autofirmado para 127.0.0.1 (requiere openssl)
export function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuvora-push-cert-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
  ], { stdio: 'ignore' });
  return { dir, keyPath: key, certPath: cert, key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

// Servidor push falso. `status(req)` decide la respuesta (por omisión 201).
export async function startPushService(cert) {
  const requests = [];
  const waiters = [];
  let status = () => 201;
  const server = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const r = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) };
      requests.push(r);
      const code = status(r);
      res.writeHead(code);
      res.end();
      for (const w of waiters.splice(0)) w();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `https://127.0.0.1:${server.address().port}`;
  return {
    base,
    requests,
    setStatus(fn) { status = fn; },
    // Espera a que haya al menos n peticiones (o falla al vencer el tiempo)
    async waitFor(n, ms = 5000) {
      const end = Date.now() + ms;
      while (requests.length < n) {
        if (Date.now() > end) throw new Error(`Se esperaban ${n} avisos push y llegaron ${requests.length}`);
        await new Promise((r) => { waiters.push(r); setTimeout(r, 50); });
      }
      return requests;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

// Llaves como las que crea un navegador al suscribirse
export function browserKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, p256dh: b64u(ecdh.getPublicKey()), authB64: b64u(auth) };
}

export function subscription(base, keys, id = crypto.randomUUID()) {
  return { endpoint: `${base}/push/${id}`, keys: { p256dh: keys.p256dh, auth: keys.authB64 } };
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Descifra un cuerpo aes128gcm (RFC 8188 + RFC 8291) con las llaves del "navegador"
export function decrypt(body, keys) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const uaPublic = keys.ecdh.getPublicKey();
  const secret = keys.ecdh.computeSecret(asPublic);
  const prkKey = hmac(keys.auth, secret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  // Quitar el relleno: delimitador 0x02 seguido de ceros
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  return JSON.parse(plain.subarray(0, end).toString('utf8'));
}

// Lee el JWT de VAPID de la cabecera Authorization: "vapid t=<jwt>, k=<llave pública>"
export function parseVapid(header) {
  const m = /^vapid t=([^,]+),\s*k=(.+)$/.exec(header || '');
  if (!m) return null;
  const [h, p] = m[1].split('.');
  return { jwt: m[1], k: m[2], header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(p, 'base64url')) };
}
