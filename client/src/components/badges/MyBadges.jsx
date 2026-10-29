// Ventana "Mis placas": todas las que tienes, elegir hasta 5 (clic o arrastrar para ordenar),
// placas de fan gratis y tu perfil de streamer (canales + "🔴 En vivo").
import React, { useEffect, useState } from 'react';
import { Award, Radio, Trash2, Check, Clock, X } from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Modal } from '../ui.jsx';
import { BadgeSlot, BadgeImg } from './Badge.jsx';
import { badgeDef, forgetUserBadges, fetchUserBadges, useBadgesVersion } from '../../lib/badges.js';
import { MAX_WORN, CATEGORIES, FAN_BADGES, PLATFORMS, LIVE_HOURS } from '@shared/badges.js';

const err = (e) => office.toast({ title: e.message, kind: 'error' });

export default function MyBadges({ userId, tab: initialTab }) {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const uid = userId || me.id;
  const isMe = uid === me.id;
  const [tab, setTab] = useState(isMe && ['fan', 'stream'].includes(initialTab) ? initialTab : 'mine');
  const [data, setData] = useState(null);
  const v = useBadgesVersion();
  const reload = () => fetchUserBadges(uid, { fresh: true }).then(setData).catch(err);
  useEffect(() => { fetchUserBadges(uid).then(setData).catch(err); }, [uid, v]);
  const close = () => office.set({ modal: null });
  const who = isMe ? 'Mis placas' : `Placas de ${users[uid]?.displayName?.split(' ')[0] || 'alguien'}`;
  return (
    <Modal title={<span className="bday-title"><Award size={20} /> {who}</span>} onClose={close} width={640} className="bdg-modal">
      {isMe && (
        <div className="seg">
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Mis placas</button>
          <button className={tab === 'fan' ? 'on' : ''} onClick={() => setTab('fan')}>Placas de fan</button>
          <button className={tab === 'stream' ? 'on' : ''} onClick={() => setTab('stream')}>Streamer</button>
        </div>
      )}
      {!data ? <div className="muted pad">Cargando…</div>
        : tab === 'mine' ? <Mine data={data} isMe={isMe} onChange={(d) => { setData(d); forgetUserBadges(uid); }} />
          : tab === 'fan' ? <Fan data={data} onChange={reload} />
            : <Streamer data={data} onChange={reload} />}
    </Modal>
  );
}

