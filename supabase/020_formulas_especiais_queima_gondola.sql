-- V34: Fórmulas Especiais + informações da gôndola na Queima.
-- Aditiva e reexecutável; nenhuma linha histórica é apagada.
BEGIN;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS formula_especial boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_produtos_formulas_especiais ON public.produtos(ean) WHERE formula_especial;
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS validade_gondola date;
ALTER TABLE public.queima ADD COLUMN IF NOT EXISTS preco_gondola numeric(12,2);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='queima_preco_gondola_nao_negativo') THEN
  ALTER TABLE public.queima ADD CONSTRAINT queima_preco_gondola_nao_negativo CHECK (preco_gondola IS NULL OR preco_gondola >= 0);
 END IF;
END $$;
COMMENT ON COLUMN public.produtos.formula_especial IS 'Quando true, o produto não pode ser encaminhado à Queima nem copiado para o Conector Procfit.';
COMMENT ON COLUMN public.queima.validade_gondola IS 'Validade indicada na gôndola no momento de lançamento da Queima.';
COMMENT ON COLUMN public.queima.preco_gondola IS 'Preço informado na gôndola em reais no momento da Queima.';

-- Barreiras do banco para todas as rotas, incluindo RPCs legados, relançamentos
-- e inserções diretas com chave de serviço. Não interfere no histórico já salvo.
CREATE OR REPLACE FUNCTION public.bloquear_queima_formula_especial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tipo text;
DECLARE mapa_nome text;
DECLARE ean_do_mapa text;
BEGIN
 IF EXISTS (SELECT 1 FROM public.produtos p WHERE p.ean=NEW.ean AND p.formula_especial IS TRUE) THEN
   RAISE EXCEPTION 'Fórmula Especial: produto bloqueado para Queima' USING ERRCODE='23514';
 END IF;
 IF NEW.lancamento_id IS NOT NULL THEN
   SELECT m.tipo_mapa,m.mapa_nome,m.ean INTO tipo,mapa_nome,ean_do_mapa
   FROM public.mapa_lancamentos m WHERE m.id=NEW.lancamento_id AND m.loja_id=NEW.loja_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento da Queima não localizado nesta loja' USING ERRCODE='23514'; END IF;
   IF tipo IN ('Termolabil','Psicotropicos','Antibioticos')
    OR mapa_nome IN ('Termolabil','Psicotropicos','Antibioticos') THEN
     RAISE EXCEPTION 'Aba especial não permite lançamento na Queima' USING ERRCODE='23514';
   END IF;
   IF ean_do_mapa IS DISTINCT FROM NEW.ean THEN
     RAISE EXCEPTION 'EAN diferente do lançamento de origem' USING ERRCODE='23514';
   END IF;
 END IF;
 IF NEW.origem_mapa IN ('Termolabil','Psicotropicos','Antibioticos') THEN
   RAISE EXCEPTION 'Aba especial não permite lançamento na Queima' USING ERRCODE='23514';
 END IF;
 IF NEW.lancamento_id IS NULL AND NEW.origem_mapa IS NULL
    AND EXISTS (SELECT 1 FROM public.mapa_lancamentos m WHERE m.loja_id=NEW.loja_id AND m.ean=NEW.ean
         AND m.excluido_em IS NULL AND (m.tipo_mapa IN ('Termolabil','Psicotropicos','Antibioticos')
              OR m.mapa_nome IN ('Termolabil','Psicotropicos','Antibioticos')))
    AND NOT EXISTS (SELECT 1 FROM public.mapa_lancamentos m WHERE m.loja_id=NEW.loja_id AND m.ean=NEW.ean
         AND m.excluido_em IS NULL AND m.tipo_mapa NOT IN ('Termolabil','Psicotropicos','Antibioticos')
         AND m.mapa_nome NOT IN ('Termolabil','Psicotropicos','Antibioticos')) THEN
    RAISE EXCEPTION 'Produto exclusivo de aba especial não pode entrar na Queima' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_bloquear_queima_formula_especial ON public.queima;
CREATE TRIGGER tg_bloquear_queima_formula_especial BEFORE INSERT ON public.queima
FOR EACH ROW EXECUTE FUNCTION public.bloquear_queima_formula_especial();

