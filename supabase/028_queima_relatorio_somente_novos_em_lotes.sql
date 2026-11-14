-- V48 — somente NOVOS itens aprovados (S) do relatório Procfit.
-- Corrige statement_timeout removendo SQL por linha: catálogo, correspondência
-- e classificação processados em lote. 40 itens por RPC (controlado na API).
-- Não corrige quantidade, preço ou validade de itens existentes.
-- Depende das migrações 025, 026 e 027. Não modifica registros históricos.
BEGIN;

-- Índices para procurar o mesmo EAN na loja, e bloquear apenas mapas especiais.
-- Em grandes lojas a 027 fazia buscas repetidas sem índice próprio de EAN.
CREATE INDEX IF NOT EXISTS idx_mapa_queima_ean_ativos_v48
 ON public.mapa_lancamentos(loja_id,ean,validade)
 WHERE excluido_em IS NULL;

-- Compatibilidade de assinatura: não quebrar o frontend já publicado.
-- p_primeira_carga: mantido só para compatibilidade; todo envio pode adicionar novos.
-- p_corrigir_aprovados: sempre proibido (edição SOMENTE manual).
CREATE OR REPLACE FUNCTION public.conciliar_queima_relatorio_v43(
 p_loja_id text,p_usuario_id uuid,p_itens jsonb,
 p_primeira_carga boolean DEFAULT false,
 p_corrigir_aprovados boolean DEFAULT false,
 p_simular boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_total integer; v_contagem jsonb;v_amostras jsonb;v_criados integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u
   WHERE u.id=p_usuario_id AND u.loja_id=p_loja_id AND u.perfil='admin'
    AND u.ativo=true AND u.excluido_em IS NULL) THEN
  RAISE EXCEPTION 'Somente administrador ativo da loja pode importar Queima'
   USING ERRCODE='42501';
 END IF;
 IF p_corrigir_aprovados IS TRUE THEN
  RAISE EXCEPTION 'Correções via relatório desativadas. Edite o aprovado manualmente na Queima'
   USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 40 THEN
  RAISE EXCEPTION 'Envie de 1 a 40 itens por lote de conferência'
   USING ERRCODE='22023';
 END IF;
 v_total:=jsonb_array_length(p_itens);

 -- Impede duas importações simultâneas na mesma loja de criarem o mesmo item.
 -- Na prévia não usamos locks nem escrevemos registros de Queima.
 IF NOT p_simular THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('queima_procfit_'||p_loja_id,0));
 END IF;

 -- Lote de 40 itens. Apenas tabela TEMPORÁRIA nesta transação.
 -- JSON validado previamente pela API; a função é restrita ao service_role.
 CREATE TEMP TABLE tmp_queima_relatorio_v48 ON COMMIT DROP AS
 WITH entradas AS (
  SELECT r.linha,r.codigo_interno,r.validade,r.data_lancamento,r.quantidade,
    r.preco_gondola,r.ocorrencia,r.aprovado,
    coalesce(nullif(pg_catalog.ltrim(pg_catalog.btrim(r.codigo_interno),'0'),''),'0') AS codigo_normalizado
  FROM pg_catalog.jsonb_to_recordset(p_itens) AS r(
    linha integer,codigo_interno text,validade date,data_lancamento date,
    quantidade integer,preco_gondola numeric,ocorrencia integer,aprovado boolean)
 )
 SELECT e.*,
  pg_catalog.md5(pg_catalog.concat_ws('|',p_loja_id,e.codigo_normalizado,
       e.validade::text,e.data_lancamento::text,e.ocorrencia::text)) AS origem_chave,
  row_number() OVER (PARTITION BY e.codigo_normalizado,e.validade,e.data_lancamento,e.ocorrencia ORDER BY e.linha) AS indice_chave,
  NULL::text AS ean, NULL::integer AS n_catalogo,NULL::boolean AS especial,
  NULL::text AS acao,NULL::uuid AS criado_id
 FROM entradas e;

 -- A mesma origem repetida no lote é sinalizada; não aborta outros produtos.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='invalido'
 WHERE t.linha IS NULL OR t.linha<4 OR t.aprovado IS DISTINCT FROM true
   OR t.codigo_interno !~ '^[0-9]{1,20}$' OR t.validade IS NULL
   OR t.data_lancamento IS NULL OR t.quantidade NOT BETWEEN 1 AND 999999
   OR t.ocorrencia NOT BETWEEN 1 AND 10000
   OR t.preco_gondola IS NOT NULL AND (t.preco_gondola<0 OR t.preco_gondola>9999999999.99)
   OR t.indice_chave>1;

 -- Resolva os códigos INTERNOS de uma vez, pelo índice criado na SQL 025.
 -- O agrupamento impede escolher EAN arbitrário quando um código for ambíguo.
 WITH codigos AS (
  SELECT DISTINCT t.codigo_normalizado
  FROM pg_temp.tmp_queima_relatorio_v48 t WHERE t.acao IS NULL
 ), catalogo AS (
  SELECT c.codigo_normalizado,count(DISTINCT p.ean)::integer AS n_ean,
    min(p.ean) AS ean, bool_or(coalesce(p.formula_especial,false)) AS especial
  FROM codigos c
  JOIN public.produtos p ON pg_catalog.ltrim(coalesce(p.codigo_interno,''),'0')=c.codigo_normalizado
  GROUP BY c.codigo_normalizado
 )
 UPDATE pg_temp.tmp_queima_relatorio_v48 t
  SET ean=c.ean,n_catalogo=c.n_ean,especial=c.especial
 FROM catalogo c WHERE t.codigo_normalizado=c.codigo_normalizado AND t.acao IS NULL;

 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='sem_catalogo'
 WHERE t.acao IS NULL AND coalesce(t.n_catalogo,0)<>1;

 -- Reenvio do mesmo relatório ou de um item excluído: nunca recriar.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='ja_excluido'
 WHERE t.acao IS NULL AND EXISTS(
  SELECT 1 FROM public.queima q WHERE q.loja_id=p_loja_id
    AND q.origem_relatorio_chave=t.origem_chave AND q.excluido_em IS NOT NULL);
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='ja_conciliado'
 WHERE t.acao IS NULL AND EXISTS(
  SELECT 1 FROM public.queima q WHERE q.loja_id=p_loja_id
    AND q.origem_relatorio_chave=t.origem_chave);

 -- A única finalidade deste relatório é adicionar NOVOS produtos:
 -- aprovados e pendentes existentes são mantidos inalterados.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='ja_existente'
 WHERE t.acao IS NULL AND EXISTS(
  SELECT 1 FROM public.queima q WHERE q.loja_id=p_loja_id AND q.ean=t.ean
    AND q.validade=t.validade AND q.excluido_em IS NULL
    AND q.estado IN ('pendente','aprovado','relancado'));

 -- Excluídos por ação do operador não reaparecem como novos em outro relatório.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='ja_excluido'
 WHERE t.acao IS NULL AND EXISTS(
  SELECT 1 FROM public.queima q WHERE q.loja_id=p_loja_id AND q.ean=t.ean
    AND q.validade=t.validade AND q.excluido_em IS NOT NULL);

 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='sem_preco'
 WHERE t.acao IS NULL AND t.preco_gondola IS NULL;

 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='prazo_insuficiente'
 WHERE t.acao IS NULL AND t.validade<((now() AT TIME ZONE 'America/Sao_Paulo')::date+7);

 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='formula_especial'
 WHERE t.acao IS NULL AND t.especial IS TRUE;

 -- Não permitir Queima somente a partir de mapas especiais bloqueados.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='aba_especial'
 WHERE t.acao IS NULL
  AND EXISTS(SELECT 1 FROM public.mapa_lancamentos m
    WHERE m.loja_id=p_loja_id AND m.ean=t.ean AND m.excluido_em IS NULL
     AND (m.tipo_mapa IN('Termolabil','Psicotropicos','Antibioticos')
        OR m.mapa_nome IN('Termolabil','Psicotropicos','Antibioticos')))
  AND NOT EXISTS(SELECT 1 FROM public.mapa_lancamentos m
    WHERE m.loja_id=p_loja_id AND m.ean=t.ean AND m.excluido_em IS NULL
      AND coalesce(m.tipo_mapa,'') NOT IN('Termolabil','Psicotropicos','Antibioticos')
      AND coalesce(m.mapa_nome,'') NOT IN('Termolabil','Psicotropicos','Antibioticos'));

 -- Se o mesmo produto/validade aparecer várias vezes no XLSX, cadastro uma vez.
 WITH repetidos AS (
  SELECT t.origem_chave,
   row_number() OVER(PARTITION BY t.ean,t.validade ORDER BY t.linha,t.origem_chave) AS pos
  FROM pg_temp.tmp_queima_relatorio_v48 t WHERE t.acao IS NULL
 )
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='repetido_no_relatorio'
 FROM repetidos r WHERE t.origem_chave=r.origem_chave AND r.pos>1 AND t.acao IS NULL;

 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='cadastrar_e_aprovar'
 WHERE t.acao IS NULL;

 IF NOT p_simular THEN
  -- INSERT sempre pendente. O trigger da SQL 023 valida o prazo >= 7 dias.
  -- UPDATE afeta SOMENTE os IDs que acabaram de ser inseridos nesta chamada.
  WITH novos AS (
   INSERT INTO public.queima(loja_id,ean,lote,validade,quantidade,motivo,estado,
    origem_mapa,usuario_id,origem_relatorio_chave)
   SELECT p_loja_id,t.ean,NULL,t.validade,t.quantidade,'4','pendente',
     'Relatório Procfit (sem lote/registro)',p_usuario_id,t.origem_chave
   FROM pg_temp.tmp_queima_relatorio_v48 t WHERE t.acao='cadastrar_e_aprovar'
   ORDER BY t.linha
   ON CONFLICT (loja_id,origem_relatorio_chave)
      WHERE origem_relatorio_chave IS NOT NULL DO NOTHING
   RETURNING id,origem_relatorio_chave
  )
  UPDATE pg_temp.tmp_queima_relatorio_v48 t SET criado_id=n.id
  FROM novos n WHERE t.origem_chave=n.origem_relatorio_chave;

  UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='ja_conciliado'
  WHERE t.acao='cadastrar_e_aprovar' AND t.criado_id IS NULL;

  WITH titulares AS (
   SELECT t.criado_id AS id,public.responsavel_mapa_queima_v45(p_loja_id,t.ean,t.validade) AS dono
   FROM pg_temp.tmp_queima_relatorio_v48 t WHERE t.criado_id IS NOT NULL
  )
  UPDATE public.queima q SET estado='aprovado',aprovado_via_importacao=true,
     validade_gondola=t.validade,preco_gondola=t.preco_gondola,
     responsavel_importacao_id=d.dono,sem_responsavel_importacao=(d.dono IS NULL),
     atualizado_em=now()
   FROM pg_temp.tmp_queima_relatorio_v48 t
   JOIN titulares d ON d.id=t.criado_id
   WHERE q.id=t.criado_id AND q.loja_id=p_loja_id AND q.estado='pendente';

  SELECT count(*) INTO v_criados FROM pg_temp.tmp_queima_relatorio_v48 t
  WHERE t.acao='cadastrar_e_aprovar' AND t.criado_id IS NOT NULL;
 END IF;

 SELECT coalesce(pg_catalog.jsonb_object_agg(s.acao,s.cnt),'{}'::jsonb)
 INTO v_contagem FROM (
  SELECT t.acao,count(*) AS cnt FROM pg_temp.tmp_queima_relatorio_v48 t
   GROUP BY t.acao
 ) s;

 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'linha',e.linha,'codigo_interno',e.codigo_interno,
    'validade',e.validade,'acao',e.acao) ORDER BY e.linha),'[]'::jsonb)
 INTO v_amostras FROM (
  SELECT t.linha,t.codigo_interno,t.validade,t.acao
  FROM pg_temp.tmp_queima_relatorio_v48 t ORDER BY t.linha LIMIT 100
 ) e;

 RETURN pg_catalog.jsonb_build_object('total_aprovados',v_total,
  'primeira_carga',true,'corrigir_aprovados',false,'simulacao',p_simular,
  'contagem',v_contagem,'amostras',v_amostras,'criados',v_criados);
END $$;

REVOKE ALL ON FUNCTION public.conciliar_queima_relatorio_v43(text,uuid,jsonb,boolean,boolean,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_queima_relatorio_v43(text,uuid,jsonb,boolean,boolean,boolean)
 TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
