// Estilo de los personajes generados que eligió el admin: 'v2' (HUB v2, predeterminado) o 'classic'.
// Lo comparten la oficina y el Hotel; los personajes subidos (hojas dibujadas) no cambian.
export const AVATAR_STYLES = ['classic', 'v2'];
let style = 'v2';
const listeners = new Set();
export const cleanAvatarStyle = (s) => (s === 'classic' ? 'classic' : 'v2');
export function setAvatarStyle(s) {
  const next = cleanAvatarStyle(s);
  if (next === style) return;
  style = next;
  listeners.forEach((fn) => fn(style));
}
export const avatarStyle = () => style;
export function onAvatarStyle(fn) { listeners.add(fn); return () => listeners.delete(fn); }
