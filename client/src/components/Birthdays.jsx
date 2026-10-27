import React, { useEffect, useMemo, useState } from 'react';
import { Cake, Send, PartyPopper, Pencil } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Modal, Avatar, Select } from './ui.jsx';
import { MONTHS, fmtBirthday, upcoming, whenLabel, WISHES, isBirthday } from '../lib/birthdays.js';
import { confetti } from '../lib/confetti.js';
import { playSound } from '../lib/sounds.js';

// Selector de día y mes (sin año, por privacidad)
export function BirthdayPicker({ value, onChange }) {
  const [m, d] = (value || '').split('-');
  const set = (mm, dd) => onChange(mm && dd ? `${mm}-${dd}` : '');
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(m || 1) - 1];
  return (
    <div className="bday-picker">
      <Select value={d || ''} onChange={(v) => set(m || '01', v)} options={[{ value: '', label: 'Día' }, ...Array.from({ length: days }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: String(i + 1) }))]} />
      <Select value={m || ''} onChange={(v) => set(v, d && Number(d) <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(v) - 1] ? d : '01')} options={[{ value: '', label: 'Mes' }, ...MONTHS.map((n, i) => ({ value: String(i + 1).padStart(2, '0'), label: n[0].toUpperCase() + n.slice(1) }))]} />
      {value && <button type="button" className="btn ghost tiny" onClick={() => onChange('')}>Quitar</button>}
    </div>
  );
}

