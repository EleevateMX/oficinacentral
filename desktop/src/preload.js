// Preload de la oficina: expone una API mínima en window.nuvoraDesktop.
// Corre en sandbox; solo usa contextBridge e ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron');

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] || '';

function listen(channel, cb) {
  const h = (_e, value) => cb(value);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}

contextBridge.exposeInMainWorld('nuvoraDesktop', {
  version: arg('nuvora-version'),
  platform: process.platform,
  // Si conviene pedir que el audio compartido no incluya el de la propia app
  restrictOwnAudio: arg('nuvora-restrict-own-audio') === '1',
  // Mantener para hablar: cb(true) al presionar, cb(false) al soltar
  onPushToTalk: (cb) => listen('nuvora:ptt', (pressed) => cb(!!pressed)),
  // Atajo global o bandeja: alternar micrófono
  onToggleMute: (cb) => listen('nuvora:toggle-mute', () => cb()),
  // La persona cerró el selector de pantalla sin elegir
  onScreenPickCancel: (cb) => listen('nuvora:picker-cancel', () => cb()),
  // La página avisa el estado del micrófono (para el menú de la bandeja)
  setMicState: (on) => ipcRenderer.send('nuvora:mic-state', !!on),
  openSettings: () => ipcRenderer.send('nuvora:open-settings'),
  changeOffice: () => ipcRenderer.send('nuvora:change-office'),
});
