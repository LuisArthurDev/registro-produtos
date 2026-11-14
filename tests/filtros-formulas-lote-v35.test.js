import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import handler from '../api/index.js';
import {chaveFiltros,lerFiltros} from '../public/assets/filtros-persistentes.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const u='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',token='c'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
const EANS=['07898962711477','07890000123456'];
function fixture({perfil='admin',falha=false}={}){
 const fetchBefore=globalThis.fetch,envU=process.env.SUPABASE_URL,envS=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://supabase.test';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 const chamadas=[];
 globalThis.fetch=async(url,opt={})=>{
  const uri=new URL(url),table=uri.pathname.split('/rest/v1/')[1],method=opt.method||'GET';
  const body=opt.body?JSON.parse(opt.body):null;chamadas.push({table,method,body});
  let result=[];
  if(table==='sessoes')result=[{token_hash:hash,usuario_id:u,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
  else if(table==='usuarios')result=[{id:u,nome:'Administrador',loja_id:'151',perfil,ativo:true}];
  else if(table==='rpc/marcar_formulas_especiais_lote'){
   if(falha)return new Response(JSON.stringify({message:'Um EAN não existe'}),{status:409,headers:{'content-type':'application/json'}});
   result={sucesso:true,selecionados:body.p_eans.length,alterados:body.p_eans.length,formula_especial:body.p_ativo};
  }else if(table==='auditoria')result=null;
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 };
 return {chamadas,async post(body){
  const res={statusCode:0,setHeader(){},end(v){this.data=JSON.parse(v)}};
  await handler({url:'/api/index.js?route=produtos/formulas-lote',method:'POST',headers:{host:'supabase.test',authorization:'Bearer '+token},body},res);
  return res;
 },close(){globalThis.fetch=fetchBefore;if(envU===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=envU;if(envS===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=envS;}};
}
test('classificação em lote grava dois EANs numa única transação PostgreSQL',async()=>{
 const f=fixture();try{
  const r=await f.post({eans:EANS,formula_especial:true});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));assert.equal(r.data.selecionados,2);assert.equal(r.data.alterados,2);
  const rpc=f.chamadas.filter(c=>c.table==='rpc/marcar_formulas_especiais_lote');
  assert.equal(rpc.length,1);assert.equal(rpc[0].body.p_usuario,u);assert.equal(rpc[0].body.p_loja,'151');
  assert.equal(rpc[0].body.p_ativo,true);assert.deepEqual(rpc[0].body.p_eans,EANS);
  assert.equal(f.chamadas.filter(c=>c.table==='produtos'&&c.method==='PATCH').length,0);
 }finally{f.close();}
});
test('desmarcação em lote utiliza os mesmos EANs e o boolean falso',async()=>{
 const f=fixture();try{const r=await f.post({eans:EANS,formula_especial:false});
  assert.equal(r.statusCode,200);assert.equal(f.chamadas.find(c=>c.table==='rpc/marcar_formulas_especiais_lote').body.p_ativo,false);
 }finally{f.close();}
});
test('funcionário não pode alterar Fórmulas Especiais em lote',async()=>{
 const f=fixture({perfil:'funcionario'});try{const r=await f.post({eans:EANS,formula_especial:true});assert.equal(r.statusCode,403);
  assert.ok(!f.chamadas.some(c=>c.table==='rpc/marcar_formulas_especiais_lote'));
 }finally{f.close();}
});
test('EAN duplicado, inválido e limite >500 impedem até chamar o banco',async()=>{
 const f=fixture();try{
  for(const eans of [[EANS[0],EANS[0]],['78912'],[],Array(501).fill('07898962711477'),[12345678901234]]){
   const r=await f.post({eans,formula_especial:true});assert.equal(r.statusCode,422,JSON.stringify(r.data));
  }
  assert.equal(f.chamadas.filter(c=>c.table==='rpc/marcar_formulas_especiais_lote').length,0);
 }finally{f.close();}
});
test('tipos boolean em string não podem contornar a validação',async()=>{
 const f=fixture();try{const r=await f.post({eans:EANS,formula_especial:'true'});assert.equal(r.statusCode,422);
 assert.equal(f.chamadas.filter(c=>c.table==='rpc/marcar_formulas_especiais_lote').length,0);
 }finally{f.close();}
});
test('falha da função atômica retorna erro, sem POST por produto',async()=>{
 const f=fixture({falha:true});try{const r=await f.post({eans:EANS,formula_especial:true});assert.equal(r.statusCode,409);
 assert.equal(f.chamadas.filter(c=>c.table==='rpc/marcar_formulas_especiais_lote').length,1);
 assert.ok(!f.chamadas.some(c=>c.table==='produtos'&&c.method==='PATCH'));
 }finally{f.close();}
});
test('SQL valida autorização, EANs repetidos e total antes do único UPDATE',()=>{
 const sql=file('supabase/021_formulas_especiais_lote.sql');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.marcar_formulas_especiais_lote/);
 assert.match(sql,/u\.perfil='admin' AND u\.ativo=true/);
 assert.match(sql,/count\(DISTINCT ean\)/);
 assert.match(sql,/count\(\*\) FROM public\.produtos/);
 assert.match(sql,/UPDATE public\.produtos/);
 assert.doesNotMatch(sql,/UPDATE public\.(mapa_lancamentos|queima)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 const wf=file('.github/workflows/migracao-supabase.yml');
 assert.match(wf,/formulas_especiais_lote/);
 assert.match(wf,/supabase\/021_formulas_especiais_lote\.sql/);
});
test('produto e mapa têm seleção em lote, e a marcação é por EAN, não por lançamento',()=>{
 const app=file('public/assets/app.js'),sw=file('public/sw.js');
 assert.match(app,/id="product-select-page"/);assert.match(app,/data-select-product=/);
 assert.match(app,/id="map-formula-on"/);assert.match(app,/id="map-formula-off"/);
 assert.match(app,/id="product-formula-on"/);assert.match(app,/id="product-formula-off"/);
 assert.match(app,/new Set\(\[\.\.\.selected\]\.map\(id=>rows\.find\(r=>r\.id===id\)\?\.ean\)/);
 assert.match(app,/request\('\/produtos\/formulas-lote'/);
 assert.match(sw,/registro-validades-v51-visualizacao-queima-timeout-validades/);
 assert.match(sw,/filtros-persistentes\.js/);
});
test('filtros são isolados por usuário, loja e aba e não confundem seleção de operadores',()=>{
 assert.notEqual(chaveFiltros('u1','151','mapas'),chaveFiltros('u2','151','mapas'));
 assert.notEqual(chaveFiltros('u1','151','mapas'),chaveFiltros('u1','152','mapas'));
 assert.notEqual(chaveFiltros('u1','151','mapas'),chaveFiltros('u1','151','produtos'));
 const mem=new Map();const storage={getItem:key=>mem.get(key),setItem:(key,v)=>mem.set(key,v)};
 const key=chaveFiltros('u1','151','mapas');storage.setItem(key,JSON.stringify({controls:{'map-month':{value:'2026-11'}},abas:{'map-tab-compare':true}}));
 assert.deepEqual(lerFiltros(storage,key).controls['map-month'],{value:'2026-11'});
 assert.equal(lerFiltros(storage,'qualquer'),null);
});
