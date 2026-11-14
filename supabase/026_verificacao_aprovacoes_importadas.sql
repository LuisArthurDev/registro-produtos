-- V44 — marcador de aprovação importada, verificação manual e conciliação auditável.
-- Pré-requisito: SQL 025 da v43. Migração aditiva; não altera quantidades, preços nem situação.
BEGIN;
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS aprovado_via_importacao boolean NOT NULL DEFAULT false;
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS importacao_verificada_em timestamptz;
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS importacao_verificada_por uuid REFERENCES public.usuarios(id);
COMMENT ON COLUMN public.queima.aprovado_via_importacao IS
 'Indica que esta ocorrência foi aprovada pelo conciliador Procfit; a origem permanece após a verificação.';
COMMENT ON COLUMN public.queima.importacao_verificada_em IS
 'Registro de quando o administrador conferiu e retirou o marcador pendente da importação.';
COMMENT ON COLUMN public.queima.importacao_verificada_por IS
 'Administrador da loja que verificou esta aprovação importada.';
CREATE INDEX IF NOT EXISTS idx_queima_importacoes_pendentes_v44 ON public.queima(loja_id,criado_em DESC)
 WHERE aprovado_via_importacao IS TRUE AND importacao_verificada_em IS NULL AND excluido_em IS NULL;
-- Linha criada inicialmente pela importação v43: origem inequívoca, pode receber marcador.
-- Histórico sem origem_relatorio_chave (aprovado por correspondência na v43)
-- não é marcado retroativamente: não há evidência por item para isso.
UPDATE public.queima
 SET aprovado_via_importacao=true
 WHERE origem_relatorio_chave IS NOT NULL AND estado='aprovado'
 AND excluido_em IS NULL AND aprovado_via_importacao IS FALSE
 AND importacao_verificada_em IS NULL;

-- Repete a função da v43 substituindo SOMENTE as duas transições
-- pendente→aprovado (existente e novo); correção de registros já aprovados
-- NÃO transforma sua origem em aprovação por importação.
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
           validade_gondola=v_validade,preco_gondola=v_preco,atualizado_em=now()
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
         preco_gondola=v_preco,atualizado_em=now() WHERE id=v_id;
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
NOTIFY pgrst,'reload schema';
COMMIT;
