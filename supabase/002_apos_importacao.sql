-- Execute após a importação inicial no SQL Editor do Supabase.
-- Associa mapa à tabela de produtos para mostrar descrição, seção e código interno.
update public.mapa_lancamentos m
set produto_id=p.id
from public.produtos p
where m.produto_id is null and m.ean=p.ean;

-- Em Vencidos, parte dos códigos históricos são internos (não EANs).
-- Só completa o EAN quando o código interno corresponde exatamente a 1 produto,
-- evitando associações ambíguas.
with unicos as (
  select codigo_interno, min(ean) as ean
  from public.produtos
  where codigo_interno is not null and codigo_interno<>''
  group by codigo_interno having count(*)=1
)
update public.vencidos v
set ean=u.ean
from unicos u
where v.ean is null and v.codigo_interno=u.codigo_interno;

-- Conferências (sem apagar, somar ou alterar registros originais).
select 'produtos' as origem,count(*) as total from public.produtos
union all select 'mapa_lancamentos',count(*) from public.mapa_lancamentos
union all select 'usuarios',count(*) from public.usuarios
union all select 'vencidos',count(*) from public.vencidos
union all select 'queima',count(*) from public.queima;
