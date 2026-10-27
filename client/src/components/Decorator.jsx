import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Undo2, Redo2, Search, Plus, Trash2, Lock, Square, Pencil, MousePointer2, Crown, Eye, RotateCw, RotateCcw } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { CATALOG, CATEGORIES, DESK_DECOR_LIMIT, AREA_DECOR_LIMIT, DESK_TYPES, CHAIR_TYPES, COLORS } from '@shared/catalog.js';
import { AREA_COLORS, AREA_SHAPES, TEMPLATES } from '@shared/map.js';
import { drawObjectPreview } from '../lib/render.js';
import * as editor from '../lib/editor.js';
import { api } from '../lib/api.js';
import { Toggle, Select } from './ui.jsx';

function Preview({ type }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) drawObjectPreview(ref.current, type); }, [type]);
  return <canvas ref={ref} width={140} height={110} />;
}

export default function Decorator() {
  const mode = useOffice((s) => s.editMode);
  const ed = useOffice((s) => s.editor);
  const floor = useOffice((s) => s.floor);
  const me = useOffice((s) => s.me);
  const [tab, setTab] = useState('objects');
  const close = () => office.set((st) => ({ editMode: null, editor: { ...st.editor, tool: 'select', placing: null, selected: null, newArea: null, areaTarget: null } }));

  useEffect(() => {
    editor.resetHistory();
    return () => office.set((st) => ({ editor: { ...st.editor, tool: 'select', placing: null, selected: null, newArea: null, areaTarget: null } }));
  }, [mode]);

  const desk = floor && editor.myDesk(floor, me.id);
  const depts = floor ? editor.decorAreas(floor, me) : [];
  const leads = depts.some((a) => editor.isLeaderOf(a, me));

  useEffect(() => {
    if (mode === 'decor' && !desk && depts.length) setTab('dept');
  }, [mode, !!desk, depts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'decor' && desk) {
      const z = desk.zone;
      office.cameraTarget = { x: z.x + z.w / 2, y: z.y + z.h / 2, zoom: 2.4 };
    } else if (mode === 'decor' && depts[0]) {
      const a = depts[0];
      office.cameraTarget = { x: a.x + a.w / 2, y: a.y + a.h / 2, zoom: 1.6 };
    }
  }, [mode, desk?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="decorator">
      <div className="dec-head">
        <h3>{mode === 'build' ? 'Editar oficina' : 'Decorador'}</h3>
        <button className="icon-btn" onClick={close} aria-label="Cerrar"><X size={18} /></button>
      </div>

      {mode === 'decor' && (desk || depts.length > 0) && (
        <div className="seg small">
          {[['objects', 'Objetos'], desk && ['place', 'Mi lugar'], depts.length > 0 && ['dept', 'Departamento']].filter(Boolean).map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      )}
      {mode === 'build' && (
        <div className="seg small">
          {[['objects', 'Objetos'], ['areas', 'Áreas'], ['floors', 'Pisos']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      )}

      {mode === 'decor' && !desk && !depts.length ? (
        <NoDesk floor={floor} />
      ) : mode === 'decor' && tab === 'dept' ? (
        <DeptTab floor={floor} me={me} depts={depts} />
      ) : mode === 'build' && tab === 'areas' ? (
        <AreasTab floor={floor} ed={ed} />
      ) : mode === 'build' && tab === 'floors' ? (
        <FloorsTab floor={floor} />
      ) : mode === 'decor' && tab === 'place' ? (
        <MyPlace floor={floor} desk={desk} />
      ) : (
        <ObjectsTab mode={mode} ed={ed} floor={floor} desk={desk} leads={leads} />
      )}
    </div>
  );
}

function NoDesk({ floor }) {
  const free = floor?.desks.filter((d) => !floor.claims[d.id]) || [];
  return (
    <div className="dec-empty">
      <p>Para decorar necesitas un escritorio propio. Pasa el cursor sobre un escritorio libre y pulsa <b>Reclamar</b>.</p>
      {free.length > 0 && (
        <button className="btn primary" onClick={() => office.goToDesk(free[0])}>Ir a un escritorio libre</button>
      )}
    </div>
  );
}

function ObjectsTab({ mode, ed, floor, desk, leads }) {
  const full = mode === 'build' || leads;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(mode === 'decor' ? 'tech' : 'muebles');

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.entries(CATALOG).filter(([, c]) => {
      if (!full && c.kind !== 'decor') return false;
      if (s) return c.name.toLowerCase().includes(s);
      return c.cat === cat;
    });
  }, [q, cat, full]);

  const cats = CATEGORIES.filter((c) => Object.values(CATALOG).some((x) => x.cat === c.id && (full || x.kind === 'decor')));
  const used = desk ? floor.objects.filter((o) => o.deskId === desk.id).length : 0;
  const pick = (type) => office.set((st) => ({ editor: { ...st.editor, placing: st.editor.placing?.type === type ? null : { type, rot: 0, color: null }, selected: null, tool: 'select' } }));

  return (
    <>
      <div className="dec-search">
        <Search size={15} />
        <input placeholder="Buscar un objeto" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!q && (
        <div className="dec-cats">
          {cats.map((c) => (
            <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>
          ))}
        </div>
      )}
      <div className="dec-grid">
        {items.map(([type, c]) => (
          <button key={type} className={`dec-item ${ed.placing?.type === type ? 'on' : ''}`} onClick={() => pick(type)} title={c.name}>
            <Preview type={type} />
            <span>{c.name}</span>
          </button>
        ))}
        {!items.length && <div className="muted pad">Sin resultados</div>}
      </div>
      <div className="dec-hint">
        {ed.placing ? (
          <>Haz clic en el mapa para colocar. <b>R</b> rota, <b>Esc</b> o clic derecho para terminar.</>
        ) : (
          <><MousePointer2 size={12} /> Arrastra para mover. Selecciona un objeto para cambiar color, rotar o borrar.</>
        )}
      </div>
      <div className="dec-foot">
        <div className="row gap4">
          <button className="icon-btn" disabled={!ed.history.undo} onClick={editor.undo} title="Deshacer (Ctrl+Z)"><Undo2 size={16} /></button>
          <button className="icon-btn" disabled={!ed.history.redo} onClick={editor.redo} title="Rehacer (Ctrl+Shift+Z)"><Redo2 size={16} /></button>
        </div>
        {mode === 'decor' && desk && <span className="muted">Tu escritorio: {Math.round((used / DESK_DECOR_LIMIT) * 100)}%</span>}
      </div>
    </>
  );
}

