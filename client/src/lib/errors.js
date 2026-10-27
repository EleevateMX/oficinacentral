// Reporta al servidor los errores del navegador (sin repetir el mismo).
const seen = new Set();

// Cortes de red normales (el celular cambió de app, se perdió la señal, Safari pausó la página):
// la oficina se reconecta sola, así que no son errores que haya que avisar.
const NOISE = /^(TypeError: )?(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?|The network connection was lost\.?|cancelled|La conexión de red se perdió\.?)$/i;

function report(message, stack, where) {
  const msg = String(message || '');
  const key = msg.slice(0, 120);
  if (!msg || NOISE.test(msg) || seen.has(key) || seen.size > 20) return;
  seen.add(key);
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: msg,
      stack: String(stack || where || ''),
      url: location.pathname,
      // Instalada como app (pantalla de inicio) o en el navegador
      mode: window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone ? 'app' : 'navegador',
    }),
    keepalive: true,
  }).catch(() => {});
}

export function installErrorReporting() {
  if (import.meta.env.DEV) return;
  window.addEventListener('error', (e) => {
    // Errores de carga de imágenes o scripts de terceros no aportan
    if (!e.error && !e.message) return;
    // Safari a veces no da la pila: al menos el archivo y la línea
    const where = e.filename ? `${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : '';
    report(e.message, e.error?.stack, where);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (r?.name === 'AbortError' || r?.name === 'NotAllowedError') return;
    report(r?.message || String(r), r?.stack);
  });
}
