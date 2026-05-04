import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');

/** Primeiro valor não vazio (compatível com nomes Vercel / Supabase / Next). */
function pickEnv(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

if (fs.existsSync(pub)) fs.rmSync(pub, { recursive: true, force: true });
fs.mkdirSync(pub, { recursive: true });

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

const supabaseUrl = pickEnv(
  'FISIO_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL'
);
const supabaseAnonKey = pickEnv(
  'FISIO_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY'
);
const sentryDsn = pickEnv('FISIO_SENTRY_DSN', 'SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN');
const environment = pickEnv('FISIO_ENVIRONMENT', 'VERCEL_ENV') || 'production';

const fisioConfig = {
  supabaseUrl,
  supabaseAnonKey,
  sentryDsn,
  environment
};
const configJs =
  'window.__FISIO_CONFIG__ = ' +
  JSON.stringify(fisioConfig, null, 2) +
  ';\n';
fs.writeFileSync(path.join(pub, 'config.js'), configJs, 'utf8');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[vercel-static-build] AVISO: defina FISIO_SUPABASE_URL e FISIO_SUPABASE_ANON_KEY (ou SUPABASE_URL / SUPABASE_ANON_KEY) no painel do Vercel → Settings → Environment Variables. O config.js gerado ficará vazio até lá.'
  );
}

const exPath = path.join(root, 'config.example.js');
if (fs.existsSync(exPath)) {
  fs.copyFileSync(exPath, path.join(pub, 'config.example.js'));
}

console.log('Static site copied to public/ (incl. config.js a partir de env).');
