import React, { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { TILE } from '@shared/map.js';
import ControlBar from './ControlBar.jsx';

// Vista mini del mapa cuando estás en otra sección (chat, calendario…)
export default function MiniWidget({ pip = false, win = window }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(true);
  const floor = useOffice((s) => s.floor);
  const users = useOffice((s) => s.users);
  useOffice((s) => s.talkingWith);
  const label = office.spaceLabel();

  useEffect(() => {
    if (!open) return;
    // En la mini ventana se dibuja con su propio reloj (la pestaña puede estar oculta)
    let raf;
    const draw = () => {
      raf = pip ? win.setTimeout(draw, 120) : requestAnimationFrame(draw);
      const c = ref.current;
      const me = office.myPlayer;
      if (!c || !floor || !me) return;
      const ctx = c.getContext('2d');
      const W = c.width, H = c.height;
      const s = 12; // px por tile
      ctx.fillStyle = '#2a2d34';
      ctx.fillRect(0, 0, W, H);
      const ox = W / 2 - (me.x + 0.5) * s;
      const oy = H / 2 - (me.y + 0.5) * s;
      // cuadrícula y muros
      for (let j = Math.max(0, Math.floor(-oy / s)); j < Math.min(floor.H, (H - oy) / s); j++) {
        for (let i = Math.max(0, Math.floor(-ox / s)); i < Math.min(floor.W, (W - ox) / s); i++) {
          if (floor.walls[j][i] === true) { ctx.fillStyle = '#4a4f5a'; ctx.fillRect(ox + i * s, oy + j * s, s, s); }
          else if (floor.walls[j][i] === 'glass') { ctx.fillStyle = '#6f8ea3'; ctx.fillRect(ox + i * s, oy + j * s, s, s); }
          else if (floor.solid[j][i]) { ctx.fillStyle = '#353a44'; ctx.fillRect(ox + i * s, oy + j * s, s, s); }
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 3.5 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      for (const [id, p] of Object.entries(office.players)) {
        if (p.floorId !== floor.id) continue;
        const u = users[id];
        const x = ox + (p.x + 0.5) * s, y = oy + (p.y + 0.5) * s;
        ctx.fillStyle = Number(id) === office.state.me.id ? '#2fd36b' : u?.avatar?.shirt || '#8ab';
        ctx.beginPath(); ctx.arc(x, y, Number(id) === office.state.me.id ? 4 : 6, 0, Math.PI * 2); ctx.fill();
      }
    };
    draw();
    return () => (pip ? win.clearTimeout(raf) : cancelAnimationFrame(raf));
  }, [open, floor, users, pip, win]);

  return (
    <div className={`mini ${pip ? 'mini-pip' : ''}`}>
      <div className="mini-head">
        <span><MapPin size={13} /> {label}</span>
        <div className="row gap4">
          {!pip && <button className="icon-btn" onClick={() => setOpen(!open)} title={open ? 'Minimizar' : 'Mostrar'}>{open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>}
          <button className="icon-btn" onClick={() => { office.set({ view: 'map' }); if (pip) { window.focus(); win.close(); } }} title="Volver a la oficina"><Maximize2 size={13} /></button>
        </div>
      </div>
      {open && <canvas ref={ref} width={pip ? 320 : 300} height={pip ? 150 : 130} onClick={() => { office.set({ view: 'map' }); if (pip) window.focus(); }} />}
      <ControlBar compact />
    </div>
  );
}
