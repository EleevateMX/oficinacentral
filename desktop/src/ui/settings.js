// Ventana de configuración de la app de escritorio
const $ = (id) => document.getElementById(id);
const isMac = window.nuvora.platform === 'darwin';
const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+M';
let state = null;

const save = async (patch) => {
  state = await window.nuvora.invoke('settings:save', patch);
  render();
};

function pretty(acc) {
  if (!acc) return 'Sin atajo';
  return acc.replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl').replace('Super', isMac ? 'Cmd' : 'Win');
}

function render() {
  if (!state) return;
  $('version').textContent = `Versión ${state.version}.`;
  $('shortcut').value = pretty(state.toggleShortcut);
  $('shortcutWarn').hidden = !state.toggleShortcut || state.status.shortcutOk;

  $('pttEnabled').checked = !!state.ptt.enabled;
  $('pttKey').textContent = state.ptt.input?.label || 'Sin tecla';
  const warn = $('pttWarn');
  if (!state.status.hookAvailable) {
    // Sin gancho de teclado: solo queda el modo de alternar
    warn.hidden = false;
    warn.textContent = `${state.status.hookError || 'No disponible en este equipo.'} Usa el atajo de silenciar.`;
    $('pttEnabled').disabled = true;
    $('pttCapture').disabled = true;
  } else if (state.ptt.enabled && !state.status.hookRunning) {
    warn.hidden = false;
    warn.textContent = isMac
      ? 'No se pudo escuchar el teclado. Da permiso a Nuvora en Ajustes del Sistema → Privacidad y seguridad → Accesibilidad y vuelve a abrir la app.'
      : `No se pudo escuchar el teclado. ${state.status.hookError || ''}`;
  } else {
    warn.hidden = true;
  }
  if (isMac) $('pttNote').textContent = 'Puede ser una tecla o un botón lateral del ratón. macOS pide permiso de Accesibilidad.';

  const sa = state.systemAudio;
  $('excludeOwnAudio').checked = !!state.excludeOwnAudio;
  $('excludeOwnAudio').disabled = !state.restrictOwnAudioSupported;
  $('audioNote').textContent = [
    sa.ok ? 'El selector de pantalla permite compartir el audio de la PC.' : sa.note,
    sa.ok && sa.note ? sa.note : '',
    state.restrictOwnAudioSupported ? 'El cambio se aplica al reiniciar la app.' : 'Excluir las voces requiere Windows 11 o macOS 14.2+; usa audífonos para evitar eco.',
  ].filter(Boolean).join(' ');

  $('loginRow').hidden = state.loginItem === null;
  $('loginItem').checked = !!state.loginItem;
  $('office').textContent = state.officeUrl || '—';
}

// ---------- Atajo de silenciar ----------
const CODE_KEYS = {
  Space: 'Space', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete',
  Pause: 'Pause', ScrollLock: 'Scrolllock', NumpadAdd: 'numadd', NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
};

function keyFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Numpad\d$/.test(code)) return `num${code.slice(6)}`;
  return CODE_KEYS[code] || null;
}

$('shortcut').addEventListener('keydown', (e) => {
  e.preventDefault();
  if (e.key === 'Escape') return $('shortcut').blur();
  const key = keyFromCode(e.code);
  if (!key) return; // solo modificadores por ahora
  const mods = [];
  if (e.ctrlKey) mods.push(isMac ? 'Ctrl' : 'CommandOrControl');
  if (e.metaKey) mods.push(isMac ? 'CommandOrControl' : 'Super');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  // Sin modificadores solo se permiten F1–F24 (para no robar teclas al escribir)
  if (!mods.length && !/^F\d/.test(key)) return;
  save({ toggleShortcut: [...mods, key].join('+') });
  $('shortcut').blur();
});
$('shortcut').addEventListener('focus', () => { $('shortcut').value = 'Presiona la combinación…'; });
$('shortcut').addEventListener('blur', render);
$('shortcutReset').addEventListener('click', () => save({ toggleShortcut: DEFAULT_SHORTCUT }));
$('shortcutClear').addEventListener('click', () => save({ toggleShortcut: '' }));

// ---------- Mantener para hablar ----------
$('pttEnabled').addEventListener('change', (e) => save({ ptt: { enabled: e.target.checked } }));
$('pttCapture').addEventListener('click', async () => {
  const btn = $('pttCapture');
  btn.disabled = true;
  $('pttKey').textContent = 'Presiona una tecla o botón del ratón…';
  const input = await window.nuvora.invoke('settings:capture');
  btn.disabled = false;
  if (input) await save({ ptt: { input } });
  else render();
});

// ---------- Resto ----------
$('excludeOwnAudio').addEventListener('change', (e) => save({ excludeOwnAudio: e.target.checked }));
$('loginItem').addEventListener('change', (e) => save({ loginItem: e.target.checked }));
$('changeOffice').addEventListener('click', () => window.nuvora.invoke('settings:change-office'));

window.nuvora.invoke('settings:get').then((s) => { state = s; render(); });
