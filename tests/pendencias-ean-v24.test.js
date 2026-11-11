import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
const token='7'.repeat(64), actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', pending='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const hash=createHash('sha256').update(token).digest('hex');
function mock({role='admin',loja='151',catalogado=false}={}){
 const previous=global.fetch,oldUrl=process.env.SUPABASE_URL,oldSecret=process.env.SUPABASE_SECRET_KEY,calls=[];
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_fake';
 global.fetch=async(url,opt={})=>{
  const u=new URL(url),t=u.pathname.split('/rest/v1/')[1],m=opt.method||'GET',body=opt.body?JSON.parse(opt.body):null;
  calls.push({t,m,body,p:u.searchParams});let v=[];
  if(t==='sessoes')v=[{token_hash:hash,usuario_id:actor,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
  if(t==='usuarios')v=[{id:actor,nome:'Administrador',nome_normalizado:'administrador',loja_id:'151',perfil:role,ativo:true}];
  if(t==='lancamento_pendencias')v=m==='GET'?[{id:pending,lancamento_id:id,loja_id:loja,ean:'0001234567890',status:'pendente',mapa_lancamentos:{mapa_nome:'Isabela',lote:'A',validade:'2027-03-01',quantidade:2}}]:null;
  if(t==='catalogo_pendencias'||t==='migracao_pendencias')v=m==='GET'?[]:null;
  if(t==='organizacao_secoes')v=[];
  if(t==='produtos')v=catalogado?[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',ean:'0001234567890'}]:[];
  if(t==='rpc/gravar_lancamento')v={status:'saved',id};
  if(t==='auditoria'||(m==='PATCH'&&t==='mapa_lancamentos'))v=null;
  return new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,async req(path,method='GET',body={}){
  const r={statusCode:0,setHeader(){},end(text){this.json=JSON.parse(text);}};
  await handler({method,url:'/api/index.js?route='+path,headers:{host:'test.local',authorization:'Bearer '+token},body},r);return r;
 },restore(){global.fetch=previous;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldSecret===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldSecret;}};
}
test('lançamento não cadastrado pode ser gravado e retorna indicação de pendência',async()=>{
 const t=mock({role:'funcionario'});try{
  const r=await t.req('mapas','POST',{ean:'0001234567890',lote:'A',validade:'2027-03-01',quantidade:2,requestId:'1234567890'});
  assert.equal(r.statusCode,200);assert.equal(r.json.status,'saved');assert.equal(r.json.pendenciaEan,true);
  assert.ok(t.calls.some(x=>x.t==='lancamento_pendencias'&&x.m==='GET'));
 }finally{t.restore();}
});
test('administrador vê pendências de lançamentos filtradas à sua loja',async()=>{
 const t=mock();try{
  const r=await t.req('pendencias');assert.equal(r.statusCode,200);
  assert.equal(r.json.lancamentos[0].ean,'0001234567890');
  const c=t.calls.find(x=>x.t==='lancamento_pendencias');assert.equal(c.p.get('loja_id'),'eq.151');
 }finally{t.restore();}
});
test('ação Ignorar pendência preserva lançamento e exige loja correta',async()=>{
 const t=mock();try{
  const r=await t.req('pendencias','POST',{acao:'ignorar',tipo:'lancamento',id:pending});assert.equal(r.statusCode,200);
  assert.ok(t.calls.some(x=>x.t==='lancamento_pendencias'&&x.m==='PATCH'&&x.body.status==='ignorada'));
  assert.ok(!t.calls.some(x=>x.t==='mapa_lancamentos'&&x.m==='DELETE'));
 }finally{t.restore();}
});
test('administrador não pode ignorar pendência de outra loja',async()=>{
 const t=mock({loja:'152'});try{
  const r=await t.req('pendencias','POST',{acao:'ignorar',tipo:'lancamento',id:pending});assert.equal(r.statusCode,403);
  assert.ok(!t.calls.some(x=>x.t==='lancamento_pendencias'&&x.m==='PATCH'));
 }finally{t.restore();}
});
test('funcionário não acessa pendências do administrador',async()=>{
 const t=mock({role:'funcionario'});try{assert.equal((await t.req('pendencias')).statusCode,403);}finally{t.restore();}
});
test('SQL 016 ativa trigger de detecção e resolução, com restrição de visibilidade',()=>{
 const sql=readFileSync(new URL('../supabase/016_pendencias_ean_lancamentos.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TRIGGER tg_pendencia_ean_lancamento/i);
 assert.match(sql,/ON CONFLICT \(lancamento_id\)/i);
 assert.match(sql,/tg_resolver_ean_catalogo/i);
 assert.match(sql,/ROW LEVEL SECURITY/i);
 assert.match(sql,/status='resolvida'/i);
});
