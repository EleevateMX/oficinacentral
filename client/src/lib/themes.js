// Temas de oficina. Nuvora es el producto; cada oficina puede usar el tema de Nuvora,
// el de GTAHUB o uno personalizado (color propio + logo).
export const THEMES = [
  { id: 'nuvora', name: 'Nuvora', desc: 'Crema, profundo y mandarina. Albert Sans y Public Sans.', swatches: ['#0A2B2C', '#157A6E', '#FF8A3D', '#F3F4EE'] },
  { id: 'gtahub', name: 'GTAHUB', desc: 'Azul índigo y login oscuro, con el logo de GTAHUB.', swatches: ['#13141c', '#3e4fe0', '#1d1e23', '#e9e9ee'] },
  { id: 'custom', name: 'Personalizado', desc: 'Tu color principal y tu logo sobre la base de Nuvora.', swatches: [] },
];

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => toHex(hexToRgb(a).map((v, i) => v + (hexToRgb(b)[i] - v) * t));

export function applyBrand(config = {}) {
  const root = document.documentElement;
  const theme = THEMES.some((t) => t.id === config.theme) ? config.theme : 'nuvora';
  root.dataset.brand = theme;
  const vars = ['--accent', '--accent-2', '--accent-soft'];
  if (theme === 'custom' && config.accent) {
    root.style.setProperty('--accent', config.accent);
    root.style.setProperty('--accent-2', mix(config.accent, '#000000', 0.15));
    root.style.setProperty('--accent-soft', mix(config.accent, '#ffffff', 0.86));
  } else vars.forEach((v) => root.style.removeProperty(v));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'gtahub' ? '#13141c' : '#0A2B2C';
}

// Logo de la oficina: el subido por el admin, el del tema GTAHUB o el símbolo de Nuvora.
export function officeLogo(config = {}) {
  if (config.logoUrl) return config.logoUrl;
  if (config.theme === 'gtahub') return '/themes/gtahub.svg';
  return null;
}
