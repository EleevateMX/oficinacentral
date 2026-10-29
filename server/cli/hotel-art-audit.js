// Revisa que la altura de cada furni (def.h / def.sit) coincida con su dibujo: nada flota ni se hunde.
// Uso: node server/cli/hotel-art-audit.js [--all]
import { HOTEL_FURNI } from '../../shared/hotelCatalog.js';
import { measureArt } from '../../client/src/hotel/art/measure.js';

export const ART_TOL = 0.08;
// Asientos dibujados a mano (sin cajas exactas) que se revisaron a ojo con capturas: altura del cojín
export const SEAT_BY_EYE = { beanbag: 0.35, retro70_sofa_round: 0.45, retro70_egg: 0.5, cristal_silla: 0.6, cristal_banca: 0.52 };
// Excepciones a propósito: en la tina (def.soak = nivel del agua) se sienta adentro; la bola disco cuelga del techo
export const HANGING = new Set(['fiesta_discoball']);

export function auditFurni(def) {
  const m = measureArt(def);
  const issues = [];
  if (Math.abs(m.bottom) > 0.02 && !HANGING.has(def.id)) issues.push(`base en z=${m.bottom.toFixed(2)}`);
  if (def.sit && m.custom && SEAT_BY_EYE[def.id] == null) issues.push('asiento dibujado a mano: revisar a ojo y anotarlo en SEAT_BY_EYE');
  else if (def.sit && m.custom) { if (Math.abs(SEAT_BY_EYE[def.id] - def.sit) > 0.001) issues.push(`sit=${def.sit} pero a ojo es ${SEAT_BY_EYE[def.id]}`); }
  else if (def.sit && def.soak) { if (def.sit >= def.soak || Math.abs(def.soak - m.surface) > ART_TOL) issues.push(`soak=${def.soak} debe ser el nivel del agua (${m.surface.toFixed(2)}) y quedar arriba del asiento`); }
  else if (def.sit && Math.abs(m.surface - def.sit) > ART_TOL) issues.push(`sit=${def.sit} pero el asiento se dibuja en ${m.surface.toFixed(2)}`);
  if (def.lay && Math.abs(m.surface - def.h) > ART_TOL) issues.push(`h=${def.h} pero el colchón se dibuja en ${m.surface.toFixed(2)}`);
  if ((def.stack || def.walk) && Math.abs(m.surface - def.h) > ART_TOL) issues.push(`h=${def.h} pero la superficie se dibuja en ${m.surface.toFixed(2)}`);
  return { m, issues };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = process.argv.includes('--all');
  let bad = 0;
  for (const def of HOTEL_FURNI.filter((d) => d.kind === 'floor')) {
    const { m, issues } = auditFurni(def);
    if (issues.length || all) console.log(`${issues.length ? '✗' : '✓'} ${def.id.padEnd(22)} ${def.cat.padEnd(9)} h=${def.h} sit=${def.sit ?? '-'} top=${m.top.toFixed(2)} surf=${m.surface.toFixed(2)} ${issues.join(' · ')}`);
    if (issues.length) bad++;
  }
  console.log(bad ? `\n${bad} furnis no coinciden` : '\nTodo coincide');
  process.exitCode = bad ? 1 : 0;
}
