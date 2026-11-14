-- V45 — itens aprovados pelo XLSX sem vínculo de mapa: Sem responsável, com atribuição posterior.
-- DEPENDE DE 025 E 026. Não cria mapas artificiais: o XLSX não contém o Lote.
-- Idempotente. Somente administradores de loja atribuem; não muda aprovações.
BEGIN;
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS responsavel_importacao_id uuid REFERENCES public.usuarios(id);
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS sem_responsavel_importacao boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_queima_sem_responsavel_v45 ON public.queima(loja_id,criado_em DESC)
 WHERE sem_responsavel_importacao=true AND estado='aprovado' AND excluido_em IS NULL;
COMMENT ON COLUMN public.queima.sem_responsavel_importacao IS
 'Aprovado via XLSX, mas sem um único titular confiável em mapa do mesmo EAN e validade.';
COMMENT ON COLUMN public.queima.responsavel_importacao_id IS
 'Titular atribuído para conferência da Queima; não fabrica lançamento de mapa sem lote.';

-- Retorna funcionário SOMENTE quando todos os mapas ativos do mesmo EAN e
-- validade pertencem a um mesmo funcionário ativo. Mapa especial, sem titular,
-- lotes distintos ou múltiplos titulares não geram atribuição arbitrária.
CREATE OR REPLACE FUNCTION public.responsavel_mapa_queima_v45(
 p_loja text,p_ean text,p_validade date
) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH candidatos AS (
  SELECT m.funcionario_id FROM public.mapa_lancamentos m
  WHERE m.loja_id=p_loja AND m.ean=p_ean AND m.validade=p_validade
   AND m.tipo_mapa='funcionario' AND m.excluido_em IS NULL
 ), resumo AS (
  SELECT count(*) AS total,count(funcionario_id) AS com_responsavel,
   count(DISTINCT funcionario_id) AS titulares,min(funcionario_id::text)::uuid AS destino
  FROM candidatos
 )
 SELECT CASE WHEN r.total>0 AND r.total=r.com_responsavel AND r.titulares=1
  AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=r.destino AND u.loja_id=p_loja
   AND u.perfil='funcionario' AND u.ativo=true AND u.excluido_em IS NULL)
  THEN r.destino ELSE NULL::uuid END FROM resumo r;
