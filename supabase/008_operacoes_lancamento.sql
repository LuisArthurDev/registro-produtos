-- 008 - Melhorias operacionais: transferências idempotentes e Queima de mês anterior.
-- Executar no Actions: etapa=atualizar_operacoes. Aditiva e reexecutável.
begin;
alter table public.mapa_lancamentos add column if not exists excluido_em timestamptz;
alter table public.mapa_lancamentos add column if not exists excluido_por uuid references public.usuarios(id);
create index if not exists idx_mapas_ativos_loja on public.mapa_lancamentos(loja_id,validade) where excluido_em is null;
alter table public.transferencias add column if not exists request_id text;
create unique index if not exists transferencias_request_id_unique on public.transferencias(request_id);

-- Um registro pendente de mês ANTERIOR precisa ser relançado para o mês atual.
-- O original é preservado como 'relancado'; o novo fica pendente para aprovação.
create or replace function public.relancar_queima(p_loja_id text,p_usuario_id uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.queima%rowtype;
declare novo_id uuid;
declare mes_corrente date;
begin
 if not exists (select 1 from public.usuarios where id=p_usuario_id and ativo=true and perfil='admin' and loja_id=p_loja_id) then
   raise exception 'Operação não autorizada';
 end if;
 select * into item from public.queima where id=p_id and loja_id=p_loja_id for update;
 if not found then raise exception 'Registro de Queima não localizado'; end if;
 if item.estado <> 'pendente' then raise exception 'Somente uma Queima pendente pode ser relançada'; end if;
 mes_corrente := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
 if date_trunc('month',item.criado_em at time zone 'America/Sao_Paulo')::date >= mes_corrente then
   raise exception 'Queima do mês atual: aprove em vez de relançar';
 end if;
 insert into public.queima(loja_id,lancamento_id,ean,lote,validade,quantidade,motivo,estado,origem_mapa,usuario_id)
 values(p_loja_id,item.lancamento_id,item.ean,item.lote,item.validade,item.quantidade,'4','pendente',item.origem_mapa,p_usuario_id)
 returning id into novo_id;
 update public.queima set estado='relancado',atualizado_em=now() where id=item.id;
 return jsonb_build_object('relancado',true,'origem',p_id,'novo_id',novo_id);
end;$$;
revoke execute on function public.relancar_queima(text,uuid,uuid) from public,anon,authenticated;

create or replace function public.encaminhar_mapa(p_loja_id text,p_usuario_id uuid,p_ids uuid[],p_destino text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.mapa_lancamentos%rowtype;
declare feitos integer:=0;
declare ignorados integer:=0;
begin
 if p_destino not in ('queima','vencidos') or coalesce(array_length(p_ids,1),0) not between 1 and 100 then raise exception 'Seleção inválida';end if;
 if not exists(select 1 from public.usuarios where id=p_usuario_id and ativo=true and perfil='admin' and loja_id=p_loja_id) then raise exception 'Operação não autorizada';end if;
 for r in select * from public.mapa_lancamentos where id=any(p_ids) and loja_id=p_loja_id and excluido_em is null order by id for update loop
  if r.quantidade<=0 then ignorados:=ignorados+1;continue;end if;
  if p_destino='queima' then
   if exists(select 1 from public.queima where lancamento_id=r.id and loja_id=p_loja_id and estado in ('pendente','aprovado')) then ignorados:=ignorados+1;continue;end if;
   insert into public.queima(loja_id,lancamento_id,ean,lote,validade,quantidade,motivo,estado,origem_mapa,usuario_id)
   values(p_loja_id,r.id,r.ean,r.lote,r.validade,r.quantidade,'4','pendente',r.mapa_nome,p_usuario_id);
  else
   insert into public.vencidos(loja_id,lancamento_id,ean,mapa_origem,lote,validade,quantidade,motivo,usuario_id)
   values(p_loja_id,r.id,r.ean,r.mapa_nome,r.lote,r.validade,r.quantidade,'vencido',p_usuario_id);
   update public.mapa_lancamentos set quantidade=0,atualizado_em=now() where id=r.id;
  end if;
  feitos:=feitos+1;
 end loop;
 return jsonb_build_object('processados',feitos,'ignorados',ignorados);
end;$$;
revoke execute on function public.encaminhar_mapa(text,uuid,uuid[],text) from public,anon,authenticated;
commit;
