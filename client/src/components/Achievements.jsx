import React, { useEffect, useState } from 'react';
import { Trophy, Lock } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Modal, Avatar } from './ui.jsx';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, tierLabel } from '@shared/achievements.js';
import { fetchBadges, badgeTitle } from '../lib/achievements.js';

const fmtDate = (ts) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(ts);
const fmtNum = (n) => new Intl.NumberFormat('es-MX').format(n);
const hrs = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);

function useBadges(userId) {
  const [badges, setBadges] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = (fresh) => fetchBadges(userId, { fresh }).then((b) => alive && setBadges(b)).catch(() => alive && setBadges([]));
    load(false);
    const on = (m) => { if (m.userId === userId) setTimeout(() => load(true), 300); };
    office.socket?.on('achievement', on);
    return () => { alive = false; office.socket?.off('achievement', on); };
  }, [userId]);
  return badges;
}

// Fila chiquita de insignias en la tarjeta de perfil
export function BadgeRow({ userId, max = 6 }) {
  const badges = useBadges(userId);
  if (!badges) return null;
  const earned = badges.filter((b) => b.tier > 0).sort((a, b) => b.tier - a.tier || (b.earnedAt || 0) - (a.earnedAt || 0));
  const open = () => office.set({ modal: { type: 'achievements', userId }, profileCard: null });
  return (
    <div className="pc-section">
      <div className="pc-label row between">
        <span>Logros</span>
        <button className="link-btn" onClick={open}>Ver todos</button>
      </div>
      {earned.length ? (
        <button className="ach-row" onClick={open} title="Ver logros">
          {earned.slice(0, max).map((b) => (
            <span key={b.id} className={`ach-chip t${b.tier}`} title={`${badgeTitle(b.id, b.tier)} · ${ACHIEVEMENT_BY_ID[b.id].desc}`}>{ACHIEVEMENT_BY_ID[b.id].emoji}</span>
          ))}
          {earned.length > max && <span className="ach-more">+{earned.length - max}</span>}
        </button>
      ) : <div className="muted small">Todavía sin insignias</div>}
    </div>
  );
}

function BadgeCard({ b }) {
  const a = ACHIEVEMENT_BY_ID[b.id];
  const done = b.tier >= a.tiers.length;
  const lvl = tierLabel(a, b.tier);
  return (
    <div className={`ach-card ${b.tier ? `earned t${b.tier}` : 'locked'}`}>
      <div className="ach-emoji">{a.emoji}{!b.tier && <span className="ach-lock"><Lock size={11} /></span>}</div>
      <div className="ach-info">
        <div className="ach-name">{a.name}{lvl && <span className={`ach-tier t${b.tier}`}>{lvl}</span>}</div>
        <div className="ach-desc">{a.desc}</div>
        {a.tiers.length > 1 || !b.tier ? (
          <>
            <div className="ach-bar"><i style={{ width: `${Math.round(b.pct * 100)}%` }} /></div>
            <div className="ach-prog">
              {done ? <span>¡Nivel máximo! · {fmtNum(b.value)} {a.unit}</span> : <span>{fmtNum(Math.min(b.value, b.goal))} / {fmtNum(b.goal)} {a.unit}</span>}
              {b.earnedAt && <span>{fmtDate(b.earnedAt)}</span>}
            </div>
          </>
        ) : <div className="ach-prog"><span>¡Lo tienes!</span>{b.earnedAt && <span>{fmtDate(b.earnedAt)}</span>}</div>}
      </div>
    </div>
  );
}