$$;
REVOKE ALL ON FUNCTION public.responsavel_mapa_queima_v45(text,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.responsavel_mapa_queima_v45(text,text,date) TO service_role;

-- Reclassifica apenas aprovações importadas existentes, sem mexer na aprovação.
-- Mantém quantidade, validade, lote, preço, a marca Verificado e as chaves únicas.
WITH candidatos AS (
 SELECT q.id,public.responsavel_mapa_queima_v45(q.loja_id,q.ean,q.validade) AS destino
 FROM public.queima q
 WHERE q.aprovado_via_importacao IS TRUE AND q.estado='aprovado' AND q.excluido_em IS NULL
  AND q.responsavel_importacao_id IS NULL
  AND q.sem_responsavel_importacao IS FALSE -- não refazer atribuição manual em reexecuções
)
UPDATE public.queima q SET responsavel_importacao_id=c.destino,
 sem_responsavel_importacao=(c.destino IS NULL),atualizado_em=now()
FROM candidatos c WHERE q.id=c.id;

CREATE OR REPLACE FUNCTION public.conciliar_queima_relatorio_v43(
 p_loja_id text,p_usuario_id uuid,p_itens jsonb,
 p_primeira_carga boolean DEFAULT false,p_corrigir_aprovados boolean DEFAULT false,p_simular boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 raw jsonb;v_cod text;v_ean text;v_validade date;v_data date;v_qtd integer;v_preco numeric;
 v_origem text;v_key text;v_ocorrencia integer;v_cont_catalogo integer;
 v_cont integer;v_id uuid;v_estado text;v_deleted timestamptz;v_acao text;v_linha integer;
 v_usados uuid[]:=ARRAY[]::uuid[];v_chaves text[]:=ARRAY[]::text[];
 v_res jsonb:='{}'::jsonb;v_exemplos jsonb:='[]'::jsonb;v_analisadas integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id
   AND u.perfil='admin' AND u.ativo=true AND u.excluido_em IS NULL) THEN
   RAISE EXCEPTION 'Somente administrador ativo da loja pode conciliar a Queima' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 1500 THEN
   RAISE EXCEPTION 'Envie de 1 a 1500 linhas aprovadas (S) por conferência' USING ERRCODE='22023';
 END IF;
 FOR raw IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  v_analisadas:=v_analisadas+1;v_acao:='invalido';v_cod:=trim(coalesce(raw->>'codigo_interno',''));
  v_linha:=nullif(raw->>'linha','')::integer;
  IF jsonb_typeof(raw) IS DISTINCT FROM 'object' OR coalesce(raw->>'aprovado','') NOT IN ('true','S','s')
     OR v_cod !~ '^\d{1,20}$' OR (raw->>'validade') !~ '^\d{4}-\d{2}-\d{2}$'
     OR (raw->>'data_lancamento') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_acao:='invalido';
  ELSE
   v_validade:=(raw->>'validade')::date;v_data:=(raw->>'data_lancamento')::date;
   v_qtd:=nullif(raw->>'quantidade','')::integer;
   v_preco:=nullif(raw->>'preco_gondola','')::numeric;
   v_ocorrencia:=nullif(raw->>'ocorrencia','')::integer;
   IF v_ocorrencia IS NULL OR v_ocorrencia NOT BETWEEN 1 AND 10000 OR v_qtd IS NULL OR v_qtd NOT BETWEEN 1 AND 999999
      OR v_linha IS NULL OR v_linha<2 OR v_preco IS NOT NULL AND (v_preco<0 OR v_preco>9999999999.99) THEN
    v_acao:='invalido';
   ELSE
    -- Identidade estável entre versões do relatório: preço e quantidade podem
    -- ser corrigidos sem criar um segundo registro.
    v_origem:=md5(concat_ws('|',p_loja_id,ltrim(v_cod,'0'),v_validade::text,v_data::text,v_ocorrencia::text));
    IF v_origem=ANY(v_chaves) THEN
      RAISE EXCEPTION 'Linhas duplicadas na seleção de conciliação' USING ERRCODE='22023';
    END IF;
    v_chaves:=array_append(v_chaves,v_origem);
    SELECT count(DISTINCT p.ean),min(p.ean) INTO v_cont_catalogo,v_ean FROM public.produtos p
    WHERE ltrim(coalesce(p.codigo_interno,''),'0')=ltrim(v_cod,'0');
    IF v_cont_catalogo<>1 THEN
      v_acao:='sem_catalogo';
    ELSIF EXISTS(SELECT 1 FROM public.produtos p WHERE p.ean=v_ean AND p.formula_especial=true) THEN
      v_acao:='formula_especial';
    ELSIF EXISTS(SELECT 1 FROM public.queima q WHERE q.loja_id=p_loja_id AND q.origem_relatorio_chave=v_origem) THEN
      SELECT q.id,q.estado,q.excluido_em INTO v_id,v_estado,v_deleted
      FROM public.queima q WHERE q.loja_id=p_loja_id AND q.origem_relatorio_chave=v_origem LIMIT 1;
      IF v_deleted IS NOT NULL THEN v_acao:='ja_excluido';
      ELSIF v_preco IS NULL THEN v_acao:='sem_preco';
      ELSIF p_corrigir_aprovados AND v_estado='aprovado' THEN
        v_acao:='corrigir_aprovado';
        IF NOT p_simular THEN
          UPDATE public.queima SET quantidade=v_qtd,preco_gondola=v_preco,
           validade_gondola=v_validade,atualizado_em=now()
          WHERE id=v_id AND loja_id=p_loja_id AND estado='aprovado' AND excluido_em IS NULL;
        END IF;
      ELSE v_acao:='ja_conciliado';
      END IF;
    ELSE
     SELECT count(*),(array_agg(q.id ORDER BY q.criado_em,q.id))[1],
      (array_agg(q.estado ORDER BY q.criado_em,q.id))[1]
      INTO v_cont,v_id,v_estado FROM public.queima q
      WHERE q.loja_id=p_loja_id AND q.ean=v_ean AND q.validade=v_validade
       AND q.estado IN('pendente','aprovado') AND q.excluido_em IS NULL
       AND q.origem_relatorio_chave IS NULL AND NOT (q.id=ANY(v_usados));
     IF v_cont>1 THEN
       v_acao:='correspondencia_ambigua';
     ELSIF v_preco IS NULL THEN
       v_acao:='sem_preco';
     ELSIF v_cont=1 THEN
       v_usados:=array_append(v_usados,v_id);
       IF v_estado='pendente' THEN
         v_acao:='aprovar_existente';
         IF NOT p_simular THEN
          UPDATE public.queima SET estado='aprovado',aprovado_via_importacao=true,quantidade=v_qtd,
           validade_gondola=v_validade,preco_gondola=v_preco,
           responsavel_importacao_id=public.responsavel_mapa_queima_v45(p_loja_id,v_ean,v_validade),
           sem_responsavel_importacao=(public.responsavel_mapa_queima_v45(p_loja_id,v_ean,v_validade) IS NULL),
           atualizado_em=now()
          WHERE id=v_id AND loja_id=p_loja_id AND estado='pendente' AND excluido_em IS NULL;
          IF NOT FOUND THEN RAISE EXCEPTION 'Conciliação mudou durante a gravação; confira novamente.' USING ERRCODE='40001';END IF;
         END IF;
       ELSIF p_corrigir_aprovados THEN
         v_acao:='corrigir_aprovado';
         IF NOT p_simular THEN
          UPDATE public.queima SET quantidade=v_qtd,validade_gondola=v_validade,
           preco_gondola=v_preco,atualizado_em=now()
          WHERE id=v_id AND loja_id=p_loja_id AND estado='aprovado' AND excluido_em IS NULL;
          IF NOT FOUND THEN RAISE EXCEPTION 'Conciliação mudou durante a gravação; confira novamente.' USING ERRCODE='40001';END IF;
         END IF;
       ELSE v_acao:='ja_aprovado';
       END IF;
     ELSIF NOT p_primeira_carga THEN v_acao:='sem_correspondencia';
     ELSIF v_validade < ((now() AT TIME ZONE 'America/Sao_Paulo')::date+7) THEN
       v_acao:='prazo_insuficiente';
     ELSIF EXISTS(SELECT 1 FROM public.mapa_lancamentos m WHERE m.loja_id=p_loja_id AND m.ean=v_ean
       AND m.excluido_em IS NULL AND (m.tipo_mapa IN('Termolabil','Psicotropicos','Antibioticos')
       OR m.mapa_nome IN('Termolabil','Psicotropicos','Antibioticos')))
       AND NOT EXISTS(SELECT 1 FROM public.mapa_lancamentos m WHERE m.loja_id=p_loja_id AND m.ean=v_ean
       AND m.excluido_em IS NULL AND coalesce(m.tipo_mapa,'') NOT IN('Termolabil','Psicotropicos','Antibioticos')
       AND coalesce(m.mapa_nome,'') NOT IN('Termolabil','Psicotropicos','Antibioticos')) THEN
       v_acao:='aba_especial';
     ELSE
       v_acao:='cadastrar_e_aprovar';
       IF NOT p_simular THEN
        -- O relatório NÃO contém Lote ou Registro: manter NULL em vez de inventar.
        INSERT INTO public.queima(loja_id,ean,lote,validade,quantidade,motivo,estado,
          origem_mapa,usuario_id,origem_relatorio_chave)
        VALUES(p_loja_id,v_ean,NULL,v_validade,v_qtd,'4','pendente',
          'Relatório Procfit (sem lote/registro)',p_usuario_id,v_origem)
        RETURNING id INTO v_id;
        UPDATE public.queima SET estado='aprovado',aprovado_via_importacao=true,validade_gondola=v_validade,
         preco_gondola=v_preco,
         responsavel_importacao_id=public.responsavel_mapa_queima_v45(p_loja_id,v_ean,v_validade),
         sem_responsavel_importacao=(public.responsavel_mapa_queima_v45(p_loja_id,v_ean,v_validade) IS NULL),
         atualizado_em=now() WHERE id=v_id;
       END IF;
     END IF;
    END IF;
   END IF;
  END IF;
  v_res:=jsonb_set(v_res,ARRAY[v_acao],to_jsonb(coalesce((v_res->>v_acao)::integer,0)+1),true);
  IF jsonb_array_length(v_exemplos)<100 THEN
   v_exemplos:=v_exemplos||jsonb_build_array(jsonb_build_object(
      'linha',v_linha,'codigo_interno',v_cod,'validade',raw->>'validade','acao',v_acao));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('total_aprovados',v_analisadas,'primeira_carga',p_primeira_carga,
  'corrigir_aprovados',p_corrigir_aprovados,'simulacao',p_simular,
  'contagem',v_res,'amostras',v_exemplos);
END $$;
REVOKE ALL ON FUNCTION public.conciliar_queima_relatorio_v43(text,uuid,jsonb,boolean,boolean,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_queima_relatorio_v43(text,uuid,jsonb,boolean,boolean,boolean) TO service_role;

-- Atribui uma ocorrência aprovada de importação sem inventar Lote ou
-- criar um mapa fictício. É permitido mudar ou limpar o responsável futuramente.
CREATE OR REPLACE FUNCTION public.atribuir_responsavel_queima_importada_v45(
 p_loja_id text,p_usuario_id uuid,p_queima_id uuid,p_responsavel_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_queima public.queima%ROWTYPE;v_nome text;v_anterior uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id
  AND u.perfil='admin' AND u.ativo=true AND u.excluido_em IS NULL) THEN
  RAISE EXCEPTION 'Somente administrador ativo pode atribuir Queima' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_queima FROM public.queima q WHERE q.id=p_queima_id AND q.loja_id=p_loja_id
  AND q.excluido_em IS NULL AND q.estado='aprovado' AND q.aprovado_via_importacao=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Queima importada aprovada não encontrada' USING ERRCODE='22023';END IF;
 IF p_responsavel_id IS NOT NULL THEN
  SELECT u.nome INTO v_nome FROM public.usuarios u WHERE u.id=p_responsavel_id
   AND u.loja_id=p_loja_id AND u.perfil='funcionario' AND u.ativo=true AND u.excluido_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Responsável não pertence à loja ou está inativo' USING ERRCODE='42501';END IF;
 END IF;
 v_anterior:=v_queima.responsavel_importacao_id;
 UPDATE public.queima SET responsavel_importacao_id=p_responsavel_id,
  sem_responsavel_importacao=(p_responsavel_id IS NULL),atualizado_em=now()
 WHERE id=p_queima_id AND loja_id=p_loja_id;
 INSERT INTO public.auditoria(loja_id,usuario_id,acao,dados)
 VALUES(p_loja_id,p_usuario_id,'atribuir_queima_importada',jsonb_build_object(
  'queima_id',p_queima_id,'responsavel_anterior',v_anterior,
  'responsavel_novo',p_responsavel_id,'responsavel_nome',coalesce(v_nome,'Sem responsável')));
 RETURN jsonb_build_object('sucesso',true,'queima_id',p_queima_id,
  'responsavel_id',p_responsavel_id,'responsavel_nome',coalesce(v_nome,'Sem responsável'));
END $$;
REVOKE ALL ON FUNCTION public.atribuir_responsavel_queima_importada_v45(text,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atribuir_responsavel_queima_importada_v45(text,uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
