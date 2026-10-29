import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Hash, ChevronDown, SquarePen, Hand, Navigation, Send, Bold, Italic, Code, Link2, Smile, AtSign, Plus, ChevronLeft, SmilePlus, Paperclip, FileText, Download } from 'lucide-react';
import { NotesCard } from './MeetingNotes.jsx';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Avatar, Empty } from './ui.jsx';
import { fmtTime, fmtDayLong, sameDay } from '../lib/time.js';
import { ReportMsgButton } from './Moderation.jsx';

// ---------- Panel lateral ----------
export function ChatPanel() {
  const chat = useOffice((s) => s.chat);
  const conv = useOffice((s) => s.conv);
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const [open, setOpen] = useState({ ch: true, dm: true });
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');

  const dmList = chat.dms.filter((d) => users[d.userId]);
  const others = Object.values(users).filter((u) => u.id !== me.id && !u.disabled && u.displayName.toLowerCase().includes(q.toLowerCase()));

  const newChannel = async () => {
    const name = prompt('Nombre del canal nuevo');
    if (!name) return;
    try { await api.post('/channels', { name }); } catch (e) { office.toast({ title: e.message, kind: 'error' }); }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Chat</h2>
        <button className="icon-btn" title="Nuevo mensaje" onClick={() => setPicker(!picker)}><SquarePen size={18} /></button>
      </div>
      {picker && (
        <div className="dm-picker">
          <input autoFocus placeholder="¿A quién le escribes?" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="dm-picker-list">
            {others.map((u) => (
              <button key={u.id} className="mini-person" onClick={() => { office.openConv(`d:${u.id}`); setPicker(false); setQ(''); }}>
                <Avatar user={u} size={22} /> {u.displayName}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="panel-scroll">
        <div className="group-head-row">
          <button className="group-head" onClick={() => setOpen({ ...open, ch: !open.ch })}>Canales <ChevronDown size={14} className={open.ch ? '' : 'rot'} /></button>
          {me.role === 'admin' && <button className="icon-btn" title="Nuevo canal" onClick={newChannel}><Plus size={14} /></button>}
        </div>
        {open.ch && chat.channels.map((c) => (
          <button key={c.conv} className={`conv ${conv === c.conv ? 'on' : ''} ${c.unread ? 'unread' : ''}`} onClick={() => office.openConv(c.conv)}>
            <Hash size={16} /> <span>{c.name}</span>
            {c.unread > 0 && <span className="badge inline">{c.unread}</span>}
          </button>
        ))}
        <button className="group-head" onClick={() => setOpen({ ...open, dm: !open.dm })}>Mensajes directos <ChevronDown size={14} className={open.dm ? '' : 'rot'} /></button>
        {open.dm && dmList.map((d) => (
          <button key={d.conv} className={`conv ${conv === d.conv ? 'on' : ''} ${d.unread ? 'unread' : ''}`} onClick={() => office.openConv(d.conv)}>
            <Avatar user={users[d.userId]} size={22} /> <span>{users[d.userId].displayName}</span>
            {d.unread > 0 && <span className="badge inline">{d.unread}</span>}
          </button>
        ))}
        <button className={`conv ${conv === `d:${me.id}` ? 'on' : ''}`} onClick={() => office.set({ profileCard: me.id })}>
          <Avatar user={{ ...users[me.id], online: true }} size={22} /> <span>{users[me.id]?.displayName} (tú)</span>
        </button>
      </div>
    </div>
  );
}

// ---------- Formato simple ----------
function renderInline(text, users, meUsername) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|https?:\/\/[^\s<]+|@[a-zA-Z0-9_.-]{3,24})/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={k++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('~~')) out.push(<s key={k++}>{t.slice(2, -2)}</s>);
    else if (t.startsWith('*')) out.push(<i key={k++}>{t.slice(1, -1)}</i>);
    else if (t.startsWith('`')) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('@')) {
      const u = Object.values(users).find((x) => x.username.toLowerCase() === t.slice(1).toLowerCase());
      out.push(u ? <span key={k++} className={`mention ${u.username === meUsername ? 'me' : ''}`}>@{u.displayName}</span> : t);
    } else out.push(<a key={k++} href={t} target="_blank" rel="noreferrer noopener">{t}</a>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Body({ text, users, meUsername }) {
  // Bloques de código ```...```
  const parts = text.split(/```/);
  return parts.map((p, i) => (i % 2
    ? <pre key={i}><code>{p.replace(/^\n/, '')}</code></pre>
    : p.split('\n').map((line, j, arr) => (
      <React.Fragment key={`${i}-${j}`}>
        {line.startsWith('> ') ? <span className="quote">{renderInline(line.slice(2), users, meUsername)}</span> : renderInline(line, users, meUsername)}
        {j < arr.length - 1 && <br />}
      </React.Fragment>
    ))));
}

// ---------- Vista principal ----------
export function ChatView() {
  const conv = useOffice((s) => s.conv);
  const users = useOffice((s) => s.users);
  const chat = useOffice((s) => s.chat);
  const me = useOffice((s) => s.me);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);
  const stick = useRef(true);

  const isDM = conv.startsWith('d:');
  const other = isDM ? users[Number(conv.slice(2))] : null;
  const channel = !isDM ? chat.channels.find((c) => c.conv === conv) : null;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessages([]);
    api.get(`/messages?conv=${conv}`).then((r) => {
      if (!alive) return;
      setMessages(r.messages);
      setHasMore(r.hasMore);
      setLoading(false);
      stick.current = true;
      const last = r.messages[r.messages.length - 1];
      if (last) api.post('/reads', { conv, lastId: last.id }).catch(() => {});
    }).catch(() => setLoading(false));
    const off = office.on('message', (m) => {
      if (m.convKey === conv) setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    });
    const offR = office.on('reaction', (r) => setMessages((list) => list.map((x) => (x.id === r.id ? { ...x, reactions: r.reactions } : x))));
    return () => { alive = false; off(); offR(); };
  }, [conv]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const loadMore = async () => {
    const el = scrollRef.current;
    const h = el.scrollHeight;
    const r = await api.get(`/messages?conv=${conv}&before=${messages[0].id}`);
    stick.current = false;
    setMessages((list) => [...r.messages, ...list]);
    setHasMore(r.hasMore);
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - h; });
  };

  const onScroll = () => {
    const el = scrollRef.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  if (isDM && !other) return <div className="chat-view"><Empty title="Conversación no encontrada" /></div>;

  return (
    <div className="chat-view">
      <div className="chat-head">
        <button className="icon-btn mobile-only" onClick={() => office.set({ mobilePane: 'list' })} aria-label="Volver a la lista"><ChevronLeft size={20} /></button>
        {isDM ? (
          <button className="chat-title" onClick={() => office.set({ profileCard: other.id })}>
            <Avatar user={other} size={28} /> <span>{other.displayName}</span>
          </button>
        ) : (
          <div className="chat-title"><Hash size={20} /> <span>{channel?.name}</span></div>
        )}
        {isDM && (
          <div className="row gap8">
            <button className="btn primary icon" title="Saludar" onClick={() => office.wave(other.id).catch((e) => office.toast({ title: e.message, kind: 'error' }))}><Hand size={16} /></button>
            <button className="btn primary" disabled={!other.online} onClick={() => office.goTo(other.id)} title={other.online ? 'Ir con esta persona' : 'No está conectada'}>
              <Navigation size={15} /> Ir a
            </button>
          </div>
        )}
      </div>

      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        {hasMore && <button className="btn tiny load-more" onClick={loadMore}>Cargar mensajes anteriores</button>}
        {!loading && !messages.length && (
          <Empty mascota={{ nombre: 'nuvi', pose: 'wave' }} title={isDM ? `Este es el inicio de tu conversación con ${other.displayName}` : `Bienvenido a #${channel?.name}`}>
            {isDM ? 'Salúdale con 👋 o escribe un mensaje.' : 'Escribe el primer mensaje del canal.'}
          </Empty>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          const grouped = prev && !newDay && prev.userId === m.userId && m.createdAt - prev.createdAt < 5 * 60e3 && prev.kind === m.kind;
          const u = users[m.userId];
          return (
            <React.Fragment key={m.id}>
              {newDay && <div className="day-sep"><span>{fmtDayLong(m.createdAt)}</span></div>}
              <div className={`msg ${grouped ? 'grouped' : ''}`}>
                {!grouped ? <Avatar user={u} size={38} showStatus={false} /> : <span className="msg-time-hover">{fmtTime(m.createdAt)}</span>}
                <div className="msg-main">
                  {!grouped && (
                    <div className="msg-meta"><b>{u?.displayName || 'Usuario'}</b> <span>{fmtTime(m.createdAt)}</span></div>
                  )}
                  {m.kind === 'wave' ? (
                    <div className="msg-wave">
                      {m.userId === me.id ? <>Saludaste a <b>{other?.displayName}</b> 👋</> : <><b>{u?.displayName}</b> te saludó 👋</>}
                    </div>
                  ) : m.kind === 'notes' ? (
                    <NotesCard text={m.body} />
                  ) : (
                    <>
                      {m.body && <div className="msg-body"><Body text={m.body} users={users} meUsername={me.username} /></div>}
                      {m.attachments?.length > 0 && <Attachments files={m.attachments} />}
                    </>
                  )}
                  {m.reactions?.length > 0 && <Reactions m={m} me={me} users={users} />}
                </div>
                {m.kind !== 'wave' && <ReactButton m={m} />}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <Composer conv={conv} placeholder={isDM ? `Mensaje a ${other.displayName}` : `Mensaje en #${channel?.name || ''}`} users={users} />
    </div>
  );
}

const DRAFTS = new Map();

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '✅', '🙏'];

function ReactButton({ m }) {
  const [open, setOpen] = useState(false);
  const react = (emoji) => { setOpen(false); api.post(`/messages/${m.id}/react`, { emoji }).catch((e) => office.toast({ title: e.message, kind: 'error' })); };
  return (
    <div className="msg-actions">
      <button className="icon-btn" title="Reaccionar" onClick={() => setOpen(!open)}><SmilePlus size={16} /></button>
      <ReportMsgButton m={m} />
      {open && (
        <div className="popover down right emoji-pop" onMouseLeave={() => setOpen(false)}>
          {QUICK_REACTIONS.map((x) => <button key={x} onClick={() => react(x)}>{x}</button>)}
        </div>
      )}
    </div>
  );
}

function Reactions({ m, me, users }) {
  return (
    <div className="reactions">
      {m.reactions.map((r) => (
        <button key={r.emoji} className={`reaction ${r.users.includes(me.id) ? 'mine' : ''}`} title={r.users.map((id) => users[id]?.displayName).join(', ')}
          onClick={() => api.post(`/messages/${m.id}/react`, { emoji: r.emoji }).catch(() => {})}>
          {r.emoji} <span>{r.users.length}</span>
        </button>
      ))}
    </div>
  );
}

const fmtSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

function Attachments({ files }) {
  return (
    <div className="attachments">
      {files.map((f) => {
        if (f.mime.startsWith('image/')) {
          const k = f.width && f.height ? Math.min(1, 360 / f.width, 280 / f.height) : null;
          return (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="att-img">
              <img src={f.url} alt={f.name} loading="lazy" width={k ? Math.round(f.width * k) : undefined} height={k ? Math.round(f.height * k) : undefined} />
            </a>
          );
        }
        if (/^video\/(mp4|webm)$/.test(f.mime)) return <video key={f.id} className="att-video" src={f.url} controls preload="metadata" />;
        if (/^audio\//.test(f.mime)) return <audio key={f.id} src={f.url} controls preload="none" />;
        return (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="att-file" download={f.mime === 'application/pdf' ? undefined : f.name}>
            <FileText size={22} /><span><b>{f.name}</b><small>{fmtSize(f.size)}</small></span><Download size={16} />
          </a>
        );
      })}
    </div>
  );
}

// Sube un archivo y devuelve su ficha (con tamaño si es imagen)
async function uploadFile(file) {
  let dims = {};
  if (file.type.startsWith('image/')) {
    dims = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { resolve({ 'X-Width': img.naturalWidth, 'X-Height': img.naturalHeight }); URL.revokeObjectURL(img.src); };
      img.onerror = () => resolve({});
      img.src = URL.createObjectURL(file);
    });
  }
  const type = !file.type || file.type === 'application/json' ? 'application/octet-stream' : file.type;
  const res = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(file.name || 'archivo'), ...dims }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 413 ? 'El archivo es demasiado grande (máx. 25 MB)' : data.error || 'No se pudo subir');
  return data.file;
}

function Composer({ conv, placeholder, users }) {
  const [text, setText] = useState(DRAFTS.get(conv) || '');
  const [files, setFiles] = useState([]); // { key, name, file?, uploading, error }
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const addFiles = (list) => {
    for (const f of [...list].slice(0, 10)) {
      const key = `${Date.now()}-${Math.random()}`;
      setFiles((fs) => [...fs, { key, name: f.name || 'imagen.png', uploading: true, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }]);
      uploadFile(f).then((file) => setFiles((fs) => fs.map((x) => (x.key === key ? { ...x, uploading: false, file } : x))))
        .catch((e) => { office.toast({ title: e.message, kind: 'error' }); setFiles((fs) => fs.filter((x) => x.key !== key)); });
    }
  };
  const onPaste = (e) => {
    const list = [...(e.clipboardData?.files || [])];
    if (list.length) { e.preventDefault(); addFiles(list); }
  };
  const [mention, setMention] = useState(null);
  const [emoji, setEmoji] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setText(DRAFTS.get(conv) || ''); ref.current?.focus(); }, [conv]);
  useEffect(() => { DRAFTS.set(conv, text); }, [conv, text]);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(200, el.scrollHeight)}px`; }
  }, [text]);

  const ready = files.filter((f) => f.file);
  const uploading = files.some((f) => f.uploading);
  const send = async () => {
    const body = text.trim();
    if ((!body && !ready.length) || uploading) return;
    const sent = files;
    setText('');
    setFiles([]);
    try {
      await api.post('/messages', { conv, body, files: ready.map((f) => f.file.id) });
    } catch (e) {
      setText(body);
      setFiles(sent);
      office.toast({ title: e.message, kind: 'error' });
    }
  };

  const wrap = (a, b = a) => {
    const el = ref.current;
    const s = el.selectionStart, e = el.selectionEnd;
    const next = text.slice(0, s) + a + text.slice(s, e) + b + text.slice(e);
    setText(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + a.length, e + a.length); });
  };

  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    const upto = v.slice(0, e.target.selectionStart);
    const m = /@([a-zA-Z0-9_.-]*)$/.exec(upto);
    setMention(m ? m[1].toLowerCase() : null);
  };

  const candidates = useMemo(() => (mention === null ? [] : Object.values(users)
    .filter((u) => u.username.toLowerCase().startsWith(mention) || u.displayName.toLowerCase().startsWith(mention)).slice(0, 6)), [mention, users]);

  const pickMention = (u) => {
    const el = ref.current;
    const pos = el.selectionStart;
    const before = text.slice(0, pos).replace(/@([a-zA-Z0-9_.-]*)$/, `@${u.username} `);
    setText(before + text.slice(pos));
    setMention(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  };

  const onKey = (e) => {
    if (candidates.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      pickMention(candidates[0]);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={`composer ${drag ? 'dragging' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
      {files.length > 0 && (
        <div className="pending-files">
          {files.map((f) => (
            <div key={f.key} className={`pending-file ${f.uploading ? 'uploading' : ''}`}>
              {f.preview ? <img src={f.preview} alt="" /> : <FileText size={18} />}
              <span className="ellipsis">{f.uploading ? 'Subiendo…' : f.name}</span>
              <button onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))} aria-label="Quitar">×</button>
            </div>
          ))}
        </div>
      )}
      {candidates.length > 0 && (
        <div className="mention-pop">
          {candidates.map((u) => (
            <button key={u.id} onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}>
              <Avatar user={u} size={20} showStatus={false} /> {u.displayName} <span className="muted">@{u.username}</span>
            </button>
          ))}
        </div>
      )}
      <textarea ref={ref} rows={1} value={text} placeholder={placeholder} onChange={onChange} onKeyDown={onKey} onPaste={onPaste} />
      <div className="composer-tools">
        <button className="icon-btn" title="Adjuntar imagen o archivo (también puedes pegar o arrastrar)" onClick={() => fileRef.current.click()}><Paperclip size={16} /></button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <button className="icon-btn" title="Mencionar" onClick={() => { setText(text + '@'); setMention(''); ref.current.focus(); }}><AtSign size={16} /></button>
        <div className="cb-group">
          <button className="icon-btn" title="Emoji" onClick={() => setEmoji(!emoji)}><Smile size={16} /></button>
          {emoji && (
            <div className="popover up emoji-pop">
              {['😀', '😂', '😍', '👍', '🙏', '🎉', '🔥', '👀', '✅', '❤️', '🤔', '😅'].map((x) => (
                <button key={x} onClick={() => { setText(text + x); setEmoji(false); ref.current.focus(); }}>{x}</button>
              ))}
            </div>
          )}
        </div>
        <span className="tools-sep" />
        <button className="icon-btn" title="Negritas" onClick={() => wrap('**')}><Bold size={16} /></button>
        <button className="icon-btn" title="Cursiva" onClick={() => wrap('*')}><Italic size={16} /></button>
        <button className="icon-btn" title="Código" onClick={() => wrap('`')}><Code size={16} /></button>
        <button className="icon-btn" title="Enlace" onClick={() => wrap('https://', '')}><Link2 size={16} /></button>
        <div className="flex1" />
        <button className="send-btn" disabled={(!text.trim() && !ready.length) || uploading} onClick={send} title="Enviar (Enter)"><Send size={16} /></button>
      </div>
    </div>
  );
}
