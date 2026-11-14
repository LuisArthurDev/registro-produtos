import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
import {dividirQueimaEmLotes,executarQueimaEmLotes,somarContagensQueima,TAM_LOTE_QUEIMA} from '../public/assets/queima-conciliacao-lotes.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/028_queima_relatorio_somente_novos_em_lotes.sql');
const api=read('api/index.js'),app=read('public/assets/app.js');
const item={linha:4,codigo_interno:'88441',validade:'2027-11-24',quantidade:5,preco_gondola:7.48,data_lancamento:'2026-11-10',ocorrencia:1,aprovado:true};

function mockAPI(){
 const previous=globalThis.fetch,oldURL=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 const token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
 const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',calls=[];
 globalThis.fetch=async(u,opt={})=>{
  const table=new URL(u).pathname.split('/rest/v1/')[1],body=opt.body?JSON.parse(opt.body):null;
  calls.push({table,body,method:opt.method||'GET'});
  let data=[];
  if(table==='sessoes')data=[{token_hash:hash,usuario_id:user,expira_em:'2099-12-31T23:00:00Z',ultima_atividade:new Date().toISOString()}];
  else if(table==='usuarios')data=[{id:user,loja_id:'151',perfil:'admin',ativo:true,nome:'Admin'}];
  else if(table==='rpc/conciliar_queima_relatorio_v43')data={simulacao:body.p_simular,contagem:{cadastrar_e_aprovar:body.p_itens.length,ja_existente:0},total_aprovados:body.p_itens.length,amostras:[]};
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,async call(body){const result={statusCode:200,setHeader(){},end(txt){this.data=JSON.parse(txt)}};
  await handler({method:'POST',url:'/api/index.js?route=queima/conciliar-relatorio',headers:{authorization:'Bearer '+token,host:'test.local'},body},result);return result;},restore(){globalThis.fetch=previous;
  if(oldURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldURL;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }};
}

test('Divide 95 linhas em 40, 40 e 15, preservando ordem e sem perder produtos',()=>{
 const data=Array.from({length:95},(_,i)=>({linha:i+4}));
 const lotes=dividirQueimaEmLotes(data);
 assert.equal(TAM_LOTE_QUEIMA,40);assert.deepEqual(lotes.map(l=>l.length),[40,40,15]);
 assert.deepEqual(lotes.flat(),data);
 assert.deepEqual(dividirQueimaEmLotes([],40),[]);
});

test('Prévia separada em 3 requisições e soma os resultados sem nenhuma mutação',async()=>{
 const data=Array.from({length:91},(_,i)=>({...item,linha:i+4})),calls=[],status=[];
 const r=await executarQueimaEmLotes(data,async(items,ctx)=>{
  calls.push({n:items.length,ctx});return {resultado:{total_aprovados:items.length,simulacao:true,
    contagem:{cadastrar_e_aprovar:items.length,ja_existente:0},amostras:items.map(x=>({linha:x.linha}))}};
 },{progresso:x=>status.push(x)});
 assert.deepEqual(calls.map(c=>c.n),[40,40,11]);assert.equal(r.contagem.cadastrar_e_aprovar,91);
 assert.equal(r.amostras.length,91);assert.equal(r.total_aprovados,91);
 assert.equal(status.filter(x=>x.executado).length,3);
 assert.ok(calls.every(x=>x.ctx.simular));
});

test('Após falha do lote 2, nenhum lote posterior é enviado e progresso fica informado',async()=>{
 const lista=Array.from({length:94},(_,i)=>i),requests=[];
 await assert.rejects(()=>executarQueimaEmLotes(lista,async (_lote,ctx)=>{
  requests.push(ctx.indice);if(ctx.indice===2)throw Error('57014');return {resultado:{contagem:{cadastrar_e_aprovar:40}}};
 },{simular:false}),(e)=>{
  assert.equal(e.message,'57014');assert.equal(e.lotesConcluidos,1);assert.equal(e.totalLotes,3);return true;
 });
 assert.deepEqual(requests,[1,2]);
});

test('A API desativa correções automáticas mesmo que cliente antigo solicite corrigir_aprovados=true',async()=>{
 const env=mockAPI();try{
  const r=await env.call({itens:[item],primeira_carga:true,corrigir_aprovados:true,simular:false});
  assert.equal(r.statusCode,422);assert.match(r.data.mensagem,/manual/);
  assert.equal(env.calls.filter(x=>x.table==='rpc/conciliar_queima_relatorio_v43').length,0);
 }finally{env.restore();}
});

test('API mantém importações posteriores distintas da primeira sem habilitar correções',async()=>{
 const env=mockAPI();try{
  const r=await env.call({itens:[item],primeira_carga:false,corrigir_aprovados:false,simular:false});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));
  const rpc=env.calls.find(x=>x.table==='rpc/conciliar_queima_relatorio_v43');
  assert.equal(rpc.body.p_primeira_carga,false);assert.equal(rpc.body.p_corrigir_aprovados,false);assert.equal(rpc.body.p_simular,false);
 }finally{env.restore();}
});

