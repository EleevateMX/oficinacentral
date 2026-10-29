// La política de seguridad deja pasar las direcciones de LiveKit Cloud (regiones incluidas)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSecurityPolicy } from '../server/security.js';

const connectSrc = () => contentSecurityPolicy('hub.test').split(';').find((d) => d.trim().startsWith('connect-src'));

test('LiveKit Cloud: permite el proyecto y sus regiones', () => {
  const prev = process.env.LIVEKIT_URL;
  process.env.LIVEKIT_URL = 'wss://hub-abc123.livekit.cloud';
  try {
    const c = connectSrc();
    assert.match(c, /wss:\/\/hub-abc123\.livekit\.cloud/);
    assert.match(c, /wss:\/\/\*\.livekit\.cloud/);
    assert.match(c, /https:\/\/\*\.livekit\.cloud/);
  } finally {
    if (prev === undefined) delete process.env.LIVEKIT_URL; else process.env.LIVEKIT_URL = prev;
  }
});

test('LiveKit propio: solo su dirección, sin comodines', () => {
  const prev = process.env.LIVEKIT_URL;
  process.env.LIVEKIT_URL = 'wss://voz.ejemplo.com';
  try {
    const c = connectSrc();
    assert.match(c, /wss:\/\/voz\.ejemplo\.com/);
    assert.doesNotMatch(c, /\*\.livekit\.cloud/);
  } finally {
    if (prev === undefined) delete process.env.LIVEKIT_URL; else process.env.LIVEKIT_URL = prev;
  }
});
