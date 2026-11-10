-- v14 - Controle de retirada de vencidos pelo próprio funcionário / administrador.
-- Migração aditiva, sem apagar registros. Requer SQLs 001..009 previamente aplicadas.
create or replace function public.retirar_vencido_visualizacao(
 p_loja text,p_usuario uuid,p_lancamento uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.mapa_lancamentos%rowtype;
declare u public.usuarios%rowtype;
declare secao text;
declare dias integer;
declare prazo integer;
begin
 select * into u from public.usuarios where id=p_usuario and loja_id=p_loja and ativo=true;
 if not found or u.perfil not in ('funcionario','admin') then raise exception 'Usuário não autorizado';end if;
 select * into r from public.mapa_lancamentos where id=p_lancamento and loja_id=p_loja and excluido_em is null for update;
 if not found then raise exception 'Registro não localizado';end if;
 if u.perfil='funcionario' and (r.tipo_mapa<>'funcionario' or r.mapa_nome<>u.nome or
    (r.funcionario_id is not null and r.funcionario_id<>u.id)) then raise exception 'Mapa não pertence ao usuário';end if;
 if r.quantidade<=0 then raise exception 'Nenhuma unidade disponível para retirada';end if;
 select coalesce(p.secao,'') into secao from public.produtos p where p.id=r.produto_id;
 dias:=r.validade - (now() at time zone 'America/Sao_Paulo')::date;
 prazo:=case when upper(coalesce(secao,'')) ~ 'ALIMENT|CONVENI|NUTRI' then 15 else 60 end;
 if dias>prazo then raise exception 'Produto ainda não está no prazo de retirada';end if;
 if exists(select 1 from public.vencidos v where v.lancamento_id=r.id and v.loja_id=p_loja and v.excluido_em is null) then
    raise exception 'Já existe retirada para este lançamento';
 end if;
 insert into public.vencidos(loja_id,lancamento_id,ean,mapa_origem,lote,validade,quantidade,motivo,usuario_id)
 values(p_loja,r.id,r.ean,r.mapa_nome,r.lote,r.validade,r.quantidade,'vencido',u.id);
 update public.mapa_lancamentos set quantidade=0,atualizado_em=now() where id=r.id;
 return jsonb_build_object('sucesso',true,'quantidade',r.quantidade);
end;$$;
revoke all on function public.retirar_vencido_visualizacao(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.retirar_vencido_visualizacao(text,uuid,uuid) to service_role;
