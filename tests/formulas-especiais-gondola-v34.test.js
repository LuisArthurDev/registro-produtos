import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
import {conciliarMapaComEstoque} from '../public/assets/conciliacao-estoque.js';
import {montarListaProcfit} from '../public/assets/procfit.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const m1='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const m2='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
const EAN='07898962711477';
function environment({perfil='admin',formula=false,tipo='Estoque',validadeMapa='2027-12-31'}={}){
 const prev=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldSecret=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 let p={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',ean:EAN,codigo_interno:'97362',descricao:'Produto da loja',secao:'HIGIENE',grupo:'BELEZA',formula_especial:formula};
 const mapa=[{id:m1,loja_id:'151',tipo_mapa:tipo,mapa_nome:tipo==='funcionario'?'Isabela':tipo,produto_id:p.id,ean:EAN,lote:'ABC123',validade:validadeMapa,quantidade:3,excluido_em:null,produtos:{codigo_interno:'97362',descricao:'Produto da loja',secao:'HIGIENE',grupo:'BELEZA',formula_especial:formula}},
  {id:m2,loja_id:'151',tipo_mapa:'funcionario',mapa_nome:'Isabela',ean:'07890000123456',lote:'XYZ',validade:'2027-11-30',quantidade:2,excluido_em:null,produtos:null}];
 const queimas=[
  {id:'q1',loja_id:'151',lancamento_id:m1,ean:EAN,lote:'ABC123',quantidade:3,estado:'pendente',criado_em:'2026-11-11T14:00:00Z',validade_gondola:'2026-11-29',preco_gondola:8.9},
  {id:'q2',loja_id:'151',lancamento_id:m1,ean:EAN,lote:'ABC123',quantidade:2,estado:'aprovado',criado_em:'2026-11-11T15:00:00Z',validade_gondola:'2026-11-30',preco_gondola:9.5},
  {id:'q3',loja_id:'151',lancamento_id:null,ean:EAN,lote:'ABC123',quantidade:1,estado:'relancado',criado_em:'2026-11-11T16:00:00Z',validade_gondola:null,preco_gondola:null},
  {id:'q4',loja_id:'151',lancamento_id:null,ean:EAN,lote:'OTHER',quantidade:1,estado:'aprovado',criado_em:'2026-11-11T17:00:00Z'},
 ];
 const calls=[];
 globalThis.fetch=async(url,opt={})=>{
  const u=new URL(url),table=u.pathname.split('/rest/v1/')[1],method=opt.method||'GET',body=opt.body?JSON.parse(opt.body):null;
  calls.push({table,method,body,params:u.searchParams});let result=[];
  if(table==='sessoes')result=[{token_hash:hash,usuario_id:adminId,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true}];
  else if(table==='usuarios')result=[{id:adminId,nome:'Admin',nome_normalizado:'admin',loja_id:'151',perfil,ativo:true}];
  else if(table==='produtos'){
   if(method==='PATCH'){p={...p,...body};result=null;}
   else {
    result=[p];const eq=u.searchParams.get('ean');if(eq?.startsWith('eq.'))result=result.filter(x=>x.ean===eq.slice(3));
    const inp=u.searchParams.get('ean');if(inp?.startsWith('in.'))result=result.filter(x=>inp.includes(x.ean));
    if(u.searchParams.get('formula_especial')==='eq.true')result=result.filter(x=>x.formula_especial===true);
   }
  }
  else if(table==='mapa_lancamentos'){
   let resultMap=mapa;const id=u.searchParams.get('id');if(id?.startsWith('eq.'))resultMap=resultMap.filter(x=>x.id===id.slice(3));
   const set=u.searchParams.get('id');if(set?.startsWith('in.'))resultMap=resultMap.filter(x=>set.includes(x.id));
   result=resultMap;
  }
  else if(table==='queima'){
   result=queimas;const id=u.searchParams.get('lancamento_id');if(id?.startsWith('eq.'))result=result.filter(x=>x.lancamento_id===id.slice(3));
   const e=u.searchParams.get('ean');if(e?.startsWith('eq.'))result=result.filter(x=>x.ean===e.slice(3));
   const lote=u.searchParams.get('lote');if(lote?.startsWith('eq.'))result=result.filter(x=>x.lote===lote.slice(3));
   // Batch search in descending time is sorted by the API after merge.
   if(method==='POST')result=[{...body,id:'new'}];
  }
  else if(table==='organizacao_secoes'||table==='organizacao_grupos'||table==='sinalizacoes'||table==='vencidos')result=[];
  else if(table.startsWith('rpc/'))result={processados:2,ignorados:0};
  else if(table==='auditoria')result=null;
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,get product(){return p;},async call(path,method='GET',body={}){
  const [route,q='']=path.replace(/^\//,'').split('?');const res={statusCode:0,setHeader(){},end(t){this.data=JSON.parse(t);}};
  await handler({url:'/api/index.js?route='+route+(q?'&'+q:''),method,headers:{host:'test.local',authorization:`Bearer ${token}`},body},res);return res;
 },restore(){globalThis.fetch=prev;if(oldUrl==null)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldSecret==null)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldSecret;}};
}
test('Administrador consegue marcar ou desmarcar Fórmula Especial no cadastro',async()=>{
 const env=environment();try{
  const up=await env.call('produtos/formula-especial','POST',{ean:EAN,formula_especial:true});
  assert.equal(up.statusCode,200);assert.equal(env.product.formula_especial,true);
  const down=await env.call('produtos/formula-especial','POST',{ean:EAN,formula_especial:false});
  assert.equal(down.statusCode,200);assert.equal(env.product.formula_especial,false);
  assert.ok(env.calls.some(x=>x.table==='produtos'&&x.method==='PATCH'&&x.body.formula_especial===true));
 }finally{env.restore();}
});
test('Antes da cópia, a API retorna a lista atual de Fórmulas Especiais',async()=>{
 const env=environment({formula:true});try{
  const r=await env.call('produtos/formulas');
  assert.equal(r.statusCode,200);assert.deepEqual(r.data.eans,[EAN]);
  const app=read('public/assets/app.js');
  assert.match(app,/await request\('\/produtos\/formulas'/);
  assert.match(app,/bloqueados\.has\(String\(r\.ean\)\)/);
 }finally{env.restore();}
});
test('Funcionário não altera Fórmulas Especiais e booleans em formato string são rejeitados',async()=>{
 const env=environment({perfil:'funcionario'});try{
  assert.equal((await env.call('produtos/formula-especial','POST',{ean:EAN,formula_especial:true})).statusCode,403);
  assert.equal((await env.call('produtos','POST',{ean:EAN,descricao:'Teste',secao:'HIGIENE',formula_especial:'true'})).statusCode,403);
  assert.ok(!env.calls.some(x=>x.table==='produtos'&&x.method==='PATCH'));
 }finally{env.restore();}
});
test('Mapa informa a marcação e bloqueia Fórmula Especial antes de encaminhar para Queima',async()=>{
 const env=environment({formula:true,tipo:'Estoque'});try{
  const m=await env.call('mapas');assert.equal(m.statusCode,200);assert.equal(m.data.registros[0].formula_especial,true);
  const r=await env.call('mapas/encaminhar','POST',{ids:[m1],destino:'queima',registro_queima:'166240'});
  assert.equal(r.statusCode,409);assert.ok(!env.calls.some(x=>x.table==='rpc/encaminhar_mapa_queima_v40'));
 }finally{env.restore();}
});
test('Abas especiais não podem entrar em Queima (exceto Estoque)',async()=>{
 for(const tipo of ['Termolabil','Psicotropicos','Antibioticos']){
  const env=environment({tipo});try{
   const r=await env.call('mapas/encaminhar','POST',{ids:[m1],destino:'queima',registro_queima:'166240'});
   assert.equal(r.statusCode,409,tipo);assert.ok(!env.calls.some(x=>x.table==='rpc/encaminhar_mapa_queima_v40'));
  }finally{env.restore();}
 }
});
test('Estoque pode enviar dois registros para uma solicitação sem dados de gôndola no lançamento',async()=>{
 const env=environment({tipo:'Estoque'});try{
  const registro_queima='166240';
  const r=await env.call('mapas/encaminhar','POST',{ids:[m1,m2],destino:'queima',registro_queima});
  assert.equal(r.statusCode,200);assert.equal(r.data.resultado.processados,2);
  const rpc=env.calls.filter(x=>x.table==='rpc/encaminhar_mapa_queima_v40');assert.equal(rpc.length,1);
  assert.deepEqual(rpc[0].body.p_ids,[m1,m2]);assert.equal(rpc[0].body.p_registro,registro_queima);
 }finally{env.restore();}
});
test('Queima manual de Fórmula Especial é bloqueada mesmo com dados válidos da Gôndola',async()=>{
 const env=environment({formula:true});try{
  const r=await env.call('queima','POST',{ean:EAN,lote:'ABC123',validade:'2027-12-01',quantidade:2,registro_queima:'166240'});
  assert.equal(r.statusCode,409);assert.equal(env.calls.filter(c=>c.table==='queima'&&c.method==='POST').length,0);
 }finally{env.restore();}
});
test('Cadastro da Queima exige Registro e validade não vencida, mas não exige dados da gôndola',async()=>{
 const env=environment();try{
  const base={ean:EAN,lote:'L1',validade:'2027-12-01',quantidade:2};
  assert.equal((await env.call('queima','POST',base)).statusCode,422);
  assert.equal((await env.call('queima','POST',{...base,registro_queima:'166240'})).statusCode,200);
  const gravado=env.calls.find(x=>x.table==='queima'&&x.method==='POST');
  assert.equal(gravado.body.registro_queima,'166240');
  assert.equal(gravado.body.validade_gondola,undefined);assert.equal(gravado.body.preco_gondola,undefined);
 }finally{env.restore();}
});
test('API bloqueia cadastro manual vencido antes de chamar o banco',async()=>{
 const env=environment();try{
  const r=await env.call('queima','POST',{ean:EAN,lote:'ABC123',validade:'2000-01-01',quantidade:2,registro_queima:'166240'});
  assert.equal(r.statusCode,409);assert.match(r.data.mensagem||'',/vencido/i);
  assert.equal(env.calls.filter(c=>c.table==='queima'&&c.method==='POST').length,0);
 }finally{env.restore();}
});
test('API bloqueia encaminhamento do mapa vencido antes da RPC',async()=>{
 const env=environment({validadeMapa:'2000-01-01'});try{
  const r=await env.call('mapas/encaminhar','POST',{ids:[m1],destino:'queima',registro_queima:'166240'});
  assert.equal(r.statusCode,409);assert.match(r.data.mensagem||'',/vencido/i);
  assert.equal(env.calls.filter(c=>c.table==='rpc/encaminhar_mapa_queima_v40').length,0);
 }finally{env.restore();}
});
test('Aprovação exige Validade e Preço da Gôndola; novo lançamento não os preenche',async()=>{
 const env=environment();try{
  const sem=await env.call('queima','PATCH',{id:'q1',estado:'aprovado'});
  assert.equal(sem.statusCode,422);
  assert.equal(env.calls.filter(c=>c.table==='queima'&&c.method==='PATCH').length,0);
  const approved=await env.call('queima','PATCH',{id:'q1',estado:'aprovado',validade_gondola:'2026-11-30',preco_gondola:15.50});
  assert.equal(approved.statusCode,200,JSON.stringify(approved.data));
  const patch=env.calls.find(c=>c.table==='queima'&&c.method==='PATCH');
  assert.equal(patch.body.estado,'aprovado');
  assert.equal(patch.body.validade_gondola,'2026-11-30');assert.equal(patch.body.preco_gondola,15.5);
 }finally{env.restore();}
});
test('API importa XLS pelo Registro, envia código interno e mantém as linhas repetidas',async()=>{
 const env=environment();try{
  const base={codigo_interno:'93301',ean:'',lote:'17316',validade:'2026-11-28',quantidade:1,motivo:4};
  const linhas=[{linha:2,...base},{linha:3,...base}];
  const r=await env.call('queima/importar-xls','POST',{registro:'166240',itens:linhas});
  assert.equal(r.statusCode,200,JSON.stringify(r.data));
  const rpc=env.calls.filter(c=>c.table==='rpc/importar_queima_xls_v40');
  assert.equal(rpc.length,1);assert.equal(rpc[0].body.p_registro,'166240');
  assert.deepEqual(rpc[0].body.p_itens.map(x=>x.linha),[2,3]);
  assert.deepEqual(rpc[0].body.p_itens.map(x=>x.codigo_interno),['93301','93301']);
 }finally{env.restore();}
});
test('Importação não aceita funcionário, registro inválido ou linhas duplicadas',async()=>{
 const linhas=[{linha:2,codigo_interno:'93301',ean:'',lote:'A',validade:'2026-11-28',quantidade:2,motivo:4}];
 const funcionario=environment({perfil:'funcionario'});try{
  assert.equal((await funcionario.call('queima/importar-xls','POST',{registro:'166240',itens:linhas})).statusCode,403);
  assert.equal(funcionario.calls.filter(c=>c.table==='rpc/importar_queima_xls_v40').length,0);
 }finally{funcionario.restore();}
 const admin=environment();try{
  assert.equal((await admin.call('queima/importar-xls','POST',{registro:'abc',itens:linhas})).statusCode,422);
  assert.equal((await admin.call('queima/importar-xls','POST',{registro:'166240',itens:[linhas[0],linhas[0]]})).statusCode,422);
  assert.equal(admin.calls.filter(c=>c.table==='rpc/importar_queima_xls_v40').length,0);
 }finally{admin.restore();}
});
test('Visualização retorna TODAS as Queimas do EAN, inclusive outros lotes e aprovados',async()=>{
 const env=environment({tipo:'Estoque'});try{
  const r=await env.call('visualizacao/queima?id='+m1);
  assert.equal(r.statusCode,200,JSON.stringify(r.data));
  assert.deepEqual(r.data.registros.map(x=>x.id),['q4','q3','q2','q1']);
  assert.equal(r.data.registros.filter(x=>x.estado==='aprovado').length,2);
  assert.equal(r.data.registros[2].preco_gondola,9.5);
  assert.ok(env.calls.some(x=>x.table==='queima'&&x.params.get('lancamento_id')==='eq.'+m1));
  assert.ok(env.calls.some(x=>x.table==='queima'&&x.params.get('ean')==='eq.'+EAN&&!x.params.has('lote')));
 }finally{env.restore();}
});
test('Visualização não disponibiliza lançamento de Queima por POST, inclusive para administrador',async()=>{
 const env=environment();try{const r=await env.call('visualizacao/queima','POST',{ean:EAN});assert.notEqual(r.statusCode,200);assert.ok(!env.calls.some(x=>x.table==='queima'&&x.method==='POST'));}finally{env.restore();}
});
test('Conferência e Procfit ignoram Fórmulas Especiais sem eliminar o item do mapa',()=>{
 const saldos=[{ean:EAN,codigo_interno:'97362',quantidade:5},{ean:'07890000123456',codigo_interno:'97363',quantidade:2}];
 const mapa=[{id:'a',ean:EAN,lote:'L1',validade:'2027-11-30',quantidade:4,formula_especial:true},{id:'b',ean:'07890000123456',lote:'L2',validade:'2027-12-30',quantidade:2,formula_especial:false}];
 const resultado=conciliarMapaComEstoque(mapa,saldos);assert.equal(resultado.resumo.registros,2);
 assert.equal(resultado.itens[0].formulaEspecial,true);
 const copia=montarListaProcfit(resultado.itens,{corrigido:true});
 assert.equal(copia.total,1);assert.equal(copia.ignorados.formulasEspeciais,1);
 assert.doesNotMatch(copia.texto,new RegExp(EAN));
});
test('SQL 020 acrescenta colunas, trigger de proteção e RPC de lote por produto',()=>{
 const sql=read('supabase/020_formulas_especiais_queima_gondola.sql');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS formula_especial boolean/i);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS validade_gondola date/i);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS preco_gondola numeric\(12,2\)/i);
 assert.match(sql,/BEFORE INSERT ON public.queima/i);
 assert.match(sql,/encaminhar_mapa_queima_itens_v34/i);
 assert.match(sql,/validade_gondola,preco_gondola/i);
 assert.match(sql,/SELECT \(elem\.item->>'validade_gondola'\)::date,\(elem\.item->>'preco_gondola'\)::numeric/); // Each row must use its own JSON item.
 assert.doesNotMatch(sql,/SELECT \(raw->>'validade_gondola'\)::date/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.encaminhar_mapa_queima_itens_v34/i);
 assert.doesNotMatch(sql,/DELETE FROM public\.(queima|produtos|mapa_lancamentos)/i);
});
test('Interface possui olho no início, novos campos de Queima e os controles de Fórmula Especial',()=>{
 const app=read('public/assets/app.js'),view=read('public/assets/visualizacao.js'),html=read('public/index.html'),flow=read('.github/workflows/migracao-supabase.yml');
 assert.match(view,/class="view-eye-queima" data-view-info/);
 assert.match(view,/Histórico completo da Queima/);
 assert.match(view,/found\.length.*lançamento\(s\) encontrados/);
 assert.doesNotMatch(view,/data-view-info="\$\{link\(r\.id\)\}">ⓘ Queima/);
 assert.doesNotMatch(view,/request\('\/queima',\{method:'POST'/);
 assert.match(app,/data-formula-map/);assert.match(app,/data-product-formula/);
 assert.match(app,/const registro=destino==='queima'\?await solicitarRegistroQueima/);
 assert.match(app,/name="validade_gondola"/);assert.match(app,/name="preco_gondola"/);
 assert.match(html,/name="formula_especial"/);assert.match(html,/id="queima-gondola-dialog"/);
 assert.match(flow,/formulas_especiais_queima_gondola/);
});
