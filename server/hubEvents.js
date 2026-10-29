// Bus de eventos internos del HUB (en vivo, bienvenida, eventos, reportes…).
// Los módulos avisan aquí sin importar quién escucha (hoy: la integración con Discord),
// así no se crean dependencias circulares. Un error de quien escucha nunca rompe a quien avisa.
import { EventEmitter } from 'node:events';

export const hub = new EventEmitter();
hub.setMaxListeners(50);

// Funciones que un módulo ofrece a otros sin importarlo (p. ej. cumpleaños → bot de Discord)
export const hooks = {};

export function hubEmit(kind, data = {}) {
  try { hub.emit(kind, data); } catch (e) { console.error(`[hub] ${kind}:`, e?.message || e); }
}
