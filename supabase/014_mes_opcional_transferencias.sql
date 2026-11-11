-- V21: filtro de mês opcional na transferência de lançamentos.
-- NULL significa todos os meses. Restrições de mesma loja, seleção e auditoria preservadas.
-- Execute após 012 e antes de utilizar transferência sem mês.
BEGIN;
CREATE OR REPLACE FUNCTION public.transferir_lancamentos_v12(
 p_administrador uuid,p_loja text,p_origem uuid,p_destino uuid,
 p_mes date,p_secao text,p_ids uuid[],p_todos boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origem public.usuarios%ROWTYPE;destino public.usuarios%ROWTYPE;qtd integer;ids_movidos uuid[];
DECLARE pedidos integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_administrador AND loja_id=p_loja AND perfil='admin' AND ativo=true AND excluido_em IS NULL)
 THEN RAISE EXCEPTION 'Permissão negada'; END IF;
 IF p_mes IS NOT NULL AND extract(day from p_mes)<>1 THEN RAISE EXCEPTION 'Mês informado inválido';END IF;
 IF p_origem IS NULL AND p_destino IS NULL THEN RAISE EXCEPTION 'Escolha um destino para itens sem responsável';END IF;
 IF p_origem IS NOT NULL THEN
  SELECT * INTO origem FROM public.usuarios WHERE id=p_origem AND loja_id=p_loja
    AND perfil='funcionario' AND excluido_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário de origem não encontrado';END IF;
 END IF;
 IF p_destino IS NOT NULL THEN
  SELECT * INTO destino FROM public.usuarios WHERE id=p_destino AND loja_id=p_loja AND perfil='funcionario'
    AND ativo=true AND excluido_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário de destino precisa estar ativo na mesma loja';END IF;
 END IF;
 IF p_origem IS NOT DISTINCT FROM p_destino THEN RAISE EXCEPTION 'Origem e destino não podem ser iguais';END IF;
 pedidos:=coalesce(cardinality(p_ids),0);
 IF NOT coalesce(p_todos,false) AND (pedidos<1 OR pedidos>1000) THEN
  RAISE EXCEPTION 'Selecione de 1 a 1000 registros ou escolha todos os filtrados';END IF;
 IF NOT coalesce(p_todos,false) AND pedidos<>coalesce((SELECT count(DISTINCT items.id) FROM unnest(p_ids) AS items(id)),0)
 THEN RAISE EXCEPTION 'Seleção contém lançamentos repetidos'; END IF;
 WITH candidatos AS (
  SELECT m.id FROM public.mapa_lancamentos m
  LEFT JOIN public.produtos p ON p.id=m.produto_id
  LEFT JOIN public.produtos pe ON pe.ean=m.ean AND m.produto_id IS NULL
  WHERE m.loja_id=p_loja AND m.tipo_mapa='funcionario' AND m.excluido_em IS NULL
   AND (p_mes IS NULL OR m.mes_lancamento=p_mes)
   AND ((p_origem IS NULL AND m.funcionario_id IS NULL AND m.mapa_nome='Sem responsável')
    OR (p_origem IS NOT NULL AND (m.funcionario_id=p_origem OR
      (m.funcionario_id IS NULL AND m.mapa_nome=origem.nome))))
   AND (coalesce(trim(p_secao),'')='' OR lower(trim(coalesce(p.secao,pe.secao,'')))=lower(trim(p_secao)))
   AND (coalesce(p_todos,false) OR m.id=ANY(p_ids))
  FOR UPDATE OF m
 ), movidos AS (
  UPDATE public.mapa_lancamentos m
  SET funcionario_id=p_destino,
   mapa_nome=CASE WHEN p_destino IS NULL THEN 'Sem responsável' ELSE destino.nome END,
   atualizado_em=now()
  FROM candidatos c WHERE m.id=c.id RETURNING m.id
 ) SELECT count(*),array_agg(id) INTO qtd,ids_movidos FROM movidos;
 IF qtd=0 THEN RAISE EXCEPTION 'Nenhum lançamento correspondente aos filtros';END IF;
 IF qtd>2000 THEN RAISE EXCEPTION 'Mais de 2000 lançamentos; use os filtros de mês/seção ou selecione itens específicos';END IF;
 IF NOT coalesce(p_todos,false) AND qtd<>pedidos THEN RAISE EXCEPTION 'Alguns registros mudaram. Atualize a seleção e tente novamente';END IF;
 INSERT INTO public.auditoria(loja_id,usuario_id,acao,dados) VALUES(p_loja,p_administrador,'transferir_lancamentos',
  jsonb_build_object('origem_id',p_origem,'origem_nome',coalesce(origem.nome,'Sem responsável'),
   'destino_id',p_destino,'destino_nome',coalesce(destino.nome,'Sem responsável'),
   'mes',p_mes,'secao',p_secao,'todos_filtrados',p_todos,'quantidade',qtd,'lancamentos_ids',ids_movidos));
 RETURN jsonb_build_object('sucesso',true,'quantidade',qtd);
END $$;

REVOKE ALL ON FUNCTION public.transferir_lancamentos_v12(uuid,text,uuid,uuid,date,text,uuid[],boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_lancamentos_v12(uuid,text,uuid,uuid,date,text,uuid[],boolean) TO service_role;
COMMIT;
