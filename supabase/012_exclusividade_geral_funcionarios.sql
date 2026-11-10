-- 012: Painel Geral exclusivo da conta Luis Arthur (Loja 151),
-- gestão auditável de funcionários e titularidade dos lançamentos.
-- DEPENDE das migrações 008, 010 e 011. Faça backup antes da implantação.
BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS titular_painel_geral boolean NOT NULL DEFAULT false;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS excluido_em timestamptz;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS nome_original_exclusao text;
CREATE UNIQUE INDEX IF NOT EXISTS unico_titular_painel_geral ON public.usuarios(titular_painel_geral)
  WHERE titular_painel_geral;
CREATE INDEX IF NOT EXISTS idx_mapas_funcionario_mes ON public.mapa_lancamentos(loja_id,funcionario_id,mes_lancamento)
  WHERE excluido_em IS NULL AND tipo_mapa='funcionario';

-- O identificador fica ancorado em uma conta real (UUID), não no nome enviado pelo cliente.
DO $$
DECLARE titular uuid; encontrados int;
BEGIN
 SELECT count(*) INTO encontrados FROM public.usuarios
 WHERE nome_normalizado='luis arthur' AND loja_id='151' AND perfil='admin' AND ativo=true AND excluido_em IS NULL;
 SELECT id INTO titular FROM public.usuarios
 WHERE nome_normalizado='luis arthur' AND loja_id='151' AND perfil='admin' AND ativo=true AND excluido_em IS NULL LIMIT 1;
 IF encontrados<>1 THEN
   RAISE EXCEPTION 'Exclusividade não aplicada: era esperada UMA conta ativa Luis Arthur, administrador da Loja 151, mas foram encontradas %.', encontrados;
 END IF;
 UPDATE public.usuarios SET titular_painel_geral=(id=titular),
   acesso_geral=(id=titular) WHERE titular_painel_geral IS DISTINCT FROM (id=titular)
   OR acesso_geral IS DISTINCT FROM (id=titular);
 -- Qualquer outra sessão anteriormente elevada ao Geral é imediatamente revogada.
 UPDATE public.sessoes SET modo_acesso='admin',modo_expira_em=NULL
 WHERE usuario_id<>titular AND modo_acesso='geral';
END $$;

CREATE OR REPLACE FUNCTION public.renomear_funcionario_v12(
 p_administrador uuid,p_loja text,p_funcionario uuid,p_nome text,p_nome_normalizado text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE alvo public.usuarios%ROWTYPE; qtd integer; ids_movidos uuid[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_administrador AND loja_id=p_loja AND perfil='admin' AND ativo=true AND excluido_em IS NULL)
 THEN RAISE EXCEPTION 'Permissão negada'; END IF;
 SELECT * INTO alvo FROM public.usuarios WHERE id=p_funcionario AND loja_id=p_loja
   AND perfil='funcionario' AND excluido_em IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado ou excluído'; END IF;
 IF p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 2 AND 120 OR
    p_nome_normalizado IS NULL OR length(trim(p_nome_normalizado))<2
 THEN RAISE EXCEPTION 'Nome inválido'; END IF;
 IF p_nome_normalizado=ANY(ARRAY['estoque','termolabil','psicotropicos','antibioticos','sem responsavel'])
 THEN RAISE EXCEPTION 'Nome reservado'; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE loja_id=p_loja AND nome_normalizado=p_nome_normalizado AND id<>p_funcionario)
 THEN RAISE EXCEPTION 'Já existe outro usuário com esse nome na loja'; END IF;
 UPDATE public.usuarios SET nome=trim(p_nome),nome_normalizado=p_nome_normalizado,atualizado_em=now()
 WHERE id=alvo.id;
 WITH alterados AS (
  UPDATE public.mapa_lancamentos SET funcionario_id=alvo.id,mapa_nome=trim(p_nome),atualizado_em=now()
  WHERE loja_id=p_loja AND tipo_mapa='funcionario' AND excluido_em IS NULL
    AND (funcionario_id=alvo.id OR (funcionario_id IS NULL AND mapa_nome=alvo.nome)) RETURNING id
 ) SELECT count(*),array_agg(id) INTO qtd,ids_movidos FROM alterados;
 -- A sessão antiga continua identificando o usuário por UUID, mas o navegador pode ter o nome antigo em cache.
 DELETE FROM public.sessoes WHERE usuario_id=alvo.id;
 INSERT INTO public.auditoria(loja_id,usuario_id,acao,dados)
 VALUES(p_loja,p_administrador,'renomear_funcionario',jsonb_build_object(
  'funcionario_id',alvo.id,'nome_anterior',alvo.nome,'nome_novo',trim(p_nome),'lancamentos_atualizados',qtd,'lancamentos_ids',ids_movidos));
 RETURN jsonb_build_object('sucesso',true,'quantidade',qtd);
END $$;

