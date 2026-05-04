-- FISIO SAAS - POLITICAS SEGURAS PARA SUPABASE AUTH
-- Execute depois de criar suas contas em Authentication > Users.
--
-- Ou rode o pacote automatizado uma vez na máquina/CI:
--   npm run db:migrate   (DATABASE_URL ou SUPABASE_DB_URL)
-- Este script remove as politicas publicas do prototipo e exige usuario logado.

alter table professores enable row level security;
alter table pacientes   enable row level security;
alter table sessoes     enable row level security;

drop policy if exists "public_all_professores" on professores;
drop policy if exists "public_all_pacientes"   on pacientes;
drop policy if exists "public_all_sessoes"     on sessoes;

drop policy if exists "auth_all_professores" on professores;
drop policy if exists "auth_all_pacientes"   on pacientes;
drop policy if exists "auth_all_sessoes"     on sessoes;

create policy "auth_all_professores"
on professores for all
to authenticated
using (true)
with check (true);

create policy "auth_all_pacientes"
on pacientes for all
to authenticated
using (true)
with check (true);

create policy "auth_all_sessoes"
on sessoes for all
to authenticated
using (true)
with check (true);
