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
    this.settings = { noiseSuppression: true, echoCancellation: true, autoGainControl: true, hd: false, micId: '', camId: '', speakerId: '' };
    this.closeTimers = new Map();
    this.onSignal = ({ from, data }) => this.handleSignal(from, data);
    socket.on('rtc', this.onSignal);
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get state() {
    return { mic: !!this.audioTrack, cam: !!this.videoTrack, screen: !!this.screenTrack };
  }

  updateSettings(s) {
    Object.assign(this.settings, s);
    for (const p of this.peers.values()) if (this.settings.speakerId && p.audio.setSinkId) p.audio.setSinkId(this.settings.speakerId).catch(() => {});
  }

  // ---------- Medios locales ----------
  async setMic(on) {
    if (on && !this.audioTrack) {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: this.settings.noiseSuppression,
          echoCancellation: this.settings.echoCancellation,
          autoGainControl: this.settings.autoGainControl,
          ...(this.settings.micId ? { deviceId: { exact: this.settings.micId } } : {}),
        },
      });
      this.audioTrack = s.getAudioTracks()[0];
      this.localStream.addTrack(this.audioTrack);
    } else if (!on && this.audioTrack) {
      this.audioTrack.stop();
      this.localStream.removeTrack(this.audioTrack);
      this.audioTrack = null;
    }
    this.syncSenders();
    this.emit('local', this.state);
  }

  async setCam(on) {
    if (on && !this.videoTrack) {
      const hd = this.settings.hd;
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: hd ? 1280 : 640 }, height: { ideal: hd ? 720 : 360 }, frameRate: { ideal: 24 },
          ...(this.settings.camId ? { deviceId: { exact: this.settings.camId } } : {}),
        },
      });
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
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      this.screenStream = s;
      this.screenTrack = s.getVideoTracks()[0];
      this.screenTrack.addEventListener('ended', () => this.setScreen(false));
      for (const id of this.peers.keys()) this.send(id, { meta: { screen: s.id } });
    } else if (!on && this.screenTrack) {
      this.screenTrack.stop();
      this.screenTrack = null;
      this.screenStream = null;
    }
    this.syncSenders();
    this.emit('local', this.state);
  }

  async restartTracks() {
    const { mic, cam } = this.state;
    if (mic) { await this.setMic(false); await this.setMic(true); }
    if (cam) { await this.setCam(false); await this.setCam(true); }
  }

  syncSenders() {
    for (const p of this.peers.values()) this.attachTracks(p);
  }

  attachTracks(p) {
    const wanted = { audio: this.audioTrack, video: this.videoTrack, screen: this.screenTrack };
    for (const kind of ['audio', 'video', 'screen']) {
      const track = wanted[kind];
      const sender = p.senders[kind];
      if (track && !sender) {
        p.senders[kind] = p.pc.addTrack(track, kind === 'screen' ? this.screenStream : this.localStream);
      } else if (sender && sender.track !== track) {
        if (track) sender.replaceTrack(track).catch(() => {});
        else {
          try { p.pc.removeTrack(sender); } catch { /* cerrado */ }
          delete p.senders[kind];
        }
      }
    }
  }

  // ---------- Pares ----------
  setPeers(ids) {
    const wanted = new Set(ids);
    for (const id of wanted) {
      clearTimeout(this.closeTimers.get(id));
      this.closeTimers.delete(id);
      if (!this.peers.has(id)) this.createPeer(id);
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
    const p = {
      id, pc, audio,
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
    this.emit('peers', this.peerList());
  }

  closePeer(id, notify) {
    const p = this.peers.get(id);
    if (!p) return;
    if (notify) this.send(id, { bye: true });
    p.pc.close();
    p.audio.srcObject = null;
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
    for (const id of [...this.peers.keys()]) this.closePeer(id, true);
    this.audioTrack?.stop();
    this.videoTrack?.stop();
    this.screenTrack?.stop();
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
