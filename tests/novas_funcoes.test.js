import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler,{hashPin} from '../api/index.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const headers={host:'localhost'};
function call(url,method='GET',body=null,extra={}){
  return new Promise(resolve=>{
    const req={url,method,body,headers:{...headers,...extra}};
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(text){resolve({status:this.statusCode,data:JSON.parse(text)});}};
    handler(req,res);
  });
}
function withEnv(fn){const prev={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY};process.env.SUPABASE_URL='https://test-ref.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_fake';return Promise.resolve().then(fn).finally(()=>{for(const [k,v] of Object.entries(prev))if(v===undefined)delete process.env[k];else process.env[k]=v;});}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
const admin={id:'11111111-1111-4111-8111-111111111111',nome:'Admin',nome_normalizado:'admin',loja_id:'151',perfil:'admin',ativo:true,celular_proprio:false};
const sessao={token_hash:'unused',usuario_id:admin.id,expira_em:new Date(Date.now()+1000*3600).toISOString(),ultima_atividade:new Date().toISOString(),manter_conectado:true};
const auth={authorization:'Bearer '+('a'.repeat(64))};
test('login oferece campo de loja persistente com botão para apagar',()=>{
  const html=read('../public/index.html'), js=read('../public/assets/app.js');
  assert.match(html,/id="login-loja-clear"/);
  assert.match(js,/input\.addEventListener\('input',save\)/);
  assert.match(js,/input\.readOnly=valid/);
  assert.match(js,/localStorage\.setItem\(STORE_KEY,clean\)/);
  assert.match(js,/localStorage\.removeItem\(STORE_KEY\)/);
  assert.match(js,/clear\.onclick=.*input\.focus/);
});
test('edição dos mapas inclui EAN, lote, validade e quantidade com modal',()=>{
  const html=read('../public/index.html'), js=read('../public/assets/app.js');
  assert.match(html,/id="edit-map-dialog"/); assert.match(js,/function openMapEdit/);
  assert.match(js,/await request\(urlWithLoja\('\/mapas'\),\{method:'PATCH'/);
  for(const field of ['ean','lote','quantidade','validade'])assert.match(html,new RegExp('name="'+field+'"'));
});
test('migração aditiva mantém pendências e permite revisão de status',()=>{
 const sql=read('../supabase/003_pendencias.sql');
 assert.match(sql,/add column if not exists status/);
 assert.match(sql,/add column if not exists resultado jsonb/);
 assert.match(sql,/add column if not exists corrigido_por/);
 const yaml=read('../.github/workflows/migracao-supabase.yml');
 assert.match(yaml,/ajustar_pendencias/);assert.match(yaml,/003_pendencias\.sql/);
});
test('falha interna de login apresenta referência sem expor detalhes do banco',async()=>{
 const result=await withEnv(async()=>{
  const previous=global.fetch, logger=console.error;
  console.error=()=>{};global.fetch=async()=>{throw new Error('segredo-simulado-NUNCA-MOSTRAR');};
  try{return await call('/api/login','POST',{nome:'Teste',loja:'151',pin:'123456'});}finally{global.fetch=previous;console.error=logger;}
 });
 assert.equal(result.status,500);assert.match(result.data.referencia,/^[A-F0-9]{8}$/);
 assert.equal(JSON.stringify(result.data).includes('segredo-simulado'),false);
});
test('consulta de pendências exige login de administrador',async()=>{
 const response=await call('/api/pendencias');assert.equal(response.status,401);
});
test('administrador visualiza apenas pendências de migração da própria loja',async()=>{
 await withEnv(async()=>{
  const previous=global.fetch;
  global.fetch=async(url,opts={})=>{
   const target=new URL(url),table=target.pathname.split('/').pop();
   if(table==='sessoes')return json([sessao]);
   if(table==='usuarios')return json([admin]);
   if(table==='catalogo_pendencias')return json([{codigo_original:'5253066',descricao:'Item sem EAN',motivo:'EAN inválido'}]);
   if(table==='migracao_pendencias')return json([
    {origem_migracao:'map-151',tabela_origem:'mapa_lancamentos',dados:{loja_id:'151'}},
    {origem_migracao:'map-333',tabela_origem:'mapa_lancamentos',dados:{loja_id:'333'}}]);
   return json([]);
  };
  try{const response=await call('/api/pendencias','GET',null,auth);assert.equal(response.status,200);assert.equal(response.data.catalogo.length,1);assert.deepEqual(response.data.migracao.map(x=>x.origem_migracao),['map-151']);}
  finally{global.fetch=previous;}
 });
});
test('edição de mapa aceita EAN e atualiza referência de produto',async()=>{
 await withEnv(async()=>{
  const previous=global.fetch;let patch=null;
  global.fetch=async(url,opts={})=>{
   const target=new URL(url),table=target.pathname.split('/').pop();
   if(table==='sessoes')return json([sessao]);
   if(table==='usuarios')return json([admin]);
   if(table==='mapa_lancamentos'&&opts.method==='PATCH'){patch=JSON.parse(opts.body);return json([]);}
   if(table==='mapa_lancamentos')return json([{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',loja_id:'151',ean:'12345678',mapa_nome:'Admin',lote:'AB',validade:'2026-12-30',quantidade:2}]);
   if(table==='produtos')return json([{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]);
   if(table==='auditoria')return json([]);
   return json([]);
  };
  try{const r=await call('/api/mapas','PATCH',{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ean:'0000000012345',lote:'CD',validade:'2027-01-15',quantidade:3},auth);assert.equal(r.status,200);assert.equal(patch.ean,'0000000012345');assert.equal(patch.produto_id,'cccccccc-cccc-4ccc-8ccc-cccccccccccc');}
  finally{global.fetch=previous;}
 });
});
test('corrigir pendência de mapa preserva mês e origem, sem permitir trocar loja de administrador',async()=>{
 await withEnv(async()=>{
  const previous=global.fetch;const sent=[];
  const pending={origem_migracao:'orig123',tabela_origem:'mapa_lancamentos',motivo:'EAN inválido',dados:{loja_id:'151',mapa_nome:'Psicotropicos',tipo_mapa:'Psicotropicos',ean:'5253066',lote:'AB123',validade:'2027-11-30',quantidade:'2',mes_lancamento:'2026-10-01',criado_em:'2026-10-10T10:20:00Z'}};
  global.fetch=async(url,opts={})=>{
   const table=new URL(url).pathname.split('/').pop();
   if(table==='sessoes')return json([sessao]);
   if(table==='usuarios')return json([admin]);
   if(table==='migracao_pendencias'&&opts.method==='PATCH'){sent.push({table,method:'PATCH',body:JSON.parse(opts.body)});return json([]);}
   if(table==='migracao_pendencias')return json([pending]);
   if(table==='produtos')return json([{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]);
   if(table==='mapa_lancamentos'&&opts.method==='POST'){sent.push({table,method:'POST',body:JSON.parse(opts.body)});return json([]);}
   if(table==='auditoria')return json([]);
   return json([]);
  };
  try{
   const invalid=await call('/api/pendencias','PATCH',{tipo:'migracao',id:'orig123',correcao:{loja_id:'333',ean:'7891234567895'}},auth);
   assert.equal(invalid.status,403);
   const r=await call('/api/pendencias','PATCH',{tipo:'migracao',id:'orig123',correcao:{ean:'0789123456789',lote:'AB123',validade:'2027-11-30',quantidade:2}},auth);
   assert.equal(r.status,200);
   const inserted=sent.find(x=>x.table==='mapa_lancamentos').body;
   assert.equal(inserted.origem_migracao,'orig123');assert.equal(inserted.mes_lancamento,'2026-10-01');assert.equal(inserted.ean,'0789123456789');
   assert.equal(sent.find(x=>x.table==='migracao_pendencias').body.status,'corrigido');
  }finally{global.fetch=previous;}
 });
});
test('login com loja lembrada continua funcionando com PIN de 10 dígitos',async()=>{
 await withEnv(async()=>{
  const previous=global.fetch;let issued=false;
  global.fetch=async(url,opts={})=>{
   const table=new URL(url).pathname.split('/').pop();
   if(table==='usuarios'&&opts.method==='PATCH')return json([]);
   if(table==='usuarios')return json([{...admin,pin_hash:hashPin('1234567890'),bloqueado_ate:null,tentativas:0}]);
   if(table==='sessoes'&&opts.method==='POST'){issued=true;return json([]);}
   return json([]);
  };
  try{const r=await call('/api/login','POST',{nome:'Admin',loja:'151',pin:'1234567890',manterConectado:true});assert.equal(r.status,200);assert.equal(r.data.usuario.loja,'151');assert.ok(r.data.token);assert.ok(issued);}
  finally{global.fetch=previous;}
 });
});
