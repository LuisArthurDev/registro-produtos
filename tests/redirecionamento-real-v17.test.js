import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const snippet=app.slice(app.indexOf('function showApp(fromLogin=false){'),app.indexOf('async function logout('));
function simulate(perfil,mobile,{hash='',fromLogin=false}={}){
 let route='',bridge=0;
 const ctx={
   IS_LAUNCH_PAGE:false,IS_VIEW_PAGE:false,state:{user:{perfil}},
   isGeral:()=>perfil==='geral',isAdmin:()=>perfil==='admin',
   window:{matchMedia:()=>({matches:mobile}),location:{replace:to=>{route=to;}}},
   location:{hash},criarPonteDeLogin:()=>{bridge++;},
   // The following throws if an unauthorized role could fall through to the panel.
   transferirEscolhaParaConta:()=>{throw Error('Inaccessible panel');}
 };
 vm.createContext(ctx);vm.runInContext(snippet,ctx);ctx.showApp(fromLogin);
 return {route,bridge};
}
test('funcionário no celular nunca chega ao painel, nem com #dashboard antigo',()=>{
 assert.deepEqual(simulate('funcionario',true,{hash:'#dashboard',fromLogin:true}),{route:'/lancamentos.html',bridge:1});
 assert.deepEqual(simulate('funcionario',true,{hash:'#dashboard',fromLogin:false}),{route:'/lancamentos.html',bridge:1});
});
test('funcionário no computador vê seu mapa, não o dashboard',()=>{
 assert.deepEqual(simulate('funcionario',false,{hash:'#dashboard',fromLogin:true}),{route:'/visualizacao.html',bridge:1});
});
test('admin no celular após login abre lançamentos independentemente da hash',()=>{
 assert.deepEqual(simulate('admin',true,{hash:'#dashboard',fromLogin:true}),{route:'/lancamentos.html',bridge:1});
});
