// Audio, video y pantallas a través de un servidor LiveKit (SFU).
// Misma interfaz que MediaManager (media.js), pero cada quien sube sus pistas
// una sola vez y el servidor las reparte. La proximidad decide a qué se
// suscribe cada persona: voz y cámara de quien está en tu sala, y solo las
// pantallas que eligiste ver.
import {
  Room, RoomEvent, Track, VideoPreset, LocalAudioTrack, LocalVideoTrack, createLocalVideoTrack,
} from 'livekit-client';
import { SCREEN_PRESETS } from './media.js';
import { openMic } from './noise.js';

const MIC = Track.Source.Microphone;
const CAM = Track.Source.Camera;
const SCREEN = Track.Source.ScreenShare;
const SCREEN_AUDIO = Track.Source.ScreenShareAudio;

export class LiveKitManager extends EventTarget {
  constructor({ myId, getToken, socket = null }) {
    super();
    this.myId = myId;
    this.getToken = getToken;
    this.socket = socket;
    this.localStream = new MediaStream();
    this.screenStream = null;
    this.audioTrack = null; // LocalAudioTrack
    this.videoTrack = null; // LocalVideoTrack
    this.screenTrack = null; // LocalVideoTrack
    this.screenAudioTrack = null; // LocalAudioTrack
    this.talk = new Set();
    this.warm = new Set();
    this.watching = new Set();
    this.watchers = new Set();
    this.streamVolumes = new Map();
    this.audioEls = new Map(); // `${id}:${source}` -> <audio>
    this.settings = {
      noiseSuppression: true, echoCancellation: true, autoGainControl: true, aiNoise: 'rnnoise', hd: false, micId: '', camId: '', speakerId: '',
      screenQuality: 'balanced', screenAudio: true, screenVolume: 1,
    };
    this.mic = null; // { track, raw, ai, stop } (ver noise.js)
    this.pubOpts = new Map(); // pista local -> opciones con que se publicó (para volver a publicar al cambiar de sala)
    this.room = this.makeRoom();
    this.ready = this.connect();
    // El servidor da acceso solo a la sala de tu ámbito (piso, sala cerrada o sala del Hotel; server/voiceGate.js).
    // Si cambias de ámbito te avisa y te cambias de sala con tus mismas pistas.
    this.onScope = () => this.switchRoom();
    socket?.on('lk:scope', this.onScope);
  }

