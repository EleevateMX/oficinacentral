// Preferencias → Créditos HUB (admins): saldos, dar/quitar créditos (queda en la bitácora) y códigos de canje.
import React, { useEffect, useState } from 'react';
import { Plus, Minus, Trash2, Copy, Ticket } from 'lucide-react';
import { office } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { HOTEL_FURNI, FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { inShop } from '@shared/hotelEconomy.js';
import { fmtC, REASON } from './ecoStore.js';
import { Coin } from './ui.jsx';
import './economy.css';

function Block({ title, children }) {
  return <div className="pref-section">{title && <div className="pref-section-title">{title}</div>}{children}</div>;
}

export default function EconomyAdmin() {
  return (
    <div className="eco-admin">
      <Wallets />
      <Vouchers />
    </div>
  );
}

function Wallets() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [n, setN] = useState('100');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/hotel/admin/wallets?q=${encodeURIComponent(q)}`).then((r) => setUsers(r.users)).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sel) api.get(`/hotel/admin/wallets/${sel.id}`).then(setDetail).catch(() => setDetail(null)); else setDetail(null); }, [sel]);
  const send = async (sign) => {
    const delta = sign * Math.trunc(Number(n) || 0);
    if (!delta || !sel) return;
    setBusy(true);
    try {
      await api.post('/hotel/admin/credits', { userId: sel.id, delta, note });
      office.toast({ title: `${delta > 0 ? '💰 Diste' : 'Quitaste'} ${fmtC(Math.abs(delta))} créditos a ${sel.displayName}` });
      setNote('');
      load();
      setDetail(await api.get(`/hotel/admin/wallets/${sel.id}`));
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); } finally { setBusy(false); }
  };
  return (
    <Block title="Saldos">
      <p className="muted small">Cada persona empieza con 500, gana 50 al día y 10 cada 15 minutos dentro de MeDed Friends. Lo que des o quites queda en el registro de actividad.</p>
      <input className="search-input" placeholder="Buscar persona…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="eco-adm-list">
        {users.map((u) => (
          <button key={u.id} className={`eco-adm-row ${sel?.id === u.id ? 'on' : ''}`} onClick={() => setSel(u)}>
            <span className="ellipsis">{u.displayName} <i className="muted">@{u.username}</i></span>
            <b>{u.credits == null ? <i className="muted">sin entrar a MeDed Friends</i> : <><Coin size={12} /> {fmtC(u.credits)}</>}</b>
          </button>
        ))}
        {!users.length && <span className="muted small">Nadie con ese nombre</span>}
      </div>
      {sel && (
        <div className="eco-adm-grant">
          <div className="eco-adm-who"><b>{sel.displayName}</b>{detail && <span><Coin size={13} /> {fmtC(detail.credits)}</span>}</div>
          <div className="row gap8">
            <input className="search-input" style={{ width: 110 }} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 7))} aria-label="Cantidad" />
            <input className="search-input flex1" placeholder="Motivo (opcional)" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn primary" disabled={busy || !Number(n)} onClick={() => send(1)}><Plus size={14} /> Dar</button>
            <button className="btn danger-text" disabled={busy || !Number(n)} onClick={() => send(-1)}><Minus size={14} /> Quitar</button>
          </div>
          {detail?.log?.length > 0 && (
            <div className="eco-adm-log">
              {detail.log.slice(0, 10).map((m) => (
                <div key={m.id}><span className={m.delta > 0 ? 'in' : 'out'}>{m.delta > 0 ? '+' : '−'}{fmtC(Math.abs(m.delta))}</span> {REASON[m.reason] || m.reason}{m.note ? ` · ${m.note}` : ''} <i className="muted">{new Date(m.at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</i></div>
              ))}
            </div>
          )}
        </div>
      )}
    </Block>
  );
}

const SHOP = HOTEL_FURNI.filter(inShop).sort((a, b) => a.name.localeCompare(b.name));

function Vouchers() {
  const [list, setList] = useState([]);
  const [f, setF] = useState({ code: '', credits: '100', furni: '', maxUses: '1', expiresInDays: '7', note: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/hotel/admin/vouchers').then((r) => setList(r.vouchers)).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post('/hotel/admin/vouchers', { code: f.code, credits: Number(f.credits) || 0, furni: f.furni || null, maxUses: Number(f.maxUses) || 1, expiresInDays: Number(f.expiresInDays) || 0, note: f.note });
      office.toast({ title: `🎟️ Código ${r.voucher.code} listo` });
      setF((x) => ({ ...x, code: '', note: '' }));
      load();
    } catch (er) { office.toast({ title: er.message, kind: 'error' }); } finally { setBusy(false); }
  };
  const del = async (code) => {
    try { await api.del(`/hotel/admin/vouchers/${encodeURIComponent(code)}`); load(); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  const copy = (code) => { navigator.clipboard?.writeText(code); office.toast({ title: `Copiado: ${code}` }); };
  return (
    <Block title="Códigos de canje">
      <p className="muted small">Se canjean en el Catálogo de MeDed Friends o en el monedero. Cada persona usa un código una sola vez.</p>
      <form className="eco-adm-form" onSubmit={create}>
        <label><span>Código</span><input className="search-input" placeholder="Automático" maxLength={24} value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} /></label>
        <label><span>Créditos</span><input className="search-input" inputMode="numeric" value={f.credits} onChange={set('credits')} /></label>
        <label className="wide"><span>Furni (opcional)</span>
          <select className="search-input" value={f.furni} onChange={set('furni')}>
            <option value="">— Ninguno —</option>
            {SHOP.map((d) => <option key={d.id} value={d.id}>{d.name}{d.exclusive ? ' (exclusivo)' : ''}</option>)}
          </select>
        </label>
        <label><span>Usos</span><input className="search-input" inputMode="numeric" value={f.maxUses} onChange={set('maxUses')} /></label>
        <label><span>Vence en (días)</span><input className="search-input" inputMode="numeric" placeholder="0 = nunca" value={f.expiresInDays} onChange={set('expiresInDays')} /></label>
        <label className="wide"><span>Nota</span><input className="search-input" placeholder="Ej. Evento de Halloween" maxLength={80} value={f.note} onChange={set('note')} /></label>
        <button className="btn primary" disabled={busy}><Ticket size={14} /> Crear código</button>
      </form>
      <div className="eco-adm-vouchers">
        {!list.length && <span className="muted small">Aún no hay códigos.</span>}
        {list.map((v) => {
          const expired = v.expiresAt && v.expiresAt < Date.now();
          return (
            <div key={v.code} className="eco-adm-voucher">
              <button className="eco-code-chip" onClick={() => copy(v.code)} title="Copiar"><code>{v.code}</code><Copy size={12} /></button>
              <span className="flex1 small">
                {v.credits ? <><Coin size={11} /> {fmtC(v.credits)}</> : null}{v.credits && v.furni ? ' + ' : ''}{v.furni ? FURNI_BY_ID[v.furni]?.name || v.furni : ''}
                {v.note ? <i className="muted"> · {v.note}</i> : null}
              </span>
              <span className={`pill ${expired ? 'expired' : v.uses >= v.maxUses ? 'used' : 'pending'}`}>{expired ? 'Vencido' : `${v.uses}/${v.maxUses} usos`}</span>
              <span className="muted small">{v.expiresAt ? `vence ${new Date(v.expiresAt).toLocaleDateString('es-MX')}` : 'sin vencimiento'}</span>
              <button className="icon-btn danger" onClick={() => del(v.code)} aria-label="Borrar código"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </Block>
  );
}
