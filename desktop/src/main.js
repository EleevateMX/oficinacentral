// Nuvora para escritorio: envuelve la oficina web en una ventana de Electron
// y añade atajos globales para el micrófono, selector de pantalla con audio
// del sistema, bandeja del sistema e inicio con el sistema.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const {
  app, BrowserWindow, Menu, Tray, ipcMain, shell, session, desktopCapturer, nativeImage, systemPreferences, net,
} = require('electron');
const config = require('./config');
const hotkeys = require('./hotkeys');

const APP_ID = 'mx.nuvora.desktop';
const ASSETS = path.join(__dirname, '..', 'assets');
const UI = path.join(__dirname, 'ui');
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const LOGIN_ARGS = ['--hidden'];
const OFFLINE_URL = pathToFileURL(path.join(UI, 'offline.html')).href;

let mainWindow = null;
let setupWindow = null;
let settingsWindow = null;
let pickerWindow = null;
let pickerState = null; // { sources, audioRequested, resolve }
let tray = null;
let quitting = false;
let micOn = false;
let hiddenTipShown = false;

// ---------- Utilidades ----------
function officeOrigin() {
  return config.load().officeUrl || '';
}

function isOffice(url) {
  try { return !!officeOrigin() && new URL(url).origin === officeOrigin(); } catch { return false; }
}

function openExternal(url) {
  try {
    const u = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(u.protocol)) shell.openExternal(u.href);
  } catch { /* enlace inválido */ }
}

function from(win, event) {
  return !!win && !win.isDestroyed() && event.sender === win.webContents;
}

// Versión del sistema: [mayor, menor] del kernel (Darwin) o compilación de Windows
function osVersion() {
  const parts = os.release().split('.').map(Number);
  return parts;
}

// Audio del sistema al compartir pantalla
function systemAudioSupport() {
  if (isWin) return { ok: true, note: '' };
  if (isMac) {
    const [darwin] = osVersion();
    // Darwin 22 = macOS 13 Ventura. Desde ahí Chromium captura el audio con ScreenCaptureKit
    // o, en 14.2+, con CoreAudio Tap (pide permiso "Grabación de audio del sistema").
    if (darwin >= 22) return { ok: true, note: 'macOS te pedirá permiso para grabar el audio del sistema la primera vez.' };
    return { ok: false, note: 'El audio del sistema requiere macOS 13 o superior.' };
  }
  return { ok: false, note: 'El audio del sistema no está disponible en Linux.' };
}

// Excluir el audio de la propia app (voces de la oficina) al compartir: Windows 11 y macOS 14.2+
function restrictOwnAudioSupported() {
  const [a, b, c] = osVersion();
  if (isWin) return a >= 10 && (c || 0) >= 22000;
  if (isMac) return a > 23 || (a === 23 && b >= 2);
  return false;
}

function icon(name = 'icon.png') {
  return nativeImage.createFromPath(path.join(ASSETS, name));
}

// ---------- Ventana principal ----------
function showMain() {
  if (!officeOrigin()) return openSetup();
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createMainWindow({ hidden = false } = {}) {
  const b = config.load().bounds || {};
  mainWindow = new BrowserWindow({
    width: b.width || 1280,
    height: b.height || 800,
    x: b.x,
    y: b.y,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: 'Nuvora',
    icon: icon(),
    backgroundColor: '#0A2B2C',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Que el audio y la proximidad sigan al minimizar o mientras juegas
      backgroundThrottling: false,
      additionalArguments: [
        `--nuvora-version=${app.getVersion()}`,
        `--nuvora-restrict-own-audio=${config.load().excludeOwnAudio && restrictOwnAudioSupported() ? 1 : 0}`,
      ],
    },
  });
  if (b.maximized) mainWindow.maximize();
  const wc = mainWindow.webContents;

  // Solo se navega dentro de la oficina; lo demás se abre en el navegador
  wc.setWindowOpenHandler(({ url }) => {
    if (isOffice(url)) mainWindow.loadURL(url);
    else openExternal(url);
    return { action: 'deny' };
  });
  const guard = (e, url) => {
    if (isOffice(url) || url.startsWith(OFFLINE_URL)) return;
    e.preventDefault();
    openExternal(url);
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = navegación cancelada
    mainWindow.loadFile(path.join(UI, 'offline.html'), { query: { url: officeOrigin(), error: desc } });
  });
  wc.on('render-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit') setTimeout(() => mainWindow && !mainWindow.isDestroyed() && wc.reload(), 1000);
  });
  wc.on('did-start-navigation', (d) => {
    if (d.isMainFrame && !d.isSameDocument) setMicState(false);
  });

  // Cerrar oculta a la bandeja
  mainWindow.on('close', (e) => {
    saveBounds();
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!hiddenTipShown && tray && isWin) {
      hiddenTipShown = true;
      tray.displayBalloon({ title: 'Nuvora sigue abierta', content: 'Está en la bandeja del sistema. Usa "Salir" para cerrarla.', iconType: 'info' });
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.once('ready-to-show', () => { if (!hidden) mainWindow.show(); });

  mainWindow.loadURL(officeOrigin());
  return mainWindow;
}

function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const maximized = mainWindow.isMaximized();
  const bounds = maximized ? (config.load().bounds || {}) : mainWindow.getNormalBounds();
  config.save({ bounds: { ...bounds, maximized } });
}

