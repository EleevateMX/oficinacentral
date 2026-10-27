import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { installErrorReporting } from './lib/errors.js';

installErrorReporting();

createRoot(document.getElementById('root')).render(<App />);
