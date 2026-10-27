import { officeLogo } from '../lib/themes.js';
// Identidad de Nuvora (Manual de marca v2): logo, símbolo y mascotas.
// Formas planas, sin sombras ni degradados. Colores de la paleta oficial.
import React from 'react';

export const C = {
  profundo: '#0A2B2C', verde: '#157A6E', mandarina: '#FF8A3D', uva: '#5B3FB8',
  crema: '#F3F4EE', gris: '#4D5E5C', linea: '#DEE2D9',
  tVerde: '#E3F0EC', tMandarina: '#FFE8D8', tUva: '#ECE8F8', blanco: '#FFFFFF',
};

// Símbolo: tres bloques base + el módulo abajo a la derecha. Nunca lleva cara.
// variante: 'positivo' (bloques profundo), 'negativo' (bloques blancos), 'mandarina' (sobre fondo mandarina)
export function Simbolo({ variante = 'positivo', size = 32 }) {
  const base = variante === 'negativo' ? C.blanco : C.profundo;
  const mod = variante === 'mandarina' ? C.blanco : C.mandarina;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 56 56" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <rect x="4" y="4" width="22" height="22" rx="6" fill={base} />
      <rect x="30" y="4" width="22" height="22" rx="6" fill={base} />
      <rect x="4" y="30" width="22" height="22" rx="6" fill={base} />
      <rect x="30" y="30" width="22" height="22" rx="6" fill={mod} />
    </svg>
  );
}

export function Logo({ variante = 'positivo', size = 24 }) {
  return (
    <span className="logo" role="img" aria-label="nuvora" style={{ gap: Math.round(size * 0.28), color: variante === 'negativo' ? C.blanco : C.profundo }}>
      <Simbolo variante={variante} size={Math.round(size * 1.15)} />
      <span className="logo-word" style={{ fontSize: size }}>nuvora</span>
    </span>
  );
}

// Elenco: cada mascota con su color, su tinta y su rasgo. No se cambian.
const ELENCO = {
  nuvi: { color: C.mandarina, ink: C.profundo, mark: 'sprout' },
  vora: { color: C.verde, ink: C.profundo, mark: 'part' },
  rumi: { color: C.profundo, ink: C.blanco, mark: 'glasses' },
  kora: { color: C.uva, ink: C.blanco, mark: 'star' },
};

