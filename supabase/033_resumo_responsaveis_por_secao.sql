-- v56: soma histórica por seção e funcionário ativo, sem consultas paginadas no navegador.
-- Execute uma vez no SQL Editor do Supabase antes de publicar a API v56.
CREATE OR REPLACE FUNCTION public.resumo_responsaveis_por_secao_v56(p_loja text)
RETURNS TABLE(secao_chave text,funcionario_id uuid,lancamentos bigint,unidades bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH historico AS (
 SELECT lower(btrim(coalesce(p.secao,pe.secao,''))) AS chave,
        coalesce(m.funcionario_id,u.id) AS pessoa,m.quantidade
 FROM public.mapa_lancamentos m
 LEFT JOIN public.produtos p ON p.id=m.produto_id
 LEFT JOIN public.produtos pe ON pe.ean=m.ean AND m.produto_id IS NULL
 LEFT JOIN public.usuarios u ON m.funcionario_id IS NULL AND u.loja_id=m.loja_id
      AND u.nome_normalizado=lower(btrim(m.mapa_nome)) AND u.perfil='funcionario'
 WHERE m.loja_id=p_loja AND m.excluido_em IS NULL
   AND m.tipo_mapa='funcionario' AND m.quantidade>0
 )
 SELECT h.chave,u.id,count(*)::bigint,sum(h.quantidade)::bigint
 FROM historico h JOIN public.usuarios u ON u.id=h.pessoa AND u.loja_id=p_loja
   AND u.perfil='funcionario' AND u.ativo AND u.excluido_em IS NULL
 WHERE h.chave<>'' AND h.chave NOT IN
    ('brinde','brindes','default','servico','serviço','servicos','serviços','servicoes','servições')
   AND NOT EXISTS (SELECT 1 FROM public.organizacao_secoes os WHERE os.loja_id=p_loja
       AND os.excluida_das_listas AND os.secao_chave=h.chave)
 GROUP BY h.chave,u.id;
$$;
REVOKE ALL ON FUNCTION public.resumo_responsaveis_por_secao_v56(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_responsaveis_por_secao_v56(text) TO service_role;
