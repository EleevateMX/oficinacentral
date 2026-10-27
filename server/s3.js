// Cliente mínimo para almacenamiento compatible con S3 (Cloudflare R2, AWS S3, Backblaze B2, MinIO).
// Firma AWS Signature Version 4 escrita a mano (sin AWS SDK): solo node:crypto y fetch.
// URLs "path-style": <endpoint>/<bucket>/<clave>, que funcionan en R2, MinIO y S3.
import crypto from 'node:crypto';

export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Codificación URI de SigV4 (RFC 3986): solo A-Z a-z 0-9 - _ . ~ quedan sin codificar.
export function uriEncode(str, { keepSlash = false } = {}) {
  let out = '';
  for (const byte of Buffer.from(String(str), 'utf8')) {
    const c = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === '/')) out += c;
    else out += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

// 2013-05-24T00:00:00.000Z -> 20130524T000000Z
export const amzDate = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// query: objeto o lista de pares [clave, valor]. Ya decodificados; aquí se codifican y ordenan.
export function canonicalQuery(query = {}) {
  const pairs = Array.isArray(query) ? query : Object.entries(query);
  return pairs
    .map(([k, v]) => [uriEncode(k), uriEncode(v ?? '')])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

// headers: { nombre: valor }. Devuelve los encabezados canónicos y la lista firmada.
export function canonicalHeaders(headers) {
  const entries = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase().trim(), String(v).trim().replace(/\s+/g, ' ')])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    canonical: entries.map(([k, v]) => `${k}:${v}\n`).join(''),
    signedHeaders: entries.map(([k]) => k).join(';'),
  };
}

// path: ya codificado (p. ej. "/bucket/nuvora/office-x.db.gz"). Para S3 se codifica una sola vez.
export function canonicalRequest({ method, path, query, headers, payloadHash }) {
  const { canonical, signedHeaders } = canonicalHeaders(headers);
  return [method.toUpperCase(), path || '/', canonicalQuery(query), canonical, signedHeaders, payloadHash].join('\n');
}

export const credentialScope = (date, region, service) => `${date.slice(0, 8)}/${region}/${service}/aws4_request`;

export function stringToSign({ date, region, service, canonicalRequest: creq }) {
  return ['AWS4-HMAC-SHA256', date, credentialScope(date, region, service), sha256Hex(creq)].join('\n');
}