test('API da primeira importação preserva flag true, sem autorizar atualização de aprovados',async()=>{
 const env=mockAPI();try{
  const r=await env.call({itens:[item],primeira_carga:true,corrigir_aprovados:false,simular:false});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));
  const rpc=env.calls.find(x=>x.table==='rpc/conciliar_queima_relatorio_v43');
  assert.equal(rpc.body.p_primeira_carga,true);
  assert.equal(rpc.body.p_corrigir_aprovados,false);
  assert.equal(r.data.resultado.primeira_carga,true);
 }finally{env.restore();}
});
test('API de importação posterior preserva false e impede alterações automáticas',async()=>{
 const env=mockAPI();try{
  const r=await env.call({itens:[item],primeira_carga:false,corrigir_aprovados:false,simular:true});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));
  assert.equal(r.data.resultado.primeira_carga,false);
  const rpc=env.calls.find(x=>x.table==='rpc/conciliar_queima_relatorio_v43');
  assert.equal(rpc.body.p_primeira_carga,false);
  assert.equal(rpc.body.p_corrigir_aprovados,false);
  assert.equal(rpc.body.p_simular,true);
 }finally{env.restore();}
});
test('Dois caminhos de entrada e caixa de primeira importação acionam o mesmo fluxo seguro de novos produtos',()=>{
 assert.match(app,/id="queima-relatorio-primeira-open"/);
 assert.match(app,/id="queima-relatorio-open"/);
 assert.match(app,/id="queima-relatorio-primeira"/);
 assert.match(app,/\$\('#queima-relatorio-primeira-open'\)\.onclick=\(\)=>\{primeira\.checked=true;input\.click\(\);\}/);
 assert.match(app,/\$\('#queima-relatorio-open'\)\.onclick=\(\)=>\{primeira\.checked=false;input\.click\(\);\}/);
 assert.match(app,/primeira_carga:primeira\.checked,corrigir_aprovados:false/);
 assert.match(app,/lote=>enviarLote\(lote,false,modoConfirmado\)/);
 assert.match(app,/primeira\.disabled=true/);
 assert.doesNotMatch(app,/id="queima-relatorio-corrigir"/);
 assert.match(sql,/IF p_corrigir_aprovados IS TRUE THEN/);
 assert.doesNotMatch(sql,/UPDATE public\.queima SET quantidade=/);
});
test('API limita a 40 itens para evitar statement timeout',async()=>{
 const env=mockAPI();try{
  const lista=Array.from({length:41},(_,i)=>({...item,linha:i+4}));
  const r=await env.call({itens:lista,simular:true});
  assert.equal(r.statusCode,422);assert.equal(env.calls.filter(x=>x.table==='rpc/conciliar_queima_relatorio_v43').length,0);
 }finally{env.restore();}
});

test('SQL 028 é em lote: só cria e aprova IDs NOVOS, sem corrigir um já aprovado',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.conciliar_queima_relatorio_v43/);
 assert.match(sql,/p_corrigir_aprovados IS TRUE THEN/);
 assert.match(sql,/jsonb_array_length\(p_itens\) NOT BETWEEN 1 AND 40/);
 assert.match(sql,/jsonb_to_recordset\(p_itens\)/);
 assert.match(sql,/CREATE TEMP TABLE tmp_queima_relatorio_v48 ON COMMIT DROP AS/);
 assert.match(sql,/JOIN public\.produtos p ON/);
 assert.match(sql,/CREATE INDEX IF NOT EXISTS idx_mapa_queima_ean_ativos_v48/);
 assert.match(sql,/q\.estado IN \('pendente','aprovado','relancado'\)/);
 assert.match(sql,/acao='ja_existente'/);
 assert.match(sql,/acao='ja_excluido'/);
 assert.match(sql,/acao='ja_conciliado'/);
 assert.match(sql,/ON CONFLICT \(loja_id,origem_relatorio_chave\)/);
 assert.match(sql,/WHERE origem_relatorio_chave IS NOT NULL DO NOTHING/);
 assert.match(sql,/WHERE t\.criado_id IS NOT NULL/);
 assert.match(sql,/UPDATE public\.queima q SET estado='aprovado'/);
 assert.match(sql,/WHERE q\.id=t\.criado_id AND q\.loja_id=p_loja_id/);
 assert.doesNotMatch(sql,/UPDATE public\.queima SET quantidade=|SET quantidade=v_qtd|SET quantidade=t\.quantidade/);
 assert.match(sql,/p_simular THEN/);
});

test('Frontend usa só cadastro de novos, mantém edição manual de quantidade/preço/validade',()=>{
 assert.match(app,/id="queima-relatorio-primeira"/);assert.match(app,/id="queima-relatorio-primeira-open"/);
 assert.doesNotMatch(app,/id="queima-relatorio-corrigir"/);
 assert.match(app,/primeira_carga:primeira.checked,corrigir_aprovados:false/);
 assert.match(app,/executarQueimaEmLotes\(relatorio\.itens/);
 assert.match(app,/simular:true/);
 assert.match(app,/simular:false/);
 assert.match(app,/Nenhum lançamento foi alterado/);
 assert.match(app,/Reimporte o mesmo relatório para continuar sem duplicar/);
 assert.match(app,/data-edit-burn/);
 assert.match(app,/acao:'editar_aprovado'/);
 assert.match(app,/Somente.*novos/i);
});

test('Workflow oferece SQL 028, cache PWA inclui o módulo de lotes',()=>{
 const wf=read('.github/workflows/migracao-supabase.yml'),sw=read('public/sw.js');
 assert.match(wf,/queima_so_novos_lotes_v48/);
 assert.match(wf,/supabase\/028_queima_relatorio_somente_novos_em_lotes\.sql/);
 assert.match(sw,/registro-validades-v49-primeira-importacao-restaurada/);
 assert.match(sw,/\/assets\/queima-conciliacao-lotes\.js/);
});
