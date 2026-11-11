-- V26: Grupo no catálogo e organização administrativa independente dos mapas.
-- Pré-requisitos: migrações 001-016. Pode ser executada novamente sem apagar atribuições de Grupos.
BEGIN;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS grupo text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_produtos_grupo ON public.produtos(grupo);
COMMENT ON COLUMN public.produtos.grupo IS 'Grupo de compras do relatório ODS validado por par EAN + código interno.';

CREATE TABLE IF NOT EXISTS public.organizacao_grupos (
 loja_id text NOT NULL REFERENCES public.lojas(id),
 grupo_chave text NOT NULL,
 grupo text NOT NULL,
 responsavel_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
 oculta_no_quadro boolean NOT NULL DEFAULT false,
 excluida_das_listas boolean NOT NULL DEFAULT false,
 atualizado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (loja_id, grupo_chave),
 CONSTRAINT organizacao_grupos_chave_valida CHECK (length(btrim(grupo_chave)) BETWEEN 1 AND 120)
);
ALTER TABLE public.organizacao_grupos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organizacao_grupos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizacao_grupos TO service_role;
CREATE INDEX IF NOT EXISTS idx_organizacao_grupos_responsavel ON public.organizacao_grupos(loja_id,responsavel_id);

-- Reinicia a organização antiga por Seção, SEM apagar exclusões de visibilidade já definidas.
-- A organização nova por Grupo inicia vazia e nunca é apagada se a migração for reexecutada.
DELETE FROM public.organizacao_secoes WHERE excluida_das_listas IS NOT TRUE;
UPDATE public.organizacao_secoes
 SET responsavel_id=NULL, oculta_no_quadro=false, atualizado_em=now()
 WHERE responsavel_id IS NOT NULL OR oculta_no_quadro IS TRUE;

