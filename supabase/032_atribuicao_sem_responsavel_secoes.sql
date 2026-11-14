BEGIN;

CREATE OR REPLACE FUNCTION public.atribuir_sem_responsavel_secoes_v55(
 p_loja text,p_admin uuid,p_origem text,p_lotes jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_lote jsonb;
 v_ids uuid[];
 v_parte uuid[];
 v_destino uuid;
 v_total integer:=0;
BEGIN
 IF p_origem IS NULL OR p_origem NOT IN ('mapas','queima') OR jsonb_typeof(p_lotes) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Origem ou lotes inválidos' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_lotes) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'Selecione de 1 a 500 seções' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_admin AND loja_id=p_loja
   AND perfil='admin' AND ativo AND excluido_em IS NULL) THEN
  RAISE EXCEPTION 'Atribuição exclusiva do administrador ativo da loja' USING ERRCODE='42501';
 END IF;
 -- Serializa a distribuição por loja; as funções existentes validam cada item e auditam as gravações.
 PERFORM pg_catalog.pg_advisory_xact_lock(550032,pg_catalog.hashtext(p_loja));
 SELECT array_agg(item.id::uuid) INTO v_ids
 FROM jsonb_array_elements(p_lotes) AS lote(dados)
 CROSS JOIN LATERAL jsonb_array_elements_text(lote.dados->'ids') AS item(id);
 IF coalesce(cardinality(v_ids),0) NOT BETWEEN 1 AND 10000 OR
    (SELECT count(DISTINCT id) FROM unnest(v_ids) AS ids(id))<>cardinality(v_ids) THEN
  RAISE EXCEPTION 'Quantidade de itens inválida ou seleção duplicada' USING ERRCODE='22023';
 END IF;
 FOR v_lote IN SELECT value FROM jsonb_array_elements(p_lotes) LOOP
  v_destino:=(v_lote->>'responsavel_id')::uuid;
  IF v_destino IS NULL THEN
   RAISE EXCEPTION 'Escolha um responsável para cada seção' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(id::uuid ORDER BY id) INTO v_ids
   FROM jsonb_array_elements_text(v_lote->'ids') AS itens(id);
  IF coalesce(cardinality(v_ids),0)=0 THEN
   RAISE EXCEPTION 'Seção sem itens' USING ERRCODE='22023';
  END IF;
  FOR inicio IN 1..cardinality(v_ids) BY 1000 LOOP
   v_parte:=v_ids[inicio:inicio+999];
   IF p_origem='mapas' THEN
    PERFORM public.transferir_lancamentos_v12(p_admin,p_loja,NULL,v_destino,NULL,NULL,v_parte,false);
   ELSE
    PERFORM public.atribuir_responsavel_queima_lote_v54(p_loja,p_admin,v_parte,v_destino);
   END IF;
   v_total:=v_total+cardinality(v_parte);
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('sucesso',true,'quantidade',v_total);
END $$;

REVOKE ALL ON FUNCTION public.atribuir_sem_responsavel_secoes_v55(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atribuir_sem_responsavel_secoes_v55(text,uuid,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.excluir_mapas_lote_v55(p_loja text,p_admin uuid,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_total integer;
BEGIN
 IF coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 10000 OR
    (SELECT count(DISTINCT id) FROM unnest(p_ids) AS itens(id))<>cardinality(p_ids) THEN
  RAISE EXCEPTION 'Seleção inválida ou duplicada' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_admin AND loja_id=p_loja
    AND perfil='admin' AND ativo AND excluido_em IS NULL) THEN
  RAISE EXCEPTION 'Exclusão exclusiva do administrador ativo da loja' USING ERRCODE='42501';
 END IF;
 WITH selecionados AS (
  SELECT id FROM public.mapa_lancamentos WHERE loja_id=p_loja AND id=ANY(p_ids)
   AND excluido_em IS NULL AND tipo_mapa<>'Estoque' ORDER BY id FOR UPDATE
 ), excluidos AS (
  UPDATE public.mapa_lancamentos m SET excluido_em=now(),excluido_por=p_admin,atualizado_em=now()
  FROM selecionados s WHERE m.id=s.id RETURNING m.id
 )
 SELECT count(*) INTO v_total FROM excluidos;
 IF v_total<>cardinality(p_ids) THEN
  RAISE EXCEPTION 'Alguns registros mudaram ou estão fora do mapa. Atualize a seleção.' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.auditoria(loja_id,usuario_id,acao,dados)
 VALUES(p_loja,p_admin,'excluir_mapas_lote',jsonb_build_object('modo','exclusao_logica','ids',p_ids,'quantidade',v_total));
 RETURN jsonb_build_object('sucesso',true,'quantidade',v_total);
END $$;

REVOKE ALL ON FUNCTION public.excluir_mapas_lote_v55(text,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_mapas_lote_v55(text,uuid,uuid[]) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
