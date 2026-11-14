-- v41: prazo mínimo de 7 dias CORRIDOS até a validade para NOVOS lançamentos de Queima.
-- Mudança incremental sobre a SQL 022; mantém os registros já existentes e as aprovações.
-- Dia 14/11/2026 -> mínima permitida 21/11/2026, horário local São Paulo.
-- Aplicar após 022. Não exclui registros, não reescreve históricos.
BEGIN;

-- Atualiza o trigger instalado na 022. Ele continua associado à função abaixo.
CREATE OR REPLACE FUNCTION public.bloquear_queima_vencida_v40()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.validade IS NULL OR NEW.validade < ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7) THEN
  RAISE EXCEPTION 'Para lançar na Queima o produto precisa ter validade de pelo menos 7 dias'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
-- Além de impedir novos lançamentos, impede alterar apenas a validade de um
-- registro existente para burlar o prazo. Aprovações (que não alteram validade)
-- continuam funcionando sem revalidar registros históricos.
DROP TRIGGER IF EXISTS tg_bloquear_queima_vencida_v40 ON public.queima;
CREATE TRIGGER tg_bloquear_queima_vencida_v40
 BEFORE INSERT OR UPDATE OF validade ON public.queima
 FOR EACH ROW EXECUTE FUNCTION public.bloquear_queima_vencida_v40();

-- A RPC do mapa também rejeita TODA a seleção quando qualquer item tem prazo insuficiente.
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
  IF item.validade IS NULL OR item.validade < ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7) THEN
   RAISE EXCEPTION 'Há produto com menos de 7 dias até a validade na seleção' USING ERRCODE='23514';END IF;
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

-- A importação XLS ignora linhas fora do prazo, preserva duplicidades reais por linha física
-- e distingue vencidos de produtos que vencem em 0 a 6 dias.
CREATE OR REPLACE FUNCTION public.importar_queima_xls_v40(
 p_loja_id text,p_usuario_id uuid,p_registro text,p_itens jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE raw jsonb;codigo text;ean text;ean_lido text;
lote text;validade date;qtd integer;motivo integer;linha integer;
qtd_linhas integer;qtd_catalogo integer;especial boolean;
importados integer:=0;vencidos integer:=0;prazo_curto integer:=0;duplicados integer:=0;
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
  IF validade < ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7) THEN
   prazo_curto:=prazo_curto+1;CONTINUE;END IF;
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
  'ignorados_vencidos',vencidos,'ignorados_prazo_insuficiente',prazo_curto,'ignorados_duplicados',duplicados,
  'ignorados_sem_catalogo',sem_catalogo,'ignorados_formula_especial',formulas,
  'ignorados_invalidos',invalidos,'ignorados_abas_especiais',abas_especiais,'total',jsonb_array_length(p_itens));
END $$;

-- Mantém exatamente as permissões de serviço das funções anteriores.
REVOKE ALL ON FUNCTION public.encaminhar_mapa_queima_v40(text,uuid,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.encaminhar_mapa_queima_v40(text,uuid,uuid[],text) TO service_role;
REVOKE ALL ON FUNCTION public.importar_queima_xls_v40(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.importar_queima_xls_v40(text,uuid,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
