// Preferencias → Placas (admins): otorgar/quitar placas, crear placas personalizadas con vista
// previa en vivo, verificar canales de streamer y ver el catálogo completo.
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Check, X, Pencil, ExternalLink } from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Avatar } from '../ui.jsx';
import { BadgeImg, BadgeSlot } from './Badge.jsx';
import { badgeDef, useBadgesVersion, forgetUserBadges, loadCatalog } from '../../lib/badges.js';
import { STATIC_BADGES, CATEGORIES, SHAPES, SHAPE_NAMES, GLYPHS, PLATFORM_BY_ID, isGrantable, NAME_MAX, DESC_MAX, TEXT_RE } from '@shared/badges.js';
import { badgeUrl } from '../../lib/badgeArt.js';

const err = (e) => office.toast({ title: e.message, kind: 'error' });
const Block = ({ title, children, right }) => (
  <div className="pref-section">{title && <div className="pref-section-title bdg-sec-title"><span>{title}</span>{right}</div>}{children}</div>
);

export default function BadgesAdmin() {
  const [tab, setTab] = useState('grant');
  useBadgesVersion();
  return (
    <div className="bdg-admin">
      <div className="seg">
        <button className={tab === 'grant' ? 'on' : ''} onClick={() => setTab('grant')}>Otorgar</button>
        <button className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>Crear placa</button>
        <button className={tab === 'channels' ? 'on' : ''} onClick={() => setTab('channels')}>Canales</button>
        <button className={tab === 'catalog' ? 'on' : ''} onClick={() => setTab('catalog')}>Catálogo</button>
      </div>
      {tab === 'grant' && <Grant />}
      {tab === 'create' && <Creator />}
      {tab === 'channels' && <Channels />}
      {tab === 'catalog' && <Catalog />}
    </div>
  );
}

function useCustom() {
  const v = useBadgesVersion();
  const [list, setList] = useState([]);
  useEffect(() => { api.get('/badges/catalog').then((r) => setList(r.custom)).catch(() => {}); }, [v]);
  return list;
}

