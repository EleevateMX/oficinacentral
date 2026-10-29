// Registro de juegos de la sala de juegos.
//
// Cada juego es un módulo con:
//   export const meta = { w, h, help }      // tamaño lógico del canvas y ayuda de controles
//   export function create(canvas, ctx)     // arranca el juego; devuelve { destroy() }
//
// ctx (lo arma GameModal):
//   seat      0 | 1 | -1        tu asiento (-1 = estás mirando)
//   host      boolean           true si eres el asiento 0: tú corres la física
//   players   [p0, p1]          { id, name, color } o null (asiento 1 vacío = la computadora)
//   sendInput(data)             invitado → anfitrión (controles)
//   sendState(data)             anfitrión → todos (estado para dibujar, ~30 por segundo)
//   sendEvent(data)             mensajes que no se pueden perder; { type: 'end', winner: 0|1, score: '11-7' } cuenta la victoria
//   onInput(fn(seat, data))     lo recibe el anfitrión
//   onState(fn(data))           lo reciben invitado y espectadores
//   onEvent(fn(seat, data))
//   sound(name)                 'hit' | 'wall' | 'score' | 'win' | 'lose' | 'pocket' | 'eat' | 'die'
//   submitScore(n)              arcade y zombies: guarda la puntuación (mejor marca de cada quien)
//   status(text)                texto corto bajo el juego ("Turno de Ana", "Tira…")
//   objectId, floorId, room     la máquina, su piso y el cuarto ({ seats, host, watchers })
//   onRoom(fn(room)), sit(), close(), volume
//   fullscreen                 { enter(), toggle(), active() }: pantalla completa del navegador
//
// El juego se vuelve a crear cada vez que cambian los jugadores, salvo los que tienen
// meta.persistent (Zombies, hasta 4): esos se enteran de quién entra o sale con onRoom
// y, si se va el anfitrión, el siguiente jugador sigue la partida.
// Los que tienen full: true (Zombies) ocupan toda la ventana, encima de la oficina.
// Ayudantes de red y bucle para todos: ./netSync.js (interpolación, paso fijo, lienzo nítido).
export const GAMES = {
  pong: { name: 'Ping pong', emoji: '🏓', load: () => import('./pong.js') },
  pool: { name: 'Billar', emoji: '🎱', load: () => import('./pool.js') },
  foosball: { name: 'Futbolito', emoji: '⚽', load: () => import('./foosball.js') },
  arcade: { name: 'Arcade', emoji: '👾', load: () => import('./pacman.js') },
  zombies: { name: 'Zombies en la oficina', emoji: '🧟', full: true, load: () => import('./zombies/index.js') },
};

export const GAME_OF = { pingPong: 'pong', poolTable: 'pool', foosball: 'foosball', arcade: 'arcade', zombieArcade: 'zombies' };
