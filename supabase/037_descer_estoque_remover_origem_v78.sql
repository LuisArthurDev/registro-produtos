-- V78 — Ao descer completamente o Estoque, retirar o lançamento da lista ativa.
-- Mantém auditabilidade e idempotência. Transferências parciais retêm apenas o saldo.
-- Executar APÓS 019_descer_estoque_em_lote.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.descer_estoque(
 p_request_id text, p_origem_id uuid, p_destino text,
 p_quantidade integer, p_usuario_id uuid, p_loja_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_origem public.mapa_lancamentos%rowtype;
 v_destino public.mapa_lancamentos%rowtype;
 v_movimento public.movimentacoes_mapa%rowtype;
 v_funcionario_id uuid;
 v_saldo integer;
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
 v_saldo:=v_origem.quantidade-p_quantidade;
 -- Marcação lógica de retirada só quando todo o saldo foi transferido.
 UPDATE public.mapa_lancamentos SET
   quantidade=v_saldo,
   excluido_em=CASE WHEN v_saldo=0 THEN now() ELSE excluido_em END,
   excluido_por=CASE WHEN v_saldo=0 THEN p_usuario_id ELSE excluido_por END,
   atualizado_em=now()
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
 RETURN jsonb_build_object('sucesso',true,'id',v_destino.id,'idempotente',false,
   'saldo_estoque',v_saldo,'origem_retirada',v_saldo=0);
END $$;

REVOKE ALL ON FUNCTION public.descer_estoque(text,uuid,text,integer,uuid,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descer_estoque(text,uuid,text,integer,uuid,text) TO service_role;

-- Regulariza somente saldos zerados que possuam movimentação documentada.
-- Não altera registros de Estoque zerados por outros motivos.
UPDATE public.mapa_lancamentos m SET
  excluido_em=now(),
  excluido_por=(SELECT mov.responsavel_id FROM public.movimentacoes_mapa mov
      WHERE mov.origem_lancamento_id=m.id AND mov.loja_id=m.loja_id
      ORDER BY mov.criado_em DESC, mov.id DESC LIMIT 1),
  atualizado_em=now()
WHERE m.tipo_mapa='Estoque' AND m.excluido_em IS NULL AND m.quantidade=0
  AND EXISTS (SELECT 1 FROM public.movimentacoes_mapa mov
      WHERE mov.origem_lancamento_id=m.id AND mov.loja_id=m.loja_id);

NOTIFY pgrst, 'reload schema';
COMMIT;
