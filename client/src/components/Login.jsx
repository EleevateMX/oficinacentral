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

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/login', { username, password });
      await onLogin();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="GTAHUB Office" subtitle="Oficina virtual privada del equipo">
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
