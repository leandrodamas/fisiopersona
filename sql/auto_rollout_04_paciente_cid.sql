-- Pacientes: coluna CID-10 (idempotente). Use se o PATCH retornar coluna "cid" inexistente.
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cid text DEFAULT '';

COMMENT ON COLUMN pacientes.cid IS 'CID-10 principal do paciente.';
