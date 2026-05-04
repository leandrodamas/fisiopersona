-- Ajuste de esquema: colunas dias / estagiários como text[] para o formato que o aplicativo envia (JSON arrays).
-- Use apenas se suas colunas estiverem como texto simples ou outro tipo incompatível e o PATCH em professores
-- responder 400 ao salvar. Faça backup ou teste num clone antes.
--
-- Exemplo quando `dias` e `estagiarios` são TEXT guardando valores separados por | (SEG|TER):

-- ALTER TABLE professores
--   ALTER COLUMN dias TYPE text[] USING (
--     CASE WHEN dias IS NULL OR trim(dias) = '' THEN '{}'::text[] ELSE string_to_array(trim(dias), '|')::text[] END
--   ),
--   ALTER COLUMN estagiarios TYPE text[] USING (
--     CASE WHEN estagiarios IS NULL OR trim(estagiarios) = '' THEN '{}'::text[] ELSE string_to_array(trim(estagiarios), '|')::text[] END
--   );

-- Se já forem texto mas formato diferente (vírgula, etc.), ajuste string_to_array.
