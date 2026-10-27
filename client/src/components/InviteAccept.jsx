import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import AuthLayout from './AuthLayout.jsx';
import { PasswordInput } from './Login.jsx';

export default function InviteAccept({ token, config, onDone }) {
  const [invite, setInvite] = useState(undefined);
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/invites/${token}`).then((r) => {
      setInvite(r);
      setForm((f) => ({ ...f, email: r.email || '' }));
    }).catch((e) => setInvite({ error: e.message }));
  }, [token]);

  const set = (k) => (e) => setForm({ ...form, [k]: typeof e === 'string' ? e : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    setError('');
    try {
      await api.post(`/invites/${token}/accept`, form);
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (invite === undefined) return <AuthLayout config={config} title={config.officeName} subtitle="Revisando invitación…" />;
  if (invite.error) {
    return (
      <AuthLayout config={config} title="Invitación no válida" subtitle={invite.error} host="Pídele a quien te invitó un enlace nuevo; cada enlace sirve una sola vez.">
        <a className="btn primary block" href="/">Ir al inicio de sesión</a>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      config={config}
      title={`Únete a ${config.officeName}`}
      host="¡Bienvenida, bienvenido! Crea tu cuenta y elige tu personaje."
      subtitle={invite.invitedBy ? `${invite.invitedBy} te invitó a la oficina` : 'Te invitaron a la oficina'}
    >
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="dn">Nombre visible</label>
        <input id="dn" value={form.displayName} onChange={set('displayName')} maxLength={40} autoFocus required />
        <label htmlFor="un">Usuario</label>
        <input id="un" value={form.username} onChange={set('username')} autoComplete="username" pattern="[a-zA-Z0-9_.\-]{3,24}" title="3–24 caracteres: letras, números, punto, guion o guion bajo" required />
        <label htmlFor="em">Correo (opcional)</label>
        <input id="em" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        <label htmlFor="pw">Contraseña</label>
        <PasswordInput id="pw" value={form.password} onChange={set('password')} autoComplete="new-password" />
        <label htmlFor="pw2">Confirmar contraseña</label>
        <PasswordInput id="pw2" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Creando cuenta…' : 'Crear cuenta y entrar'}</button>
      </form>
    </AuthLayout>
  );
}
