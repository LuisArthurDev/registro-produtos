import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import handler from '../api/index.js';
const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/012_exclusividade_geral_funcionarios.sql',import.meta.url),'utf8');
const flow=readFileSync(new URL('../.github/workflows/migracao-supabase.yml',import.meta.url),'utf8');
const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const isabelaId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mariaId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const itemId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const token='e'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
function testEnv({perfil='admin',titular=false,targetStore='151',forceTarget=null}={}){
  const old=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldSecret=process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_mock';
  const calls=[];
  const users=[
    {id:adminId,nome:perfil==='geral'?'Antigo Geral':'Administrador',nome_normalizado:'administrador',loja_id:perfil==='geral'?null:'151',perfil,ativo:true,titular_painel_geral:titular,acesso_geral:titular},
    {id:isabelaId,nome:'Isabela',loja_id:targetStore,perfil:'funcionario',ativo:true,excluido_em:null},
    {id:mariaId,nome:'Maria',loja_id:'151',perfil:'funcionario',ativo:true,excluido_em:null}
  ];
  const sessao={token_hash:hash,usuario_id:adminId,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true,modo_acesso:'admin',modo_expira_em:null};
  globalThis.fetch=async(url,opt={})=>{
    const target=new URL(url),table=target.pathname.split('/rest/v1/')[1],method=opt.method||'GET',body=opt.body?JSON.parse(opt.body):null;
    calls.push({table,method,body,params:target.searchParams});
    let result=[];
    if(table==='sessoes')result=[sessao];
    if(table==='usuarios'){
      const id=target.searchParams.get('id');
      result=id?users.filter(x=>x.id===id.replace('eq.','')):users;
    }
    if(table==='mapa_lancamentos')result=[{id:itemId,funcionario_id:isabelaId,mapa_nome:'Isabela',tipo_mapa:'funcionario',ean:'7891234567890',lote:'L1',validade:'2027-01-31',quantidade:3,mes_lancamento:'2026-11-01',produtos:{descricao:'Produto Exemplo',secao:'PERFUMARIA'}}];
    if(table==='rpc/renomear_funcionario_v12')result={sucesso:true,quantidade:3};
    if(table==='rpc/excluir_funcionario_v12')result={sucesso:true,quantidade:3,modo:body.p_modo};
    if(table==='rpc/transferir_lancamentos_v12')result={sucesso:true,quantidade:1};
    return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
  };
  return {calls,users,async request(path,method='GET',body={}){
    const res={statusCode:0,setHeader(){},end(value){this.data=JSON.parse(value);}};
    const [route,query='']=path.replace(/^\//,'').split('?');
    await handler({url:'/api/index.js?route='+route+(query?'&'+query:''),method,headers:{host:'example.test',authorization:'Bearer '+token},body},res);
    return res;
  },restore(){globalThis.fetch=old;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldSecret===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldSecret;}};
}
test('outro Administrador Geral sem titularidade não acessa nenhum dado global',async()=>{
 const db=testEnv({perfil:'geral',titular:false});try{const r=await db.request('/geral');assert.equal(r.statusCode,403);assert.ok(!db.calls.some(x=>x.table==='lojas'));}finally{db.restore();}
});
test('administrador de loja não acessa o Geral, mesmo alterando a requisição',async()=>{
 const db=testEnv();try{const r=await db.request('/geral');assert.equal(r.statusCode,403);}finally{db.restore();}
});
test('editar nome do funcionário chama função transacional com nome normalizado',async()=>{
 const db=testEnv();try{const r=await db.request('/usuarios','PATCH',{id:isabelaId,nome:'Isabela Silva'});
 assert.equal(r.statusCode,200);const call=db.calls.find(x=>x.table==='rpc/renomear_funcionario_v12');assert.ok(call);assert.equal(call.body.p_loja,'151');assert.equal(call.body.p_funcionario,isabelaId);assert.equal(call.body.p_nome_normalizado,'isabela silva');
 }finally{db.restore();}
});
test('exclusão preserva lançamentos sem responsável e desativa apenas via RPC',async()=>{
 const db=testEnv();try{const r=await db.request('/usuarios','DELETE',{id:isabelaId,modo:'flutuar'});
 assert.equal(r.statusCode,200);const call=db.calls.find(x=>x.table==='rpc/excluir_funcionario_v12');assert.ok(call);assert.equal(call.body.p_destino,null);assert.equal(call.body.p_modo,'flutuar');assert.ok(!db.calls.some(x=>x.table==='usuarios'&&x.method==='DELETE'));
 }finally{db.restore();}
});
test('exclusão permite transferência para funcionário ativo, nunca outra loja',async()=>{
 const db=testEnv();try{const r=await db.request('/usuarios','DELETE',{id:isabelaId,modo:'transferir',destino_id:mariaId});
 assert.equal(r.statusCode,200);const call=db.calls.find(x=>x.table==='rpc/excluir_funcionario_v12');assert.equal(call.body.p_destino,mariaId);
 }finally{db.restore();}
});
test('não é possível modificar funcionário de outra loja',async()=>{
 const db=testEnv({targetStore:'152'});try{const r=await db.request('/usuarios','DELETE',{id:isabelaId,modo:'flutuar'});assert.equal(r.statusCode,403);assert.ok(!db.calls.some(x=>x.table==='rpc/excluir_funcionario_v12'));}finally{db.restore();}
});
test('consulta por mês limita mapas de origem e devolve seção do produto',async()=>{
 const db=testEnv();try{const r=await db.request('/usuarios/lancamentos?origem='+isabelaId+'&mes=2026-11');
 assert.equal(r.statusCode,200);assert.equal(r.data.registros[0].secao,'PERFUMARIA');const calls=db.calls.filter(x=>x.table==='mapa_lancamentos');assert.ok(calls.length>0);for(const c of calls){assert.equal(c.params.get('loja_id'),'eq.151');assert.equal(c.params.get('mes_lancamento'),'eq.2026-11-01');}
 }finally{db.restore();}
});
test('transferir itens selecionados respeita origem destino mês e seção',async()=>{
 const db=testEnv();try{const r=await db.request('/usuarios/transferir','POST',{origem:isabelaId,destino:mariaId,mes:'2026-11',secao:'PERFUMARIA',todos:false,ids:[itemId]});
 assert.equal(r.statusCode,200);const call=db.calls.find(x=>x.table==='rpc/transferir_lancamentos_v12');assert.ok(call);assert.equal(call.body.p_mes,'2026-11-01');assert.deepEqual(call.body.p_ids,[itemId]);assert.equal(call.body.p_secao,'PERFUMARIA');assert.equal(call.body.p_todos,false);
 }finally{db.restore();}
});
test('itens flutuantes podem ser atribuídos a um novo responsável',async()=>{
 const db=testEnv();try{const r=await db.request('/usuarios/transferir','POST',{origem:'flutuando',destino:mariaId,mes:'2026-11',secao:'',todos:true,ids:[]});
 assert.equal(r.statusCode,200);const rpc=db.calls.find(x=>x.table==='rpc/transferir_lancamentos_v12');assert.equal(rpc.body.p_origem,null);assert.equal(rpc.body.p_destino,mariaId);assert.equal(rpc.body.p_todos,true);
 }finally{db.restore();}
});
test('mês incorreto, origem=destino e ausência de seleção impedem transferência',async()=>{
 const db=testEnv();try{
  assert.equal((await db.request('/usuarios/transferir','POST',{origem:isabelaId,destino:mariaId,mes:'2026-13',todos:true,ids:[]})).statusCode,422);
  assert.equal((await db.request('/usuarios/transferir','POST',{origem:isabelaId,destino:isabelaId,mes:'2026-11',todos:true,ids:[]})).statusCode,422);
  assert.equal((await db.request('/usuarios/transferir','POST',{origem:isabelaId,destino:mariaId,mes:'2026-11',todos:false,ids:[]})).statusCode,422);
  assert.ok(!db.calls.some(x=>x.table==='rpc/transferir_lancamentos_v12'));
 }finally{db.restore();}
});
test('interface contém ações, meses, seções, itens e opção sem responsável',()=>{
 for(const id of ['staff-move-open','staff-move-source','staff-move-target','staff-move-month','staff-move-section','staff-move-all','staff-rename-form','staff-delete-form'])assert.ok(app.includes(id),id);
 for(const txt of ['Editar nome','Excluir','Transferir lançamentos','Sem responsável (flutuando)'])assert.ok(app.includes(txt),txt);
});
test('SQL 012 preserva auditoria, restringe titular e faz movimentação dentro de transação',()=>{
 assert.match(sql,/nome_normalizado='luis arthur'/);assert.match(sql,/loja_id='151'/);assert.match(sql,/count\(\*\)/i);
 assert.match(sql,/FOR UPDATE/);assert.match(sql,/atualizado_em=now\(\)/);assert.match(sql,/INSERT INTO public\.auditoria/);
 assert.match(sql,/excluido_em=now\(\)/);assert.match(sql,/nome_original_exclusao/);
 assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.transferir_lancamentos_v12/);
 assert.match(flow,/proteger_geral_e_funcionarios/);
});