// ---------- Otorgar / quitar ----------
function Grant() {
  const users = useOffice((s) => s.users);
  const custom = useCustom();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [owned, setOwned] = useState(null);
  const [badge, setBadge] = useState('');
  const [note, setNote] = useState('');
  const people = Object.values(users).filter((u) => !u.disabled && (!q || `${u.displayName} ${u.username}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 30);
  const load = (id) => api.get(`/badges/user/${id}`).then((r) => setOwned(r.owned)).catch(err);
  useEffect(() => { if (sel) load(sel); else setOwned(null); }, [sel]);
  const grantable = [...STATIC_BADGES.filter((b) => isGrantable(b.id)), ...custom];
  const has = new Set((owned || []).map((b) => b.id));
  const grant = async () => {
    try {
      await api.post('/admin/badges/grant', { userId: sel, badgeId: badge, note });
      office.toast({ title: `🏅 Le diste «${badgeDef(badge)?.name}» a ${users[sel]?.displayName}` });
      setNote(''); setBadge(''); forgetUserBadges(sel); load(sel);
    } catch (e) { err(e); }
  };
  const revoke = async (id) => {
    if (!window.confirm(`¿Quitarle «${badgeDef(id)?.name}» a ${users[sel]?.displayName}?`)) return;
    try { await api.del(`/admin/badges/grant/${sel}/${encodeURIComponent(id)}`); forgetUserBadges(sel); load(sel); } catch (e) { err(e); }
  };
  return (
    <>
      <Block title="Persona">
        <input className="search-input bdg-search" placeholder="Buscar persona…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="bdg-people">
          {people.map((u) => (
            <button key={u.id} className={`bdg-person ${sel === u.id ? 'on' : ''}`} onClick={() => setSel(u.id)}>
              <Avatar user={u} size={26} showStatus={false} /> <span className="ellipsis">{u.displayName}</span>
            </button>
          ))}
          {!people.length && <span className="muted small">Nadie con ese nombre</span>}
        </div>
      </Block>
      {sel && (
        <>
          <Block title={`Placas de ${users[sel]?.displayName}`}>
            <div className="bdg-grid">
              {(owned || []).map((b) => (
                <span key={b.id} className="bdg-owned">
                  <BadgeSlot b={b} size={40} />
                  {b.source !== 'achievement' && <button className="bdg-x" title="Quitar" onClick={() => revoke(b.id)}><X size={11} /></button>}
                </span>
              ))}
              {owned && !owned.length && <span className="muted small">Todavía no tiene placas</span>}
            </div>
          </Block>
          <Block title="Otorgar una placa">
            {CATEGORIES.filter((c) => c.id !== 'achievement').map((c) => {
              const list = grantable.filter((b) => b.category === c.id);
              if (!list.length) return null;
              return (
                <div key={c.id} className="bdg-pick-group">
                  <small className="muted">{c.name}</small>
                  <div className="bdg-grid">
                    {list.map((b) => (
                      <button key={b.id} className={`bdg-pick ${badge === b.id ? 'on' : ''} ${has.has(b.id) ? 'has' : ''}`} title={has.has(b.id) ? `${b.name} (ya la tiene)` : b.name} disabled={has.has(b.id)} onClick={() => setBadge(b.id)}>
                        <BadgeImg id={b.id} size={40} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="bdg-grant-bar">
              {badge ? <span className="bdg-grant-sel"><BadgeImg id={badge} size={40} /><b>{badgeDef(badge)?.name}</b></span> : <span className="muted small">Elige una placa</span>}
              <input placeholder="Nota (opcional): por qué se la das" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn primary" disabled={!badge} onClick={grant}><Plus size={15} /> Otorgar</button>
            </div>
          </Block>
        </>
      )}
    </>
  );
}

// ---------- Crear placa ----------
const COLORS = ['#101120', '#222640', '#5D7E9F', '#9CBED9', '#ECE8DA', '#E0B15A', '#C07A3E', '#E2524A', '#F08AB4', '#9146FF', '#3F8FD0', '#25F4EE', '#3DAA55', '#53FC18', '#FFD95A', '#FFFFFF'];
const EMPTY = { name: '', desc: '', art: { shape: 'shield', bg: '#5D7E9F', bg2: '#222640', frame: '#E0B15A', glyph: 'star', color: '#ECE8DA', text: '' } };

function Swatches({ value, onChange, label }) {
  return (
    <div className="bdg-swatches">
      <span className="small muted">{label}</span>
      <div>
        {COLORS.map((c) => <button key={c} type="button" className={`bdg-sw ${value?.toUpperCase() === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} title={c} />)}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function Creator() {
  const custom = useCustom();
  const [f, setF] = useState(EMPTY);
  const [mode, setMode] = useState('glyph');
  const [editing, setEditing] = useState(null);
  const art = { ...f.art, ...(mode === 'text' ? { glyph: undefined, text: (f.art.text || '').toUpperCase() } : { text: undefined }) };
  const setArt = (k, v) => setF((x) => ({ ...x, art: { ...x.art, [k]: v } }));
  const textOk = mode !== 'text' || TEXT_RE.test(art.text || '');
  const save = async () => {
    const body = { name: f.name, desc: f.desc, art };
    try {
      if (editing) await api.patch(`/admin/badges/custom/${editing.replace('custom:', '')}`, body);
      else await api.post('/admin/badges/custom', body);
      office.toast({ title: editing ? 'Placa actualizada' : `🏅 Creaste la placa «${f.name}»` });
      setF(EMPTY); setEditing(null); setMode('glyph'); loadCatalog();
    } catch (e) { err(e); }
  };
  const edit = (b) => { setEditing(b.id); setMode(b.art.text ? 'text' : 'glyph'); setF({ name: b.name, desc: b.desc, art: { ...EMPTY.art, ...b.art } }); };
  const del = async (b) => {
    if (!window.confirm(`¿Borrar la placa «${b.name}»? Se le quita a quien la tenga.`)) return;
    try { await api.del(`/admin/badges/custom/${b.id.replace('custom:', '')}`); loadCatalog(); if (editing === b.id) { setEditing(null); setF(EMPTY); } } catch (e) { err(e); }
  };
  return (
    <>
      <Block title={editing ? 'Editar placa' : 'Nueva placa'} right={editing && <button className="link-btn" onClick={() => { setEditing(null); setF(EMPTY); }}>Cancelar</button>}>
        <div className="bdg-creator">
          <div className="bdg-preview">
            <div className="bdg-preview-big"><BadgeImg art={art} size={120} /></div>
            <div className="bdg-preview-sizes"><BadgeImg art={art} size={40} /><BadgeImg art={art} size={80} /></div>
            <div className="bdg-preview-name"><b>{f.name || 'Nombre de la placa'}</b><span className="muted small">{f.desc || 'Descripción'}</span></div>
          </div>
          <div className="bdg-form">
            <label className="bdg-field"><span>Nombre</span><input maxLength={NAME_MAX} value={f.name} placeholder="Ej. Héroe del servidor" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="bdg-field"><span>Descripción</span><input maxLength={DESC_MAX} value={f.desc} placeholder="Por qué se gana" onChange={(e) => setF({ ...f, desc: e.target.value })} /></label>
            <div className="bdg-field"><span>Forma</span>
              <div className="bdg-shapes">
                {SHAPES.map((s) => (
                  <button key={s} type="button" className={`bdg-shape ${art.shape === s ? 'on' : ''}`} onClick={() => setArt('shape', s)} title={SHAPE_NAMES[s]}>
                    <img src={badgeUrl({ ...art, shape: s, glyph: undefined, text: undefined })} width={40} height={40} alt={SHAPE_NAMES[s]} />
                  </button>
                ))}
              </div>
            </div>
            <Swatches label="Fondo (arriba)" value={art.bg} onChange={(c) => setArt('bg', c)} />
            <Swatches label="Fondo (abajo)" value={art.bg2} onChange={(c) => setArt('bg2', c)} />
            <Swatches label="Marco" value={art.frame} onChange={(c) => setArt('frame', c)} />
            <Swatches label="Dibujo / letras" value={art.color} onChange={(c) => setArt('color', c)} />
            <div className="seg small-seg">
              <button type="button" className={mode === 'glyph' ? 'on' : ''} onClick={() => setMode('glyph')}>Dibujo</button>
              <button type="button" className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>Letras</button>
            </div>
            {mode === 'glyph' ? (
              <div className="bdg-glyphs">
                {GLYPHS.map((g) => (
                  <button key={g} type="button" className={`bdg-glyph ${art.glyph === g ? 'on' : ''}`} onClick={() => setArt('glyph', g)} title={g}>
                    <img src={badgeUrl({ shape: 'square', bg: '#2A2D45', bg2: '#2A2D45', frame: '#2A2D45', glyph: g, color: art.color })} width={40} height={40} alt={g} />
                  </button>
                ))}
              </div>
            ) : (
              <label className="bdg-field"><span>Letras (1 a 3)</span><input maxLength={3} value={f.art.text || ''} placeholder="Ej. HUB" onChange={(e) => setArt('text', e.target.value.toUpperCase().replace(/[^A-Z0-9!?+#&]/g, ''))} /></label>
            )}
            <button className="btn primary" disabled={f.name.trim().length < 2 || !textOk || (mode === 'text' && !art.text)} onClick={save}>{editing ? <><Check size={15} /> Guardar cambios</> : <><Plus size={15} /> Crear placa</>}</button>
          </div>
        </div>
      </Block>
      <Block title={`Placas personalizadas (${custom.length})`}>
        {custom.length ? (
          <div className="bdg-custom-list">
            {custom.map((b) => (
              <div key={b.id} className="bdg-custom-row">
                <BadgeImg id={b.id} size={40} />
                <span className="flex1"><b>{b.name}</b><span className="muted small">{b.desc}</span></span>
                <button className="btn icon sm" title="Editar" onClick={() => edit(b)}><Pencil size={14} /></button>
                <button className="btn icon sm" title="Borrar" onClick={() => del(b)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        ) : <span className="muted small">Todavía no hay. Crea la primera arriba.</span>}
      </Block>
    </>
  );
}

// ---------- Canales ----------
function Channels() {
  const users = useOffice((s) => s.users);
  const [list, setList] = useState(null);
  const load = () => api.get('/admin/badges/channels').then((r) => setList(r.channels)).catch(err);
  useEffect(() => { load(); }, []);
  const verify = async (c, on) => {
    try { await api.post(`/admin/badges/channels/${c.userId}/${c.platform}/verify`, { verified: on }); forgetUserBadges(c.userId); load(); } catch (e) { err(e); }
  };
  if (!list) return <div className="muted pad">Cargando…</div>;
  return (
    <Block title="Canales de streamer">
      <p className="muted small">Revisa que el canal sea de esa persona. Al verificarlo recibe la placa de su plataforma.</p>
      {list.length ? list.map((c) => (
        <div key={`${c.userId}:${c.platform}`} className="bdg-chan-admin">
          <BadgeImg id={`stream:${c.platform}`} size={40} />
          <span className="flex1 ellipsis">
            <b>{users[c.userId]?.displayName || `#${c.userId}`}</b> · {PLATFORM_BY_ID[c.platform]?.name}
            <a className="bdg-url" href={c.url} target="_blank" rel="noopener noreferrer">{c.url.replace(/^https:\/\/(www\.)?/, '')} <ExternalLink size={11} /></a>
          </span>
          {c.verified
            ? <button className="btn sm" onClick={() => verify(c, false)}><X size={14} /> Quitar verificación</button>
            : <button className="btn primary sm" onClick={() => verify(c, true)}><Check size={14} /> Verificar</button>}
        </div>
      )) : <span className="muted small">Nadie ha agregado canales todavía.</span>}
    </Block>
  );
}

// ---------- Catálogo (hoja de placas a 2×) ----------
function Catalog() {
  const custom = useCustom();
  const all = [...STATIC_BADGES, ...custom];
  return (
    <div className="bdg-catalog">
      {CATEGORIES.map((c) => {
        const list = all.filter((b) => b.category === c.id);
        if (!list.length) return null;
        return (
          <Block key={c.id} title={`${c.name} (${list.length})`}>
            <div className="bdg-sheet">
              {list.map((b) => c.id === 'achievement'
                ? [1, 2, 3].slice(0, b.tiers > 1 ? 3 : 1).map((t) => <BadgeSlot key={`${b.id}${t}`} b={{ id: b.id, tier: b.tiers > 1 ? t : 3 }} size={80} />)
                : <BadgeSlot key={b.id} b={{ id: b.id }} size={80} />)}
            </div>
          </Block>
        );
      })}
    </div>
  );
}
