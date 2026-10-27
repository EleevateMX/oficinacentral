import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { office, useOffice } from '../lib/store.js';
import { api } from '../lib/api.js';
import { Modal, AvatarCanvas, initials, Select } from './ui.jsx';
import { SPRITE_OPTIONS, STYLE_NAMES, PRESETS, normalizeSpec } from '@shared/sprite.js';
import { timezones, tzOffsetLabel } from '../lib/time.js';

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
  const [step, setStep] = useState('main');
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
      <Modal title={<span className="row gap8"><button className="icon-btn" onClick={() => setStep('main')} aria-label="Volver"><ArrowLeft size={18} /></button> Personaliza tu avatar</span>} onClose={close} width={620}>
        <AvatarEditor avatar={avatar} onChange={setAvatar} />
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

function Swatches({ options, value, onChange }) {
  return (
    <div className="swatch-row">
      {options.map((c) => (
        <button type="button" key={c} className={`sw ${value === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
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

export function AvatarEditor({ avatar, onChange }) {
  const characters = useOffice((s) => s.characters);
  const [tab, setTab] = useState(avatar.sprite ? 'chars' : avatar.preset ? 'chars' : 'custom');
  const spec = normalizeSpec(avatar.sprite ? {} : avatar);
  const set = (k) => (v) => onChange({ ...spec, preset: undefined, sprite: undefined, [k]: v });
  const pickPreset = (p) => {
    const { id, name, ...rest } = p;
    onChange({ ...rest, preset: id });
  };
  const random = () => {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    onChange(Object.fromEntries(Object.entries(SPRITE_OPTIONS).map(([k, v]) => [k, pick(v)])));
  };

  return (
    <div className="avatar-editor">
      <div className="ae-preview">
        <WalkingPreview avatar={avatar} />
        {!avatar.sprite && <button type="button" className="btn tiny" onClick={random}>Aleatorio</button>}
      </div>
      <div className="ae-options">
        <div className="seg">
          <button type="button" className={tab === 'chars' ? 'on' : ''} onClick={() => setTab('chars')}>Personajes</button>
          <button type="button" className={tab === 'custom' ? 'on' : ''} onClick={() => setTab('custom')}>Personalizar</button>
        </div>
        {tab === 'chars' ? (
          <div className="char-grid">
            {PRESETS.map((p) => (
              <button type="button" key={p.id} className={`char-card ${!avatar.sprite && avatar.preset === p.id ? 'on' : ''}`} onClick={() => pickPreset(p)}>
                <AvatarCanvas avatar={p} width={48} height={72} />
                <span>{p.name}</span>
              </button>
            ))}
            {characters.map((c) => (
              <button type="button" key={c.id} className={`char-card ${avatar.sprite === c.id ? 'on' : ''}`} onClick={() => onChange({ sprite: c.id })}>
                <AvatarCanvas avatar={{ sprite: c.id }} width={48} height={72} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {avatar.sprite && <p className="muted small">Estás usando un personaje dibujado a mano. Al cambiar algo aquí pasas a un personaje personalizado.</p>}
            <div className="ae-label">Piel</div>
            <Swatches options={SPRITE_OPTIONS.skin} value={spec.skin} onChange={set('skin')} />
            <div className="ae-label">Peinado</div>
            <Chips options={SPRITE_OPTIONS.hairStyle} names={STYLE_NAMES.hairStyle} value={spec.hairStyle} onChange={set('hairStyle')} />
            <div className="ae-label">Color de cabello</div>
            <Swatches options={SPRITE_OPTIONS.hair} value={spec.hair} onChange={set('hair')} />
            <div className="ae-label">Ropa</div>
            <Chips options={SPRITE_OPTIONS.top} names={STYLE_NAMES.top} value={spec.top} onChange={set('top')} />
            <div className="ae-label">Color de la ropa</div>
            <Swatches options={SPRITE_OPTIONS.shirt} value={spec.shirt} onChange={set('shirt')} />
            <div className="ae-label">Color de detalle (estampado, corbata, gorra…)</div>
            <Swatches options={SPRITE_OPTIONS.accent} value={spec.accent} onChange={set('accent')} />
            <div className="ae-label">Pantalón</div>
            <Swatches options={SPRITE_OPTIONS.pants} value={spec.pants} onChange={set('pants')} />
            <div className="ae-label">Zapatos</div>
            <Swatches options={SPRITE_OPTIONS.shoes} value={spec.shoes} onChange={set('shoes')} />
            <div className="ae-label">Accesorio</div>
            <Chips options={SPRITE_OPTIONS.accessory} names={STYLE_NAMES.accessory} value={spec.accessory} onChange={set('accessory')} />
          </>
        )}
      </div>
    </div>
  );
}
