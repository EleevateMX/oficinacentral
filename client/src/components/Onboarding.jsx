// Pantalla de carga y "Primeros pasos" para quien entra por primera vez.
import React, { useEffect, useState } from 'react';
import { Armchair, PawPrint, Shirt, Mic, Keyboard, ArrowRight, Sparkles } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { OfficeMark } from './brand.jsx';
import { Kbd } from './ui.jsx';

const LOADING = ['Cargando texturas…', 'Acomodando escritorios…', 'Regando las plantas…', 'Despertando a las mascotas…', 'Conectando con tu equipo…', 'Preparando el café…'];

export function Loader({ config }) {
  const [i, setI] = useState(0);
  const [pct, setPct] = useState(6);
  useEffect(() => {
    const t1 = setInterval(() => setI((n) => (n + 1) % LOADING.length), 700);
    const t2 = setInterval(() => setPct((p) => Math.min(94, p + (100 - p) * 0.12)), 180);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);
  return (
    <div className="loader">
      <div className="loader-logo"><OfficeMark config={config || {}} size={64} /></div>
      <div className="loader-name">{config?.officeName || 'Oficina virtual'}</div>
      <div className="loader-bar"><div style={{ width: `${pct}%` }} /></div>
      <div className="loader-text">{LOADING[i]}</div>
    </div>
  );
}

const STEPS = [
  { icon: Shirt, title: 'Arma tu personaje', text: 'Elige un personaje y cámbiale peinado, ropa y accesorios.', action: ['Personalizar avatar', () => office.set({ modal: { type: 'profile', step: 'avatar' } })] },
  { icon: PawPrint, title: 'Tu mascota', text: 'Más de 50 mascotas para que te acompañen por la oficina. Ponle nombre y sube una foto de tu mascota real.', action: ['Elegir mascota', () => office.set({ modal: { type: 'profile', step: 'avatar', tab: 'pet' } })] },
  { icon: Armchair, title: 'Reclama tu escritorio', text: 'Pasa el mouse sobre un escritorio libre de tu departamento y dale "Reclamar". Luego decóralo con el pincel. Con Ctrl+D regresas a él desde donde estés.' },
  { icon: Mic, title: 'Habla y comparte pantalla', text: 'Acércate a alguien o entra a una sala y ya pueden hablar. Comparte tu pantalla desde la barra de abajo; varios pueden transmitir a la vez.' },
  { icon: Keyboard, title: 'Atajos útiles', keys: true },
];

export default function Onboarding() {
  const me = useOffice((s) => s.users[s.me.id] || s.me);
  const [step, setStep] = useState(-1); // -1 = nombre
  const [name, setName] = useState(me.displayName || '');
  const [hide, setHide] = useState(true);
  const [err, setErr] = useState('');

  const finish = () => {
    office.updatePrefs({ onboarding: { ...office.state.prefs.onboarding, hide, seen: true } });
    office.set({ onboarding: false });
  };
  const saveName = async () => {
    const n = name.trim();
    if (!n) { setErr('Escribe cómo quieres que te vean'); return; }
    try {
      if (n !== me.displayName) await api.patch('/me', { displayName: n.slice(0, 40) });
      setStep(0);
    } catch (e) { setErr(e.message); }
  };
  const s = STEPS[step];

  return (
    <div className="modal-backdrop onb-back">
      <div className="onb" role="dialog" aria-modal="true" aria-label="Primeros pasos">
        {step === -1 ? (
          <>
            <div className="onb-icon"><Sparkles size={22} /></div>
            <h2>¡Bienvenido a la oficina!</h2>
            <p className="muted">¿Con qué nombre quieres que te vean los demás?</p>
            <input autoFocus value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && saveName()} placeholder="Tu nombre" />
            {err && <div className="form-error">{err}</div>}
          </>
        ) : (
          <>
            <div className="onb-icon"><s.icon size={22} /></div>
            <div className="onb-count">Paso {step + 1} de {STEPS.length}</div>
            <h2>{s.title}</h2>
            {s.keys ? (
              <ul className="onb-keys">
                <li><Kbd>Ctrl</Kbd><Kbd>D</Kbd> Regresar a tu escritorio</li>
                <li><Kbd>Shift</Kbd> + flechas · Correr</li>
                <li><Kbd>1</Kbd>–<Kbd>6</Kbd> Reacciones (👋 👍 ❤️ 😂 🎉 🔥)</li>
                <li><Kbd>Ctrl</Kbd><Kbd>K</Kbd> Buscar personas, salas y chats</li>
                <li><Kbd>X</Kbd> Usar pizarrones y pantallas</li>
              </ul>
            ) : <p>{s.text}</p>}
            {s.action && <button className="btn" onClick={() => { s.action[1](); finish(); }}>{s.action[0]}</button>}
            <div className="onb-dots">{STEPS.map((_, k) => <span key={k} className={k === step ? 'on' : ''} />)}</div>
          </>
        )}
        <div className="onb-foot">
          <label className="onb-check"><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> No mostrar después</label>
          <div className="row gap8">
            {step >= 0 && <button className="btn" onClick={finish}>Saltar</button>}
            <button className="btn primary" onClick={() => (step === -1 ? saveName() : step < STEPS.length - 1 ? setStep(step + 1) : finish())}>
              {step === STEPS.length - 1 ? '¡Listo!' : 'Siguiente'} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
