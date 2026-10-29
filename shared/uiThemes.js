// Temas de la interfaz (servidor y cliente). Eleevate es la identidad de la oficina; los temas
// de juegos solo toman colores inspirados en cada juego (sin logos, marcas ni arte copiado).
// Cada usuario puede elegir el suyo; si no, se usa el que eligió el admin para la oficina.
//
// `vars` son variables CSS (sin el `--`) que se ponen en :root. Todos estos temas son oscuros.
// Los temas `legacy` (Nuvora, GTAHUB, Personalizado) se pintan con su CSS de siempre.

const METAL = 'linear-gradient(135deg, #f4f6f9 0%, #b9c6d3 45%, #eef2f6 55%, #9cbed9 100%)';

// Base oscura compartida: cada tema pisa lo que necesita
const base = (v) => ({
  'radius': '16px',
  'radius-sm': '10px',
  'radius-lg': '24px',
  'display-weight': '700',
  'display-case': 'none',
  'display-spacing': '-0.02em',
  'shadow': '0 12px 40px rgba(0, 0, 0, .45), 0 1px 2px rgba(0, 0, 0, .3)',
  ...v,
});

export const UI_THEMES = [
  {
    id: 'eleevate', name: 'Eleevate', group: 'office',
    desc: 'Navy profundo, acero y crema. Oscuro y metálico. Sora y Manrope.',
    swatches: ['#101120', '#222640', '#9CBED9', '#ECE8DA', '#E0B15A'],
    vars: base({
      'bg': '#101120', 'panel': '#15172A', 'panel-2': '#1A1C2B', 'hover': '#222640', 'border': '#272B47',
      'text': '#EEF1F5', 'text-2': '#B7C1CE', 'text-3': '#8E99AB',
      'accent': '#9CBED9', 'accent-2': '#BBD3E6', 'accent-soft': '#1E2A40', 'on-accent': '#101120', 'alt': '#ECE8DA',
      'ink': '#0B0C18', 'ink-2': '#15172A', 'green': '#6FD3A0', 'orange': '#E0B15A', 'red': '#FF7A85',
      'map-bg': '#101120',
      'btn-primary': METAL, 'btn-primary-hover': 'linear-gradient(135deg, #ffffff 0%, #ccd7e2 45%, #f6f8fa 55%, #b3cfe4 100%)',
      'btn-secondary': 'linear-gradient(135deg, #9CBED9, #5D7E9F)', 'on-secondary': '#0B0C18',
      'chrome': 'rgba(21, 23, 42, .94)', 'chrome-border': 'rgba(156, 190, 217, .22)', 'glow': 'rgba(156, 190, 217, .28)',
      'heading': 'linear-gradient(135deg, #f4f6f9 0%, #b9c6d3 45%, #eef2f6 55%, #9cbed9 100%)',
      'auth-bg': 'radial-gradient(60% 60% at 15% 10%, rgba(93, 126, 159, .38), transparent 70%), radial-gradient(45% 45% at 90% 92%, rgba(224, 177, 90, .12), transparent 70%), #101120',
      'font-display': "'Sora', 'Manrope', system-ui, sans-serif", 'font-body': "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif",
      'display-weight': '700',
    }),
  },
  {
    id: 'lol', name: 'LoL', group: 'game',
    desc: 'Oro hextech sobre azul de la Grieta, con toques turquesa.',
    swatches: ['#010A13', '#0A1428', '#C8AA6E', '#F0E6D2', '#0AC8B9'],
    vars: base({
      'bg': '#010A13', 'panel': '#0A1428', 'panel-2': '#0E1A30', 'hover': '#16243D', 'border': '#2A3449',
      'text': '#F0E6D2', 'text-2': '#C9C1AE', 'text-3': '#A09B8C',
      'accent': '#C8AA6E', 'accent-2': '#E2CC96', 'accent-soft': '#1F2416', 'on-accent': '#010A13', 'alt': '#0AC8B9',
      'ink': '#010A13', 'ink-2': '#0A1428', 'green': '#0AC8B9', 'orange': '#C8AA6E', 'red': '#FF6B6B',
      'map-bg': '#010A13',
      'btn-primary': 'linear-gradient(180deg, #F0E6D2 -30%, #C8AA6E 55%, #A8894F 100%)', 'btn-primary-hover': 'linear-gradient(180deg, #FFF6E2 -30%, #DABD80 55%, #B8995D 100%)',
      'btn-secondary': 'linear-gradient(180deg, #0AC8B9, #0597A2)', 'on-secondary': '#010A13',
      'chrome': 'rgba(1, 10, 19, .94)', 'chrome-border': 'rgba(200, 170, 110, .38)', 'glow': 'rgba(200, 170, 110, .3)',
      'heading': 'linear-gradient(180deg, #F0E6D2 10%, #C8AA6E 90%)',
      'auth-bg': 'radial-gradient(55% 55% at 50% 0%, rgba(10, 200, 185, .18), transparent 70%), radial-gradient(60% 50% at 50% 110%, rgba(200, 170, 110, .2), transparent 70%), #010A13',
      'font-display': "'Cinzel', Georgia, serif", 'font-body': "'Manrope', system-ui, sans-serif",
      'display-weight': '700', 'display-case': 'uppercase', 'display-spacing': '0.04em',
      'radius': '6px', 'radius-sm': '4px', 'radius-lg': '10px',
    }),
  },
  {
    id: 'valorant', name: 'Valorant', group: 'game',
    desc: 'Rojo táctico, crema y pizarra. Ángulos rectos.',
    swatches: ['#0F1923', '#1C2A38', '#FF4655', '#ECE8E1', '#BD3944'],
    vars: base({
      'bg': '#0F1923', 'panel': '#15212D', 'panel-2': '#1B2835', 'hover': '#233343', 'border': '#2C3B4B',
      'text': '#ECE8E1', 'text-2': '#BDC3CA', 'text-3': '#8F9BA8',
      'accent': '#FF5562', 'accent-2': '#FF6B77', 'accent-soft': '#2A1A22', 'on-accent': '#0F1923', 'alt': '#ECE8E1',
      'ink': '#0A1119', 'ink-2': '#0F1923', 'green': '#4CD8A6', 'orange': '#F2C14E', 'red': '#FF6B77',
      'map-bg': '#0F1923',
      'btn-primary': '#FF4655', 'btn-primary-hover': '#FF6B77',
      'btn-secondary': '#ECE8E1', 'on-secondary': '#0F1923',
      'chrome': 'rgba(15, 25, 35, .95)', 'chrome-border': 'rgba(255, 70, 85, .35)', 'glow': 'rgba(255, 70, 85, .28)',
      'heading': '#ECE8E1',
      'auth-bg': 'linear-gradient(115deg, transparent 58%, rgba(255, 70, 85, .14) 58%, rgba(255, 70, 85, .14) 64%, transparent 64%), radial-gradient(50% 60% at 10% 10%, rgba(255, 70, 85, .2), transparent 70%), #0F1923',
      'font-display': "'Oswald', 'Arial Narrow', sans-serif", 'font-body': "'Manrope', system-ui, sans-serif",
      'display-weight': '700', 'display-case': 'uppercase', 'display-spacing': '0.03em',
      'radius': '4px', 'radius-sm': '2px', 'radius-lg': '6px',
    }),
  },
  {
    id: 'fortnite', name: 'Fortnite', group: 'game',
    desc: 'Tormenta morada, cielo azul y amarillo legendario.',
    swatches: ['#120E3A', '#1B1464', '#9D4DBB', '#00A8FF', '#F7D44C'],
    vars: base({
      'bg': '#110D38', 'panel': '#1B1464', 'panel-2': '#221A72', 'hover': '#2C2288', 'border': '#382C99',
      'text': '#FFFFFF', 'text-2': '#D9D3FF', 'text-3': '#ACA2EC',
      'accent': '#F7D44C', 'accent-2': '#FFE27A', 'accent-soft': '#2F2660', 'on-accent': '#1B1464', 'alt': '#00A8FF',
      'ink': '#0C0930', 'ink-2': '#1B1464', 'green': '#5BE37D', 'orange': '#F7D44C', 'red': '#FF6B8B',
      'map-bg': '#110D38',
      'btn-primary': 'linear-gradient(180deg, #FFE680 0%, #F7D44C 55%, #EDB92B 100%)', 'btn-primary-hover': 'linear-gradient(180deg, #FFF0A8 0%, #FFE066 55%, #F5C53A 100%)',
      'btn-secondary': 'linear-gradient(180deg, #33BCFF, #0088E0)', 'on-secondary': '#0C0930',
      'chrome': 'rgba(27, 20, 100, .94)', 'chrome-border': 'rgba(157, 77, 187, .5)', 'glow': 'rgba(0, 168, 255, .3)',
      'heading': '#FFFFFF',
      'auth-bg': 'radial-gradient(60% 60% at 15% 5%, rgba(157, 77, 187, .55), transparent 70%), radial-gradient(55% 55% at 95% 95%, rgba(0, 168, 255, .35), transparent 70%), #110D38',
      'font-display': "'Luckiest Guy', 'Impact', sans-serif", 'font-body': "'Manrope', system-ui, sans-serif",
      'display-weight': '400', 'display-case': 'uppercase', 'display-spacing': '0.02em',
      'radius': '14px', 'radius-sm': '10px', 'radius-lg': '22px',
    }),
  },
  {
    id: 'minecraft', name: 'Minecraft', group: 'game',
    desc: 'Pasto, tierra y piedra. Bordes de bloque.',
    swatches: ['#1E1E1E', '#7F7F7F', '#866043', '#5D9C3B', '#7BC24F'],
    vars: base({
      'bg': '#1A1A1A', 'panel': '#242424', 'panel-2': '#2D2D2D', 'hover': '#373737', 'border': '#454545',
      'text': '#F2F2F2', 'text-2': '#CDCDCD', 'text-3': '#A3A3A3',
      'accent': '#7BC24F', 'accent-2': '#94D46A', 'accent-soft': '#26331C', 'on-accent': '#13200B', 'alt': '#C49A6C',
      'ink': '#141414', 'ink-2': '#1E1E1E', 'green': '#7BC24F', 'orange': '#E8B04A', 'red': '#FF7A6E',
      'map-bg': '#1A1A1A',
      'btn-primary': 'linear-gradient(180deg, #8DD15F 0%, #7BC24F 50%, #5D9C3B 100%)', 'btn-primary-hover': 'linear-gradient(180deg, #A0E070 0%, #8DD15F 50%, #6BAA47 100%)',
      'btn-secondary': 'linear-gradient(180deg, #8A6343, #6B4A30)', 'on-secondary': '#FFFFFF',
      'chrome': 'rgba(30, 30, 30, .95)', 'chrome-border': 'rgba(127, 127, 127, .55)', 'glow': 'rgba(123, 194, 79, .25)',
      'heading': '#F2F2F2',
      'auth-bg': 'linear-gradient(180deg, rgba(93, 156, 59, .22) 0 6px, rgba(134, 96, 67, .18) 6px 14px, transparent 14px), repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 32px, transparent 32px 64px), repeating-linear-gradient(0deg, rgba(255,255,255,.02) 0 32px, transparent 32px 64px), #1A1A1A',
      'font-display': "'Pixelify Sans', 'Courier New', monospace", 'font-body': "'Manrope', system-ui, sans-serif",
      'display-weight': '600', 'display-spacing': '0',
      'radius': '4px', 'radius-sm': '2px', 'radius-lg': '6px',
    }),
  },
  {
    id: 'overwatch', name: 'Overwatch', group: 'game',
    desc: 'Naranja heroico y azul sobre pizarra.',
    swatches: ['#1F2326', '#43484C', '#F99E1A', '#218FFE', '#F4F6F8'],
    vars: base({
      'bg': '#1B1F22', 'panel': '#24292D', 'panel-2': '#2C3236', 'hover': '#363D42', 'border': '#43484C',
      'text': '#F4F6F8', 'text-2': '#C7CDD2', 'text-3': '#A3ACB3',
      'accent': '#F99E1A', 'accent-2': '#FFB547', 'accent-soft': '#3A2E1C', 'on-accent': '#1B1F22', 'alt': '#5AAEFF',
      'ink': '#15181B', 'ink-2': '#1F2326', 'green': '#5DDB8E', 'orange': '#F99E1A', 'red': '#FF7B7B',
      'map-bg': '#1B1F22',
      'btn-primary': 'linear-gradient(180deg, #FFB547, #F99E1A)', 'btn-primary-hover': 'linear-gradient(180deg, #FFC56A, #FFAA33)',
      'btn-secondary': 'linear-gradient(180deg, #4BA5FF, #218FFE)', 'on-secondary': '#0D1B2B',
      'chrome': 'rgba(31, 35, 38, .94)', 'chrome-border': 'rgba(249, 158, 26, .35)', 'glow': 'rgba(249, 158, 26, .3)',
      'heading': '#F4F6F8',
      'auth-bg': 'radial-gradient(55% 55% at 12% 8%, rgba(249, 158, 26, .26), transparent 70%), radial-gradient(50% 50% at 92% 92%, rgba(33, 143, 254, .22), transparent 70%), #1B1F22',
      'font-display': "'Teko', 'Arial Narrow', sans-serif", 'font-body': "'Manrope', system-ui, sans-serif",
      'display-weight': '600', 'display-case': 'uppercase', 'display-spacing': '0.03em',
      'radius': '8px', 'radius-sm': '6px', 'radius-lg': '14px',
    }),
  },
  {
    id: 'rocket', name: 'Rocket League', group: 'game',
    desc: 'Equipo azul contra naranja en el estadio de noche.',
    swatches: ['#0B1630', '#17284F', '#1F7BFF', '#FF8A00', '#F3F6FF'],
    vars: base({
      'bg': '#0B1630', 'panel': '#101F40', 'panel-2': '#15274D', 'hover': '#1C315E', 'border': '#263D70',
      'text': '#F3F6FF', 'text-2': '#C3CDE6', 'text-3': '#93A2C6',
      'accent': '#4A93FF', 'accent-2': '#66A3FF', 'accent-soft': '#16305E', 'on-accent': '#04102A', 'alt': '#FF8A00',
      'ink': '#071024', 'ink-2': '#0B1630', 'green': '#4FE0A0', 'orange': '#FF8A00', 'red': '#FF6B6B',
      'map-bg': '#0B1630',
      'btn-primary': 'linear-gradient(135deg, #66A3FF, #2F7BFF)', 'btn-primary-hover': 'linear-gradient(135deg, #85B6FF, #4D8FFF)',
      'btn-secondary': 'linear-gradient(135deg, #FFA53D, #FF8A00)', 'on-secondary': '#2A1400',
      'chrome': 'rgba(11, 22, 48, .94)', 'chrome-border': 'rgba(61, 139, 255, .4)', 'glow': 'rgba(61, 139, 255, .32)',
      'heading': 'linear-gradient(90deg, #66A3FF, #F3F6FF 50%, #FFA53D)',
      'auth-bg': 'radial-gradient(50% 70% at 0% 50%, rgba(31, 123, 255, .34), transparent 70%), radial-gradient(50% 70% at 100% 50%, rgba(255, 138, 0, .26), transparent 70%), #0B1630',
      'font-display': "'Russo One', 'Arial Black', sans-serif", 'font-body': "'Manrope', system-ui, sans-serif",
      'display-weight': '400', 'display-spacing': '0',
      'radius': '12px', 'radius-sm': '8px', 'radius-lg': '18px',
    }),
  },
  {
    id: 'amongus', name: 'Among Us', group: 'game',
    desc: 'Nave espacial oscura, tripulante rojo y visor cian.',
    swatches: ['#1B1E2B', '#2B3044', '#C51111', '#38FEDC', '#F5F7FA'],
    vars: base({
      'bg': '#161924', 'panel': '#1F2332', 'panel-2': '#262B3D', 'hover': '#30364C', 'border': '#3B4260',
      'text': '#F5F7FA', 'text-2': '#C6CCDA', 'text-3': '#98A0B5',
      'accent': '#38FEDC', 'accent-2': '#7DFFE8', 'accent-soft': '#173B3C', 'on-accent': '#0F1220', 'alt': '#FF4D4D',
      'ink': '#0F1220', 'ink-2': '#1B1E2B', 'green': '#38FEDC', 'orange': '#F5F557', 'red': '#FF7070',
      'map-bg': '#161924',
      'btn-primary': 'linear-gradient(180deg, #8AFFEB, #38FEDC 60%, #22D9BB)', 'btn-primary-hover': 'linear-gradient(180deg, #B0FFF2, #5CFFE3 60%, #33E6C8)',
      'btn-secondary': 'linear-gradient(180deg, #D81E1E, #B30E0E)', 'on-secondary': '#FFFFFF',
      'chrome': 'rgba(27, 30, 43, .95)', 'chrome-border': 'rgba(56, 254, 220, .3)', 'glow': 'rgba(56, 254, 220, .25)',
      'heading': '#F5F7FA',
      'auth-bg': 'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 20%, #fff, transparent), radial-gradient(1.5px 1.5px at 85% 70%, #fff, transparent), radial-gradient(1px 1px at 35% 80%, #fff, transparent), radial-gradient(1px 1px at 55% 55%, rgba(255,255,255,.7), transparent), radial-gradient(55% 55% at 10% 90%, rgba(197, 17, 17, .28), transparent 70%), radial-gradient(50% 50% at 90% 10%, rgba(56, 254, 220, .14), transparent 70%), #161924',
      'font-display': "'Fredoka', 'Varela Round', system-ui, sans-serif", 'font-body': "'Manrope', system-ui, sans-serif",
      'display-weight': '700', 'display-spacing': '0',
      'radius': '18px', 'radius-sm': '12px', 'radius-lg': '26px',
    }),
  },
  {
    id: 'gtarp', name: 'GTA RP', group: 'game',
    desc: 'Neón de ciudad de noche: rosa y amarillo sobre negro.',
    swatches: ['#09090D', '#16161D', '#FE3377', '#FFCC00', '#FFFFFF'],
    vars: base({
      'bg': '#09090D', 'panel': '#121218', 'panel-2': '#18181F', 'hover': '#212129', 'border': '#2B2B35',
      'text': '#FFFFFF', 'text-2': '#C9C9D1', 'text-3': '#9797A3',
      'accent': '#FE3377', 'accent-2': '#FF6D9B', 'accent-soft': '#2C1220', 'on-accent': '#09090D', 'alt': '#FFCC00',
      'ink': '#060609', 'ink-2': '#121218', 'green': '#3DDC84', 'orange': '#FFCC00', 'red': '#FF5A5A',
      'map-bg': '#09090D',
      'btn-primary': 'linear-gradient(135deg, #FF5C93, #FE3377)', 'btn-primary-hover': 'linear-gradient(135deg, #FF7DAA, #FF4A88)',
      'btn-secondary': '#FFCC00', 'on-secondary': '#09090D',
      'chrome': 'rgba(9, 9, 13, .94)', 'chrome-border': 'rgba(254, 51, 119, .45)', 'glow': 'rgba(254, 51, 119, .38)',
      'heading': '#FFFFFF',
      'auth-bg': 'radial-gradient(60% 55% at 12% 8%, rgba(254, 51, 119, .36), transparent 66%), radial-gradient(50% 50% at 92% 88%, rgba(255, 204, 0, .16), transparent 66%), #09090D',
      'font-display': "'Archivo Black', 'Arial Black', sans-serif", 'font-body': "'Inter', system-ui, sans-serif",
      'display-weight': '400', 'display-case': 'uppercase', 'display-spacing': '-0.01em',
      'radius': '12px', 'radius-sm': '8px', 'radius-lg': '20px',
    }),
  },
];

