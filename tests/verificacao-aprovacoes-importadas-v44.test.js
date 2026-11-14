import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import handler from '../api/index.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='d'.repeat(64),sha=createHash('sha256').update(token).digest('hex');
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function ambiente({perfil='admin',aprovado=true,importado=true,verificado=false,conflito=false}={}){
 const original=globalThis.fetch,envUrl=process.env.SUPABASE_URL,envSec=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 let itemDb={id:item,loja_id:'151',ean:'07898962711477',estado:aprovado?'aprovado':'pendente',
   aprovado_via_importacao:importado,importacao_verificada_em:verificado?'2026-11-14T10:00:00Z':null,
   importacao_verificada_por:verificado?user:null,origem_relatorio_chave:'uma-chave',excluido_em:null,
   preco_gondola:8.9,validade_gondola:'2026-11-30',quantidade:2};
 const requests=[];
 globalThis.fetch=async(url,options={})=>{
   const u=new URL(url),table=u.pathname.split('/rest/v1/')[1],method=options.method||'GET';
   const payload=options.body?JSON.parse(options.body):null;requests.push({table,method,payload,params:u.searchParams});
   let data=[];
   if(table==='sessoes')data=[{token_hash:sha,usuario_id:user,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
   else if(table==='usuarios')data=[{id:user,nome:'Admin',loja_id:'151',perfil,ativo:true}];
   else if(table==='queima'){
      const expected=[['id',`eq.${item}`],['loja_id','eq.151'],['estado','eq.aprovado'],
        ['aprovado_via_importacao','eq.true'],['importacao_verificada_em','is.null'],['excluido_em','is.null']];
      const matches=expected.every(([key,value])=>!u.searchParams.has(key)||u.searchParams.get(key)===value||key==='estado'&&u.searchParams.get(key)==='eq.pendente');
      if(method==='PATCH'){
       if(matches&&!conflito){itemDb={...itemDb,...payload};data=[itemDb];}else data=[];
      }else if(matches&&itemDb.estado==='aprovado'&&itemDb.aprovado_via_importacao&&!itemDb.importacao_verificada_em)data=[itemDb];
     }
   else if(table==='auditoria')data=null;
   return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 return {requests,async run(method='PATCH',body={id:item,acao:'verificar_importacao'}){
   const response={statusCode:200,setHeader(){},end(x){this.body=JSON.parse(x)}};
   await handler({url:'/api/index.js?route=queima',method,headers:{host:'test.local',authorization:'Bearer '+token},body},response);
   return response;
 },get itemDb(){return itemDb;},restore(){globalThis.fetch=original;
   if(envUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=envUrl;
   if(envSec===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=envSec;}};
}
test('Verificado marca horário/usuário e mantém estado aprovado, preço, quantidade e origem da importação',async()=>{
 const ctx=ambiente();try{
  const r=await ctx.run();assert.equal(r.statusCode,200,JSON.stringify(r.body));
  const patch=ctx.requests.find(x=>x.table==='queima'&&x.method==='PATCH');
  assert.equal(patch.payload.importacao_verificada_por,user);
  assert.ok(patch.payload.importacao_verificada_em);
  assert.equal(patch.payload.estado,undefined);
  assert.equal(patch.payload.aprovado_via_importacao,undefined);
  assert.equal(ctx.itemDb.estado,'aprovado');assert.equal(ctx.itemDb.aprovado_via_importacao,true);
  assert.equal(ctx.itemDb.quantidade,2);assert.equal(ctx.itemDb.preco_gondola,8.9);
  assert.ok(ctx.requests.some(x=>x.table==='auditoria'&&x.payload?.acao==='verificar_aprovacao_importada'));
 }finally{ctx.restore();}
});
test('A verificação não pode ser repetida; o banco impede alteração concorrente',async()=>{
 for(const opts of [{verificado:true},{conflito:true}]){
  const ctx=ambiente(opts);try{const r=await ctx.run();assert.equal(r.statusCode,409);
   assert.ok(!ctx.requests.some(x=>x.table==='auditoria'));
  }finally{ctx.restore();}
 }
});
test('Itens pendentes e aprovados manualmente não podem ser marcados como verificados',async()=>{
 for(const opts of [{aprovado:false},{importado:false}]){
  const ctx=ambiente(opts);try{const r=await ctx.run();assert.equal(r.statusCode,409);
   assert.ok(!ctx.requests.some(x=>x.table==='queima'&&x.method==='PATCH'));
  }finally{ctx.restore();}
 }
});
test('Somente administrador pode executar Verificado',async()=>{
 const ctx=ambiente({perfil:'funcionario'});try{const r=await ctx.run();assert.equal(r.statusCode,403);
  assert.ok(!ctx.requests.some(x=>x.table==='queima'&&x.method==='PATCH'));
 }finally{ctx.restore();}
});
test('Verificação rejeita IDs malformados antes de escrever',async()=>{
 const ctx=ambiente();try{const r=await ctx.run('PATCH',{id:'abc',acao:'verificar_importacao'});
  assert.equal(r.statusCode,422);assert.ok(!ctx.requests.some(x=>x.table==='queima'&&x.method==='PATCH'));
 }finally{ctx.restore();}
});
test('SQL 026 marca apenas aprovações pelo relatório, preserva confirmação manual e origem',()=>{
 const sql=read('supabase/026_verificacao_aprovacoes_importadas.sql');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS aprovado_via_importacao boolean NOT NULL DEFAULT false/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS importacao_verificada_em timestamptz/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS importacao_verificada_por uuid/);
 assert.match(sql,/WHERE origem_relatorio_chave IS NOT NULL AND estado='aprovado'/);
 assert.match(sql,/UPDATE public\.queima SET estado='aprovado',aprovado_via_importacao=true,quantidade=v_qtd/);
 assert.match(sql,/UPDATE public\.queima SET estado='aprovado',aprovado_via_importacao=true,validade_gondola=v_validade/);
 const corrections=sql.match(/v_acao:='corrigir_aprovado'/g)||[];
 assert.equal(corrections.length,2);
 assert.match(sql,/v_validade < \(\(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date\+7\)/);
 assert.match(sql,/correspondencia_ambigua/);
 assert.match(sql,/p_simular/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.conciliar_queima_relatorio_v43/);
 assert.doesNotMatch(sql,/\bDELETE FROM public\.queima\b|\bTRUNCATE public\.queima\b/);
});
test('Badge, filtro pendentes/verificados e botão Verificado estão na tela de Queima',()=>{
 const app=read('public/assets/app.js');
 assert.match(app,/id="gen-import-filter"/);
 assert.match(app,/value="todos_importados"/);
 assert.match(app,/value="pendentes"/);
 assert.match(app,/value="verificados"/);
 assert.match(app,/Aprovado via importação<\/span>/);
 assert.match(app,/data-verify-burn="\$\{H\(r\.id\)\}"/);
 assert.match(app,/acao:'verificar_importacao'/);
 assert.match(app,/importacao_verificada_em/);
 assert.match(app,/aprovado_via_importacao===true/);
 assert.match(app,/renderRoute\(state\.route\)/);
});
test('PWA e workflow incluem a nova migração e versão do badge',()=>{
 const worker=read('public/sw.js'),yaml=read('.github/workflows/migracao-supabase.yml');
 assert.match(worker,/registro-validades-v45-queima-sem-responsavel/);
 assert.match(yaml,/verificar_aprovacoes_importadas_v44/);
 assert.match(yaml,/supabase\/026_verificacao_aprovacoes_importadas\.sql/);
});
