import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
import {prepararImportacaoEstoque} from '../public/assets/estoque-importacao.js';
import {montarListaProcfit} from '../public/assets/procfit.js';
const load = p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const actorId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token='6'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
const EAN='07898962711477';
function env(){
 const prev=globalThis.fetch,oldU=process.env.SUPABASE_URL,oldS=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_example';
 const calls=[];
 let produto={id:pId,ean:EAN,codigo_interno:'97362',descricao:'Produto de teste',secao:'ALIMENTOS',grupo:'ALIMENTICIO'};
 globalThis.fetch=async(url,opt={})=>{
  const u=new URL(url),table=u.pathname.split('/rest/v1/')[1],method=opt.method||'GET',body=opt.body?JSON.parse(opt.body):null;
  calls.push({table,method,body,params:u.searchParams});let result=[];
  if(table==='sessoes')result=[{token_hash:hash,usuario_id:actorId,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
  if(table==='usuarios')result=[{id:actorId,nome:'Administrador',nome_normalizado:'administrador',loja_id:'151',perfil:'admin',ativo:true}];
  if(table==='organizacao_secoes'||table==='organizacao_grupos')result=[];
  if(table==='rpc/listar_secoes_catalogo')result=['ALIMENTOS','Brinde','HIGIENE'];
  if(table==='rpc/resumo_organizacao_grupos')result={grupos:[{nome:'ALIMENTICIO',chave:'alimenticio'}],estatisticas:[{chave:'alimenticio',funcionario_id:actorId,registros:3,unidades:7}],sem_grupo:0,sem_funcionario:0};
  if(table==='produtos'){
   if(method==='GET'){
    const ean=u.searchParams.get('ean'),codigo=u.searchParams.get('codigo_interno'),id=u.searchParams.get('id');
    result=[produto].filter(p=>!ean?.startsWith('eq.')||p.ean===ean.slice(3)).filter(p=>!codigo?.startsWith('in.')||codigo.includes(p.codigo_interno)).filter(p=>!id?.startsWith('eq.')||p.id===id.slice(3));
   }else if(method==='PATCH'){produto={...produto,...body};result=null;}
   else if(method==='POST')result=[{...body,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}];
  }
  if(table==='estoque_saldos'||table==='auditoria')result=null;
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 };
 return {calls, get produto(){return produto;},async request(path,method='GET',body={}){
  const res={statusCode:0,setHeader(){},end(s){this.data=JSON.parse(s)}};
  await handler({url:'/api/index.js?route='+path,method,headers:{host:'mock.test',authorization:'Bearer '+token},body},res);return res;
 },restore(){globalThis.fetch=prev;if(oldU===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldU;if(oldS===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldS;}};
}
test('EAN existente não é sobrescrito no cadastro: retorna 409',async()=>{
 const c=env();try{const r=await c.request('produtos','POST',{ean:EAN,codigo_interno:'97362',descricao:'Outro nome',secao:'HIGIENE'});
 assert.equal(r.statusCode,409);assert.equal(c.produto.descricao,'Produto de teste');assert.ok(!c.calls.some(x=>x.table==='produtos'&&x.method==='POST'));}finally{c.restore();}
});
test('edição válida altera EAN, descrição e Seção sem perder Grupo anterior',async()=>{
 const c=env();try{const novo='07898962711478';const r=await c.request('produtos','PATCH',{id:pId,ean:novo,codigo_interno:'97362',descricao:'Nome revisado',secao:'HIGIENE'});
 assert.equal(r.statusCode,200);assert.equal(c.produto.grupo,'ALIMENTICIO');assert.equal(c.produto.ean,novo);
 assert.equal(c.produto.secao,'HIGIENE');assert.equal(c.produto.descricao,'Nome revisado');}finally{c.restore();}
});
test('seletor obtém seções reais e exclui Brinde da apresentação',async()=>{
 const c=env();try{const r=await c.request('produtos/secoes');assert.equal(r.statusCode,200);assert.deepEqual(r.data.secoes,['ALIMENTOS','HIGIENE']);}finally{c.restore();}
});
test('organização usa RPC de GRUPOS e não escreve em mapa de validade',async()=>{
 const c=env();try{const r=await c.request('organizacao-secoes');assert.equal(r.statusCode,200);assert.equal(r.data.criterio,'grupo');assert.equal(r.data.secaoDisponiveis[0].nome,'ALIMENTICIO');
 assert.ok(c.calls.some(x=>x.table==='rpc/resumo_organizacao_grupos'));
 assert.ok(!c.calls.some(x=>x.table==='rpc/resumo_organizacao_secoes'));
 assert.ok(!c.calls.some(x=>x.table==='mapa_lancamentos'&&x.method!=='GET'));}finally{c.restore();}
});
test('importação do ODS reconhece Produto, EAN com zero e Saldo, descarta inválidos por linha',()=>{
 const l=[['Empresa','C.Estoque','Produto','Descricao','EAN','Marca','Secao','Grupo','Grupo Compra','Descricao','Subgrupo','Comprador','Nome','Saldo'],
 ['151','151','97362','Alfajor',EAN,'Marca','CONVENIENCIA','ALIMENTICIO','','','','','','2'],
 ['151','151','97363','Sem código EAN','','Marca','CONVENIENCIA','ALIMENTICIO','','','','','','1'],
 ['151','151','97364','Inválido','123','Marca','CONVENIENCIA','ALIMENTICIO','','','','','','-1'],
 ['152','152','97365','Outra loja','7898962711477','Marca','CONVENIENCIA','ALIMENTICIO','','','','','','4']];
 const {itens,resumo}=prepararImportacaoEstoque(l,{loja:'151'});
 assert.equal(itens.length,2);assert.equal(itens[0].ean,EAN);assert.equal(itens[1].codigo_interno,'97363');
 assert.equal(resumo.saldoInvalido,1);assert.equal(resumo.outraLoja,1);
});
test('importação para API recupera EAN pelo Código Interno sem inventar dígitos',async()=>{
 const c=env();try{
  const r=await c.request('estoque','POST',{itens:[{ean:'',codigo_interno:'97362',descricao:'Alfajor',secao:'ALIMENTOS',quantidade:2},{ean:'NAO',codigo_interno:'9999',descricao:'Inexistente',secao:'ALIMENTOS',quantidade:2}]});
  assert.equal(r.statusCode,200);assert.equal(r.data.importados,1);assert.equal(r.data.recuperados,1);assert.equal(r.data.ignoradosTotal,1);
  const post=c.calls.find(x=>x.table==='estoque_saldos'&&x.method==='POST');assert.equal(post.body[0].quantidade,2);
 }finally{c.restore();}
});
test('formato do Procfit v1.0 mantém ordem e zero inicial no texto copiado',()=>{
 const r=montarListaProcfit([{codigoInterno:'97362',ean:EAN,lote:'ABC123',validade:'2026-11-30',quantidade:2},{codigoInterno:'',ean:'07891234567890',lote:'LOTE02',validade:'2026-12-15',quantidade:1}]);
 assert.equal(r.texto,'Código Interno\tEAN\tLote\tValidade\tQuantidade\r\n97362\t07898962711477\tABC123\t30/11/2026\t2\r\n\t07891234567890\tLOTE02\t15/12/2026\t1');
});
test('migração SQL 017 cria Grupo e cruza EAN+Código Interno no próprio UPDATE',()=>{
 const sql=load('supabase/017_grupos_produtos.sql');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS grupo/i);assert.match(sql,/create table if not exists public\.organizacao_grupos/i);
 assert.match(sql,/p\.ean=t\.ean AND btrim\(coalesce\(p\.codigo_interno/);
 assert.match(sql,/NOTIFY pgrst, 'reload schema'/);
 assert.doesNotMatch(sql,/DELETE FROM public\.(produtos|mapa_lancamentos)/i);
});
test('Action busca atualizacao-produtos.ods e só altera Grupo após migração',()=>{
 const w=load('.github/workflows/atualizar-grupos-produtos.yml');const m=load('.github/workflows/migracao-supabase.yml');
 assert.match(w,/atualizacao-produtos\.ods/);assert.match(w,/atualizar_grupos_ods\.py/);
 assert.match(m,/grupos_produtos/);assert.match(m,/016_pendencias_ean_lancamentos\.sql/);assert.match(m,/017_grupos_produtos\.sql/);
});
