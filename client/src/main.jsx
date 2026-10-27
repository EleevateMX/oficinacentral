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

createRoot(document.getElementById('root')).render(<App />);
registerServiceWorker();
