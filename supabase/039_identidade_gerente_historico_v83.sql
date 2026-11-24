-- V83: matrícula, troca inicial de PIN, cargo Gerente, inativação segura e seções.
-- FAÇA BACKUP ANTES. Execute depois de 038. As credenciais continuam scrypt na API.
BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS matricula text;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS pin_inicial_pendente boolean NOT NULL DEFAULT false;
-- Normaliza matrículas existentes (zeros iniciais não identificam outra matrícula).
UPDATE public.usuarios SET matricula=NULLIF(ltrim(matricula,'0'),'') WHERE matricula IS NOT NULL;
-- Identificador de matrícula único POR LOJA; matrícula sem zeros iniciais.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='usuarios_matricula_formato_v83') THEN
    ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_matricula_formato_v83
      CHECK(matricula IS NULL OR matricula ~ '^[1-9][0-9]{0,19}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_loja_matricula_v83
  ON public.usuarios(loja_id,matricula) WHERE matricula IS NOT NULL AND excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_loja_data_v83 ON public.auditoria(loja_id,criado_em DESC);
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_perfil_check
  CHECK(perfil IN ('funcionario','gerente','admin','geral'));

-- Inativação atômica: os lançamentos continuam existentes, porém sem responsável.
CREATE OR REPLACE FUNCTION public.inativar_funcionario_desvincular_v83(
 p_loja text,p_ator uuid,p_funcionario uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_nome text;v_qtd integer;v_qtd_queima integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_ator AND u.ativo=true AND u.excluido_em IS NULL AND
   ((u.perfil='admin' AND u.loja_id=p_loja) OR (u.titular_painel_geral=true AND u.acesso_geral=true)))
 THEN RAISE EXCEPTION 'Administrador não autorizado' USING ERRCODE='42501';END IF;
 SELECT nome INTO v_nome FROM public.usuarios WHERE id=p_funcionario AND loja_id=p_loja AND perfil='funcionario'
  AND excluido_em IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado' USING ERRCODE='22023';END IF;
 UPDATE public.mapa_lancamentos SET funcionario_id=NULL,mapa_nome='Sem responsável',atualizado_em=now()
  WHERE loja_id=p_loja AND tipo_mapa='funcionario' AND excluido_em IS NULL
    AND (funcionario_id=p_funcionario OR (funcionario_id IS NULL AND mapa_nome=v_nome));
 GET DIAGNOSTICS v_qtd=ROW_COUNT;
 UPDATE public.organizacao_grupos SET responsavel_id=NULL,atualizado_em=now()
  WHERE loja_id=p_loja AND responsavel_id=p_funcionario;
 UPDATE public.queima SET responsavel_importacao_id=NULL,sem_responsavel_importacao=true
  WHERE loja_id=p_loja AND excluido_em IS NULL AND responsavel_importacao_id=p_funcionario;
 GET DIAGNOSTICS v_qtd_queima=ROW_COUNT;
 UPDATE public.queima SET origem_mapa='Sem responsável'
  WHERE loja_id=p_loja AND excluido_em IS NULL AND origem_mapa=v_nome;
 UPDATE public.usuarios SET ativo=false,atualizado_em=now() WHERE id=p_funcionario;
 DELETE FROM public.sessoes WHERE usuario_id=p_funcionario;
 INSERT INTO public.auditoria(loja_id,usuario_id,acao,dados)
  VALUES(p_loja,p_ator,'inativar_funcionario_desvincular',jsonb_build_object('id',p_funcionario,'nome',v_nome,'mapas',v_qtd,'queima',v_qtd_queima));
 RETURN jsonb_build_object('sucesso',true,'mapas',v_qtd,'queima',v_qtd_queima);
END $$;
REVOKE ALL ON FUNCTION public.inativar_funcionario_desvincular_v83(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inativar_funcionario_desvincular_v83(text,uuid,uuid) TO service_role;


-- Regulariza funcionários que já estavam inativos antes da V83.
UPDATE public.mapa_lancamentos m SET funcionario_id=NULL,mapa_nome='Sem responsável',atualizado_em=now()
 FROM public.usuarios u WHERE m.funcionario_id=u.id AND m.tipo_mapa='funcionario'
  AND m.excluido_em IS NULL AND u.perfil='funcionario' AND (u.ativo=false OR u.excluido_em IS NOT NULL);
UPDATE public.organizacao_grupos og SET responsavel_id=NULL,atualizado_em=now()
 FROM public.usuarios u WHERE og.responsavel_id=u.id AND (u.ativo=false OR u.excluido_em IS NOT NULL);
UPDATE public.queima q SET responsavel_importacao_id=NULL,sem_responsavel_importacao=true
 FROM public.usuarios u WHERE q.responsavel_importacao_id=u.id AND q.excluido_em IS NULL
  AND (u.ativo=false OR u.excluido_em IS NOT NULL);
UPDATE public.queima q SET origem_mapa='Sem responsável'
 FROM public.usuarios u WHERE q.loja_id=u.loja_id AND q.excluido_em IS NULL
  AND q.origem_mapa IN (u.nome,coalesce(u.nome_original_exclusao,''))
  AND u.perfil='funcionario' AND (u.ativo=false OR u.excluido_em IS NOT NULL);

-- A função existente de organização valida que o operador é Administrador.
-- Permite Gerente também e mantém validação transacional do lote.
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
      AND u.perfil IN ('admin','gerente') AND u.ativo = true AND u.excluido_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Apenas um administrador ou gerente ativo da loja pode salvar esta organização'
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
      SELECT og.grupo INTO v_nome FROM public.organizacao_grupos og WHERE og.loja_id=p_loja AND og.grupo_chave=v_chave LIMIT 1;
    END IF;
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
    IF v_nome IS NULL THEN
      SELECT og.grupo INTO v_nome FROM public.organizacao_grupos og WHERE og.loja_id=p_loja AND og.grupo_chave=v_chave LIMIT 1;
    END IF;
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

REVOKE ALL ON FUNCTION public.salvar_organizacao_grupos(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_organizacao_grupos(text,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
