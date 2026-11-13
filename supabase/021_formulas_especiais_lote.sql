-- V35: classificação atômica de até 500 EANs como Fórmulas Especiais.
-- Depende da SQL 020. Não modifica mapas ou registros históricos de Queima.
BEGIN;
CREATE OR REPLACE FUNCTION public.marcar_formulas_especiais_lote(
 p_usuario uuid,p_loja text,p_eans text[],p_ativo boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_total integer;
 v_alterados integer;
BEGIN
 IF p_ativo IS NULL OR p_eans IS NULL THEN
  RAISE EXCEPTION 'Seleção de Fórmulas Especiais inválida' USING ERRCODE='22023';
 END IF;
 v_total:=coalesce(array_length(p_eans,1),0);
 IF v_total<1 OR v_total>500 THEN
  RAISE EXCEPTION 'Selecione de 1 a 500 produtos' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_usuario AND u.loja_id=p_loja
   AND u.perfil='admin' AND u.ativo=true AND u.excluido_em IS NULL) THEN
  RAISE EXCEPTION 'Somente administrador ativo da loja pode alterar Fórmulas Especiais'
    USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_eans) e(ean) WHERE e.ean IS NULL OR e.ean !~ '^[0-9]{8,14}$')
   OR (SELECT count(DISTINCT ean) FROM unnest(p_eans) e(ean))<>v_total THEN
  RAISE EXCEPTION 'Há EAN inválido ou repetido na seleção' USING ERRCODE='22023';
 END IF;
 IF (SELECT count(*) FROM public.produtos p WHERE p.ean=ANY(p_eans))<>v_total THEN
  RAISE EXCEPTION 'Um ou mais produtos não estão cadastrados em Produtos EAN. Nenhum item foi alterado.'
    USING ERRCODE='22023';
 END IF;
 UPDATE public.produtos p
  SET formula_especial=p_ativo,atualizado_em=now()
  WHERE p.ean=ANY(p_eans) AND p.formula_especial IS DISTINCT FROM p_ativo;
 GET DIAGNOSTICS v_alterados=ROW_COUNT;
 RETURN jsonb_build_object('sucesso',true,'selecionados',v_total,'alterados',v_alterados,
  'formula_especial',p_ativo);
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_formulas_especiais_lote(uuid,text,text[],boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_formulas_especiais_lote(uuid,text,text[],boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