function BadgeGrid({ userId }) {
  const badges = useBadges(userId);
  if (!badges) return <div className="muted pad">Cargando…</div>;
  const byId = Object.fromEntries(badges.map((b) => [b.id, b]));
  const list = ACHIEVEMENTS.map((a) => byId[a.id]).filter(Boolean)
    .sort((x, y) => (y.tier > 0) - (x.tier > 0) || y.pct - x.pct);
  const n = badges.filter((b) => b.tier > 0).length;
  return (
    <>
      <div className="ach-summary">
        <b>{n}</b> de {ACHIEVEMENTS.length} insignias
        <div className="ach-bar big"><i style={{ width: `${(n / ACHIEVEMENTS.length) * 100}%` }} /></div>
      </div>
      <div className="ach-grid">{list.map((b) => <BadgeCard key={b.id} b={b} />)}</div>
    </>
  );
}

function Ranking() {
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/achievements/ranking').then(setData).catch((e) => office.toast({ title: e.message, kind: 'error' })); }, []);
  if (!data) return <div className="muted pad">Cargando…</div>;
  const P = data.points;
  const days = Math.max(0, Math.ceil((data.resetsAt - Date.now()) / 864e5));
  const why = (r) => [
    r.onlineMin >= 60 && `${hrs(r.onlineMin)} en línea`,
    r.shiftMin >= 60 && `${hrs(r.shiftMin)} en turno`,
    r.wins && `${r.wins} ${r.wins === 1 ? 'victoria' : 'victorias'}`,
    r.wishes && `${r.wishes} ${r.wishes === 1 ? 'felicitación' : 'felicitaciones'}`,
    r.badges && `${r.badges} ${r.badges === 1 ? 'insignia' : 'insignias'}`,
  ].filter(Boolean).join(' · ');
  const inTop = data.top.some((r) => r.userId === me.id);
  const row = (r, mine) => {
    const u = users[r.userId];
    return (
      <div key={r.userId} className={`rank-row ${mine ? 'me' : ''} ${r.rank <= 3 ? `top${r.rank}` : ''}`}>
        <span className="rank-pos">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank || '—'}</span>
        <Avatar user={u || { displayName: '?' }} size={30} />
        <span className="flex1 ellipsis"><b>{u?.displayName || 'Alguien'}{mine && ' (tú)'}</b><span className="muted small rank-why">{why(r) || 'Aún sin puntos esta semana'}</span></span>
        <span className="rank-pts">{fmtNum(r.points)}<small> pts</small></span>
      </div>
    );
  };
  return (
    <>
      <div className="rank-head">
        <span>Semana del <b>{fmtDate(data.weekStart)}</b> · se reinicia {days <= 1 ? 'mañana' : `en ${days} días`} (lunes 00:00)</span>
      </div>
      <div className="rank-list">
        {data.top.length ? data.top.map((r) => row(r, r.userId === me.id)) : <div className="muted pad">Nadie tiene puntos todavía esta semana. ¡Sé la primera persona!</div>}
        {!inTop && <><div className="rank-gap">Tu lugar</div>{row(data.me, true)}</>}
      </div>
      <div className="rank-rules muted small">
        Puntos: {P.onlineHour} por hora en línea · {P.shiftHour} por hora en turno · {P.win} por partida ganada · {P.wish} por felicitar un cumpleaños · {P.badge} por insignia nueva
      </div>
    </>
  );
}

export default function Achievements({ userId, tab: initialTab }) {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const uid = userId || me.id;
  const [tab, setTab] = useState(initialTab === 'ranking' ? 'ranking' : 'badges');
  const close = () => office.set({ modal: null });
  const who = uid === me.id ? 'Tus logros' : `Logros de ${users[uid]?.displayName?.split(' ')[0] || 'alguien'}`;
  return (
    <Modal title={<span className="bday-title"><Trophy size={20} /> Logros</span>} onClose={close} width={640} className="ach-modal">
      <div className="seg">
        <button className={tab === 'badges' ? 'on' : ''} onClick={() => setTab('badges')}>{who}</button>
        <button className={tab === 'ranking' ? 'on' : ''} onClick={() => setTab('ranking')}>Ranking semanal</button>
      </div>
      {tab === 'badges' ? <BadgeGrid userId={uid} /> : <Ranking />}
    </Modal>
  );
}
