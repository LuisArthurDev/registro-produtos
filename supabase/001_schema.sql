-- REGISTRO DE MAPA DE VALIDADE / PRODUTOS EAN / ESTOQUE
-- Execute em Supabase > SQL Editor, em projeto novo, com backup dos dados originais.
-- Datas sem timezone para validade; timestamps em timestamptz, America/Sao_Paulo no aplicativo.
create extension if not exists pgcrypto;

create table if not exists public.lojas (
  id text primary key,
  nome text,
  criado_em timestamptz not null default now(),
  constraint loja_codigo check (id ~ '^[0-9]{1,12}$')
);

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_normalizado text not null,
  loja_id text references public.lojas(id),
  perfil text not null default 'funcionario' check(perfil in ('funcionario','admin','geral')),
  especial boolean not null default false,
  celular_proprio boolean not null default false,
  ativo boolean not null default true,
  pin_hash text, -- scrypt gerado pelo script de provisão; NÃO reutilizar hash do Apps Script
  tentativas integer not null default 0,
  bloqueado_ate timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(loja_id, nome_normalizado),
  constraint funcionario_loja check (perfil = 'geral' or loja_id is not null)
);
create unique index if not exists uq_admin_geral_nome on public.usuarios(nome_normalizado) where loja_id is null;

create table if not exists public.sessoes (
  token_hash text primary key,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  criada_em timestamptz not null default now(),
  ultima_atividade timestamptz not null default now(),
  expira_em timestamptz not null,
  manter_conectado boolean not null default false
);
create index if not exists idx_sessoes_usuario on public.sessoes(usuario_id);
create index if not exists idx_sessoes_expira on public.sessoes(expira_em);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  ean text not null unique check(ean ~ '^[0-9]{8,14}$'),
  codigo_interno text,
  descricao text not null default '',
  secao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_produtos_codigo on public.produtos(codigo_interno) where codigo_interno is not null;
create index if not exists idx_produtos_secao on public.produtos(secao);

-- Preserva entradas do catálogo original sem EAN válido, evitando perda silenciosa.
create table if not exists public.catalogo_pendencias (
  codigo_original text primary key,
  codigo_interno text,
  descricao text,
  secao text,
  motivo text not null default 'EAN fora do padrão 8 a 14 dígitos',
  importado_em timestamptz not null default now()
);

-- Preserva os lançamentos legados cujo EAN precisa de correção manual.
create table if not exists public.migracao_pendencias (
  origem_migracao text primary key,
  tabela_origem text not null,
  motivo text not null,
  dados jsonb not null,
  importado_em timestamptz not null default now()
);

-- Saldo geral importado do ERP: NÃO equivale a quantidade de lotes no mapa especial Estoque.
create table if not exists public.estoque_saldos (
  loja_id text not null references public.lojas(id),
  produto_id uuid not null references public.produtos(id),
  quantidade numeric(14,3) not null default 0,
  origem text not null default 'procfit',
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, produto_id)
);

-- Uma tabela para mapas individuais + abas especiais, inclusive Estoque.
create table if not exists public.mapa_lancamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null references public.lojas(id),
  funcionario_id uuid references public.usuarios(id),
  mapa_nome text not null,
  tipo_mapa text not null default 'funcionario'
    check (tipo_mapa in ('funcionario','Estoque','Termolabil','Psicotropicos','Antibioticos')),
  produto_id uuid references public.produtos(id),
  ean text not null check (ean ~ '^[0-9]{8,14}$'),
  lote text not null check(length(trim(lote)) between 1 and 100),
  validade date not null,
  quantidade integer not null check(quantidade >= 0),
  mes_lancamento date not null,
  request_id text unique,
  origem_migracao text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint mes_primeiro_dia check (extract(day from mes_lancamento) = 1)
);
create index if not exists idx_mapas_loja_nome on public.mapa_lancamentos(loja_id, mapa_nome);
create index if not exists idx_mapas_loja_validade on public.mapa_lancamentos(loja_id, validade);
create index if not exists idx_mapas_loja_mes on public.mapa_lancamentos(loja_id, mes_lancamento);
create index if not exists idx_mapas_identificacao on public.mapa_lancamentos(loja_id, mapa_nome, ean, lote, validade);

