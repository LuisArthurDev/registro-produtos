-- 009: campos de auditoria sem excluir fisicamente registros vinculados ao mapa.
-- Aplicar APÓS a migração 008. Aditiva/idempotente.
begin;
alter table public.vencidos add column if not exists excluido_em timestamptz;
alter table public.vencidos add column if not exists excluido_por uuid references public.usuarios(id);
alter table public.vencidos add column if not exists atualizado_em timestamptz default now();
alter table public.transferencias add column if not exists excluido_em timestamptz;
alter table public.transferencias add column if not exists excluido_por uuid references public.usuarios(id);
alter table public.transferencias add column if not exists atualizado_em timestamptz default now();
alter table public.mapa_lancamentos add column if not exists retirada_loja_em timestamptz;
alter table public.mapa_lancamentos add column if not exists retirada_loja_por uuid references public.usuarios(id);
create index if not exists idx_vencidos_ativos_loja on public.vencidos(loja_id,criado_em) where excluido_em is null;
create index if not exists idx_transferencias_ativas_loja on public.transferencias(loja_destino,criado_em) where excluido_em is null;
commit;
