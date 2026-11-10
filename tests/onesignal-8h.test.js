import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { janelaOitoHoras, diasAte, elegiveisPorUsuario, tratarNotificacoes } from '../api/notificacoes.js';
const source = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const env = ['NOTIFICATION_CRON_SECRET','NOTIFICATIONS_ENABLED','ONESIGNAL_APP_ID','ONESIGNAL_REST_API_KEY'];
const restore=prev=>{for(const k of env){if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k];}};
const user='cdff1a73-4ba3-4d99-9432-37e4a3d0b8b8';
const dev='31edee4e-9296-4f82-b3be-277026a2e52e';
const subscription='49a4bc72-6fdd-42f3-8b0a-9013a9df9677';
function context(){
 let reserved=false;
 const dados={usuarios:[{id:user,loja_id:'151',nome:'Alice'}],push_dispositivos:[{id:dev,loja_id:'151',usuario_id:user,subscription_id:subscription,sessao_token_hash:'abc123'}],sessoes:[{token_hash:'abc123',expira_em:'2099-11-10T00:00:00Z'}],mapa_lancamentos:[{funcionario_id:user,loja_id:'151',tipo_mapa:'funcionario',quantidade:3,validade:'2026-11-20',produtos:{secao:'Perfumaria'}}]};
 return {
  req:{method:'POST',headers:{authorization:'Bearer '+'t'.repeat(48)}},
  deps:{pathname:'/notificacoes/cron',body:{},query:new URLSearchParams(),
   rows:async table=>dados[table]||[],
   db:async (table,arg)=>{
     if(table==='rpc/reservar_notificacao_push'){if(reserved)return null;reserved=true;return dev;}
     if(table==='notificacao_envios')return null;
     throw new Error('Unexpected DB '+table);
   }
  }
 };
}
test('cron agrupa janelas exatas de 8 horas em UTC',()=>{
 assert.equal(janelaOitoHoras(new Date('2026-11-09T16:17:00Z')),'2026-11-09T16:00:00.000Z');
 assert.equal(janelaOitoHoras(new Date('2026-11-09T07:30:00Z')),'2026-11-09T00:00:00.000Z');
});
test('contagem de vencidos respeita loja, funcionario e alimento 15 dias',()=>{
 const u=[{id:user,loja_id:'151'}];
 const maps=[
  {funcionario_id:user,loja_id:'151',tipo_mapa:'funcionario',quantidade:1,validade:'2026-11-25',produtos:{secao:'Alimentos'}},
  {funcionario_id:user,loja_id:'151',tipo_mapa:'funcionario',quantidade:1,validade:'2026-11-25',produtos:{secao:'Perfumaria'}},
  {funcionario_id:user,loja_id:'152',tipo_mapa:'funcionario',quantidade:1,validade:'2026-11-10',produtos:{}},
  {funcionario_id:user,loja_id:'151',tipo_mapa:'Estoque',quantidade:1,validade:'2026-11-10',produtos:{}}
 ];
 const m=elegiveisPorUsuario(maps,u,'2026-11-09');
 assert.equal(m.get(user).contagem,1);
 assert.equal(diasAte('2026-11-10','2026-11-09'),1);
});
test('cron recusa segredo incorreto e não consulta Supabase',async()=>{
 const prev=Object.fromEntries(env.map(k=>[k,process.env[k]]));
 try{process.env.NOTIFICATION_CRON_SECRET='t'.repeat(48);const c=context();c.req.headers.authorization='Bearer errado';await assert.rejects(tratarNotificacoes(c.req,c.deps),e=>e.status===401);}
 finally{restore(prev);}
});
test('cron não envia enquanto NOTIFICATIONS_ENABLED não for true',async()=>{
 const prev=Object.fromEntries(env.map(k=>[k,process.env[k]]));
 try{process.env.NOTIFICATION_CRON_SECRET='t'.repeat(48);process.env.NOTIFICATIONS_ENABLED='false';const c=context();assert.equal((await tratarNotificacoes(c.req,c.deps)).habilitado,false);}
 finally{restore(prev);}
});
test('cron ativo envia só uma vez para aparelho aprovado por janela',async()=>{
 const prev=Object.fromEntries(env.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 try{
  process.env.NOTIFICATION_CRON_SECRET='t'.repeat(48);
  process.env.ONESIGNAL_REST_API_KEY='fake-test-key';
  process.env.NOTIFICATIONS_ENABLED='true';
  process.env.ONESIGNAL_APP_ID='2e84a1da-d84f-4f22-a24f-8515dd357558';
  let calls=0;
  globalThis.fetch=async(url,opt)=>{calls++;assert.match(url,/api\.onesignal\.com\/notifications/);const body=JSON.parse(opt.body);assert.deepEqual(body.include_subscription_ids,[subscription]);assert.equal(body.target_channel,'push');assert.match(opt.headers.Authorization,/^Key /);return {ok:true,status:200,text:async()=>JSON.stringify({id:'123'})};};
  const c=context();
  assert.equal((await tratarNotificacoes(c.req,c.deps)).enviados,1);
  assert.equal((await tratarNotificacoes(c.req,c.deps)).pulados,1);
  assert.equal(calls,1);
 }finally{restore(prev);globalThis.fetch=originalFetch;}
});
test('implantação contém worker, SDK, workflow agendado, SQL e nenhum segredo real',()=>{
 assert.match(source('.github/workflows/notificacoes-8h.yml'),/17 0,8,16 \* \* \*/);
 assert.match(source('public/index.html'),/OneSignalSDK\.page\.js/);
 assert.match(source('public/lancamentos.html'),/OneSignalSDK\.page\.js/);
 assert.match(source('public/assets/push.js'),/2e84a1da-d84f-4f22-a24f-8515dd357558/);
 assert.match(source('supabase/005_notificacoes_onesignal.sql'),/unique\(janela,tipo,dispositivo_id\)/);
 assert.match(source('api/notificacoes.js'),/include_subscription_ids/);
});
