// Reporta al servidor los errores del navegador (sin repetir el mismo).
const seen = new Set();

function report(message, stack) {
  const key = String(message).slice(0, 120);
  if (!message || seen.has(key) || seen.size > 20) return;
  seen.add(key);
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: String(message), stack: String(stack || ''), url: location.pathname }),
    keepalive: true,
  }).catch(() => {});
}

export function installErrorReporting() {
  if (import.meta.env.DEV) return;
  window.addEventListener('error', (e) => {
    // Errores de carga de imágenes o scripts de terceros no aportan
    if (!e.error && !e.message) return;
    report(e.message, e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (r?.name === 'AbortError' || r?.name === 'NotAllowedError') return;
    report(r?.message || String(r), r?.stack);
  });
}
