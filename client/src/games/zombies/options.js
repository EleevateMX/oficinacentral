// Opciones de Zombies en la oficina: se guardan en este navegador (localStorage) y se aplican al momento.
// La calidad se sigue guardando aparte en "zombies.quality" (así ya la guardaba el juego).

export const CROSS_STYLES = [
  { id: 'cruz', name: 'Cruz' },
  { id: 'punto', name: 'Punto' },
  { id: 'circulo', name: 'Círculo' },
  { id: 'cruzpunto', name: 'Cruz y punto' },
];
export const CROSS_COLORS = ['#ffffff', '#7CFF4F', '#FE3377', '#FFCC00', '#4FD8FF'];

export const DEFAULTS = {
  sens: 1, // multiplica la sensibilidad del mouse (y del dedo)
  invertY: false,
  fov: 74,
  master: 80, // 0–100
  effects: 100, // 0–100: disparos, golpes y zombis
  minimap: true,
  dmgNums: true, // números de daño sobre los zombis
  cross: 'cruz',
  crossColor: '#ffffff',
};

const KEY = 'zombies.opts';
const clamp = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);

export function loadOpts() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { raw = {}; }
  const o = { ...DEFAULTS };
  o.sens = clamp(raw.sens, 0.2, 3, DEFAULTS.sens);
  o.invertY = !!raw.invertY;
  o.fov = Math.round(clamp(raw.fov, 60, 100, DEFAULTS.fov));
  o.master = Math.round(clamp(raw.master, 0, 100, DEFAULTS.master));
  o.effects = Math.round(clamp(raw.effects, 0, 100, DEFAULTS.effects));
  o.minimap = raw.minimap !== false;
  o.dmgNums = raw.dmgNums !== false;
  o.cross = CROSS_STYLES.some((c) => c.id === raw.cross) ? raw.cross : DEFAULTS.cross;
  o.crossColor = CROSS_COLORS.includes(raw.crossColor) ? raw.crossColor : DEFAULTS.crossColor;
  return o;
}

export function saveOpts(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* modo privado: solo dura esta sesión */ }
}