// Tarjeta para felicitar + muro de felicitaciones de este año
function WishCard({ user, big }) {
  const me = useOffice((s) => s.me);
  const users = useOffice((s) => s.users);
  const [wishes, setWishes] = useState(null);
  const [text, setText] = useState(WISHES[0]);
  const [busy, setBusy] = useState(false);
  const isMe = user.id === me.id;
  const load = () => api.get(`/birthdays/${user.id}/wishes`).then((r) => setWishes(r.wishes)).catch(() => setWishes([]));
  useEffect(() => {
    load();
    const s = office.socket;
    const on = (m) => { if (m.userId === user.id) load(); };
    s?.on('birthday:wish', on);
    return () => s?.off('birthday:wish', on);
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = wishes?.find((w) => w.fromId === me.id);
  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/birthdays/${user.id}/wish`, { text });
      confetti({ count: 90, duration: 2500 });
      office.toast({ title: `🎂 Felicitaste a ${user.displayName}` });
      load();
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
    setBusy(false);
  };
  return (
    <div className={`bday-card ${big ? 'big' : ''}`}>
      <div className="bday-card-head">
        <div className="bday-hat-wrap"><Avatar user={user} size={big ? 56 : 40} ring /><span className="bday-hat">🎉</span></div>
        <div className="flex1">
          <b>{isMe ? '¡Feliz cumpleaños! 🥳' : `Hoy cumple ${user.displayName}`}</b>
          <div className="muted small">{fmtBirthday(user.birthday)}{wishes ? ` · ${wishes.length} ${wishes.length === 1 ? 'felicitación' : 'felicitaciones'}` : ''}</div>
        </div>
        {!isMe && <button className="btn ghost tiny" onClick={() => { office.goTo(user.id); office.set({ modal: null }); }}>Ir a su lado</button>}
      </div>
      {!isMe && (
        <div className="bday-send">
          <div className="bday-chips">{WISHES.map((w) => <button key={w} type="button" className={`chip ${text === w ? 'on' : ''}`} onClick={() => setText(w)}>{w}</button>)}</div>
          <div className="bday-input">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="Escribe tu felicitación" onKeyDown={(e) => e.key === 'Enter' && text.trim() && send()} />
            <button className="btn primary" disabled={busy || !text.trim()} onClick={send}><Send size={15} /> {mine ? 'Cambiar' : 'Felicitar'}</button>
          </div>
        </div>
      )}
      {wishes?.length > 0 && (
        <div className="bday-wall">
          {wishes.map((w) => (
            <div key={w.fromId} className="bday-wish">
              <Avatar user={users[w.fromId] || { displayName: '?' }} size={22} />
              <span><b>{users[w.fromId]?.displayName?.split(' ')[0] || 'Alguien'}:</b> {w.text}</span>
            </div>
          ))}
        </div>
      )}
      {isMe && wishes?.length === 0 && <div className="muted small">Aquí aparecerán las felicitaciones que te manden.</div>}
    </div>
  );
}

export default function Birthdays() {
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const close = () => office.set({ modal: null });
  const [editing, setEditing] = useState(false);
  const [mine, setMine] = useState(me.birthday || '');
  const [adminUser, setAdminUser] = useState('');
  const [adminDate, setAdminDate] = useState('');
  const list = useMemo(() => upcoming(users), [users]);
  const today = list.filter((x) => x.days === 0);
  const soon = list.filter((x) => x.days > 0 && x.days <= 31);
  const byMonth = MONTHS.map((name, i) => ({ name, items: list.filter((x) => Number(x.user.birthday.slice(0, 2)) === i + 1).sort((a, b) => a.user.birthday.localeCompare(b.user.birthday)) }));
  const missing = Object.values(users).filter((u) => !u.birthday && !u.disabled);

  const saveMine = async () => {
    try {
      await api.patch('/me', { birthday: mine || null });
      setEditing(false);
      office.toast({ title: mine ? `🎂 Guardado: ${fmtBirthday(mine)}` : 'Quitaste tu cumpleaños' });
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };
  const saveAdmin = async () => {
    try {
      await api.put(`/users/${adminUser}/birthday`, { birthday: adminDate || null });
      office.toast({ title: `🎂 Cumpleaños de ${users[adminUser]?.displayName} guardado` });
      setAdminUser(''); setAdminDate('');
    } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };

  return (
    <Modal title={<span className="bday-title"><Cake size={20} /> Cumpleaños</span>} onClose={close} width={620} className="bday-modal">
      {/* Mi cumpleaños */}
      <div className="bday-mine">
        {!editing && me.birthday && <span>🎂 Tu cumpleaños: <b>{fmtBirthday(me.birthday)}</b></span>}
        {!editing && !me.birthday && <span>Agrega tu cumpleaños para que el equipo te felicite 🎈</span>}
        {!editing && <button className="btn ghost tiny" onClick={() => setEditing(true)}><Pencil size={13} /> {me.birthday ? 'Cambiar' : 'Agregar'}</button>}
        {editing && (<><BirthdayPicker value={mine} onChange={setMine} /><button className="btn primary tiny" onClick={saveMine}>Guardar</button><button className="btn ghost tiny" onClick={() => setEditing(false)}>Cancelar</button></>)}
      </div>

      {today.length > 0 && (
        <section className="bday-section">
          <h3><PartyPopper size={16} /> Hoy</h3>
          {today.map(({ user }) => <WishCard key={user.id} user={user} big />)}
        </section>
      )}

      <section className="bday-section">
        <h3>Próximos</h3>
        {soon.length ? soon.map(({ user, days }) => (
          <div key={user.id} className="bday-row">
            <Avatar user={user} size={30} />
            <span className="flex1"><b>{user.displayName}</b><span className="muted small"> · {fmtBirthday(user.birthday)}</span></span>
            <span className={`bday-when ${days <= 7 ? 'near' : ''}`}>{whenLabel(days)}</span>
          </div>
        )) : <div className="muted small">Nadie cumple años en el próximo mes.</div>}
      </section>

      <section className="bday-section">
        <h3>Todo el año</h3>
        <div className="bday-months">
          {byMonth.map((m) => (
            <div key={m.name} className="bday-month">
              <div className="bday-month-name">{m.name}</div>
              {m.items.length ? m.items.map(({ user }) => (
                <div key={user.id} className="bday-month-item" title={user.displayName}>
                  <b>{Number(user.birthday.slice(3))}</b> {user.displayName.split(' ')[0]}
                </div>
              )) : <div className="muted small">—</div>}
            </div>
          ))}
        </div>
        {missing.length > 0 && <div className="muted small bday-missing">Sin fecha: {missing.map((u) => u.displayName.split(' ')[0]).join(', ')}</div>}
      </section>

      {me.role === 'admin' && (
        <section className="bday-section">
          <h3>Agregar el cumpleaños de alguien</h3>
          <div className="bday-admin">
            <Select value={adminUser} onChange={(v) => { setAdminUser(v); setAdminDate(users[v]?.birthday || ''); }} options={[{ value: '', label: 'Elige a una persona' }, ...Object.values(users).filter((u) => !u.disabled).sort((a, b) => a.displayName.localeCompare(b.displayName)).map((u) => ({ value: String(u.id), label: `${u.displayName}${u.birthday ? ` (${fmtBirthday(u.birthday)})` : ''}` }))]} />
            {adminUser && <BirthdayPicker value={adminDate} onChange={setAdminDate} />}
            {adminUser && <button className="btn primary tiny" onClick={saveAdmin}>Guardar</button>}
          </div>
        </section>
      )}
    </Modal>
  );
}

// Al entrar: si hoy cumple alguien, avisar una vez al día; si cumples tú, confeti
export function checkBirthdays() {
  const st = office.state;
  const me = st.users[st.me.id] || st.me;
  const day = new Date().toDateString();
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('nuvora:bdaySeen') || '{}'); } catch { /* sin almacenamiento */ }
  if (seen.day !== day) seen = { day, ids: [] };
  const mark = (id) => { seen.ids.push(id); try { localStorage.setItem('nuvora:bdaySeen', JSON.stringify(seen)); } catch { /* sin almacenamiento */ } };
  if (isBirthday(me) && !seen.ids.includes(me.id)) {
    mark(me.id);
    setTimeout(() => {
      confetti();
      playSound('cake', Math.max(0.3, st.prefs.audio.notifVolume));
      office.toast({ title: '🎂 ¡Feliz cumpleaños! Todo el equipo puede felicitarte hoy', action: { label: 'Ver', run: () => office.set({ modal: { type: 'birthdays' } }) }, duration: 12000 });
    }, 1500);
  }
  const others = Object.values(st.users).filter((u) => u.id !== me.id && isBirthday(u) && !seen.ids.includes(u.id));
  if (others.length) {
    others.forEach((u) => mark(u.id));
    const names = others.map((u) => u.displayName.split(' ')[0]);
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
    setTimeout(() => office.toast({ title: `🎂 Hoy ${others.length === 1 ? 'cumple años' : 'cumplen años'} ${who}`, action: { label: 'Felicitar', run: () => office.set({ modal: { type: 'birthdays' } }) }, duration: 15000 }), 2500);
  }
}
