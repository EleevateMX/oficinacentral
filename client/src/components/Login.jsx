import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api.js';
import AuthLayout from './AuthLayout.jsx';
import { returnInfo, discordMessage } from '../App.jsx';

// Logo de Discord (marca) para el botón de entrar
export function DiscordIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.8a13.7 13.7 0 0 0-.63 1.3 18.4 18.4 0 0 0-5.53 0 13 13 0 0 0-.64-1.3 19.7 19.7 0 0 0-4.93 1.53C.54 9.04-.32 13.58.1 18.06a19.9 19.9 0 0 0 6.04 3.05c.49-.67.92-1.38 1.3-2.12a12.9 12.9 0 0 1-2.04-.98l.5-.39a14.2 14.2 0 0 0 12.2 0l.5.39c-.65.38-1.33.71-2.05.98.38.74.82 1.45 1.3 2.12a19.8 19.8 0 0 0 6.05-3.05c.5-5.2-.84-9.7-3.58-13.69ZM8.02 15.3c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42 2.18 1.1 2.16 2.42c0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.19 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42 2.18 1.1 2.16 2.42c0 1.33-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}

export function PasswordInput({ value, onChange, autoComplete = 'current-password', id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export default function Login({ config, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(returnInfo.discord && !['linked', 'welcome', 'ok'].includes(returnInfo.discord) ? discordMessage || '' : '');
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(returnInfo.login2fa || null);
  const [code, setCode] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/auth/login', { username, password });
      if (r.needs2fa) { setTicket(r.ticket); setBusy(false); return; }
      await onLogin();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/2fa', { ticket, code });
      await onLogin();
    } catch (err) {
      setError(err.message);
      setBusy(false);
      if (/expiró/.test(err.message)) { setTicket(null); setCode(''); }
    }
  };

  if (ticket) {
    return (
      <AuthLayout config={config} title="Verificación en dos pasos" subtitle="Escribe el código de 6 dígitos de tu app de autenticación">
        <form onSubmit={submitCode} className="auth-form">
          <label htmlFor="c">Código</label>
          <input id="c" className="code-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={11} autoFocus required />
          {error && <div className="auth-error">{error}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Verificando…' : 'Verificar'}</button>
          <p className="auth-foot">¿Perdiste tu teléfono? Usa uno de tus códigos de respaldo, o pide a un administrador que quite la verificación.</p>
          <button type="button" className="link-btn" onClick={() => { setTicket(null); setCode(''); setError(''); }}>Volver</button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout config={config} title={config.officeName} subtitle="Oficina virtual privada del equipo">
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="u">Usuario</label>
        <input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        <label htmlFor="p">Contraseña</label>
        <PasswordInput id="p" value={password} onChange={setPassword} />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        {config.discordLogin && (
          <>
            <div className="auth-or"><span>o</span></div>
            <a className="btn block discord-btn" href="/api/auth/discord?mode=login"><DiscordIcon /> Entrar con Discord</a>
          </>
        )}
        <p className="auth-foot">¿No tienes cuenta? Pide una invitación a un administrador.</p>
      </form>
    </AuthLayout>
  );
}
