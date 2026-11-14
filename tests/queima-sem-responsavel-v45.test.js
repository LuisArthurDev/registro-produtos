import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=source('supabase/027_queima_importada_sem_responsavel.sql');
const app=source('public/assets/app.js');
const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const itemId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const funcionarioId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const token='e'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
function mock(perfil='admin'){
  const old=globalThis.fetch,oldURL=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
  const calls=[];
  globalThis.fetch=async(url,opt={})=>{
    const target=new URL(url),table=target.pathname.split('/rest/v1/')[1];
    const body=opt.body?JSON.parse(opt.body):undefined;calls.push({table,method:opt.method||'GET',body});
    let data=[];
    if(table==='sessoes')data=[{token_hash:hash,usuario_id:userId,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
    else if(table==='usuarios')data=[{id:userId,nome:'Admin',perfil,loja_id:'151',ativo:true}];
    else if(table==='rpc/atribuir_responsavel_queima_importada_v45')data={sucesso:true,queima_id:body.p_queima_id,responsavel_id:body.p_responsavel_id};
    return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
  };
  return {
    calls,async request(body){const res={statusCode:200,setHeader(){},end(text){this.data=JSON.parse(text)}};
      await handler({method:'PATCH',url:'/api/index.js?route=queima',headers:{host:'test.local',authorization:'Bearer '+token},body},res);return res;},
    restore(){globalThis.fetch=old;oldURL===undefined?delete process.env.SUPABASE_URL:process.env.SUPABASE_URL=oldURL;
      oldKey===undefined?delete process.env.SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY=oldKey;}
  };
}

test('SQL 027 identifica com segurança um mapa pela combinação EAN + validade, sem supor lote',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.responsavel_mapa_queima_v45/);
 assert.match(sql,/m\.ean=p_ean AND m\.validade=p_validade/);
 assert.match(sql,/m\.tipo_mapa='funcionario' AND m\.excluido_em IS NULL/);
 assert.match(sql,/r\.total=r\.com_responsavel AND r\.titulares=1/);
 assert.match(sql,/u\.ativo=true AND u\.excluido_em IS NULL/);
 assert.match(sql,/sem_responsavel_importacao=\(public\.responsavel_mapa_queima_v45/);
 assert.equal((sql.match(/sem_responsavel_importacao=\(public\.responsavel_mapa_queima_v45/g)||[]).length,2,
  'novas aprovações e aprovações dos registros pendentes devem classificar proprietário');
 assert.doesNotMatch(sql,/INSERT INTO public\.mapa_lancamentos|DELETE FROM public\.mapa_lancamentos|TRUNCATE/i);
});

test('Backfill de aprovados importados preserva Verificado, aprovação, preço e quantidade',()=>{
 assert.match(sql,/WITH candidatos AS \([\s\S]*?WHERE q\.aprovado_via_importacao IS TRUE AND q\.estado='aprovado' AND q\.excluido_em IS NULL/);
 assert.match(sql,/UPDATE public\.queima q SET responsavel_importacao_id=c\.destino/);
 assert.match(sql,/AND q\.responsavel_importacao_id IS NULL/);
 assert.match(sql,/AND q\.sem_responsavel_importacao IS FALSE/);
 const patch=sql.slice(sql.indexOf('WITH candidatos AS (\n SELECT q.id'),sql.indexOf('CREATE OR REPLACE FUNCTION public.conciliar_queima_relatorio_v43'));
 const update=patch.slice(patch.indexOf('UPDATE public.queima q SET'));
 assert.doesNotMatch(update,/aprovado_via_importacao\s*=|estado\s*=|importacao_verificada_em\s*=|quantidade\s*=|preco_gondola\s*=|validade_gondola\s*=/);
});

test('RPC de atribuição usa bloqueio de linha, autoriza apenas admin e audita mudança de responsável',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.atribuir_responsavel_queima_importada_v45/);
 assert.match(sql,/u\.perfil='admin' AND u\.ativo=true/);
 assert.match(sql,/q\.estado='aprovado' AND q\.aprovado_via_importacao=true FOR UPDATE/);
 assert.match(sql,/u\.loja_id=p_loja_id AND u\.perfil='funcionario' AND u\.ativo=true/);
 assert.match(sql,/sem_responsavel_importacao=\(p_responsavel_id IS NULL\)/);
 assert.match(sql,/'atribuir_queima_importada'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.atribuir_responsavel_queima_importada_v45/);
});

test('API encaminha atribuição/retirada de responsável via RPC, sem criar ou mudar mapas',async()=>{
 const c=mock();try{
  const r=await c.request({id:itemId,acao:'atribuir_importacao',responsavel_id:funcionarioId});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));
  const rpc=c.calls.find(x=>x.table==='rpc/atribuir_responsavel_queima_importada_v45');
  assert.ok(rpc);assert.equal(rpc.body.p_loja_id,'151');assert.equal(rpc.body.p_usuario_id,userId);
  assert.equal(rpc.body.p_queima_id,itemId);assert.equal(rpc.body.p_responsavel_id,funcionarioId);
  assert.ok(!c.calls.some(x=>x.table==='mapa_lancamentos'||x.table==='queima'&&x.method==='PATCH'));
  const sem=await c.request({id:itemId,acao:'atribuir_importacao',responsavel_id:''});
  assert.equal(sem.statusCode,200);const rpcSem=c.calls.filter(x=>x.table==='rpc/atribuir_responsavel_queima_importada_v45').at(-1);
  assert.equal(rpcSem.body.p_responsavel_id,null);
 }finally{c.restore();}
});

test('API rejeita funcionário e identificadores incorretos antes da gravação',async()=>{
 const emp=mock('funcionario');try{const r=await emp.request({id:itemId,acao:'atribuir_importacao',responsavel_id:funcionarioId});
  assert.equal(r.statusCode,403);assert.ok(!emp.calls.some(x=>x.table==='rpc/atribuir_responsavel_queima_importada_v45'));
 }finally{emp.restore();}
 const adm=mock();try{
  for(const body of [{id:'xyz',acao:'atribuir_importacao',responsavel_id:funcionarioId},{id:itemId,acao:'atribuir_importacao',responsavel_id:'fake'}]){
   const r=await adm.request(body);assert.equal(r.statusCode,422,JSON.stringify(r.data));
  }
  assert.ok(!adm.calls.some(x=>x.table==='rpc/atribuir_responsavel_queima_importada_v45'));
 }finally{adm.restore();}
});

test('Queima exibe badge, filtro, nome do responsável e diálogo para atribuição posterior',()=>{
 assert.match(app,/id="gen-owner-filter"/);
 assert.match(app,/value="sem">Sem responsável/);
 assert.match(app,/sem_responsavel_importacao===true/);
 assert.match(app,/data-assign-burn="\$\{H\(r\.id\)\}"/);
 assert.match(app,/id="queima-atribuir-dialog"/);
 assert.match(app,/Atribuir responsável/);
 assert.match(app,/acao:'atribuir_importacao'/);
 assert.match(app,/await staffList\(\)/);
 assert.match(app,/id="gen-import-filter"/);
 assert.match(app,/data-verify-burn/);
});

test('Migração 027 disponível no GitHub Actions e cache de frontend atualizado',()=>{
 const workflow=source('.github/workflows/migracao-supabase.yml');
 const sw=source('public/sw.js');
 assert.match(workflow,/responsaveis_queima_importada_v45/);
 assert.match(workflow,/supabase\/027_queima_importada_sem_responsavel\.sql/);
 assert.match(sw,/registro-validades-v50-procfit-todos-s-novos/);
});
