import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import handler from '../api/index.js';
import {elegivelTentativaVenda,somarMesesLimitandoDia} from '../public/assets/tentativa.js';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const user={id:'11111111-1111-4111-8111-111111111111',nome:'Admin',nome_normalizado:'admin',loja_id:'151',perfil:'admin',ativo:true};
const id='22222222-2222-4222-8222-222222222222';
const token='f'.repeat(64),th=createHash('sha256').update(token).digest('hex');
function mocks(row,table){
 const saved={patch:null,query:null,audit:null,method:null};const old=globalThis.fetch;
 const oldEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_mock';
 globalThis.fetch=async (url,init={})=>{
  const u=new URL(url),t=u.pathname.split('/').pop(),method=init.method||'GET';
  const body=init.body?JSON.parse(init.body):null;
  if(t===table){saved.query=u.searchParams;saved.method=method;if(method==='PATCH')saved.patch=body;return new Response(JSON.stringify(method==='GET'?[row]:[]),{status:200});}
  if(t==='sessoes')return new Response(JSON.stringify([{token_hash:th,usuario_id:user.id,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true}]),{status:200});
  if(t==='usuarios')return new Response(JSON.stringify([user]),{status:200});
  if(t==='auditoria'){saved.audit=body;return new Response('[]',{status:200});}
  if(t==='lojas')return new Response('[]',{status:200});
  return new Response('[]',{status:200});
 };
 return {saved,restore(){globalThis.fetch=old;if(oldEnv.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldEnv.url;if(oldEnv.key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldEnv.key;}};
}
async function api(path,method,body){let out;await handler({url:'/api'+path,method,headers:{host:'localhost',authorization:'Bearer '+token},body}, {statusCode:200,setHeader(){},end(x){out=JSON.parse(x);this.output={data:out,status:this.statusCode};}});return out;}
// Black box result for valid handlers; failed calls exercise rejection from HTTP status via message.
test('Tentativa de Venda usa meses de calendário e bordas inclusivas',()=>{
 assert.equal(somarMesesLimitandoDia('2026-01-31',1),'2026-02-28');
 assert.equal(somarMesesLimitandoDia('2028-01-31',1),'2028-02-29');
 assert.equal(elegivelTentativaVenda('2027-02-10','2026-11-10'),true);
 assert.equal(elegivelTentativaVenda('2027-08-10','2026-11-10'),true);
 assert.equal(elegivelTentativaVenda('2027-02-09','2026-11-10'),false);
 assert.equal(elegivelTentativaVenda('2027-08-11','2026-11-10'),false);
});
test('Retirar da Loja arquiva registro original, sem DELETE físico',async()=>{
 const db=mocks({id,loja_id:'151',quantidade:2,validade:somarMesesLimitandoDia(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),4),ean:'7891234567890',lote:'ABC',mapa_nome:'Isabela'},'mapa_lancamentos');
 try{const d=await api('/mapas/retirar-loja','POST',{id});assert.equal(d.sucesso,true);assert.equal(db.saved.method,'PATCH');assert.ok(db.saved.patch.excluido_em);assert.ok(db.saved.patch.retirada_loja_em);assert.equal(db.saved.audit.acao,'retirar_da_loja_tentativa_venda');}finally{db.restore();}
});
for(const table of ['vencidos','transferencias']){
 test(`Excluir ${table} usa PATCH auditável, sem apagar fisicamente`,async()=>{
  const row={id,loja_id:'151',loja_destino:'151',ean:'7891234567890',quantidade:2,lote:'A',validade:'2027-04-03',romaneio:'ROM-1'};
  const db=mocks(row,table);
  try{const r=await api('/'+table,'DELETE',{id});assert.equal(r.sucesso,true);assert.equal(db.saved.method,'PATCH');assert.ok(db.saved.patch.excluido_em);assert.equal(db.saved.audit.acao,'excluir_'+table);}finally{db.restore();}
 });
}
test('Editar transferências não permite alterar loja destino',async()=>{
 const db=mocks({id,loja_destino:'151',ean:'7891234567890',quantidade:2},'transferencias');
 try{const r=await api('/transferencias','PATCH',{id,loja_destino:'999',quantidade:5,romaneio:'001-A'});assert.equal(r.sucesso,true);assert.equal(db.saved.patch.loja_destino,undefined);assert.equal(db.saved.patch.quantidade,5);assert.equal(db.saved.audit.acao,'editar_transferencias');}finally{db.restore();}
});
test('Front contém botões, modais e cálculo exato, não 90/270 dias',()=>{
 const app=read('public/assets/app.js'),schema=read('supabase/009_operacoes_perdas_transferencias.sql'),workflow=read('.github/workflows/migracao-supabase.yml');
 assert.match(app,/data-remove-map/);assert.match(app,/data-loss-edit/);assert.match(app,/data-loss-delete/);assert.match(app,/data-transfer-edit/);assert.match(app,/data-transfer-delete/);assert.match(app,/id="transfer-dialog"/);assert.match(app,/data-tv-retirar/);assert.match(app,/elegivelTentativaVenda/);
 assert.doesNotMatch(app,/d>=90&&d<=270/);
 assert.match(schema,/vencidos add column if not exists excluido_em/);assert.match(schema,/transferencias add column if not exists excluido_em/);
 assert.match(workflow,/atualizar_perdas_transferencias/);
});
test('OneSignal permite diagnóstico e worker correto, Vercel serve JS',()=>{
 assert.match(read('public/assets/push.js'),/export async function diagnosticarPush/);
 assert.match(read('public/assets/push.js'),/serviceWorkerPath:'push\/onesignal\/OneSignalSDKWorker.js'/);
 assert.match(read('vercel.json'),/application\/javascript/);
 assert.match(read('public/assets/app.js'),/id="push-diagnosticar"/);
});
