// Minimapa: todo el piso en chiquito, con la gente conectada, la parte que estás
// viendo y la sala donde estás. Clic para caminar hasta ahí.
import React, { useEffect, useRef, useState } from 'react';
import { X, Map as MapIcon } from 'lucide-react';
import { TILE, areaAt } from '@shared/map.js';
import { office, useOffice } from '../lib/store.js';

const W = 232;
const H = 150;
const readOpen = () => { try { return localStorage.getItem('nuvora:minimap') !== '0'; } catch { return true; } };

export default function Minimap({ floor, staticRef, view }) {
  const users = useOffice((s) => s.users);
  const me = useOffice((s) => s.me);
  const [open, setOpen] = useState(readOpen);
  const [where, setWhere] = useState('');
  const [online, setOnline] = useState(0);
  const ref = useRef(null);
  const usersRef = useRef(users);
  usersRef.current = users;

  const toggle = (v) => { setOpen(v); try { localStorage.setItem('nuvora:minimap', v ? '1' : '0'); } catch { /* sin almacenamiento */ } };

  const fit = () => {
    const fw = floor.W * TILE;
    const fh = floor.H * TILE;
    const k = Math.min(W / fw, H / fh);
    return { k, ox: (W - fw * k) / 2, oy: (H - fh * k) / 2 };
  };

  useEffect(() => {
    if (!open || !floor) return undefined;
    let raf;
    let last = 0;
    const draw = (t) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 200) return;
      last = t;
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const { k, ox, oy } = fit();
      ctx.imageSmoothingEnabled = true;
      if (staticRef.current) ctx.drawImage(staticRef.current, ox, oy, floor.W * TILE * k, floor.H * TILE * k);
      // Lo que se ve en pantalla
      const v = view.current;
      if (v?.w && v.zoom) {
        const vw = v.w / v.zoom;
        const vh = v.h / v.zoom;
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ox + (v.camX - vw / 2) * k, oy + (v.camY - vh / 2) * k, vw * k, vh * k);
      }
      // Personas conectadas en este piso
      let n = 0;
      const us = usersRef.current;
      for (const [id, p] of Object.entries(office.players)) {
        if (p.floorId !== floor.id) continue;
        n++;
        const mine = Number(id) === me.id;
        const x = ox + ((p.rx ?? p.x) + 0.5) * TILE * k;
        const y = oy + ((p.ry ?? p.y) + 0.5) * TILE * k;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, mine ? 5 : 4, 0, Math.PI * 2); ctx.fill();
        const st = us[id]?.status || p.status;
        ctx.fillStyle = mine ? '#FE3377' : st === 'busy' ? '#ff8a3d' : st === 'away' ? '#adb5bd' : '#3ddc84';
        ctx.beginPath(); ctx.arc(x, y, mine ? 3.5 : 2.8, 0, Math.PI * 2); ctx.fill();
      }
      const mine = office.players[me.id];
      setOnline(n);
      setWhere(mine ? areaAt(floor, mine.x, mine.y)?.name || 'Pasillo' : '');
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, floor, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const { k, ox, oy } = fit();
    const x = Math.floor((e.clientX - r.left - ox) / k / TILE);
    const y = Math.floor((e.clientY - r.top - oy) / k / TILE);
    if (x >= 0 && y >= 0 && x < floor.W && y < floor.H) office.pathTarget = { x, y, near: false };
  };

  if (!floor) return null;
  if (!open) {
    return (
      <button className="minimap-btn" onClick={() => toggle(true)} title="Mostrar minimapa" aria-label="Mostrar minimapa"><MapIcon size={16} /></button>
    );
  }
  return (
    <div className="minimap">
      <canvas ref={ref} style={{ width: W, height: H }} onClick={go} title="Clic para ir" />
      <div className="minimap-foot">
        <span><span className="mm-muted">Estás en:</span> <b>{where}</b></span>
        <span className="mm-online"><span className="mm-dot" />{online} aquí</span>
        <button className="icon-btn mm-close" onClick={() => toggle(false)} aria-label="Ocultar minimapa" title="Ocultar minimapa"><X size={14} /></button>
      </div>
    </div>
  );
}
