import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import handler from '../api/index.js';
const token='3'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const staff='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id1='cccccccc-cccc-4ccc-8ccc-cccccccccccc',id2='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const front=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const stand=readFileSync(new URL('../public/lancamentos.html',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/019_descer_estoque_em_lote.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/migracao-supabase.yml',import.meta.url),'utf8');
function env({perfil='admin',destinoExiste=true}={}){
 const oldFetch=global.fetch,u=process.env.SUPABASE_URL,k=process.env.SUPABASE_SECRET_KEY,calls=[];
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_fake';
 global.fetch=async(url,opts={})=>{
  const q=new URL(url),table=q.pathname.split('/rest/v1/')[1],method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;
  calls.push({table,method,body,params:q.searchParams});let r=[];
  if(table==='sessoes')r=[{token_hash:hash,usuario_id:admin,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true}];
  if(table==='usuarios')r=q.searchParams.has('id')?[{id:admin,loja_id:'151',nome:'Gestor',nome_normalizado:'gestor',perfil,ativo:true}]:destinoExiste?[{id:staff,nome:'Isabela',nome_normalizado:'isabela',perfil:'funcionario',loja_id:'151',ativo:true}]:[];
  if(table==='rpc/descer_estoque_lote')r={sucesso:true,movimentados:body.p_origem_ids.length,novos:body.p_origem_ids.length,idempotentes:0,unidades_novas:8,mapa_destino:body.p_destino};
  if(table==='auditoria')r=null;
  return new Response(JSON.stringify(r),{status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,async req(body={},method='POST'){
   const response={statusCode:200,setHeader(){},end(text){this.data=JSON.parse(text);}};
   await handler({method,url:'/api/index.js?route=mapas/descer-lote',headers:{host:'test.local',authorization:'Bearer '+token},body},response);
   return response;
  },restore(){global.fetch=oldFetch;if(u===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=u;if(k===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=k;}};
}
const params={ids:[id1,id2],destino:'Isabela',requestId:'f0f0f0f0-1111-4222-8333-999999999999'};
test('admin envia vários selecionados da mesma loja em uma única RPC atômica',async()=>{
 const e=env();try{
  const r=await e.req(params);assert.equal(r.statusCode,200);assert.equal(r.data.sucesso,true);assert.equal(r.data.movimentados,2);
  const calls=e.calls.filter(x=>x.table==='rpc/descer_estoque_lote');assert.equal(calls.length,1);
  assert.deepEqual(calls[0].body.p_origem_ids,[id1,id2]);assert.equal(calls[0].body.p_loja_id,'151');
  assert.equal(calls[0].body.p_usuario_id,admin);assert.equal(calls[0].body.p_request_id,params.requestId);
  assert.equal(e.calls.filter(x=>x.table==='auditoria').length,1);
 }finally{e.restore();}
});
test('não permite lote de funcionário comum',async()=>{
 const e=env({perfil:'funcionario'});try{
  const r=await e.req(params);assert.equal(r.statusCode,403);
  assert.ok(!e.calls.some(x=>x.table==='rpc/descer_estoque_lote'));
 }finally{e.restore();}
});
test('rejeita destinos de outra loja e Estoque',async()=>{
 const e=env({destinoExiste:false});try{
  assert.equal((await e.req(params)).statusCode,403);
  assert.equal((await e.req({...params,destino:'Estoque'})).statusCode,422);
  assert.ok(!e.calls.some(x=>x.table==='rpc/descer_estoque_lote'));
 }finally{e.restore();}
});
test('rejeita IDs duplicados e lote vazio antes de modificar a base',async()=>{
 const e=env();try{
  for(const ids of [[],[id1,id1],['nao-uuid']])assert.equal((await e.req({...params,ids})).statusCode,422);
  assert.ok(!e.calls.some(x=>x.table==='rpc/descer_estoque_lote'));
 }finally{e.restore();}
});
test('mapa de destino continua selecionado após form.reset e usa chave por conta/loja',()=>{
 assert.match(front,/const chaveMapaDestino=\(usuario\)=>/);
 assert.match(front,/localStorage\.getItem\(key\)/);
 assert.match(front,/f\.elements\.mapa\.addEventListener\('change'/);
 assert.match(front,/const destinoAnterior=form\.elements\.mapa\?\.value/);
 assert.match(front,/form\.reset\(\);\s*if\(form\.elements\.mapa&&special\.includes\(destinoAnterior\)\)/);
 assert.match(front,/form\.elements\.mapa\.value=destinoAnterior/);
});
test('Estoque oferece selecionar todos filtrados e descida com confirmação',()=>{
 assert.match(front,/id="stock-select-filtered"/);
 assert.match(front,/id="stock-descend-selected"/);
 assert.match(front,/for\(const r of filtered\).*selected\.add\(r\.id\)/);
 assert.match(front,/const aptos=\[\.\.\.selected\]/);
 assert.match(front,/confirmDialog\('Confirmar descida em lote'/);
 assert.match(front,/request\('\/mapas\/descer-lote'/);
 assert.match(index,/id="stock-bulk-dialog"/);assert.match(stand,/id="stock-bulk-dialog"/);
});
test('SQL 019 é uma transação única, faz lock e preserva idempotência',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.descer_estoque_lote/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/public\.descer_estoque\(v_req/);
 assert.match(sql,/v_funcionario_id:=NULL/);
 assert.match(sql,/u\.id INTO v_funcionario_id/);
 assert.match(sql,/m\.request_id=v_req/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.descer_estoque_lote/);
 assert.match(sql,/NOTIFY pgrst/);
 assert.match(workflow,/descer_estoque_lote/);
});
