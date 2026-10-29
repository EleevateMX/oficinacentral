// Hotel: interfaz de la línea "Mecánica y Wired": tarjetas de furni (máquinas, rueda, amor, marcador,
// trofeo, regulador, wired), tarjeta de bots, objeto en la mano y ventanas de configuración.
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { X, RotateCw, Move, Hand, Play, Zap, Sun, Moon, PenLine, Plus, Minus, RefreshCcw, MousePointerClick, Check, Bot, Trash2, Gift } from 'lucide-react';
import { useOffice } from '../lib/store.js';
import { FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { HAND_ITEMS, vendOf, WIRED_NAMES } from '@shared/hotelLines/mecanica.js';
import { hotel, useHotel } from './hotelStore.js';
import { FurniIcon, Window } from './Panels.jsx';
import { pick, startPick, stopPick, dropPickId } from './mechanics.js';

const usePick = () => useSyncExternalStore((l) => { pick.listeners.add(l); return () => pick.listeners.delete(l); }, () => `${pick.on}:${pick.forId}:${[...pick.ids].join(',')}`);
const handLabel = (id) => (HAND_ITEMS[id] ? `${HAND_ITEMS[id].emoji} ${HAND_ITEMS[id].name}` : '');

// Lo que traes en la mano (se actualiza con cada 'hotel:user')
export function useMyHand() {
  const [hand, setHand] = useState(() => hotel.live.users.get(hotel.me)?.hand ?? null);
  useEffect(() => {
    const s = hotel.socket;
    if (!s) return undefined;
    const f = (m) => { if (m.id === hotel.me) setHand(m.hand ?? null); };
    const r = () => setHand(hotel.live.users.get(hotel.me)?.hand ?? null);
    s.on('hotel:user', f);
    window.addEventListener('hotel:entered', r);
    return () => { s.off('hotel:user', f); window.removeEventListener('hotel:entered', r); };
  }, []);
  return hand;
}

// ---------- Capa de la sala (va dentro de RoomView) ----------
export function MechLayer() {
  const panel = useHotel((s) => s.mechPanel);
  const hand = useMyHand();
  usePick();
  useEffect(() => {
    const s = hotel.socket;
    if (!s) return undefined;
    const open = (m) => { if (hotel.live.items.has(m.itemId)) hotel.set({ mechPanel: { kind: m.kind, itemId: m.itemId }, selected: null }); };
    // Trofeo recién puesto sin dedicatoria: pedirla
    const added = (m) => {
      const it = m.item;
      if (m.op === 'add' && it && FURNI_BY_ID[it.type]?.interact === 'trophy' && it.ownerId === hotel.me && !it.extra?.inscription) hotel.set({ mechPanel: { kind: 'trophy', itemId: it.id } });
      if (m.op === 'remove' && hotel.state.mechPanel?.itemId === m.id) { hotel.set({ mechPanel: null }); stopPick(); }
    };
    s.on('hotel:mech:open', open);
    s.on('hotel:item', added);
    return () => { s.off('hotel:mech:open', open); s.off('hotel:item', added); stopPick(); };
  }, []);
  const close = () => { hotel.set({ mechPanel: null }); stopPick(); };
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && (hotel.state.mechPanel || pick.on)) { if (pick.on) stopPick(); else hotel.set({ mechPanel: null }); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const item = panel && hotel.live.items.get(panel.itemId);
  return (
    <>
      {hand && HAND_ITEMS[hand] && (
        <div className="ht-hand" onPointerDown={(e) => e.stopPropagation()}>
          <span className="ht-hand-emoji">{HAND_ITEMS[hand].emoji}</span>
          <span><b>{HAND_ITEMS[hand].name}</b><small>en tu mano</small></span>
          <button className="ht-btn sm" onClick={() => hotel.socket.emit('hotel:mech:drop')} title=":tirar"><Trash2 size={13} /> Tirar</button>
        </div>
      )}
      {pick.on && (
        <div className="ht-placing ht-pickbar">
          <MousePointerClick size={15} /> <span>Haz clic en los furnis que quieras usar · <b>{pick.ids.size}</b> elegido{pick.ids.size === 1 ? '' : 's'}</span>
          <button className="ht-btn sm primary" onClick={() => stopPick()}><Check size={14} /> Listo</button>
        </div>
      )}
      {item && (
        <div className="ht-mech-float">
          {panel.kind === 'wired' && <WiredPanel key={item.id} item={item} onClose={close} />}
          {panel.kind === 'dimmer' && <DimmerPanel key={item.id} item={item} onClose={close} />}
          {panel.kind === 'trophy' && <TrophyPanel key={item.id} item={item} onClose={close} />}
        </div>
      )}
    </>
  );
}

// ---------- Tarjeta de furni de la línea ----------
export function MechItemCard({ item }) {
  const users = useOffice((s) => s.users);
  useHotel((s) => s.itemsV);
  const def = FURNI_BY_ID[item.type];
  const can = hotel.canEdit();
  const official = !!hotel.state.room?.official;
  const s = hotel.socket;
  const use = (extra = {}) => s.emit('hotel:use', { itemId: item.id, ...extra });
  const owner = users[item.ownerId];
  const hand = vendOf(def);
  const st = item.state || 0;
  let body = null, actions = null;
  if (hand) {
    body = <span className="ht-muted">Te da {handLabel(hand).toLowerCase()} para la mano</span>;
    actions = <>
      <button className="ht-btn primary" onClick={() => use()}><Hand size={14} /> Pedir {HAND_ITEMS[hand].emoji}</button>
      {def.interact === 'toggle' && (can || official) && <button className="ht-btn" onClick={() => use({ toggle: true })}><Play size={14} /> {st ? 'Apagar' : 'Encender'}</button>}
    </>;
  } else switch (def.interact) {
    case 'roller': body = <span className="ht-muted">Cada segundo mueve una casilla lo que está encima</span>; break;
    case 'oneway': body = <span className="ht-muted">Solo se cruza entrando por el frente (la flecha)</span>; actions = <button className="ht-btn primary" onClick={() => use()}><Play size={14} /> Cruzar</button>; break;
    case 'wheel':
      body = <span className="ht-muted">{st === 11 ? 'Girando…' : st ? `Último resultado: ${st}` : 'Gírala y que decida la suerte'}</span>;
      actions = <button className="ht-btn primary" disabled={st === 11} onClick={() => use()}><RefreshCcw size={14} /> Girar</button>;
      break;
    case 'love':
      body = <span className="ht-muted">{st === 1 ? 'Midiendo… 💓' : st >= 2 ? `Resultado: ${st - 2}% de amor 💘` : 'Siéntense dos y mídanlo'}</span>;
      actions = <button className="ht-btn primary" disabled={st === 1} onClick={() => use()}><Play size={14} /> Medir amor</button>;
      break;
    case 'score':
      body = <span className="ht-score">{String(st).padStart(2, '0')}</span>;
      if (can || official) actions = <>
        <button className="ht-btn primary" onClick={() => use({ op: 'inc' })}><Plus size={14} /> 1</button>
        <button className="ht-btn" onClick={() => use({ op: 'dec' })}><Minus size={14} /> 1</button>
        <button className="ht-btn" onClick={() => use({ op: 'reset' })}><RotateCw size={14} /> Reiniciar</button>
      </>;
      break;
    case 'trophy':
      body = item.extra?.inscription
        ? <blockquote className="ht-inscription">“{item.extra.inscription}”{item.extra.by && <cite>— {item.extra.by}</cite>}</blockquote>
        : <span className="ht-muted">Sin dedicatoria todavía</span>;
      if (item.ownerId === hotel.me || hotel.state.admin) actions = <button className="ht-btn" onClick={() => hotel.set({ mechPanel: { kind: 'trophy', itemId: item.id }, selected: null })}><PenLine size={14} /> {item.extra?.inscription ? 'Cambiar dedicatoria' : 'Escribir dedicatoria'}</button>;
      break;
    case 'dimmer':
      body = <span className="ht-muted">{st ? 'Luz ambiental encendida' : 'Luz ambiental apagada'} · uno por sala</span>;
      if (can) actions = <button className="ht-btn primary" onClick={() => use()}><Sun size={14} /> Ajustar luz</button>;
      break;
    case 'wired': {
      const w = def.wired;
      body = <span className="ht-muted"><Zap size={11} /> {w.kind === 'trigger' ? 'Disparador' : 'Efecto'}: {WIRED_NAMES[w.type]}{wiredSummary(w.type, item.extra?.wired)}</span>;
      if (can) actions = <button className="ht-btn primary" onClick={() => use()}><Zap size={14} /> Configurar</button>;
      break;
    }
    default:
  }
  return (
    <div className="ht-card" onPointerDown={(e) => e.stopPropagation()}>
      <button className="ht-x" onClick={() => hotel.set({ selected: null })} aria-label="Cerrar"><X size={14} /></button>
      <div className="ht-card-top">
        <FurniIcon type={def.id} color={item.color} size={64} />
        <div><b>{def.name}</b><span className="ht-muted">De {owner?.displayName || 'alguien'}</span>{body}</div>
      </div>
      <div className="ht-card-actions">
        {actions}
        {can && !item.wall && def.rots.length > 1 && <button className="ht-btn" onClick={() => s.emit('hotel:rotate', { itemId: item.id })}><RotateCw size={14} /> Rotar</button>}
        {can && <button className="ht-btn" onClick={() => hotel.startPlacing(item, { move: true })}><Move size={14} /> Mover</button>}
        {can && <button className="ht-btn" onClick={() => { s.emit('hotel:pickup', { itemId: item.id }); hotel.set({ selected: null }); }}><Hand size={14} /> Recoger</button>}
      </div>
    </div>
  );
}
function wiredSummary(type, cfg) {
  if (!cfg) return ' · sin configurar';
  if (cfg.text) return ` · “${cfg.text}”`;
  if (cfg.secs) return ` · cada ${cfg.secs} s`;
  if (cfg.hand) return ` · ${handLabel(cfg.hand)}`;
  if (cfg.items) return ` · ${cfg.items.length} furni${cfg.items.length === 1 ? '' : 's'}`;
  return type === 'enter' ? '' : '';
}

// ---------- Bots ----------
const BOT_INFO = {
  reception: { role: 'Recepción de la Oficina Central', hint: 'Pregúntale por: ayuda, hotel, juegos o salas', quick: [['Ayuda', 'ayuda'], ['Salas', '¿qué salas hay?'], ['Juegos', 'juegos']] },
  bartender: { role: 'Barra', hint: 'Pídele algo: “un café”, “un refresco”…', quick: [['☕ Café', 'un café'], ['🥤 Refresco', 'un refresco'], ['🍦 Helado', 'un helado'], ['💧 Agua', 'un vaso de agua']] },
};
export function BotCard({ U }) {
  const info = BOT_INFO[U.bot] || { role: 'Bot', hint: '', quick: [] };
  return (
    <div className="ht-card ht-bot-card" onPointerDown={(e) => e.stopPropagation()}>
      <button className="ht-x" onClick={() => hotel.set({ selected: null })} aria-label="Cerrar"><X size={14} /></button>
      <div className="ht-card-top">
        <span className="ht-bot-badge"><Bot size={22} /></span>
        <div><b>{U.name}</b><span className="ht-muted">{info.role} · bot de GTAHUB</span><span className="ht-muted">{info.hint}</span></div>
      </div>
      <div className="ht-card-actions">
        {info.quick.map(([label, text]) => <button key={label} className="ht-btn" onClick={() => hotel.say(text)}>{label}</button>)}
      </div>
    </div>
  );
}

// Botón "Dar …" en la tarjeta de otra persona
export function GiveHandButton({ userId }) {
  const hand = useMyHand();
  if (!hand || !HAND_ITEMS[hand] || userId === hotel.me) return null;
  return <button className="ht-btn" onClick={() => { hotel.socket.emit('hotel:mech:give', { to: userId }); hotel.set({ selected: null }); }}><Gift size={14} /> Dar {HAND_ITEMS[hand].emoji}</button>;
}

// ---------- Ventanas ----------
const DIRS = [[4, '↗', 'Arriba-derecha'], [6, '↘', 'Abajo-derecha'], [0, '↙', 'Abajo-izquierda'], [2, '↖', 'Arriba-izquierda']];
function WiredPanel({ item, onClose }) {
  const def = FURNI_BY_ID[item.type];
  const w = def.wired;
  const cfg0 = item.extra?.wired || {};
  const [text, setText] = useState(cfg0.text || '');
  const [secs, setSecs] = useState(cfg0.secs || 5);
  const [hand, setHand] = useState(cfg0.hand || 'refresco');
  const [dir, setDir] = useState(cfg0.dir ?? 'rnd');
  usePick();
  const needsItems = ['walk', 'toggle', 'tele', 'move'].includes(w.type);
  useEffect(() => { if (needsItems) pick.ids = new Set(cfg0.items || []); return () => stopPick(); }, []);
  const ids = [...pick.ids].filter((id) => hotel.live.items.has(id));
  const save = () => {
    const cfg = { text, secs: Number(secs), hand, dir, items: ids };
    hotel.socket.emit('hotel:wired:save', { itemId: item.id, cfg });
    onClose();
  };
  const tip = w.kind === 'trigger'
    ? 'Apila los efectos encima de este disparador (en la misma casilla): se disparan juntos.'
    : 'Ponlo encima de un disparador (en la misma casilla) para que se active con él.';
  return (
    <Window title={`Wired · ${WIRED_NAMES[w.type]}`} icon={Zap} onClose={onClose} className="ht-wired" foot={<><button className="ht-btn" onClick={onClose}>Cancelar</button><button className="ht-btn primary" onClick={save}><Check size={14} /> Guardar</button></>}>
      <p className="ht-hint">{tip}</p>
      {(w.type === 'say' || w.type === 'msg') && (
        <label className="ht-field"><span>{w.type === 'say' ? 'Palabra o frase' : 'Mensaje (susurro a quien lo activa)'}</span>
          {w.type === 'say'
            ? <input className="ht-input" value={text} maxLength={40} placeholder="Ej. abracadabra" onChange={(e) => setText(e.target.value)} autoFocus />
            : <textarea className="ht-input ht-textarea" value={text} maxLength={120} placeholder="Ej. ¡Bienvenido al laberinto!" onChange={(e) => setText(e.target.value)} autoFocus />}
        </label>
      )}
      {w.type === 'timer' && <label className="ht-field"><span>Cada cuántos segundos</span><input className="ht-input" type="number" min={1} max={600} value={secs} onChange={(e) => setSecs(e.target.value)} /></label>}
      {w.type === 'enter' && <p className="ht-hint">Se dispara cada vez que alguien entra a la sala.</p>}
      {w.type === 'hand' && (
        <div className="ht-field"><span>Objeto</span>
          <div className="ht-swatches">{Object.keys(HAND_ITEMS).map((id) => <button key={id} type="button" className={`ht-chip ${hand === id ? 'on' : ''}`} onClick={() => setHand(id)}>{handLabel(id)}</button>)}</div>
        </div>
      )}
      {needsItems && (
        <div className="ht-field"><span>{w.type === 'walk' ? 'Furnis que se pisan' : w.type === 'tele' ? 'Furnis destino' : 'Furnis'} ({ids.length}/10)</span>
          <div className="ht-wired-items">
            {ids.map((id) => { const it = hotel.live.items.get(id); return <span key={id} className="ht-chip"><FurniIcon type={it.type} color={it.color} size={20} /> {FURNI_BY_ID[it.type]?.name}<button type="button" onClick={() => dropPickId(id)} aria-label="Quitar"><X size={11} /></button></span>; })}
            {!ids.length && <span className="ht-muted">Todavía no eliges ninguno</span>}
          </div>
          <button type="button" className={`ht-btn sm ${pick.on ? 'primary' : ''}`} onClick={() => (pick.on ? stopPick() : startPick(item.id, ids))}><MousePointerClick size={14} /> {pick.on ? 'Listo' : 'Elegir en la sala'}</button>
        </div>
      )}
      {w.type === 'move' && (
        <div className="ht-field"><span>Hacia dónde</span>
          <div className="ht-swatches">
            {DIRS.map(([r, a, label]) => <button key={r} type="button" title={label} className={`ht-chip ${dir === r ? 'on' : ''}`} onClick={() => setDir(r)}>{a}</button>)}
            <button type="button" className={`ht-chip ${dir === 'rnd' ? 'on' : ''}`} onClick={() => setDir('rnd')}>🎲 Al azar</button>
          </div>
        </div>
      )}
    </Window>
  );
}

const TINTS = [['Noche', '#2b1f4a'], ['Atardecer', '#ff7a3d'], ['Rosa HUB', '#FE3377'], ['Océano', '#3a86ff'], ['Bosque', '#2fb67c'], ['Dorado', '#FFCC00'], ['Rojo', '#c0392b']];
function DimmerPanel({ item, onClose }) {
  const d0 = item.extra?.dimmer || { color: '#2b1f4a', alpha: 0.35 };
  const [on, setOn] = useState(item.state === 1 || !item.extra?.dimmer);
  const [color, setColor] = useState(d0.color);
  const [alpha, setAlpha] = useState(d0.alpha);
  // Vista previa en vivo (solo en tu pantalla hasta que aplicas)
  useEffect(() => {
    const it = hotel.live.items.get(item.id);
    if (!it) return undefined;
    const keep = { state: it.state, extra: it.extra };
    it.state = on ? 1 : 0; it.extra = { ...(it.extra || {}), dimmer: { color, alpha } };
    return () => { const cur = hotel.live.items.get(item.id); if (cur === it && !it._applied) Object.assign(it, keep); };
  }, [on, color, alpha]);
  const apply = () => {
    const it = hotel.live.items.get(item.id);
    if (it) it._applied = true;
    hotel.socket.emit('hotel:mech:dimmer', { itemId: item.id, color, alpha, on });
    onClose();
  };
  return (
    <Window title="Regulador de luz" icon={Sun} onClose={onClose} className="ht-dimmer" foot={<><button className="ht-btn" onClick={onClose}>Cancelar</button><button className="ht-btn primary" onClick={apply}><Check size={14} /> Aplicar</button></>}>
      <div className="ht-dim-toggle">
        <button type="button" className={`ht-chip ${on ? 'on' : ''}`} onClick={() => setOn(true)}><Moon size={13} /> Encendida</button>
        <button type="button" className={`ht-chip ${!on ? 'on' : ''}`} onClick={() => setOn(false)}><Sun size={13} /> Apagada</button>
      </div>
      <div className="ht-field"><span>Color</span>
        <div className="ht-swatches">
          {TINTS.map(([n, c]) => <button key={c} type="button" title={n} className={`ht-swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
          <input className="ht-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Otro color" />
        </div>
      </div>
      <label className="ht-field"><span>Intensidad · {Math.round(alpha * 100)}%</span>
        <input className="ht-range" type="range" min={5} max={80} value={Math.round(alpha * 100)} onChange={(e) => setAlpha(Number(e.target.value) / 100)} disabled={!on} />
      </label>
      <div className="ht-dim-preview" style={{ background: `linear-gradient(90deg, ${color}00, ${color})`, opacity: on ? 0.4 + alpha : 0.2 }} />
    </Window>
  );
}

function TrophyPanel({ item, onClose }) {
  const [text, setText] = useState(item.extra?.inscription || '');
  const save = () => { hotel.socket.emit('hotel:mech:engrave', { itemId: item.id, text }); onClose(); };
  return (
    <Window title="Dedicatoria del trofeo" icon={PenLine} onClose={onClose} className="ht-trophy" foot={<><button className="ht-btn" onClick={onClose}>Ahora no</button><button className="ht-btn primary" onClick={save}><Check size={14} /> Grabar</button></>}>
      <div className="ht-trophy-top"><FurniIcon type={item.type} color={item.color} size={56} /><p className="ht-hint">Escribe lo que quieres grabar en la placa. Todos lo ven al abrir el trofeo.</p></div>
      <textarea className="ht-input ht-textarea" value={text} maxLength={80} autoFocus placeholder="Ej. Mejor staff del mes · Mayo" onChange={(e) => setText(e.target.value)} />
      <span className="ht-muted" style={{ textAlign: 'right' }}>{text.length}/80</span>
    </Window>
  );
}
