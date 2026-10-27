import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Modal, AvatarCanvas, initials, Select } from './ui.jsx';
import { SPRITE_OPTIONS, STYLE_NAMES, PARTS, PACKS, PRESETS, normalizeSpec, randomSpec } from '@shared/sprite.js';
import { Shuffle, Plus } from 'lucide-react';
import { timezones, tzOffsetLabel } from '../lib/time.js';
import { PETS, PET_COLORS, petDef } from '@shared/pets.js';
import { drawPet } from '../lib/pets.js';

// Reduce la imagen a 256×256 (recorte cuadrado centrado)
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function EditProfile() {
  const me = useOffice((s) => s.users[s.me.id] || s.me);
  const [form, setForm] = useState({ displayName: me.displayName, timezone: me.timezone || 'America/Mexico_City', statusText: me.statusText || '', email: me.email || '' });
  const [avatar, setAvatar] = useState(me.avatar || {});
  const modalReq = useOffice((s) => s.modal);
  const [step, setStep] = useState(modalReq?.step || 'main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const close = () => office.set({ modal: null });
  const tzOptions = useMemo(() => timezones().map((tz) => ({ value: tz, label: tzOffsetLabel(tz) })), []);

  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const dataUrl = await resizeImage(f);
      await api.put('/me/photo', { dataUrl });
    } catch (err) {
      office.toast({ title: err.message || 'No se pudo subir la imagen', kind: 'error' });
    }
  };

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch('/me', { ...form, avatar });
      close();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (step === 'avatar') {
    return (
      <Modal title={<span className="row gap8"><button className="icon-btn" onClick={() => setStep('main')} aria-label="Volver"><ArrowLeft size={18} /></button> Personaliza tu avatar</span>} onClose={close} width={800}>
        <AvatarEditor avatar={avatar} onChange={setAvatar} initialTab={modalReq?.tab} />
        <div className="modal-actions">
          <button className="btn" onClick={() => setStep('main')}>Listo</button>
          <button className="btn primary" onClick={save} disabled={busy}>Guardar</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Editar perfil" onClose={close} width={480}>
      <form onSubmit={save} className="form">
        <div className="profile-pics">
          <div className="pp">
            <div className="pp-label">Foto de perfil</div>
            <div className="pp-circle">
              {me.photoUrl ? <img src={me.photoUrl} alt="" /> : <span className="pp-initial">{initials(me.displayName)}</span>}
              {me.photoUrl && (
                <button type="button" className="pp-del" title="Quitar foto" onClick={() => api.del('/me/photo')}><Trash2 size={14} /></button>
              )}
              <button type="button" className="pp-edit" title="Cambiar foto" onClick={() => fileRef.current.click()}><Pencil size={14} /></button>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={upload} />
          </div>
          <div className="pp">
            <div className="pp-label">Avatar</div>
            <div className="pp-circle avatar-bg" onClick={() => setStep('avatar')}>
              <AvatarCanvas avatar={avatar} width={70} height={90} />
              <button type="button" className="pp-edit" title="Editar avatar" onClick={() => setStep('avatar')}><Pencil size={14} /></button>
            </div>
          </div>
        </div>
        <label className="field-label">Nombre completo<span className="req">*</span></label>
        <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required maxLength={40} />
        <label className="field-label">Estado (lo que ven los demás)</label>
        <input placeholder="🎧 Concentrado, 🍔 Comiendo…" value={form.statusText} onChange={(e) => setForm({ ...form, statusText: e.target.value })} maxLength={80} />
        <label className="field-label">Correo</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} />
        <label className="field-label">Zona horaria</label>
        <Select value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })} options={tzOptions} />
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn primary" disabled={busy}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

// Paleta sugerida + selector libre (cualquier color)
function Swatches({ options, value, onChange, label }) {
  const custom = value && !options.some((c) => c.toLowerCase() === String(value).toLowerCase());
  return (
    <div className="swatch-row">
      {options.map((c) => (
        <button type="button" key={c} className={`sw ${String(value).toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={`${label} ${c}`} />
      ))}
      <label className={`sw sw-custom ${custom ? 'on' : ''}`} style={custom ? { background: value } : undefined} title="Elegir cualquier color">
        {!custom && <Plus size={13} />}
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#888888'} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: color personalizado`} />
      </label>
    </div>
  );
}

function Chips({ options, names, value, onChange }) {
  return (
    <div className="chip-row">
      {options.map((o) => (
        <button type="button" key={o} className={`chip-btn ${value === o ? 'on' : ''}`} onClick={() => onChange(o)}>{names[o] || o}</button>
      ))}
    </div>
  );
}

// Vista previa caminando en las 4 direcciones
function WalkingPreview({ avatar }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 180);
    return () => clearInterval(id);
  }, []);
  const dirs = ['down', 'left', 'up', 'right'];
  const dir = dirs[Math.floor(t / 12) % 4];
  const step = [1, 0, 2, 0][t % 4];
  return <AvatarCanvas avatar={avatar} width={128} height={192} dir={dir} step={step} />;
}

