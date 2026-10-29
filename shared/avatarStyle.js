// Estilo de los personajes generados que eligió el admin: 'classic' (predeterminado) o 'v2' (HUB v2).
// Lo comparten la oficina y el Hotel; los personajes subidos (hojas dibujadas) no cambian.
export const AVATAR_STYLES = ['classic', 'v2'];
let style = 'classic';
const listeners = new Set();
export const cleanAvatarStyle = (s) => (s === 'v2' ? 'v2' : 'classic');
export function setAvatarStyle(s) {
  const next = cleanAvatarStyle(s);
  if (next === style) return;
  style = next;
  listeners.forEach((fn) => fn(style));
}
export const avatarStyle = () => style;
export function onAvatarStyle(fn) { listeners.add(fn); return () => listeners.delete(fn); }
