-- V80: conferir somente aprovados já existentes; exclusão conjunta atômica.
BEGIN;
CREATE OR REPLACE FUNCTION public.conferir_aprovacoes_queima_v80(
 p_loja_id text,p_usuario_id uuid,p_itens jsonb,p_simular boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 item jsonb; v_codigo text; v_data date; v_id uuid; v_estado text;
 v_qtd integer; v_preco numeric; v_preco_atual numeric;
 v_qtd_matches integer; v_acao text; v_linha integer;
 v_amostras jsonb:='[]'::jsonb; v_contagem jsonb:='{}'::jsonb;
 v_usados uuid[]:=ARRAY[]::uuid[]; v_aprovados integer:=0;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id
  AND u.perfil='admin' AND u.ativo AND u.excluido_em IS NULL) THEN
  RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 10 THEN
  RAISE EXCEPTION 'Lote inválido (1 a 10)' USING ERRCODE='22023';
 END IF;
 IF NOT p_simular THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('queima_procfit_'||p_loja_id,0));
 END IF;
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_itens) LOOP
  v_linha:=nullif(item->>'linha','')::integer;
  v_codigo:=coalesce(nullif(pg_catalog.ltrim(pg_catalog.btrim(item->>'codigo_interno'),'0'),''),'0');
  v_data:=nullif(item->>'validade','')::date;
  v_preco:=nullif(item->>'preco_gondola','')::numeric;
  v_id:=NULL;v_estado:=NULL;v_preco_atual:=NULL;v_qtd_matches:=0;
  v_acao:='sem_correspondencia';
  IF (item->>'aprovado')='true' AND v_data IS NOT NULL AND v_codigo ~ '^[0-9]+$' THEN
   -- Confere somente registros existentes da própria loja e validade.
   -- Exige correspondência única para evitar aprovar o lote errado.
   SELECT count(*),(array_agg(q.id ORDER BY q.id))[1] INTO v_qtd_matches,v_id
   FROM public.queima q
   WHERE q.loja_id=p_loja_id AND q.excluido_em IS NULL AND q.validade=v_data
     AND (pg_catalog.ltrim(coalesce(q.codigo_interno,''),'0')=v_codigo
       OR EXISTS (SELECT 1 FROM public.produtos p WHERE p.ean=q.ean
        AND pg_catalog.ltrim(coalesce(p.codigo_interno,''),'0')=v_codigo));
   IF v_qtd_matches>1 THEN v_acao:='ambiguo';
   ELSIF v_qtd_matches=1 THEN
    SELECT q.estado,q.preco_gondola INTO v_estado,v_preco_atual
      FROM public.queima q WHERE q.id=v_id AND q.loja_id=p_loja_id;
    IF v_estado='aprovado' THEN v_acao:='ja_aprovado';
    ELSIF v_estado<>'pendente' THEN v_acao:='situacao_incompativel';
    ELSIF coalesce(v_preco,v_preco_atual) IS NULL THEN v_acao:='sem_preco';
    ELSE
     v_acao:='aprovar_existente';
     IF NOT p_simular THEN
      UPDATE public.queima q SET estado='aprovado',validade_gondola=coalesce(q.validade_gondola,v_data),
       preco_gondola=coalesce(q.preco_gondola,v_preco),atualizado_em=now()
      WHERE q.id=v_id AND q.loja_id=p_loja_id AND q.estado='pendente' AND q.excluido_em IS NULL;
      IF FOUND THEN v_aprovados:=v_aprovados+1;
      ELSE v_acao:='alterado_concorrentemente'; END IF;
     END IF;
    END IF;
   END IF;
  END IF;
  v_contagem:=pg_catalog.jsonb_set(v_contagem,ARRAY[v_acao],
   pg_catalog.to_jsonb(coalesce((v_contagem->>v_acao)::integer,0)+1),true);
  IF pg_catalog.jsonb_array_length(v_amostras)<100 THEN
   v_amostras:=v_amostras||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'linha',v_linha,'codigo_interno',item->>'codigo_interno','validade',v_data,'acao',v_acao));
  END IF;
 END LOOP;
 RETURN pg_catalog.jsonb_build_object('contagem',v_contagem,'amostras',v_amostras,
  'simulacao',p_simular,'aprovados',v_aprovados,'novos_cadastrados',0);