function AreasTab({ floor, ed }) {
  const [form, setForm] = useState({ name: '', color: 'carpet', private: false });
  const drawing = ed.tool === 'area';

  const startDraw = (areaTarget = null) => office.set((st) => ({ editor: { ...st.editor, tool: 'area', placing: null, selected: null, areaTarget, newArea: null } }));
  const stopDraw = () => office.set((st) => ({ editor: { ...st.editor, tool: 'select', areaTarget: null, newArea: null } }));

  // Al terminar de dibujar un rectángulo
  useEffect(() => {
    if (!ed.newArea) return;
    if (ed.areaTarget) {
      api.patch(`/areas/${ed.areaTarget}`, ed.newArea).then(() => office.toast({ title: 'Área actualizada' })).catch((e) => office.toast({ title: e.message, kind: 'error' }));
      stopDraw();
    }
  }, [ed.newArea]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/floors/${floor.id}/areas`, { ...form, ...ed.newArea });
      setForm({ name: '', color: 'carpet', private: false });
      stopDraw();
      office.toast({ title: `Área "${form.name}" creada` });
    } catch (err) {
      office.toast({ title: err.message, kind: 'error' });
    }
  };

  const patch = (a, p) => api.patch(`/areas/${a.id}`, p).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  const remove = (a) => {
    if (confirm(`¿Borrar el área "${a.name}"? Los objetos se quedan donde están.`)) api.del(`/areas/${a.id}`).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  };

  const colorOpts = AREA_COLORS.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="dec-scroll">
      <p className="muted small">
        Las áreas agrupan a la gente: departamentos, salas o zonas comunes. En un área <b>privada</b> todos los que estén dentro
        hablan entre sí (y nadie de fuera los oye). En las públicas se habla por cercanía.
      </p>

      {ed.newArea && !ed.areaTarget ? (
        <form className="area-form" onSubmit={create}>
          <div className="area-form-title">Nueva área ({ed.newArea.w}×{ed.newArea.h})</div>
          <input placeholder="Nombre (ej. Marketing)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required maxLength={48} />
          <Select value={form.color} onChange={(v) => setForm({ ...form, color: v })} options={colorOpts} />
          <label className="row between"><span>Privada (conversación de sala)</span><Toggle checked={form.private} onChange={(v) => setForm({ ...form, private: v })} /></label>
          <div className="row gap8">
            <button className="btn primary" type="submit">Crear área</button>
            <button className="btn" type="button" onClick={stopDraw}>Cancelar</button>
          </div>
        </form>
      ) : drawing ? (
        <div className="area-form">
          <div>{ed.areaTarget ? 'Dibuja el nuevo tamaño del área en el mapa.' : 'Arrastra en el mapa para dibujar el área.'}</div>
          <button className="btn" onClick={stopDraw}>Cancelar</button>
        </div>
      ) : (
        <button className="btn primary block" onClick={() => startDraw()}><Plus size={15} /> Nueva área / departamento</button>
      )}

      <div className="area-list">
        {floor.areas.map((a) => (
          <div key={a.id} className={`area-item ${ed.areaTarget === a.id ? 'on' : ''}`}>
            <div className="row between">
              <input className="inline-input" defaultValue={a.name} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && patch(a, { name: e.target.value })} />
              <div className="row gap4">
                <button className="icon-btn" title="Redibujar" onClick={() => startDraw(a.id)}><Pencil size={14} /></button>
                <button className="icon-btn danger" title="Borrar" onClick={() => remove(a)}><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="row between">
              <Select value={a.color} onChange={(v) => patch(a, { color: v })} options={colorOpts} className="small" />
              <label className="row gap4 small" title="Área privada">
                {a.private ? <Lock size={13} /> : <Square size={13} />}
                <Toggle checked={a.private} onChange={(v) => patch(a, { private: v })} />
              </label>
            </div>
            <Select value={a.shape || 'soft'} onChange={(v) => patch(a, { shape: v })} options={AREA_SHAPES.map((x) => ({ value: x.id, label: x.name }))} className="small" />
            <Leaders area={a} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Líderes de un departamento (solo admin)
function Leaders({ area }) {
  const users = useOffice((s) => s.users);
  const leaders = area.leaders || [];
  const set = (ids) => api.put(`/areas/${area.id}/leaders`, { userIds: ids }).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  const options = Object.values(users)
    .filter((u) => !u.disabled && !leaders.includes(u.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((u) => ({ value: String(u.id), label: u.displayName }));
  return (
    <div className="leaders">
      <span className="small muted row gap4"><Crown size={12} /> Líderes</span>
      <div className="leader-chips">
        {leaders.map((id) => (
          <span key={id} className="chip">
            {users[id]?.displayName || 'Alguien'}
            <button type="button" aria-label="Quitar líder" onClick={() => set(leaders.filter((x) => x !== id))}><X size={11} /></button>
          </span>
        ))}
        {options.length > 0 && leaders.length < 10 && (
          <Select value="" onChange={(v) => v && set([...leaders, Number(v)])} options={[{ value: '', label: '+ Añadir líder' }, ...options]} className="small" />
        )}
      </div>
    </div>
  );
}

// Departamentos que esta persona lidera o puede decorar
function DeptTab({ floor, me, depts }) {
  const colorOpts = AREA_COLORS.map((c) => ({ value: c.id, label: c.name }));
  const style = (a, p) => api.patch(`/areas/${a.id}/style`, p).catch((e) => office.toast({ title: e.message, kind: 'error' }));
  const look = (a) => { office.cameraTarget = { x: a.x + a.w / 2, y: a.y + a.h / 2, zoom: 1.6 }; };
  const members = (a) => floor.desks.filter((d) => floor.claims[d.id] && editor.insideZone(d.object, a)).length;
  const objects = (a) => floor.objects.filter((o) => o.deskId == null && !CATALOG[o.type]?.claimable && editor.insideZone(o, a)).length;

  return (
    <div className="dec-scroll">
      <p className="muted small">
        Lo que pongas dentro del departamento (marcado con línea punteada) lo ve todo el equipo. Los escritorios de cada persona siguen siendo suyos.
      </p>
      <div className="area-list">
        {depts.map((a) => {
          const lead = editor.isLeaderOf(a, me);
          return (
            <div key={a.id} className="area-item">
              <div className="row between">
                <b className="row gap4">{lead && <Crown size={14} />} {a.name}</b>
                <button className="btn tiny" onClick={() => look(a)}><Eye size={13} /> Ver</button>
              </div>
              <div className="small muted">{members(a)} con escritorio · objetos {Math.round((objects(a) / AREA_DECOR_LIMIT) * 100)}%</div>
              {lead ? (
                <>
                  <div className="row between gap8">
                    <Select value={a.color} onChange={(v) => style(a, { color: v })} options={colorOpts} className="small" />
                    <Select value={a.shape || 'soft'} onChange={(v) => style(a, { shape: v })} options={AREA_SHAPES.map((x) => ({ value: x.id, label: x.name }))} className="small" />
                  </div>
                  <label className="row between">
                    <span>Que mi equipo también decore</span>
                    <Toggle checked={a.openDecor} onChange={(v) => style(a, { openDecor: v })} />
                  </label>
                  <div className="small muted">
                    Como líder puedes colocar muebles y decoración, moverlos y quitarlos. {a.openDecor
                      ? 'Tu equipo puede añadir decoración y mover la que puso cada quien.'
                      : 'Actívalo para que tu equipo pueda añadir decoración.'}
                  </div>
                </>
              ) : (
                <div className="small muted">Tu líder abrió la decoración: puedes añadir objetos dentro del departamento y mover los tuyos.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FloorsTab({ floor }) {
  const floors = useOffice((s) => s.floors);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('hq');

  const add = async (e) => {
    e.preventDefault();
    try {
      const { floor: f } = await api.post('/floors', { name, template });
      setName('');
      office.toast({ title: `Piso "${f.name}" creado` });
      office.changeFloor(f.id);
    } catch (err) {
      office.toast({ title: err.message, kind: 'error' });
    }
  };

  return (
    <div className="dec-scroll">
      <p className="muted small">Crea pisos nuevos cuando el equipo crezca. Cada piso tiene su propio mapa, áreas y escritorios.</p>
      <div className="area-list">
        {floors.map((f) => (
          <div key={f.id} className={`area-item ${f.id === floor.id ? 'on' : ''}`}>
            <div className="row between">
              <input className="inline-input" defaultValue={f.name} onBlur={(e) => e.target.value.trim() && e.target.value !== f.name && api.patch(`/floors/${f.id}`, { name: e.target.value }).catch((err) => office.toast({ title: err.message, kind: 'error' }))} />
              <div className="row gap4">
                {f.id !== floor.id && <button className="btn tiny" onClick={() => office.changeFloor(f.id)}>Ir</button>}
                {floors.length > 1 && (
                  <button className="icon-btn danger" title="Borrar piso" onClick={() => confirm(`¿Borrar "${f.name}" con todo su contenido?`) && api.del(`/floors/${f.id}`).catch((err) => office.toast({ title: err.message, kind: 'error' }))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <form className="area-form" onSubmit={add}>
        <div className="area-form-title">Nuevo piso</div>
        <input placeholder={`Piso ${floors.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <Select value={template} onChange={setTemplate} options={Object.entries(TEMPLATES).map(([k, t]) => ({ value: k, label: t.name }))} />
        <button className="btn primary" type="submit"><Plus size={15} /> Crear piso</button>
      </form>
    </div>
  );
}

// Mi lugar: modelo y color del escritorio y de la silla propios
function ModelPicker({ title, types, obj, rotate }) {
  if (!obj) return null;
  const turn = (k) => editor.updateObject(obj, { rot: ((obj.rot || 0) + k + 4) % 4 }).catch(() => {});
  return (
    <div className="area-form">
      <div className="area-form-title row between">
        <span>{title}</span>
        {rotate && (
          <span className="row gap4">
            <button className="btn tiny" onClick={() => turn(-1)} title="Girar a la izquierda"><RotateCcw size={13} /></button>
            <button className="btn tiny" onClick={() => turn(1)} title="Girar a la derecha"><RotateCw size={13} /> Girar</button>
          </span>
        )}
      </div>
      <div className="model-grid">
        {types.map((t) => (
          <button key={t} className={`dec-item ${obj.type === t ? 'on' : ''}`} onClick={() => obj.type !== t && editor.updateObject(obj, { type: t }).catch(() => {})} title={CATALOG[t].name}>
            <Preview type={t} />
            <span>{CATALOG[t].name}</span>
          </button>
        ))}
      </div>
      <div className="swatch-row">
        {COLORS.map((c) => (
          <button key={c} className={`sw ${(obj.color || CATALOG[obj.type].color) === c ? 'on' : ''}`} style={{ background: c }} onClick={() => editor.updateObject(obj, { color: c }).catch(() => {})} aria-label={c} />
        ))}
        <label className="sw sw-custom" title="Cualquier color">
          +
          <input type="color" value={obj.color || CATALOG[obj.type].color || '#888888'} onChange={(e) => editor.updateObject(obj, { color: e.target.value }).catch(() => {})} aria-label="Color personalizado" />
        </label>
      </div>
    </div>
  );
}

function MyPlace({ floor, desk }) {
  const deskObj = floor.objects.find((o) => o.id === desk.id);
  const chair = editor.chairOf(floor, desk);
  return (
    <div className="dec-scroll">
      <p className="muted small">Así se ve tu lugar para todos. La decoración la colocas desde la pestaña Objetos.</p>
      <ModelPicker title="Escritorio" types={DESK_TYPES} obj={deskObj} />
      <ModelPicker title="Silla" types={CHAIR_TYPES} obj={chair} rotate />
      <p className="muted small">Tip: también puedes arrastrar la silla dentro de tu lugar y girarla con <b>R</b>.</p>
    </div>
  );
}
