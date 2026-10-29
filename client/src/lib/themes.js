// Temas de oficina. Nuvora es el producto; cada oficina puede usar el tema de Nuvora,
// el de HUB o uno personalizado (color propio + logo).
export const THEMES = [
  { id: 'nuvora', name: 'Nuvora', desc: 'Crema, profundo y mandarina. Albert Sans y Public Sans.', swatches: ['#0A2B2C', '#157A6E', '#FF8A3D', '#F3F4EE'] },
  { id: 'gtahub', name: 'HUB', desc: 'Rosa, amarillo y negro del Manual de Redes. Archivo Black e Inter.', swatches: ['#101010', '#FE3377', '#FFCC00', '#181818'] },
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
  if (meta) meta.content = theme === 'gtahub' ? '#101010' : '#0A2B2C';
}

// Marca HUB (tema 'gtahub'): con su tema o si la oficina se llama así (Nuvora es solo la plataforma)
export const GTAHUB_LOGO = '/themes/gtahub/logo.png';
export const isGtahub = (config = {}) => config.theme === 'gtahub' || /gtahub/i.test(config.officeName || '');

// Logo de la oficina: el subido por el admin, el del tema HUB o el símbolo de Nuvora.
export function officeLogo(config = {}) {
  if (config.logoUrl) return config.logoUrl;
  if (isGtahub(config)) return GTAHUB_LOGO;
  return null;
}

// Colores de marca para el mapa (banderines, estandartes, neón, muros)
export function mapBrand(config = {}) {
  const name = (config.officeName || 'Nuvora').toUpperCase();
  const logo = officeLogo(config);
  if (config.theme === 'gtahub') {
    return { name, logo, primary: '#FE3377', secondary: '#FFCC00', dark: '#101010', light: '#ffffff',
      walls: { face: '#2a2a30', cap: '#16161a', top: '#3a3a42', base: '#1c1c21', stripe: '#FE3377' } };
  }
  if (config.theme === 'custom' && config.accent) {
    return { name, logo, primary: config.accent, secondary: '#ffd23f', dark: '#1d1d22', light: '#ffffff', walls: null };
  }
  return { name, logo, primary: '#157A6E', secondary: '#FF8A3D', dark: '#0A2B2C', light: '#F3F4EE',
    walls: { face: '#566b6a', cap: '#0A2B2C', top: '#6f8584', base: '#3f5150', stripe: '#FF8A3D' } };
}
