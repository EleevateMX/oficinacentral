// Ayudantes de las herramientas de medición: entrar a la oficina y abrir Zombies.
import { ROOT } from '../../tests/helpers/server.js';

export const START = /[\\/]\./.test(ROOT) ? '/index.html' : '/';
export const GPU_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];

export async function login(page, url, username, password) {
  await page.goto(url + START);
  await page.fill('#u', username);
  await page.fill('#p', password);
  await page.click('button.btn.primary');
  await page.waitForFunction(() => window.__office?.state?.ready, null, { timeout: 30000, polling: 300 });
}

// Abre la máquina de Zombies (sin teclado: la bienvenida puede salir en cualquier momento y
// quedarse con la tecla). game: 'zombies' | 'karts'
export async function openGame(page, { quality = null, opts = null, game = 'zombies' } = {}) {
  // que ya esté conectado (si no, el aviso de "me uno" se pierde)
  await page.waitForFunction(() => window.__office.socket?.connected && window.__office.state.floor?.objects?.length, null, { timeout: 30000, polling: 200 });
  await page.waitForTimeout(1500);
  await page.evaluate(([q, o]) => { if (q) localStorage.setItem(`${'zombies'}.quality`, q); if (o) localStorage.setItem('zombies.opts', JSON.stringify(o)); }, [quality, opts]);
  await page.evaluate((g) => {
    const type = g === 'karts' ? 'kartArcade' : 'zombieArcade';
    const o = window.__office.state.floor.objects.find((q) => q.type === type);
    window.__office.moveMe(o.x, o.y + 2, 'up', { tp: true });
    window.__office.set({ modal: { type: 'game', objectId: o.id, game: g, floorId: window.__office.state.floor?.id } });
  }, game);
  if (game === 'zombies') {
    await page.waitForFunction(() => window.__zombies?.state().ready, null, { timeout: 90000, polling: 500 })
      .catch(async (e) => { throw new Error(`${e.message} · modal=${JSON.stringify(await page.evaluate(() => window.__office.state.modal))}`); });
  }
}