export function signingKey(secretKey, date, region, service) {
  const kDate = hmac('AWS4' + secretKey, date.slice(0, 8));
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export const signature = (key, sts) => crypto.createHmac('sha256', key).update(sts).digest('hex');

// Firma una petición y devuelve todo lo calculado (útil para pruebas) más el encabezado Authorization.
// headers debe incluir "host" y "x-amz-date" (o se agregan desde url/date).
export function sign({ method, path, query = {}, headers = {}, payloadHash, accessKey, secretKey, region, service = 's3', date }) {
  const creq = canonicalRequest({ method, path, query, headers, payloadHash });
  const sts = stringToSign({ date, region, service, canonicalRequest: creq });
  const sig = signature(signingKey(secretKey, date, region, service), sts);
  const { signedHeaders } = canonicalHeaders(headers);
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope(date, region, service)}, `
    + `SignedHeaders=${signedHeaders}, Signature=${sig}`;
  return { canonicalRequest: creq, stringToSign: sts, signature: sig, signedHeaders, authorization };
}

// ---------- Configuración ----------

// Devuelve la configuración remota o null si falta algo (la función queda apagada).
export function s3ConfigFromEnv(env = process.env) {
  const endpoint = (env.BACKUP_S3_ENDPOINT || '').trim().replace(/\/+$/, '');
  const bucket = (env.BACKUP_S3_BUCKET || '').trim();
  const accessKey = (env.BACKUP_S3_ACCESS_KEY || '').trim();
  const secretKey = (env.BACKUP_S3_SECRET_KEY || '').trim();
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  let prefix = env.BACKUP_S3_PREFIX ?? 'nuvora/';
  prefix = prefix.replace(/^\/+/, '');
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  const keep = Number(env.BACKUP_S3_KEEP);
  return {
    endpoint,
    bucket,
    accessKey,
    secretKey,
    region: (env.BACKUP_S3_REGION || '').trim() || 'auto',
    prefix,
    keep: Number.isFinite(keep) && keep >= 1 ? Math.floor(keep) : 30,
    retries: env.BACKUP_S3_RETRIES !== undefined ? Math.max(0, Number(env.BACKUP_S3_RETRIES) || 0) : 4,
    retryBaseMs: env.BACKUP_S3_RETRY_MS !== undefined ? Math.max(0, Number(env.BACKUP_S3_RETRY_MS) || 0) : 2000,
    timeoutMs: 120000,
  };
}

// ---------- Cliente ----------

const xmlDecode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');
const xmlTag = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? xmlDecode(m[1]) : null;
};

export class S3Error extends Error {
  constructor(message, { status, code, retryable } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class S3Client {
  constructor(config, { log = () => {} } = {}) {
    this.c = config;
    this.log = log;
  }

  objectPath(key = '') {
    const base = new URL(this.c.endpoint).pathname.replace(/\/+$/, '');
    return `${base}/${uriEncode(this.c.bucket)}${key ? '/' + uriEncode(key, { keepSlash: true }) : ''}`;
  }

  // Una petición firmada, sin reintentos.
  async requestOnce(method, key, { query = {}, body, contentType } = {}) {
    const url = new URL(this.c.endpoint);
    const path = this.objectPath(key);
    const payload = body ?? Buffer.alloc(0);
    const payloadHash = payload.length ? sha256Hex(payload) : EMPTY_SHA256;
    const date = amzDate();
    const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': date };
    if (contentType) headers['content-type'] = contentType;
    const { authorization } = sign({
      method, path, query, headers, payloadHash,
      accessKey: this.c.accessKey, secretKey: this.c.secretKey, region: this.c.region, service: 's3', date,
    });
    const qs = canonicalQuery(query);
    const { host, ...sendHeaders } = headers; // fetch pone "host" a partir de la URL
    let res;
    try {
      res = await fetch(`${url.origin}${path}${qs ? '?' + qs : ''}`, {
        method,
        headers: { ...sendHeaders, authorization },
        body: method === 'PUT' ? payload : undefined,
        signal: AbortSignal.timeout(this.c.timeoutMs || 120000),
      });
    } catch (e) {
      throw new S3Error(`sin conexión con ${url.host}: ${e.cause?.message || e.message}`, { retryable: true });
    }
    const data = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      const text = data.toString('utf8');
      const code = xmlTag(text, 'Code');
      const msg = xmlTag(text, 'Message');
      throw new S3Error(`HTTP ${res.status}${code ? ` ${code}` : ''}${msg ? `: ${msg}` : ''}`, {
        status: res.status, code, retryable: res.status >= 500 || res.status === 429 || res.status === 408,
      });
    }
    return { status: res.status, headers: res.headers, body: data };
  }

  // Con reintentos y espera creciente (2 s, 4 s, 8 s, 16 s por defecto).
  async request(method, key, opts = {}) {
    const retries = this.c.retries ?? 4;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.requestOnce(method, key, opts);
      } catch (e) {
        if (!e.retryable || attempt >= retries) {
          e.attempts = attempt + 1;
          throw e;
        }
        const delay = (this.c.retryBaseMs ?? 2000) * 2 ** attempt;
        this.log(`Falló ${method} ${key || this.c.bucket} (intento ${attempt + 1} de ${retries + 1}): ${e.message}. Reintento en ${Math.round(delay / 100) / 10} s.`);
        await wait(delay);
      }
    }
  }

  async putObject(key, body, contentType = 'application/octet-stream') {
    await this.request('PUT', key, { body, contentType });
  }

  async getObject(key) {
    return (await this.request('GET', key)).body;
  }

  async deleteObject(key) {
    await this.request('DELETE', key);
  }

  // ListObjectsV2 con paginación. Devuelve [{ key, size, lastModified }].
  async listObjects(prefix = '') {
    const out = [];
    let token = null;
    do {
      const query = { 'list-type': '2', prefix };
      if (token) query['continuation-token'] = token;
      const xml = (await this.request('GET', '', { query })).body.toString('utf8');
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        out.push({
          key: xmlTag(m[1], 'Key'),
          size: Number(xmlTag(m[1], 'Size') || 0),
          lastModified: xmlTag(m[1], 'LastModified'),
        });
      }
      token = xmlTag(xml, 'IsTruncated') === 'true' ? xmlTag(xml, 'NextContinuationToken') : null;
    } while (token);
    return out;
  }
}
