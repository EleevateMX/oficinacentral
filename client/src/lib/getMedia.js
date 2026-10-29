// getUserMedia tolerante. Safari cambia los ids de los dispositivos entre sesiones: si se pide un
// micrófono o cámara guardado que ya no existe, responde "Invalid constraint" (OverconstrainedError).
// Aquí se reintenta con el dispositivo predeterminado y, si aun así falla, con lo mínimo.
let onStale = null;
// La tienda registra qué hacer cuando un dispositivo guardado ya no sirve (olvidarlo)
export function onStaleDevice(fn) { onStale = fn; }

export const isConstraintError = (e) => !!e && (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError' || (e.name === 'TypeError' && /constraint/i.test(e.message || '')) || /invalid constraint/i.test(e.message || ''));

// kind: 'audio' | 'video'; build(deviceId) arma las restricciones de ese tipo; minimal: las más simples
export async function getMedia(kind, build, deviceId, minimal = true) {
  const gum = (c) => navigator.mediaDevices.getUserMedia({ [kind]: c });
  try {
    return await gum(build(deviceId));
  } catch (e) {
    const stale = deviceId && (isConstraintError(e) || e.name === 'NotFoundError');
    if (!stale && !isConstraintError(e)) throw e;
    if (stale) onStale?.(kind === 'audio' ? 'micId' : 'camId');
    if (deviceId) {
      try { return await gum(build('')); } catch (e2) { if (!isConstraintError(e2)) throw e2; }
    }
    return gum(minimal);
  }
}