END $$;
REVOKE ALL ON FUNCTION public.conferir_aprovacoes_queima_v80(text,uuid,jsonb,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conferir_aprovacoes_queima_v80(text,uuid,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.excluir_queima_e_mapa_v80(
 p_loja_id text,p_usuario_id uuid,p_queima_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.queima%rowtype; m public.mapa_lancamentos%rowtype;
 v_funcionario boolean; v_nome text; v_mapa uuid;
BEGIN
 SELECT u.perfil='funcionario',u.nome INTO v_funcionario,v_nome FROM public.usuarios u
 WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id AND u.ativo AND u.excluido_em IS NULL
 AND u.perfil IN ('admin','funcionario');
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.queima WHERE id=p_queima_id AND loja_id=p_loja_id FOR UPDATE;
 IF q.id IS NULL OR q.excluido_em IS NOT NULL THEN
  RAISE EXCEPTION 'Queima inexistente ou excluída' USING ERRCODE='23514';END IF;
 IF q.lancamento_id IS NULL THEN
  RAISE EXCEPTION 'Sem vínculo único ao lançamento original: peça ao conferente para vincular o mapa antes de excluir'
   USING ERRCODE='23514';END IF;
 SELECT * INTO m FROM public.mapa_lancamentos WHERE id=q.lancamento_id AND loja_id=p_loja_id FOR UPDATE;
 IF m.id IS NULL OR m.excluido_em IS NOT NULL THEN
  RAISE EXCEPTION 'Mapa original indisponível; nenhuma exclusão realizada' USING ERRCODE='23514';END IF;
 IF v_funcionario AND (m.tipo_mapa<>'funcionario' OR
  (m.funcionario_id IS DISTINCT FROM p_usuario_id AND
   (m.funcionario_id IS NOT NULL OR lower(btrim(m.mapa_nome))<>lower(btrim(v_nome))))) THEN
  RAISE EXCEPTION 'Item pertence a outro funcionário' USING ERRCODE='42501';END IF;
 IF NOT v_funcionario AND m.tipo_mapa IN ('Termolabil','Psicotropicos','Antibioticos') THEN
  RAISE EXCEPTION 'Exclusão de aba especial bloqueada' USING ERRCODE='42501';END IF;
 IF q.validade IS DISTINCT FROM m.validade OR upper(btrim(coalesce(q.lote,'')))<>upper(btrim(coalesce(m.lote,'')))
  OR (q.ean IS DISTINCT FROM m.ean AND NOT EXISTS
   (SELECT 1 FROM public.produtos p WHERE p.id=m.produto_id AND
    pg_catalog.ltrim(coalesce(p.codigo_interno,''),'0')=pg_catalog.ltrim(coalesce(q.codigo_interno,''),'0')
    AND q.codigo_interno IS NOT NULL)) THEN
  RAISE EXCEPTION 'Produto/lote/validade divergentes: nenhuma exclusão realizada' USING ERRCODE='23514';END IF;
 -- Não permite apagar um mapa ainda vinculado a outra Queima ativa.
 IF EXISTS(SELECT 1 FROM public.queima q2 WHERE q2.loja_id=p_loja_id
  AND q2.lancamento_id=m.id AND q2.id<>q.id AND q2.excluido_em IS NULL) THEN
  RAISE EXCEPTION 'Mapa vinculado a outra Queima; solicite revisão do conferente' USING ERRCODE='23514';END IF;
 UPDATE public.queima SET excluido_em=now(),excluido_por=p_usuario_id,atualizado_em=now()
 WHERE id=q.id AND loja_id=p_loja_id AND excluido_em IS NULL;
 UPDATE public.mapa_lancamentos SET excluido_em=now(),excluido_por=p_usuario_id,atualizado_em=now()
 WHERE id=m.id AND loja_id=p_loja_id AND excluido_em IS NULL;
 RETURN pg_catalog.jsonb_build_object('queima_id',q.id,'mapa_id',m.id,'excluidos',true);
END $$;
REVOKE ALL ON FUNCTION public.excluir_queima_e_mapa_v80(text,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_queima_e_mapa_v80(text,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
