// Estadísticas de uso para administradores (Preferencias → Estadísticas)
import React, { useEffect, useState } from 'react';
import { Download, Users, Clock, MonitorCheck, DoorOpen } from 'lucide-react';
import { office, useOffice } from '../../lib/store.js';
import { api } from '../../lib/api.js';
import { Select, Avatar } from '../ui.jsx';
import { fmtRelative } from '../../lib/time.js';

const hrs = (m) => {
  if (!m) return '0 h';
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return `${h >= 100 ? Math.round(h) : h.toFixed(1).replace(/\.0$/, '')} h`;
};
const dayLabel = (d) => new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const lastSeen = (ts) => (ts ? fmtRelative(ts) : 'Nunca');

export default function StatsAdmin() {
  const users = useOffice((s) => s.users);
  const [days, setDays] = useState(7);
  const [inactive, setInactive] = useState(14);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    api.get(`/admin/stats?days=${days}&inactive=${inactive}`).then((d) => alive && setData(d)).catch((e) => office.toast({ title: e.message, kind: 'error' }));
    return () => { alive = false; };
  }, [days, inactive]);

  const csv = () => {
    const rows = [['persona', 'usuario', 'horas_en_linea', 'horas_en_turno', 'dias_con_asistencia', 'ultimo_acceso'],
      ...data.rows.map((r) => [r.name, r.username, (r.onlineMin / 60).toFixed(2), (r.shiftMin / 60).toFixed(2), r.days, r.lastActive ? new Date(r.lastActive).toISOString() : ''])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')}`], { type: 'text/csv' }));
    a.download = `estadisticas-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const t = data?.totals;
  const maxDay = Math.max(1, ...(data?.daily || []).map((d) => d.people));
  const maxRoom = Math.max(1, ...(data?.rooms || []).map((r) => r.minutes));
  const rows = (data?.rows || []).filter((r) => !q || `${r.name} ${r.username}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stats-admin">
      <div className="row between gap8 wrap">
        <div className="seg stats-seg">
          {[7, 30, 90].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} días</button>)}
        </div>
        <button className="btn" disabled={!data?.rows.length} onClick={csv}><Download size={15} /> Exportar CSV</button>
      </div>

      {!data ? <div className="muted pad">Cargando…</div> : (
        <>
          <div className="stats-cards">
            <div className="stats-card"><Users size={16} /><span>Personas activas</span><b>{t.active}<small> de {t.people}</small></b></div>
            <div className="stats-card"><Clock size={16} /><span>Horas en línea</span><b>{hrs(t.onlineMin)}</b></div>
            <div className="stats-card"><MonitorCheck size={16} /><span>Horas en turno</span><b>{hrs(t.shiftMin)}</b></div>
            <div className="stats-card room"><DoorOpen size={16} /><span>Sala más usada</span><b className="ellipsis" title={t.topRoom?.name}>{t.topRoom?.name || '—'}</b></div>
          </div>

          <div className="pref-section">
            <div className="pref-section-title">Personas conectadas por día</div>
            <div className={`stats-days ${data.daily.length > 31 ? 'dense' : ''}`}>
              {data.daily.map((d) => (
                <div key={d.day} className="stats-day" title={`${dayLabel(d.day)}: ${d.people} ${d.people === 1 ? 'persona' : 'personas'} · ${hrs(d.minutes)}`}>
                  <i style={{ height: `${Math.max(d.people ? 6 : 2, (d.people / maxDay) * 100)}%` }} className={d.people ? '' : 'zero'} />
                  {data.daily.length <= 7 && <small>{dayLabel(d.day)}</small>}
                </div>
              ))}
            </div>
          </div>

          <div className="pref-section">
            <div className="row between gap8">
              <div className="pref-section-title">Por persona</div>
              <input className="search-input" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="table">
              <div className="tr th stats-tr"><div>Persona</div><div>En línea</div><div>En turno</div><div>Días</div><div>Último acceso</div></div>
              {rows.map((r) => (
                <div key={r.userId} className="tr stats-tr">
                  <div className="row gap8 ellipsis"><Avatar user={users[r.userId] || { displayName: r.name }} size={26} /><b className="ellipsis">{r.name}</b></div>
                  <div>{hrs(r.onlineMin)}</div>
                  <div>{hrs(r.shiftMin)}</div>
                  <div>{r.days}<span className="muted small"> / {days}</span></div>
                  <div className="muted small">{users[r.userId]?.online ? <span className="stats-online">En línea</span> : lastSeen(r.lastActive)}</div>
                </div>
              ))}
              {!rows.length && <div className="muted pad">Sin resultados.</div>}
            </div>
          </div>

          <div className="pref-section">
            <div className="pref-section-title">Salas más usadas</div>
            {data.rooms.length ? (
              <div className="stats-bars">
                {data.rooms.map((r) => (
                  <div key={r.areaId} className="stats-bar">
                    <span className="ellipsis">{r.name}</span>
                    <div className="stats-bar-track"><i style={{ width: `${(r.minutes / maxRoom) * 100}%` }} /></div>
                    <b>{hrs(r.minutes)}</b>
                    <span className="muted small">{r.people} {r.people === 1 ? 'persona' : 'personas'}</span>
                  </div>
                ))}
              </div>
            ) : <div className="muted small">Todavía no hay tiempo registrado en salas en este periodo.</div>}
          </div>

          <div className="pref-section">
            <div className="row between gap8">
              <div className="pref-section-title">Inactivos ({data.inactive.length})</div>
              <Select value={String(inactive)} onChange={(v) => setInactive(Number(v))} options={[{ value: '7', label: 'Sin entrar en 7 días' }, { value: '14', label: 'Sin entrar en 14 días' }, { value: '30', label: 'Sin entrar en 30 días' }]} />
            </div>
            {data.inactive.length ? (
              <div className="stats-inactive">
                {data.inactive.map((r) => (
                  <div key={r.userId} className="stats-inactive-row">
                    <Avatar user={users[r.userId] || { displayName: r.name }} size={26} />
                    <span className="flex1 ellipsis">{r.name}</span>
                    <span className="muted small">{r.lastActive ? `Última vez ${lastSeen(r.lastActive)}` : 'Nunca ha entrado'}</span>
                  </div>
                ))}
              </div>
            ) : <div className="muted small">🎉 Todos entraron en los últimos {inactive} días.</div>}
          </div>
          <p className="muted small">El tiempo en línea y por sala se cuenta desde que se activaron las estadísticas. Los días se cuentan en la zona horaria de la oficina.</p>
        </>
      )}
    </div>
  );
}
