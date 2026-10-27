import React from 'react';
import { office, useOffice } from '../lib/store.js';

export default function Toasts() {
  const toasts = useOffice((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          <span>{t.title}</span>
          {t.action && <button className="btn tiny" onClick={() => { t.action.run(); office.set((st) => ({ toasts: st.toasts.filter((x) => x.id !== t.id) })); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}
