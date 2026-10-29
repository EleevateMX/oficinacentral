// Micrófono con supresión de ruido por IA (RNNoise en WebAssembly).
//
// getUserMedia (sin el filtro de ruido del navegador) → AudioContext 48 kHz →
// AudioWorklet RNNoise → MediaStreamDestination. La pista procesada es la que
// se envía (P2P o LiveKit). El worklet y el wasm se cargan solo la primera vez
// que se usan; si algo falla se usa el micrófono normal sin avisar.
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { getMedia } from './getMedia.js';

export function aiNoiseSupported() {
  return typeof window !== 'undefined' && typeof AudioWorkletNode !== 'undefined' && typeof WebAssembly === 'object' && !!window.AudioContext;
}

let wasmPromise = null;
let libPromise = null;

function loadLib() {
  libPromise ||= import('@sapphi-red/web-noise-suppressor').catch((e) => { libPromise = null; throw e; });
  return libPromise;
}

async function loadWasm() {
  const { loadRnnoise } = await loadLib();
  wasmPromise ||= loadRnnoise({ url: wasmUrl, simdUrl }).catch((e) => { wasmPromise = null; throw e; });
  return wasmPromise;
}

// Si el navegador no deja arrancar el audio sin un clic, se reanuda con el siguiente
function resumeOnGesture(ctx) {
  if (ctx.state === 'running') return;
  ctx.resume().catch(() => {});
  const go = () => {
    ctx.resume().catch(() => {});
    if (ctx.state !== 'suspended') off();
  };
  const off = () => { for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, go, true); };
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, go, true);
  ctx.addEventListener('statechange', () => { if (ctx.state !== 'suspended') off(); });
}

// Envuelve una pista de micrófono con RNNoise. Devuelve { track, stop } o lanza error.
export async function rnnoiseTrack(raw) {
  const { RnnoiseWorkletNode } = await loadLib();
  const wasmBinary = await loadWasm();
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  try {
    await ctx.audioWorklet.addModule(workletUrl);
    const src = ctx.createMediaStreamSource(new MediaStream([raw]));
    const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 1;
    src.connect(node).connect(dest);
    resumeOnGesture(ctx);
    const track = dest.stream.getAudioTracks()[0];
    // Si se desconecta el micrófono, la pista procesada también termina
    raw.addEventListener('ended', () => track.stop());
    let stopped = false;
    return {
      track,
      stop() {
        if (stopped) return;
        stopped = true;
        try { src.disconnect(); node.disconnect(); node.destroy(); } catch { /* ya cerrado */ }
        track.stop();
        ctx.close().catch(() => {});
      },
    };
  } catch (e) {
    ctx.close().catch(() => {});
    throw e;
  }
}

// Abre el micrófono según las preferencias. Devuelve { track, raw, ai, stop }:
// `track` es lo que se envía; `stop()` apaga todo (micrófono y procesado).
export async function openMic(settings) {
  const wantAi = settings.aiNoise === 'rnnoise' && aiNoiseSupported();
  const s = await getMedia('audio', (id) => ({
    // Con RNNoise se apaga el filtro del navegador para no procesar dos veces
    noiseSuppression: wantAi ? false : !!settings.noiseSuppression,
    echoCancellation: !!settings.echoCancellation,
    autoGainControl: !!settings.autoGainControl,
    channelCount: { ideal: 1 },
    ...(id ? { deviceId: { exact: id } } : {}),
  }), settings.micId);
  const raw = s.getAudioTracks()[0];
  if (wantAi) {
    try {
      const p = await rnnoiseTrack(raw);
      return { track: p.track, raw, ai: true, stop: () => { p.stop(); raw.stop(); } };
    } catch (e) {
      console.warn('RNNoise no disponible, se usa el micrófono normal', e);
      raw.applyConstraints?.({
        noiseSuppression: settings.noiseSuppression, echoCancellation: settings.echoCancellation, autoGainControl: settings.autoGainControl,
      }).catch(() => {});
    }
  }
  return { track: raw, raw, ai: false, stop: () => raw.stop() };
}
