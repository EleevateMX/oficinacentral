import { getMedia } from './getMedia.js';
import { openMic } from './noise.js';

// Calidad de pantalla compartida
export const SCREEN_PRESETS = {
  text: { label: 'Texto nítido', desc: 'Código, documentos y diseño. 1080p a 15 fps.', fps: 15, hint: 'detail', bitrate: 2_500_000, degrade: 'maintain-resolution' },
  balanced: { label: 'Equilibrada', desc: 'Uso general. 1080p a 30 fps.', fps: 30, hint: 'detail', bitrate: 4_000_000, degrade: 'balanced' },
  motion: { label: 'Juegos y video', desc: 'Movimiento fluido. Hasta 60 fps.', fps: 60, hint: 'motion', bitrate: 6_000_000, degrade: 'maintain-framerate' },
};
// Subida total que se reparte entre quienes ven tu pantalla (malla P2P)
const UPLOAD_BUDGET = 14_000_000;

// Audio/video por proximidad con WebRTC (malla P2P).
// Cada par de personas que "pueden hablar" (mismo escritorio, misma sala privada,
// o cerca en el pasillo) abre una RTCPeerConnection. Se usa el patrón
// "perfect negotiation" para que cualquiera pueda añadir pistas en cualquier momento.

export class MediaManager extends EventTarget {
  constructor({ socket, myId, iceServers }) {
    super();
    this.socket = socket;
    this.myId = myId;
    this.iceServers = iceServers;
    this.peers = new Map();
    this.localStream = new MediaStream();
    this.screenStream = null;
    this.audioTrack = null;
    this.videoTrack = null;
    this.screenTrack = null;
    this.screenAudioTrack = null;
    this.settings = {
      noiseSuppression: true, echoCancellation: true, autoGainControl: true, aiNoise: 'rnnoise', hd: false, micId: '', camId: '', speakerId: '',
      screenQuality: 'balanced', screenAudio: true, screenVolume: 1,
    };
    this.mic = null; // { track, raw, ai, stop } (ver noise.js)
    this.closeTimers = new Map();
    this.watchers = new Set(); // quiénes están viendo mi pantalla
    this.streamVolumes = new Map(); // volumen por pantalla que veo
    this.onSignal = ({ from, data }) => this.handleSignal(from, data);
    socket.on('rtc', this.onSignal);
    // Defensa extra (el servidor ya filtra, server/voiceGate.js): solo se aceptan ofertas de
    // quien está en tu sala, cerca (conexión preparada), en una llamada aceptada o cuya pantalla ves.
    this.canAccept = null; // (id) => bool, lo pone el store (client/src/lib/voiceGate.js)
    this.allowedUntil = new Map(); // id -> vence (llamada aceptada)
    this.watchingIds = new Set();
    this.held = new Map(); // id -> { at, list } señales que llegaron un instante antes de que yo te viera cerca
    this.dropped = new Map(); // id -> cuándo el servidor cortó la conexión (no se reintenta enseguida)
    this.onDrop = ({ peer } = {}) => {
      const id = Number(peer);
      if (!Number.isInteger(id)) return;
      this.dropped.set(id, Date.now());
      this.held.delete(id);
      this.closePeer(id, false);
    };
    socket.on('rtc:drop', this.onDrop);
  }

  // Llamada aceptada: se acepta su conexión aunque esté lejos (unos minutos)
  allowPeer(id, ms = 3 * 60e3) { this.allowedUntil.set(Number(id), Date.now() + ms); }