-- Encaminhamento do Mapa para Queima com preço e validade próprios de cada item.
-- Variante com condições individuais para cada produto numa seleção de várias linhas.
CREATE OR REPLACE FUNCTION public.encaminhar_mapa_queima_itens_v34(
 p_loja_id text,p_usuario_id uuid,p_itens jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE raw jsonb;
DECLARE r public.mapa_lancamentos%rowtype;
DECLARE v_ids uuid[]:=ARRAY[]::uuid[];
DECLARE v_id uuid;
DECLARE v_validade date;
DECLARE v_preco numeric;
DECLARE feitos integer:=0;
DECLARE ignorados integer:=0;
BEGIN
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Seleção de Queima inválida' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_usuario_id AND ativo=true AND perfil='admin' AND loja_id=p_loja_id) THEN
  RAISE EXCEPTION 'Operação não autorizada' USING ERRCODE='42501'; END IF;
 FOR raw IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  IF jsonb_typeof(raw) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Item inválido' USING ERRCODE='22023'; END IF;
  v_id:=(raw->>'id')::uuid;
  v_validade:=(raw->>'validade_gondola')::date;
  v_preco:=(raw->>'preco_gondola')::numeric;
  IF v_id IS NULL OR v_id=ANY(v_ids) OR v_validade IS NULL OR v_preco IS NULL OR v_preco<0 OR v_preco>9999999999.99 THEN
   RAISE EXCEPTION 'EAN, validade ou preço da gôndola inválido/duplicado' USING ERRCODE='22023'; END IF;
  v_ids:=array_append(v_ids,v_id);
 END LOOP;
 IF (SELECT count(*) FROM public.mapa_lancamentos WHERE id=ANY(v_ids) AND loja_id=p_loja_id AND excluido_em IS NULL) <> array_length(v_ids,1) THEN
  RAISE EXCEPTION 'Há registros ausentes do mapa' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT * FROM public.mapa_lancamentos WHERE id=ANY(v_ids) AND loja_id=p_loja_id AND excluido_em IS NULL ORDER BY id FOR UPDATE LOOP
  IF r.tipo_mapa IN ('Termolabil','Psicotropicos','Antibioticos') OR r.mapa_nome IN ('Termolabil','Psicotropicos','Antibioticos') THEN
   RAISE EXCEPTION 'Aba especial não permite Queima' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.produtos p WHERE p.ean=r.ean AND p.formula_especial IS TRUE) THEN
   RAISE EXCEPTION 'Fórmula Especial não permite Queima' USING ERRCODE='23514'; END IF;
  IF r.quantidade<=0 OR EXISTS(SELECT 1 FROM public.queima WHERE lancamento_id=r.id AND loja_id=p_loja_id AND estado IN('pendente','aprovado')) THEN
   ignorados:=ignorados+1;CONTINUE;END IF;
  SELECT (elem.item->>'validade_gondola')::date,(elem.item->>'preco_gondola')::numeric INTO v_validade,v_preco
   FROM jsonb_array_elements(p_itens) AS elem(item) WHERE (elem.item->>'id')::uuid=r.id;
  INSERT INTO public.queima(loja_id,lancamento_id,ean,lote,validade,quantidade,motivo,estado,origem_mapa,usuario_id,validade_gondola,preco_gondola)
  VALUES(p_loja_id,r.id,r.ean,r.lote,r.validade,r.quantidade,'4','pendente',r.mapa_nome,p_usuario_id,v_validade,v_preco);
  feitos:=feitos+1;
 END LOOP;
 RETURN jsonb_build_object('processados',feitos,'ignorados',ignorados);
END $$;
REVOKE ALL ON FUNCTION public.encaminhar_mapa_queima_itens_v34(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.encaminhar_mapa_queima_itens_v34(text,uuid,jsonb) TO service_role;

-- Um relançamento preserva a informação de gôndola da entrada anterior.
CREATE OR REPLACE FUNCTION public.relancar_queima(p_loja_id text,p_usuario_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.queima%rowtype;
DECLARE novo_id uuid;
DECLARE mes_corrente date;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_usuario_id AND ativo=true AND perfil='admin' AND loja_id=p_loja_id) THEN
  RAISE EXCEPTION 'Operação não autorizada'; END IF;
 SELECT * INTO item FROM public.queima WHERE id=p_id AND loja_id=p_loja_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registro de Queima não localizado'; END IF;
 IF item.estado<>'pendente' THEN RAISE EXCEPTION 'Somente uma Queima pendente pode ser relançada'; END IF;
 mes_corrente:=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date;
 IF date_trunc('month',item.criado_em at time zone 'America/Sao_Paulo')::date >= mes_corrente THEN
  RAISE EXCEPTION 'Queima do mês atual: aprove em vez de relançar'; END IF;
 INSERT INTO public.queima(loja_id,lancamento_id,ean,lote,validade,quantidade,motivo,estado,origem_mapa,usuario_id,validade_gondola,preco_gondola)
 VALUES(p_loja_id,item.lancamento_id,item.ean,item.lote,item.validade,item.quantidade,'4','pendente',item.origem_mapa,p_usuario_id,item.validade_gondola,item.preco_gondola)
 RETURNING id INTO novo_id;
 UPDATE public.queima SET estado='relancado',atualizado_em=now() WHERE id=item.id;
 RETURN jsonb_build_object('relancado',true,'origem',p_id,'novo_id',novo_id);
END $$;
REVOKE ALL ON FUNCTION public.relancar_queima(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.relancar_queima(text,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
