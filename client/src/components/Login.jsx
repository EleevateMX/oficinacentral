import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api.js';
import AuthLayout from './AuthLayout.jsx';

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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(null);
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
        <p className="auth-foot">¿No tienes cuenta? Pide una invitación a un administrador.</p>
      </form>
    </AuthLayout>
  );
}
