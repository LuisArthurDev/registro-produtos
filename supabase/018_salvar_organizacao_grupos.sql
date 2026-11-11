-- V27: salva todas as alterações pendentes de responsáveis por Grupo numa transação.
-- Depende da 017. Não move produtos e não modifica os mapas existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.salvar_organizacao_grupos(
  p_loja text,
  p_usuario uuid,
  p_itens jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item jsonb;
  v_grupo text;
  v_chave text;
  v_nome text;
  v_destino text;
  v_responsavel uuid;
  v_chaves text[] := ARRAY[]::text[];
  v_total integer;
BEGIN
  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A lista de grupos deve ser um array' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(p_itens);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION 'Informe entre 1 e 500 grupos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = p_usuario AND u.loja_id = p_loja
      AND u.perfil = 'admin' AND u.ativo = true AND u.excluido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Apenas o administrador ativo da loja pode salvar esta organização'
      USING ERRCODE = '42501';
  END IF;

  -- Confere o lote inteiro ANTES de gravar qualquer linha.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Grupo inválido no lote' USING ERRCODE = '22023';
    END IF;
    v_grupo := btrim(coalesce(v_item ->> 'grupo', ''));
    v_chave := lower(v_grupo);
    IF length(v_chave) NOT BETWEEN 1 AND 120 OR v_chave = ANY(v_chaves) THEN
      RAISE EXCEPTION 'Grupo vazio, longo ou duplicado: %', v_grupo USING ERRCODE = '22023';
    END IF;
    v_chaves := array_append(v_chaves, v_chave);

    -- Verifica se o Grupo é real e permitido no catálogo da loja.
    SELECT btrim(p.grupo) INTO v_nome
      FROM public.produtos p
     WHERE lower(btrim(p.grupo)) = v_chave AND lower(btrim(p.secao)) NOT IN
        ('brinde','brindes','default','servico','serviço','servicos','serviços','servicoes','servições')
     ORDER BY p.grupo LIMIT 1;
    IF v_nome IS NULL THEN
      RAISE EXCEPTION 'Grupo não localizado ou protegido: %', v_grupo USING ERRCODE = '22023';
    END IF;

    v_destino := nullif(btrim(coalesce(v_item ->> 'responsavel_id', '')), '');
    IF v_destino IS NOT NULL THEN
      IF v_destino !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Responsável com identificador inválido' USING ERRCODE = '22023';
      END IF;
      v_responsavel := v_destino::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.usuarios u WHERE u.id = v_responsavel AND u.loja_id = p_loja
          AND u.perfil = 'funcionario' AND u.ativo = true AND u.excluido_em IS NULL
      ) THEN
        RAISE EXCEPTION 'Responsável inativo ou de outra loja' USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;

  -- Postgres executa esta função numa transação única: falha => rollback integral.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_grupo := btrim(v_item ->> 'grupo');
    v_chave := lower(v_grupo);
    v_destino := nullif(btrim(coalesce(v_item ->> 'responsavel_id', '')), '');
    SELECT btrim(p.grupo) INTO v_nome FROM public.produtos p
     WHERE lower(btrim(p.grupo)) = v_chave AND lower(btrim(p.secao)) NOT IN
        ('brinde','brindes','default','servico','serviço','servicos','serviços','servicoes','servições')
     ORDER BY p.grupo LIMIT 1;
    INSERT INTO public.organizacao_grupos AS og
       (loja_id,grupo_chave,grupo,responsavel_id,atualizado_por,atualizado_em)
    VALUES (p_loja,v_chave,v_nome,v_destino::uuid,p_usuario,now())
    ON CONFLICT (loja_id,grupo_chave) DO UPDATE SET
       grupo = EXCLUDED.grupo,
       responsavel_id = EXCLUDED.responsavel_id,
       atualizado_por = EXCLUDED.atualizado_por,
       atualizado_em = now();
    -- oculta_no_quadro/excluida_das_listas ficam como estão.
  END LOOP;

  RETURN jsonb_build_object('sucesso',true,'alterados',v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_organizacao_grupos(text,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_organizacao_grupos(text,uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
