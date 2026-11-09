-- Migração aditiva e reexecutável: resolução auditável de pendências.
-- Execute no GitHub Actions (etapa ajustar_pendencias) antes de publicar a interface nova.
begin;
alter table public.catalogo_pendencias add column if not exists status text not null default 'pendente';
alter table public.catalogo_pendencias add column if not exists corrigido_em timestamptz;
alter table public.catalogo_pendencias add column if not exists corrigido_por uuid references public.usuarios(id);
alter table public.catalogo_pendencias add column if not exists resultado jsonb;
alter table public.migracao_pendencias add column if not exists status text not null default 'pendente';
alter table public.migracao_pendencias add column if not exists corrigido_em timestamptz;
alter table public.migracao_pendencias add column if not exists corrigido_por uuid references public.usuarios(id);
alter table public.migracao_pendencias add column if not exists resultado jsonb;
create index if not exists idx_catalogo_pendencias_status on public.catalogo_pendencias(status);
create index if not exists idx_migracao_pendencias_status on public.migracao_pendencias(status);
commit;
