-- V32 — Descida de itens selecionados da aba Estoque em uma única transação.
-- Requer SQL 001 (descer_estoque) e a estrutura existente de movimentacoes_mapa.
-- Um erro em qualquer item cancela integralmente o lote.
BEGIN;
-- Corrige também a descida individual: funcionário_id no destino é o funcionário
-- que RECEBE o mapa; responsável da movimentação continua sendo o administrador.
CREATE OR REPLACE FUNCTION public.descer_estoque(
 p_request_id text, p_origem_id uuid, p_destino text,
 p_quantidade integer, p_usuario_id uuid, p_loja_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_origem public.mapa_lancamentos%rowtype;
 v_destino public.mapa_lancamentos%rowtype;
 v_movimento public.movimentacoes_mapa%rowtype;
 v_funcionario_id uuid;
BEGIN
 IF p_request_id IS NULL OR length(p_request_id)<8 OR p_quantidade IS NULL OR p_quantidade<1 THEN
   RAISE EXCEPTION 'Dados da descida inválidos' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id
  AND u.loja_id=p_loja_id AND u.perfil='admin' AND u.ativo=true AND u.excluido_em IS NULL) THEN
   RAISE EXCEPTION 'Apenas o administrador da loja pode movimentar este estoque' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_movimento FROM public.movimentacoes_mapa WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_movimento.loja_id<>p_loja_id OR v_movimento.origem_lancamento_id<>p_origem_id THEN
     RAISE EXCEPTION 'Identificador já usado para outra movimentação' USING ERRCODE='22023';
   END IF;
   RETURN jsonb_build_object('sucesso',true,'id',v_movimento.destino_lancamento_id,'idempotente',true);
 END IF;
 IF nullif(btrim(coalesce(p_destino,'')),'') IS NULL
  OR p_destino IN ('Estoque','Transferencias','Transferências') THEN
   RAISE EXCEPTION 'Mapa de destino inválido' USING ERRCODE='22023';
 END IF;
 IF p_destino IN ('Termolabil','Psicotropicos','Antibioticos') THEN
   v_funcionario_id:=NULL;
 ELSE
   SELECT u.id INTO v_funcionario_id FROM public.usuarios u
    WHERE u.loja_id=p_loja_id AND u.nome=p_destino AND u.perfil='funcionario'
      AND u.ativo=true AND u.excluido_em IS NULL LIMIT 1;
   IF v_funcionario_id IS NULL THEN
     RAISE EXCEPTION 'Funcionário de destino não encontrado ou inativo' USING ERRCODE='42501';
   END IF;
 END IF;
 SELECT * INTO v_origem FROM public.mapa_lancamentos
  WHERE id=p_origem_id AND loja_id=p_loja_id AND tipo_mapa='Estoque'
    AND excluido_em IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado na aba Estoque' USING ERRCODE='22023'; END IF;
 IF p_quantidade>v_origem.quantidade THEN
   RAISE EXCEPTION 'Quantidade superior ao disponível' USING ERRCODE='22023';
 END IF;
 UPDATE public.mapa_lancamentos SET quantidade=quantidade-p_quantidade,atualizado_em=now()
  WHERE id=v_origem.id;
 INSERT INTO public.mapa_lancamentos
  (loja_id,funcionario_id,mapa_nome,tipo_mapa,produto_id,ean,lote,validade,quantidade,mes_lancamento,request_id)
 VALUES(p_loja_id,v_funcionario_id,p_destino,
  CASE WHEN p_destino IN ('Termolabil','Psicotropicos','Antibioticos') THEN p_destino ELSE 'funcionario' END,
  v_origem.produto_id,v_origem.ean,v_origem.lote,v_origem.validade,p_quantidade,
  date_trunc('month',now() at time zone 'America/Sao_Paulo')::date,p_request_id)
 RETURNING * INTO v_destino;
 INSERT INTO public.movimentacoes_mapa
  (loja_id,origem_lancamento_id,destino_lancamento_id,quantidade,responsavel_id,request_id)
 VALUES(p_loja_id,v_origem.id,v_destino.id,p_quantidade,p_usuario_id,p_request_id);
 RETURN jsonb_build_object('sucesso',true,'id',v_destino.id,'idempotente',false);