const TABS = [
  ['chars', 'Personajes'],
  ['face', 'Cara y cabello'],
  ['clothes', 'Ropa'],
  ['acc', 'Accesorios'],
  ['pet', 'Mascota'],
];

export function AvatarEditor({ avatar, onChange: rawChange, initialTab }) {
  // La mascota se conserva aunque cambies de personaje
  const onChange = (a) => rawChange({ ...a, pet: avatar.pet, petColor: avatar.petColor });
  const characters = useOffice((s) => s.characters);
  const theme = useOffice((s) => s.config.theme);
  const [tab, setTab] = useState(initialTab || (avatar.sprite || avatar.preset ? 'chars' : 'face'));
  const [pack, setPack] = useState(theme === 'gtahub' ? 'gtahub' : 'all');
  const spec = normalizeSpec(avatar.sprite ? {} : avatar);
  const set = (k) => (v) => onChange({ ...spec, preset: undefined, sprite: undefined, id: undefined, name: undefined, pack: undefined, [k]: v });
  const pickPreset = (p) => {
    const { id, name, pack: _pack, ...rest } = p;
    onChange({ ...rest, preset: id });
  };
  const presets = PRESETS.filter((p) => pack === 'all' || p.pack === pack);
  const row = (label, k, kind) => (
    <>
      <div className="ae-label">{label}</div>
      {kind === 'color'
        ? <Swatches label={label} options={SPRITE_OPTIONS[k]} value={spec[k]} onChange={set(k)} />
        : <Chips options={PARTS[k]} names={STYLE_NAMES[k]} value={spec[k]} onChange={set(k)} />}
    </>
  );

  return (
    <div className="avatar-editor">
      <div className="ae-preview">
        <WalkingPreview avatar={avatar} />
        <button type="button" className="btn tiny" onClick={() => onChange(randomSpec())}><Shuffle size={13} /> Aleatorio</button>
        <span className="muted small ae-hint">Cualquier color sirve: usa el botón + de cada fila.</span>
      </div>
      <div className="ae-options">
        <div className="seg">
          {TABS.map(([k, l]) => <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {avatar.sprite && tab !== 'chars' && <p className="muted small">Estás usando un personaje dibujado a mano. Si cambias algo aquí pasas a un personaje armado por piezas.</p>}
        <div className="ae-scroll">
          {tab === 'chars' && (
            <>
              <div className="chip-row ae-packs">
                {[['all', 'Todos'], ...PACKS.map((p) => [p.id, p.name]), ...(characters.length ? [['uploaded', 'Dibujados']] : [])].map(([k, l]) => (
                  <button type="button" key={k} className={`chip-btn ${pack === k ? 'on' : ''}`} onClick={() => setPack(k)}>{l}</button>
                ))}
              </div>
              <div className="char-grid">
                {pack !== 'uploaded' && presets.map((p) => (
                  <button type="button" key={p.id} className={`char-card ${!avatar.sprite && avatar.preset === p.id ? 'on' : ''}`} onClick={() => pickPreset(p)}>
                    <AvatarCanvas avatar={p} width={48} height={72} />
                    <span>{p.name}</span>
                  </button>
                ))}
                {(pack === 'all' || pack === 'uploaded') && characters.map((c) => (
                  <button type="button" key={c.id} className={`char-card ${avatar.sprite === c.id ? 'on' : ''}`} onClick={() => onChange({ sprite: c.id })}>
                    <AvatarCanvas avatar={{ sprite: c.id }} width={48} height={72} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
              <p className="muted small">Elige uno como base y luego ajústalo en las otras pestañas.</p>
            </>
          )}
          {tab === 'face' && (
            <>
              {row('Piel', 'skin', 'color')}
              {row('Ojos', 'eyes')}
              {row('Color de ojos', 'eyeColor', 'color')}
              {row('Boca', 'mouth')}
              {row('Peinado', 'hairStyle')}
              {row('Color de cabello', 'hair', 'color')}
              {row('Vello facial', 'facialHair')}
            </>
          )}
          {tab === 'clothes' && (
            <>
              {row('Arriba', 'top')}
              {row('Color principal', 'shirt', 'color')}
              {row('Color de detalle (estampado, corbata, cuello…)', 'accent', 'color')}
              {row('Abajo', 'bottom')}
              {row(spec.bottom === 'skirt' ? 'Color de la falda' : spec.bottom === 'shorts' ? 'Color del short' : 'Color del pantalón', 'pants', 'color')}
              {row('Zapatos', 'shoes', 'color')}
            </>
          )}
          {tab === 'pet' && (
            <PetTab avatar={avatar} onChange={rawChange} />
          )}
          {tab === 'acc' && (
            <>
              {row('Gorra o sombrero', 'hat')}
              {row('Lentes', 'eyewear')}
              {row('Audífonos', 'audio')}
              {row('Color de gorra y audífonos', 'hatColor', 'color')}
              {row('Extra', 'extra')}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PetPreview({ kind, color }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const loop = (t) => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(4, 0, 0, 4, 0, 0);
      drawPet(ctx, kind, color, 20, 24, 1, t / 1000, Math.floor(t / 2000) % 2 === 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, color]);
  return <canvas ref={ref} width={160} height={110} className="pet-preview" />;
}

// Mascota: especie/raza, nombre, color y foto de tu mascota real
function PetTab({ avatar, onChange }) {
  const me = useOffice((s) => s.users[s.me.id] || s.me);
  const [q, setQ] = useState('');
  const fileRef = useRef(null);
  const cur = petDef(avatar.pet || 'none');
  const groups = ['Perros', 'Gatos', 'Otros'];
  const match = (p) => !q || p.name.toLowerCase().includes(q.toLowerCase());
  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      await api.put('/me/pet-photo', { dataUrl: await resizeImage(f) });
      office.toast({ title: 'Foto de tu mascota guardada 🐾' });
    } catch (err) {
      office.toast({ title: err.message || 'No se pudo subir la foto', kind: 'error' });
    }
  };
  return (
    <>
      <div className="pet-head">
        {cur && cur.id !== 'none' ? <PetPreview kind={cur.id} color={avatar.petColor} /> : <div className="pet-preview empty">Sin mascota</div>}
        <div className="pet-fields">
          <label className="ae-label">Nombre de tu mascota</label>
          <input placeholder="Firulais, Michi, Toby…" value={avatar.petName || ''} maxLength={20} onChange={(e) => onChange({ ...avatar, petName: e.target.value })} disabled={!cur || cur.id === 'none'} />
          <label className="ae-label">Foto de tu mascota real (opcional)</label>
          <div className="row gap8">
            {me.petPhotoUrl && <img className="pet-photo" src={me.petPhotoUrl} alt="Tu mascota" />}
            <button type="button" className="btn tiny" onClick={() => fileRef.current.click()}>{me.petPhotoUrl ? 'Cambiar foto' : 'Subir foto'}</button>
            {me.petPhotoUrl && <button type="button" className="btn tiny" onClick={() => api.del('/me/pet-photo').catch(() => {})}>Quitar</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={upload} />
        </div>
      </div>
      {cur && cur.id !== 'none' && (
        <>
          <div className="ae-label">Color</div>
          <Swatches label="Color de la mascota" options={PET_COLORS} value={avatar.petColor || cur.color} onChange={(c) => onChange({ ...avatar, petColor: c })} />
        </>
      )}
      <input className="pet-search" placeholder="Buscar raza o animal…" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="button" className={`chip-btn ${!cur || cur.id === 'none' ? 'on' : ''}`} onClick={() => onChange({ ...avatar, pet: 'none', petColor: undefined })}>Sin mascota</button>
      {groups.map((g) => {
        const list = PETS.filter((p) => p.group === g && match(p));
        if (!list.length) return null;
        return (
          <React.Fragment key={g}>
            <div className="ae-label">{g}</div>
            <div className="pet-grid">
              {list.map((p) => (
                <button type="button" key={p.id} className={`pet-card ${cur?.id === p.id ? 'on' : ''}`} onClick={() => onChange({ ...avatar, pet: p.id, petColor: undefined })}>
                  <PetThumb kind={p.id} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
}

function PetThumb({ kind }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawPet(ctx, kind, null, 16, 21, 1, 0, false);
  }, [kind]);
  return <canvas ref={ref} width={64} height={48} />;
}
