// Pantalla cuando la oficina no carga (sin internet o servidor caído)
const q = new URLSearchParams(location.search);
const url = q.get('url') || '';
document.getElementById('url').textContent = url || '—';
document.getElementById('error').textContent = q.get('error') ? `Detalle: ${q.get('error')}` : '';
document.getElementById('retry').addEventListener('click', () => { if (url) location.href = url; });
document.getElementById('change').addEventListener('click', () => window.nuvoraDesktop?.changeOffice());
// Reintenta solo cada 15 segundos
setTimeout(function retry() { if (navigator.onLine && url) location.href = url; else setTimeout(retry, 15000); }, 15000);
