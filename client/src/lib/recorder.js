// Grabaciones y clips de pantallas compartidas, en el navegador (MediaRecorder).
// Funciona igual en P2P y con LiveKit: se graba lo que ya llega a esta pestaña.
import { WebmClipBuffer, durationPatch } from './webm.js';

const RECORD_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
// El búfer de clips corre todo el tiempo que ves una pantalla: VP8 gasta menos CPU que VP9
const CLIP_TYPES = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];

export const CLIP_SECONDS = 30;

export function recordingSupported() {
  return typeof window !== 'undefined' && typeof window.MediaRecorder === 'function';
}

export function pickMime(types = RECORD_TYPES, isSupported = (t) => window.MediaRecorder?.isTypeSupported?.(t)) {
  return types.find((t) => { try { return isSupported(t); } catch { return false; } }) || null;
}

export function clipMime() {
  return recordingSupported() ? pickMime(CLIP_TYPES) : null;
}

const pad = (n) => String(n).padStart(2, '0');

// clip-Kevin-2026-10-27-14-05.webm
export function fileName(kind, name, date = new Date(), ext = 'webm') {
  const who = String(name || 'pantalla').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'pantalla';
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `${kind}-${who}-${d}.${ext}`;
}

export function extFor(mime) {
  return /mp4/.test(mime || '') ? 'mp4' : 'webm';
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60e3);
}

// Mezcla varias pistas de audio en una sola (MediaRecorder graba solo una)
export class AudioMix {
  constructor() {
    this.ctx = new AudioContext(); // frecuencia del equipo: Firefox no mezcla fuentes con otra frecuencia
    this.dest = this.ctx.createMediaStreamDestination();
    this.sources = new Map(); // track.id -> { track, node }
    this.ctx.resume().catch(() => {});
  }

  get track() {
    return this.dest.stream.getAudioTracks()[0];
  }

  setTracks(tracks) {
    const live = tracks.filter((t) => t && t.kind === 'audio' && t.readyState === 'live');
    const want = new Set(live.map((t) => t.id));
    for (const [id, s] of this.sources) {
      if (!want.has(id) || s.track.readyState !== 'live') { try { s.node.disconnect(); } catch { /* ya */ } this.sources.delete(id); }
    }
    for (const t of live) {
      if (this.sources.has(t.id)) continue;
      try {
        const node = this.ctx.createMediaStreamSource(new MediaStream([t]));
        node.connect(this.dest);
        this.sources.set(t.id, { track: t, node });
      } catch { /* pista sin audio */ }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  stop() {
    for (const s of this.sources.values()) { try { s.node.disconnect(); } catch { /* ya */ } }
    this.sources.clear();
    this.track?.stop();
    this.ctx.close().catch(() => {});
  }
}

// Base: video de una pantalla + audio mezclado, re-mezclando cada 2 s
class Capture {
  constructor(videoTrack, getAudio) {
    this.videoTrack = videoTrack;
    this.getAudio = getAudio;
    this.mix = new AudioMix();
    this.mix.setTracks(getAudio());
    this.timer = setInterval(() => this.mix.setTracks(this.getAudio()), 2000);
    this.stream = new MediaStream([videoTrack, this.mix.track]);
    this.recorder = null;
  }

  dispose() {
    clearInterval(this.timer);
    this.mix.stop();
  }
}

// Mantiene en memoria los últimos ~30 s para poder guardar un clip
export class ClipRecorder extends Capture {
  constructor(videoTrack, getAudio, { seconds = CLIP_SECONDS, mime = clipMime() } = {}) {
    super(videoTrack, getAudio);
    this.seconds = seconds;
    this.mime = mime;
    this.buffer = new WebmClipBuffer({ keepMs: seconds * 1000 });
    this.queue = Promise.resolve();
    this.waiters = [];
    this.recorder = new MediaRecorder(this.stream, {
      mimeType: mime, videoBitsPerSecond: 3_500_000, audioBitsPerSecond: 128_000, videoKeyFrameIntervalDuration: 3000,
    });
    this.recorder.ondataavailable = (e) => {
      const data = e.data;
      this.queue = this.queue.then(async () => {
        if (data?.size) this.buffer.push(new Uint8Array(await data.arrayBuffer()));
      }).catch(() => {});
      const ws = this.waiters.splice(0);
      if (ws.length) this.queue.then(() => ws.forEach((w) => w()));
    };
    this.recorder.start(1000);
    this.startedAt = Date.now();
  }

  get active() {
    return this.recorder.state === 'recording' && !this.buffer.broken;
  }

  get bufferedSeconds() {
    return Math.min(this.seconds, this.buffer.spanMs / 1000);
  }

  // Guarda los últimos `seconds` segundos como un .webm reproducible
  async save(seconds = this.seconds) {
    if (this.recorder.state === 'recording') {
      await new Promise((ok) => {
        this.waiters.push(ok);
        try { this.recorder.requestData(); } catch { ok(); }
        setTimeout(ok, 1500);
      });
    }
    await this.queue;
    const out = this.buffer.build(seconds * 1000);
    if (!out) return null;
    return new Blob(out.parts, { type: 'video/webm' });
  }

  stop() {
    try { if (this.recorder.state !== 'inactive') this.recorder.stop(); } catch { /* ya */ }
    this.dispose();
  }
}

// Grabación completa (inicio/fin) de una pantalla
export class StreamRecorder extends Capture {
  constructor(videoTrack, getAudio, { mime = pickMime() } = {}) {
    super(videoTrack, getAudio);
    this.mime = mime;
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
    this.recorder.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
    this.done = new Promise((ok) => { this.recorder.onstop = ok; });
    this.recorder.start(1000);
    this.startedAt = Date.now();
  }

  get ext() {
    return extFor(this.mime);
  }

  async stop() {
    const durationMs = Date.now() - this.startedAt;
    if (this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch { /* ya */ }
      await Promise.race([this.done, new Promise((ok) => setTimeout(ok, 3000))]);
    }
    this.dispose();
    const type = (this.mime || 'video/webm').split(';')[0];
    if (!this.chunks.length) return null;
    const all = new Blob(this.chunks, { type });
    // MediaRecorder no escribe la duración en WebM: se agrega para que se pueda adelantar
    if (type === 'video/webm') {
      try {
        const patch = durationPatch(new Uint8Array(await all.slice(0, 256 * 1024).arrayBuffer()), durationMs);
        if (patch) return new Blob([patch.head, all.slice(patch.skip)], { type });
        console.warn('grabación: no se pudo escribir la duración');
      } catch (e) { console.warn('grabación: no se pudo escribir la duración', e); }
    }
    return all;
  }
}
