import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
import {interpretarRelatorioQueimaLinhas} from '../public/assets/queima-relatorio-xlsx.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='6'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',burnId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rows=[
 {linha:3,colunas:['Data','Produto','Regional','Loja','Usuário','Curva','Data da Aprovação','Data de Validade','Aproado','Unidade','Valor Total','Preço']},
 {linha:4,colunas:['46321','88441 - CHÁ LEÃO 10 SCH','Edinaldo','V151 - Praça','','E','46321','46350','S','1','14.95','7.48']},
 {linha:5,colunas:['46321','88441 - CHÁ LEÃO 10 SCH','Edinaldo','V151 - Praça','','E','46321','46350','S','1','14.95','7.48']},
 {linha:6,colunas:['46321','68117 - GEL LIMPADOR','Edinaldo','V151 - Praça','','E','','46446','S','2','58.99','']},
 {linha:7,colunas:['46321','1042 - REMÉDIO','Edinaldo','V151 - Praça','','A','','46507','N','3','19.99','6.66']},
 {linha:8,colunas:['46321','1001 - LOJA DIFERENTE','Edinaldo','V152 - Praça','','E','','46507','S','1','9.99','2.50']}
];
const item={linha:4,codigo_interno:'88441',validade:'2026-11-24',quantidade:1,preco_gondola:7.48,data_lancamento:'2026-10-26',ocorrencia:1,aprovado:true};
function mock({perfil='admin',status='aprovado',importado=false,quantidadePendente=false}={}){
 const old=globalThis.fetch, envUrl=process.env.SUPABASE_URL, envSec=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 const calls=[];
 globalThis.fetch=async(url,opt={})=>{
  const u=new URL(url),table=u.pathname.split('/rest/v1/')[1],method=opt.method||'GET',body=opt.body?JSON.parse(opt.body):null;
  calls.push({table,method,body,params:u.searchParams});let data=[];
  if(table==='sessoes')data=[{token_hash:hash,usuario_id:actorId,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
  else if(table==='usuarios')data=[{id:actorId,loja_id:'151',perfil,ativo:true,nome:'Admin'}];
  else if(table==='queima')data=[{id:burnId,loja_id:'151',estado:status,quantidade:quantidadePendente?0:2,quantidade_pendente:quantidadePendente,aprovado_via_importacao:importado,validade:'2026-12-30',validade_gondola:'2026-12-30',preco_gondola:importado?null:8.5,registro_queima:'166240'}];
  else if(table==='rpc/conciliar_queima_relatorio_v43')data={simulacao:body.p_simular,contagem:{aprovar_existente:1,sem_preco:1,sem_catalogo:0},amostras:[{linha:4,acao:'aprovar_existente'}]};
  else if(table==='auditoria')data=null;
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,async call(route,method='POST',body={}){
  const r={statusCode:200,setHeader(){},end(text){this.data=JSON.parse(text)}};
  await handler({url:'/api/index.js?route='+route,method,headers:{host:'test.local',authorization:'Bearer '+token},body},r);
  return r;
 },restore(){globalThis.fetch=old;if(envUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=envUrl;
 if(envSec===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=envSec;}};
}
test('leitor XLSX: somente S, repetições independentes, preço em L e não inventa lote nem Registro',()=>{
 const result=interpretarRelatorioQueimaLinhas(rows,{loja:'151'});
 assert.equal(result.resumo.total,5);assert.equal(result.resumo.aprovados,4);assert.equal(result.resumo.nao_aprovados,1);
 assert.equal(result.resumo.outras_lojas,1);assert.equal(result.resumo.sem_preco,1);
 assert.equal(result.itens.length,3);assert.equal(result.itens[0].codigo_interno,'88441');
 assert.equal(result.itens[0].preco_gondola,7.48);
 assert.equal(result.itens[0].ocorrencia,1);assert.equal(result.itens[1].ocorrencia,2);
 assert.equal(result.itens[2].preco_gondola,null);
 assert.equal(result.itens[0].validade,'2026-11-24');
 assert.equal(result.sem_lote,true);assert.equal(result.sem_registro,true);
 assert.equal('lote' in result.itens[0],false);
});
test('Preço e quantidade editados futuramente não alteram a ocorrência estável do relatório',()=>{
 const original=interpretarRelatorioQueimaLinhas(rows,{loja:'151'});
 const altered=rows.map(r=>({...r,colunas:[...r.colunas]}));
 altered[1].colunas[9]='9';altered[1].colunas[11]='22.50';
 const reparsed=interpretarRelatorioQueimaLinhas(altered,{loja:'151'});
 assert.equal(original.itens[0].ocorrencia,reparsed.itens[0].ocorrencia);
 const sql=read('supabase/025_conciliar_queima_relatorio_aprovados.sql');
 assert.match(sql,/v_origem:=md5\(concat_ws\('\|',p_loja_id,ltrim\(v_cod,'0'\),v_validade::text,v_data::text,v_ocorrencia::text\)\)/);
 assert.match(sql,/WHERE q.loja_id=p_loja_id AND q.origem_relatorio_chave=v_origem/);
 assert.match(sql,/ELSIF p_corrigir_aprovados AND v_estado='aprovado' THEN/);
});
test('prévia de conciliação NÃO grava e passa opções seguras para RPC',async()=>{
 const env=mock();try{
  const r=await env.call('queima/conciliar-relatorio','POST',{itens:[item],primeira_carga:true,corrigir_aprovados:false,simular:true});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));assert.equal(r.data.resultado.simulacao,true);
  const rpc=env.calls.find(c=>c.table==='rpc/conciliar_queima_relatorio_v43');assert.ok(rpc);
  assert.equal(rpc.body.p_simular,true);assert.equal(rpc.body.p_primeira_carga,true);
  assert.equal(rpc.body.p_corrigir_aprovados,false);assert.equal(rpc.body.p_itens[0].codigo_interno,'88441');
  assert.ok(!env.calls.some(c=>c.table==='auditoria'));
 }finally{env.restore();}
});
test('aplicar conciliação usa RPC e registra auditoria; sem POST direto de aprovados',async()=>{
 const env=mock();try{
  const r=await env.call('queima/conciliar-relatorio','POST',{itens:[item],primeira_carga:true,corrigir_aprovados:false,simular:false});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));assert.ok(env.calls.some(c=>c.table==='auditoria'));
  assert.equal(env.calls.find(c=>c.table==='rpc/conciliar_queima_relatorio_v43').body.p_simular,false);
  assert.ok(!env.calls.some(c=>c.table==='queima'&&c.method==='POST'));
 }finally{env.restore();}
});
test('funcionário não concilia; dados ausentes são permitidos, identificadores inválidos são barrados',async()=>{
 const emp=mock({perfil:'funcionario'});try{
  const r=await emp.call('queima/conciliar-relatorio','POST',{itens:[item]});assert.equal(r.statusCode,403);
  assert.ok(!emp.calls.some(c=>c.table==='rpc/conciliar_queima_relatorio_v43'));
 }finally{emp.restore();}
 const admin=mock();try{
  for(const err of [{...item,preco_gondola:-1},{...item,aprovado:false},{...item,validade:'2026-02-30'}]){
   const r=await admin.call('queima/conciliar-relatorio','POST',{itens:[err]});assert.equal(r.statusCode,422,JSON.stringify(r.data));
  }
  assert.ok(!admin.calls.some(c=>c.table==='rpc/conciliar_queima_relatorio_v43'));
 }finally{admin.restore();}
});
test('aprovado pode editar quantidade, validade do produto, validade da gôndola e preço mantendo estado',async()=>{
 const env=mock();try{
  const r=await env.call('queima','PATCH',{id:burnId,acao:'editar_aprovado',quantidade:9,preco_gondola:4.72,validade:'2026-12-31',validade_gondola:'2026-11-30'});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));
  const patch=env.calls.find(c=>c.table==='queima'&&c.method==='PATCH');
  assert.equal(patch.body.quantidade,9);assert.equal(patch.body.preco_gondola,4.72);
  assert.equal(patch.body.validade,'2026-12-31');assert.equal(patch.body.validade_gondola,'2026-11-30');assert.equal(patch.body.estado,undefined);
  assert.ok(env.calls.some(c=>c.table==='auditoria'));
 }finally{env.restore();}
});
test('Aprovado importado sem preço e quantidade conhecida pode corrigir as duas validades sem inventar valores',async()=>{
 const env=mock({importado:true,quantidadePendente:true});try{
  const r=await env.call('queima','PATCH',{id:burnId,acao:'editar_aprovado',quantidade:0,preco_gondola:null,
   validade:'2026-11-18',validade_gondola:'2026-11-19'});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));
  const patch=env.calls.find(x=>x.table==='queima'&&x.method==='PATCH');
  assert.equal(patch.body.validade,'2026-11-18');assert.equal(patch.body.validade_gondola,'2026-11-19');
  assert.equal(patch.body.quantidade,0);assert.equal(patch.body.quantidade_pendente,true);
  assert.equal(patch.body.preco_gondola,null);assert.equal(patch.body.estado,undefined);
 }finally{env.restore();}
});
test('As duas validades são validadas separadamente e não podem ser datas impossíveis',async()=>{
 const env=mock();try{
  for(const patch of [
   {validade:'2026-02-30',validade_gondola:'2027-01-01'},
   {validade:'2027-01-01',validade_gondola:'2026-11-31'},
  ]){
   const r=await env.call('queima','PATCH',{id:burnId,acao:'editar_aprovado',quantidade:2,preco_gondola:8.9,...patch});
   assert.equal(r.statusCode,422,JSON.stringify(r.data));
  }
  assert.equal(env.calls.filter(x=>x.table==='queima'&&x.method==='PATCH').length,0);
 }finally{env.restore();}
});
test('exclusão do aprovado é lógica e auditável; não faz DELETE físico',async()=>{
 const env=mock();try{
  const r=await env.call('queima','DELETE',{id:burnId});assert.equal(r.statusCode,200);
  const patch=env.calls.find(c=>c.table==='queima'&&c.method==='PATCH');
  assert.ok(patch.body.excluido_em);assert.equal(patch.body.excluido_por,actorId);
  assert.ok(!env.calls.some(c=>c.table==='queima'&&c.method==='DELETE'));
 }finally{env.restore();}
});
test('migration 025 protege Fórmulas Especiais, exige 7 dias para novas entradas e garante idempotência',()=>{
 const sql=read('supabase/025_conciliar_queima_relatorio_aprovados.sql');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.conciliar_queima_relatorio_v43/);
 assert.match(sql,/origem_relatorio_chave/);assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS uq_queima_origem_relatorio_v43/);
 assert.match(sql,/v_validade < \(\(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date\+7\)/);
 assert.match(sql,/formula_especial=true/);
 assert.match(sql,/correspondencia_ambigua/);
 assert.match(sql,/IF v_preco IS NULL THEN/);
 assert.match(sql,/VALUES\(p_loja_id,v_ean,NULL,v_validade/);
 assert.match(sql,/UPDATE public\.queima SET estado='aprovado'/);
 assert.match(sql,/p_simular/);
 assert.doesNotMatch(sql,/\bDELETE FROM public\.queima\b|TRUNCATE public\.queima/i);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.exigir_gondola_aprovacao_v40/);
});
test('botões da interface importam apenas novos e edição dos aprovados é manual',()=>{
 const app=read('public/assets/app.js'),worker=read('public/sw.js'),workflow=read('.github/workflows/migracao-supabase.yml');
 assert.match(app,/id="queima-relatorio-open"/);
 assert.match(app,/id="queima-relatorio-primeira"/);
 assert.doesNotMatch(app,/id="queima-relatorio-corrigir"/);
 assert.match(app,/primeira_carga:primeira.checked,corrigir_aprovados:false/);
 assert.match(app,/id="queima-editar-form"/);
 assert.match(app,/data-edit-burn/);assert.match(app,/data-delete-burn/);
 assert.match(app,/lerRelatorioQueimaXlsx/);assert.match(app,/queima\/conciliar-relatorio/);
 assert.match(worker,/queima-relatorio-xlsx\.js/);
 assert.match(workflow,/supabase\/025_conciliar_queima_relatorio_aprovados\.sql/);
});