create table if not exists public.movimentacoes_mapa (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null references public.lojas(id),
  origem_lancamento_id uuid references public.mapa_lancamentos(id),
  destino_lancamento_id uuid references public.mapa_lancamentos(id),
  quantidade integer not null check(quantidade > 0),
  responsavel_id uuid references public.usuarios(id),
  request_id text unique,
  criado_em timestamptz not null default now()
);

create table if not exists public.vencidos (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null references public.lojas(id),
  lancamento_id uuid references public.mapa_lancamentos(id),
  ean text, -- Vencidos históricos podem conter somente Código Interno (sem EAN).
  codigo_interno text,
  descricao_original text,
  mapa_origem text,
  linha_original text,
  lote text,
  validade date,
  quantidade integer not null check(quantidade > 0),
  motivo text not null default 'vencido',
  usuario_id uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  origem_migracao text unique
);

create table if not exists public.queima (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null references public.lojas(id),
  lancamento_id uuid references public.mapa_lancamentos(id),
  ean text not null,
  lote text,
  validade date,
  quantidade integer not null check(quantidade >= 0),
  motivo text not null default '4',
  estado text not null default 'pendente' check(estado in ('pendente','aprovado','relancado')),
  origem_mapa text,
  usuario_id uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  origem_migracao text unique
);

create table if not exists public.transferencias (
  id uuid primary key default gen_random_uuid(),
  loja_origem text references public.lojas(id),
  loja_destino text references public.lojas(id),
  romaneio text,
  ean text not null,
  lote text,
  validade date,
  quantidade integer not null check(quantidade > 0),
  usuario_id uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  origem_migracao text unique
);

create table if not exists public.sinalizacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id text not null references public.lojas(id),
  lancamento_id uuid references public.mapa_lancamentos(id),
  ean text not null,
  observacao text,
  atualizado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  origem_migracao text unique
);

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  loja_id text,
  usuario_id uuid references public.usuarios(id),
  acao text not null,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists idx_auditoria_loja on public.auditoria(loja_id, criado_em desc);

-- Visão unificada, sem duplicar descrição/código e saldo.
create or replace view public.vw_produtos_estoque with (security_invoker = true) as
select e.loja_id, p.id as produto_id, p.codigo_interno, p.ean,
       p.descricao, p.secao, e.quantidade as saldo_procfit, e.atualizado_em
from public.estoque_saldos e join public.produtos p on p.id=e.produto_id;

-- O navegador NUNCA usa chave administrativa. Somente o backend Vercel acessa as tabelas.
-- RLS explícito: sem policies públicas; service role/secret somente no servidor.
do $$ declare tabela text; begin
  foreach tabela in array array[
    'lojas','usuarios','sessoes','produtos','catalogo_pendencias','migracao_pendencias','estoque_saldos','mapa_lancamentos',
    'movimentacoes_mapa','vencidos','queima','transferencias','sinalizacoes','auditoria'
  ] loop
    execute format('alter table public.%I enable row level security',tabela);
    execute format('revoke all on public.%I from anon, authenticated',tabela);
  end loop;
end $$;
revoke all on public.vw_produtos_estoque from anon, authenticated;

