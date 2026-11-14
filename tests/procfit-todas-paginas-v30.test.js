import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {carregarTodasPaginas} from '../public/assets/paginacao-completa.js';
import {montarListaProcfit} from '../public/assets/procfit.js';
import handler from '../api/index.js';
const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const EAN = i => String(1000000000000+i).padStart(14,'0');
const mapa=i=>({id:String(i),ean:EAN(i),codigoInterno:String(i+1),lote:'LOTE'+i,
 validade:'2026-11-30',mes_lancamento:'2026-11',quantidade:2,quantidadeCorrigida:i%8===0?0:1});

test('100 páginas da consulta: cópia usa todos os 10.000 registros, sem depender da página exibida',async()=>{
 const dataset=Array.from({length:10000},(_,i)=>mapa(i)),size=100,urls=[];
 const requisitar=async url=>{
   urls.push(url);
   const u=new URL(url,'https://teste.local'),offset=Number(u.searchParams.get('offset'));
   const limit=Number(u.searchParams.get('limit'));
   const dados=dataset.slice(offset,offset+limit);
   return {sucesso:true,paginado:true,registros:dados,proximoOffset:offset+limit<dataset.length?offset+limit:null};
 };
 const lista=await carregarTodasPaginas(requisitar,'/mapas?loja=151',{tamanho:size});
 assert.equal(lista.length,10000);assert.equal(urls.length,100);
 const exportacao=montarListaProcfit(lista,{corrigido:true});
 assert.equal(exportacao.total,8750);assert.equal(exportacao.ignorados.zerados,1250);
 assert.equal(exportacao.texto.split('\r\n').length,8751);
 assert.match(exportacao.texto,/LOTE9999/);
 assert.doesNotMatch(exportacao.texto,/LOTE9992\t/); // item zerado não é copiado.
});

test('página vazia e registros ocultos não interrompem a consulta quando há próximo offset',async()=>{
 let calls=0;
 const r=await carregarTodasPaginas(async url=>{
   calls++;
   const offset=Number(new URL(url,'https://example.com').searchParams.get('offset'));
   return offset===0?{paginado:true,registros:[],proximoOffset:800}:
      {paginado:true,registros:[{id:'fim'}],proximoOffset:null};
 },'/mapas?loja=151');
 assert.deepEqual(r,[{id:'fim'}]);assert.equal(calls,2);
});

test('falha, paginação incompleta ou cursor repetido não autorizam cópia parcial',async()=>{
 await assert.rejects(carregarTodasPaginas(async()=>({registros:[{id:1}]}),'/mapas'),/paginação completa/);
 await assert.rejects(carregarTodasPaginas(async()=>({paginado:true,registros:[{id:1}],proximoOffset:0}),'/mapas'),/Cursor/);
 let calls=0;
 await assert.rejects(carregarTodasPaginas(async()=>{
    calls++;if(calls===2)throw Error('Conexão interrompida');return {paginado:true,registros:[{id:'parcial'}],proximoOffset:800};
 },'/estoque'),/Conexão interrompida/);
});

test('o botão só aparece na Conferência; copiar não utiliza a página exibida',()=>{
 assert.match(app,/const pageRows=compareRows\.slice\(comparePage\*tam,\(comparePage\+1\)\*tam\)/);
 assert.match(app,/copiarProcfit\(filtrarMapasParaConferencia\(compareRows\)\)/);
 assert.doesNotMatch(app,/copiarProcfit\(pageRows\)/);
 assert.doesNotMatch(app,/copiarProcfit\(paged\(\)\)/);
 assert.match(app,/carregarTodasPaginas\(request,'\/mapas\?'/);
 assert.match(app,/wrap.closest\('#maps-table,#compare-table,/);
 assert.match(app,/carregarTodasPaginas\(request,urlWithLoja\('\/estoque'\)\)/);
 assert.match(sw,/registro-validades-v55-atribuicao-por-secao/);
 assert.match(sw,/paginacao-completa\.js/);
});

function criarApiFake(total=1650){
 const token='6'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldSecret=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_fake';
 const itens=Array.from({length:total},(_,i)=>({id:String(i).padStart(36,'0'),ean:EAN(i),mapa_nome:'Ana',tipo_mapa:'funcionario',quantidade:1,
   validade:'2027-11-30',excluido_em:null,loja_id:'151',produtos:{codigo_interno:'42',descricao:'Produto',secao:i%13===0?'Brinde':'PERFUMARIA',grupo:'BELEZA'}}));
 const saldos=itens.map((p,i)=>({loja_id:'151',produto_id:p.id,quantidade:1,atualizado_em:'2026-11-11T12:00:00Z',
  produtos:{ean:p.ean,codigo_interno:'42',descricao:'Produto',secao:i%13===0?'Brinde':'PERFUMARIA',grupo:'BELEZA'}}));
 const calls=[];
 globalThis.fetch=async (url,opt={})=>{
  const u=new URL(url),table=u.pathname.split('/rest/v1/')[1],met=opt.method||'GET',offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||1000);
  calls.push({table,offset,limit,loja:u.searchParams.get('loja_id')});let v=[];
  if(table==='sessoes')v=[{token_hash:hash,usuario_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
  if(table==='usuarios')v=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',loja_id:'151',perfil:'admin',nome:'Conferente',ativo:true}];
  if(table==='mapa_lancamentos')v=itens.slice(offset,offset+limit);
  if(table==='estoque_saldos')v=saldos.slice(offset,offset+limit);
  if(table==='organizacao_secoes'||table==='organizacao_grupos')v=[];
  return new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}});
 };
 return {token,calls,async api(path){
    const req={url:'/api'+path,method:'GET',headers:{host:'test.local',authorization:'Bearer '+token},body:{}};
    const res={statusCode:0,setHeader(){},end(text){this.json=JSON.parse(text);}};
    await handler(req,res);return res;
 },restore(){globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
 if(oldSecret===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldSecret;}};
}

test('API /mapas percorre o offset bruto, mesmo ocultando Brinde, sem omitir outros registros',async()=>{
 const e=criarApiFake();try{
   const obtidos=await carregarTodasPaginas(async url=>{
      const r=await e.api(url);assert.equal(r.statusCode,200);return r.json;
   },'/mapas?loja=151',{tamanho:800});
   assert.equal(obtidos.length,1650-Math.ceil(1650/13));
   assert.deepEqual(e.calls.filter(c=>c.table==='mapa_lancamentos').map(c=>c.offset),[0,800,1600]);
   assert.ok(obtidos.every(r=>r.secao==='PERFUMARIA'));
 }finally{e.restore();}
});

test('API /estoque percorre todos os lotes, com loja autenticada e metadados',async()=>{
 const e=criarApiFake();try{
   const obtidos=await carregarTodasPaginas(async url=>{
      const r=await e.api(url);assert.equal(r.statusCode,200);return r.json;
   },'/estoque?loja=151',{tamanho:800});
   assert.equal(obtidos.length,1650-Math.ceil(1650/13));
   assert.deepEqual(e.calls.filter(c=>c.table==='estoque_saldos').map(c=>c.offset),[0,800,1600]);
 }finally{e.restore();}
});
