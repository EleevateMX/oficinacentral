// Hotel: vista principal (navegador → sala). Se abre desde el riel ("Hotel") o el elevador de la oficina.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Package, ShoppingBag, Settings, MessageSquare, ZoomIn, ZoomOut, LocateFixed, Compass, Send, RotateCw, X, Bell, Megaphone, MessageCircle } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { FURNI_BY_ID } from '@shared/hotelCatalog.js';
import { hotel, useHotel } from './hotelStore.js';
import { HotelEngine } from './engine.js';
import Navigator from './Navigator.jsx';
import { InventoryPanel, CatalogPanel, SettingsPanel, ChatLogPanel, ItemCard, UserCard } from './Panels.jsx';
import { MechLayer } from './MechPanels.jsx';
import { mechPick } from './mechanics.js';
import './hotel.css';
import ConsolePanel, { ConsoleButton } from './social/Console.jsx'; // B: social
import PersonCard from './social/PersonCard.jsx'; // B: social
import { RoomSocialBar, EventBanner } from './social/RoomSocial.jsx'; // B: social
import Catalog from './economy/Catalog.jsx'; // A: tienda con créditos HUB
import EconomyLayer, { WalletBadge } from './economy/EconomyLayer.jsx'; // A: monedero, intercambios y regalos

const isTyping = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };

export default function HotelView() {
  const screen = useHotel((s) => s.screen);
  const fx = useOffice((s) => s.hotelFx);
  const [riding, setRiding] = useState(fx === 'elevator');

  useEffect(() => {
    hotel.attach();
    hotel.loadInventory();
    hotel.enterOfficial(); // entrar directo a la Oficina Central (el navegador sigue a un clic)
    return () => {
      if (hotel.state.roomId) hotel.socket?.emit('hotel:leave');
      hotel.clearRoom();
      hotel.detach();
    };
  }, []);
  // Elevador: un momento de "subiendo…"
  useEffect(() => {
    if (fx !== 'elevator') return undefined;
    setRiding(true);
    const t = setTimeout(() => { setRiding(false); office.set({ hotelFx: null }); }, 1500);
    return () => clearTimeout(t);
  }, [fx]);

  const exit = () => office.set({ view: 'map' });
  return (
    <div className="hotel">
      {screen === 'room' ? <RoomView onExit={exit} /> : <Navigator onExit={exit} />}
      <ConsolePanel />
      {riding && (
        <div className="ht-elevator">
          <div className="ht-elev-doors"><span /><span /></div>
          <div className="ht-elev-text"><b>▲</b> Subiendo al Hotel…</div>
        </div>
      )}
    </div>
  );
}

