import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const push=readFileSync(new URL('../public/assets/push.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const launch=readFileSync(new URL('../public/lancamentos.html',import.meta.url),'utf8');
function createStorage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function runRequest(code,reply){
 const ctx={state:{token:'abc',user:null},fetch:async()=>reply,AbortController,clearTimeout,setTimeout,Error,JSON,Promise};
 vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.request('/sessao',{retries:0,timeout:400});
}
test('HTTP 401 mantém o código para ser tratado como sessão expirada',async()=>{
 const code=app.slice(app.indexOf('async function request('),app.indexOf('function isAdmin()'));
 await assert.rejects(runRequest(code,{ok:false,status:401,json:async()=>({mensagem:'Sessão inválida'})}),e=>e.code===401&&/Sessão inválida/.test(e.message));
});
test('HTTP 503 continua identificado para diagnóstico sem eliminar sessão',async()=>{
 const code=app.slice(app.indexOf('async function request('),app.indexOf('function isAdmin()'));
 await assert.rejects(runRequest(code,{ok:false,status:503,json:async()=>({mensagem:'Supabase indisponível',referencia:'TESTE'})}),e=>e.code===503&&/TESTE/.test(e.message));
});
test('ponte móvel só reutiliza login de curta duração validado neste dispositivo',()=>{
 const code=app.slice(app.indexOf('function criarPonteDeLogin()'),app.indexOf('function showApp('));
 const s=createStorage(),user={id:'82ea4c03-159b-5e31-bba3-91cea1b6c9cf',perfil:'funcionario',nome:'Isabela'};
 const ctx={state:{user,token:'token-1'},sessionStorage:s,AUTH_BRIDGE_KEY:'bridge',IS_LAUNCH_PAGE:true,Date,JSON};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.criarPonteDeLogin();assert.equal(ctx.consumirPonteDeLogin().nome,'Isabela');
 assert.equal(ctx.consumirPonteDeLogin(),null,'não reaproveita após F5');
 ctx.criarPonteDeLogin();ctx.state.token='token-diferente';assert.equal(ctx.consumirPonteDeLogin(),null,'não usa outra sessão');
});
test('erros do SDK são específicos: erro do CDN e não 30 segundos de silêncio',async()=>{
 const old={window:globalThis.window,navigator:globalThis.navigator,document:globalThis.document};
 let cb;
 const script={addEventListener(type,handler){if(type==='error')cb=handler;},remove(){}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{}}});
 globalThis.window={isSecureContext:true,OneSignalDeferred:[],__oneSignalLoadError:false};
 globalThis.document={getElementById:()=>script,head:{appendChild(){}}};
 try{
   const module=await import('data:text/javascript;base64,'+Buffer.from(push).toString('base64'));
   const promise=module.iniciarPush();cb?.();
   await assert.rejects(promise,/Não foi possível carregar o OneSignal/);
 }finally{
   globalThis.window=old.window;
   if(old.document===undefined)delete globalThis.document;else globalThis.document=old.document;
   if(old.navigator===undefined)delete globalThis.navigator;else Object.defineProperty(globalThis,'navigator',{configurable:true,value:old.navigator});
 }
});
test('botões de login permitem revalidar e SDK está configurado nas duas páginas',()=>{
 for(const html of [index,launch]){
  assert.match(html,/id="btn-revalidar-sessao"/);
  assert.match(html,/id="onesignal-sdk"/);
  assert.match(html,/window\.OneSignalDeferred/);
 }
 assert.match(app,/consumirPonteDeLogin\(\)/);
 assert.match(app,/prepararPush\(\)/);
});
test('OneSignal inicializa quando o callback do SDK responde',async()=>{
 const old={window:globalThis.window,navigator:globalThis.navigator,document:globalThis.document};
 const script={addEventListener(){},remove(){}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{}}});
 globalThis.window={isSecureContext:true,OneSignalDeferred:[],__oneSignalLoadError:false};
 globalThis.document={getElementById:()=>script,head:{appendChild(){}}};
 try{
   const module=await import('data:text/javascript;base64,'+Buffer.from(push+'\n//mockready').toString('base64'));
   const promise=module.iniciarPush();
   const sdk={init:async opts=>{assert.equal(opts.appId,'2e84a1da-d84f-4f22-a24f-8515dd357558');assert.equal(opts.serviceWorkerParam.scope,'/push/onesignal/');}};
   await globalThis.window.OneSignalDeferred[0](sdk);
   assert.equal(await promise,sdk);
   assert.equal(await module.iniciarPush(),sdk,'reutiliza uma inicialização já concluída');
 }finally{
   globalThis.window=old.window;
   if(old.document===undefined)delete globalThis.document;else globalThis.document=old.document;
   if(old.navigator===undefined)delete globalThis.navigator;else Object.defineProperty(globalThis,'navigator',{configurable:true,value:old.navigator});
 }
});
