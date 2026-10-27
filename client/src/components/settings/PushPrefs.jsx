// Preferencias de la app instalable y de las notificaciones push de este dispositivo.
import React, { useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Toggle, Row } from '../ui.jsx';
import {
  pushStatus, subscribePush, unsubscribePush, installState, onInstallChange, promptInstall, isIOS,
} from '../../lib/push.js';

const STATUS_TEXT = {
  on: 'Activadas en este dispositivo. Te llegan mensajes directos, @menciones, saludos, invitaciones y recordatorios aunque cierres la app.',
  off: 'Recibe avisos en el celular o la computadora aunque la app esté cerrada.',
  denied: 'El navegador bloqueó las notificaciones para este sitio. Permítelas en los ajustes del navegador y vuelve a intentarlo.',
  unsupported: isIOS()
    ? 'En iPhone y iPad (iOS 16.4 o más reciente) primero instala la app: Compartir → Agregar a inicio, y ábrela desde ahí.'
    : 'Este navegador no admite notificaciones push.',
  dev: 'Disponible solo en la versión publicada (npm run build).',
  loading: 'Revisando…',
};

export function PushDeviceRow() {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then(setStatus).catch(() => setStatus('unsupported')); }, []);

  const toggle = async (v) => {
    setBusy(true);
    try {
      if (v) await subscribePush();
      else await unsubscribePush();
      setStatus(await pushStatus());
    } catch (e) {
      office.toast({ title: e.message, kind: 'error' });
      setStatus(await pushStatus().catch(() => 'off'));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      const r = await api.post('/push/test');
      if (!r.sent) office.toast({ title: 'No se pudo enviar el aviso de prueba', kind: 'error' });
    } catch (e) {
      office.toast({ title: e.message, kind: 'error' });
    }
  };

  return (
    <>
      <Row title="Notificaciones en este dispositivo (aunque la app esté cerrada)" desc={STATUS_TEXT[status]}>
        <Toggle checked={status === 'on'} disabled={busy || !['on', 'off'].includes(status)} onChange={toggle} />
      </Row>
      {status === 'on' && (
        <div><button className="btn tiny" onClick={test}>Enviar aviso de prueba</button></div>
      )}
    </>
  );
}

export function InstallAppSection() {
  const [state, setState] = useState(installState());
  const [showIOS, setShowIOS] = useState(false);
  useEffect(() => onInstallChange(() => setState(installState())), []);
  if (state === 'none') return null;
  return (
    <div className="pref-section">
      <div className="pref-section-title">App</div>
      {state === 'installed' && (
        <Row title="Nuvora está instalada" desc="Estás usando la app instalada en este dispositivo." />
      )}
      {state === 'prompt' && (
        <Row title="Instalar app" desc="Abre la oficina desde tu pantalla de inicio o tu escritorio, en su propia ventana.">
          <button className="btn primary" onClick={() => promptInstall()}><Download size={16} /> Instalar app</button>
        </Row>
      )}
      {state === 'ios' && (
        <>
          <Row title="Instalar app" desc="Agrégala a tu pantalla de inicio para usarla como app y recibir notificaciones.">
            <button className="btn primary" onClick={() => setShowIOS((v) => !v)}><Download size={16} /> Instalar app</button>
          </Row>
          {showIOS && (
            <ol className="pref-desc" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
              <li>Abre esta página en <b>Safari</b>.</li>
              <li>Toca <b>Compartir</b> <Share size={13} style={{ verticalAlign: '-2px' }} /> en la barra de abajo.</li>
              <li>Elige <b>Agregar a inicio</b> y luego <b>Agregar</b>.</li>
              <li>Abre Nuvora desde el ícono nuevo y activa las notificaciones en Preferencias → Notificaciones.</li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}
