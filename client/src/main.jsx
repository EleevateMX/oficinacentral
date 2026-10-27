import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './lib/desktop.js'; // app de escritorio (no hace nada en el navegador)

createRoot(document.getElementById('root')).render(<App />);
