-- V76: Importação XLS abre conferência específica do Registro Procfit.
-- O mapa é preservado; só o vínculo é gravado, salvo exclusão EXPLÍCITA de outros mapas.
BEGIN;
CREATE OR REPLACE FUNCTION public.conferir_queima_mapa_v76(p_loja_id text,p_usuario_id uuid,p_registro text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id AND u.ativo AND u.perfil='admin')
 THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF p_registro IS NOT NULL AND p_registro !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'Registro inválido'; END IF;
 WITH pares AS (
 SELECT q.id AS queima_id,q.lancamento_id,q.registro_queima,m.id AS mapa_id,m.mapa_nome,m.tipo_mapa,
 q.ean,q.codigo_interno,coalesce(nullif(q.descricao_original,''),nullif(q.produto_relatorio,''),p.descricao,'Descrição não disponível') AS descricao,
 q.lote,q.validade,q.quantidade AS quantidade_queima,m.quantidade AS quantidade_mapa,
 (m.tipo_mapa IN ('Termolabil','Psicotropicos','Antibioticos') OR m.mapa_nome IN ('Termolabil','Psicotropicos','Antibioticos')) AS aba_protegida
 FROM public.queima q JOIN public.mapa_lancamentos m ON m.loja_id=q.loja_id AND m.excluido_em IS NULL AND m.quantidade>0
 AND upper(btrim(coalesce(m.lote,'')))=upper(btrim(coalesce(q.lote,''))) AND m.validade=q.validade
 AND ((nullif(btrim(q.ean),'') IS NOT NULL AND m.ean=q.ean) OR (nullif(btrim(q.codigo_interno),'') IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.produtos px WHERE px.id=m.produto_id AND px.codigo_interno=q.codigo_interno)))
 LEFT JOIN public.produtos p ON p.id=m.produto_id
 WHERE q.loja_id=p_loja_id AND q.excluido_em IS NULL AND (p_registro IS NULL OR q.registro_queima::text=p_registro)
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM pares),
 'itens',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM pares ORDER BY validade,queima_id,mapa_nome,mapa_id LIMIT 1500)t),'[]'::jsonb)) INTO v_result;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.vincular_queima_mapa_v76(p_loja_id text,p_usuario_id uuid,p_queima_id uuid,p_mapa_id uuid,p_excluir_outros boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.queima%rowtype;m public.mapa_lancamentos%rowtype;v_outros integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id AND u.ativo AND u.perfil='admin')
 THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.queima WHERE id=p_queima_id AND loja_id=p_loja_id FOR UPDATE;
 SELECT * INTO m FROM public.mapa_lancamentos WHERE id=p_mapa_id AND loja_id=p_loja_id FOR UPDATE;
 IF q.id IS NULL OR m.id IS NULL OR q.excluido_em IS NOT NULL OR m.excluido_em IS NOT NULL
 OR q.validade IS DISTINCT FROM m.validade OR upper(btrim(coalesce(q.lote,'')))<>upper(btrim(coalesce(m.lote,'')))
 THEN RAISE EXCEPTION 'Registros alterados ou não compatíveis' USING ERRCODE='23514';END IF;
 IF q.ean IS DISTINCT FROM m.ean AND NOT EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=m.produto_id AND p.codigo_interno=q.codigo_interno)
 THEN RAISE EXCEPTION 'EAN/código interno incompatível' USING ERRCODE='23514'; END IF;
 IF m.tipo_mapa IN ('Termolabil','Psicotropicos','Antibioticos') OR m.mapa_nome IN ('Termolabil','Psicotropicos','Antibioticos')
 THEN RAISE EXCEPTION 'Aba especial protegida' USING ERRCODE='23514'; END IF;
 -- Nenhuma quantidade ou validade é alterada no mapa.
 UPDATE public.queima SET lancamento_id=m.id,origem_mapa=m.mapa_nome,atualizado_em=now() WHERE id=q.id;
 IF p_excluir_outros THEN
 WITH d AS (
  UPDATE public.mapa_lancamentos m2 SET excluido_em=now(),excluido_por=p_usuario_id,atualizado_em=now()
  WHERE m2.loja_id=p_loja_id AND m2.id<>m.id AND m2.excluido_em IS NULL
  AND m2.validade=q.validade AND upper(btrim(coalesce(m2.lote,'')))=upper(btrim(coalesce(q.lote,'')))
  AND ((nullif(btrim(q.ean),'') IS NOT NULL AND m2.ean=q.ean) OR (nullif(btrim(q.codigo_interno),'') IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.produtos px WHERE px.id=m2.produto_id AND px.codigo_interno=q.codigo_interno)))
  AND m2.tipo_mapa NOT IN ('Termolabil','Psicotropicos','Antibioticos')
  AND m2.mapa_nome NOT IN ('Termolabil','Psicotropicos','Antibioticos')
  AND NOT EXISTS (SELECT 1 FROM public.queima q2 WHERE q2.lancamento_id=m2.id AND q2.id<>q.id AND q2.excluido_em IS NULL) RETURNING m2.id
 ) SELECT count(*) INTO v_outros FROM d;
 END IF;
 RETURN jsonb_build_object('vinculado',true,'queima_id',q.id,'mapa_mantido',m.id,'quantidade_mapa_inalterada',m.quantidade,'outros_mapas_arquivados',v_outros);
