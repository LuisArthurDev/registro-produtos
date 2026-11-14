BEGIN;

CREATE OR REPLACE FUNCTION public.atribuir_responsavel_queima_lote_v54(
 p_loja_id text,p_usuario_id uuid,p_ids uuid[],p_responsavel_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF coalesce(cardinality(p_ids),0) NOT BETWEEN 1 AND 2000 OR p_responsavel_id IS NULL OR
    (SELECT count(DISTINCT id) FROM unnest(p_ids) AS ids(id)) <> cardinality(p_ids)
 THEN RAISE EXCEPTION 'Seleção ou responsável inválido' USING ERRCODE='22023'; END IF;

 FOR v_id IN SELECT id FROM unnest(p_ids) AS ids(id) ORDER BY id LOOP
  PERFORM 1 FROM public.queima q
   WHERE q.id=v_id AND q.loja_id=p_loja_id AND q.excluido_em IS NULL
     AND q.sem_responsavel_importacao IS TRUE AND q.responsavel_importacao_id IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Um dos itens já foi atribuído ou saiu da lista. Atualize o painel.' USING ERRCODE='22023';
  END IF;
  PERFORM public.atribuir_responsavel_queima_importada_v45(p_loja_id,p_usuario_id,v_id,p_responsavel_id);
 END LOOP;

 RETURN jsonb_build_object('sucesso',true,'quantidade',cardinality(p_ids));
END $$;

REVOKE ALL ON FUNCTION public.atribuir_responsavel_queima_lote_v54(text,uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atribuir_responsavel_queima_lote_v54(text,uuid,uuid[],uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
