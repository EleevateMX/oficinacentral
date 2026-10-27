import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, MapPin, Trash2, Users, Navigation } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Modal, Avatar, Empty } from './ui.jsx';
import { fmtTime, fmtMonthYear, fmtWeekday, startOfWeek, startOfDay, addDays, sameDay, fmtDayLong } from '../lib/time.js';

const HOUR_PX = 64;

function useMyEvents() {
  const events = useOffice((s) => s.events);
  return events;
}

export function CalendarPanel() {
  const events = useMyEvents();
  const [q, setQ] = useState('');
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.endsAt > now && (!q || e.title.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, 40);

  const groups = [];
  for (const e of upcoming) {
    const label = sameDay(e.startsAt, now) ? 'Hoy' : sameDay(e.startsAt, addDays(now, 1)) ? 'Mañana' : fmtDayLong(e.startsAt);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <div className="panel">
      <div className="panel-head"><h2>Calendario</h2></div>
      <div className="search"><input placeholder="Buscar eventos" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="panel-scroll">
        {!groups.length && <Empty mascota={{ nombre: 'rumi', size: 84 }} title="Sin eventos próximos">Crea una reunión con “Nueva reunión”.</Empty>}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="group-label">{g.label}</div>
            {g.items.map((e) => (
              <button key={e.id} className={`event-card ${e.startsAt <= now ? 'live' : ''}`} onClick={() => office.set({ modal: { type: 'event', event: e } })}>
                <div className="event-title">{e.title}</div>
                <div className="event-time">{fmtTime(e.startsAt)} – {fmtTime(e.endsAt)}{e.location ? ` · ${e.location}` : ''}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarView() {
  const events = useMyEvents();
  const prefs = useOffice((s) => s.prefs.calendar);
  const [anchor, setAnchor] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [refreshed, setRefreshed] = useState(Date.now());
  const scrollRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30e3);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = HOUR_PX * 7.5;
  }, []);

  const weekStart = startOfWeek(anchor, prefs.weekDays === 5 ? 1 : prefs.firstDay);
  const days = Array.from({ length: prefs.weekDays }, (_, i) => addDays(weekStart, i));

  const byDay = useMemo(() => days.map((d) => events.filter((e) => e.startsAt < addDays(d, 1) && e.endsAt > d)), [events, weekStart, prefs.weekDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const newAt = (day, hour) => {
    const s = day + hour * 3600e3;
    office.set({ modal: { type: 'event', event: { startsAt: s, endsAt: s + 3600e3, title: '', attendees: [] } } });
  };

  return (
    <div className="calendar">
      <div className="cal-head">
        <div className="row gap8">
          <button className="icon-btn" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
          <button className="icon-btn" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Semana siguiente"><ChevronRight size={18} /></button>
          <button className="btn" onClick={() => setAnchor(Date.now())}>Hoy</button>
          <h2 className="cal-month">{fmtMonthYear(weekStart)}</h2>
        </div>
        <div className="row gap8">
          <button className="link-btn" onClick={() => { office.loadEvents(); setRefreshed(Date.now()); }}><RefreshCw size={14} /> {Date.now() - refreshed < 60e3 ? 'Justo ahora' : 'Actualizar'}</button>
          <button className="btn primary" onClick={() => newAt(startOfDay(Date.now()), new Date().getHours() + 1)}><Plus size={16} /> Nueva reunión</button>
        </div>
      </div>
      <div className="cal-days" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => (
          <div key={d} className="cal-day-head">
            {fmtWeekday(d)} <span className={sameDay(d, now) ? 'today' : ''}>{new Date(d).getDate()}</span>
          </div>
        ))}
      </div>
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, height: HOUR_PX * 24 }}>
          <div className="cal-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{ top: h * HOUR_PX }}>{h === 0 ? '' : new Intl.DateTimeFormat('es-MX', { hour: 'numeric' }).format(new Date(2000, 0, 1, h))}</div>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d} className="cal-col" onDoubleClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              newAt(d, Math.floor((e.clientY - r.top) / HOUR_PX));
            }}>
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="cal-slot" style={{ top: h * HOUR_PX }} onClick={() => newAt(d, h)} />)}
              {byDay[i].map((e) => {
                const s = Math.max(e.startsAt, d);
                const en = Math.min(e.endsAt, addDays(d, 1));
                const top = ((s - d) / 3600e3) * HOUR_PX;
                const h = Math.max(22, ((en - s) / 3600e3) * HOUR_PX - 2);
                return (
                  <button key={e.id} className={`cal-event ${e.endsAt < now ? 'past' : ''}`} style={{ top, height: h }} onClick={(ev) => { ev.stopPropagation(); office.set({ modal: { type: 'event', event: e } }); }}>
                    <b>{e.title}</b>
                    <span>{fmtTime(e.startsAt)} – {fmtTime(e.endsAt)}</span>
                  </button>
                );
              })}
              {sameDay(d, now) && (
                <div className="now-line" style={{ top: ((now - d) / 3600e3) * HOUR_PX }}>
                  <span>{fmtTime(now)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const toLocalInput = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const fromLocal = (date, time) => new Date(`${date}T${time}`).getTime();

export function EventModal({ event }) {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const floor = useOffice((s) => s.floor);
  const isNew = !event.id;
  const canEdit = isNew || event.createdBy === me.id || me.role === 'admin';
  const [form, setForm] = useState(() => {
    const s = toLocalInput(event.startsAt);
    const e = toLocalInput(event.endsAt);
    return {
      title: event.title || '', description: event.description || '', location: event.location || '',
      date: s.date, start: s.time, end: e.time, attendees: event.attendees?.length ? event.attendees : [me.id],
    };
  });
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');
  const close = () => office.set({ modal: null });
  const rooms = floor?.areas.filter((a) => a.private) || [];

  const save = async (e) => {
    e.preventDefault();
    const startsAt = fromLocal(form.date, form.start);
    let endsAt = fromLocal(form.date, form.end);
    if (endsAt <= startsAt) endsAt += 864e5;
    const room = rooms.find((r) => r.name === form.location);
    const body = { title: form.title, description: form.description, location: form.location, startsAt, endsAt, attendees: form.attendees, areaId: room?.id ?? null };
    try {
      if (isNew) await api.post('/events', body);
      else await api.patch(`/events/${event.id}`, body);
      close();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async () => {
    if (!confirm('¿Borrar este evento?')) return;
    await api.del(`/events/${event.id}`).catch((err) => setError(err.message));
    close();
  };

  const goRoom = () => {
    const a = floor.areas.find((x) => x.name === form.location);
    if (!a) return;
    close();
    office.set({ view: 'map' });
    office.pathTarget = { x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2) };
  };

  const candidates = Object.values(users).filter((u) => !form.attendees.includes(u.id) && !u.disabled && pick && u.displayName.toLowerCase().includes(pick.toLowerCase())).slice(0, 6);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title={isNew ? 'Nueva reunión' : canEdit ? 'Editar reunión' : form.title} onClose={close} width={520}>
      <form className="form" onSubmit={save}>
        <input className="big-input" placeholder="Título de la reunión" value={form.title} onChange={set('title')} disabled={!canEdit} autoFocus required maxLength={120} />
        <div className="row gap8 wrap">
          <input type="date" value={form.date} onChange={set('date')} disabled={!canEdit} required />
          <input type="time" value={form.start} onChange={set('start')} disabled={!canEdit} required />
          <span className="muted">–</span>
          <input type="time" value={form.end} onChange={set('end')} disabled={!canEdit} required />
        </div>
        <label className="field-label"><MapPin size={14} /> Lugar</label>
        <div className="row gap8">
          <input list="rooms" placeholder="Elige una sala para apartarla en el mapa" value={form.location} onChange={set('location')} disabled={!canEdit} className="flex1" />
          <datalist id="rooms">{rooms.map((r) => <option key={r.id} value={r.name} />)}</datalist>
          {rooms.some((r) => r.name === form.location) && (
            <button type="button" className="btn" onClick={goRoom}><Navigation size={14} /> Ir</button>
          )}
        </div>
        <label className="field-label"><Users size={14} /> Invitados</label>
        <div className="chips">
          {form.attendees.map((id) => users[id] && (
            <span key={id} className="chip">
              <Avatar user={users[id]} size={18} showStatus={false} /> {users[id].displayName}
              {canEdit && id !== me.id && <button type="button" onClick={() => setForm({ ...form, attendees: form.attendees.filter((x) => x !== id) })}>×</button>}
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="rel">
            <input placeholder="Añadir personas…" value={pick} onChange={(e) => setPick(e.target.value)} />
            {candidates.length > 0 && (
              <div className="suggest">
                {candidates.map((u) => (
                  <button type="button" key={u.id} onClick={() => { setForm({ ...form, attendees: [...form.attendees, u.id] }); setPick(''); }}>
                    <Avatar user={u} size={20} showStatus={false} /> {u.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <textarea placeholder="Descripción" value={form.description} onChange={set('description')} disabled={!canEdit} rows={3} />
        {error && <div className="form-error">{error}</div>}
        <div className="row between">
          {!isNew && canEdit ? <button type="button" className="btn danger-text" onClick={remove}><Trash2 size={15} /> Borrar</button> : <span />}
          <div className="row gap8">
            <button type="button" className="btn" onClick={close}>Cerrar</button>
            {canEdit && <button className="btn primary" type="submit">{isNew ? 'Crear' : 'Guardar'}</button>}
          </div>
        </div>
      </form>
    </Modal>
  );
}