-- Escrita atômica, preservando EAN textual e request_id no reenvio após internet lenta.
create or replace function public.gravar_lancamento(
  p_request_id text, p_usuario_id uuid, p_loja_id text, p_mapa_nome text,
  p_tipo_mapa text, p_ean text, p_lote text, p_validade date,
  p_quantidade integer, p_confirmar_duplicado boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare existente public.mapa_lancamentos%rowtype;
declare repetido integer; declare produto uuid;
begin
  if p_request_id is null or length(p_request_id) > 100 or length(p_request_id) < 8 or
     p_ean !~ '^[0-9]{8,14}$' or length(trim(p_lote)) not between 1 and 100 or
     p_quantidade < 1 or p_quantidade > 999999 or p_tipo_mapa not in
        ('funcionario','Estoque','Termolabil','Psicotropicos','Antibioticos') then
    raise exception 'Dados inválidos para lançamento';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_loja_id||':'||p_mapa_nome||':'||p_ean||':'||upper(trim(p_lote))||':'||p_validade::text, 0));
  select * into existente from public.mapa_lancamentos where request_id=p_request_id;
  if found then
    return jsonb_build_object('status','saved','id',existente.id,'idempotente',true);
  end if;
  select coalesce(sum(quantidade),0)::integer into repetido from public.mapa_lancamentos
    where loja_id=p_loja_id and mapa_nome=p_mapa_nome and ean=p_ean
    and upper(lote)=upper(trim(p_lote)) and validade=p_validade;
  if repetido>0 and not p_confirmar_duplicado then
    return jsonb_build_object('status','duplicate','quantidadeExistente',repetido,
      'message','Produto já lançado neste mapa, lote e validade. Confirme para repetir.');
  end if;
  select id into produto from public.produtos where ean=p_ean;
  insert into public.mapa_lancamentos
    (request_id, funcionario_id,loja_id,mapa_nome,tipo_mapa,produto_id,ean,lote,validade,
     quantidade,mes_lancamento)
  values(p_request_id,p_usuario_id,p_loja_id,p_mapa_nome,p_tipo_mapa,produto,p_ean,
         upper(trim(p_lote)),p_validade,p_quantidade,
         date_trunc('month',now() at time zone 'America/Sao_Paulo')::date)
  returning * into existente;
  return jsonb_build_object('status','saved','id',existente.id,'idempotente',false);
end $$;

-- Transferência da aba especial Estoque para mapa de funcionário: transação única.
create or replace function public.descer_estoque(
  p_request_id text, p_origem_id uuid, p_destino text,
  p_quantidade integer, p_usuario_id uuid, p_loja_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare origem public.mapa_lancamentos%rowtype;
declare destino public.mapa_lancamentos%rowtype;
declare movimento public.movimentacoes_mapa%rowtype;
begin
  if p_request_id is null or length(p_request_id) < 8 or p_quantidade < 1 then
    raise exception 'Dados inválidos'; end if;
  select * into movimento from public.movimentacoes_mapa where request_id=p_request_id;
  if found then return jsonb_build_object('sucesso',true,'id',movimento.destino_lancamento_id,'idempotente',true);end if;
  select * into origem from public.mapa_lancamentos
  where id=p_origem_id and loja_id=p_loja_id and tipo_mapa='Estoque' for update;
  if not found then raise exception 'Registro não encontrado na aba Estoque'; end if;
  if p_quantidade>origem.quantidade then raise exception 'Quantidade superior ao disponível'; end if;
  if nullif(trim(p_destino),'') is null or p_destino in ('Estoque','Transferencias') then
     raise exception 'Mapa de destino inválido'; end if;
  update public.mapa_lancamentos set quantidade=quantidade-p_quantidade, atualizado_em=now() where id=origem.id;
  insert into public.mapa_lancamentos
    (loja_id,funcionario_id,mapa_nome,tipo_mapa,produto_id,ean,lote,validade,quantidade,mes_lancamento,request_id)
  values(p_loja_id,p_usuario_id,p_destino,
         case when p_destino in ('Termolabil','Psicotropicos','Antibioticos') then p_destino else 'funcionario' end,
         origem.produto_id,origem.ean,origem.lote,origem.validade,p_quantidade,
         date_trunc('month',now() at time zone 'America/Sao_Paulo')::date,p_request_id)
  returning * into destino;
  insert into public.movimentacoes_mapa
    (loja_id,origem_lancamento_id,destino_lancamento_id,quantidade,responsavel_id,request_id)
  values(p_loja_id,origem.id,destino.id,p_quantidade,p_usuario_id,p_request_id);
  return jsonb_build_object('sucesso',true,'id',destino.id,'idempotente',false);
end $$;

-- Somente a credencial secreta da API, nunca anon/authenticated, pode invocar RPCs.
revoke execute on function public.gravar_lancamento(text,uuid,text,text,text,text,text,date,integer,boolean) from public, anon, authenticated;
revoke execute on function public.descer_estoque(text,uuid,text,integer,uuid,text) from public, anon, authenticated;
grant execute on function public.gravar_lancamento(text,uuid,text,text,text,text,text,date,integer,boolean) to service_role;
grant execute on function public.descer_estoque(text,uuid,text,integer,uuid,text) to service_role;
