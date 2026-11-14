-- v40: importação do relatório XLS do Procfit, Registro da Queima,
-- gôndola apenas na aprovação e bloqueio de produto vencido na criação.
-- Aditiva, idempotente e sem apagar registros históricos.
BEGIN;
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS registro_queima text;
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS linha_importada integer;
CREATE UNIQUE INDEX IF NOT EXISTS uq_queima_xls_linha_v40
 ON public.queima(loja_id,registro_queima,linha_importada)
 WHERE registro_queima IS NOT NULL AND linha_importada IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_queima_registro_v40 ON public.queima(loja_id,registro_queima);
COMMENT ON COLUMN public.queima.registro_queima IS 'Número da solicitação Procfit, extraído de Queima-166240.xls';
COMMENT ON COLUMN public.queima.linha_importada IS 'Linha física do relatório Procfit; permite importar linhas repetidas e evita duplicações em reenvios';

-- Validade vencida = calendário anterior à data atual da loja (São Paulo).
-- Uma validade igual a hoje ainda não está vencida.
CREATE OR REPLACE FUNCTION public.bloquear_queima_vencida_v40()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.validade IS NULL OR NEW.validade < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
  RAISE EXCEPTION 'Produto vencido ou sem validade: não pode ser lançado na Queima'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_bloquear_queima_vencida_v40 ON public.queima;
CREATE TRIGGER tg_bloquear_queima_vencida_v40 BEFORE INSERT ON public.queima
FOR EACH ROW EXECUTE FUNCTION public.bloquear_queima_vencida_v40();

-- Apenas aprovação tem preços e validade da gôndola; bloqueia gravações
-- aprovadas incompletas também em rotas legadas.
CREATE OR REPLACE FUNCTION public.exigir_gondola_aprovacao_v40()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.estado='aprovado' AND (NEW.preco_gondola IS NULL OR NEW.validade_gondola IS NULL
   OR NEW.preco_gondola < 0) THEN
  RAISE EXCEPTION 'Informe a validade e o preço da gôndola ao aprovar a Queima'
   USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.estado='aprovado' THEN
  RAISE EXCEPTION 'Novo lançamento na Queima deve ser pendente' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_exigir_gondola_aprovacao_v40 ON public.queima;
CREATE TRIGGER tg_exigir_gondola_aprovacao_v40 BEFORE INSERT OR UPDATE ON public.queima
FOR EACH ROW EXECUTE FUNCTION public.exigir_gondola_aprovacao_v40();

-- Lançamento do mapa: número da solicitação obrigatório, sem dados de gôndola.
CREATE OR REPLACE FUNCTION public.encaminhar_mapa_queima_v40(
 p_loja_id text,p_usuario_id uuid,p_ids uuid[],p_registro text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.mapa_lancamentos%rowtype;
inseridos integer:=0;ignorados integer:=0;
BEGIN
 IF p_registro !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'Registro da Queima inválido' USING ERRCODE='22023'; END IF;
 IF coalesce(array_length(p_ids,1),0) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Selecione de 1 a 100 produtos' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT x) FROM unnest(p_ids) AS u(x)) <> array_length(p_ids,1) THEN
  RAISE EXCEPTION 'Há IDs repetidos na seleção' USING ERRCODE='22023';END IF;
 IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id
  AND u.perfil='admin' AND u.ativo=true) THEN RAISE EXCEPTION 'Usuário não autorizado' USING ERRCODE='42501';END IF;
 IF (SELECT count(*) FROM public.mapa_lancamentos WHERE loja_id=p_loja_id AND id=ANY(p_ids) AND excluido_em IS NULL) <> array_length(p_ids,1) THEN
  RAISE EXCEPTION 'Algum lançamento não pertence à loja' USING ERRCODE='22023';END IF;
 FOR item IN SELECT * FROM public.mapa_lancamentos WHERE loja_id=p_loja_id AND id=ANY(p_ids)
  AND excluido_em IS NULL ORDER BY id FOR UPDATE LOOP
  IF item.validade IS NULL OR item.validade < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
   RAISE EXCEPTION 'Há produto vencido na seleção. Remova-o antes de lançar a Queima' USING ERRCODE='23514';END IF;
  IF item.tipo_mapa IN ('Termolabil','Psicotropicos','Antibioticos') OR item.mapa_nome IN ('Termolabil','Psicotropicos','Antibioticos') THEN
   RAISE EXCEPTION 'Aba especial bloqueada para Queima' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM public.produtos p WHERE p.ean=item.ean AND p.formula_especial) THEN
   RAISE EXCEPTION 'Fórmula Especial bloqueada para Queima' USING ERRCODE='23514';END IF;
  IF item.quantidade<=0 OR EXISTS(SELECT 1 FROM public.queima q WHERE q.loja_id=p_loja_id
   AND q.lancamento_id=item.id AND q.estado IN('pendente','aprovado')) THEN
   ignorados:=ignorados+1;CONTINUE;END IF;
  INSERT INTO public.queima(loja_id,lancamento_id,ean,lote,validade,quantidade,motivo,estado,
   origem_mapa,usuario_id,registro_queima)
  VALUES(p_loja_id,item.id,item.ean,item.lote,item.validade,item.quantidade,'4','pendente',item.mapa_nome,p_usuario_id,p_registro);
  inseridos:=inseridos+1;
 END LOOP;
 RETURN jsonb_build_object('processados',inseridos,'ignorados',ignorados,'registro',p_registro);
