-- OneSignal: autorização individual de aparelhos, sessões e controle de envio.
-- Executar somente após 001_schema.sql. Migração aditiva/idempotente.
create table if not exists public.push_dispositivos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  loja_id text not null references public.lojas(id),
  subscription_id text not null unique,
  nome_dispositivo text not null default 'Navegador',
  sessao_token_hash text references public.sessoes(token_hash) on delete set null,
  autorizado boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint push_subscription_formato check(length(trim(subscription_id)) between 16 and 150)
);
create index if not exists idx_push_dispositivos_loja on public.push_dispositivos(loja_id, usuario_id);
create index if not exists idx_push_dispositivos_autorizados on public.push_dispositivos(autorizado, ativo) where autorizado and ativo;

create table if not exists public.notificacao_envios (
  id uuid primary key default gen_random_uuid(),
  janela text not null,
  tipo text not null default 'vencimentos',
  dispositivo_id uuid not null references public.push_dispositivos(id) on delete cascade,
  quantidade_registros integer not null default 0,
  situacao text not null default 'reservado' check(situacao in ('reservado','enviado','falhou')),
  onesignal_message_id text,
  erro_resumo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique(janela,tipo,dispositivo_id)
);
create index if not exists idx_notificacao_envios_janela on public.notificacao_envios(janela, situacao);

-- Nenhuma policy pública. A API no Vercel usa somente a chave secreta do servidor.
alter table public.push_dispositivos enable row level security;
alter table public.notificacao_envios enable row level security;
revoke all on public.push_dispositivos from anon, authenticated;
revoke all on public.notificacao_envios from anon, authenticated;

-- Reserva atômica: não dispara novamente no mesmo intervalo de 8 horas,
-- mesmo em duas execuções simultâneas ou após falha do GitHub Actions.
create or replace function public.reservar_notificacao_push(
  p_janela text, p_tipo text, p_dispositivo uuid, p_quantidade integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.notificacao_envios(janela,tipo,dispositivo_id,quantidade_registros)
  values(p_janela,p_tipo,p_dispositivo,p_quantidade)
  on conflict (janela,tipo,dispositivo_id) do nothing
  returning id into v_id;
  return v_id; -- null significa que já houve tentativa na janela.
end;$$;
revoke all on function public.reservar_notificacao_push(text,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.reservar_notificacao_push(text,text,uuid,integer) to service_role;
