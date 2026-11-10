import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
const auth='8'.repeat(64),uid='33333333-3333-4333-8333-333333333333';
const specialId='11111111-1111-4111-8111-111111111111',workerId='22222222-2222-4222-8222-222222222222';
const special={id:specialId,loja_id:'151',tipo_mapa:'Estoque',mapa_nome:'Estoque',ean:'7891234567890',funcionario_id:null,excluido_em:null,quantidade:3};
const worker={...special,id:workerId,tipo_mapa:'funcionario',mapa_nome:'Isabela',funcionario_id:'22222222-2222-4222-8222-222222222222'};
const sessao={token_hash:createHash('sha256').update(auth).digest('hex'),usuario_id:uid,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true};
async function run(path,role='admin'){
 const oldFetch=global.fetch, oldUrl=process.env.SUPABASE_URL, oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_mock';
 const calls=[];
 global.fetch=async (url,opt={})=>{
  const u=new URL(url),table=u.pathname.split('/').pop();calls.push({table,url:u});
  let result=[];
  if(table==='sessoes')result=[sessao];
  if(table==='usuarios')result=[{id:uid,loja_id:'151',nome:'Rafaela',nome_normalizado:'rafaela',perfil:role,ativo:true}];
  if(table==='mapa_lancamentos'){
   result=[special,worker];const q=u.searchParams.get('id');
   if(q)result=result.filter(r=>q===`eq.${r.id}`);
  }
  if(table==='vencidos')result=[{id:'a',loja_id:'151',lancamento_id:specialId,mapa_origem:'Estoque'},{id:'b',loja_id:'151',lancamento_id:workerId,mapa_origem:'Isabela'}];
  if(table==='sinalizacoes')result=[{id:'a',lancamento_id:specialId},{id:'b',lancamento_id:workerId}];
  return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const res={statusCode:200,setHeader(){},end(v){this.data=JSON.parse(v);}};
 try{await handler({url:'/api'+path,method:'GET',headers:{host:'localhost',authorization:'Bearer '+auth},body:{}},res);return {res,calls};}
 finally{global.fetch=oldFetch;oldUrl===undefined?delete process.env.SUPABASE_URL:process.env.SUPABASE_URL=oldUrl;oldKey===undefined?delete process.env.SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY=oldKey;}
}
test('Administrador abre Visualização, recebe somente abas especiais (e não mapas de funcionários)',async()=>{
 const x=await run('/visualizacao/mapas');assert.equal(x.res.statusCode,200);
 assert.deepEqual(x.res.data.abasPermitidas,['Estoque','Termolabil','Psicotropicos','Antibioticos']);
 assert.deepEqual(x.res.data.registros.map(r=>r.id),[specialId]);
});
test('Administrador não consulta mapa de funcionário por parâmetro',async()=>{
 const x=await run('/visualizacao/mapas?mapa=Isabela');assert.equal(x.res.statusCode,403);
});
test('Administrador acessa filtro de aba especial sem sair da página',async()=>{
 const x=await run('/visualizacao/mapas?mapa=Estoque');assert.equal(x.res.statusCode,200);
 assert.equal(x.res.data.registros[0].mapa_nome,'Estoque');
});
test('Administrador só recebe vencidos e sinalizações ligados às abas especiais',async()=>{
 const a=await run('/visualizacao/vencidos');const b=await run('/visualizacao/sinalizacoes');
 assert.deepEqual(a.res.data.registros.map(r=>r.lancamento_id),[specialId]);
 assert.deepEqual(b.res.data.registros.map(r=>r.lancamento_id),[specialId]);
});
test('Administrador não consulta Queima de mapa individual via Visualização',async()=>{
 const x=await run('/visualizacao/queima?id='+workerId);assert.equal(x.res.statusCode,403);
});