END $$;
REVOKE ALL ON FUNCTION public.encaminhar_mapa_queima_v40(text,uuid,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.encaminhar_mapa_queima_v40(text,uuid,uuid[],text) TO service_role;

-- Importa todas as linhas válidas, preservando repetições como linhas distintas.
-- Produtos vencidos são IGNORADOS, sem gravar. Reimportar o mesmo XLS é idempotente.
CREATE OR REPLACE FUNCTION public.importar_queima_xls_v40(
 p_loja_id text,p_usuario_id uuid,p_registro text,p_itens jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE raw jsonb;codigo text;ean text;ean_lido text;
lote text;validade date;qtd integer;motivo integer;linha integer;
qtd_linhas integer;qtd_catalogo integer;especial boolean;
importados integer:=0;vencidos integer:=0;duplicados integer:=0;
sem_catalogo integer:=0;formulas integer:=0;invalidos integer:=0;abas_especiais integer:=0;
novo_id uuid;
BEGIN
 IF p_registro !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'Registro da Queima inválido' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 3000 THEN
  RAISE EXCEPTION 'Envie de 1 a 3000 linhas XLS' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id
   AND u.perfil='admin' AND u.ativo=true) THEN RAISE EXCEPTION 'Usuário não autorizado' USING ERRCODE='42501'; END IF;
 FOR raw IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  IF jsonb_typeof(raw) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Linha XLS inválida' USING ERRCODE='22023';END IF;
  codigo:=trim(raw->>'codigo_interno');ean_lido:=trim(raw->>'ean');
  lote:=trim(raw->>'lote');linha:=(raw->>'linha')::integer;
  qtd:=(raw->>'quantidade')::integer;motivo:=(raw->>'motivo')::integer;
  IF (raw->>'validade') IS NULL OR (raw->>'validade') !~ '^\d{4}-\d{2}-\d{2}$' THEN
   invalidos:=invalidos+1;CONTINUE;END IF;
  validade:=(raw->>'validade')::date;
  IF motivo IS DISTINCT FROM 4 OR qtd IS NULL OR qtd<=0 OR qtd>999999 OR linha<2
    OR linha IS NULL OR lote IS NULL OR lote='' OR length(lote)>100
    OR (coalesce(codigo,'')='' AND coalesce(ean_lido,'')='') THEN
   invalidos:=invalidos+1;CONTINUE;END IF;
  IF validade < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
   vencidos:=vencidos+1;CONTINUE;END IF;
  IF EXISTS(SELECT 1 FROM public.queima q WHERE q.loja_id=p_loja_id AND q.registro_queima=p_registro AND q.linha_importada=linha) THEN
   duplicados:=duplicados+1;CONTINUE;END IF;
  -- Prioridade do relatório Procfit: Produto é Código Interno. EAN pode vir em branco.
  IF coalesce(codigo,'')<>'' THEN
    SELECT count(DISTINCT p.ean),min(p.ean) INTO qtd_catalogo,ean
    FROM public.produtos p WHERE ltrim(coalesce(p.codigo_interno,''),'0')=ltrim(codigo,'0');
    IF qtd_catalogo<>1 THEN sem_catalogo:=sem_catalogo+1;CONTINUE;END IF;
    IF ean_lido<>'' AND ean_lido IS NOT NULL AND ean_lido IS DISTINCT FROM ean THEN
      invalidos:=invalidos+1;CONTINUE;END IF;
  ELSE
    ean:=ean_lido;
  END IF;
  IF ean !~ '^\d{8,14}$' OR NOT EXISTS(SELECT 1 FROM public.produtos p WHERE p.ean=ean) THEN
   sem_catalogo:=sem_catalogo+1;CONTINUE;END IF;
  SELECT coalesce(p.formula_especial,false) INTO especial FROM public.produtos p WHERE p.ean=ean LIMIT 1;
  IF especial THEN formulas:=formulas+1;CONTINUE;END IF;
  -- Mesmo por XLS, não contornar a restrição de abas especiais do mapa:
  -- apenas produtos com pelo menos uma origem comum/Estoque podem entrar.
  IF EXISTS(SELECT 1 FROM public.mapa_lancamentos m WHERE m.loja_id=p_loja_id AND m.ean=ean
     AND m.excluido_em IS NULL AND (m.tipo_mapa IN('Termolabil','Psicotropicos','Antibioticos')
     OR m.mapa_nome IN('Termolabil','Psicotropicos','Antibioticos')))
  AND NOT EXISTS(SELECT 1 FROM public.mapa_lancamentos m WHERE m.loja_id=p_loja_id AND m.ean=ean
     AND m.excluido_em IS NULL AND coalesce(m.tipo_mapa,'') NOT IN('Termolabil','Psicotropicos','Antibioticos')
     AND coalesce(m.mapa_nome,'') NOT IN('Termolabil','Psicotropicos','Antibioticos')) THEN
    abas_especiais:=abas_especiais+1;CONTINUE;
  END IF;
  novo_id:=NULL;
  INSERT INTO public.queima(loja_id,ean,lote,validade,quantidade,motivo,estado,origem_mapa,
     usuario_id,registro_queima,linha_importada)
  VALUES(p_loja_id,ean,lote,validade,qtd,'4','pendente','XLS Procfit',p_usuario_id,p_registro,linha)
  ON CONFLICT DO NOTHING RETURNING id INTO novo_id;
  IF novo_id IS NULL THEN duplicados:=duplicados+1;ELSE importados:=importados+1;END IF;
 END LOOP;
 RETURN jsonb_build_object('registro',p_registro,'importados',importados,
  'ignorados_vencidos',vencidos,'ignorados_duplicados',duplicados,
  'ignorados_sem_catalogo',sem_catalogo,'ignorados_formula_especial',formulas,
  'ignorados_invalidos',invalidos,'ignorados_abas_especiais',abas_especiais,'total',jsonb_array_length(p_itens));
END $$;
REVOKE ALL ON FUNCTION public.importar_queima_xls_v40(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.importar_queima_xls_v40(text,uuid,text,jsonb) TO service_role;

-- No relançamento mantém o Registro do Procfit e o histórico,
-- mas não duplica a chave única da linha importada.
CREATE OR REPLACE FUNCTION public.relancar_queima(p_loja_id text,p_usuario_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.queima%rowtype;novo_id uuid;mes_corrente date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_usuario_id AND ativo=true AND perfil='admin' AND loja_id=p_loja_id) THEN
  RAISE EXCEPTION 'Operação não autorizada';END IF;
 SELECT * INTO item FROM public.queima WHERE id=p_id AND loja_id=p_loja_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Queima não encontrada';END IF;
 IF item.estado<>'pendente' THEN RAISE EXCEPTION 'Somente Queima pendente pode ser relançada'; END IF;
 mes_corrente:=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')::date;
 IF date_trunc('month',item.criado_em AT TIME ZONE 'America/Sao_Paulo')::date >= mes_corrente THEN
   RAISE EXCEPTION 'Queima do mês atual: aprove em vez de relançar';END IF;
 INSERT INTO public.queima(loja_id,lancamento_id,ean,lote,validade,quantidade,motivo,estado,
  origem_mapa,usuario_id,registro_queima)
 VALUES(p_loja_id,item.lancamento_id,item.ean,item.lote,item.validade,item.quantidade,'4','pendente',item.origem_mapa,p_usuario_id,item.registro_queima)
 RETURNING id INTO novo_id;
 UPDATE public.queima SET estado='relancado',atualizado_em=now() WHERE id=item.id;
 RETURN jsonb_build_object('relancado',true,'origem',p_id,'novo_id',novo_id);
END $$;
REVOKE ALL ON FUNCTION public.relancar_queima(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.relancar_queima(text,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