END $$;
REVOKE ALL ON FUNCTION public.descer_estoque(text,uuid,text,integer,uuid,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descer_estoque(text,uuid,text,integer,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.descer_estoque_lote(
 p_request_id text,
 p_origem_ids uuid[],
 p_destino text,
 p_usuario_id uuid,
 p_loja_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_contagem integer;
 v_req text;
 v_destino text;
 v_origem record;
 v_linha record;
 v_resultado jsonb;
 v_unidades bigint := 0;
 v_ja_movimentados integer := 0;
 v_movimentados integer := 0;
BEGIN
 v_contagem:=coalesce(array_length(p_origem_ids,1),0);
 v_destino:=btrim(coalesce(p_destino,''));
 IF v_contagem < 1 OR v_contagem > 500 THEN
   RAISE EXCEPTION 'Selecione entre 1 e 500 registros por operação' USING ERRCODE='22023';
 END IF;
 IF p_request_id IS NULL OR length(p_request_id)<16 OR length(p_request_id)>100 THEN
   RAISE EXCEPTION 'Identificador da operação inválido' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id
  AND u.loja_id=p_loja_id AND u.perfil='admin' AND u.ativo=true AND u.excluido_em IS NULL) THEN
   RAISE EXCEPTION 'Apenas o administrador da loja pode mover o estoque' USING ERRCODE='42501';
 END IF;
 IF v_destino IN ('','Estoque','Transferencias','Transferências') THEN
   RAISE EXCEPTION 'Mapa de destino inválido' USING ERRCODE='22023';
 END IF;
 IF v_destino NOT IN ('Termolabil','Psicotropicos','Antibioticos') AND NOT EXISTS (
   SELECT 1 FROM public.usuarios u WHERE u.loja_id=p_loja_id AND u.nome=v_destino
     AND u.perfil='funcionario' AND u.ativo=true AND u.excluido_em IS NULL
 ) THEN
   RAISE EXCEPTION 'Funcionário de destino não encontrado ou inativo' USING ERRCODE='42501';
 END IF;
 IF (SELECT count(*) FROM (SELECT DISTINCT id FROM unnest(p_origem_ids) AS t(id)) AS ids)<>v_contagem THEN
   RAISE EXCEPTION 'O lote contém itens repetidos' USING ERRCODE='22023';
 END IF;
 IF EXISTS (SELECT 1 FROM unnest(p_origem_ids) x WHERE x IS NULL) THEN
   RAISE EXCEPTION 'O lote contém um identificador inválido' USING ERRCODE='22023';
 END IF;

 -- Bloqueio dos originais numa ordem estável para impedir movimentos simultâneos
 -- conflitantes. O índice ordinal vem da lista original e permanece em reenvios.
 FOR v_linha IN SELECT id, ordem FROM unnest(p_origem_ids) WITH ORDINALITY AS x(id,ordem) ORDER BY id LOOP
   v_req:=p_request_id||'-'||v_linha.ordem::text;
   -- Já concluído em uma tentativa anterior de MESMO requestId: não descontar novamente.
   IF EXISTS (SELECT 1 FROM public.movimentacoes_mapa m WHERE m.request_id=v_req
     AND m.loja_id=p_loja_id AND m.origem_lancamento_id=v_linha.id) THEN
     v_ja_movimentados:=v_ja_movimentados+1;
     CONTINUE;
   END IF;

   SELECT id,quantidade INTO v_origem FROM public.mapa_lancamentos m
   WHERE m.id=v_linha.id AND m.loja_id=p_loja_id AND m.tipo_mapa='Estoque'
     AND m.excluido_em IS NULL FOR UPDATE;
   IF NOT FOUND THEN
     RAISE EXCEPTION 'Um produto selecionado não pertence ao Estoque desta loja' USING ERRCODE='22023';
   END IF;
   IF v_origem.quantidade IS NULL OR v_origem.quantidade<=0 OR v_origem.quantidade>999999 THEN
     RAISE EXCEPTION 'Um produto não possui quantidade disponível no Estoque' USING ERRCODE='22023';
   END IF;

   -- A função existente movimenta o registro original e cria um novo lançamento,
   -- além de registrar a movimentação e garantir idempotência por requestId.
   SELECT public.descer_estoque(v_req,v_linha.id,v_destino,v_origem.quantidade,p_usuario_id,p_loja_id)
   INTO v_resultado;
   IF v_resultado->>'sucesso' IS DISTINCT FROM 'true' THEN
     RAISE EXCEPTION 'Movimentação não confirmada no banco' USING ERRCODE='22023';
   END IF;
   v_movimentados:=v_movimentados+1;
   v_unidades:=v_unidades+v_origem.quantidade;
 END LOOP;
 RETURN jsonb_build_object('sucesso',true,'movimentados',v_movimentados+v_ja_movimentados,
  'novos',v_movimentados,'idempotentes',v_ja_movimentados,'unidades_novas',v_unidades,
  'mapa_destino',v_destino);
END $$;
REVOKE ALL ON FUNCTION public.descer_estoque_lote(text,uuid[],text,uuid,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descer_estoque_lote(text,uuid[],text,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
