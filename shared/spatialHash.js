// Rejilla espacial (spatial hash) para buscar vecinos sin revisar a todos contra todos.
// Se vacía y se vuelve a llenar en cada paso de la simulación (barato: sin crear objetos).
//
//   const H = new SpatialHash(1);           // celdas de 1 casilla
//   H.clear(); for (const z of zombies) H.insert(z, z.x, z.y);
//   H.query(x, y, r, (o) => { ... });       // llama solo con los que están en las celdas que toca el círculo
//
// Las celdas se guardan en listas enlazadas dentro de arreglos (sin Map ni arreglos por celda).
export class SpatialHash {
  constructor(cell = 1, cap = 256) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.heads = new Map(); // llave de celda → índice del primero (-1 vacío)
    this.items = new Array(cap);
    this.next = new Int32Array(cap);
    this.n = 0;
  }
  key(cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); }
  clear() { this.heads.clear(); this.n = 0; }
  insert(item, x, y) {
    if (this.n >= this.items.length) {
      const cap = this.items.length * 2;
      this.items.length = cap;
      const nx = new Int32Array(cap); nx.set(this.next); this.next = nx;
    }
    const i = this.n++;
    const k = this.key(Math.floor(x * this.inv), Math.floor(y * this.inv));
    const h = this.heads.get(k);
    this.next[i] = h === undefined ? -1 : h;
    this.heads.set(k, i);
    this.items[i] = item;
  }
  // fn(item) para cada objeto en las celdas que toca el cuadrado de lado 2r alrededor de (x, y).
  // Si fn devuelve true, se deja de buscar.
  query(x, y, r, fn) {
    const inv = this.inv;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        let i = this.heads.get(this.key(cx, cy));
        if (i === undefined) continue;
        while (i >= 0) { if (fn(this.items[i]) === true) return; i = this.next[i]; }
      }
    }
  }
  get size() { return this.n; }
}
