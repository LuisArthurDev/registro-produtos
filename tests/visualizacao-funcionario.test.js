import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const ownId='11111111-1111-4111-8111-111111111111';
const otherId='22222222-2222-4222-8222-222222222222';
const userId='33333333-3333-4333-8333-333333333333';
const otherUser='44444444-4444-4444-8444-444444444444';
const own={id:ownId,loja_id:'151',tipo_mapa:'funcionario',mapa_nome:'Isabela',funcionario_id:userId,ean:'7891234567890',lote:'ABC',validade:'2026-11-10',quantidade:1,excluido_em:null};
const other={...own,id:otherId,mapa_nome:'Ana',funcionario_id:otherUser};
const secretToken='8'.repeat(64);
const session={token_hash:createHash('sha256').update(secretToken).digest('hex'),usuario_id:userId,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true};
const profile={id:userId,nome:'Isabela',nome_normalizado:'isabela',loja_id:'151',perfil:'funcionario',ativo:true};
async function simulate(path,method='GET',payload={}){
 const previous=global.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY,calls=[];
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_mock';
 global.fetch=async(url,opt={})=>{
  const u=new URL(url),table=u.pathname.split('/').pop(),method=opt.method||'GET';
  const body=opt.body?JSON.parse(opt.body):undefined;calls.push({table,method,body,url:u});
  let result=[];
  if(table==='sessoes')result=[session];
  else if(table==='usuarios')result=[profile];
  else if(table==='mapa_lancamentos'){
   let regs=[own,other];const id=u.searchParams.get('id'),mapa=u.searchParams.get('mapa_nome');
   if(id)regs=regs.filter(x=>id===`eq.${x.id}`);if(mapa)regs=regs.filter(x=>mapa===`eq.${x.mapa_nome}`);
   result=regs;
  }
  else if(table==='vencidos')result=[{id:'a',loja_id:'151',lancamento_id:ownId,mapa_origem:'Isabela',ean:own.ean},{id:'b',loja_id:'151',lancamento_id:otherId,mapa_origem:'Ana',ean:other.ean}];
  else if(table==='sinalizacoes')result=method==='POST'?[{id:'c'}]:[{id:'c',lancamento_id:ownId,ean:own.ean},{id:'d',lancamento_id:otherId,ean:other.ean}];
  else if(table==='queima')result=[{id:'q',lancamento_id:ownId}];
  else if(table==='auditoria')result=null;
  else if(table==='retirar_vencido_visualizacao')result={sucesso:true,quantidade:1};
  else if(method==='PATCH')result=null;
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const response={statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(txt){this.data=JSON.parse(txt);}};
 try{await handler({url:'/api'+path,method,headers:{host:'localhost',authorization:'Bearer '+secretToken},body:payload},response);return {...response,calls};}
 finally{global.fetch=previous;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
}
test('Página nova usa o mesmo app, possui layout próprio e scanner permanece em Lançamentos',()=>{
 const html=read('public/visualizacao.html'),launch=read('public/lancamentos.html'),js=read('public/assets/app.js');
 assert.match(html,/<body class="launch-route view-route">/);
 assert.match(html,/src="\/assets\/app\.js\?v=54"/);
 assert.match(js,/case 'visualizacao':await renderVisualizacao/);
 assert.match(js,/IS_VIEW_PAGE/);
 assert.match(js,/href="\/visualizacao.html"/);
 assert.match(launch,/id="ean-scanner-dialog"/);
 assert.doesNotMatch(html,/http-equiv="refresh"/);
});
test('Tela oferece todos filtros históricos e opções com controle de acesso',()=>{
 const s=read('public/assets/visualizacao.js');
 for(const token of ['Por mês de lançamento','Validade (a vencer)','Editar','Excluir','Sinalizar','Queima','Encaminhar para Vencidos','Exportar CSV','Imprimir','view-prev','view-size','name="observacao"'])assert.ok(s.includes(token),token);
 assert.ok(s.includes("loggedAdmin?'<a class=\"btn-outline\""),'somente administrador pode entrar no painel');
});
test('Visualização mostra somente Mapa/Lançamentos e os três modos de consulta',()=>{
 const s=read('public/assets/visualizacao.js');
 const abas=[...s.matchAll(/data-view-tab=\"([^\"]+)\"/g)].map(m=>m[1]);
 const modos=[...s.matchAll(/data-view-mode=\"([^\"]+)\"/g)].map(m=>m[1]);
 assert.deepEqual(abas,['mapas']);
 assert.deepEqual(modos,['mes','validade','queima']);
 assert.doesNotMatch(s,/data-view-tab=\"vencidos\"|data-view-tab=\"sinalizacoes\"/);
 assert.doesNotMatch(s,/request\('\/visualizacao\/(vencidos|sinalizacoes)'/);
 assert.match(s, /prefs\.tab='mapas'/);
 for(const token of ['Por mês de lançamento','Validade (a vencer)','data-view-info','data-view-edit','data-view-delete'])assert.ok(s.includes(token),token);
});
test('API restringe leitura de vencidos às retiradas do próprio mapa',async()=>{
 const result=await simulate('/visualizacao/vencidos');assert.equal(result.statusCode,200);assert.equal(result.data.registros.length,1);assert.equal(result.data.registros[0].mapa_origem,'Isabela');
});
test('API restringe leitura de sinalizações ao próprio mapa',async()=>{
 const result=await simulate('/visualizacao/sinalizacoes');assert.equal(result.statusCode,200);assert.equal(result.data.registros.length,1);assert.equal(result.data.registros[0].lancamento_id,ownId);
});
test('Funcionária edita seu lançamento, sem aceitar alteração de mapa',async()=>{
 const r=await simulate('/mapas','PATCH',{id:ownId,quantidade:4,mapa_nome:'Ana'});
 assert.equal(r.statusCode,200);const patch=r.calls.find(x=>x.table==='mapa_lancamentos'&&x.method==='PATCH');assert.deepEqual(Object.keys(patch.body).sort(),['atualizado_em','quantidade']);
});
test('Funcionária não edita nem exclui mapa de outra pessoa',async()=>{
 for(const method of ['PATCH','DELETE']){
  const r=await simulate('/mapas',method,{id:otherId,quantidade:5});assert.equal(r.statusCode,403);assert.ok(!r.calls.some(x=>x.table==='mapa_lancamentos'&&x.method!=='GET'));
 }
});
test('Funcionária sinaliza próprio item e o autor vem da sessão',async()=>{
 const r=await simulate('/visualizacao/sinalizar','POST',{id:ownId,motivo:'Muita Quantidade',atualizado_por:otherUser,loja:'999'});
 assert.equal(r.statusCode,200);const posted=r.calls.find(x=>x.table==='sinalizacoes'&&x.method==='POST');assert.equal(posted.body.atualizado_por,userId);assert.equal(posted.body.loja_id,'151');assert.equal(posted.body.lancamento_id,ownId);
});
test('Funcionária não sinaliza outro mapa e vê somente sua Queima',async()=>{
 const r=await simulate('/visualizacao/sinalizar','POST',{id:otherId,motivo:'Outras',observacao:'Erro'});assert.equal(r.statusCode,403);
 const info=await simulate('/visualizacao/queima?id='+otherId);assert.equal(info.statusCode,403);
});
test('Retirada do próprio mapa depende da função SQL transacional',()=>{
 const sql=read('supabase/010_visualizacao_funcionarios.sql');assert.match(sql,/FOR UPDATE/i);assert.match(sql,/mapa_nome<>u.nome/i);assert.match(sql,/prazo:=case/i);assert.match(sql,/exists\(select 1 from public.vencidos/i);
 const workflow=read('.github/workflows/migracao-supabase.yml');assert.match(workflow,/atualizar_visualizacao/);
});
test('PWA armazena visualização e redirecionamento GitHub Pages aponta para nova página',()=>{
 assert.match(read('public/sw.js'),/visualizacao.html/);assert.match(read('public/sw.js'),/assets\/visualizacao.js/);
 assert.match(read('docs/visualizacao.html'),/'visualizacao.html':'visualizacao.html'/);
});
