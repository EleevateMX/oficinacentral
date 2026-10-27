import React from 'react';
import { Mascota, OfficeMark, ByNuvora, Logo } from './brand.jsx';
import { officeLogo } from '../lib/themes.js';

export default function AuthLayout({ config = {}, title, subtitle, children, host }) {
  const isNuvora = (config.theme || 'nuvora') === 'nuvora';
  const hasOwnMark = !!officeLogo(config);
  return (
    <div className="auth">
      <main className="auth-card">
        <div className="auth-brand">
          {hasOwnMark ? <OfficeMark config={config} size={44} /> : <Logo size={26} />}
          <div>
            <span className="auth-kicker">Oficina virtual</span>
            <h1>{config.theme === 'gtahub' && /^gtahub$/i.test(String(title)) ? <>{title}<span className="gg">.GG</span></> : title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        {children}
        <div className="auth-by"><ByNuvora variante={config.theme === 'gtahub' ? 'negativo' : 'positivo'} /></div>
      </main>
      {isNuvora && (
        <aside className="auth-host" aria-hidden="true">
          <Mascota nombre="nuvi" pose="wave" face="smile" size={170} />
          <p>{host || 'Hola, soy Nuvi. Aquí está tu equipo: entra y saluda.'}</p>
        </aside>
      )}
    </div>
  );
}
