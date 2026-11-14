import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import handler from '../api/index.js';

const root=new URL('../',import.meta.url);
const app=readFileSync(new URL('public/assets/app.js',root),'utf8');
const api=readFileSync(new URL('api/index.js',root),'utf8');
const TOKEN='7'.repeat(64);
const HASH=createHash('sha256').update(TOKEN).digest('hex');
const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const linha={linha:4,codigo_interno:'88441',validade:'2027-11-24',quantidade:1,preco_gondola:7.48,data_lancamento:'2026-10-26',ocorrencia:1,aprovado:true};

function cenário({upstreamStatus=500,code='42702',message='column reference "ean" is ambiguous',networkError=null}={}){
 const previous=globalThis.fetch,oldBase=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 const calls=[];
 globalThis.fetch=async(url,init={})=>{
  const u=new URL(url),table=u.pathname.split('/rest/v1/')[1];
  calls.push({table,method:init.method||'GET',body:init.body?JSON.parse(init.body):null});
  if(table==='sessoes')return new Response(JSON.stringify([{token_hash:HASH,usuario_id:ID,expira_em:'2099-12-30T00:00:00Z',ultima_atividade:new Date().toISOString()}]),{status:200,headers:{'content-type':'application/json'}});
  if(table==='usuarios')return new Response(JSON.stringify([{id:ID,perfil:'admin',loja_id:'151',ativo:true,nome:'Admin'}]),{status:200,headers:{'content-type':'application/json'}});
  if(table==='rpc/conciliar_queima_relatorio_v43'){
    if(networkError)throw networkError;
    return new Response(JSON.stringify({code,message,details:'detalhe do banco'}),{status:upstreamStatus,headers:{'content-type':'application/json'}});
  }
  return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,async execute(){
  const result={statusCode:200,setHeader(){},end(value){this.data=JSON.parse(value)}};
  await handler({method:'POST',url:'/api/index.js?route=queima/conciliar-relatorio',headers:{authorization:`Bearer ${TOKEN}`,host:'test.local'},body:{itens:[linha],primeira_carga:true,corrigir_aprovados:false,simular:true}},result);
  return result;
 },restore(){globalThis.fetch=previous;
  if(oldBase===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldBase;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }};
}
for (const [sqlstate,expectMessage,status] of [
  ['42702','ambígua',502],
  ['42703','coluna inexistente',502],
  ['42883','versão instalada',502],
  ['23502','campo obrigatório',502],
  ['23505','chave duplicada',502],
  ['57014','limite de tempo',504],
])test(`prévia de Queima revela causa SQLSTATE ${sqlstate} sem gravação`,async()=>{
 const ctx=cenário({code:sqlstate});const previousLog=console.error;console.error=()=>{};
 try{
  const r=await ctx.execute();assert.equal(r.statusCode,status,JSON.stringify(r.data));
  assert.match(r.data.mensagem,new RegExp(sqlstate));
  assert.match(r.data.mensagem,new RegExp(expectMessage));
  assert.match(r.data.referencia,/^[A-F0-9]{8}$/);
  assert.equal(ctx.calls.find(x=>x.table==='rpc/conciliar_queima_relatorio_v43').body.p_simular,true);
  assert.ok(!ctx.calls.some(x=>x.table==='auditoria'||x.method==='PATCH'||x.table==='queima'&&x.method==='POST'));
 }finally{console.error=previousLog;ctx.restore()}
});

test('erros não categorizados continuam protegidos sem dados privados do XLSX',async()=>{
 const ctx=cenário({code:'XX999',message:'secret-value: 1212345691111'});const old=console.error;console.error=()=>{};
 try{const r=await ctx.execute();assert.equal(r.statusCode,502);assert.match(r.data.mensagem,/XX999/);
  assert.doesNotMatch(r.data.mensagem,/secret-value/);assert.match(r.data.referencia,/^[A-F0-9]{8}$/);
 }finally{console.error=old;ctx.restore()}
});

test('falha de conexão gera diagnóstico de rede, sem aprovar produtos',async()=>{
 const ctx=cenário({networkError:new TypeError('fetch failed')});const old=console.error;console.error=()=>{};
 try{const r=await ctx.execute();assert.equal(r.statusCode,502);assert.match(r.data.mensagem,/Supabase/);assert.match(r.data.referencia,/^[A-F0-9]{8}$/);
 }finally{console.error=old;ctx.restore()}
});

test('interface executa diagnóstico com somente uma linha em modo simulação; mantém confirmação desabilitada',()=>{
 assert.match(app,/resumo\.textContent='Não foi possível conferir o relatório completo/);
 assert.match(app,/relatorio\.itens\.slice\(0,1\)/);
 assert.match(app,/simular:true/);
 assert.match(app,/Nenhum lançamento foi alterado/);
 assert.match(api,/console\.error\('\[Supabase\]'/);
 assert.match(api,/upstreamCode=sqlstate/);
});
