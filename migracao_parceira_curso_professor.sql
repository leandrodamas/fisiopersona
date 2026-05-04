-- Parceiras (instituição / empresa convênio) e curso de preceptoria do estágio
-- Execute no Supabase após o deploy do app atualizado.
--
-- Automação: preferir aplicar este repositório de uma vez com
--   npm run db:migrate
-- usando DATABASE_URL na raiz (.env não versionado — veja .env.example).

alter table professores
  add column if not exists instituicao_parceira text default '';

alter table professores
  add column if not exists curso_preceptoria text default '';

comment on column professores.instituicao_parceira is 'Nome da universidade ou empresa parceira (ex.: Estácio)';
comment on column professores.curso_preceptoria is 'Área da preceptoria (ex.: Fisioterapia, Enfermagem)';

