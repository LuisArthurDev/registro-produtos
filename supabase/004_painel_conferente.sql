-- Paridade funcional — migração aditiva, sem eliminar dados históricos.
-- Instalar com a etapa atualizar_painel do GitHub Actions.
begin;
alter table public.vencidos add column if not exists retirado_em timestamptz;
alter table public.vencidos add column if not exists retirado_por uuid references public.usuarios(id);
alter table public.sinalizacoes add column if not exists situacao text not null default 'aberto';
create index if not exists idx_queima_lancamento on public.queima(loja_id,lancamento_id);

-- Encaminhamento atômico de linhas do mapa: previne atualização parcial.
-- A Queima preserva o mapa de origem; Vencidos zera a quantidade e preserva o registro.
create or replace function public.encaminhar_mapa(
 p_loja_id text, p_usuario_id uuid, p_ids uuid[], p_destino text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.mapa_lancamentos%rowtype;
declare feitos integer:=0;
declare ignorados integer:=0;
begin
 if p_destino not in ('queima','vencidos') or coalesce(array_length(p_ids,1),0) not between 1 and 100 then
   raise exception 'Destino ou seleção inválidos';
 end if;
 if not exists (select 1 from public.usuarios where id=p_usuario_id and ativo=true and perfil in ('admin','geral') and (perfil='geral' or loja_id=p_loja_id)) then
   raise exception 'Operação não autorizada';
 end if;
 for r in select * from public.mapa_lancamentos where id=any(p_ids) and loja_id=p_loja_id order by id for update loop
   if r.quantidade<=0 then ignorados:=ignorados+1;continue;end if;
   if p_destino='queima' then
     if exists (select 1 from public.queima where lancamento_id=r.id and loja_id=p_loja_id and estado in ('pendente','aprovado')) then
       ignorados:=ignorados+1;continue;
     end if;
     insert into public.queima (loja_id,lancamento_id,ean,lote,validade,quantidade,motivo,estado,origem_mapa,usuario_id)
     values (p_loja_id,r.id,r.ean,r.lote,r.validade,r.quantidade,'4','pendente',r.mapa_nome,p_usuario_id);
   else
     insert into public.vencidos (loja_id,lancamento_id,ean,mapa_origem,lote,validade,quantidade,motivo,usuario_id)
     values (p_loja_id,r.id,r.ean,r.mapa_nome,r.lote,r.validade,r.quantidade,'vencido',p_usuario_id);
     update public.mapa_lancamentos set quantidade=0,atualizado_em=now() where id=r.id;
   end if;
   feitos:=feitos+1;
 end loop;
 return jsonb_build_object('processados',feitos,'ignorados',ignorados);
end;$$;

-- Relançar aprovado no mês corrente preservando o item antigo.
create or replace function public.relancar_queima(p_loja_id text,p_usuario_id uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.queima%rowtype;
declare novo_id uuid;
begin
 if not exists (select 1 from public.usuarios where id=p_usuario_id and ativo=true and perfil in ('admin','geral') and (perfil='geral' or loja_id=p_loja_id)) then
   raise exception 'Operação não autorizada';
 end if;
 select * into item from public.queima where id=p_id and loja_id=p_loja_id for update;
 if not found then raise exception 'Registro não localizado na loja';end if;
 if item.estado<>'aprovado' then raise exception 'Somente Queima aprovada pode ser relançada';end if;
 insert into public.queima(loja_id,lancamento_id,ean,lote,validade,quantidade,motivo,estado,origem_mapa,usuario_id)
 values(p_loja_id,item.lancamento_id,item.ean,item.lote,item.validade,item.quantidade,'4','pendente',item.origem_mapa,p_usuario_id)
 returning id into novo_id;
 update public.queima set estado='relancado',atualizado_em=now() where id=item.id;
 return jsonb_build_object('relancado',true,'origem',p_id,'novo_id',novo_id);
end;$$;
revoke execute on function public.encaminhar_mapa(text,uuid,uuid[],text) from public,anon,authenticated;
revoke execute on function public.relancar_queima(text,uuid,uuid) from public,anon,authenticated;
commit;
