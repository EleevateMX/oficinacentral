// Temas de la interfaz: el de la oficina (lo elige el admin) y el de cada persona.
import { db, getSetting, setSetting, addColumn } from './db.js';
import { emitToUser } from './realtime.js';
import { THEME_IDS, USER_THEME_IDS, DEFAULT_THEME, themeList } from '../shared/uiThemes.js';

export { THEME_IDS };

// Tema propio de cada persona (vacío = el de la oficina). Va en la cuenta: lo sigue en todos sus dispositivos.
addColumn('users', 'ui_theme', 'TEXT');

// Una sola vez: la oficina pasa a Eleevate aunque OFFICE_THEME diga otra cosa (en producción decía gtahub).
// Después de esto manda lo que el admin elija en Preferencias.
export function migrateTheme() {
  if (getSetting('migr_theme_eleevate_v1')) return false;
  setSetting('theme', DEFAULT_THEME);
  setSetting('migr_theme_eleevate_v1', '1');
  return true;
}
migrateTheme();

export function officeTheme() {
  const t = getSetting('theme') || process.env.OFFICE_THEME || DEFAULT_THEME;
  return THEME_IDS.includes(t) ? t : DEFAULT_THEME;
}

export const userTheme = (u) => (u?.ui_theme && USER_THEME_IDS.includes(u.ui_theme) ? u.ui_theme : null);

export function registerThemeRoutes(api, { fail }) {
  // Lista de temas (sin variables CSS) y el de la oficina
  api.get('/themes', (req, res) => {
    res.json({ themes: themeList(), office: officeTheme(), mine: userTheme(req.user) });
  });

  // Tema propio: null o '' vuelve al de la oficina
  api.put('/me/theme', (req, res) => {
    const raw = req.body?.theme;
    const theme = raw === null || raw === undefined || raw === '' ? null : String(raw);
    if (theme && !USER_THEME_IDS.includes(theme)) return fail(res, 400, 'Tema inválido');
    db.prepare('UPDATE users SET ui_theme = ? WHERE id = ?').run(theme, req.user.id);
    emitToUser(req.user.id, 'ui-theme', { theme }); // sus otras pestañas y dispositivos lo aplican al momento
    res.json({ theme });
  });
}
