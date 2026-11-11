import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',c='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const token='9'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
function ambiente({perfil='admin',loja='151',falhaRpc=false}={}) {
 const before=globalThis.fetch,u=process.env.SUPABASE_URL,k=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_mock';
 const chamadas=[];
 globalThis.fetch=async(url,opts={})=>{
  const parsed=new URL(url),table=parsed.pathname.split('/rest/v1/')[1],method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;
  chamadas.push({table,method,body,params:parsed.searchParams});let data=[];
  if(table==='sessoes')data=[{token_hash:hash,usuario_id:a,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
  if(table==='usuarios')data=parsed.searchParams.has('id')||!parsed.searchParams.has('loja_id')
    ?[{id:a,nome:'Admin Loja',loja_id:loja,perfil,ativo:true}]
    :[{id:b,nome:'Isabela',loja_id:'151',perfil:'funcionario',ativo:true},{id:c,nome:'Maria',loja_id:'151',perfil:'funcionario',ativo:true}];
  if(table==='rpc/resumo_organizacao_grupos')data={grupos:[{chave:'beleza',nome:'BELEZA'},{chave:'infantil',nome:'INFANTIL'}],estatisticas:[],sem_grupo:0,sem_funcionario:0};
  if(table==='rpc/salvar_organizacao_grupos'){
    if(falhaRpc)return new Response(JSON.stringify({message:'Transação recusada pelo banco'}),{status:400,headers:{'content-type':'application/json'}});
    data={sucesso:true,alterados:body.p_itens.length};
  }
  if(table==='organizacao_grupos'||table==='auditoria')data=method==='POST'?null:[];
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 return {chamadas,async call(method='GET',body={}){
  const res={statusCode:0,setHeader(){},end(s){this.data=JSON.parse(s)}};
  await handler({url:'/api/index.js?route=organizacao-secoes',method,headers:{host:'mock.test',authorization:'Bearer '+token},body},res);return res;
 },close(){globalThis.fetch=before;if(u===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=u;if(k===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=k;}};
}
const alterações=[{grupo:'BELEZA',responsavel_id:b},{grupo:'INFANTIL',responsavel_id:c}];
test('organização V27: salva vários grupos numa ÚNICA requisição transacional ao banco',async()=>{
 const e=ambiente();try{
  const r=await e.call('POST',{alteracoes:alterações});
  assert.equal(r.statusCode,200);assert.equal(r.data.alterados,2);
  const trans=e.chamadas.filter(c=>c.table==='rpc/salvar_organizacao_grupos');assert.equal(trans.length,1);
  assert.equal(trans[0].body.p_loja,'151');assert.equal(trans[0].body.p_usuario,a);assert.deepEqual(trans[0].body.p_itens,alterações);
  assert.ok(!e.chamadas.some(x=>x.table==='organizacao_grupos'&&x.method==='POST'));
  assert.ok(!e.chamadas.some(x=>x.table==='mapa_lancamentos'&&x.method!=='GET'));
 }finally{e.close();}
});
test('funcionário não pode salvar grupos nem usando URL direta',async()=>{
 const e=ambiente({perfil:'funcionario'});try{const r=await e.call('POST',{alteracoes:alterações});assert.equal(r.statusCode,403);assert.ok(!e.chamadas.some(c=>c.table.startsWith('rpc/')));}finally{e.close();}
});
test('valida todos os grupos antes da transação, rejeita repetidos e protegidos',async()=>{
 const e=ambiente();try{
  for(const altered of [
   [{grupo:'BELEZA',responsavel_id:b},{grupo:'BELEZA',responsavel_id:c}],
   [{grupo:'Brinde',responsavel_id:b}],
   [{grupo:'INEXISTENTE',responsavel_id:b}],
  ]){const r=await e.call('POST',{alteracoes:altered});assert.equal(r.statusCode,422);}
  assert.equal(e.chamadas.filter(c=>c.table==='rpc/salvar_organizacao_grupos').length,0);
 }finally{e.close();}
});
test('destino de outra loja não chega ao banco e alterações não são salvas em partes',async()=>{
 const e=ambiente();try{
  const r=await e.call('POST',{alteracoes:[...alterações,{grupo:'BELEZA',responsavel_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}]});assert.equal(r.statusCode,422);
  const r2=await e.call('POST',{alteracoes:[{grupo:'INFANTIL',responsavel_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}]});assert.equal(r2.statusCode,403);
  assert.ok(!e.chamadas.some(c=>c.table==='rpc/salvar_organizacao_grupos'));
 }finally{e.close();}
});
test('falha no banco não é anunciada como sucesso',async()=>{
 const e=ambiente({falhaRpc:true});try{const r=await e.call('POST',{alteracoes:alterações});assert.equal(r.statusCode,400);assert.equal(e.chamadas.filter(c=>c.table==='rpc/salvar_organizacao_grupos').length,1);}finally{e.close();}
});
test('a interface só solicita gravação no clique Salvar; a mudança no quadro é local',()=>{
 const ui=read('public/assets/organizacao-secoes.js'),css=read('public/assets/app.css'),icons=read('public/assets/icones-acoes.js'),sql=read('supabase/018_salvar_organizacao_grupos.sql'),workflow=read('.github/workflows/migracao-supabase.yml');
 assert.match(ui,/id="org-save"/);assert.match(ui,/id="org-reset"/);
 assert.match(ui,/function mover\(chave,target\)/);assert.match(ui,/atrib\.set\(chave,target\);render\(\)/);
 assert.match(ui,/function salvarOrganizacao/);assert.match(ui,/method:'POST',body:\{alteracoes:itens\}/);
 assert.match(ui,/Grupo mais frequente:/);
 assert.match(css,/V28 — tabelas em LINHAS legíveis/);assert.match(css,/\.table-wrap tbody>tr\{border-bottom/);
 assert.doesNotMatch(css,/\.table-wrap tbody>tr\s*\{\s*display:block/);
 assert.match(css,/border-radius:0!important;box-shadow:none!important/);
 assert.match(icons,/\.page-subnav,\.compare-tabs,\.view-tabs/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.salvar_organizacao_grupos/);
 assert.match(sql,/ON CONFLICT \(loja_id,grupo_chave\) DO UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.salvar_organizacao_grupos/);
 assert.match(workflow,/salvar_organizacao_grupos/);
});

test('V29: salvar grupos mesmo com destino sem responsável (null), junto com outros atribuídos',async()=>{
 const e=ambiente();try{
  const itens=[{grupo:'BELEZA',responsavel_id:null},{grupo:'INFANTIL',responsavel_id:c}];
  const r=await e.call('POST',{alteracoes:itens});
  assert.equal(r.statusCode,200);
  const trans=e.chamadas.filter(call=>call.table==='rpc/salvar_organizacao_grupos');
  assert.equal(trans.length,1);
  assert.deepEqual(trans[0].body.p_itens,itens);
  assert.ok(!e.chamadas.some(call=>call.table==='mapa_lancamentos'&&call.method!=='GET'));
 }finally{e.close();}
});

test('V29: salvar lote composto inteiramente de grupos sem responsável',async()=>{
 const e=ambiente();try{
  const itens=[{grupo:'BELEZA',responsavel_id:null},{grupo:'INFANTIL',responsavel_id:null}];
  const r=await e.call('POST',{alteracoes:itens});
  assert.equal(r.statusCode,200);
  assert.equal(r.data.alterados,2);
  assert.deepEqual(e.chamadas.find(call=>call.table==='rpc/salvar_organizacao_grupos').body.p_itens,itens);
 }finally{e.close();}
});

test('V29: grupos novos sem responsável são pendentes até primeiro salvamento; grupos já salvos não',async()=>{
 const {gruposPendentes}=await import('../public/assets/organizacao-secoes.js');
 const grupos=[{chave:'beleza',nome:'BELEZA'},{chave:'infantil',nome:'INFANTIL'}];
 const atuais=new Map([['beleza',null],['infantil',null]]);
 const originais=new Map();
 assert.deepEqual(gruposPendentes(grupos,atuais,originais).map(g=>g.nome),['BELEZA','INFANTIL']);
 originais.set('beleza',null);originais.set('infantil',null);
 assert.deepEqual(gruposPendentes(grupos,atuais,originais),[]);
 atuais.set('beleza',b);
 assert.deepEqual(gruposPendentes(grupos,atuais,originais).map(g=>g.nome),['BELEZA']);
 originais.set('beleza',b);
 atuais.set('beleza',null);
 assert.deepEqual(gruposPendentes(grupos,atuais,originais).map(g=>g.nome),['BELEZA']);
});

test('V29: grupos novos escondidos/excluídos não forçam salvamento, mas alterações neles continuam pendentes',async()=>{
 const {gruposPendentes}=await import('../public/assets/organizacao-secoes.js');
 const grupos=[{chave:'beleza',nome:'BELEZA'},{chave:'infantil',nome:'INFANTIL'}];
 const atuais=new Map([['beleza',null],['infantil',null]]);
 const originais=new Map([['beleza',b]]);
 const visibilidade=new Map([['beleza',{oculta:true}],['infantil',{excluida:true}]]);
 assert.deepEqual(gruposPendentes(grupos,atuais,originais,visibilidade).map(g=>g.nome),['BELEZA']);
 originais.set('beleza',null);
 assert.deepEqual(gruposPendentes(grupos,atuais,originais,visibilidade),[]);
 visibilidade.set('infantil',{oculta:false,excluida:false});
 assert.deepEqual(gruposPendentes(grupos,atuais,originais,visibilidade).map(g=>g.nome),['INFANTIL']);
});
