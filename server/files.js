// Archivos del chat (imágenes, documentos, videos cortos) guardados en DATA_DIR/uploads.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { db, now, DATA_DIR } from './db.js';

export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
export const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 25;

// Tipos que el navegador puede mostrar sin riesgo dentro de la página
const INLINE = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm)|audio\/(mpeg|ogg|wav|webm)|application\/pdf)$/;

const fileRow = (r) => r && ({ id: r.id, name: r.name, mime: r.mime, size: r.size, width: r.width, height: r.height, url: `/api/files/${r.id}/${encodeURIComponent(r.name)}` });

export function getFiles(ids, userId) {
  const out = [];
  for (const id of ids.slice(0, 10)) {
    const r = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(String(id), userId);
    if (r) out.push(fileRow(r));
  }
  return out;
}

// Cuota por persona: que nadie llene el disco del servidor subiendo archivos sin parar
db.exec('CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id, created_at)');
const FILES_PER_HOUR = Number(process.env.FILES_PER_HOUR) || 60;
const MB_PER_DAY = Number(process.env.UPLOAD_MB_PER_DAY) || 500;
function quotaError(userId) {
  const t = now();
  const hour = db.prepare('SELECT COUNT(*) AS n FROM files WHERE user_id = ? AND created_at > ?').get(userId, t - 3600e3).n;
  if (hour >= FILES_PER_HOUR) return 'Subiste muchos archivos en esta hora. Espera un poco.';
  const day = db.prepare('SELECT COALESCE(SUM(size), 0) AS b FROM files WHERE user_id = ? AND created_at > ?').get(userId, t - 864e5).b;
  if (day >= MB_PER_DAY * 1048576) return `Llegaste al límite de ${MB_PER_DAY} MB de archivos por día.`;
  return null;
}
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return String(s); } };

export function registerFileRoutes(api, { fail }) {
  // La cuota se revisa antes de recibir el cuerpo (así no se lee un archivo que se va a rechazar)
  const quota = (req, res, next) => { const e = quotaError(req.user.id); return e ? fail(res, 429, e) : next(); };
  api.post('/files', quota, express.raw({ type: () => true, limit: `${MAX_FILE_MB}mb` }), (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return fail(res, 400, 'Archivo vacío');
    const name = String(safeDecode(req.headers['x-file-name'] || 'archivo')).replace(/[\\/\0]/g, '_').slice(0, 120) || 'archivo';
    let mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 100);
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)) mime = 'application/octet-stream';
    // Las imágenes deben serlo de verdad (firma del archivo)
    if (mime.startsWith('image/') && !sniffImage(buf)) mime = 'application/octet-stream';
    const id = crypto.randomBytes(16).toString('base64url');
    fs.writeFileSync(path.join(UPLOAD_DIR, id), buf);
    const w = Number(req.headers['x-width']) || null;
    const h = Number(req.headers['x-height']) || null;
    db.prepare('INSERT INTO files (id, user_id, name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, name, mime, buf.length, w && w < 20000 ? w : null, h && h < 20000 ? h : null, now());
    res.json({ file: fileRow(db.prepare('SELECT * FROM files WHERE id = ?').get(id)) });
  });

  api.get('/files/:id{/:name}', (req, res) => {
    const r = db.prepare('SELECT * FROM files WHERE id = ?').get(String(req.params.id));
    const p = r && path.join(UPLOAD_DIR, r.id);
    if (!r || !fs.existsSync(p)) return res.status(404).end();
    const inline = INLINE.test(r.mime);
    res.setHeader('Content-Type', inline ? r.mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(r.name)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(p);
  });
}

function sniffImage(b) {
  const hex = b.subarray(0, 12).toString('hex');
  return hex.startsWith('89504e47') || hex.startsWith('ffd8ff') || hex.startsWith('47494638')
    || (hex.startsWith('52494646') && b.subarray(8, 12).toString('ascii') === 'WEBP')
    || b.subarray(4, 12).toString('ascii').startsWith('ftypavif');
}
