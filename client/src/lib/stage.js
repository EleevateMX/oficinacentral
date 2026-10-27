// Escenario con micrófono (cliente): fila de manos levantadas e invitación a subir.
// El audio lo resuelve canTalk (shared/map.js → shared/stage.js); aquí solo va la fila.
import { stageAt, stageScopeAt } from '@shared/stage.js';
import { playSound } from './sounds.js';

const EMPTY = { key: null, floorId: null, queue: [], onStage: false, inScope: false };

// Dónde estoy respecto a los escenarios del piso
export function myStage(office) {
  const f = office.state.floor;
  const me = office.myPlayer;
  if (!f || !me || me.floorId !== f.id) return null;
  const s = stageScopeAt(f, me.x, me.y);
  if (!s) return null;
  return { stage: s, onStage: !!stageAt(f, me.x, me.y) };
}

// Quiénes están arriba del escenario ahora (yo incluido)
export function speakersOf(office, s) {
  const f = office.state.floor;
  const ids = [];
  for (const [id, p] of Object.entries(office.players)) {
    if (p.floorId === f.id && stageAt(f, p.x, p.y)?.key === s.key) ids.push(Number(id));
  }
  return ids.sort((a, b) => a - b);
}

export function initStageClient(office, socket) {
  office.set({ stage: EMPTY });
  let lastKey = null;
  let lastOn = false;
  const tick = () => {
    if (office.socket !== socket) { clearInterval(timer); return; }
    const w = myStage(office);
    const key = w ? `${office.state.floor.id}|${w.stage.key}` : null;
    const onStage = !!w?.onStage;
    if (key !== lastKey) {
      lastKey = key;
      if (key) socket.emit('stage:sync');
      else office.set({ stage: EMPTY });
    }
    const speakers = w ? speakersOf(office, w.stage) : [];
    const cur = office.state.stage;
    if (onStage !== lastOn || (w && (cur.inScope !== true || cur.speakers?.join() !== speakers.join()))) {
      if (onStage && !lastOn) office.toast({ title: '🎤 Estás en el escenario: te oye toda el área' });
      lastOn = onStage;
      office.set((st) => ({ stage: { ...st.stage, onStage, inScope: !!w, speakers, areaName: w?.stage.area?.name || null } }));
    }
  };
  const timer = setInterval(tick, 400);
  socket.on('connect', () => { lastKey = null; });

  socket.on('stage:queue', ({ floorId, key, queue }) => {
    const w = myStage(office);
    const mine = w && floorId === office.state.floor?.id && w.stage.key === key;
    if (!mine) {
      // Me sacaron de una fila de la que ya salí: si estoy en otra, no la piso
      if (!w) office.set({ stage: EMPTY });
      return;
    }
    office.set((st) => ({ stage: { ...st.stage, key, floorId, queue: queue.map(Number), onStage: w.onStage, inScope: true, areaName: w.stage.area?.name || null } }));
  });

  socket.on('stage:hand', ({ from }) => {
    const who = office.state.users[from]?.displayName || 'Alguien';
    playSound('wave', office.state.prefs.audio.notifVolume * 0.7);
    office.toast({ title: `✋ ${who} levantó la mano` });
  });

  socket.on('stage:invited', ({ by, floorId, x, y }) => {
    const who = office.state.users[by]?.displayName || 'Quien está en el escenario';
    playSound('wave', office.state.prefs.audio.notifVolume);
    office.toast({
      title: `🎤 ${who} te dio la palabra`,
      action: { label: 'Subir al escenario', run: () => goUp(office, floorId, x, y) },
      duration: 30000,
    });
  });
}

function goUp(office, floorId, x, y) {
  if (office.state.floor?.id !== floorId) return;
  office.set({ view: 'map' });
  office.moveMe(x, y, 'down', { tp: true });
}

export const raiseHand = (office) => { office.socket?.emit('stage:raise'); office.react?.('✋'); };
export const lowerHand = (office, userId) => office.socket?.emit('stage:lower', userId != null ? { userId } : {});
export const giveFloor = (office, userId) => office.socket?.emit('stage:give', { userId });

// Botón ✋ de la barra: en el área de un escenario levanta (o baja) la mano; si no, solo reacciona
export function handButton(office) {
  const st = office.state.stage;
  const meId = office.state.me.id;
  if (st?.inScope && !st.onStage) {
    if (st.queue.includes(meId)) lowerHand(office);
    else raiseHand(office);
    return true;
  }
  return false;
}