// Temas de siempre (se pintan con su CSS propio en styles.css)
export const LEGACY_THEMES = [
  { id: 'nuvora', name: 'Nuvora', group: 'office', legacy: true, desc: 'Crema, profundo y mandarina. Albert Sans y Public Sans.', swatches: ['#0A2B2C', '#157A6E', '#FF8A3D', '#F3F4EE'] },
  { id: 'gtahub', name: 'HUB clásico', group: 'office', legacy: true, desc: 'Rosa, amarillo y negro del Manual de Redes. Archivo Black e Inter.', swatches: ['#101010', '#FE3377', '#FFCC00', '#181818'] },
  { id: 'custom', name: 'Personalizado', group: 'office', legacy: true, desc: 'Tu color principal y tu logo sobre la base de Nuvora.', swatches: [] },
];

export const DEFAULT_THEME = 'eleevate';
export const ALL_THEMES = [UI_THEMES[0], ...LEGACY_THEMES, ...UI_THEMES.slice(1)];
export const THEME_IDS = ALL_THEMES.map((t) => t.id);
// Lo que puede elegir cada persona (Personalizado depende del color de la oficina)
export const USER_THEME_IDS = THEME_IDS.filter((id) => id !== 'custom');
export const themeById = (id) => ALL_THEMES.find((t) => t.id === id) || null;
// Lista pública (sin las variables CSS)
export const themeList = () => ALL_THEMES.map(({ id, name, group, desc, swatches }) => ({ id, name, group, desc, swatches }));
