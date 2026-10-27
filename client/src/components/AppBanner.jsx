// Avisos para el celular: instalar la app y activar las notificaciones.
import React, { useEffect, useState } from 'react';
import { X, Download, Bell, Share } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { installState, onInstallChange, promptInstall, isStandalone, pushStatus, subscribePush, isIOS } from '../lib/push.js';

const KEY = 'nuvora:banner-hide';
const hidden = (k) => { try { return JSON.parse(localStorage.getItem(KEY) || '{}')[k]; } catch { return false; } };
const hide = (k) => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); v[k] = Date.now(); localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export default function AppBanner({ mobile }) {
  const config = useOffice((s) => s.config);
  const onboarding = useOffice((s) => s.onboarding);
  const [inst, setInst] = useState(installState());
  const [push, setPush] = useState(null);
  const [closed, setClosed] = useState({ install: hidden('install'), push: hidden('push') });
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => onInstallChange(() => setInst(installState())), []);
  useEffect(() => { pushStatus().then(setPush).catch(() => setPush('unsupported')); }, []);

  if (onboarding) return null;
  const name = config.officeName || 'la oficina';
  const close = (k) => { hide(k); setClosed((c) => ({ ...c, [k]: true })); };

  // 1) En el celular sin instalar: invitar a instalar
  if (mobile && !isStandalone() && !closed.install && (inst === 'prompt' || inst === 'ios')) {
    return (
      <div className="app-banner">
        <div className="ab-icon"><Download size={18} /></div>
        <div className="ab-text">
          <b>Instala {name} en tu celular</b>
          {iosHelp
            ? <span>Toca <Share size={12} style={{ verticalAlign: '-2px' }} /> <b>Compartir</b> abajo y luego <b>Agregar a inicio</b>.</span>
            : <span>Se abre a pantalla completa y te llegan las notificaciones.</span>}
        </div>
        {inst === 'prompt'
          ? <button className="btn tiny primary" onClick={() => promptInstall().catch(() => {})}>Instalar</button>
          : !iosHelp && <button className="btn tiny primary" onClick={() => setIosHelp(true)}>Cómo</button>}
        <button className="icon-btn" aria-label="Cerrar" onClick={() => close('install')}><X size={16} /></button>
      </div>
    );
  }
  // 2) Instalada (o en computadora) sin notificaciones: invitar a activarlas
  const canPush = push === 'off' && (isStandalone() || !mobile || !isIOS());
  if (canPush && !closed.push) {
    return (
      <div className="app-banner">
        <div className="ab-icon"><Bell size={18} /></div>
        <div className="ab-text">
          <b>Activa las notificaciones</b>
          <span>Para enterarte de mensajes, saludos y juntas aunque no tengas la oficina abierta.</span>
        </div>
        <button className="btn tiny primary" onClick={async () => {
          try { await subscribePush(); setPush('on'); office.toast({ title: '🔔 Notificaciones activadas en este dispositivo' }); }
          catch (e) { office.toast({ title: e.message, kind: 'error' }); close('push'); }
        }}>Activar</button>
        <button className="icon-btn" aria-label="Cerrar" onClick={() => close('push')}><X size={16} /></button>
      </div>
    );
  }
  return null;
}
