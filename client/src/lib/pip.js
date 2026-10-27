// Mini ventana flotante (Document Picture-in-Picture de Chrome/Edge):
// el minimapa y los controles se quedan encima de todo aunque cambies de programa.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { office } from './store.js';

export const pipSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

let pipWin = null;
let root = null;

function copyStyles(doc) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const css = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      const st = doc.createElement('style');
      st.textContent = css;
      doc.head.appendChild(st);
    } catch {
      if (sheet.href) { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = sheet.href; doc.head.appendChild(l); }
    }
  }
  for (const a of document.documentElement.attributes) doc.documentElement.setAttribute(a.name, a.value);
}

export async function openPip() {
  if (pipWin) { pipWin.focus?.(); return; }
  if (!pipSupported()) {
    office.toast({ title: 'Tu navegador no tiene mini ventana. Úsala en Chrome o Edge (o en la app de escritorio).', kind: 'error' });
    return;
  }
  pipWin = await window.documentPictureInPicture.requestWindow({ width: 340, height: 250 });
  copyStyles(pipWin.document);
  pipWin.document.title = `${office.state.config.officeName || 'Oficina'} — mini`;
  pipWin.document.body.className = 'pip-body';
  const el = pipWin.document.createElement('div');
  pipWin.document.body.appendChild(el);
  const { default: MiniWidget } = await import('../components/MiniWidget.jsx');
  root = createRoot(el);
  root.render(React.createElement(MiniWidget, { pip: true, win: pipWin }));
  office.set({ pipOpen: true });
  pipWin.addEventListener('pagehide', () => {
    root?.unmount();
    root = null;
    pipWin = null;
    office.set({ pipOpen: false });
  });
}

export function closePip() { pipWin?.close(); }

// En llamada, Chrome puede abrir la mini ventana solo al cambiar de pestaña
export function setupAutoPip() {
  try {
    navigator.mediaSession?.setActionHandler('enterpictureinpicture', () => { openPip().catch(() => {}); });
  } catch { /* el navegador no lo admite */ }
}
