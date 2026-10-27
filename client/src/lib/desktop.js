// Integración con la app de escritorio (carpeta desktop/). En el navegador no hace nada.
// La app expone window.nuvoraDesktop con atajos globales del micrófono.
import { office } from './store.js';

const desktop = typeof window !== 'undefined' ? window.nuvoraDesktop : null;

if (desktop) {
  document.documentElement.dataset.desktop = desktop.platform || 'desktop';

  // Mantener para hablar: se aplica en orden aunque se presione y suelte rápido
  let want = null;
  let busy = false;
  const applyMic = async () => {
    if (busy) return;
    busy = true;
    try {
      for (let i = 0; i < 4 && office.media && want !== null && !!office.state.media.mic !== want; i++) {
        await office.media.setMic(want);
      }
    } catch (e) {
      office.mediaError(e);
    } finally {
      busy = false;
    }
  };

  desktop.onPushToTalk((pressed) => {
    want = pressed;
    applyMic();
  });

  desktop.onToggleMute(() => {
    if (!office.media) return;
    want = !office.state.media.mic;
    applyMic();
  });

  // Cerrar el selector de pantalla sin elegir no es un error
  let cancelledAt = 0;
  desktop.onScreenPickCancel?.(() => { cancelledAt = Date.now(); });
  const mediaError = office.mediaError.bind(office);
  office.mediaError = (e) => {
    if (Date.now() - cancelledAt < 3000) return;
    mediaError(e);
  };

  // Al compartir pantalla, no mandar las voces de la oficina (Windows 11, macOS 14.2+)
  const md = navigator.mediaDevices;
  if (desktop.restrictOwnAudio && md?.getDisplayMedia) {
    const getDisplayMedia = md.getDisplayMedia.bind(md);
    md.getDisplayMedia = (c = {}) => getDisplayMedia(c.audio ? { ...c, audio: { ...(typeof c.audio === 'object' ? c.audio : {}), restrictOwnAudio: true } } : c);
  }

  // Estado del micrófono para el menú de la bandeja
  let last = null;
  office.subscribe(() => {
    const mic = !!office.state.media?.mic;
    if (mic !== last) {
      last = mic;
      desktop.setMicState(mic);
    }
  });
}
