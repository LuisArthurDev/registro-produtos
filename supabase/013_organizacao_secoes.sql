-- V21: Quadro de organização de seções, sem alterar mapas nem titulares de lançamentos.
-- Pré-requisitos: 001 + migração 012 (funcionario_id / exclusão lógica).
begin;
create table if not exists public.organizacao_secoes (
 loja_id text not null references public.lojas(id),
 secao_chave text not null,
 secao text not null,
 responsavel_id uuid references public.usuarios(id) on delete set null,
 atualizado_por uuid references public.usuarios(id) on delete set null,
 atualizado_em timestamptz not null default now(),
 primary key (loja_id, secao_chave),
 constraint organizacao_secoes_chave_valida check (length(btrim(secao_chave)) between 1 and 120),
 constraint organizacao_secoes_nome_valido check (length(btrim(secao)) between 1 and 120)
);
create index if not exists idx_organizacao_secoes_responsavel on public.organizacao_secoes(loja_id,responsavel_id);
create index if not exists idx_mapas_organizacao on public.mapa_lancamentos(loja_id,funcionario_id) where excluido_em is null and tipo_mapa='funcionario';
alter table public.organizacao_secoes enable row level security;
revoke all on table public.organizacao_secoes from anon, authenticated;

-- A contagem é apenas diagnóstica. Não atualiza mapa_nome, funcionario_id, quantidade, validade, sessões ou permissões.
create or replace function public.resumo_organizacao_secoes(p_loja text)
returns jsonb language sql stable security definer set search_path='' as $$
 with catalogo as (
   select distinct on (lower(btrim(secao)))
     lower(btrim(secao)) chave, btrim(secao) nome
   from public.produtos
   where secao is not null and btrim(secao) <> ''
   order by lower(btrim(secao)),btrim(secao)
 ), secoes as (
   select chave,nome from catalogo
   union
   select secao_chave as chave,secao as nome from public.organizacao_secoes where loja_id=p_loja and secao_chave not in (select chave from catalogo)
 ),
 mapa_estatisticas as (
   select lower(btrim(coalesce(p.secao, p_ean.secao, ''))) as chave,
      coalesce(m.funcionario_id,u.id) as funcionario_id,
      count(*)::bigint as registros,
      coalesce(sum(m.quantidade),0)::bigint as unidades
   from public.mapa_lancamentos m
   left join public.produtos p on p.id=m.produto_id
   left join public.produtos p_ean on p_ean.ean=m.ean and m.produto_id is null
   left join public.usuarios u on m.funcionario_id is null and u.loja_id=m.loja_id and u.nome_normalizado=lower(btrim(m.mapa_nome)) and u.perfil='funcionario'
   where m.loja_id=p_loja and m.excluido_em is null and m.tipo_mapa='funcionario' and m.quantidade>0
   group by 1,2
 )
 select jsonb_build_object(
   'secoes',coalesce((select jsonb_agg(jsonb_build_object('chave',chave,'nome',nome) order by nome) from secoes),'[]'::jsonb),
   'estatisticas',coalesce((select jsonb_agg(jsonb_build_object('chave',chave,'funcionario_id',funcionario_id,'registros',registros,'unidades',unidades)) from mapa_estatisticas where chave<>'' and funcionario_id is not null),'[]'::jsonb),
   'sem_secao',coalesce((select sum(registros) from mapa_estatisticas where chave=''),0),
   'sem_funcionario',coalesce((select sum(registros) from mapa_estatisticas where funcionario_id is null),0)
 );
$$;
-- Execução de RPC somente pelo backend autenticado com service role. Não permitir acesso direto ao público.
revoke all on function public.resumo_organizacao_secoes(text) from public, anon, authenticated;
grant execute on function public.resumo_organizacao_secoes(text) to service_role;
commit;
