-- FISIO SaaS — incremental idempotente (rode via `npm run db:migrate`).
-- Credencial: DATABASE_URL ou SUPABASE_DB_URL (connection string Postgres do projeto Supabase).

-- ── Professores: CNS ──
ALTER TABLE professores ADD COLUMN IF NOT EXISTS cns text DEFAULT '';

-- ── Professores: parceira e curso de preceptoria ──
ALTER TABLE professores ADD COLUMN IF NOT EXISTS instituicao_parceira text DEFAULT '';
ALTER TABLE professores ADD COLUMN IF NOT EXISTS curso_preceptoria text DEFAULT '';

COMMENT ON COLUMN professores.instituicao_parceira IS 'Universidade ou empresa parceira (ex.: Estácio)';
COMMENT ON COLUMN professores.curso_preceptoria IS 'Área da preceptoria (ex.: Fisioterapia, Enfermagem)';

-- ── RLS: acesso só autenticado (substitui políticas públicas do protótipo) ──
ALTER TABLE professores ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_all_professores" ON professores;
DROP POLICY IF EXISTS "public_all_pacientes" ON pacientes;
DROP POLICY IF EXISTS "public_all_sessoes" ON sessoes;

DROP POLICY IF EXISTS "auth_all_professores" ON professores;
DROP POLICY IF EXISTS "auth_all_pacientes" ON pacientes;
DROP POLICY IF EXISTS "auth_all_sessoes" ON sessoes;

CREATE POLICY "auth_all_professores" ON professores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_pacientes" ON pacientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_sessoes" ON sessoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Pacientes: código de procedimento (CID / TUSS); idempotente ──
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cod_procedimento text DEFAULT '';

COMMENT ON COLUMN pacientes.cod_procedimento IS 'Código de procedimento associado ao CID (compatibilidade operadora).';

-- ── Pacientes: CID-10 (alguns projetos antigos podem não ter a coluna) ──
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cid text DEFAULT '';

COMMENT ON COLUMN pacientes.cid IS 'CID-10 principal do paciente (texto livre normalizado no app).';
