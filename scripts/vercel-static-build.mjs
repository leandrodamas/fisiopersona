import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');

if (fs.existsSync(pub)) fs.rmSync(pub, { recursive: true, force: true });fs.mkdirSync(pub, { recursive: true });

const toCopy = ['index.html', 'vendor', 'src'];
for (const name of toCopy) {
  const src = path.join(root, name);
  if (!fs.existsSync(src)) {
    console.error('Missing required path for deploy:', src);
    process.exit(1);
  }
  const dest = path.join(pub, name);
  fs.cpSync(src, dest, { recursive: true });
}

// Em produção no Vercel, /config.js é servido por api/config.js (runtime) com as env do projeto.
// Não colocar public/config.js — senão o ficheiro estático ganha prioridade e o rewrite não corre.

const exPath = path.join(root, 'config.example.js');
if (fs.existsSync(exPath)) {
  fs.copyFileSync(exPath, path.join(pub, 'config.example.js'));
}

console.log('Static site copied to public/. No Vercel, /config.js vem de api/config.js (runtime).');
