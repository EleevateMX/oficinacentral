// Respaldos: firma AWS SigV4 (vectores oficiales), subida a un S3 falso que verifica la firma,
// limpieza de copias viejas, reintentos, fallos sin tirar el servidor y restauración.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import {
  sign, canonicalRequest, stringToSign, signingKey, signature, sha256Hex, uriEncode, amzDate, EMPTY_SHA256, s3ConfigFromEnv,
} from '../server/s3.js';
import { ROOT, freePort, startServer, adminClient, ADMIN } from './helpers/server.js';

// ---------------------------------------------------------------------------
// 1. Firma SigV4 contra los ejemplos publicados por AWS
// ---------------------------------------------------------------------------

describe('Firma AWS Signature V4', () => {
  // aws-sig-v4-test-suite: "get-vanilla"
  test('get-vanilla (suite oficial de pruebas de SigV4)', () => {
    const r = sign({
      method: 'GET', path: '/', query: {},
      headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: EMPTY_SHA256,
      accessKey: 'AKIDEXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1', service: 'service', date: '20150830T123600Z',
    });
    assert.equal(r.canonicalRequest, [
      'GET', '/', '', 'host:example.amazonaws.com', 'x-amz-date:20150830T123600Z', '', 'host;x-amz-date',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ].join('\n'));
    assert.equal(r.stringToSign, [
      'AWS4-HMAC-SHA256', '20150830T123600Z', '20150830/us-east-1/service/aws4_request',
      'bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63',
    ].join('\n'));
    assert.equal(r.signature, '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
    assert.equal(r.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, '
      + 'SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });

  // Ejemplos de la documentación de S3 ("Signature Calculations for the Authorization Header").
  const S3 = {
    accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1', service: 's3', date: '20130524T000000Z',
  };
  const host = 'examplebucket.s3.amazonaws.com';

  test('S3: GET Object con Range', () => {
    const r = sign({
      ...S3, method: 'GET', path: '/test.txt',
      headers: { host, range: 'bytes=0-9', 'x-amz-content-sha256': EMPTY_SHA256, 'x-amz-date': S3.date },
      payloadHash: EMPTY_SHA256,
    });
    assert.equal(r.canonicalRequest, [
      'GET', '/test.txt', '',
      `host:${host}`, 'range:bytes=0-9', `x-amz-content-sha256:${EMPTY_SHA256}`, 'x-amz-date:20130524T000000Z', '',
      'host;range;x-amz-content-sha256;x-amz-date', EMPTY_SHA256,
    ].join('\n'));
    assert.equal(r.stringToSign, [
      'AWS4-HMAC-SHA256', '20130524T000000Z', '20130524/us-east-1/s3/aws4_request',
      '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972',
    ].join('\n'));
    assert.equal(r.signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  });

  test('S3: PUT Object (clave con $ y encabezado extra)', () => {
    const payloadHash = sha256Hex('Welcome to Amazon S3.');
    assert.equal(payloadHash, '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
    const r = sign({
      ...S3, method: 'PUT', path: '/' + uriEncode('test$file.text', { keepSlash: true }),
      headers: {
        date: 'Fri, 24 May 2013 00:00:00 GMT', host, 'x-amz-content-sha256': payloadHash,
        'x-amz-date': S3.date, 'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      payloadHash,
    });
    assert.equal(r.canonicalRequest, [
      'PUT', '/test%24file.text', '',
      'date:Fri, 24 May 2013 00:00:00 GMT', `host:${host}`, `x-amz-content-sha256:${payloadHash}`,
      'x-amz-date:20130524T000000Z', 'x-amz-storage-class:REDUCED_REDUNDANCY', '',
      'date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class', payloadHash,
    ].join('\n'));
    assert.equal(r.signature, '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  });

  test('S3: GET Bucket lifecycle (parámetro sin valor)', () => {
    const r = sign({
      ...S3, method: 'GET', path: '/', query: { lifecycle: '' },
      headers: { host, 'x-amz-content-sha256': EMPTY_SHA256, 'x-amz-date': S3.date }, payloadHash: EMPTY_SHA256,
    });
    assert.match(r.canonicalRequest, /^GET\n\/\nlifecycle=\n/);
    assert.equal(r.signature, 'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543');
  });

  test('S3: List Objects (parámetros ordenados)', () => {
    const r = sign({
      ...S3, method: 'GET', path: '/', query: { prefix: 'J', 'max-keys': '2' },
      headers: { host, 'x-amz-content-sha256': EMPTY_SHA256, 'x-amz-date': S3.date }, payloadHash: EMPTY_SHA256,
    });
    assert.match(r.canonicalRequest, /^GET\n\/\nmax-keys=2&prefix=J\n/);
    assert.equal(r.signature, '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
  });

  test('codificación URI y fecha', () => {
    assert.equal(uriEncode("a b+c/d*e~f!'()", { keepSlash: true }), 'a%20b%2Bc/d%2Ae~f%21%27%28%29');
    assert.equal(uriEncode('nuvora/x'), 'nuvora%2Fx');
    assert.equal(uriEncode('ñ'), '%C3%B1');
    assert.equal(amzDate(new Date('2013-05-24T00:00:00.123Z')), '20130524T000000Z');
  });

  test('configuración: apagada si falta algo, valores por defecto', () => {
    assert.equal(s3ConfigFromEnv({}), null);
    assert.equal(s3ConfigFromEnv({ BACKUP_S3_ENDPOINT: 'https://x', BACKUP_S3_BUCKET: 'b', BACKUP_S3_ACCESS_KEY: 'k' }), null);
    const c = s3ConfigFromEnv({
      BACKUP_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com/', BACKUP_S3_BUCKET: 'b',
      BACKUP_S3_ACCESS_KEY: 'k', BACKUP_S3_SECRET_KEY: 's',
    });
    assert.equal(c.endpoint, 'https://acc.r2.cloudflarestorage.com');
    assert.equal(c.region, 'auto');
    assert.equal(c.prefix, 'nuvora/');
    assert.equal(c.keep, 30);
    const base = { BACKUP_S3_ENDPOINT: 'h', BACKUP_S3_BUCKET: 'b', BACKUP_S3_ACCESS_KEY: 'k', BACKUP_S3_SECRET_KEY: 's' };
    assert.equal(s3ConfigFromEnv({ ...base, BACKUP_S3_PREFIX: 'otra' }).prefix, 'otra/');
    assert.equal(s3ConfigFromEnv({ ...base, BACKUP_S3_KEEP: '7', BACKUP_S3_REGION: 'us-east-1' }).keep, 7);
  });
});

// ---------------------------------------------------------------------------
// 2. S3 falso en memoria que verifica la firma de cada petición
// ---------------------------------------------------------------------------

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fakeS3({ bucket, accessKey, secretKey, region, maxKeys = 2 }) {
  const objects = new Map(); // clave -> { body, lastModified }
  const requests = []; // { method, path, status }
  const state = { failNext: 0, objects, requests };

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://fake');
    const send = (status, payload = '', headers = {}) => {
      requests.push({ method: req.method, path: url.pathname, query: url.search, status });
      res.writeHead(status, headers);
      res.end(payload);
    };
    const error = (status, code, message) => send(status,
      `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${xmlEsc(message)}</Message></Error>`,
      { 'content-type': 'application/xml' });

    if (state.failNext > 0) {
      state.failNext--;
      return error(500, 'InternalError', 'falla simulada');
    }

    // --- Verificar la firma con el mismo secreto ---
    const m = (req.headers.authorization || '').match(
      /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, ?SignedHeaders=([a-z0-9;-]+), ?Signature=([0-9a-f]{64})$/,
    );
    if (!m) return error(403, 'AccessDenied', 'Falta la firma');
    const [, ak, day, reg, signedHeaders, sig] = m;
    if (ak !== accessKey) return error(403, 'InvalidAccessKeyId', 'Llave desconocida');
    if (reg !== region) return error(400, 'AuthorizationHeaderMalformed', `Región ${reg}`);
    const date = req.headers['x-amz-date'] || '';
    if (!date.startsWith(day)) return error(403, 'SignatureDoesNotMatch', 'Fecha distinta al alcance');
    const when = Date.parse(date.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, '$1-$2-$3T$4:$5:$6Z'));
    if (!(Math.abs(Date.now() - when) < 15 * 60e3)) return error(403, 'RequestTimeTooSkewed', 'Hora fuera de rango');
    const signed = signedHeaders.split(';');
    for (const h of ['host', 'x-amz-content-sha256', 'x-amz-date']) {
      if (!signed.includes(h)) return error(403, 'AccessDenied', `Falta firmar ${h}`);
    }
    const payloadHash = req.headers['x-amz-content-sha256'];
    if (payloadHash !== sha256Hex(body)) return error(400, 'XAmzContentSHA256Mismatch', 'El contenido no coincide');
    const headers = Object.fromEntries(signed.map((h) => [h, req.headers[h] ?? '']));
    const creq = canonicalRequest({ method: req.method, path: url.pathname, query: [...url.searchParams], headers, payloadHash });
    const expected = signature(signingKey(secretKey, date, reg, 's3'), stringToSign({ date, region: reg, service: 's3', canonicalRequest: creq }));
    if (expected !== sig) return error(403, 'SignatureDoesNotMatch', 'La firma no coincide');

    // --- Rutas path-style: /bucket/clave ---
    const [, b = '', ...rest] = url.pathname.split('/');
    if (decodeURIComponent(b) !== bucket) return error(404, 'NoSuchBucket', 'No existe el bucket');
    const key = rest.map(decodeURIComponent).join('/');

    if (!key) {
      if (req.method !== 'GET' || url.searchParams.get('list-type') !== '2') return error(501, 'NotImplemented', 'Solo ListObjectsV2');
      const prefix = url.searchParams.get('prefix') || '';
      const token = url.searchParams.get('continuation-token');
      const after = token ? Buffer.from(token, 'base64url').toString() : '';
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix) && k > after).sort();
      const page = all.slice(0, maxKeys);
      const truncated = all.length > page.length;
      const xml = '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
        + `<Name>${xmlEsc(bucket)}</Name><Prefix>${xmlEsc(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys>`
        + `<IsTruncated>${truncated}</IsTruncated>`
        + (truncated ? `<NextContinuationToken>${Buffer.from(page.at(-1)).toString('base64url')}</NextContinuationToken>` : '')
        + page.map((k) => `<Contents><Key>${xmlEsc(k)}</Key><LastModified>${objects.get(k).lastModified.toISOString()}</LastModified>`
          + `<ETag>&quot;${sha256Hex(objects.get(k).body).slice(0, 32)}&quot;</ETag><Size>${objects.get(k).body.length}</Size>`
          + '<StorageClass>STANDARD</StorageClass></Contents>').join('')
        + '</ListBucketResult>';
      return send(200, xml, { 'content-type': 'application/xml' });
    }
    if (req.method === 'PUT') {
      objects.set(key, { body, lastModified: new Date(), contentType: req.headers['content-type'] });
      return send(200, '', { etag: `"${sha256Hex(body).slice(0, 32)}"` });
    }
    if (req.method === 'GET') {
      const o = objects.get(key);
      if (!o) return error(404, 'NoSuchKey', 'No existe la clave');
      return send(200, o.body, { 'content-type': o.contentType || 'application/octet-stream' });
    }
    if (req.method === 'DELETE') {
      objects.delete(key);
      return send(204);
    }
    return error(405, 'MethodNotAllowed', req.method);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ ...state, state, server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Corre un comando del proyecto y devuelve { code, out }.
function run(script, args = [], env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

const tmpDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `nuvora-${name}-`));
const MARK = 'mensaje-de-control-para-restaurar';
const UPLOADS = { 'aB3_x-9': 'adjunto uno', Zq81kLm0: Buffer.from([0, 1, 2, 255]) };
const uploadPuts = (reqs) => reqs.filter((r) => r.method === 'PUT' && r.path.includes('/nuvora/uploads/') && r.status === 200);

// Base "actual" distinta a la del respaldo, para comprobar que se reemplaza y se guarda aparte.
function makeCurrentDb(dir) {
  const d = new DatabaseSync(path.join(dir, 'office.db'));
  d.exec("PRAGMA journal_mode = WAL; CREATE TABLE users (id INTEGER PRIMARY KEY); CREATE TABLE antes (x TEXT); INSERT INTO antes VALUES ('base-vieja');");
  d.close();
}
const readMark = (file) => {
  const d = new DatabaseSync(file, { readOnly: true });
  try {
    return d.prepare("SELECT body FROM messages WHERE dm_key = 'prueba-respaldo'").get()?.body;
  } finally {
    d.close();
  }
};

describe('Respaldos fuera del servidor (S3 falso)', () => {
  const CREDS = { bucket: 'nuvora-respaldos', accessKey: 'AKIAPRUEBA', secretKey: 'secreto/de+prueba', region: 'auto' };
  let s3;
  let backup;
  let dataDir;
  let s3Env;
  const dirs = [];

  before(async () => {
    s3 = await fakeS3(CREDS);
    dataDir = tmpDir('backup');
    dirs.push(dataDir);
    s3Env = {
      BACKUP_S3_ENDPOINT: s3.url,
      BACKUP_S3_BUCKET: CREDS.bucket,
      BACKUP_S3_ACCESS_KEY: CREDS.accessKey,
      BACKUP_S3_SECRET_KEY: CREDS.secretKey,
      BACKUP_S3_REGION: CREDS.region,
      BACKUP_S3_PREFIX: 'nuvora/',
      BACKUP_S3_KEEP: '3',
      BACKUP_S3_RETRY_MS: '5',
    };
    Object.assign(process.env, { DATA_DIR: dataDir, BACKUP_KEEP: '10', ...s3Env });
    delete process.env.BACKUP_DIR;
    // db.js lee DATA_DIR al cargarse: importar después de fijarlo.
    backup = await import('../server/backup.js');
    const { db } = await import('../server/db.js');
    const { hashPassword } = await import('../server/auth.js');
    const uid = db.prepare(`INSERT INTO users (username, display_name, password_hash, role, avatar, created_at)
      VALUES (?, 'Admin', ?, 'admin', '{}', ?)`).run(ADMIN.username, hashPassword(ADMIN.password), Date.now()).lastInsertRowid;
    db.prepare("INSERT INTO messages (dm_key, user_id, body, created_at) VALUES ('prueba-respaldo', ?, ?, ?)").run(uid, MARK, Date.now());
    fs.mkdirSync(path.join(dataDir, 'uploads'));
    for (const [id, body] of Object.entries(UPLOADS)) fs.writeFileSync(path.join(dataDir, 'uploads', id), body);
  });

  after(() => {
    s3?.server.close();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  const quiet = { log: () => {} };

  test('sube cada respaldo comprimido, firma bien y conserva solo BACKUP_S3_KEEP', async () => {
    s3.objects.set('nuvora/otra-cosa.txt', { body: Buffer.from('no tocar'), lastModified: new Date() });
    s3.objects.set('fuera-del-prefijo/office-2000-01-01T00-00-00-000.db.gz', { body: Buffer.from('x'), lastModified: new Date() });
    const keys = [];
    for (let i = 0; i < 5; i++) {
      const { file, remote } = await backup.runBackup(quiet);
      assert.ok(fs.existsSync(file));
      assert.equal(remote.ok, true, remote.error);
      keys.push(remote.key);
    }
    assert.ok(s3.requests.every((r) => r.status < 300), JSON.stringify(s3.requests.filter((r) => r.status >= 300)));
    assert.ok(s3.requests.some((r) => r.query.includes('continuation-token')), 'debe paginar ListObjectsV2');
    const remoteKeys = [...s3.objects.keys()].filter((k) => k.startsWith('nuvora/office-')).sort();
    assert.deepEqual(remoteKeys, keys.slice(-3));
    assert.ok(s3.objects.has('nuvora/otra-cosa.txt'), 'no borra otros archivos del prefijo');
    assert.ok(s3.objects.has('fuera-del-prefijo/office-2000-01-01T00-00-00-000.db.gz'), 'no borra fuera del prefijo');

    // Adjuntos: cada uno se sube una sola vez, aunque haya 5 respaldos; no se podan ni cuentan como respaldos
    assert.equal(uploadPuts(s3.requests).length, 2);
    for (const [id, body] of Object.entries(UPLOADS)) assert.deepEqual(s3.objects.get(`nuvora/uploads/${id}`).body, Buffer.from(body));
    fs.writeFileSync(path.join(dataDir, 'uploads', 'nuevo123'), 'llegó después');
    const n = s3.requests.length;
    const sixth = await backup.runBackup(quiet);
    keys.push(sixth.remote.key);
    assert.deepEqual(uploadPuts(s3.requests.slice(n)).map((r) => r.path), [`/${CREDS.bucket}/nuvora/uploads/nuevo123`]);
    assert.deepEqual(sixth.remote.uploads, { ...sixth.remote.uploads, local: 3, remote: 3, uploaded: 1, error: null });
    assert.deepEqual([...s3.objects.keys()].filter((k) => k.startsWith('nuvora/office-')).sort(), keys.slice(-3));
    UPLOADS.nuevo123 = 'llegó después';

    const latest = s3.objects.get(keys.at(-1));
    assert.equal(latest.contentType, 'application/gzip');
    const raw = zlib.gunzipSync(latest.body);
    assert.equal(raw.subarray(0, 16).toString('latin1'), 'SQLite format 3\0');

    const st = backup.backupStatus();
    assert.equal(st.ok, true);
    assert.equal(st.file, path.basename(keys.at(-1), '.gz'));
    assert.ok(st.size > 0);
    assert.equal(st.localCount, 6);
    assert.equal(st.offsite.uploads.uploaded, 1);
    assert.equal(st.offsite.enabled, true);
    assert.equal(st.offsite.status, 'ok');
    assert.equal(st.offsite.key, keys.at(-1));
    assert.equal(st.offsite.size, latest.body.length);
    assert.ok(Date.parse(st.offsite.uploadedAt) > 0);
    assert.equal(st.offsite.error, null);
    assert.equal(st.offsite.bucket, CREDS.bucket);
  });

  test('reintenta con espera cuando el almacenamiento falla un rato', async () => {
    s3.state.failNext = 2;
    const before = s3.requests.length;
    const { remote } = await backup.runBackup(quiet);
    assert.equal(remote.ok, true, remote.error);
    const puts = s3.requests.slice(before).filter((r) => r.method === 'PUT');
    assert.deepEqual(puts.map((r) => r.status), [500, 500, 200]);
  });

  test('si la subida falla no lanza error: queda en el estado', async () => {
    const errors = [];
    const origError = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      process.env.BACKUP_S3_SECRET_KEY = 'secreto-equivocado';
      const { file, remote } = await backup.runBackup(quiet);
      assert.ok(fs.existsSync(file), 'el respaldo local sí se crea');
      assert.equal(remote.ok, false);
      assert.match(remote.error, /403 SignatureDoesNotMatch/);
      let st = backup.backupStatus();
      assert.equal(st.ok, true);
      assert.equal(st.offsite.status, 'error');
      assert.match(st.offsite.error, /SignatureDoesNotMatch/);
      assert.equal(st.offsite.attempts, 1, 'un 403 no se reintenta');

      // Servidor caído: reintenta y se rinde sin tirar el proceso
      process.env.BACKUP_S3_SECRET_KEY = CREDS.secretKey;
      process.env.BACKUP_S3_ENDPOINT = `http://127.0.0.1:${await freePort()}`;
      process.env.BACKUP_S3_RETRIES = '1';
      const r2 = await backup.runBackup(quiet);
      assert.equal(r2.remote.ok, false);
      assert.match(r2.remote.error, /sin conexión/);
      st = backup.backupStatus();
      assert.equal(st.offsite.attempts, 2);
      assert.ok(errors.some((e) => /ERROR: no se pudo subir el respaldo/.test(e)));
    } finally {
      console.error = origError;
      Object.assign(process.env, s3Env);
      delete process.env.BACKUP_S3_RETRIES;
    }
  });

  test('apagado si falta la configuración', async () => {
    delete process.env.BACKUP_S3_BUCKET;
    try {
      const { remote } = await backup.runBackup(quiet);
      assert.equal(remote, null);
      const st = backup.backupStatus();
      assert.equal(st.offsite.enabled, false);
      assert.equal(st.offsite.status, 'disabled');
    } finally {
      Object.assign(process.env, s3Env);
    }
    // Deja un respaldo bueno al final para las pruebas de restauración
    const { remote } = await backup.runBackup(quiet);
    assert.equal(remote.ok, true);
  });

  test('npm run backup -- --list muestra locales y remotos', async () => {
    const { code, out } = await run('server/cli/backup.js', ['--list'], { DATA_DIR: dataDir, ...s3Env });
    assert.equal(code, 0, out);
    assert.match(out, /Respaldos locales en/);
    const remote = [...s3.objects.keys()].filter((k) => k.startsWith('nuvora/office-'));
    for (const k of remote) assert.ok(out.includes(`s3:${k}`), `falta ${k} en:\n${out}`);
    assert.ok(!out.includes('otra-cosa.txt'));
    assert.ok(!out.includes('s3:nuvora/uploads/'), 'los adjuntos no se listan como respaldos');
    assert.match(out, /Adjuntos del chat: 3 en .*, 3 en nuvora-respaldos\/nuvora\/uploads\//);
  });

  test('restaura --latest desde S3: verifica, guarda la base anterior y reemplaza', async () => {
    const dir = tmpDir('restore');
    dirs.push(dir);
    makeCurrentDb(dir);
    fs.writeFileSync(path.join(dir, 'office.db-wal'), 'wal-viejo-que-no-debe-quedar');
    fs.mkdirSync(path.join(dir, 'uploads'));
    fs.writeFileSync(path.join(dir, 'uploads', 'Zq81kLm0'), 'ya estaba'); // no se vuelve a bajar
    const gets = s3.requests.length;
    const port = await freePort();
    const { code, out } = await run('server/cli/restore.js', ['--latest'], { DATA_DIR: dir, PORT: String(port), ...s3Env });
    assert.equal(code, 0, out);
    assert.match(out, /Respaldo verificado \(PRAGMA integrity_check = ok, 1 usuario/);
    assert.match(out, /Base de datos restaurada/);
    const latestKey = [...s3.objects.keys()].filter((k) => k.startsWith('nuvora/office-')).sort().at(-1);
    assert.ok(out.includes(`s3:${latestKey}`), out);
    assert.equal(readMark(path.join(dir, 'office.db')), MARK);
    assert.ok(!fs.existsSync(path.join(dir, 'office.db-wal')), 'borra el -wal viejo');
    const aside = fs.readdirSync(dir).filter((f) => f.startsWith('office.db.antes-de-restaurar-'));
    assert.equal(aside.length, 1, fs.readdirSync(dir).join(', '));
    const old = new DatabaseSync(path.join(dir, aside[0]), { readOnly: true });
    assert.equal(old.prepare('SELECT x FROM antes').get().x, 'base-vieja');
    old.close();
    assert.ok(!fs.readdirSync(dir).some((f) => f.includes('restaurando')), 'no deja temporales');
    assert.match(out, /Adjuntos: se descargaron 2 de 3/);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'uploads')).sort(), Object.keys(UPLOADS).sort());
    assert.equal(fs.readFileSync(path.join(dir, 'uploads', 'aB3_x-9'), 'utf8'), UPLOADS['aB3_x-9']);
    assert.equal(fs.readFileSync(path.join(dir, 'uploads', 'Zq81kLm0'), 'utf8'), 'ya estaba');
    assert.equal(s3.requests.slice(gets).filter((r) => r.method === 'GET' && r.path.includes('/uploads/')).length, 2);
  });

  test('restaura con --sin-adjuntos, y no acepta ids de adjunto peligrosos', async () => {
    s3.objects.set('nuvora/uploads/..', { body: Buffer.from('x'), lastModified: new Date() });
    s3.objects.set('nuvora/uploads/sub/../../escape', { body: Buffer.from('x'), lastModified: new Date() });
    try {
      const dir = tmpDir('restore');
      dirs.push(dir);
      const port = String(await freePort());
      let r = await run('server/cli/restore.js', ['--latest', '--sin-adjuntos'], { DATA_DIR: dir, PORT: port, ...s3Env });
      assert.equal(r.code, 0, r.out);
      assert.ok(!fs.existsSync(path.join(dir, 'uploads')));
      r = await run('server/cli/restore.js', ['--latest', '--force'], { DATA_DIR: dir, PORT: port, ...s3Env });
      assert.equal(r.code, 0, r.out);
      assert.deepEqual(fs.readdirSync(path.join(dir, 'uploads')).sort(), Object.keys(UPLOADS).sort());
      assert.ok(!fs.existsSync(path.join(dir, 'escape')));
    } finally {
      s3.objects.delete('nuvora/uploads/..');
      s3.objects.delete('nuvora/uploads/sub/../../escape');
    }
  });

  test('restaura s3:<nombre> sin prefijo y archivos locales .db y .db.gz', async () => {
    const remoteKey = [...s3.objects.keys()].filter((k) => k.startsWith('nuvora/office-')).sort()[0];
    const port = String(await freePort());
    for (const src of ['s3:' + remoteKey.slice('nuvora/'.length), 'gz', 'db']) {
      const dir = tmpDir('restore');
      dirs.push(dir);
      let arg = src;
      if (src === 'gz') {
        arg = path.join(dir, 'copia.db.gz');
        fs.writeFileSync(arg, s3.objects.get(remoteKey).body);
      } else if (src === 'db') {
        arg = path.basename(backup.listLocalBackups().at(-1).path); // solo el nombre: se busca en la carpeta de respaldos
      }
      const { code, out } = await run('server/cli/restore.js', [arg], {
        DATA_DIR: dir, BACKUP_DIR: path.join(dataDir, 'backups'), PORT: port, ...s3Env,
      });
      assert.equal(code, 0, `${src}: ${out}`);
      assert.equal(readMark(path.join(dir, 'office.db')), MARK, src);
      assert.ok(!fs.readdirSync(dir).some((f) => f.startsWith('office.db.antes-de-restaurar-')), 'no había base que guardar');
    }
  });

  test('rechaza respaldos dañados sin tocar la base actual', async () => {
    const dir = tmpDir('restore');
    dirs.push(dir);
    makeCurrentDb(dir);
    const before = fs.readFileSync(path.join(dir, 'office.db'));
    const port = String(await freePort());

    const notDb = path.join(dir, 'no-es-db.db');
    fs.writeFileSync(notDb, 'hola');
    let r = await run('server/cli/restore.js', [notDb], { DATA_DIR: dir, PORT: port });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /no es una base de datos SQLite/);

    // Base truncada a la mitad: SQLite la abre pero integrity_check falla
    const good = fs.readFileSync(backup.listLocalBackups().at(-1).path);
    const broken = Buffer.from(good);
    broken.fill(0x41, 4096 * 2, Math.min(broken.length, 4096 * 6));
    const brokenFile = path.join(dir, 'rota.db');
    fs.writeFileSync(brokenFile, broken);
    r = await run('server/cli/restore.js', [brokenFile], { DATA_DIR: dir, PORT: port });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /dañado o no es válido[\s\S]*No se cambió nada/);

    assert.deepEqual(fs.readFileSync(path.join(dir, 'office.db')), before);
    assert.ok(!fs.readdirSync(dir).some((f) => f.includes('restaurando') || f.includes('antes-de-restaurar')), fs.readdirSync(dir).join(', '));
  });

  test('no restaura si la app responde en PORT, salvo con --force', async () => {
    const dir = tmpDir('restore');
    dirs.push(dir);
    makeCurrentDb(dir);
    const health = http.createServer((req, res) => {
      res.writeHead(req.url === '/api/health' ? 200 : 404, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    await new Promise((r) => health.listen(0, '127.0.0.1', r));
    const env = { DATA_DIR: dir, PORT: String(health.address().port), ...s3Env };
    try {
      let r = await run('server/cli/restore.js', ['--latest'], env);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /El servidor parece estar encendido: la app responde/);
      assert.match(r.out, /docker compose stop app/);
      assert.equal(readMarkSafe(path.join(dir, 'office.db')), undefined, 'no cambió la base');

      r = await run('server/cli/restore.js', ['--latest', '--force'], env);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Reinicia el servidor AHORA/);
      assert.equal(readMark(path.join(dir, 'office.db')), MARK);
    } finally {
      health.close();
    }
  });

  test('simulacro: restaurar en otra carpeta, encender la app ahí y entrar; con la app encendida no deja restaurar', async () => {
    const dir = tmpDir('simulacro');
    dirs.push(dir);
    const port = String(await freePort());
    let r = await run('server/cli/restore.js', ['--latest'], { DATA_DIR: dir, PORT: port, ...s3Env });
    assert.equal(r.code, 0, r.out);

    const srv = await startServer({ env: { DATA_DIR: dir } });
    try {
      const admin = await adminClient(srv.url); // el admin del respaldo, con su contraseña
      assert.equal(admin.user.username, ADMIN.username);
      assert.ok(fs.existsSync(path.join(dir, 'servidor.lock')), 'el servidor escribe su candado');
      // Puerto distinto al de la app: lo detecta el candado de la carpeta de datos
      r = await run('server/cli/restore.js', ['--latest'], { DATA_DIR: dir, PORT: port, ...s3Env });
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /hay un servidor usando esta carpeta/);
    } finally {
      await srv.stop();
    }
  });
});

function readMarkSafe(file) {
  try {
    return readMark(file);
  } catch {
    return undefined;
  }
}