  makeRoom() {
    const room = new Room({ adaptiveStream: false, dynacast: true, disconnectOnPageLeave: true });
    const mine = (fn) => (...a) => { if (this.room === room) fn(...a); };
    const refresh = mine(() => { this.applySubscriptions(); this.emitPeers(); });
    for (const ev of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished]) room.on(ev, refresh);
    room.on(RoomEvent.TrackSubscribed, mine((track, pub, participant) => { this.playAudio(track, pub, participant); this.emitPeers(); }));
    room.on(RoomEvent.TrackUnsubscribed, mine((track, pub, participant) => { this.stopAudio(pub, participant); this.emitPeers(); }));
    room.on(RoomEvent.Reconnected, refresh);
    room.on(RoomEvent.Disconnected, mine(() => this.emitPeers()));
    return room;
  }

  async switchRoom() {
    if (this.switching) { this.switchAgain = true; return; }
    this.switching = true;
    try {
      do {
        this.switchAgain = false;
        await this.ready;
        const old = this.room;
        const local = [this.audioTrack, this.videoTrack, this.screenTrack, this.screenAudioTrack].filter(Boolean);
        this.room = this.makeRoom();
        await old.disconnect(false); // sin detener las pistas locales
        for (const el of this.audioEls.values()) el.srcObject = null;
        this.audioEls.clear();
        this.emitPeers();
        this.ready = this.connect();
        await this.ready;
        for (const t of local) {
          try { await this.room.localParticipant.publishTrack(t, this.pubOpts.get(t)); } catch (e) { console.warn('LiveKit: no se pudo volver a publicar', e); }
        }
      } while (this.switchAgain);
    } finally {
      this.switching = false;
    }
  }

  async connect() {
    try {
      const { url, token } = await this.getToken();
      await this.room.connect(url, token, { autoSubscribe: false });
      this.applySubscriptions();
      this.emitPeers();
    } catch (e) {
      console.warn('LiveKit: no se pudo conectar', e);
      this.dispatchEvent(new CustomEvent('error', { detail: e }));
    }
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get state() {
    return { mic: !!this.audioTrack, cam: !!this.videoTrack, screen: !!this.screenTrack, screenAudio: !!this.screenAudioTrack, aiNoise: !!this.mic?.ai, viewers: [...this.watchers] };
  }

  updateSettings(s) {
    Object.assign(this.settings, s);
    if (this.settings.speakerId) {
      for (const el of this.audioEls.values()) el.setSinkId?.(this.settings.speakerId).catch(() => {});
    }
    for (const [key, el] of this.audioEls) if (key.endsWith(`:${SCREEN_AUDIO}`)) el.volume = this.volumeFor(Number(key.split(':')[0]));
  }

  volumeFor(id) {
    return (this.streamVolumes.get(id) ?? 1) * this.settings.screenVolume;
  }

  // ---------- Pistas locales ----------
  rebuildLocal() {
    this.localStream = new MediaStream([this.audioTrack, this.videoTrack].filter(Boolean).map((t) => t.mediaStreamTrack));
  }

  async publish(track, opts) {
    await this.ready;
    this.pubOpts.set(track, opts);
    await this.room.localParticipant.publishTrack(track, opts);
  }

  async unpublish(track) {
    if (!track) return;
    this.pubOpts.delete(track);
    try { await this.room.localParticipant.unpublishTrack(track, true); } catch { track.stop(); }
  }

  async setMic(on) {
    if (on && !this.audioTrack) {
      // Pista propia (posiblemente ya procesada con RNNoise); LiveKit solo la publica
      const mic = await openMic(this.settings);
      if (this.audioTrack) { mic.stop(); return; }
      this.mic = mic;
      this.audioTrack = new LocalAudioTrack(mic.track, { deviceId: this.settings.micId || undefined }, true);
      try {
        await this.publish(this.audioTrack, { source: MIC, dtx: true, red: true });
      } catch (e) {
        this.audioTrack = null;
        this.mic = null;
        mic.stop();
        throw e;
      }
    } else if (!on && this.audioTrack) {
      const t = this.audioTrack;
      const mic = this.mic;
      this.audioTrack = null;
      this.mic = null;
      await this.unpublish(t);
      mic?.stop();
    }
    this.rebuildLocal();
    this.emit('local', this.state);
  }

  async setCam(on) {
    if (on && !this.videoTrack) {
      const hd = this.settings.hd;
      this.videoTrack = await createLocalVideoTrack({
        resolution: { width: hd ? 1280 : 640, height: hd ? 720 : 360, frameRate: 24 },
        ...(this.settings.camId ? { deviceId: { exact: this.settings.camId } } : {}),
      });
      await this.publish(this.videoTrack, { source: CAM, simulcast: true });
    } else if (!on && this.videoTrack) {
      const t = this.videoTrack;
      this.videoTrack = null;
      await this.unpublish(t);
    }
    this.rebuildLocal();
    this.emit('local', this.state);
  }

  async setScreen(on) {
    if (on && !this.screenTrack) {
      const preset = SCREEN_PRESETS[this.settings.screenQuality] || SCREEN_PRESETS.balanced;
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: preset.fps, max: preset.fps } },
        audio: this.settings.screenAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        systemAudio: this.settings.screenAudio ? 'include' : 'exclude',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
      const vt = s.getVideoTracks()[0];
      try { vt.contentHint = preset.hint; } catch { /* no soportado */ }
      this.screenStream = s;
      this.screenTrack = new LocalVideoTrack(vt, undefined, true);
      vt.addEventListener('ended', () => this.setScreen(false));
      // Una versión ligera para quien tenga mala conexión; el servidor elige cuál mandar a cada quien
      await this.publish(this.screenTrack, {
        source: SCREEN,
        simulcast: true,
        screenShareEncoding: { maxBitrate: preset.bitrate, maxFramerate: preset.fps },
        screenShareSimulcastLayers: [new VideoPreset(1280, 720, 1_200_000, Math.min(preset.fps, 15))],
        degradationPreference: preset.degrade,
      });
      const at = s.getAudioTracks()[0];
      if (at) {
        this.screenAudioTrack = new LocalAudioTrack(at, undefined, true);
        await this.publish(this.screenAudioTrack, { source: SCREEN_AUDIO, dtx: false, red: false, audioPreset: { maxBitrate: 128_000 } });
      }
    } else if (!on && this.screenTrack) {
      const [v, a] = [this.screenTrack, this.screenAudioTrack];
      this.screenTrack = null;
      this.screenAudioTrack = null;
      this.screenStream = null;
      await this.unpublish(v);
      await this.unpublish(a);
    }
    this.emit('local', this.state);
  }

  async restartTracks() {
    const { mic, cam } = this.state;
    if (mic) { await this.setMic(false); await this.setMic(true); }
    if (cam) { await this.setCam(false); await this.setCam(true); }
  }

  // ---------- Suscripciones ----------
  // warm: gente cercana cuyo audio ya se suscribe (en silencio) para que la voz entre al instante
  setPeers(ids, warm = []) {
    this.talk = new Set(ids);
    this.warm = new Set(warm);
    this.applySubscriptions();
    this.applyMutes();
    this.emitPeers();
  }

  // Pantallas que elegí ver
  setWatching(ids) {
    this.watching = new Set(ids);
    this.applySubscriptions();
    this.emitPeers();
  }

  // Quiénes ven mi pantalla (solo para el contador; el servidor reparte)
  setWatchers(ids) {
    const next = new Set(ids);
    if (next.size === this.watchers.size && [...next].every((id) => this.watchers.has(id))) return;
    this.watchers = next;
    this.emit('local', this.state);
  }

  setStreamVolume(id, v) {
    this.streamVolumes.set(id, v);
    const el = this.audioEls.get(`${id}:${SCREEN_AUDIO}`);
    if (el) el.volume = this.volumeFor(id);
  }

  applySubscriptions() {
    if (this.room.state !== 'connected') return;
    for (const p of this.room.remoteParticipants.values()) {
      const id = Number(p.identity);
      for (const pub of p.trackPublications.values()) {
        const talkTrack = pub.source === MIC || pub.source === CAM;
        const want = talkTrack ? (this.talk.has(id) || (pub.source === MIC && this.warm.has(id))) : (pub.source === SCREEN || pub.source === SCREEN_AUDIO) && this.watching.has(id);
        if (pub.isSubscribed !== want) pub.setSubscribed(want);
      }
    }
  }

  peerVolume(id) {
    try { return JSON.parse(localStorage.getItem('nuvora:vol') || '{}')[id] ?? 1; } catch { return 1; }
  }

  setPeerVolume(id, v) {
    const el = this.audioEls.get(`${id}:${MIC}`);
    if (el) el.volume = Math.max(0, Math.min(1, v));
  }

  applyMutes() {
    for (const [key, el] of this.audioEls) {
      if (!key.endsWith(`:${MIC}`)) continue;
      el.muted = !this.talk.has(Number(key.split(':')[0]));
    }
  }

  playAudio(track, pub, participant) {
    if (track.kind !== 'audio') return;
    const id = Number(participant.identity);
    const key = `${id}:${pub.source}`;
    let el = this.audioEls.get(key);
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      if (this.settings.speakerId) el.setSinkId?.(this.settings.speakerId).catch(() => {});
      this.audioEls.set(key, el);
    }
    el.srcObject = new MediaStream([track.mediaStreamTrack]);
    if (pub.source === SCREEN_AUDIO) el.volume = this.volumeFor(id);
    if (pub.source === MIC) { el.muted = !this.talk.has(id); el.volume = Math.max(0, Math.min(1, this.peerVolume(id))); }
    el.play().catch(() => {});
  }

  stopAudio(pub, participant) {
    const key = `${Number(participant.identity)}:${pub.source}`;
    const el = this.audioEls.get(key);
    if (el) { el.srcObject = null; this.audioEls.delete(key); }
  }

  peerList() {
    const out = [];
    for (const p of this.room.remoteParticipants.values()) {
      const id = Number(p.identity);
      if (!this.talk.has(id) && !this.watching.has(id)) continue;
      const tracks = (srcs) => [...p.trackPublications.values()].filter((pub) => srcs.includes(pub.source) && pub.track).map((pub) => pub.track.mediaStreamTrack);
      const main = tracks([MIC, CAM]);
      const screen = tracks([SCREEN, SCREEN_AUDIO]);
      const prev = this.lastStreams?.get(id);
      // Reusa el MediaStream si las pistas no cambiaron (evita parpadeos en <video>)
      const same = (ms, list) => ms && ms.getTracks().length === list.length && list.every((t) => ms.getTracks().includes(t));
      const stream = same(prev?.stream, main) ? prev.stream : new MediaStream(main);
      const screenStream = screen.some((t) => t.kind === 'video') ? (same(prev?.screen, screen) ? prev.screen : new MediaStream(screen)) : null;
      out.push({ id, stream, screen: screenStream, state: 'connected' });
    }
    this.lastStreams = new Map(out.map((p) => [p.id, p]));
    return out;
  }

  emitPeers() {
    this.emit('peers', this.peerList());
  }

  destroy() {
    this.socket?.off('lk:scope', this.onScope);
    for (const t of [this.audioTrack, this.videoTrack, this.screenTrack, this.screenAudioTrack]) t?.stop();
    this.mic?.stop();
    for (const el of this.audioEls.values()) el.srcObject = null;
    this.room.disconnect();
  }
}
