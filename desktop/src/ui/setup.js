// Primera vez (o "Cambiar oficina…"): pide y guarda la dirección de la oficina
const form = document.getElementById('form');
const input = document.getElementById('url');
const msg = document.getElementById('msg');
const btn = document.getElementById('save');

window.nuvora.invoke('setup:get').then((d) => {
  if (d?.officeUrl) input.value = d.officeUrl;
  input.select();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = 'Conectando…';
  msg.className = 'muted';
  btn.disabled = true;
  try {
    const r = await window.nuvora.invoke('setup:save', input.value);
    if (r?.error) {
      msg.textContent = r.error;
      msg.className = 'error';
    } else {
      msg.textContent = `Listo: ${r?.name || 'oficina'}`;
      msg.className = 'ok';
    }
  } catch {
    msg.textContent = 'Algo salió mal. Intenta de nuevo.';
    msg.className = 'error';
  } finally {
    btn.disabled = false;
  }
});