function mascotaSVG(nombre, face, pose, size) {
  const m = ELENCO[nombre] || ELENCO.nuvi;
  const { color: col, ink, mark } = m;
  const L = { down: ['M14 50 Q2 60 4 74', [4, 74]], up: ['M14 46 Q-4 38 -4 16', [-4, 16]], hip: ['M14 42 Q-8 52 10 64', null], out: ['M14 52 Q0 54 -14 48', [-14, 48]] };
  const R = { down: ['M86 50 Q98 60 96 74', [96, 74]], up: ['M86 46 Q104 38 104 16', [104, 16]], hip: ['M86 42 Q108 52 90 64', null], out: ['M86 52 Q100 54 116 46', [116, 46]] };
  const P = { idle: ['down', 'down'], wave: ['down', 'up'], cheer: ['up', 'up'], point: ['down', 'out'], hips: ['hip', 'hip'], open: ['out', 'out'] }[pose] || ['down', 'down'];
  const a = [L[P[0]], R[P[1]]];
  let s = `<svg width="${size}" height="${size}" viewBox="-16 -22 134 120" style="display:block;overflow:visible">`;
  a.forEach((x) => { s += `<path d="${x[0]}" stroke="${col}" stroke-width="11" stroke-linecap="round" fill="none"/>`; });
  a.forEach((x) => { if (x[1]) s += `<circle cx="${x[1][0]}" cy="${x[1][1]}" r="8" fill="${col}"/>`; });
  s += `<rect x="28" y="76" width="13" height="18" rx="6" fill="${col}"/><rect x="59" y="76" width="13" height="18" rx="6" fill="${col}"/>`;
  s += `<ellipse cx="32" cy="95" rx="11" ry="5" fill="${col}"/><ellipse cx="68" cy="95" rx="11" ry="5" fill="${col}"/>`;
  if (mark === 'sprout') s += `<path d="M50 8 L50 -4" stroke="${col}" stroke-width="4" stroke-linecap="round"/><path d="M50 -3 Q38 -15 30 -5 Q40 1 50 -3 Z" fill="${col}"/><path d="M50 -3 Q62 -15 70 -5 Q60 1 50 -3 Z" fill="${col}"/>`;
  if (mark === 'star') s += `<path d="M50 8 L50 -2" stroke="${col}" stroke-width="4" stroke-linecap="round"/><path d="M50 -20 L53.5 -12.5 L61.5 -11.5 L55.5 -6 L57 2 L50 -2 L43 2 L44.5 -6 L38.5 -11.5 L46.5 -12.5 Z" fill="${C.mandarina}"/>`;
  s += `<rect x="8" y="6" width="84" height="76" rx="24" fill="${col}"/>`;
  if (mark === 'part') s += `<path d="M18 22 Q30 4 64 10 Q40 12 22 30 Z" fill="${ink}" opacity="0.16"/>`;
  s += `<circle cx="24" cy="54" r="6" fill="${ink}" opacity="0.14"/><circle cx="76" cy="54" r="6" fill="${ink}" opacity="0.14"/>`;
  const happy = face === 'happy';
  s += happy ? `<path d="M29 41 Q36 33 43 41" stroke="${ink}" stroke-width="5" stroke-linecap="round" fill="none"/>` : `<circle cx="36" cy="40" r="6" fill="${ink}"/>`;
  s += face === 'smile' || face === 'wow' || face === 'calm' ? `<circle cx="64" cy="40" r="6" fill="${ink}"/>` : `<path d="M57 41 Q64 33 71 41" stroke="${ink}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  if (mark === 'glasses') s += `<circle cx="36" cy="40" r="11" stroke="${ink}" stroke-width="3" fill="none"/><circle cx="64" cy="40" r="11" stroke="${ink}" stroke-width="3" fill="none"/><path d="M47 40 L53 40" stroke="${ink}" stroke-width="3"/>`;
  if (face === 'smile' || face === 'wink') s += `<path d="M38 58 Q50 69 62 58" stroke="${ink}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  if (happy) s += `<path d="M34 55 Q50 55 66 55 Q62 72 50 72 Q38 72 34 55 Z" fill="${ink}"/>`;
  if (face === 'wow') s += `<circle cx="50" cy="61" r="6" fill="${ink}"/>`;
  if (face === 'calm') s += `<path d="M41 60 L59 60" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
  return `${s}</svg>`;
}

// Mascotas: planas, completas y de buen humor. Máximo dos por pantalla; Nuvi es la anfitriona.
export function Mascota({ nombre = 'nuvi', face = 'smile', pose = 'idle', size = 120, className = '' }) {
  const label = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  return (
    <span
      className={`mascota ${className}`}
      role="img"
      aria-label={label}
      style={{ display: 'inline-block', width: size, height: size }}
      // SVG generado aquí mismo con valores fijos (sin datos de usuarios)
      dangerouslySetInnerHTML={{ __html: mascotaSVG(nombre, face, pose, size) }}
    />
  );
}

// Marca de la oficina (logo propio) o, si no hay, el símbolo de Nuvora.
export function OfficeMark({ config, size = 28, variante = 'negativo' }) {
  const src = officeLogo(config || {});
  if (src) return <img src={src} alt={config.officeName || ''} style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />;
  return <Simbolo variante={variante} size={size} />;
}

// Firma del producto: "by nuvora"
export function ByNuvora({ variante = 'positivo', size = 13 }) {
  return (
    <a className="by-nuvora" href="https://nuvora.mx" target="_blank" rel="noreferrer noopener" aria-label="Hecho por Nuvora">
      <span>by</span> <Logo variante={variante} size={size} />
    </a>
  );
}

export function Boot({ text }) {
  return (
    <div className="boot">
      <Logo variante="negativo" size={30} />
      {text && <p>{text}</p>}
    </div>
  );
}
