import React from 'react';

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.svg" alt="" />
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
