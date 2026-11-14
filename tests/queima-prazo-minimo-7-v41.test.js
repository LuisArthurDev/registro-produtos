import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 hojeSaoPaulo, limiteMinimoQueima as limiteAPI,
 prazoInsuficienteParaQueima as insuficienteAPI
} from '../api/index.js';
import {
 limiteMinimoQueima as limiteWeb,
 prazoInsuficienteParaQueima as insuficienteWeb
} from '../public/assets/queima-xls.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const aumentar=(iso,offset)=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};

test('7 dias corridos exatos, sem incluir data de hoje: cliente e servidor concordam',()=>{
 const hoje='2026-11-14';assert.equal(limiteAPI(hoje),'2026-11-21');assert.equal(limiteWeb(hoje),'2026-11-21');
 for(const offset of [-365,-1,0,1,2,3,4,5,6,7,8,60]){
  const data=aumentar(hoje,offset),esperado=offset<7;
  assert.equal(insuficienteAPI(data,hoje),esperado,`API: ${data}`);
  assert.equal(insuficienteWeb(data,hoje),esperado,`Web: ${data}`);
 }
});

test('Cálculo atravessa mês, virada do ano, ano bissexto e horário de verão em UTC sem deslocar data',()=>{
 const casos=[['2026-12-28','2027-01-04'],['2026-11-30','2026-12-07'],['2028-02-26','2028-03-04'],['2028-02-28','2028-03-06'],['2027-03-10','2027-03-17']];
 for(const [hoje,limite] of casos){
  assert.equal(limiteAPI(hoje),limite);assert.equal(limiteWeb(hoje),limite);
  assert.equal(insuficienteAPI(aumentar(limite,-1),hoje),true);
  assert.equal(insuficienteAPI(limite,hoje),false);
 }
});

test('Datas inválidas nunca podem ser lançadas, nem por importação XLS',()=>{
 for(const data of ['2026-02-30','2026-11-31','2026-11','',null,undefined,'abc','2026-11-20T00:00:00Z']){
  assert.equal(insuficienteAPI(data,'2026-11-14'),true,String(data));
  assert.equal(insuficienteWeb(data,'2026-11-14'),true,String(data));
 }
});

test('A API bloqueia manual e mapa antes de gravar; XLS registra ignorados de prazo',()=>{
 const api=read('api/index.js'),front=read('public/assets/app.js');
 assert.match(api,/const validarPrazoQueima=validade=>\{if\(prazoInsuficienteParaQueima\(validade\)\)/);
 assert.match(api,/validarPrazoQueima\(data\.validade\)/);
 assert.match(api,/for\(const item of itens\)validarPrazoQueima\(item\.validade\)/);
 assert.match(api,/const hoje=hojeSaoPaulo\(\),limite=limiteMinimoQueima\(hoje\)/);
 assert.match(api,/if\(r\.validade<limite\)prazoInsuficiente\+\+/);
 assert.match(api,/rpc\/importar_queima_xls_v40/);
 assert.match(front,/prazoInsuficienteParaQueima\(body\.validade,nowBrISO\(\)\)/);
 assert.match(front,/prazoInsuficienteParaQueima\(reg\.validade,nowBrISO\(\)\)/);
 assert.match(front,/prazoInsuficienteParaQueima\(r\.validade,nowBrISO\(\)\)/);
 assert.match(front,/prazoInsuficienteParaQueima\(x\.validade,hoje\)/);
 assert.match(front,/menos de 7 dias/);
 assert.match(front,/ignorados_prazo_insuficiente/);
 assert.doesNotMatch(front,/vencidoParaQueima\(/);
});

test('SQL 023 substitui o trigger de inclusão e as duas RPCs, respeitando 7 dias no fuso local',()=>{
 const sql=read('supabase/023_queima_prazo_minimo_7_dias.sql');
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/^COMMIT;/m);
 for(const n of ['bloquear_queima_vencida_v40','encaminhar_mapa_queima_v40','importar_queima_xls_v40'])
  assert.match(sql,new RegExp(`CREATE OR REPLACE FUNCTION public\\.${n}\\(`));
 assert.match(sql,/NEW\.validade < \(\(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date \+ 7\)/);
 assert.match(sql,/item\.validade < \(\(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date \+ 7\)/);
 assert.match(sql,/IF validade < \(\(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date \+ 7\) THEN/);
 assert.match(sql,/BEFORE INSERT OR UPDATE OF validade ON public\.queima/);
 assert.match(sql,/prazo_curto:=prazo_curto\+1;CONTINUE/);
 assert.match(sql,/'ignorados_prazo_insuficiente',prazo_curto/);
 assert.match(sql,/'ignorados_vencidos',vencidos/);
 assert.match(sql,/ON CONFLICT DO NOTHING RETURNING id INTO novo_id/);
 assert.doesNotMatch(sql,/DELETE FROM public\.|TRUNCATE public\.|DROP TABLE/i);
});

test('Migration SQL 023 tem etapa própria no Actions, sem substituir a base SQL 022',()=>{
 const workflow=read('.github/workflows/migracao-supabase.yml');
 assert.match(workflow,/\- queima_prazo_minimo_7_dias_v41/);
 assert.match(workflow,/if: inputs\.etapa == 'queima_prazo_minimo_7_dias_v41'/);
 assert.match(workflow,/supabase\/023_queima_prazo_minimo_7_dias\.sql/);
 assert.match(workflow,/supabase\/022_importacao_xls_queima_validade\.sql/);
 const sql=read('supabase/023_queima_prazo_minimo_7_dias.sql');
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.importar_queima_xls_v40/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.importar_queima_xls_v40/);
});