CREATE OR REPLACE FUNCTION public.excluir_funcionario_v12(
 p_administrador uuid,p_loja text,p_funcionario uuid,p_destino uuid,p_modo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE alvo public.usuarios%ROWTYPE; destino public.usuarios%ROWTYPE; qtd integer; ids_movidos uuid[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_administrador AND loja_id=p_loja AND perfil='admin' AND ativo=true AND excluido_em IS NULL)
 THEN RAISE EXCEPTION 'Permissão negada'; END IF;
 SELECT * INTO alvo FROM public.usuarios WHERE id=p_funcionario AND loja_id=p_loja AND perfil='funcionario'
   AND excluido_em IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado ou excluído'; END IF;
 IF p_modo IS NULL OR p_modo NOT IN ('transferir','flutuar') THEN RAISE EXCEPTION 'Escolha o destino dos lançamentos';END IF;
 IF p_modo='transferir' THEN
  SELECT * INTO destino FROM public.usuarios WHERE id=p_destino AND loja_id=p_loja
    AND perfil='funcionario' AND ativo=true AND excluido_em IS NULL FOR UPDATE;
  IF NOT FOUND OR destino.id=alvo.id THEN RAISE EXCEPTION 'Selecione outro funcionário ativo da mesma loja';END IF;
 ELSE
  IF p_destino IS NOT NULL THEN RAISE EXCEPTION 'Destino incompatível com a opção sem responsável';END IF;
 END IF;
 WITH movidos AS (
  UPDATE public.mapa_lancamentos SET funcionario_id=destino.id,
   mapa_nome=CASE WHEN p_modo='flutuar' THEN 'Sem responsável' ELSE destino.nome END,
   atualizado_em=now()
  WHERE loja_id=p_loja AND tipo_mapa='funcionario' AND excluido_em IS NULL
    AND (funcionario_id=alvo.id OR (funcionario_id IS NULL AND mapa_nome=alvo.nome)) RETURNING id
 ) SELECT count(*),array_agg(id) INTO qtd,ids_movidos FROM movidos;
 UPDATE public.usuarios SET ativo=false,excluido_em=now(),nome_original_exclusao=alvo.nome,
   nome=left('[Excluído] '||alvo.nome,75)||' · '||left(alvo.id::text,8),
   nome_normalizado='excluido-'||alvo.id::text,atualizado_em=now() WHERE id=alvo.id;
 DELETE FROM public.sessoes WHERE usuario_id=alvo.id;
 INSERT INTO public.auditoria(loja_id,usuario_id,acao,dados)
 VALUES(p_loja,p_administrador,'excluir_funcionario',jsonb_build_object(
  'funcionario_id',alvo.id,'nome_original',alvo.nome,'modo',p_modo,
  'destino_id',destino.id,'destino_nome',destino.nome,'lancamentos_movidos',qtd,'lancamentos_ids',ids_movidos));
 RETURN jsonb_build_object('sucesso',true,'quantidade',qtd,'modo',p_modo);
END $$;

CREATE OR REPLACE FUNCTION public.transferir_lancamentos_v12(
 p_administrador uuid,p_loja text,p_origem uuid,p_destino uuid,
 p_mes date,p_secao text,p_ids uuid[],p_todos boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origem public.usuarios%ROWTYPE;destino public.usuarios%ROWTYPE;qtd integer;ids_movidos uuid[];
DECLARE pedidos integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_administrador AND loja_id=p_loja AND perfil='admin' AND ativo=true AND excluido_em IS NULL)
 THEN RAISE EXCEPTION 'Permissão negada'; END IF;
 IF p_mes IS NULL OR extract(day from p_mes)<>1 THEN RAISE EXCEPTION 'Selecione um mês válido';END IF;
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
   AND m.mes_lancamento=p_mes
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
 IF qtd>2000 THEN RAISE EXCEPTION 'Mais de 2000 lançamentos; divida por mês ou seção';END IF;
 IF NOT coalesce(p_todos,false) AND qtd<>pedidos THEN RAISE EXCEPTION 'Alguns registros mudaram. Atualize a seleção e tente novamente';END IF;
 INSERT INTO public.auditoria(loja_id,usuario_id,acao,dados) VALUES(p_loja,p_administrador,'transferir_lancamentos',
  jsonb_build_object('origem_id',p_origem,'origem_nome',coalesce(origem.nome,'Sem responsável'),
   'destino_id',p_destino,'destino_nome',coalesce(destino.nome,'Sem responsável'),
   'mes',p_mes,'secao',p_secao,'todos_filtrados',p_todos,'quantidade',qtd,'lancamentos_ids',ids_movidos));
 RETURN jsonb_build_object('sucesso',true,'quantidade',qtd);
END $$;

REVOKE ALL ON FUNCTION public.renomear_funcionario_v12(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.excluir_funcionario_v12(uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.transferir_lancamentos_v12(uuid,text,uuid,uuid,date,text,uuid[],boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.renomear_funcionario_v12(uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.excluir_funcionario_v12(uuid,text,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transferir_lancamentos_v12(uuid,text,uuid,uuid,date,text,uuid[],boolean) TO service_role;
COMMIT;