  accepts(id) {
    if (this.peers.has(id) || this.active?.has(id) || this.wanted?.has(id) || this.watchingIds.has(id)) return true;
    if ((this.allowedUntil.get(id) || 0) > Date.now()) return true;
    return this.canAccept ? !!this.canAccept(id) : true;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get state() {
    return { mic: !!this.audioTrack, cam: !!this.videoTrack, screen: !!this.screenTrack, screenAudio: !!this.screenAudioTrack, aiNoise: !!this.mic?.ai, viewers: [...this.watchers] };
  }

  updateSettings(s) {
    Object.assign(this.settings, s);
    for (const p of this.peers.values()) {
      for (const el of [p.audio, p.screenAudio]) if (this.settings.speakerId && el.setSinkId) el.setSinkId(this.settings.speakerId).catch(() => {});
      p.screenAudio.volume = (this.streamVolumes.get(p.id) ?? 1) * this.settings.screenVolume;
    }
    this.applyBitrates();
  }

  // ---------- Medios locales ----------
  async setMic(on) {
    if (on && !this.audioTrack) {
      const mic = await openMic(this.settings);
      if (this.audioTrack) { mic.stop(); return; } // se encendió dos veces a la vez
      this.mic = mic;
      this.audioTrack = mic.track;
      this.localStream.addTrack(this.audioTrack);
    } else if (!on && this.audioTrack) {
      this.mic?.stop();
      this.mic = null;
      this.localStream.removeTrack(this.audioTrack);
      this.audioTrack = null;
    }
    this.syncSenders();
    this.emit('local', this.state);
  }

  async setCam(on) {
    if (on && !this.videoTrack) {
      const hd = this.settings.hd;
      const s = await getMedia('video', (id) => ({
        width: { ideal: hd ? 1280 : 640 }, height: { ideal: hd ? 720 : 360 }, frameRate: { ideal: 24 },
        ...(id ? { deviceId: { exact: id } } : {}),
      }), this.settings.camId);
      this.videoTrack = s.getVideoTracks()[0];
      this.localStream.addTrack(this.videoTrack);
    } else if (!on && this.videoTrack) {
      this.videoTrack.stop();
      this.localStream.removeTrack(this.videoTrack);
      this.videoTrack = null;
    }
    this.syncSenders();
    this.emit('local', this.state);
  }

  async setScreen(on) {
    if (on && !this.screenTrack) {
      const preset = SCREEN_PRESETS[this.settings.screenQuality] || SCREEN_PRESETS.balanced;
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: preset.fps, max: preset.fps } },
        // Audio del sistema o de la pestaña (Chrome/Edge; en Windows también de toda la pantalla)
        audio: this.settings.screenAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        systemAudio: this.settings.screenAudio ? 'include' : 'exclude',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
      this.screenStream = s;
      this.screenTrack = s.getVideoTracks()[0];
      try { this.screenTrack.contentHint = preset.hint; } catch { /* no soportado */ }
      this.screenAudioTrack = s.getAudioTracks()[0] || null;
      this.screenTrack.addEventListener('ended', () => this.setScreen(false));
      for (const id of this.peers.keys()) this.send(id, { meta: { screen: s.id } });
    } else if (!on && this.screenTrack) {
      this.screenTrack.stop();
      this.screenAudioTrack?.stop();
      this.screenTrack = null;
      this.screenAudioTrack = null;
      this.screenStream = null;
    }
    this.syncSenders();
    this.emit('local', this.state);
  }

  // En P2P la pantalla llega solo si quien comparte me la envía (ver setWatchers)
  setWatching(ids = []) { this.watchingIds = new Set(ids.map(Number)); }

  setWatchers(ids) {
    const next = new Set(ids);
    if (next.size === this.watchers.size && [...next].every((id) => this.watchers.has(id))) return;
    this.watchers = next;
    this.syncSenders();
    this.emit('local', this.state);
  }

  setPeerVolume(id, v) {
    this.peerVolumes = this.peerVolumes || new Map();
    this.peerVolumes.set(id, v);
    const p = this.peers.get(id);
    if (p) p.audio.volume = Math.max(0, Math.min(1, v));
  }

  setStreamVolume(id, v) {
    this.streamVolumes.set(id, v);
    const p = this.peers.get(id);
    if (p) p.screenAudio.volume = v * this.settings.screenVolume;
  }

  // Reparte la subida entre quienes ven tu pantalla para que no se trabe
  applyBitrates() {
    const preset = SCREEN_PRESETS[this.settings.screenQuality] || SCREEN_PRESETS.balanced;
    const viewers = Math.max(1, [...this.peers.values()].filter((p) => p.senders.screen).length);
    const max = Math.max(600_000, Math.min(preset.bitrate, Math.floor(UPLOAD_BUDGET / viewers)));
    for (const p of this.peers.values()) {
      const sender = p.senders.screen;
      if (!sender) continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = max;
        params.encodings[0].maxFramerate = preset.fps;
        params.degradationPreference = preset.degrade;
        sender.setParameters(params).catch(() => {});
      } catch { /* la conexión aún no negocia */ }
    }
  }

  async restartTracks() {
    const { mic, cam } = this.state;
    if (mic) { await this.setMic(false); await this.setMic(true); }
    if (cam) { await this.setCam(false); await this.setCam(true); }
  }

  syncSenders() {
    for (const p of this.peers.values()) this.attachTracks(p);
    this.applyBitrates();
  }

  attachTracks(p) {
    // La pantalla solo se envía a quien eligió verla (como en Discord)
    const watching = this.watchers.has(p.id);
    const wanted = {
      audio: this.audioTrack, video: this.videoTrack,
      screen: watching ? this.screenTrack : null, screenAudio: watching ? this.screenAudioTrack : null,
    };
    // A quien solo está cerca (conexión preparada) no se le manda nada todavía
    const hold = (kind) => !p.active && (kind === 'audio' || kind === 'video');
    for (const kind of ['audio', 'video', 'screen', 'screenAudio']) {
      const track = wanted[kind];
      const send = hold(kind) ? null : track; // lo que de verdad sale hacia esta persona
      const sender = p.senders[kind];
      if (track && !sender) {
        // Se crea el canal ya negociado; si aún no hablan, se deja en silencio
        p.senders[kind] = p.pc.addTrack(track, kind === 'screen' || kind === 'screenAudio' ? this.screenStream : this.localStream);
        if (!send) p.senders[kind].replaceTrack(null).catch(() => {});
      } else if (sender && !track) {
        try { p.pc.removeTrack(sender); } catch { /* cerrado */ }
        delete p.senders[kind];
      } else if (sender && sender.track !== send) {
        sender.replaceTrack(send).catch(() => {});
      }
    }
  }

  // ---------- Pares ----------
  // ids: con quién hablas ahora. warm: quién está cerca; la conexión se prepara antes
  // (sin enviar audio ni video) para que al acercarte la voz suene al instante.
  setPeers(ids, warm = []) {
    this.active = new Set(ids);
    const wanted = new Set([...ids, ...warm]);
    this.wanted = wanted;
    const t = Date.now();
    for (const id of wanted) {
      clearTimeout(this.closeTimers.get(id));
      this.closeTimers.delete(id);
      if (this.peers.has(id)) continue;
      // El servidor la acaba de cortar: se reintenta en unos segundos (por si fue un desfase)
      if (t - (this.dropped.get(id) || 0) < 3000) continue;
      const h = this.held.get(id);
      this.held.delete(id);
      if (h && t - h.at < 4000) { for (const data of h.list) this.handleSignal(id, data); }
      if (!this.peers.has(id)) this.createPeer(id);
    }
    for (const p of this.peers.values()) {
      const on = this.active.has(p.id);
      if (p.active !== on) { p.active = on; p.audio.muted = !on; p.screenAudio.muted = !on; this.attachTracks(p); }
    }
    for (const id of this.peers.keys()) {
      if (!wanted.has(id) && !this.closeTimers.has(id)) {
        // Pequeña espera para no cortar por diferencias de sincronización
        this.closeTimers.set(id, setTimeout(() => {
          this.closeTimers.delete(id);
          this.closePeer(id, true);
        }, 1200));
      }
    }
  }

  createPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const audio = new Audio();
    audio.autoplay = true;
    if (this.settings.speakerId && audio.setSinkId) audio.setSinkId(this.settings.speakerId).catch(() => {});
    // El audio de la pantalla compartida va aparte para poder bajarle el volumen
    const screenAudio = new Audio();
    screenAudio.autoplay = true;
    screenAudio.volume = this.settings.screenVolume;
    if (this.settings.speakerId && screenAudio.setSinkId) screenAudio.setSinkId(this.settings.speakerId).catch(() => {});
    const active = !!this.active?.has(id);
    audio.muted = !active;
    let vol = this.peerVolumes?.get(id);
    if (vol == null) { try { vol = JSON.parse(localStorage.getItem('nuvora:vol') || '{}')[id]; } catch { /* sin almacenamiento */ } }
    if (vol != null) audio.volume = Math.max(0, Math.min(1, vol));
    screenAudio.muted = !active;
    const p = {
      id, pc, audio, screenAudio, active,
      polite: this.myId > id,
      makingOffer: false,
      ignoreOffer: false,
      senders: {},
      streams: new Map(),
      screenStreamId: null,
      stream: new MediaStream(),
      screen: null,
    };
    this.peers.set(id, p);

    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.send(id, { description: pc.localDescription });
      } catch (e) {
        console.warn('rtc offer', e);
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.send(id, { candidate }); };
    pc.ontrack = (e) => {
      const s = e.streams[0];
      if (s) p.streams.set(s.id, s);
      this.classify(p);
      e.track.addEventListener('ended', () => this.classify(p));
      e.track.addEventListener('unmute', () => this.classify(p));
      s?.addEventListener('removetrack', () => this.classify(p));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.closePeer(id, false);
        this.emit('retry', id);
      }
      this.emit('peers', this.peerList());
    };

    if (this.screenStream) this.send(id, { meta: { screen: this.screenStream.id } });
    this.attachTracks(p);
    this.applyBitrates();
    this.emit('peers', this.peerList());
    return p;
  }

  classify(p) {
    let main = null;
    let screen = null;
    for (const [sid, s] of p.streams) {
      if (sid === p.screenStreamId) screen = s;
      else main = s;
    }
    p.stream = main || new MediaStream();
    p.screen = screen && screen.getVideoTracks().some((t) => t.readyState === 'live') ? screen : null;
    if (p.audio.srcObject !== p.stream) p.audio.srcObject = p.stream;
    p.audio.play?.().catch(() => {});
    const sa = p.screen && p.screen.getAudioTracks().length ? p.screen : null;
    if (p.screenAudio.srcObject !== sa) p.screenAudio.srcObject = sa;
    if (sa) p.screenAudio.play?.().catch(() => {});
    this.emit('peers', this.peerList());
  }

  closePeer(id, notify) {
    const p = this.peers.get(id);
    if (!p) return;
    if (notify) this.send(id, { bye: true });
    p.pc.close();
    p.audio.srcObject = null;
    p.screenAudio.srcObject = null;
    this.peers.delete(id);
    this.emit('peers', this.peerList());
  }

  peerList() {
    return [...this.peers.values()].map((p) => ({ id: p.id, stream: p.stream, screen: p.screen, state: p.pc.connectionState }));
  }

  send(to, data) {
    this.socket.emit('rtc', { to, data });
  }

  async handleSignal(from, data) {
    if (!data) return;
    if (data.bye) {
      this.closePeer(from, false);
      return;
    }
    let p = this.peers.get(from);
    if (!p && !this.accepts(from)) {
      // No te tengo cerca (todavía): se guarda un momento por si es solo el desfase del movimiento
      const h = this.held.get(from);
      const t = Date.now();
      if (!h || t - h.at > 4000) this.held.set(from, { at: t, list: [data] });
      else if (h.list.length < 60) h.list.push(data);
      if (this.held.size > 40) this.held.delete(this.held.keys().next().value);
      return;
    }
    if (!p) {
      if (!data.description || data.description.type !== 'offer') {
        if (data.meta) {
          // Se aplicará cuando se cree la conexión
          this.pendingMeta = { ...(this.pendingMeta || {}), [from]: data.meta };
        }
        return;
      }
      p = this.createPeer(from);
    }
    if (this.pendingMeta?.[from]) {
      p.screenStreamId = this.pendingMeta[from].screen;
      delete this.pendingMeta[from];
    }
    try {
      if (data.meta) {
        p.screenStreamId = data.meta.screen;
        this.classify(p);
      }
      if (data.description) {
        const d = data.description;
        const collision = d.type === 'offer' && (p.makingOffer || p.pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await p.pc.setRemoteDescription(d);
        if (d.type === 'offer') {
          await p.pc.setLocalDescription();
          this.send(from, { description: p.pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await p.pc.addIceCandidate(data.candidate);
        } catch (e) {
          if (!p.ignoreOffer) console.warn('rtc ice', e);
        }
      }
    } catch (e) {
      console.warn('rtc signal', e);
    }
  }

  destroy() {
    this.socket.off('rtc', this.onSignal);
    this.socket.off('rtc:drop', this.onDrop);
    for (const id of [...this.peers.keys()]) this.closePeer(id, true);
    this.mic?.stop();
    this.audioTrack?.stop();
    this.videoTrack?.stop();
    this.screenTrack?.stop();
    this.screenAudioTrack?.stop();
  }
}

export async function listDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      mics: all.filter((d) => d.kind === 'audioinput'),
      cams: all.filter((d) => d.kind === 'videoinput'),
      speakers: all.filter((d) => d.kind === 'audiooutput'),
    };
  } catch {
    return { mics: [], cams: [], speakers: [] };
  }
}
