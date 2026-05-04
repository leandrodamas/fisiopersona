-- FISIO SaaS — segunda etapa idempotente (rodada pelo mesmo npm run db:migrate).
-- Converte professores.dias / estagiarios de TEXT para text[] quando o app guarda arrays JSON via API.
-- Só faz ALTER se information_schema diz que o tipo ainda é texto; se já for array, não mexe.

DO $do$
DECLARE
  dias_udt text;
  est_udt text;
BEGIN
  SELECT udt_name INTO dias_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'professores' AND column_name = 'dias';

  SELECT udt_name INTO est_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'professores' AND column_name = 'estagiarios';

  IF dias_udt IS NULL OR est_udt IS NULL THEN
    RAISE NOTICE 'Colunas dias/estagiarios não encontradas em public.professores — ignorado.';
    RETURN;
  END IF;

  IF dias_udt IN ('text', 'varchar', 'character varying', 'bpchar') THEN
    ALTER TABLE public.professores
      ALTER COLUMN dias TYPE text[] USING (
        CASE
          WHEN dias IS NULL THEN '{}'::text[]
          WHEN btrim(dias::text) = '' THEN '{}'::text[]
          ELSE string_to_array(btrim(dias::text), '|')::text[]
        END
      );
    RAISE NOTICE 'Coluna professores.dias convertida para text[].';
  END IF;

  IF est_udt IN ('text', 'varchar', 'character varying', 'bpchar') THEN
    ALTER TABLE public.professores
      ALTER COLUMN estagiarios TYPE text[] USING (
        CASE
          WHEN estagiarios IS NULL THEN '{}'::text[]
          WHEN btrim(estagiarios::text) = '' THEN '{}'::text[]
          ELSE string_to_array(btrim(estagiarios::text), '|')::text[]
        END
      );
    RAISE NOTICE 'Coluna professores.estagiarios convertida para text[].';
  END IF;
END
$do$;
