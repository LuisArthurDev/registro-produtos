import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import handler, { hashPin } from '../api/index.js';

const accountId='11111111-1111-4111-8111-111111111111';
const token='f'.repeat(64);
const hash=createHash('sha256').update(token).digest('hex');
const sql=readFileSync(new URL('../supabase/011_luis_arthur_duplo_perfil.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const originalEnv={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY};
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY='sb_secret_testing_only';

function mockBackend({role='admin',duplo=true}={}){
 const original=globalThis.fetch;
 const calls=[];
 const user={id:accountId,nome:'Luis Arthur',nome_normalizado:'luis arthur',loja_id:role==='geral'?null:'151',perfil:role,acesso_geral:duplo,titular_painel_geral:true,ativo:true,pin_hash:hashPin('123456'),tentativas:0,bloqueado_ate:null};
 const session={token_hash:hash,usuario_id:accountId,expira_em:'2099-11-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true,modo_acesso:'admin',modo_expira_em:null};
 const fake=async (url,opt={})=>{
  const parsed=new URL(url),table=parsed.pathname.split('/rest/v1/')[1];
  const method=opt.method||'GET',data=opt.body?JSON.parse(opt.body):null;
  calls.push({table,method,body:data,params:parsed.searchParams});
  let result=null;
  if(table==='usuarios'){
   if(method==='GET')result=[{...user}];
   else if(method==='PATCH'){Object.assign(user,data);result=null;}
  }else if(table==='sessoes'){
   if(method==='GET')result=[{...session}];
   else if(method==='PATCH'){Object.assign(session,data);result=null;}
   else if(method==='POST')result=null;
  }else if(table==='auditoria')result=null;
  else if(table==='lojas')result=[{id:'151',nome:'Loja 151'}];
  else if(table==='mapa_lancamentos')result=[];
  else if(table==='rpc/alterar_pin_geral')result=true;
  else result=[];
  return {ok:true,status:200,text:async()=>JSON.stringify(result)};
 };
 globalThis.fetch=fake;
 async function request(method,path,body){
  const res={statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.data=JSON.parse(text);}};
  await handler({method,url:'/api/index.js?route='+path.slice(1),headers:{authorization:'Bearer '+token},body},res);
  return res;
 }
 return {request,calls,user,session,restore(){globalThis.fetch=original;}};
}

test('A conta admin sem acesso duplo não consegue mudar de perfil',async()=>{
 const b=mockBackend({duplo:false});try{
  const r=await b.request('POST','/conta/modo',{modo:'geral',pin:'123456'});
  assert.equal(r.statusCode,403);
  assert.equal(b.calls.filter(x=>x.table==='sessoes'&&x.method==='PATCH').length,0);
 }finally{b.restore();}
});
test('PIN incorreto não habilita modo Geral',async()=>{
 const b=mockBackend();try{
  const r=await b.request('POST','/conta/modo',{modo:'geral',pin:'999999'});
  assert.equal(r.statusCode,401);
  assert.equal(b.session.modo_acesso,'admin');
  const geral=await b.request('GET','/geral');assert.equal(geral.statusCode,403);
 }finally{b.restore();}
});
test('PIN correto habilita modo Geral temporário na mesma conta e mesma sessão',async()=>{
 const b=mockBackend();try{
  let r=await b.request('GET','/geral');assert.equal(r.statusCode,403);
  r=await b.request('POST','/conta/modo',{modo:'geral',pin:'123456'});
  assert.equal(r.statusCode,200);
  assert.equal(r.data.usuario.perfil,'geral');
  assert.equal(r.data.usuario.perfilBase,'admin');
  assert.equal(r.data.usuario.loja,'151');
  assert.equal(b.session.modo_acesso,'geral');
  assert.ok(Date.parse(b.session.modo_expira_em)>Date.now()+29*60000);
  r=await b.request('GET','/geral');assert.equal(r.statusCode,200);
  r=await b.request('GET','/sessao');assert.equal(r.data.usuario.acessoGeral,true);
  assert.equal(r.data.usuario.perfil,'geral');
  assert.equal(r.data.usuario.id,accountId);
 }finally{b.restore();}
});
test('Modo Geral expirado volta a ser administrador de loja',async()=>{
 const b=mockBackend();try{
  b.session.modo_acesso='geral';b.session.modo_expira_em='2020-01-01T00:00:00Z';
  const r=await b.request('GET','/geral');assert.equal(r.statusCode,403);
  const state=await b.request('GET','/sessao');assert.equal(state.data.usuario.perfil,'admin');
 }finally{b.restore();}
});
test('Sair do Geral restaura permissões de loja; não permite consultar outro estabelecimento',async()=>{
 const b=mockBackend();try{
  b.session.modo_acesso='geral';b.session.modo_expira_em='2099-10-01T00:00:00Z';
  let r=await b.request('POST','/conta/modo',{modo:'admin'});
  assert.equal(r.statusCode,200);assert.equal(r.data.usuario.perfil,'admin');
  r=await b.request('GET','/mapas');assert.equal(r.statusCode,200);
  const query=b.calls.find(x=>x.table==='mapa_lancamentos'&&x.method==='GET');
  assert.equal(query.params.get('loja_id'),'eq.151');
  r=await b.request('GET','/geral');assert.equal(r.statusCode,403);
 }finally{b.restore();}
});
test('Não fornece acesso Geral a funcionário nem administrador tradicional',async()=>{
 const b=mockBackend({role:'funcionario'});try{
  assert.equal((await b.request('POST','/conta/modo',{modo:'geral',pin:'123456'})).statusCode,403);
 }finally{b.restore();}
});
test('Migração só privilegia Luis Arthur da Loja 151, não altera PIN e exige alvo único',()=>{
 assert.match(sql,/nome_normalizado='luis arthur'/);
 assert.match(sql,/loja_id='151'/);
 assert.match(sql,/IF qtd<>1 THEN/);
 assert.match(sql,/acesso_geral=true/);
 assert.doesNotMatch(sql.split('CREATE OR REPLACE FUNCTION')[0],/pin_hash\s*=/);
 assert.match(sql,/DELETE FROM public\.sessoes WHERE usuario_id=alvo_id/);
 assert.match(sql,/alterar_pin_geral/);
});
test('Botão visível em Painel Geral, Visualização e Lançamentos somente para duplo perfil',()=>{
 assert.match(app,/acessoGeral===true && state\.user\?\.perfilBase==='admin'/);
 assert.match(app,/window\.location\.assign\('\/#painel-geral'\)/);
 for(const path of ['index.html','lancamentos.html','visualizacao.html']){
  const html=readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
  assert.match(html,/id="dual-mode-button".*hidden/);
  assert.match(html,/id="dual-mode-dialog"/);
 }
});