function sendToOffice(channel, value) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!isOffice(mainWindow.webContents.getURL())) return;
  mainWindow.webContents.send(channel, value);
}

function setMicState(on) {
  if (micOn === on) return;
  micOn = on;
  updateTray();
}

// ---------- Elegir oficina ----------
function openSetup() {
  if (setupWindow) return setupWindow.focus();
  setupWindow = new BrowserWindow({
    width: 520,
    height: 460,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Nuvora — Elegir oficina',
    icon: icon(),
    backgroundColor: '#0A2B2C',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'ui-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  setupWindow.on('closed', () => {
    setupWindow = null;
    // Si no hay oficina configurada no hay nada que mostrar
    if (!officeOrigin() && !quitting) app.quit();
  });
  setupWindow.once('ready-to-show', () => setupWindow.show());
  lockLocal(setupWindow);
  setupWindow.loadFile(path.join(UI, 'setup.html'));
}

// Comprueba que la dirección responde como una oficina de Nuvora
async function checkOffice(origin) {
  try {
    const res = await net.fetch(`${origin}/api/config`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { error: `La oficina respondió con un error (${res.status}).` };
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object' || !('officeName' in data)) return { error: 'Esa dirección no parece una oficina de Nuvora.' };
    return { name: data.officeName };
  } catch {
    return { error: 'No se pudo conectar. Revisa la dirección y tu conexión.' };
  }
}

// ---------- Configuración ----------
function openSettings() {
  if (settingsWindow) return settingsWindow.focus();
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 640,
    resizable: false,
    maximizable: false,
    title: 'Nuvora — Configuración',
    icon: icon(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'ui-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  lockLocal(settingsWindow);
  settingsWindow.loadFile(path.join(UI, 'settings.html'));
}

// Las ventanas locales no navegan ni abren otras ventanas
function lockLocal(win) {
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
}

function loginItem() {
  if (!isWin && !isMac) return null;
  return app.getLoginItemSettings(isWin ? { args: LOGIN_ARGS } : undefined).openAtLogin;
}

function setLoginItem(on) {
  if (!isWin && !isMac) return;
  app.setLoginItemSettings({ openAtLogin: !!on, ...(isWin ? { args: LOGIN_ARGS } : {}) });
  updateTray();
}

function settingsPayload() {
  const cfg = config.load();
  return {
    officeUrl: cfg.officeUrl,
    toggleShortcut: cfg.toggleShortcut,
    ptt: cfg.ptt,
    excludeOwnAudio: cfg.excludeOwnAudio,
    restrictOwnAudioSupported: restrictOwnAudioSupported(),
    loginItem: loginItem(),
    platform: process.platform,
    systemAudio: systemAudioSupport(),
    status: hotkeys.status(),
    version: app.getVersion(),
  };
}

function applyHotkeys() {
  return hotkeys.apply(config.load());
}

// ---------- Selector de pantalla ----------
function pickSource(sources, audioRequested) {
  return new Promise((resolve) => {
    pickerState = { sources, audioRequested, resolve };
    pickerWindow = new BrowserWindow({
      width: 820,
      height: 600,
      minWidth: 560,
      minHeight: 420,
      parent: mainWindow || undefined,
      modal: !!mainWindow && !isMac,
      title: 'Compartir pantalla',
      icon: icon(),
      autoHideMenuBar: true,
      show: false,
      webPreferences: { preload: path.join(__dirname, 'ui-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    pickerWindow.once('ready-to-show', () => pickerWindow.show());
    pickerWindow.on('closed', () => {
      pickerWindow = null;
      if (pickerState) { pickerState.resolve(null); pickerState = null; }
    });
    lockLocal(pickerWindow);
    pickerWindow.loadFile(path.join(UI, 'picker.html'));
  });
}

async function onDisplayMediaRequest(request, callback) {
  const origin = request.securityOrigin || request.frame?.url || '';
  if (!isOffice(origin) || pickerWindow) return callback(null);
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    const choice = await pickSource(sources, !!request.audioRequested);
    const src = choice && sources.find((s) => s.id === choice.id);
    if (!src) {
      sendToOffice('nuvora:picker-cancel');
      return callback(null);
    }
    const streams = { video: { id: src.id, name: src.name } };
    // 'loopback' = todo el audio que sale por las bocinas
    if (request.audioRequested && choice.audio && systemAudioSupport().ok) streams.audio = 'loopback';
    callback(streams);
  } catch (e) {
    console.error('Selector de pantalla', e);
    sendToOffice('nuvora:picker-cancel');
    callback(null);
  }
}

// ---------- Bandeja y menú ----------
function trayTemplate() {
  const login = loginItem();
  return [
    { label: 'Abrir Nuvora', click: showMain },
    { label: micOn ? 'Silenciar micrófono' : 'Activar micrófono', click: () => sendToOffice('nuvora:toggle-mute'), enabled: !!mainWindow },
    { type: 'separator' },
    { label: 'Configuración…', click: openSettings },
    { label: 'Cambiar oficina…', click: openSetup },
    ...(login === null ? [] : [{ label: 'Iniciar con el sistema', type: 'checkbox', checked: login, click: (item) => setLoginItem(item.checked) }]),
    { type: 'separator' },
    { label: 'Salir', click: quit },
  ];
}

function createTray() {
  tray = new Tray(icon('tray.png'));
  tray.setToolTip('Nuvora');
  tray.on('click', showMain);
  updateTray();
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(trayTemplate()));
  tray.setToolTip(micOn ? 'Nuvora — micrófono activo' : 'Nuvora');
}

function createMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu', label: 'Nuvora' }] : []),
    {
      label: isMac ? 'Oficina' : 'Nuvora',
      submenu: [
        { label: 'Configuración…', accelerator: 'CmdOrCtrl+,', click: openSettings },
        { label: 'Cambiar oficina…', click: openSetup },
        { type: 'separator' },
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { label: 'Herramientas de desarrollo', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools() },
        ...(isMac ? [] : [{ type: 'separator' }, { label: 'Salir', accelerator: 'Ctrl+Q', click: quit }]),
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' },
        { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'resetZoom', label: 'Tamaño real' }, { role: 'zoomIn', label: 'Acercar' }, { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' }, { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    ...(isMac ? [{ role: 'windowMenu', label: 'Ventana' }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function quit() {
  quitting = true;
  app.quit();
}

// ---------- Permisos ----------
const PERMISOS = new Set(['media', 'display-capture', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection']);

function setupSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    const ok = PERMISOS.has(permission) && isOffice(details.requestingUrl || wc.getURL());
    if (!ok) return callback(false);
    // macOS pide su propio permiso para micrófono y cámara
    if (isMac && permission === 'media') {
      const types = details.mediaTypes || [];
      try {
        if (types.includes('audio')) await systemPreferences.askForMediaAccess('microphone');
        if (types.includes('video')) await systemPreferences.askForMediaAccess('camera');
      } catch { /* sigue; el navegador dará el error */ }
    }
    callback(true);
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => PERMISOS.has(permission) && isOffice(origin));
  ses.setDisplayMediaRequestHandler(onDisplayMediaRequest);
}

// ---------- IPC ----------
function setupIpc() {
  ipcMain.on('nuvora:mic-state', (e, on) => { if (from(mainWindow, e)) setMicState(!!on); });
  ipcMain.on('nuvora:open-settings', (e) => { if (from(mainWindow, e)) openSettings(); });
  ipcMain.on('nuvora:change-office', (e) => { if (from(mainWindow, e)) openSetup(); });

  ipcMain.handle('setup:get', (e) => (from(setupWindow, e) ? { officeUrl: officeOrigin() } : null));
  ipcMain.handle('setup:save', async (e, input) => {
    if (!from(setupWindow, e)) return { error: 'No permitido' };
    let origin;
    try { origin = config.normalizeUrl(input); } catch (err) { return { error: err.message }; }
    const check = await checkOffice(origin);
    if (check.error) return check;
    const changed = origin !== officeOrigin();
    config.save({ officeUrl: origin });
    if (!mainWindow) createMainWindow();
    else if (changed || !isOffice(mainWindow.webContents.getURL())) mainWindow.loadURL(origin);
    showMain();
    setupWindow?.close();
    return { ok: true, name: check.name };
  });

  ipcMain.handle('settings:get', (e) => (from(settingsWindow, e) ? settingsPayload() : null));
  ipcMain.handle('settings:save', (e, patch = {}) => {
    if (!from(settingsWindow, e)) return null;
    const next = {};
    if (typeof patch.toggleShortcut === 'string') next.toggleShortcut = patch.toggleShortcut.slice(0, 60);
    if (patch.ptt && typeof patch.ptt === 'object') {
      const cur = config.load().ptt;
      const input = patch.ptt.input && ['key', 'mouse'].includes(patch.ptt.input.type) ? {
        type: patch.ptt.input.type,
        ...(patch.ptt.input.type === 'key' ? { keycode: Number(patch.ptt.input.keycode) } : { button: Number(patch.ptt.input.button) }),
        label: String(patch.ptt.input.label || '').slice(0, 40),
      } : cur.input;
      next.ptt = { enabled: typeof patch.ptt.enabled === 'boolean' ? patch.ptt.enabled : cur.enabled, input };
    }
    if (typeof patch.excludeOwnAudio === 'boolean') next.excludeOwnAudio = patch.excludeOwnAudio;
    config.save(next);
    if (typeof patch.loginItem === 'boolean') setLoginItem(patch.loginItem);
    applyHotkeys();
    return settingsPayload();
  });
  ipcMain.handle('settings:capture', (e) => (from(settingsWindow, e) ? hotkeys.captureNext() : null));
  ipcMain.handle('settings:change-office', (e) => { if (from(settingsWindow, e)) openSetup(); });

  ipcMain.handle('picker:get', (e) => {
    if (!from(pickerWindow, e) || !pickerState) return null;
    let screenPermission = 'granted';
    if (isMac) screenPermission = systemPreferences.getMediaAccessStatus('screen');
    let n = 0;
    return {
      audioRequested: pickerState.audioRequested,
      systemAudio: systemAudioSupport(),
      screenPermission,
      sources: pickerState.sources.map((s) => {
        const screen = s.id.startsWith('screen:');
        if (screen) n += 1;
        return {
          id: s.id,
          type: screen ? 'screen' : 'window',
          name: screen ? (pickerState.sources.filter((x) => x.id.startsWith('screen:')).length > 1 ? `Pantalla ${n}` : 'Pantalla completa') : s.name,
          thumb: s.thumbnail?.isEmpty() ? '' : s.thumbnail.toDataURL(),
          icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.resize({ width: 16, height: 16 }).toDataURL() : '',
        };
      }),
    };
  });
  ipcMain.handle('picker:choose', (e, choice) => {
    if (!from(pickerWindow, e) || !pickerState) return;
    const st = pickerState;
    pickerState = null;
    st.resolve(choice && typeof choice.id === 'string' ? { id: choice.id, audio: !!choice.audio } : null);
    pickerWindow.close();
  });
}

// ---------- Arranque ----------
// Una sola instancia: si se abre otra vez, se muestra la ventana existente
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Notificaciones nativas en Windows (debe coincidir con build.appId)
  if (isWin) app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => showMain());
  app.on('before-quit', () => { quitting = true; saveBounds(); });
  app.on('will-quit', () => hotkeys.dispose());
  app.on('activate', () => showMain()); // macOS: clic en el Dock
  app.on('window-all-closed', () => { /* sigue en la bandeja */ });

  app.whenReady().then(() => {
    createMenu();
    setupSession();
    setupIpc();
    createTray();
    hotkeys.init({
      onToggle: () => sendToOffice('nuvora:toggle-mute'),
      onPtt: (pressed) => sendToOffice('nuvora:ptt', pressed),
    });
    applyHotkeys();
    const hidden = process.argv.includes('--hidden');
    if (officeOrigin()) createMainWindow({ hidden });
    else openSetup();
  });
}
