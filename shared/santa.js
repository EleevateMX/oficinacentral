// Amigo secreto: sorteo sin repetir (nadie se regala a sí mismo) y respetando exclusiones.
// Las exclusiones son parejas [a, b]: a no le regala a b ni b a a.

const shuffle = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function exclusionSet(exclusions = []) {
  const s = new Set();
  for (const [a, b] of exclusions) {
    s.add(`${Number(a)}>${Number(b)}`);
    s.add(`${Number(b)}>${Number(a)}`);
  }
  return s;
}

// Devuelve { [deUserId]: paraUserId } o null si es imposible.
// Primero intenta una sola cadena (A→B→C→…→A, se ve bonita al revelar); si las exclusiones
// no lo permiten, busca cualquier reparto válido con vuelta atrás.
export function drawPairs(ids, exclusions = [], rng = Math.random) {
  const people = [...new Set(ids.map(Number))];
  if (people.length < 2) return null;
  const banned = exclusionSet(exclusions);
  const ok = (a, b) => a !== b && !banned.has(`${a}>${b}`);

  for (let tries = 0; tries < 400; tries++) {
    const order = shuffle(people, rng);
    if (order.every((a, i) => ok(a, order[(i + 1) % order.length]))) {
      const out = {};
      order.forEach((a, i) => { out[a] = order[(i + 1) % order.length]; });
      return out;
    }
  }

  // Vuelta atrás: asigna primero a quien tiene menos opciones
  const givers = shuffle(people, rng).sort((a, b) => people.filter((x) => ok(a, x)).length - people.filter((x) => ok(b, x)).length);
  const taken = new Set();
  const out = {};
  let steps = 0;
  const go = (i) => {
    if (i === givers.length) return true;
    if (++steps > 200000) return false;
    const a = givers[i];
    for (const b of shuffle(people, rng)) {
      if (taken.has(b) || !ok(a, b)) continue;
      taken.add(b); out[a] = b;
      if (go(i + 1)) return true;
      taken.delete(b); delete out[a];
    }
    return false;
  };
  return go(0) ? out : null;
}

// ¿Es un reparto válido? (para pruebas y para revisar antes de guardar)
export function validPairs(pairs, ids, exclusions = []) {
  const people = [...new Set(ids.map(Number))];
  const banned = exclusionSet(exclusions);
  const receivers = new Set();
  for (const a of people) {
    const b = Number(pairs[a]);
    if (!b || b === a || banned.has(`${a}>${b}`) || !people.includes(b) || receivers.has(b)) return false;
    receivers.add(b);
  }
  return receivers.size === people.length && Object.keys(pairs).length === people.length;
}

// Ordena el reparto como cadena(s) para mostrarlo al revelar: [[a, b, c], [d, e]]
export function chains(pairs) {
  const seen = new Set();
  const out = [];
  for (const start of Object.keys(pairs).map(Number)) {
    if (seen.has(start)) continue;
    const c = [];
    let x = start;
    while (!seen.has(x)) { seen.add(x); c.push(x); x = Number(pairs[x]); }
    out.push(c);
  }
  return out;
}
