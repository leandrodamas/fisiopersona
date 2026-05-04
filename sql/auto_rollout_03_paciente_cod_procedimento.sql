-- Pacientes: código de procedimento compatível com CID (faturação / relatórios).

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cod_procedimento text DEFAULT '';

COMMENT ON COLUMN pacientes.cod_procedimento IS 'Código de procedimento associado ao CID (ex.: tabela de compatibilidade ANS ou operadora).';
