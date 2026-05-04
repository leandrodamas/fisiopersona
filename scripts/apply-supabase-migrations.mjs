#!/usr/bin/env node
/**
 * Aplica, em sequência, os SQL listados em sql/migrations.manifest.json (PostgreSQL direto).
 *
 * Uso (uma vez na máquina):
 *   Copie `.env.example` → `.env` e preencha DATABASE_URL.
 *   npm ci && npm run db:migrate
 *
 * Sem tocar na SQL Editor manualmente para o pacote agrupado.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env');
const MANIFEST_PATH = join(ROOT, 'sql', 'migrations.manifest.json');

function loadDotEnvQuiet() {
  if (!existsSync(ENV_PATH)) return;
  var lines = readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  lines.forEach(function (ln) {
    var m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(ln);
    if (!m) return;
    var k = m[1];
    if (process.env[k] != null && process.env[k] !== '') return;
    var val = m[2].replace(/^['"]|['"]$/g, '');
    process.env[k] = val;
  });
}

/** Parte em ; fora de strings, comentários e blocos dollar-quoted ($$ ... $$). */
function splitSqlStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let inSq = false;
  let inDq = false;
  let inLc = false;
  let bcDepth = 0;

  function consumeDollarQuote(s, start) {
    if (s[start] !== '$') return start;
    let j = start + 1;
    while (j < s.length && s[j] !== '$') j++;
    if (j >= s.length) return start;
    const tag = s.slice(start + 1, j);
    const close = '$' + tag + '$';
    const rest = j + 1;
    const end = s.indexOf(close, rest);
    if (end < 0) return start;
    return end + close.length;
  }

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    if (inLc) {
      if (c === '\n') inLc = false;
      cur += c;
      i++;
      continue;
    }
    if (bcDepth > 0) {
      if (c === '*' && next === '/') {
        bcDepth--;
        cur += c + next;
        i += 2;
        continue;
      }
      if (c === '/' && next === '*') {
        bcDepth++;
        cur += c + next;
        i += 2;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (!inSq && !inDq && c === '/' && next === '*') {
      bcDepth = 1;
      cur += c + next;
      i += 2;
      continue;
    }

    if (!inSq && !inDq && bcDepth === 0 && c === '-' && next === '-') {
      inLc = true;
      cur += c + next;
      i += 2;
      continue;
    }

    if (!inDq && c === "'") {
      if (inSq && next === "'") {
        cur += "''";
        i += 2;
        continue;
      }
      inSq = !inSq;
      cur += c;
      i++;
      continue;
    }

    if (!inSq && c === '"') {
      inDq = !inDq;
      cur += c;
      i++;
      continue;
    }

    if (!inSq && !inDq && bcDepth === 0 && c === '$') {
      const end = consumeDollarQuote(sql, i);
      if (end > i) {
        cur += sql.slice(i, end);
        i = end;
        continue;
      }
    }

    if (!inSq && !inDq && bcDepth === 0 && !inLc && c === ';') {
      const stmt = cur.trim();
      if (stmt) out.push(stmt);
      cur = '';
      i++;
      continue;
    }

    cur += c;
    i++;
  }
  const last = cur.trim();
  if (last) out.push(last);
  return out;
}

function printHelpPt() {
  console.error('');
  console.error('[db:migrate] Falta DATABASE_URL (ou SUPABASE_DB_URL) no ambiente ou no ficheiro .env');
  console.error('');
  console.error('  Passo 1 — No site do Supabase, abra o seu projeto.');
  console.error('  Passo 2 — ⚙️ Project Settings → Database → Connection string');
  console.error('  Passo 3 — Modo URI; copie a string que começa com postgresql:// (com a senha)');
  console.error('  Passo 4 — Na pasta deste projeto, ficheiro .env:');
  console.error('');
  console.error('     DATABASE_URL=postgresql://...')
  console.error('');
  console.error('  Passo 5 — Na consola aqui na pasta do projeto:');
  console.error('');
  console.error('     npm ci');
  console.error('     npm run db:migrate');
  console.error('');
  console.error('  Isso e o maximo automatico permitido: sem DATABASE_URL o Postgres nao pode receber DDL pela anon key do navegador.');
  console.error('');
}

function loadMigrationFiles() {
  if (!existsSync(MANIFEST_PATH)) {
    return [join(ROOT, 'sql', 'auto_rollout_fisio_supabase.sql')];
  }
  try {
    const j = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const list = Array.isArray(j.files) ? j.files : [];
    const paths = [];
    list.forEach(function (name) {
      if (typeof name !== 'string' || !name.trim()) return;
      paths.push(join(ROOT, 'sql', name.trim()));
    });
    return paths.length ? paths : [join(ROOT, 'sql', 'auto_rollout_fisio_supabase.sql')];
  } catch (e) {
    return [join(ROOT, 'sql', 'auto_rollout_fisio_supabase.sql')];
  }
}

loadDotEnvQuiet();
const dryRun = process.argv.includes('--dry-run');
const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';

async function main() {
  const files = loadMigrationFiles();
  console.log('[db:migrate] Ficheiros SQL (' + files.length + '):');
  files.forEach(function (f, idx) {
    console.log('[db:migrate]   ' + (idx + 1) + '. ' + f);
  });

  let stmtNo = 0;
  let allStatements = [];

  files.forEach(function (absPath) {
    if (!existsSync(absPath)) {
      console.error('[db:migrate] Ficheiro em falta: ' + absPath);
      throw new Error('Ficheiro SQL ausente');
    }
    const raw = readFileSync(absPath, 'utf8');
    const statements = splitSqlStatements(raw);
    statements.forEach(function (s) {
      stmtNo++;
      allStatements.push({ file: absPath, num: stmtNo, sql: s });
    });
  });

  console.log('[db:migrate] Total: ' + allStatements.length + ' comando(s) SQL após divisão.');

  if (dryRun) {
    allStatements.forEach(function (st, i) {
      const head = st.sql.slice(0, 220) + (st.sql.length > 220 ? '…' : '');
      console.log('--- #' + (i + 1) + ' (' + st.file.split(/[/\\]/).pop() + ') ---\n' + head + '\n');
    });
    console.log('[db:migrate] --dry-run concluído (nada foi enviado ao servidor).');
    return;
  }

  if (!url) {
    printHelpPt();
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : undefined
  });
  await client.connect();
  try {
    for (let i = 0; i < allStatements.length; i++) {
      const st = allStatements[i];
      await client.query(st.sql);
      console.log('[db:migrate] OK #' + (i + 1) + '/' + allStatements.length + ' — ' + st.file.split(/[/\\]/).pop());
    }
  } finally {
    await client.end();
  }
  console.log('[db:migrate] Concluído. Pode atualizar a página do Fisio SaaS e gravar professores novamente.');
}

main().catch(function (err) {
  console.error('[db:migrate] Erro:', err.message || err);
  if (String(err.message || '').toLowerCase().indexOf('password') >= 0) {
    console.error('[db:migrate] Confirme a senha na URI (Dashboard → Database → Reset password se precisar).');
  }
  process.exit(1);
});
