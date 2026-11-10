import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import handler,{hashPin} from '../api/index.js';
const token='a'.repeat(64);
const tokenHash=createHash('sha256').update(token).digest('hex');
const session={token_hash:tokenHash,usuario_id:'11111111-1111-4111-8111-111111111111', expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true};
const previousUrl=process.env.SUPABASE_URL,previousKey=process.env.SUPABASE_SECRET_KEY;
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY='sb_secret_example';
async function simulate(role,body){
 const fetchOld=globalThis.fetch;
 let calls=[];const actor={id:session.usuario_id,ativo:true,perfil:role,loja_id:role==='geral'?null:'151',pin_hash:hashPin('123456'),tentativas:0,bloqueado_ate:null};
 globalThis.fetch=async(url,params)=>{
   const endpoint=new URL(url).pathname.split('/rest/v1/')[1];
   calls.push({endpoint,method:params.method,body:params.body?JSON.parse(params.body):null});
   const body=endpoint==='sessoes'?[session]:endpoint==='usuarios'&&params.method==='GET'?[actor]:endpoint==='rpc/alterar_pin_geral'?true:null;
   return {ok:true,status:200,text:async()=>JSON.stringify(body)};
 };
 const result={statusCode:0,setHeader(){},end(data){this.data=JSON.parse(data)}};
 try {await handler({url:'/api/index.js?route=conta/pin',method:'POST',headers:{host:'localhost',authorization:'Bearer '+token},body},result)}
 finally{globalThis.fetch=fetchOld;}
 return {result,calls};
}
test('Geral confirma PIN atual, troca hash sem enviar senha e não envia ID arbitrário',async()=>{
 const {result,calls}=await simulate('geral',{pinAtual:'123456',pinNovo:'654321',confirmacao:'654321'});
 assert.equal(result.statusCode,200);assert.equal(result.data.sucesso,true);
 const rpc=calls.find(c=>c.endpoint==='rpc/alterar_pin_geral');assert.ok(rpc);
 assert.equal(rpc.body.p_usuario,session.usuario_id);assert.equal(rpc.body.p_sessao_hash,tokenHash);
 assert.match(rpc.body.p_pin_hash,/^scrypt\$/);assert.ok(!JSON.stringify(calls).includes('654321'));
});
test('Geral com PIN atual errado não consegue trocar',async()=>{
 const {result,calls}=await simulate('geral',{pinAtual:'000000',pinNovo:'654321',confirmacao:'654321'});
 assert.equal(result.statusCode,422);assert.ok(!calls.some(c=>c.endpoint==='rpc/alterar_pin_geral'));
});
test('Administrador de Loja não pode chamar rota de troca do Geral',async()=>{
 const {result,calls}=await simulate('admin',{pinAtual:'123456',pinNovo:'654321',confirmacao:'654321'});
 assert.equal(result.statusCode,403);assert.ok(!calls.some(c=>c.endpoint==='rpc/alterar_pin_geral'));
});
test('PIN confirmado diferente bloqueia gravação',async()=>{
 const {result,calls}=await simulate('geral',{pinAtual:'123456',pinNovo:'654321',confirmacao:'000000'});
 assert.equal(result.statusCode,422);assert.ok(!calls.some(c=>c.endpoint==='rpc/alterar_pin_geral'));
});