END $$;

CREATE OR REPLACE FUNCTION public.sinalizacoes_mapa_queima_v76(p_loja_id text,p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id AND u.ativo)
 THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(t.id),'[]'::jsonb) INTO v_result FROM (
 SELECT DISTINCT m.id FROM public.mapa_lancamentos m
 JOIN public.queima q ON q.loja_id=m.loja_id AND q.excluido_em IS NULL AND q.validade=m.validade
 AND upper(btrim(coalesce(q.lote,'')))=upper(btrim(coalesce(m.lote,'')))
 AND (q.lancamento_id=m.id OR (nullif(btrim(q.ean),'') IS NOT NULL AND q.ean=m.ean) OR (nullif(btrim(q.codigo_interno),'') IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.produtos p WHERE p.id=m.produto_id AND p.codigo_interno=q.codigo_interno)))
 WHERE m.loja_id=p_loja_id AND m.excluido_em IS NULL AND
 (EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.perfil='admin') OR m.funcionario_id=p_usuario_id OR m.mapa_nome=(SELECT u.nome FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id))
 )t;
 RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.conferir_queima_mapa_v76(text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.vincular_queima_mapa_v76(text,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sinalizacoes_mapa_queima_v76(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conferir_queima_mapa_v76(text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vincular_queima_mapa_v76(text,uuid,uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.sinalizacoes_mapa_queima_v76(text,uuid) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';

-- Recuperação conservadora: consulta registros de conferência ANTIGA,
-- não restaura nada sem seleção e confirmação de um caso específico.
CREATE OR REPLACE FUNCTION public.recuperar_conferencia_antiga_v76(
 p_loja_id text,p_usuario_id uuid,p_auditoria_id bigint DEFAULT NULL,p_confirmar boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.auditoria%rowtype; m public.mapa_lancamentos%rowtype;
 q public.queima%rowtype; v_movida int;v_restante int;v_apto boolean;
 v_lista jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id AND u.ativo AND u.perfil='admin')
 THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';END IF;
 IF p_auditoria_id IS NULL THEN
  WITH evidencias AS (
   SELECT DISTINCT ON (a.dados->>'mapa_id') a.id AS auditoria_id,a.criado_em,
    a.dados->>'mapa_id' AS mapa_id,a.dados->>'queima_id' AS queima_id,
    (a.dados->'resultado'->>'quantidade_movida')::int AS quantidade_movida,
    (a.dados->'resultado'->>'quantidade_restante_mapa')::int AS quantidade_restante
   FROM public.auditoria a WHERE a.loja_id=p_loja_id AND a.acao='corrigir_duplicidade_queima_mapa'
    AND a.dados ? 'resultado' AND a.dados->'resultado' ? 'quantidade_movida'
    AND a.dados->>'mapa_id' ~ '^[0-9a-f-]{36}$'
    AND a.dados->>'queima_id' ~ '^[0-9a-f-]{36}$'
   ORDER BY a.dados->>'mapa_id',a.criado_em DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'auditoria_id',e.auditoria_id,'mapa_id',e.mapa_id,'queima_id',e.queima_id,
   'mapa_nome',m.mapa_nome,'ean',m.ean,'lote',m.lote,'validade',m.validade,
   'quantidade_atual',m.quantidade,'quantidade_movida',e.quantidade_movida,
   'pode_recuperar',(m.id IS NOT NULL AND q.id IS NOT NULL AND q.lancamento_id=m.id
     AND m.quantidade=e.quantidade_restante AND q.quantidade=e.quantidade_movida AND e.quantidade_movida>0
     AND m.atualizado_em<=e.criado_em AND m.atualizado_em>=e.criado_em-interval '10 minutes'
     AND NOT EXISTS (SELECT 1 FROM public.auditoria x WHERE x.loja_id=p_loja_id
       AND x.acao='recuperar_conferencia_antiga_v76' AND x.dados->>'auditoria_original_id'=e.auditoria_id::text)),
   'excluido_atualmente',m.excluido_em IS NOT NULL)),'[]'::jsonb)
  INTO v_lista
  FROM (SELECT * FROM evidencias ORDER BY criado_em DESC LIMIT 200)e
  LEFT JOIN public.mapa_lancamentos m ON m.id=e.mapa_id::uuid AND m.loja_id=p_loja_id
  LEFT JOIN public.queima q ON q.id=e.queima_id::uuid AND q.loja_id=p_loja_id;
  RETURN jsonb_build_object('itens',v_lista);
 END IF;
 SELECT * INTO a FROM public.auditoria WHERE id=p_auditoria_id AND loja_id=p_loja_id
  AND acao='corrigir_duplicidade_queima_mapa' FOR UPDATE;
 IF a.id IS NULL OR NOT (a.dados->'resultado' ? 'quantidade_movida')
 THEN RAISE EXCEPTION 'Auditoria antiga não encontrada ou incompleta'; END IF;
 SELECT * INTO m FROM public.mapa_lancamentos
  WHERE id=(a.dados->>'mapa_id')::uuid AND loja_id=p_loja_id FOR UPDATE;
 SELECT * INTO q FROM public.queima
  WHERE id=(a.dados->>'queima_id')::uuid AND loja_id=p_loja_id FOR UPDATE;
 v_movida=(a.dados->'resultado'->>'quantidade_movida')::int;
 v_restante=(a.dados->'resultado'->>'quantidade_restante_mapa')::int;
 v_apto=m.id IS NOT NULL AND q.id IS NOT NULL AND q.lancamento_id=m.id
  AND m.quantidade=v_restante AND q.quantidade=v_movida AND v_movida>0 AND m.atualizado_em<=a.criado_em AND m.atualizado_em>=a.criado_em-interval '10 minutes'
  AND NOT EXISTS(SELECT 1 FROM public.auditoria x WHERE x.loja_id=p_loja_id
   AND x.acao='recuperar_conferencia_antiga_v76' AND x.dados->>'auditoria_original_id'=a.id::text);
 IF NOT v_apto THEN RAISE EXCEPTION 'Registro já modificado, recuperado ou sem evidência suficiente. Revisão manual necessária.' USING ERRCODE='23514';END IF;
 IF NOT p_confirmar THEN RETURN jsonb_build_object('pode_recuperar',true,'mapa_id',m.id,
  'quantidade_atual',m.quantidade,'quantidade_recuperada',v_movida); END IF;
 -- Somente a movimentação indevida é revertida. O produto da Queima continua intacto.
 UPDATE public.mapa_lancamentos SET quantidade=quantidade+v_movida,
  excluido_em=NULL,excluido_por=NULL,
  retirada_loja_em=CASE WHEN excluido_em IS NOT NULL THEN NULL ELSE retirada_loja_em END,
  retirada_loja_por=CASE WHEN excluido_em IS NOT NULL THEN NULL ELSE retirada_loja_por END,
  atualizado_em=now() WHERE id=m.id;
 INSERT INTO public.auditoria(loja_id,usuario_id,acao,dados)
 VALUES(p_loja_id,p_usuario_id,'recuperar_conferencia_antiga_v76',
  jsonb_build_object('auditoria_original_id',a.id,'mapa_id',m.id,'queima_id',q.id,
   'quantidade_recuperada',v_movida,'quantidade_anterior',m.quantidade));
 RETURN jsonb_build_object('recuperado',true,'mapa_id',m.id,'quantidade_anterior',m.quantidade,
  'quantidade_restaurada',m.quantidade+v_movida);
END $$;
REVOKE ALL ON FUNCTION public.recuperar_conferencia_antiga_v76(text,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recuperar_conferencia_antiga_v76(text,uuid,bigint,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