CREATE OR REPLACE FUNCTION public.resumo_organizacao_grupos(p_loja text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH catalogo AS (
  SELECT DISTINCT ON (lower(btrim(grupo))) lower(btrim(grupo)) AS chave, btrim(grupo) AS nome
  FROM public.produtos
  WHERE grupo IS NOT NULL AND btrim(grupo)<>'' AND lower(btrim(secao)) NOT IN
   ('brinde','brindes','default','servico','serviço','servicos','serviços','servicoes','servições')
  ORDER BY lower(btrim(grupo)), btrim(grupo)
 ), grupos AS (
  SELECT chave,nome FROM catalogo
  UNION
  SELECT grupo_chave,grupo FROM public.organizacao_grupos WHERE loja_id=p_loja
   AND grupo_chave NOT IN (SELECT chave FROM catalogo)
 ), estatisticas AS (
  SELECT lower(btrim(coalesce(p.grupo, pe.grupo,''))) AS chave,
   coalesce(m.funcionario_id,u.id) AS funcionario_id,
   count(*)::bigint AS registros,coalesce(sum(m.quantidade),0)::bigint AS unidades
  FROM public.mapa_lancamentos m
  LEFT JOIN public.produtos p ON p.id=m.produto_id
  LEFT JOIN public.produtos pe ON pe.ean=m.ean AND m.produto_id IS NULL
  LEFT JOIN public.usuarios u ON m.funcionario_id IS NULL AND u.loja_id=m.loja_id
   AND u.nome_normalizado=lower(btrim(m.mapa_nome)) AND u.perfil='funcionario'
  WHERE m.loja_id=p_loja AND m.excluido_em IS NULL
   AND m.tipo_mapa='funcionario' AND m.quantidade>0
   AND lower(btrim(coalesce(p.secao,pe.secao,''))) NOT IN
    ('brinde','brindes','default','servico','serviço','servicos','serviços','servicoes','servições')
   AND NOT EXISTS (SELECT 1 FROM public.organizacao_secoes os WHERE os.loja_id=p_loja
     AND os.excluida_das_listas AND os.secao_chave=lower(btrim(coalesce(p.secao,pe.secao,''))))
  GROUP BY 1,2
 )
 SELECT jsonb_build_object(
  'grupos',coalesce((SELECT jsonb_agg(jsonb_build_object('chave',chave,'nome',nome) ORDER BY nome) FROM grupos),'[]'::jsonb),
  'estatisticas',coalesce((SELECT jsonb_agg(jsonb_build_object('chave',chave,'funcionario_id',funcionario_id,
    'registros',registros,'unidades',unidades)) FROM estatisticas WHERE chave<>'' AND funcionario_id IS NOT NULL),'[]'::jsonb),
  'sem_grupo',coalesce((SELECT sum(registros) FROM estatisticas WHERE chave=''),0),
  'sem_funcionario',coalesce((SELECT sum(registros) FROM estatisticas WHERE funcionario_id IS NULL),0)
 );
$$;
REVOKE ALL ON FUNCTION public.resumo_organizacao_grupos(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_organizacao_grupos(text) TO service_role;

CREATE OR REPLACE FUNCTION public.listar_secoes_catalogo()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(secao ORDER BY secao),'[]'::jsonb) FROM (
  SELECT DISTINCT btrim(secao) AS secao FROM public.produtos
  WHERE btrim(secao)<>'' AND lower(btrim(secao)) NOT IN
   ('brinde','brindes','default','servico','serviço','servicos','serviços','servicoes','servições')
 ) s;
$$;
REVOKE ALL ON FUNCTION public.listar_secoes_catalogo() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.listar_secoes_catalogo() TO service_role;

-- O próprio banco compara os DOIS identificadores no UPDATE. Nenhuma linha não coincidente é modificada.
CREATE OR REPLACE FUNCTION public.atualizar_grupos_por_ods(p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; distintos integer; correspondentes integer; alterados integer; divergencias jsonb;
BEGIN
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens)>250
 THEN RAISE EXCEPTION 'Envie um array de até 250 registros'; END IF;
 CREATE TEMP TABLE IF NOT EXISTS tmp_ods_grupos
  (ean text,codigo_interno text,grupo text) ON COMMIT DROP;
 TRUNCATE tmp_ods_grupos;
 INSERT INTO tmp_ods_grupos(ean,codigo_interno,grupo)
 SELECT btrim(ean),btrim(codigo_interno),btrim(grupo)
 FROM jsonb_to_recordset(p_itens) AS x(ean text,codigo_interno text,grupo text);
 SELECT count(*),count(DISTINCT ean) INTO n,distintos FROM tmp_ods_grupos;
 IF n<>distintos OR EXISTS(SELECT 1 FROM tmp_ods_grupos
  WHERE ean !~ '^[0-9]{8,14}$' OR codigo_interno !~ '^[0-9]{1,40}$'
   OR length(grupo)<1 OR length(grupo)>120)
 THEN RAISE EXCEPTION 'Lote inválido: EAN, código interno, grupo ou duplicidade'; END IF;
 SELECT count(*) INTO correspondentes FROM tmp_ods_grupos t
  JOIN public.produtos p ON p.ean=t.ean AND btrim(coalesce(p.codigo_interno,''))=t.codigo_interno;
 UPDATE public.produtos p SET grupo=t.grupo,atualizado_em=now()
 FROM tmp_ods_grupos t WHERE p.ean=t.ean AND btrim(coalesce(p.codigo_interno,''))=t.codigo_interno
  AND p.grupo IS DISTINCT FROM t.grupo;
 GET DIAGNOSTICS alterados=ROW_COUNT;
 SELECT coalesce(jsonb_agg(jsonb_build_object('ean',t.ean,'codigo_interno',t.codigo_interno)), '[]'::jsonb)
 INTO divergencias FROM tmp_ods_grupos t WHERE NOT EXISTS
  (SELECT 1 FROM public.produtos p WHERE p.ean=t.ean AND btrim(coalesce(p.codigo_interno,''))=t.codigo_interno);
 RETURN jsonb_build_object('recebidos',n,'correspondentes',correspondentes,
  'alterados',alterados,'sem_correspondencia',n-correspondentes,'divergencias',divergencias);
END $$;
REVOKE ALL ON FUNCTION public.atualizar_grupos_por_ods(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_grupos_por_ods(jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
