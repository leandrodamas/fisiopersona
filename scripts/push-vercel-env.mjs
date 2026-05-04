/**
 * Envia FISIO_SUPABASE_* para o projeto Vercel via API (evita clicar no painel).
 *
 * 1) Token: https://vercel.com/account/tokens → crie "push-env" (scope adequado ao projeto)
 * 2) Copie vercel-env.local.example → vercel-env.local e preencha (ficheiro ignorado pelo git)
 * 3) node scripts/push-vercel-env.mjs
 * 4) Vercel → Deployments → Redeploy (recomendado sem cache)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function parseEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const o = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 1) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[k] = v;
  }
  return o;
}

const localPath = path.join(root, 'vercel-env.local');
const fileVars = parseEnvFile(localPath);

function pick(k, ...alts) {
  if (process.env[k] != null && String(process.env[k]).trim() !== '') return String(process.env[k]).trim();
  if (fileVars[k] != null && String(fileVars[k]).trim() !== '') return String(fileVars[k]).trim();
  for (const a of alts) {
    if (process.env[a] != null && String(process.env[a]).trim() !== '') return String(process.env[a]).trim();
    if (fileVars[a] != null && String(fileVars[a]).trim() !== '') return String(fileVars[a]).trim();
  }
  return '';
}

const token = pick('VERCEL_TOKEN');
const teamId = pick('VERCEL_TEAM_ID', 'VERCEL_ORG_ID');
const project = pick('VERCEL_PROJECT_NAME') || 'fisio-saas-vercel';

const supabaseUrl = pick('FISIO_SUPABASE_URL', 'SUPABASE_URL');
const supabaseKey = pick('FISIO_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');

if (!token) {
  console.error('Falta VERCEL_TOKEN. Crie em https://vercel.com/account/tokens e coloque em vercel-env.local ou na env.');
  console.error('Modelo: copie vercel-env.local.example para vercel-env.local');
  process.exit(1);
}
if (!supabaseUrl || !supabaseKey) {
  console.error('Faltam FISIO_SUPABASE_URL e FISIO_SUPABASE_ANON_KEY (ou SUPABASE_*) no vercel-env.local ou no ambiente.');
  process.exit(1);
}

async function pushEnv(key, value) {
  const qs = new URLSearchParams({ upsert: 'true' });
  if (teamId) qs.set('teamId', teamId);
  const apiUrl = `https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/env?${qs}`;
  const body = {
    key,
    value,
    type: 'sensitive',
    target: ['production', 'preview', 'development']
  };
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Erro API', res.status, '—', text);
    if (res.status === 403 || res.status === 404) {
      console.error(
        'Dica: projeto numa equipa precisa de VERCEL_TEAM_ID (Vercel → equipa → Settings → General → Team ID).'
      );
    }
    process.exit(1);
  }
  try {
    const j = JSON.parse(text);
    const ok = j.created && (j.created.key || (Array.isArray(j.created) && j.created.length));
    console.log(ok ? 'OK:' : 'Resposta:', key, ok ? '' : text.slice(0, 200));
  } catch {
    console.log('OK:', key);
  }
}

await pushEnv('FISIO_SUPABASE_URL', supabaseUrl);
await pushEnv('FISIO_SUPABASE_ANON_KEY', supabaseKey);
console.log('\nFeito. Abra Vercel → Deployments → Redeploy (idealmente sem cache) para regerar config.js.');
