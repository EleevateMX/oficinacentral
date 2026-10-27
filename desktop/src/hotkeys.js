// Atajos globales: funcionan aunque el juego tenga el foco.
// - Silenciar/activar: globalShortcut de Electron (solo detecta "presionar").
// - Mantener para hablar: uiohook-napi (gancho global de teclado y ratón con
//   presionar y soltar). Si no carga, se usa solo el modo de alternar.
const { globalShortcut } = require('electron');

let hook = null; // { uIOhook, UiohookKey }
let hookError = '';
let hookRunning = false;
let handlers = { onToggle: () => {}, onPtt: () => {} };
let ptt = { enabled: false, input: null };
let pressed = false;
let capture = null; // { resolve, timer }
let shortcutOk = true;
let currentShortcut = '';

function loadHook() {
  if (hook || hookError) return hook;
  try {
    hook = require('uiohook-napi');
    hook.uIOhook.on('keydown', (e) => onInput('key', e.keycode, true));
    hook.uIOhook.on('keyup', (e) => onInput('key', e.keycode, false));
    hook.uIOhook.on('mousedown', (e) => onInput('mouse', e.button, true));
    hook.uIOhook.on('mouseup', (e) => onInput('mouse', e.button, false));
  } catch (e) {
    hookError = `No se pudo cargar el gancho de teclado (${e.message}).`;
    hook = null;
  }
  return hook;
}

function keyLabel(keycode) {
  const names = hook ? Object.entries(hook.UiohookKey).filter(([, v]) => v === keycode).map(([k]) => k) : [];
  if (keycode === 41) return '` (debajo de Esc)';
  return names[0] || `Tecla ${keycode}`;
}

function onInput(type, code, down) {
  // Modo "elige una tecla" desde la configuración
  if (capture && down) {
    if (type === 'mouse' && code <= 2) return; // ignora clic izquierdo y derecho
    const c = capture;
    capture = null;
    clearTimeout(c.timer);
    const input = type === 'key'
      ? { type, keycode: code, label: keyLabel(code) }
      : { type, button: code, label: `Botón ${code} del ratón` };
    c.resolve(input);
    syncHook();
    return;
  }
  if (!ptt.enabled || !ptt.input || ptt.input.type !== type) return;
  if ((type === 'key' ? ptt.input.keycode : ptt.input.button) !== code) return;
  if (down === pressed) return; // la tecla repite "keydown" mientras se mantiene
  pressed = down;
  handlers.onPtt(down);
}

function startHook() {
  if (hookRunning || !loadHook()) return;
  try {
    hook.uIOhook.start();
    hookRunning = true;
  } catch (e) {
    hookError = `No se pudo iniciar el gancho de teclado (${e.message}).`;
  }
}

function stopHook() {
  if (!hookRunning) return;
  try { hook.uIOhook.stop(); } catch { /* ya detenido */ }
  hookRunning = false;
  if (pressed) { pressed = false; handlers.onPtt(false); }
}

// El gancho solo corre si se usa (mantener para hablar o eligiendo tecla)
function syncHook() {
  if (ptt.enabled || capture) startHook();
  else stopHook();
}

function init(h) {
  handlers = { ...handlers, ...h };
}

function apply(cfg) {
  if (currentShortcut) globalShortcut.unregister(currentShortcut);
  currentShortcut = '';
  shortcutOk = true;
  if (cfg.toggleShortcut) {
    try {
      shortcutOk = globalShortcut.register(cfg.toggleShortcut, () => handlers.onToggle());
    } catch {
      shortcutOk = false;
    }
    if (shortcutOk) currentShortcut = cfg.toggleShortcut;
  }
  ptt = { enabled: !!cfg.ptt?.enabled, input: cfg.ptt?.input || null };
  syncHook();
  return status();
}

// Espera la siguiente tecla o botón del ratón (para elegir la de "mantener para hablar")
function captureNext(ms = 10000) {
  if (capture) { clearTimeout(capture.timer); capture.resolve(null); }
  return new Promise((resolve) => {
    capture = { resolve, timer: setTimeout(() => { capture = null; resolve(null); syncHook(); }, ms) };
    syncHook();
    if (!hookRunning) { clearTimeout(capture.timer); capture = null; resolve(null); }
  });
}

function status() {
  loadHook();
  return {
    hookAvailable: !!hook && !hookError,
    hookError,
    hookRunning,
    shortcutOk,
    pttActive: ptt.enabled && hookRunning,
  };
}

function dispose() {
  globalShortcut.unregisterAll();
  stopHook();
}

module.exports = { init, apply, captureNext, status, dispose };
