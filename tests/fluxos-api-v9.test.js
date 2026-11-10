import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from '../api/index.js';
const token='b'.repeat(64),actorid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hash=createHash('sha256').update(token).digest('hex');
function apiRequest(path,method='POST',body={}){
 const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.value=JSON.parse(v);}};
 return handler({method,url:'/api'+path,headers:{host:'test.local',authorization:'Bearer '+token},body},response).then(()=>response);
}
function fakeDb(actor,extra={}){
 const calls=[];
 const originalFetch=global.fetch;
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_dummy';
 global.fetch=async (url,options={})=>{
  const u=new URL(url),table=u.pathname.split('/').pop(),method=options.method||'GET';
  const body=options.body?JSON.parse(options.body):null;calls.push({table,method,body,url:u});
  let data=[];
  if(table==='sessoes')data=[{token_hash:hash,usuario_id:actorid,expira_em:new Date(Date.now()+3600000).toISOString(),ultima_atividade:new Date().toISOString(),manter_conectado:true}];
  else if(table==='usuarios')data=[{id:actorid,nome:actor.nome||'Funcionário',nome_normalizado:(actor.nome||'Funcionário').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),loja_id:'151',perfil:actor.perfil,ativo:true}];
  else if(table==='lojas')data=null;
  else if(table==='transferencias')data=[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',...body}];
  else if(table==='mapa_lancamentos')data=[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',loja_id:'151',mapa_nome:'Estoque',quantidade:2,ean:'7891234567890',lote:'AAA',validade:'2026-12-31',excluido_em:null}];
  else if(table==='gravar_lancamento')data={status:'saved',id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
  else if(table==='queima')data=[{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',loja_id:'151',estado:extra.queimaEstado||'pendente'}];
  else if(table==='auditoria')data=null;
  else data=[];
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 return {calls,restore(){global.fetch=originalFetch;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;}};
}
test('funcionário não pode lançar transferência manipulando API',async()=>{const db=fakeDb({perfil:'funcionario'});try{
 const r=await apiRequest('/transferencias','POST',{ean:'7891234567890',quantidade:1,loja_origem:'152',romaneio:'100',validade:'2026-12-31',lote:'A',requestId:'abcdef0123456789'});
 assert.equal(r.statusCode,403);assert.equal(db.calls.filter(x=>x.table==='transferencias').length,0);
}finally{db.restore();}});
test('administrador registra transferência da origem para sua loja com idempotência',async()=>{const db=fakeDb({perfil:'admin'});try{
 const r=await apiRequest('/transferencias','POST',{ean:'7891234567890',quantidade:1,loja_origem:'152',loja_destino:'999',romaneio:'ROM-1',validade:'2026-12-31',lote:'A',requestId:'abcdef0123456789'});
 assert.equal(r.statusCode,200);assert.equal(r.value.sucesso,true);
 const insert=db.calls.find(x=>x.table==='transferencias');assert.equal(insert.body.loja_destino,'151');assert.equal(insert.body.request_id,'abcdef0123456789');assert.equal(insert.url.searchParams.get('on_conflict'),'request_id');
}finally{db.restore();}});
test('administrador não pode escolher mapa de outro funcionário no lançamento',async()=>{const db=fakeDb({perfil:'admin'});try{
 const r=await apiRequest('/mapas','POST',{mapa:'Isabela',ean:'7891234567890',lote:'A',validade:'2026-12-31',quantidade:1,requestId:'abcdef0123456789'});
 assert.equal(r.statusCode,403);assert.match(r.value.mensagem,/abas especiais/);
}finally{db.restore();}});
test('funcionário tem mapa definido pelo login mesmo se enviar mapa especial',async()=>{const db=fakeDb({perfil:'funcionario',nome:'Isabela'});try{
 const r=await apiRequest('/mapas','POST',{mapa:'Psicotropicos',ean:'7891234567890',lote:'A',validade:'2026-12-31',quantidade:1,requestId:'abcdef0123456789'});
 assert.equal(r.statusCode,200);const rpc=db.calls.find(x=>x.table==='gravar_lancamento');assert.equal(rpc.body.p_mapa_nome,'Isabela');
}finally{db.restore();}});
test('não permite excluir Queima aprovada',async()=>{const db=fakeDb({perfil:'admin'},{queimaEstado:'aprovado'});try{
 const r=await apiRequest('/queima','DELETE',{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'});
 assert.equal(r.statusCode,409);assert.equal(db.calls.filter(x=>x.table==='queima'&&x.method==='DELETE').length,0);
}finally{db.restore();}});
