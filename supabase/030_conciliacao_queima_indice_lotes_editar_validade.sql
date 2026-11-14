-- v51: otimização da prévia XLSX Procfit, sem alterar importações existentes.
-- Requer SQL 029 (v50). Reexecutar migrações antigas depois desta pode reintroduzir o timeout.
-- 10 produtos por lote, índice por validade e catálogo de códigos pré-calculado.
-- Válido para todas as importações posteriores: apenas novos S não vencidos.
-- Edição manual de aprovado pode corrigir validade do produto e da gôndola.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_queima_busca_ativos_validade_v51
 ON public.queima(loja_id,validade) WHERE excluido_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_queima_busca_excluidos_validade_v51
 ON public.queima(loja_id,validade) WHERE excluido_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_queima_codigo_normalizado_v51
 ON public.queima(loja_id,pg_catalog.ltrim(coalesce(codigo_interno,''),'0'),validade)
 WHERE codigo_interno IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bloquear_queima_vencida_v40()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 -- Corrigir manualmente as datas de uma ocorrência JÁ aprovada é diferente
 -- de lançar uma Queima nova. A API valida a data e exige administrador.
 -- Evita que o prazo mínimo impeça corrigir um registro histórico.
 IF TG_OP='UPDATE' AND OLD.estado='aprovado' AND NEW.estado='aprovado' THEN
  RETURN NEW;
 END IF;
 IF NEW.origem_relatorio_chave IS NOT NULL
   AND NEW.origem_mapa='Relatório Procfit (sem lote/registro)' THEN
   IF NEW.validade IS NULL OR NEW.validade <= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
     RAISE EXCEPTION 'Relatório Procfit: produto vencido ou com vencimento hoje'
       USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF NEW.validade IS NULL OR NEW.validade < ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7) THEN
  RAISE EXCEPTION 'Para lançar na Queima o produto precisa ter validade de pelo menos 7 dias'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

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
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) NOT BETWEEN 1 AND 10 THEN
  RAISE EXCEPTION 'Envie de 1 a 10 itens por lote de conferência'
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
    r.preco_gondola,r.ocorrencia,r.aprovado,r.produto_relatorio,r.descricao_original,
    CASE WHEN r.codigo_interno ~ '^[0-9]{1,20}$'
     THEN coalesce(nullif(pg_catalog.ltrim(pg_catalog.btrim(r.codigo_interno),'0'),''),'0')
     ELSE NULL END AS codigo_normalizado
  FROM pg_catalog.jsonb_to_recordset(p_itens) AS r(
    linha integer,codigo_interno text,validade date,data_lancamento date,
    quantidade integer,preco_gondola numeric,ocorrencia integer,aprovado boolean,
    produto_relatorio text,descricao_original text)
 )
 SELECT e.*,
  pg_catalog.md5(pg_catalog.concat_ws('|',p_loja_id,
       coalesce(e.codigo_normalizado,'texto:'||coalesce(nullif(lower(btrim(e.produto_relatorio)),''),'linha:'||e.linha::text)),
       e.validade::text,e.data_lancamento::text,e.ocorrencia::text)) AS origem_chave,
  row_number() OVER (PARTITION BY coalesce(e.codigo_normalizado,'texto:'||coalesce(nullif(lower(btrim(e.produto_relatorio)),''),'linha:'||e.linha::text)),e.validade,e.data_lancamento,e.ocorrencia ORDER BY e.linha) AS indice_chave,
  NULL::text AS ean, NULL::integer AS n_catalogo,NULL::boolean AS especial,
  NULL::text AS acao,NULL::uuid AS criado_id
 FROM entradas e;

 -- A mesma origem repetida no lote é sinalizada; não aborta outros produtos.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='invalido'
 WHERE t.linha IS NULL OR t.linha<4 OR t.aprovado IS DISTINCT FROM true
    OR t.ocorrencia NOT BETWEEN 1 AND 10000 OR t.indice_chave>1; 

 -- Só a validade bloqueia entradas S. Sem data não é possível conferir se venceu.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='sem_validade'
 WHERE t.acao IS NULL AND t.validade IS NULL;
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='vencido'
 WHERE t.acao IS NULL AND t.validade <= (now() AT TIME ZONE 'America/Sao_Paulo')::date;

 -- Materializa o catálogo do lote apenas uma vez. O índice funcional
 -- idx_produtos_codigo_normalizado_v43 dá acesso ao código interno sem varrer
 -- toda a tabela de 80 mil produtos para cada linha da Queima.
 CREATE TEMP TABLE tmp_queima_codigos_v51 ON COMMIT DROP AS
 SELECT DISTINCT t.codigo_normalizado,p.ean,coalesce(p.formula_especial,false) AS especial
 FROM (SELECT DISTINCT codigo_normalizado FROM pg_temp.tmp_queima_relatorio_v48
       WHERE acao IS NULL AND codigo_normalizado IS NOT NULL) t
 JOIN public.produtos p ON pg_catalog.ltrim(coalesce(p.codigo_interno,''),'0')=t.codigo_normalizado;

 WITH catalogo AS (
  SELECT c.codigo_normalizado,count(DISTINCT c.ean)::integer AS n_ean,
     min(c.ean) AS ean,bool_or(c.especial) AS especial
  FROM pg_temp.tmp_queima_codigos_v51 c GROUP BY c.codigo_normalizado
 )
 UPDATE pg_temp.tmp_queima_relatorio_v48 t
  SET ean=c.ean,n_catalogo=c.n_ean,especial=c.especial
 FROM catalogo c WHERE t.codigo_normalizado=c.codigo_normalizado AND t.acao IS NULL;

 -- Catálogo é opcional nesta importação: sem EAN, conserva o código interno
 -- e a descrição original; NÃO inventa código EAN.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET ean=NULL
 WHERE t.n_catalogo IS DISTINCT FROM 1;

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
 -- Já lançado: compara pelo EAN, código interno ou qualquer EAN do catálogo
 -- que corresponda ao Código Interno do XLSX. Não modifica nenhum deles.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='ja_existente'
 WHERE t.acao IS NULL AND EXISTS (
   SELECT 1 FROM public.queima q
   WHERE q.loja_id=p_loja_id AND q.validade=t.validade
    AND q.excluido_em IS NULL
    AND ( (t.codigo_normalizado IS NOT NULL AND (
       pg_catalog.ltrim(coalesce(q.codigo_interno,''),'0')=t.codigo_normalizado
       OR EXISTS (SELECT 1 FROM pg_temp.tmp_queima_codigos_v51 c
          WHERE c.codigo_normalizado=t.codigo_normalizado AND c.ean=q.ean)))
       OR (t.codigo_normalizado IS NULL AND q.produto_relatorio=t.produto_relatorio
           AND q.origem_mapa='Relatório Procfit (sem lote/registro)')
       OR (t.ean IS NOT NULL AND q.ean=t.ean) ) );

 -- Excluídos pela loja já foram lançados; não devem voltar por importação.
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='ja_excluido'
 WHERE t.acao IS NULL AND EXISTS (
  SELECT 1 FROM public.queima q WHERE q.loja_id=p_loja_id AND q.validade=t.validade
    AND q.excluido_em IS NOT NULL
    AND ((t.ean IS NOT NULL AND q.ean=t.ean)
      OR (t.codigo_normalizado IS NOT NULL AND (
          pg_catalog.ltrim(coalesce(q.codigo_interno,''),'0')=t.codigo_normalizado
          OR EXISTS (SELECT 1 FROM pg_temp.tmp_queima_codigos_v51 c
           WHERE c.codigo_normalizado=t.codigo_normalizado AND c.ean=q.ean)))
      OR (t.codigo_normalizado IS NULL AND q.produto_relatorio=t.produto_relatorio)) );

 -- Sem preço, EAN ou quantidade não impede o cadastro. Valores desconhecidos
 -- permanecem NULL (preço/EAN) e quantidade 0 com sinalização.
 -- Se o mesmo produto/validade aparecer várias vezes no XLSX, cadastro uma vez.
 WITH repetidos AS (
  SELECT t.origem_chave,
   row_number() OVER(PARTITION BY coalesce(t.codigo_normalizado,'texto:'||coalesce(nullif(lower(btrim(t.produto_relatorio)),''),'linha:'||t.linha::text)),t.validade ORDER BY t.linha,t.origem_chave) AS pos
  FROM pg_temp.tmp_queima_relatorio_v48 t WHERE t.acao IS NULL
 )
 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='repetido_no_relatorio'
 FROM repetidos r WHERE t.origem_chave=r.origem_chave AND r.pos>1 AND t.acao IS NULL;

 UPDATE pg_temp.tmp_queima_relatorio_v48 t SET acao='cadastrar_e_aprovar'
 WHERE t.acao IS NULL;

 IF NOT p_simular THEN
  -- INSERT sempre pendente. O trigger v50 valida que o Procfit não esteja vencido.
  -- UPDATE afeta SOMENTE os IDs que acabaram de ser inseridos nesta chamada.
  WITH novos AS (
   INSERT INTO public.queima(loja_id,ean,codigo_interno,descricao_original,produto_relatorio,
    lote,validade,quantidade,quantidade_pendente,motivo,estado,
    origem_mapa,usuario_id,origem_relatorio_chave)
   SELECT p_loja_id,t.ean,t.codigo_interno,nullif(btrim(t.descricao_original),''),
    nullif(btrim(t.produto_relatorio),''),NULL,t.validade,
    CASE WHEN t.quantidade BETWEEN 1 AND 999999 THEN t.quantidade ELSE 0 END,
    NOT coalesce(t.quantidade BETWEEN 1 AND 999999,false),'4','pendente',
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
   SELECT t.criado_id AS id,CASE WHEN t.ean IS NOT NULL THEN public.responsavel_mapa_queima_v45(p_loja_id,t.ean,t.validade) ELSE NULL END AS dono
   FROM pg_temp.tmp_queima_relatorio_v48 t WHERE t.criado_id IS NOT NULL
  )
  UPDATE public.queima q SET estado='aprovado',aprovado_via_importacao=true,
     validade_gondola=t.validade,preco_gondola=CASE WHEN t.preco_gondola BETWEEN 0 AND 9999999999.99 THEN t.preco_gondola ELSE NULL END,
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
