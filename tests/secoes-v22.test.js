import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import handler from '../api/index.js';
import { chaveSecao, secaoPadraoIgnorada, secaoNaoVisivel, filtrarSecoes } from '../api/secoes.js';

const base = x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token='d'.repeat(64), hash=createHash('sha256').update(token).digest('hex');
const EAN={brinde:'7891234567890',servico:'7891234567891',default:'7891234567892',perfumaria:'7891234567893',fraldas:'7891234567894'};
const products=[
 {id:'11111111-1111-4111-8111-111111111111',ean:EAN.brinde,secao:'Brinde',descricao:'Brinde grátis'},
 {id:'22222222-2222-4222-8222-222222222222',ean:EAN.servico,secao:'SERVIÇOS',descricao:'Serviço'},
 {id:'33333333-3333-4333-8333-333333333333',ean:EAN.default,secao:'DEFAULT',descricao:'Padrão'},
 {id:'44444444-4444-4444-8444-444444444444',ean:EAN.perfumaria,secao:'Perfumaria',grupo:'BELEZA',descricao:'Perfume'},
 {id:'55555555-5555-4555-8555-555555555555',ean:EAN.fraldas,secao:'Fraldas',grupo:'INFANTIL',descricao:'Fralda'}
];
const mapas=products.map((p,i)=>({
 id:`${i+1}${i+1}${i+1}${i+1}${i+1}${i+1}${i+1}${i+1}-aaaa-4aaa-aaaa-aaaaaaaaaaaa`,
 loja_id:'151',tipo_mapa:'funcionario',mapa_nome:'Isabela',funcionario_id:null,
 ean:p.ean,produto_id:p.id,excluido_em:null,lote:'L1',validade:'2027-10-02',quantidade:3,
 produtos:{codigo_interno:'1',descricao:p.descricao,secao:p.secao,grupo:p.grupo}
}));
function mock({perfil='admin',customExcluded=false}={}){
 const previousFetch=globalThis.fetch,oldURL=process.env.SUPABASE_URL,oldSecret=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_mock';
 const calls=[];
 const config={grupo_chave:'beleza',grupo:'BELEZA',responsavel_id:null,oculta_no_quadro:false,excluida_das_listas:false,atualizado_em:'2026-11-10T21:00:00Z'};
 const secaoConfig={secao_chave:'perfumaria',secao:'Perfumaria',responsavel_id:null,oculta_no_quadro:false,excluida_das_listas:customExcluded,atualizado_em:'2026-11-10T21:00:00Z'};
 globalThis.fetch=async (url,options={})=>{
  const u=new URL(url),table=u.pathname.split('/rest/v1/')[1],method=options.method||'GET';
  const body=options.body?JSON.parse(options.body):null;
  calls.push({table,method,body,params:u.searchParams});
  let result=[];
  if(table==='sessoes')result=[{token_hash:hash,usuario_id:actorId,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true}];
  else if(table==='usuarios')result=[{id:actorId,nome:'Administrador',nome_normalizado:'administrador',loja_id:'151',perfil,ativo:true}];
  else if(table==='produtos'){
    result=products;
    const eq=u.searchParams.get('ean');if(eq?.startsWith('eq.'))result=result.filter(x=>x.ean===eq.slice(3));
    const ins=u.searchParams.get('ean');if(ins?.startsWith('in.'))result=result.filter(x=>ins.includes(x.ean));
    const num=Number(u.searchParams.get('limit'));if(num)result=result.slice(0,num);
  }
  else if(table==='organizacao_secoes')result=u.searchParams.get('excluida_das_listas')==='eq.true'&&!secaoConfig.excluida_das_listas?[]:[secaoConfig];
  else if(table==='organizacao_grupos'){
   if(method==='POST'){Object.assign(config,body);result=null;}
   else result=u.searchParams.get('excluida_das_listas')==='eq.true'&&!config.excluida_das_listas?[]:[config];
  }
  else if(table==='rpc/resumo_organizacao_grupos')result={grupos:[{chave:'beleza',nome:'BELEZA'},{chave:'infantil',nome:'INFANTIL'}],estatisticas:[{chave:'beleza',funcionario_id:actorId,registros:1,unidades:2}],sem_grupo:0,sem_funcionario:0};
  else if(table==='mapa_lancamentos')result=mapas;
  else if(table==='queima'||table==='vencidos'||table==='transferencias')result=products.map(x=>({id:x.id,ean:x.ean,loja_id:'151',loja_destino:'151',criado_em:'2026-11-10T00:00:00Z',estado:'pendente'}));
  else if(table==='estoque_saldos')result=products.map(x=>({quantidade:5,atualizado_em:'2026-11-10T00:00:00Z',produtos:x}));
  else if(table==='sinalizacoes')result=products.map(x=>({id:x.id,ean:x.ean,loja_id:'151',lancamento_id:x.id,criado_em:'2026-11-10T00:00:00Z'}));
  else if(table==='auditoria')result=null;
  const code=200;
  return new Response(JSON.stringify(result),{status:code,headers:{'content-type':'application/json'}});
 };
 return {calls,config,async request(path,method='GET',body={}){
   const [route,q='']=path.replace(/^\//,'').split('?');
   const res={statusCode:0,setHeader(){},end(s){this.data=JSON.parse(s)}};
   await handler({url:'/api/index.js?route='+route+(q?'&'+q:''),method,headers:{host:'mock.test',authorization:'Bearer '+token},body},res);
   return res;
  },restore(){globalThis.fetch=previousFetch;if(oldURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldURL;if(oldSecret===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldSecret;}};
}

test('nomes de seções ignoradas aceitam caixa, acentos, grafias do cadastro',()=>{
 for(const item of ['Brinde',' BRINDES ','Default','DEFAULT','Serviços','servico','SERVIÇO','Servicoes','servicoes'])
  assert.equal(secaoPadraoIgnorada(item),true,item);
 assert.equal(secaoPadraoIgnorada('Perfumaria'),false);
 assert.equal(chaveSecao(' SeRviÇOs '),'servicos');
 assert.deepEqual(filtrarSecoes(['Brinde','Default','Serviços','Fraldas','Perfumaria']),['Fraldas','Perfumaria']);
 assert.equal(secaoNaoVisivel('Perfumaria',new Set(['perfumaria'])),true);
});

test('menu lateral chama somente Seções, abaixo de Funcionários',()=>{
 const app=base('public/assets/app.js');
 assert.match(app,/\['usuarios','users','Funcionários'\],\['organizacao-secoes','board','Seções'\]/);
 assert.doesNotMatch(app,/\['organizacao-secoes','board','Organização de Seções'\]/);
});

test('Produtos EAN não exibe nenhuma das três seções protegidas',async()=>{
 const env=mock();try{
  const r=await env.request('/produtos?limite=30');assert.equal(r.statusCode,200);
  assert.deepEqual(r.data.produtos.map(p=>p.ean),[EAN.perfumaria,EAN.fraldas]);
 }finally{env.restore();}
});

test('ocultação do quadro não altera Produtos EAN',async()=>{
 const env=mock();try{
  const r=await env.request('/organizacao-secoes','PATCH',{grupo:'BELEZA',acao:'ocultar'});
  assert.equal(r.statusCode,200);assert.equal(env.config.oculta_no_quadro,true);
  assert.equal(env.config.excluida_das_listas,false);
  const cat=await env.request('/produtos?limite=30');assert.ok(cat.data.produtos.some(p=>p.grupo==='BELEZA'));
 }finally{env.restore();}
});

test('excluir da exibição desativa a seção na loja sem apagar os produtos',async()=>{
 const env=mock();try{
  const r=await env.request('/organizacao-secoes','PATCH',{grupo:'BELEZA',acao:'excluir'});
  assert.equal(r.statusCode,200);assert.equal(env.config.excluida_das_listas,true);
  const cat=await env.request('/produtos?limite=30');assert.deepEqual(cat.data.produtos.map(p=>p.secao),['Fraldas']);
  assert.ok(!env.calls.some(x=>x.table==='produtos'&&x.method==='DELETE'));
  assert.ok(!env.calls.some(x=>x.table==='mapa_lancamentos'&&x.method!=='GET'));
 }finally{env.restore();}
});

test('restaurar da exclusão libera seção novamente',async()=>{
 const env=mock({});try{
  env.config.excluida_das_listas=true;
  const r=await env.request('/organizacao-secoes','PATCH',{grupo:'BELEZA',acao:'restaurar'});
  assert.equal(r.statusCode,200);assert.equal(env.config.excluida_das_listas,false);
  const cat=await env.request('/produtos?limite=30');assert.ok(cat.data.produtos.some(p=>p.grupo==='BELEZA'));
 }finally{env.restore();}
});

test('Funcionário não pode ocultar, excluir nem restaurar seções',async()=>{
 const env=mock({perfil:'funcionario'});try{
  for(const acao of ['ocultar','excluir','restaurar']){
   const r=await env.request('/organizacao-secoes','PATCH',{secao:'Perfumaria',acao});assert.equal(r.statusCode,403);
  }
  assert.ok(!env.calls.some(x=>x.table==='organizacao_grupos'&&x.method==='POST'));
 }finally{env.restore();}
});

test('seções padrão não podem ser restauradas via API',async()=>{
 const env=mock();try{
  const r=await env.request('/organizacao-secoes','PATCH',{grupo:'Brinde',acao:'restaurar'});
  assert.equal(r.statusCode,422);assert.ok(!env.calls.some(x=>x.table==='organizacao_grupos'&&x.method==='POST'));
 }finally{env.restore();}
});

test('filtro de seções remove itens operacionais dos Mapas, Queima e Estoque',async()=>{
 const env=mock();try{
  for(const path of ['/mapas','/queima','/vencidos','/transferencias','/estoque','/sinalizacoes']){
   const r=await env.request(path);assert.equal(r.statusCode,200,`${path}: ${r.data.mensagem||''}`);
   assert.deepEqual(r.data.registros.map(x=>x.ean),[EAN.perfumaria,EAN.fraldas],path);
  }
 }finally{env.restore();}
});

test('seção customizada também some de todas as listagens da loja',async()=>{
 const env=mock({customExcluded:true});try{
  for(const path of ['/mapas','/queima','/vencidos','/transferencias','/estoque']){
   const r=await env.request(path);assert.equal(r.statusCode,200);
   assert.deepEqual(r.data.registros.map(x=>x.ean),[EAN.fraldas],path);
  }
 }finally{env.restore();}
});

test('bloqueia lançamento novo em seção ignorada, para não criar linha invisível',async()=>{
 const env=mock();try{
  const r=await env.request('/mapas','POST',{ean:EAN.brinde,mapa:'Estoque',lote:'L1',validade:'2027-01-01',quantidade:1,requestId:'abcdefabcdefabce'});
  assert.equal(r.statusCode,409);assert.ok(!env.calls.some(x=>x.table==='rpc/gravar_lancamento'));
 }finally{env.restore();}
});

test('SQL 015 não apaga produtos e filtra transferências em lote dentro do banco',()=>{
 const sql=base('supabase/015_visibilidade_secoes.sql'),flow=base('.github/workflows/migracao-supabase.yml');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS oculta_no_quadro/i);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS excluida_das_listas/i);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.transferir_lancamentos_v12/i);
 assert.match(sql,/NOT EXISTS \(\s*SELECT 1 FROM public\.organizacao_secoes os/i);
 assert.doesNotMatch(sql,/DELETE FROM public\.(produtos|mapa_lancamentos)/i);
 assert.match(flow,/visibilidade_secoes/);
});
