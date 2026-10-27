// Selector de pantalla o ventana para compartir (con o sin audio de la PC)
const $ = (id) => document.getElementById(id);
let data = null;
let tab = 'screen';
let selected = null;

function render() {
  const grid = $('grid');
  grid.textContent = '';
  const list = data.sources.filter((s) => s.type === tab);
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'empty';
    p.textContent = tab === 'screen' ? 'No se encontraron pantallas.' : 'No hay ventanas para compartir.';
    grid.append(p);
  }
  for (const s of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'source';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-pressed', String(selected === s.id));
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (s.thumb) thumb.style.backgroundImage = `url("${s.thumb}")`;
    const name = document.createElement('div');
    name.className = 'name';
    if (s.icon) {
      const img = document.createElement('img');
      img.src = s.icon;
      img.alt = '';
      name.append(img);
    }
    const label = document.createElement('span');
    label.textContent = s.name;
    name.append(label);
    b.title = s.name;
    b.append(thumb, name);
    b.addEventListener('click', () => {
      selected = s.id;
      for (const el of grid.querySelectorAll('.source')) el.setAttribute('aria-pressed', String(el === b));
      $('share').disabled = false;
    });
    b.addEventListener('dblclick', () => { selected = s.id; share(); });
    grid.append(b);
  }
  $('tabScreen').setAttribute('aria-selected', String(tab === 'screen'));
  $('tabWindow').setAttribute('aria-selected', String(tab === 'window'));
  $('share').disabled = !selected;
}

function share() {
  if (!selected) return;
  window.nuvora.invoke('picker:choose', { id: selected, audio: $('audio').checked && !$('audio').disabled });
}

$('tabScreen').addEventListener('click', () => { tab = 'screen'; render(); });
$('tabWindow').addEventListener('click', () => { tab = 'window'; render(); });
$('share').addEventListener('click', share);
$('cancel').addEventListener('click', () => window.nuvora.invoke('picker:choose', null));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.nuvora.invoke('picker:choose', null);
  if (e.key === 'Enter') share();
});

window.nuvora.invoke('picker:get').then((d) => {
  if (!d) return;
  data = d;
  const screens = d.sources.filter((s) => s.type === 'screen');
  // Con una sola pantalla queda elegida de una vez
  if (screens.length === 1) selected = screens[0].id;
  $('permission').hidden = d.screenPermission === 'granted';
  const audio = $('audio');
  if (!d.audioRequested) {
    $('audioRow').hidden = true;
  } else if (!d.systemAudio.ok) {
    audio.checked = false;
    audio.disabled = true;
  }
  $('audioNote').textContent = d.audioRequested ? d.systemAudio.note : '';
  render();
});
