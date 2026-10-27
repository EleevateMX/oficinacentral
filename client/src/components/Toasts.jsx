import React from 'react';
import { office, useOffice } from '../lib/store.js';

export default function Toasts() {
  const toasts = useOffice((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          <span>{t.title}</span>
          {[t.action, ...(t.actions || [])].filter(Boolean).map((a) => (
            <button key={a.label} className="btn tiny" onClick={() => { a.run(); office.set((st) => ({ toasts: st.toasts.filter((x) => x.id !== t.id) })); }}>{a.label}</button>
          ))}
        </div>
      ))}
    </div>
  );
}
