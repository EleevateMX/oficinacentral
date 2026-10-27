// Revisa la sintaxis de todos los .js de la app (sin abrir Electron)
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = [];
for (const dir of ['src', 'src/ui', 'scripts']) {
  for (const f of fs.readdirSync(path.join(root, dir))) if (f.endsWith('.js')) files.push(path.join(dir, f));
}
for (const f of files) {
  execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'inherit' });
  console.log(`✓ ${f}`);
}
