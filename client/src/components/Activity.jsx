import React, { useMemo, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Avatar, Toggle, Empty } from './ui.jsx';
import { fmtRelative, sameDay } from '../lib/time.js';

const TEXT = {
  wave: (n, count) => `👋 ${n} te saludó${count > 1 ? ` ${count} veces` : ''}`,
  mention: (n) => `💬 ${n} te mencionó`,
  event: (n) => `📅 ${n} te invitó a una reunión`,
};
const TITLE = { wave: 'Saludo de', mention: 'Mención de', event: 'Invitación de' };

export default function ActivityPanel() {
  const notifications = useOffice((s) => s.notifications);
  const users = useOffice((s) => s.users);
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Agrupa saludos seguidos de la misma persona el mismo día
  const groups = useMemo(() => {
    const out = [];
    for (const n of notifications) {
      if (onlyUnread && n.read) continue;
      const g = out[out.length - 1];
      if (g && n.type === 'wave' && g.type === 'wave' && g.actorId === n.actorId && sameDay(g.createdAt, n.createdAt)) {
        g.count++;
        g.ids.push(n.id);
        g.read = g.read && n.read;
      } else out.push({ ...n, count: 1, ids: [n.id] });
    }
    return out;
  }, [notifications, onlyUnread]);

  const markAll = async () => {
    await api.post('/notifications/read').catch(() => {});
    office.set((st) => ({ notifications: st.notifications.map((n) => ({ ...n, read: true })) }));
  };

  const open = async (g) => {
    for (const id of g.ids) api.post('/notifications/read', { id }).catch(() => {});
    office.set((st) => ({ notifications: st.notifications.map((n) => (g.ids.includes(n.id) ? { ...n, read: true } : n)) }));
    if (g.type === 'event') {
      office.set({ view: 'calendar' });
      return;
    }
    if (g.type === 'mention') {
      office.openConv(g.data.conv);
      office.set({ view: 'activity' });
      return;
    }
    office.openConv(`d:${g.actorId}`);
    office.set({ view: 'activity' });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Actividad</h2>
        <div className="row gap8">
          <label className="row gap4 small muted">No leídas <Toggle checked={onlyUnread} onChange={setOnlyUnread} /></label>
          <button className="icon-btn" title="Marcar todo como leído" onClick={markAll}><CheckCheck size={18} /></button>
        </div>
      </div>
      <div className="panel-scroll">
        {!groups.length && <Empty title="Nada por aquí">Los saludos, menciones e invitaciones aparecerán aquí.</Empty>}
        {groups.map((g) => {
          const u = users[g.actorId];
          const name = u?.displayName || 'Alguien';
          return (
            <button key={g.id} className={`activity ${g.read ? '' : 'unread'}`} onClick={() => open(g)}>
              <div className="activity-top">
                <span>{TITLE[g.type] || 'De'} {name}</span>
                <span className="muted">{fmtRelative(g.createdAt)}</span>
              </div>
              <div className="activity-body">
                <Avatar user={u} size={36} />
                <span>{(TEXT[g.type] || (() => g.type))(name, g.count)}{g.type === 'event' && g.data.title ? `: ${g.data.title}` : ''}{g.type === 'mention' && g.data.preview ? `: “${g.data.preview}”` : ''}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
