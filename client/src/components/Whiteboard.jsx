import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Trash2, Eraser, Pen, Download } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { Modal } from './ui.jsx';

const W = 1600, H = 900;
const PENS = ['#101010', '#FE3377', '#3a86ff', '#2bb673', '#FF8A3D', '#9b5de5', '#FFCC00'];
const SIZES = [3, 6, 12];

function drawStroke(ctx, s) {
  ctx.save();
  ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.e ? s.w * 4 : s.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = s.p;
  if (pts.length === 1) {
    ctx.beginPath(); ctx.arc(pts[0][0] * W, pts[0][1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
    ctx.stroke();
  }
  ctx.restore();
}

// Pizarrón compartido: lo que dibuja una persona lo ven en vivo los demás que lo tengan abierto
export default function Whiteboard({ objectId }) {
  const ref = useRef(null);
  const strokes = useRef([]);
  const cur = useRef(null);
  const [color, setColor] = useState(PENS[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [eraser, setEraser] = useState(false);
  const me = useOffice((s) => s.me);
  const close = () => office.set({ modal: null });

  const redraw = () => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const s of strokes.current) drawStroke(ctx, s);
    if (cur.current) drawStroke(ctx, cur.current);
  };

  useEffect(() => {
    const sock = office.socket;
    if (!sock) return undefined;
    const onState = (m) => { if (m.id === objectId) { strokes.current = m.strokes; redraw(); } };
    const onStroke = (m) => { if (m.id === objectId) { strokes.current.push(m.stroke); drawStroke(ref.current.getContext('2d'), m.stroke); } };
    sock.on('board:state', onState);
    sock.on('board:stroke', onStroke);
    sock.emit('board:join', objectId);
    return () => {
      sock.emit('board:leave', objectId);
      sock.off('board:state', onState);
      sock.off('board:stroke', onStroke);
    };
  }, [objectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
  };
  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    cur.current = { c: color, w: size, p: [pos(e)], e: eraser, u: me.id };
    redraw();
  };
  const move = (e) => {
    if (!cur.current) return;
    const p = pos(e);
    const last = cur.current.p[cur.current.p.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.002) return;
    cur.current.p.push(p);
    if (cur.current.p.length >= 590) up();
    else redraw();
  };
  const up = () => {
    const s = cur.current;
    if (!s) return;
    cur.current = null;
    strokes.current.push(s);
    office.socket?.emit('board:stroke', { id: objectId, stroke: s });
    redraw();
  };

  const download = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(ref.current, 0, 0);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'pizarron.png';
    a.click();
  };

  return (
    <Modal title="Pizarrón" onClose={close} width={1040} className="board-modal">
      <div className="board-tools">
        <div className="row gap4">
          {PENS.map((c) => (
            <button key={c} className={`sw ${!eraser && color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => { setColor(c); setEraser(false); }} aria-label={`Color ${c}`} />
          ))}
        </div>
        <div className="row gap4">
          {SIZES.map((s) => (
            <button key={s} className={`chip-btn ${size === s ? 'on' : ''}`} onClick={() => setSize(s)} aria-label={`Grosor ${s}`}><span className="dot-size" style={{ width: s + 2, height: s + 2 }} /></button>
          ))}
        </div>
        <button className={`icon-btn ${!eraser ? 'active' : ''}`} onClick={() => setEraser(false)} title="Plumón"><Pen size={16} /></button>
        <button className={`icon-btn ${eraser ? 'active' : ''}`} onClick={() => setEraser(true)} title="Borrador"><Eraser size={16} /></button>
        <div className="flex1" />
        <button className="icon-btn" onClick={() => office.socket?.emit('board:undo', objectId)} title="Deshacer mi último trazo"><Undo2 size={16} /></button>
        <button className="icon-btn" onClick={download} title="Descargar imagen"><Download size={16} /></button>
        <button className="icon-btn danger" onClick={() => confirm('¿Borrar todo el pizarrón para todos?') && office.socket?.emit('board:clear', objectId)} title="Borrar todo"><Trash2 size={16} /></button>
      </div>
      <canvas ref={ref} width={W} height={H} className="board-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="muted small">Lo que dibujas se guarda y lo ven en vivo quienes tengan abierto este pizarrón.</div>
    </Modal>
  );
}
