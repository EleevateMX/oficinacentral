// Logros e insignias. Cada insignia mide un número (metric) y tiene niveles (tiers):
// al llegar al primer número se gana la insignia; los siguientes la suben a plata y oro.
// El servidor calcula los números (server/achievements.js); el cliente solo los muestra.
export const TIER_NAMES = ['Bronce', 'Plata', 'Oro'];

export const ACHIEVEMENTS = [
  { id: 'shift', emoji: '⏱️', name: 'Incansable', desc: 'Horas en turno', unit: 'h', tiers: [10, 50, 100] },
  { id: 'online', emoji: '🏢', name: 'Siempre presente', desc: 'Horas conectado en la oficina', unit: 'h', tiers: [10, 100, 500] },
  { id: 'early', emoji: '🌅', name: 'Madrugador', desc: 'Días que te conectaste antes de las 8:00', unit: 'días', tiers: [5, 20, 50] },
  { id: 'night', emoji: '🦉', name: 'Búho nocturno', desc: 'Días que seguías conectado después de las 23:00', unit: 'días', tiers: [5, 20, 50] },
  { id: 'pong', emoji: '🏓', name: 'Campeón de ping pong', desc: 'Partidas de ping pong ganadas', unit: 'victorias', tiers: [5, 25, 100] },
  { id: 'pool', emoji: '🎱', name: 'Rey del billar', desc: 'Partidas de billar ganadas', unit: 'victorias', tiers: [5, 25, 100] },
  { id: 'foosball', emoji: '⚽', name: 'Crack del futbolito', desc: 'Partidas de futbolito ganadas', unit: 'victorias', tiers: [5, 25, 100] },
  { id: 'arcade', emoji: '👾', name: 'Récord del arcade', desc: 'Tener la mejor puntuación del arcade', unit: '', tiers: [1] },
  { id: 'bday', emoji: '🎂', name: 'Nunca olvida un cumpleaños', desc: 'Cumpleaños felicitados', unit: 'felicitaciones', tiers: [3, 10, 25] },
  { id: 'dance', emoji: '💃', name: 'Alma de la fiesta', desc: 'Veces que bailaste', unit: 'bailes', tiers: [10, 50, 200] },
  { id: 'hugs', emoji: '🤗', name: 'Buena vibra', desc: 'Abrazos y choques de cinco', unit: 'veces', tiers: [5, 25, 100] },
  { id: 'social', emoji: '💬', name: 'Sociable', desc: 'Personas distintas con las que chateaste', unit: 'personas', tiers: [5, 15, 30] },
  { id: 'explorer', emoji: '🧭', name: 'Explorador', desc: 'Salas distintas que visitaste', unit: 'salas', tiers: [5, 10, 20] },
  { id: 'decor', emoji: '🪴', name: 'Decorador', desc: 'Objetos que colocaste en el mapa', unit: 'objetos', tiers: [5, 20, 50] },
  { id: 'veteran', emoji: '🎖️', name: 'Veterano', desc: 'Días desde que llegaste a la oficina', unit: 'días', tiers: [30, 180, 365] },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// Nivel alcanzado con un valor (0 = todavía no)
export function tierFor(a, value) {
  let t = 0;
  for (const n of a.tiers) if (value >= n) t++;
  return t;
}

// Progreso hacia el siguiente nivel (0…1) y meta
export function progressFor(a, value) {
  const t = tierFor(a, value);
  if (t >= a.tiers.length) return { tier: t, goal: a.tiers[a.tiers.length - 1], pct: 1 };
  const goal = a.tiers[t];
  return { tier: t, goal, pct: Math.max(0, Math.min(1, value / goal)) };
}

export const tierLabel = (a, tier) => (a.tiers.length > 1 && tier > 0 ? TIER_NAMES[tier - 1] : '');

// Puntos del ranking semanal
export const WEEKLY_POINTS = { onlineHour: 1, shiftHour: 2, win: 3, wish: 5, badge: 10 };
