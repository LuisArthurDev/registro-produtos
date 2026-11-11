import test from 'node:test';
import assert from 'node:assert/strict';
import {tratarNotificacoes} from '../api/notificacoes.js';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const d1='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',d2='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const s1='11111111-1111-4111-8111-111111111111',s2='22222222-2222-4222-8222-222222222222';
test('aviso 8h detalha falha de aparelho sem expor token ou subscription id',async()=>{
 const oldFetch=global.fetch,old={...process.env},calls=[];let n=0;
 process.env.NOTIFICATION_CRON_SECRET='x'.repeat(40);
 process.env.NOTIFICATIONS_ENABLED='true';process.env.ONESIGNAL_REST_API_KEY='abc-secret';
 global.fetch=async()=>{n++;return new Response(JSON.stringify(n===1?{id:'notificacao-aceita',recipients:1}:{errors:['assinatura expirada']}),{
  status:n===1?200:400,headers:{'Content-Type':'application/json'}});};
 try{
  const resultado=await tratarNotificacoes({method:'POST',headers:{authorization:'Bearer '+process.env.NOTIFICATION_CRON_SECRET}},
   {pathname:'/notificacoes/cron',body:{},query:new URLSearchParams(),
    rows:async table=>{
     if(table==='usuarios')return [{id:user,loja_id:'151',nome:'Operador',perfil:'funcionario'}];
     if(table==='push_dispositivos')return [{id:d1,loja_id:'151',usuario_id:user,subscription_id:s1},{id:d2,loja_id:'151',usuario_id:user,subscription_id:s2}];
     if(table==='mapa_lancamentos')return [{loja_id:'151',quantidade:2,validade:new Date().toISOString().slice(0,10),produtos:{secao:'PERFUMARIA'}}];
     return [];
    },db:async(table,{method,body}={})=>{
      calls.push({table,method,body});if(table==='rpc/reservar_notificacao_push')return d1;
      return null;
    }});
  assert.equal(resultado.sucesso,false);assert.equal(resultado.aparelhos,2);
  assert.equal(resultado.enviados,1);assert.equal(resultado.falhas,1);
  assert.equal(resultado.falhasDetalhadas[0].etapa,'onesignal');
  assert.doesNotMatch(JSON.stringify(resultado),new RegExp(s2));
  assert.doesNotMatch(JSON.stringify(resultado),/abc-secret/);
 }finally{global.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];for(const [k,v] of Object.entries(old))process.env[k]=v;}
});
