// Mascotas que acompañan al personaje por la oficina.
// Cada una es una "receta" de dibujo: especie, colores, orejas, hocico, cola y pelaje.
// kind: dog | cat | bunny | hamster | cuyo | turtle | bird | duck | chick | fox | panda | axolotl | hedgehog | pig
const dog = (id, name, o) => ({ id, name, group: 'Perros', kind: 'dog', ...o });
const cat = (id, name, o) => ({ id, name, group: 'Gatos', kind: 'cat', ears: 'pointy', snout: 'short', tail: 'long', ...o });
const other = (id, name, kind, o) => ({ id, name, group: 'Otros', kind, ...o });

export const PETS = [
  { id: 'none', name: 'Ninguna', group: '' },
  // Perros
  dog('mestizo', 'Mestizo (criollo)', { color: '#b07a4a', ears: 'floppy', snout: 'long', tail: 'wag', belly: '#e9d2b4' }),
  dog('chihuahua', 'Chihuahua', { color: '#e8c39a', size: 0.7, ears: 'bat', snout: 'short', tail: 'curl' }),
  dog('pug', 'Pug', { color: '#e3c79a', size: 0.85, ears: 'small', snout: 'flat', tail: 'curl', mask: '#3b3029' }),
  dog('labrador', 'Labrador', { color: '#e8c46a', size: 1.15, ears: 'floppy', snout: 'long', tail: 'wag' }),
  dog('labradorNegro', 'Labrador negro', { color: '#2b2b2f', size: 1.15, ears: 'floppy', snout: 'long', tail: 'wag' }),
  dog('golden', 'Golden retriever', { color: '#d99a4a', size: 1.15, ears: 'floppy', snout: 'long', tail: 'fluffy' }),
  dog('pastorAleman', 'Pastor alemán', { color: '#b9824a', size: 1.2, ears: 'pointy', snout: 'long', tail: 'fluffy', saddle: '#2b2420' }),
  dog('husky', 'Husky', { color: '#8f98a3', size: 1.15, ears: 'pointy', snout: 'long', tail: 'curl', belly: '#f4f4f6', mask: '#f4f4f6', eye: '#4aa3ff' }),
  dog('bulldogFrances', 'Bulldog francés', { color: '#c9c3bb', size: 0.85, ears: 'bat', snout: 'flat', tail: 'stub', mask: '#4a4440' }),
  dog('bulldog', 'Bulldog inglés', { color: '#e3d3c0', size: 0.95, ears: 'small', snout: 'flat', tail: 'stub', spots: '#b06a3a', short: true }),
  dog('schnauzer', 'Schnauzer', { color: '#8a8d93', size: 0.9, ears: 'floppy', snout: 'long', tail: 'stub', beard: '#d7d9dc' }),
  dog('poodle', 'Poodle', { color: '#f2ece4', size: 0.9, ears: 'round', snout: 'long', tail: 'pom' }),
  dog('dalmata', 'Dálmata', { color: '#f4f4f6', size: 1.1, ears: 'floppy', snout: 'long', tail: 'long', spots: '#1d1d22' }),
  dog('beagle', 'Beagle', { color: '#c8894f', size: 0.95, ears: 'floppy', snout: 'long', tail: 'wag', saddle: '#3a2f28', belly: '#f4f4f6' }),
  dog('salchicha', 'Salchicha', { color: '#8a4b2a', size: 0.95, ears: 'floppy', snout: 'long', tail: 'long', long: true, short: true }),
  dog('borderCollie', 'Border collie', { color: '#2b2b2f', size: 1.05, ears: 'floppy', snout: 'long', tail: 'fluffy', belly: '#f4f4f6', mask: '#f4f4f6' }),
  dog('shiba', 'Shiba inu', { color: '#e0904a', size: 0.95, ears: 'pointy', snout: 'long', tail: 'curl', belly: '#f6e6d0' }),
  dog('corgi', 'Corgi', { color: '#e39a4f', size: 0.95, ears: 'bat', snout: 'long', tail: 'stub', belly: '#f4f4f6', short: true, long: true }),
  dog('pitbull', 'Pitbull', { color: '#9a8f88', size: 1.1, ears: 'small', snout: 'long', tail: 'long', belly: '#f4f4f6' }),
  dog('rottweiler', 'Rottweiler', { color: '#1f1c1c', size: 1.2, ears: 'floppy', snout: 'long', tail: 'stub', tan: '#b06a2a' }),
  dog('doberman', 'Dóberman', { color: '#1f1c1c', size: 1.2, ears: 'pointy', snout: 'long', tail: 'stub', tan: '#b06a2a' }),
  dog('xolo', 'Xoloitzcuintle', { color: '#4a4040', size: 1.0, ears: 'bat', snout: 'long', tail: 'long' }),
  dog('yorkshire', 'Yorkshire', { color: '#3f4a5a', size: 0.7, ears: 'pointy', snout: 'short', tail: 'stub', tan: '#c8a06a' }),
  dog('maltes', 'Maltés', { color: '#f7f3ee', size: 0.75, ears: 'floppy', snout: 'short', tail: 'fluffy' }),
  dog('pomerania', 'Pomerania', { color: '#f0a050', size: 0.7, ears: 'pointy', snout: 'short', tail: 'fluffy' }),
  dog('boxer', 'Bóxer', { color: '#c07a3a', size: 1.1, ears: 'floppy', snout: 'flat', tail: 'stub', mask: '#2b2420', belly: '#f4f4f6' }),
  dog('sanBernardo', 'San Bernardo', { color: '#f4f4f6', size: 1.3, ears: 'floppy', snout: 'long', tail: 'fluffy', spots: '#a8582a' }),
  // Gatos
  cat('gatoNaranja', 'Gato naranja', { color: '#f2a65a', stripes: '#d97a2a' }),
  cat('gatoNegro', 'Gato negro', { color: '#232327', eye: '#e8c33a' }),
  cat('gatoBlanco', 'Gato blanco', { color: '#f6f3ee', eye: '#4aa3ff' }),
  cat('gatoGris', 'Gato gris', { color: '#8a8f99' }),
  cat('atigrado', 'Atigrado', { color: '#9a8a74', stripes: '#4a3f33' }),
  cat('siames', 'Siamés', { color: '#efe2cc', points: '#4a3a30', eye: '#4aa3ff' }),
  cat('calico', 'Calicó', { color: '#f6f3ee', spots: '#e08a3a', spots2: '#2b2b2f' }),
  cat('persa', 'Persa', { color: '#e9e1d6', tail: 'fluffy', snout: 'flat', size: 1.05 }),
  cat('tuxedo', 'Esmoquin', { color: '#232327', belly: '#f6f3ee', mask: '#f6f3ee' }),
  // Otros
  other('conejo', 'Conejo blanco', 'bunny', { color: '#f4f4f6' }),
  other('conejoCafe', 'Conejo café', 'bunny', { color: '#a9784f' }),
  other('conejoGris', 'Conejo gris', 'bunny', { color: '#9aa0a8' }),
  other('conejoBelier', 'Conejo belier', 'bunny', { color: '#e7d2b5', ears: 'lop' }),
  other('hamster', 'Hámster', 'hamster', { color: '#e8b070' }),
  other('cuyo', 'Cuyo', 'cuyo', { color: '#b07a4a', spots: '#f4f4f6' }),
  other('tortuga', 'Tortuga', 'turtle', { color: '#6aa84f' }),
  other('perico', 'Perico', 'bird', { color: '#3ec46d' }),
  other('guacamaya', 'Guacamaya', 'bird', { color: '#e63946', wing: '#3a86ff' }),
  other('pato', 'Patito', 'duck', { color: '#ffd23f' }),
  other('pollito', 'Pollito', 'chick', { color: '#ffd23f' }),
  other('zorro', 'Zorro', 'dog', { color: '#ef7a2f', ears: 'pointy', snout: 'long', tail: 'fox', belly: '#f4f4f6', size: 0.95 }),
  other('panda', 'Panda', 'panda', { color: '#f4f4f6' }),
  other('ajolote', 'Ajolote', 'axolotl', { color: '#f6a5c0' }),
  other('erizo', 'Erizo', 'hedgehog', { color: '#8a6a4a' }),
  other('cerdito', 'Cerdito', 'pig', { color: '#f5b5c0' }),
];
// Nombres anteriores (para quien ya había elegido una)
const LEGACY = { dog: 'mestizo', cat: 'gatoNaranja', bunny: 'conejo', fox: 'zorro', chick: 'pollito' };
export const petDef = (id) => PETS.find((p) => p.id === (LEGACY[id] || id)) || null;
export const PET_IDS = [...PETS.map((p) => p.id), ...Object.keys(LEGACY)];
export const PET_COLORS = ['#b07a4a', '#e8c46a', '#d99a4a', '#f4f4f6', '#2b2b2f', '#8a8f99', '#f2a65a', '#c8894f', '#a9784f', '#e3c79a', '#ffd23f', '#FE3377'];
export const cleanPetName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
