// Preload de las ventanas locales (elegir oficina, configuración, selector de pantalla)
const { contextBridge, ipcRenderer } = require('electron');

const CANALES = new Set([
  'setup:get', 'setup:save',
  'settings:get', 'settings:save', 'settings:capture', 'settings:change-office',
  'picker:get', 'picker:choose',
]);

contextBridge.exposeInMainWorld('nuvora', {
  platform: process.platform,
  invoke: (canal, ...args) => {
    if (!CANALES.has(canal)) throw new Error(`Canal no permitido: ${canal}`);
    return ipcRenderer.invoke(canal, ...args);
  },
});