function Mine({ data, isMe, onChange }) {
  const [worn, setWorn] = useState(data.worn);
  const [drag, setDrag] = useState(null);
  useEffect(() => setWorn(data.worn), [data.worn]);
  const owned = new Map(data.owned.map((b) => [b.id, b]));
  const save = async (list) => {
    const prev = worn;
    setWorn(list);
    try { const r = await api.put('/badges/worn', { ids: list }); onChange({ ...data, worn: r.worn }); } catch (e) { setWorn(prev); err(e); }
  };
  const toggle = (id) => {
    if (!isMe) return;
    if (worn.includes(id)) save(worn.filter((x) => x !== id));
    else if (worn.length >= MAX_WORN) office.toast({ title: `Ya llevas ${MAX_WORN}. Quítate una para ponerte otra.` });
    else save([...worn, id]);
  };
  const drop = (i) => {
    if (drag == null || drag === i) return;
    const list = [...worn];
    const [x] = list.splice(drag, 1);
    list.splice(Math.min(i, list.length), 0, x);
    setDrag(null);
    save(list);
  };
  const groups = CATEGORIES.map((c) => ({ ...c, list: data.owned.filter((b) => badgeDef(b.id)?.category === c.id) })).filter((g) => g.list.length);
  return (
    <div className="bdg-mine">
      <div className="bdg-worn">
        <div className="bdg-worn-head">
          <b>{isMe ? 'Las que llevas puestas' : 'Las que lleva puestas'}</b>
          <span className="muted small">{worn.length}/{MAX_WORN}{isMe && ' · arrastra para ordenar, clic para quitar'}</span>
        </div>
        <div className="bdg-worn-row">
          {Array.from({ length: MAX_WORN }).map((_, i) => {
            const b = owned.get(worn[i]);
            return (
              <div key={worn[i] || `e${i}`} className={`bdg-worn-cell ${drag === i ? 'dragging' : ''}`} draggable={isMe && !!b}
                onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} onDragOver={(e) => { if (drag != null) e.preventDefault(); }} onDrop={() => drop(i)}>
                {b ? <BadgeSlot b={b} size={80} onClick={isMe ? () => toggle(b.id) : undefined} /> : <span className="bdg-slot empty big" />}
                <span className="bdg-pos">{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>
      {!data.owned.length && <div className="muted pad center">{isMe ? 'Aún no tienes placas. Gana logros en la oficina o ponte unas de fan 🎮' : 'Todavía no tiene placas.'}</div>}
      {groups.map((g) => (
        <div key={g.id} className="bdg-group">
          <div className="bdg-group-head"><b>{g.name}</b><span className="muted small">{g.how}</span></div>
          <div className="bdg-grid">
            {g.list.map((b) => <BadgeSlot key={b.id} b={b} size={40} selected={worn.includes(b.id)} onClick={isMe ? () => toggle(b.id) : undefined} />)}
          </div>
        </div>
      ))}
      {isMe && <button className="link-btn small" onClick={() => office.set({ modal: { type: 'achievements' } })}>Ver mis logros y lo que me falta →</button>}
    </div>
  );
}

function Fan({ data, onChange }) {
  const owned = new Set(data.owned.map((b) => b.id));
  const [busy, setBusy] = useState(null);
  const toggle = async (id) => {
    setBusy(id);
    try {
      if (owned.has(id)) await api.del(`/badges/claim/${encodeURIComponent(id)}`);
      else await api.post('/badges/claim', { id });
      forgetUserBadges(data.userId);
      await onChange();
    } catch (e) { err(e); } finally { setBusy(null); }
  };
  return (
    <div className="bdg-fan">
      <p className="muted small">Estas son gratis: ponte las de tus juegos favoritos. Se ven en tu perfil y en el Hotel.</p>
      <div className="bdg-fan-grid">
        {FAN_BADGES.map((b) => {
          const on = owned.has(b.id);
          return (
            <button key={b.id} className={`bdg-fan-item ${on ? 'on' : ''}`} onClick={() => toggle(b.id)} disabled={busy === b.id}>
              <BadgeImg id={b.id} size={80} />
              <b>{b.name.replace(/^Fan (de|del) (las |los |la |el )?/, '')}</b>
              <span className="small">{on ? <><Check size={12} /> La tienes</> : 'Ponérmela'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const fmtLeft = (ms) => { const m = Math.max(0, Math.round(ms / 60e3)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

function Streamer({ data, onChange }) {
  const [vals, setVals] = useState(() => Object.fromEntries(PLATFORMS.map((p) => [p.id, data.channels.find((c) => c.platform === p.id)?.url || ''])));
  const [platform, setPlatform] = useState(data.live?.platform || data.channels[0]?.platform || '');
  const [announce, setAnnounce] = useState('friends');
  useEffect(() => { if (!platform && data.channels[0]) setPlatform(data.channels[0].platform); }, [data.channels, platform]);
  const ch = (p) => data.channels.find((c) => c.platform === p);
  const saveCh = async (p) => {
    try { await api.put(`/badges/channels/${p}`, { value: vals[p] }); await onChange(); office.toast({ title: 'Canal guardado. Un admin lo verificará ✅' }); } catch (e) { err(e); }
  };
  const delCh = async (p) => {
    try { await api.del(`/badges/channels/${p}`); setVals((v) => ({ ...v, [p]: '' })); await onChange(); } catch (e) { err(e); }
  };
  const goLive = async () => {
    try { await api.post('/badges/live', { platform, announce: announce === 'none' ? null : announce }); await onChange(); office.toast({ title: '🔴 ¡Estás en vivo! Se apaga solo en 6 h' }); } catch (e) { err(e); }
  };
  const stop = async () => { try { await api.del('/badges/live'); await onChange(); } catch (e) { err(e); } };
  return (
    <div className="bdg-stream">
      <div className="bdg-live-box">
        {data.live ? (
          <>
            <div className="bdg-live-now"><span className="bdg-live-tag big"><span className="bdg-live-dot" />LIVE</span> En vivo en <b>{PLATFORMS.find((p) => p.id === data.live.platform)?.name}</b> · se apaga solo en {fmtLeft(data.live.expiresAt - Date.now())}</div>
            <button className="btn" onClick={stop}><X size={15} /> Terminar transmisión</button>
          </>
        ) : data.channels.length ? (
          <>
            <div className="bdg-live-form">
              <label>Plataforma
                <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {data.channels.map((c) => <option key={c.platform} value={c.platform}>{PLATFORMS.find((p) => p.id === c.platform)?.name}</option>)}
                </select>
              </label>
              <label>Avisar a
                <select value={announce} onChange={(e) => setAnnounce(e.target.value)}>
                  <option value="none">Nadie</option>
                  <option value="friends">Mis amigos del Hotel</option>
                  <option value="office">Toda la oficina</option>
                </select>
              </label>
            </div>
            <button className="btn primary bdg-golive" onClick={goLive}><span className="bdg-live-dot" /> Estoy en vivo</button>
            <div className="muted small">Se muestra “LIVE” junto a tu nombre en el mapa y en el Hotel. Se apaga solo a las {LIVE_HOURS} h.</div>
          </>
        ) : <div className="muted small">Agrega tu canal abajo para poder marcarte “🔴 En vivo”.</div>}
      </div>
      <div className="bdg-group-head"><b>Mis canales</b><span className="muted small">Pega el enlace o tu usuario. Un admin lo verifica y te da la placa.</span></div>
      {PLATFORMS.map((p) => {
        const c = ch(p.id);
        return (
          <form key={p.id} className="bdg-chan-row" onSubmit={(e) => { e.preventDefault(); saveCh(p.id); }}>
            <BadgeImg id={`stream:${p.id}`} size={40} />
            <div className="bdg-chan-main">
              <div className="bdg-chan-top"><b>{p.name}</b>{c && (c.verified ? <span className="bdg-ok"><Check size={12} /> Verificado</span> : <span className="bdg-pending"><Clock size={12} /> Por verificar</span>)}</div>
              <input className="bdg-input" value={vals[p.id]} placeholder={{ kick: 'kick.com/tucanal', twitch: 'twitch.tv/tucanal', youtube: 'youtube.com/@tucanal', tiktok: 'tiktok.com/@tucuenta' }[p.id]}
                onChange={(e) => setVals((v) => ({ ...v, [p.id]: e.target.value }))} onKeyDown={(e) => e.stopPropagation()} />
            </div>
            <button className="btn sm" disabled={!vals[p.id].trim() || vals[p.id] === c?.url}>Guardar</button>
            {c && <button type="button" className="btn icon sm" title="Quitar canal" onClick={() => delCh(p.id)}><Trash2 size={14} /></button>}
          </form>
        );
      })}
      <div className="muted small bdg-note"><Radio size={12} /> Solo se aceptan enlaces de kick.com, twitch.tv, youtube.com y tiktok.com.</div>
    </div>
  );
}
