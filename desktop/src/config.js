// Configuración local de la app (JSON en la carpeta de datos del usuario)
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = {
  officeUrl: '', // origen de la oficina, p. ej. https://oficina.gtahub.gg
  toggleShortcut: 'CommandOrControl+Shift+M', // silenciar / activar micrófono
  ptt: {
    enabled: false, // mantener para hablar
    // Tecla debajo de Esc (`). Puede ser { type: 'mouse', button: 4 } para el botón lateral del ratón
    input: { type: 'key', keycode: 41, label: '` (debajo de Esc)' },
  },
  excludeOwnAudio: true, // no mandar el audio de Nuvora al compartir pantalla (evita eco)
  bounds: null,
};

const file = () => path.join(app.getPath('userData'), 'config.json');
let cache = null;

function load() {
  if (cache) return cache;
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cache = { ...DEFAULTS, ...saved, ptt: { ...DEFAULTS.ptt, ...(saved.ptt || {}) } };
  } catch {
    cache = structuredClone(DEFAULTS);
  }
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('No se pudo guardar la configuración', e);
  }
  return cache;
}

// Normaliza lo que escribe la persona: "oficina.gtahub.gg" -> "https://oficina.gtahub.gg"
function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Escribe la dirección de tu oficina.');
  // Sin protocolo: https, salvo en pruebas locales
  if (!/^https?:\/\//i.test(s)) s = `${/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s) ? 'http' : 'https'}://${s}`;
  let u;
  try { u = new URL(s); } catch { throw new Error('La dirección no es válida.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) throw new Error('La oficina debe usar https:// (el micrófono lo requiere).');
  return u.origin;
}

module.exports = { load, save, normalizeUrl, DEFAULTS };
