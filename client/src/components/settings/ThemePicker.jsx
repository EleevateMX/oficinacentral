// Selector de temas: el de cada persona (Preferencias → Tema) y el de la oficina (Marca de la oficina).
// Cada tarjeta se pinta con las variables de su propio tema: es su vista previa en vivo.
import React from 'react';
import { Check } from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { THEMES, OFFICE_THEMES, GAME_THEMES, themeStyle, themeById, officeThemeId } from '../../lib/themes.js';

// Vista previa de los temas de siempre (su CSS vive en styles.css)
const LEGACY_PREVIEW = {
  nuvora: { 'auth-bg': '#F3F4EE', 'text-2': '#4D5E5C', 'radius-sm': '999px', 'display-case': 'none', 'display-spacing': '-0.02em', glow: 'rgba(21, 122, 110, .25)', bg: '#F3F4EE', panel: '#FFFFFF', 'panel-2': '#E3F0EC', border: '#DEE2D9', text: '#0A2B2C', 'text-3': '#4D5E5C', accent: '#157A6E', 'on-accent': '#FFFFFF', alt: '#FF8A3D', 'btn-primary': '#157A6E', heading: '#0A2B2C', 'font-display': "'Albert Sans', sans-serif", 'display-weight': '800', radius: '16px' },
  gtahub: { 'auth-bg': 'radial-gradient(80% 80% at 10% 0%, rgba(254, 51, 119, .35), transparent 70%), #0C0C0C', 'text-2': '#C8C8CC', 'radius-sm': '8px', 'display-spacing': '-0.01em', glow: 'rgba(254, 51, 119, .3)', bg: '#0C0C0C', panel: '#141414', 'panel-2': '#1B1B1B', border: '#2A2A2A', text: '#FFFFFF', 'text-3': '#8B8B92', accent: '#FE3377', 'on-accent': '#FFFFFF', alt: '#FFCC00', 'btn-primary': '#FE3377', heading: '#FFFFFF', 'font-display': "'Archivo Black', sans-serif", 'display-weight': '400', 'display-case': 'uppercase', radius: '12px' },
};

function previewVars(id, accent) {
  if (id === 'custom') {
    const a = accent || '#157A6E';
    return Object.fromEntries(Object.entries({ ...LEGACY_PREVIEW.nuvora, accent: a, 'btn-primary': a }).map(([k, v]) => [`--${k}`, v]));
  }
  if (LEGACY_PREVIEW[id]) return Object.fromEntries(Object.entries(LEGACY_PREVIEW[id]).map(([k, v]) => [`--${k}`, v]));
  return themeStyle(id) || {};
}

export function ThemeCard({ theme, on, onPick, note, accent }) {
  return (
    <button type="button" className={`tp-card ${on ? 'on' : ''}`} style={previewVars(theme.id, accent)} onClick={onPick} aria-pressed={on} title={theme.desc}>
      <div className="tp-prev" aria-hidden="true">
        <div className="tp-rail"><i /><s /><s /><s /></div>
        <div className="tp-panel">
          <span className="tp-title">Aa</span>
          <span className="tp-line" />
          <span className="tp-line short" />
          <span className="tp-btns"><span className="tp-btn">Entrar</span><span className="tp-dot" /></span>
        </div>
      </div>
      <div className="tp-meta">
        <span className="tp-name">{theme.name}{note && <small>{note}</small>}</span>
        <span className="tp-swatches">{(theme.swatches.length ? theme.swatches : [accent || '#157A6E', '#ffffff', '#0A2B2C']).slice(0, 5).map((c, i) => <i key={i} style={{ background: c }} />)}</span>
      </div>
      {on && <span className="tp-check"><Check size={13} strokeWidth={3} /></span>}
    </button>
  );
}

// Preferencias → Tema (de cada persona)
export function ThemePrefs() {
  const mine = useOffice((s) => s.me?.uiTheme || null);
  const config = useOffice((s) => s.config);
  const officeId = officeThemeId(config);
  const officeT = themeById(officeId);
  const pick = (id) => office.setUiTheme(id).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  const identity = THEMES.filter((t) => t.group === 'office' && t.id !== 'custom');

  return (
    <>
      <p className="tp-intro">Elige cómo ves tú la oficina. Solo cambia tu vista, se guarda en tu cuenta y te sigue en todos tus dispositivos.</p>
      <div className="pref-section">
        <div className="pref-section-title">De la oficina</div>
        <div className="tp-grid">
          <ThemeCard theme={officeT} accent={config.accent} on={!mine} onPick={() => pick(null)} note="Predeterminado" />
        </div>
      </div>
      <div className="pref-section">
        <div className="pref-section-title">Identidad</div>
        <div className="tp-grid">
          {identity.map((t) => <ThemeCard key={t.id} theme={t} on={mine === t.id} onPick={() => pick(t.id)} />)}
        </div>
      </div>
      <div className="pref-section">
        <div className="pref-section-title">Juegos</div>
        <div className="tp-grid">
          {GAME_THEMES.map((t) => <ThemeCard key={t.id} theme={t} on={mine === t.id} onPick={() => pick(t.id)} />)}
        </div>
        <p className="muted small tp-note">Colores inspirados en cada juego. No son temas oficiales ni usan logos de los juegos.</p>
      </div>
    </>
  );
}

// Marca de la oficina → Tema (lo elige el admin; es el predeterminado de todos)
export function OfficeThemeGrid({ config, onPick }) {
  const cur = officeThemeId(config);
  return (
    <>
      <div className="tp-grid">
        {OFFICE_THEMES.map((t) => <ThemeCard key={t.id} theme={t} accent={config.accent} on={cur === t.id} onPick={() => onPick(t.id)} />)}
      </div>
      <div className="pref-section-title tp-sub">Temas de juegos</div>
      <div className="tp-grid">
        {GAME_THEMES.map((t) => <ThemeCard key={t.id} theme={t} on={cur === t.id} onPick={() => onPick(t.id)} />)}
      </div>
      <p className="muted small tp-note">Es el tema de todos los que no eligieron uno propio en Preferencias → Tema.</p>
    </>
  );
}
