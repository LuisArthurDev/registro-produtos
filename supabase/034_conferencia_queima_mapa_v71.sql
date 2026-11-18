-- V71: conferência de produtos presentes na Queima e no Mapa de Validade.
-- Execute no SQL Editor do Supabase antes de publicar a interface V71.
-- Não executa exclusões ou movimentações automaticamente.
BEGIN;

CREATE OR REPLACE FUNCTION public.conferir_queima_mapa_v71(p_loja_id text,p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id AND u.ativo=true AND u.perfil='admin')
 THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 WITH correspondencias AS (
  SELECT q.id AS queima_id,m.id AS mapa_id,q.ean,q.codigo_interno,q.lote,q.validade,
         q.quantidade AS quantidade_queima,m.quantidade AS quantidade_mapa,m.mapa_nome,m.tipo_mapa,
         count(*) OVER (PARTITION BY q.id) AS mapas_compativeis,
         count(*) OVER (PARTITION BY m.id) AS queimas_compativeis
  FROM public.queima q
  JOIN public.mapa_lancamentos m ON m.loja_id=q.loja_id
   AND upper(btrim(m.lote))=upper(btrim(q.lote)) AND m.validade=q.validade
   AND (m.ean=q.ean OR (nullif(btrim(q.codigo_interno),'') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.produtos p WHERE p.id=m.produto_id AND p.codigo_interno=q.codigo_interno
   )))
  WHERE q.loja_id=p_loja_id AND q.excluido_em IS NULL AND q.lancamento_id IS NULL
    AND m.excluido_em IS NULL AND m.quantidade>0 AND q.quantidade>0
 ), classificados AS (
 SELECT *,
  (mapas_compativeis=1 AND queimas_compativeis=1 AND quantidade_mapa>=quantidade_queima
   AND tipo_mapa NOT IN ('Termolabil','Psicotropicos','Antibioticos')
   AND mapa_nome NOT IN ('Termolabil','Psicotropicos','Antibioticos')) AS pode_corrigir,
  CASE WHEN mapas_compativeis>1 THEN 'Mais de um mapa correspondente'
       WHEN queimas_compativeis>1 THEN 'Mais de um item da Queima para este mapa'
       WHEN quantidade_mapa<quantidade_queima THEN 'Quantidade insuficiente no mapa'
       WHEN tipo_mapa IN ('Termolabil','Psicotropicos','Antibioticos') OR mapa_nome IN ('Termolabil','Psicotropicos','Antibioticos') THEN 'Aba especial protegida'
       ELSE NULL END AS motivo_bloqueio
 FROM correspondencias
 )
 SELECT jsonb_build_object('total',(SELECT count(*) FROM classificados),
    'itens',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (
     SELECT * FROM classificados ORDER BY validade,queima_id,mapa_id LIMIT 200
    ) t),'[]'::jsonb)) INTO v_result;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.corrigir_queima_mapa_v71(p_loja_id text,p_usuario_id uuid,p_queima_id uuid,p_mapa_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.queima%rowtype; m public.mapa_lancamentos%rowtype; v_outros integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id AND u.ativo=true AND u.perfil='admin')
 THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 -- Bloqueio de ambas as linhas garante conferência da quantidade no momento da correção.
 SELECT * INTO q FROM public.queima WHERE id=p_queima_id AND loja_id=p_loja_id FOR UPDATE;
 SELECT * INTO m FROM public.mapa_lancamentos WHERE id=p_mapa_id AND loja_id=p_loja_id FOR UPDATE;
 IF q.id IS NULL OR m.id IS NULL OR q.excluido_em IS NOT NULL OR m.excluido_em IS NOT NULL
  OR q.lancamento_id IS NOT NULL OR q.quantidade IS NULL OR q.quantidade<=0
  OR m.quantidade<q.quantidade OR q.validade IS DISTINCT FROM m.validade
  OR upper(btrim(coalesce(q.lote,'')))<>upper(btrim(coalesce(m.lote,'')))
 THEN RAISE EXCEPTION 'Os registros foram alterados ou não são compatíveis. Atualize a conferência.' USING ERRCODE='23514'; END IF;
 IF q.ean IS DISTINCT FROM m.ean AND NOT EXISTS (
  SELECT 1 FROM public.produtos p WHERE p.id=m.produto_id AND p.codigo_interno=q.codigo_interno
 ) THEN RAISE EXCEPTION 'Código/EAN diferente entre os registros' USING ERRCODE='23514'; END IF;
 IF m.tipo_mapa IN ('Termolabil','Psicotropicos','Antibioticos') OR m.mapa_nome IN ('Termolabil','Psicotropicos','Antibioticos')
 THEN RAISE EXCEPTION 'Não permitido para abas especiais protegidas' USING ERRCODE='23514'; END IF;
 -- Revalida ambiguidades no banco sob a transação.
 SELECT count(*) INTO v_outros FROM public.mapa_lancamentos m2
 WHERE m2.loja_id=p_loja_id AND m2.id<>m.id AND m2.excluido_em IS NULL AND m2.quantidade>0
 AND m2.validade=q.validade AND upper(btrim(m2.lote))=upper(btrim(q.lote))
 AND (m2.ean=q.ean OR EXISTS (SELECT 1 FROM public.produtos p WHERE p.id=m2.produto_id AND p.codigo_interno=q.codigo_interno));
 IF v_outros>0 THEN RAISE EXCEPTION 'Há mais de um mapa correspondente. Corrija manualmente.' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO v_outros FROM public.queima q2 WHERE q2.loja_id=p_loja_id AND q2.id<>q.id
 AND q2.excluido_em IS NULL AND q2.lancamento_id IS NULL AND q2.quantidade>0
 AND q2.validade=m.validade AND upper(btrim(q2.lote))=upper(btrim(m.lote))
 AND (q2.ean=m.ean OR EXISTS (SELECT 1 FROM public.produtos p WHERE p.id=m.produto_id AND p.codigo_interno=q2.codigo_interno));
 IF v_outros>0 THEN RAISE EXCEPTION 'Há mais de um registro Queima para esse mapa. Corrija manualmente.' USING ERRCODE='23514'; END IF;
 UPDATE public.mapa_lancamentos SET quantidade=quantidade-q.quantidade,atualizado_em=now() WHERE id=m.id;
 UPDATE public.queima SET lancamento_id=m.id,origem_mapa=m.mapa_nome,atualizado_em=now() WHERE id=q.id;
 RETURN jsonb_build_object('corrigido',true,'queima_id',q.id,'mapa_id',m.id,
  'quantidade_movida',q.quantidade,'quantidade_restante_mapa',m.quantidade-q.quantidade);
END $$;

REVOKE ALL ON FUNCTION public.conferir_queima_mapa_v71(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.corrigir_queima_mapa_v71(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conferir_queima_mapa_v71(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.corrigir_queima_mapa_v71(text,uuid,uuid,uuid) TO service_role;
COMMIT;
