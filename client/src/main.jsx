import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { installErrorReporting } from './lib/errors.js';
import { registerServiceWorker } from './lib/push.js';
import './lib/desktop.js'; // app de escritorio (no hace nada en el navegador)

installErrorReporting();

// Quita el ?v= que deja "Actualizar a todos" (solo servía para saltarse la caché)
if (new URLSearchParams(window.location.search).has('v')) {
  const u = new URL(window.location.href);
  u.searchParams.delete('v');
  window.history.replaceState(null, '', u.toString());
}

// Sin zoom del navegador (se perdía el mapa): el mapa tiene su propio zoom
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !e.target.closest?.('.map-wrap')) e.preventDefault(); }, { passive: false });
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
});

createRoot(document.getElementById('root')).render(<App />);
registerServiceWorker();
