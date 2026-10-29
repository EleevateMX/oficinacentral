// Temas de la interfaz. Eleevate es la identidad de la oficina (predeterminado); Nuvora, GTAHUB y
// Personalizado siguen disponibles, y cada persona puede elegir un tema de juego para sí misma.
// La lista y los colores viven en shared/uiThemes.js (el servidor valida con la misma lista).
import { UI_THEMES, ALL_THEMES, DEFAULT_THEME, themeById } from '../../../shared/uiThemes.js';

export { UI_THEMES, DEFAULT_THEME, themeById };
export const THEMES = ALL_THEMES;
export const OFFICE_THEMES = ALL_THEMES.filter((t) => t.group === 'office');
export const GAME_THEMES = ALL_THEMES.filter((t) => t.group === 'game');

const LEGACY = new Set(['nuvora', 'gtahub', 'custom']);
const VAR_THEMES = new Map(UI_THEMES.map((t) => [t.id, t]));
const ALL_VARS = [...new Set(UI_THEMES.flatMap((t) => Object.keys(t.vars)))];
const CACHE_KEY = 'nuvora.uiTheme';

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => toHex(hexToRgb(a).map((v, i) => v + (hexToRgb(b)[i] - v) * t));

// Estado del tema: lo último de la oficina, el elegido por la persona y su modo claro/oscuro
let lastConfig = {};
let userTheme = null;
let colorMode = 'light';
const read = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

const known = (id) => !!id && ALL_THEMES.some((t) => t.id === id);
export const officeThemeId = (config = {}) => (known(config.theme) ? config.theme : DEFAULT_THEME);
export const currentTheme = () => (known(userTheme) ? userTheme : officeThemeId(lastConfig));
export const getUserTheme = () => userTheme;

// Variables CSS de un tema (para vistas previas o para :root)
export function themeStyle(id) {
  const t = VAR_THEMES.get(id);
  if (!t) return null;
  return Object.fromEntries(Object.entries(t.vars).map(([k, v]) => [`--${k}`, v]));
}

function paint(id) {
  const root = document.documentElement;
  root.dataset.brand = id;
  const t = VAR_THEMES.get(id);
  if (t) {
    root.dataset.ui = 'v2';
    for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(`--${k}`, v);
  } else {
    delete root.dataset.ui;
    ALL_VARS.forEach((k) => root.style.removeProperty(`--${k}`));
    if (id === 'custom' && lastConfig.accent) {
      root.style.setProperty('--accent', lastConfig.accent);
      root.style.setProperty('--accent-2', mix(lastConfig.accent, '#000000', 0.15));
      root.style.setProperty('--accent-soft', mix(lastConfig.accent, '#ffffff', 0.86));
    }
  }
  paintMode();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t ? t.vars.bg : id === 'gtahub' ? '#101010' : '#0A2B2C';
}

// Los temas nuevos son oscuros siempre; Nuvora/GTAHUB respetan Claro / Oscuro / Sistema
function paintMode() {
  const forced = !!VAR_THEMES.get(document.documentElement.dataset.brand);
  const dark = forced || colorMode === 'dark' || (colorMode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
export function applyColorMode(mode) {
  colorMode = mode || 'light';
  paintMode();
}
export const themeForcesDark = () => VAR_THEMES.has(currentTheme());

export function applyBrand(config = {}) {
  lastConfig = config || {};
  const id = currentTheme();
  paint(id);
  write({ user: userTheme, office: officeThemeId(lastConfig) });
}

// Tema propio de la persona (null = el de la oficina). Se aplica al momento.
export function setUserTheme(id) {
  userTheme = known(id) && id !== 'custom' ? id : null;
  applyBrand(lastConfig);
}

// Al cargar la página: pinta el último tema conocido para que el arranque y el login no parpadeen
if (typeof document !== 'undefined') {
  const c = read();
  userTheme = known(c.user) ? c.user : null;
  lastConfig = { theme: known(c.office) ? c.office : DEFAULT_THEME };
  paint(currentTheme());
}

// ---------- Logos ----------
export const GTAHUB_LOGO = '/themes/gtahub/logo.png';
export const ELEEVATE_LOGO = '/themes/eleevate/logo.png';
// Marca GTAHUB: con su tema, o con Nuvora/Personalizado si la oficina se llama GTAHUB
export const isGtahub = (config = {}) => config.theme === 'gtahub' || ((config.theme === 'nuvora' || config.theme === 'custom') && /gtahub/i.test(config.officeName || ''));
// Eleevate es la identidad con su tema y con cualquiera de los temas nuevos como predeterminado
export const isEleevate = (config = {}) => !LEGACY.has(officeThemeId(config));

// Logo de la oficina: el subido por el admin, el de Eleevate, el de GTAHUB o el símbolo de Nuvora.
export function officeLogo(config = {}) {
  if (config.logoUrl) return config.logoUrl;
  if (isEleevate(config)) return ELEEVATE_LOGO;
  if (isGtahub(config)) return GTAHUB_LOGO;
  return null;
}

// Logo de la pantalla de carga (antes de saber la sesión)
export const bootLogo = () => officeLogo({ theme: lastConfig.theme });

// Colores de marca para el mapa (banderines, estandartes, neón, muros). Siguen el tema de la oficina.
export function mapBrand(config = {}) {
  const name = (config.officeName || 'Nuvora').toUpperCase();
  const logo = officeLogo(config);
  if (isEleevate(config)) {
    return { name, logo, primary: '#9CBED9', secondary: '#E0B15A', dark: '#15172A', light: '#ECE8DA',
      walls: { face: '#2b2f4a', cap: '#15172A', top: '#3b4062', base: '#1c1f35', stripe: '#9CBED9' } };
  }
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