function RoomView({ onExit }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const room = useHotel((s) => s.room);
  const panel = useHotel((s) => s.panel);
  const selected = useHotel((s) => s.selected);
  const placing = useHotel((s) => s.placing);
  const bells = useHotel((s) => s.bells);
  const isOwner = useHotel((s) => s.isOwner);
  const admin = useHotel((s) => s.admin);
  useHotel((s) => s.rights);

  useEffect(() => {
    const eng = new HotelEngine(canvasRef.current, {
      onTile: (x, y) => { hotel.socket.emit('hotel:walk', { x, y }); hotel.set({ selected: null }); },
      onItem: (item) => {
        if (mechPick(item)) return; // eligiendo furnis para un wired
        hotel.set({ selected: { itemId: item.id } });
        if (!item.wall) hotel.socket.emit('hotel:look', { x: item.x, y: item.y });
      },
      onUse: (item) => hotel.socket.emit('hotel:use', { itemId: item.id }),
      onUser: (id) => hotel.set({ selected: { userId: id } }),
      onEmpty: () => hotel.set({ selected: null }),
      onInvalid: (reason) => office.toast({ title: reason }),
    });
    engineRef.current = eng;
    eng.start();
    return () => eng.stop();
  }, []);

  // Teclado: R gira el furni que colocas, Esc cancela
  useEffect(() => {
    const k = (e) => {
      if (isTyping()) return;
      if (e.key === 'Escape') { if (hotel.state.placing) hotel.set({ placing: null }); else if (hotel.state.selected) hotel.set({ selected: null }); else if (hotel.state.panel) hotel.set({ panel: null }); }
      else if ((e.key === 'r' || e.key === 'R') && hotel.state.placing) hotel.rotatePlacing();
      else if (e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) window.dispatchEvent(new Event('hotel:focus-chat'));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  if (!room) return null;
  const togglePanel = (p) => hotel.set({ panel: panel === p ? null : p });
  const sel = selected?.itemId ? hotel.live.items.get(selected.itemId) : null;
  const pdef = placing && FURNI_BY_ID[placing.type];
  const owner = office.state.users[room.ownerId];
  return (
    <div className="ht-room">
      <div className="ht-canvas-wrap"><canvas ref={canvasRef} /></div>
      <div className="ht-topbar">
        <button className="ht-btn dark" onClick={onExit} title="Volver a la oficina"><ArrowLeft size={16} /> <span className="ht-hide-sm">Oficina</span></button>
        <button className="ht-btn dark" onClick={() => hotel.leave()} title="Ver otras salas"><Compass size={16} /> <span className="ht-hide-sm">Navegador</span></button>
        <div className="ht-roomname">
          <b>{room.name}</b>
          <span>{room.official ? 'Sala oficial GTAHUB' : `de ${owner?.displayName || room.ownerName}`}</span>
        </div>
        <RoomSocialBar />
        <WalletBadge />
      </div>
      <div className="ht-sidebar">
        <button className={`ht-tool ${panel === 'inventory' ? 'on' : ''}`} onClick={() => togglePanel('inventory')} title="Inventario"><Package size={20} /><span>Inventario</span></button>
        <button className={`ht-tool ${panel === 'catalog' ? 'on' : ''}`} onClick={() => togglePanel('catalog')} title="Tienda"><ShoppingBag size={20} /><span>Tienda</span></button>
        <ConsoleButton />
        <button className={`ht-tool ${panel === 'log' ? 'on' : ''}`} onClick={() => togglePanel('log')} title="Historial del chat"><MessageSquare size={20} /><span>Chat</span></button>
        {(isOwner || admin) && <button className={`ht-tool ${panel === 'settings' ? 'on' : ''}`} onClick={() => togglePanel('settings')} title="Ajustes de la sala"><Settings size={20} /><span>Ajustes</span></button>}
        <div className="ht-tool-sep" />
        <button className="ht-tool sm" onClick={() => engineRef.current?.zoomAt(1.25)} title="Acercar"><ZoomIn size={18} /></button>
        <button className="ht-tool sm" onClick={() => engineRef.current?.zoomAt(0.8)} title="Alejar"><ZoomOut size={18} /></button>
        <button className="ht-tool sm" onClick={() => { const e = engineRef.current; if (e && hotel.live.grid) e.center(hotel.live.grid); }} title="Centrar"><LocateFixed size={18} /></button>
      </div>
      <EventBanner />
      {bells.length > 0 && (
        <div className="ht-bells">
          {bells.map((b) => (
            <div key={b.userId} className="ht-bell">
              <Bell size={16} className="ht-ring" /> <span><b>{b.name}</b> toca el timbre</span>
              <button className="ht-btn primary sm" onClick={() => { hotel.socket.emit('hotel:bell:answer', { userId: b.userId, allow: true }); hotel.set((st) => ({ bells: st.bells.filter((x) => x.userId !== b.userId) })); }}>Dejar pasar</button>
              <button className="ht-btn sm" onClick={() => { hotel.socket.emit('hotel:bell:answer', { userId: b.userId, allow: false }); hotel.set((st) => ({ bells: st.bells.filter((x) => x.userId !== b.userId) })); }}>No</button>
            </div>
          ))}
        </div>
      )}
      {placing && pdef && (
        <div className="ht-placing">
          <span>{placing.move ? 'Moviendo' : 'Colocando'} <b>{pdef.name}</b> · {pdef.kind === 'wall' ? 'pásalo sobre una pared' : 'clic en el piso'}</span>
          {pdef.kind === 'floor' && pdef.rots.length > 1 && <button className="ht-btn sm" onClick={() => hotel.rotatePlacing()}><RotateCw size={14} /> Girar <kbd>R</kbd></button>}
          <button className="ht-btn sm" onClick={() => hotel.set({ placing: null })}><X size={14} /> Listo <kbd>Esc</kbd></button>
        </div>
      )}
      <div className="ht-panels">
        {panel === 'inventory' && <InventoryPanel />}
        {panel === 'catalog' && <Catalog />}
        {panel === 'settings' && <SettingsPanel key={room.id} />}
        {panel === 'log' && <ChatLogPanel />}
      </div>
      <div className="ht-cards">
        {sel && <ItemCard key={`i${sel.id}`} item={sel} />}
        {selected?.userId && (selected.userId < 0 ? <UserCard key={`b${selected.userId}`} userId={selected.userId} /> : <PersonCard key={`u${selected.userId}`} userId={selected.userId} />)}
      </div>
      <EconomyLayer />
      <MechLayer />
      <ChatBar />
    </div>
  );
}

function ChatBar() {
  const mode = useHotel((s) => s.chatMode);
  const whisperTo = useHotel((s) => s.whisperTo);
  useHotel((s) => s.usersV);
  const [text, setText] = useState('');
  const ref = useRef(null);
  const typing = useRef(false);
  useEffect(() => {
    const f = () => ref.current?.focus();
    window.addEventListener('hotel:focus-chat', f);
    return () => window.removeEventListener('hotel:focus-chat', f);
  }, []);
  const setTyping = (on) => { if (typing.current !== on) { typing.current = on; hotel.socket?.emit('hotel:typing', on); } };
  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    hotel.say(text);
    setText('');
    setTyping(false);
  };
  const target = whisperTo && hotel.live.users.get(whisperTo);
  const cycle = () => hotel.set({ chatMode: mode === 'say' ? 'shout' : 'say', whisperTo: null });
  return (
    <form className={`ht-chatbar ${mode}`} onSubmit={send}>
      <button type="button" className="ht-mode" onClick={cycle} title={mode === 'shout' ? 'Gritando (todos lo ven en grande)' : mode === 'whisper' ? 'Susurro' : 'Hablar'}>
        {mode === 'shout' ? <Megaphone size={16} /> : mode === 'whisper' ? <MessageCircle size={16} /> : <MessageSquare size={16} />}
      </button>
      {mode === 'whisper' && target && <span className="ht-whisper-to">a {target.name}<button type="button" onClick={() => hotel.set({ chatMode: 'say', whisperTo: null })}><X size={12} /></button></span>}
      <input
        ref={ref} value={text} maxLength={200}
        placeholder={mode === 'shout' ? '¡Grita algo!' : mode === 'whisper' ? 'Susurra algo…' : 'Escribe algo…'}
        onChange={(e) => { setText(e.target.value); setTyping(!!e.target.value); }}
        onBlur={() => setTyping(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.blur(); setText(''); setTyping(false); } }}
      />
      <button className="ht-send" disabled={!text.trim()} aria-label="Enviar"><Send size={16} /></button>
    </form>
  );
}
