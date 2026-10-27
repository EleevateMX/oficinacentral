// Extras de temporada: botón flotante en el mapa (Amigo secreto / Foto del aniversario),
// la foto conmemorativa y los ajustes del aniversario para el admin.
import React, { useEffect, useRef, useState } from 'react';
import { Download, Send, RefreshCw } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Modal, Row } from './ui.jsx';
import { BirthdayPicker } from './Birthdays.jsx';
import { composeAnniversaryPhoto } from '../lib/anniversaryPhoto.js';
import { anniversaryInfo } from '../lib/aniversario.js';
import { confetti } from '../lib/confetti.js';

// ---------- Botón de temporada sobre el mapa ----------
export function SeasonPill() {
  const season = useOffice((s) => s.config?.season);
  const config = useOffice((s) => s.config);
  const [santa, setSanta] = useState(null);
  useEffect(() => {
    if (season !== 'navidad') return undefined;
    const load = () => api.get('/santa').then(setSanta).catch(() => {});
    load();
    const s = office.socket;
    s?.on('santa', load);
    return () => s?.off('santa', load);
  }, [season]);
  if (season === 'navidad') {
    const ex = santa?.exchange;
    // Puntito cuando hay algo que hacer: inscribirte o ya salió tu amigo secreto
    const dot = santa?.canJoin || (ex?.status === 'drawn' && santa?.giftee);
    const hint = !ex ? 'Navidad' : ex.status === 'open' ? (santa?.me?.joined ? 'Ya estás dentro' : 'Inscríbete') : ex.status === 'drawn' ? (santa?.giftee ? 'Ve a quién le regalas' : 'Sorteo hecho') : '¡Revelado!';
    return (
      <button className="season-pill xmas" onClick={() => office.set({ modal: { type: 'santa' } })} title="Intercambio de regalos">
        <span className="season-pill-ico">🎁</span>
        <span className="season-pill-text"><b>Amigo secreto</b><small>{hint}</small></span>
        {dot && <span className="season-pill-dot" />}
      </button>
    );
  }
  if (season === 'aniversario') {
    const info = anniversaryInfo(config);
    return (
      <button className="season-pill party" onClick={() => office.set({ modal: { type: 'anniversaryPhoto' } })} title="Foto del aniversario">
        <span className="season-pill-ico">📸</span>
        <span className="season-pill-text"><b>Foto del aniversario</b><small>{info.years ? `¡${info.years} ${info.years === 1 ? 'año' : 'años'}!` : '¡Es nuestro aniversario!'}</small></span>
      </button>
    );
  }
  return null;
}

// ---------- Foto conmemorativa ----------
export function AnniversaryPhoto() {
  const config = useOffice((s) => s.config);
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const people = Object.values(users).filter((u) => (u.online || u.id === me.id) && !u.disabled)
    .sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.displayName.localeCompare(b.displayName)));
  const key = people.map((u) => u.id).join(',');
  const make = async () => {
    const c = await composeAnniversaryPhoto({ people, config });
    canvasRef.current = c;
    setUrl(c.toDataURL('image/png'));
  };
  useEffect(() => { make(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { confetti({ count: 120, duration: 3000 }); }, []);
  const close = () => office.set({ modal: null });
  const fileName = `aniversario-${(config.officeName || 'oficina').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.png`;
  const download = () => {
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
  };
  const share = async () => {
    const c = canvasRef.current;
    if (!c) return;
    setBusy(true);
    try {
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const res = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent(fileName), 'X-Width': c.width, 'X-Height': c.height }, body: blob });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo subir la foto');
      const conv = office.state.chat?.channels?.[0]?.conv;
      if (!conv) throw new Error('No hay un canal de chat para compartirla');
      await api.post('/messages', { conv, body: `📸 ¡Foto del aniversario! ${anniversaryInfo(config).sub} 🎉`, files: [data.file.id] });
      office.toast({ title: '📸 Foto compartida en el chat', action: { label: 'Ver', run: () => { office.openConv(conv); close(); } } });
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
    setBusy(false);
  };
  return (
    <Modal title="📸 Foto del aniversario" onClose={close} width={760} className="anniv-modal"
      footer={(
        <>
          <span className="muted small flex1">{people.length} {people.length === 1 ? 'persona conectada' : 'personas conectadas'} en la foto</span>
          <button className="btn ghost" onClick={make}><RefreshCw size={15} /> Volver a tomar</button>
          <button className="btn" onClick={download} disabled={!url}><Download size={15} /> Descargar</button>
          <button className="btn primary" onClick={share} disabled={!url || busy}><Send size={15} /> {busy ? 'Compartiendo…' : 'Compartir en el chat'}</button>
        </>
      )}>
      <div className="anniv-photo">{url ? <img src={url} alt="Foto grupal del aniversario" /> : <div className="anniv-loading">Acomodando a todos para la foto…</div>}</div>
    </Modal>
  );
}

// ---------- Ajustes del aniversario (Preferencias → Marca) ----------
export function AnniversarySettings({ config, save }) {
  const a = config.anniversary || {};
  const [year, setYear] = useState(a.year || '');
  useEffect(() => { setYear(a.year || ''); }, [a.year]);
  const info = anniversaryInfo(config);
  return (
    <Row title="Aniversario de la comunidad" desc={`Día de fundación y año. En automático, la fiesta (pastel, fuegos artificiales y foto grupal) dura ese día y los 2 anteriores.${info.years ? ` Este año: ${info.years} ${info.years === 1 ? 'año' : 'años'}.` : ''}`}>
      <div className="row gap8 anniv-settings">
        <BirthdayPicker value={a.date || ''} onChange={(v) => save({ anniversaryDate: v || null })} />
        <input type="number" className="anniv-year" placeholder="Año" min={1990} max={new Date().getFullYear()} value={year}
          onChange={(e) => setYear(e.target.value)} onBlur={() => String(year) !== String(a.year || '') && save({ anniversaryYear: year ? Number(year) : null })} />
      </div>
    </Row>
  );
}
