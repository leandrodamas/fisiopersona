-- Move o CNS para a tabela de professores sem quebrar dados antigos.
-- Automação: use `npm run db:migrate` (conteúdo incorporado também em sql/auto_rollout_fisio_supabase.sql).

alter table professores
add column if not exists cns text default '';

-- O campo pacientes.cns pode continuar existindo por compatibilidade,
-- mas o app atualizado passa a usar professores.cns.
