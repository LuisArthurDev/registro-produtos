import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync as read } from 'node:fs';
const api=read(new URL('../api/notificacoes.js',import.meta.url),'utf8');
const app=read(new URL('../public/assets/app.js',import.meta.url),'utf8');
const main=read(new URL('../public/index.html',import.meta.url),'utf8');
const launch=read(new URL('../public/lancamentos.html',import.meta.url),'utf8');
const sql=read(new URL('../supabase/006_notificacoes_para_todos.sql',import.meta.url),'utf8');
const worker=read(new URL('../public/push/onesignal/OneSignalSDKWorker.js',import.meta.url),'utf8');
test('permissão opcional ao entrar e em ambos acessos',()=>{
 assert.match(main,/id="push-consent-yes"/);assert.match(launch,/id="push-consent-yes"/);
 assert.match(main,/Agora não/);assert.match(launch,/Agora não/);
 assert.match(app,/queueMicrotask\(exibirConsentimento\)/);
});
test('API permite todos perfis ativos que aceitaram e não exige celular próprio',()=>{
 assert.match(api,/consentimento_em:'not\.is\.null'/);
 assert.match(api,/if\(!actor\.ativo\)/);
 assert.doesNotMatch(api,/if\(!actor\.ativo\|\|!actor\.celular_proprio\)/);
 assert.match(api,/perfil==='geral'/);
});
test('migração libera inscrição sem loja para Administrador Geral, preserva RLS 005',()=>{
 assert.match(sql,/ALTER COLUMN loja_id DROP NOT NULL/i);
 assert.match(sql,/consentimento_em timestamptz/i);
 assert.match(worker,/OneSignalSDK\.sw\.js/);
});
test('menu de notificações acessível também no Painel Geral',()=>{
 assert.match(app,/menusGeral=.*'notificacoes'/);
 assert.match(app,/\['painel-geral','admins-geral','notificacoes'\]/);
});

test('preferência de notificações isolada por usuário no mesmo aparelho',()=>{
 const code=read(new URL('../public/assets/push.js',import.meta.url),'utf8');
 assert.match(code,/keyUser=user=>/);
 assert.match(code,/escolhaPush\(user\)/);
 assert.match(code,/transferirEscolhaParaConta/);
 assert.match(app,/escolhaPush\(state.user\)/);
});

test('não há aprovação administrativa para novas inscrições e administrador não pode aprovar por PATCH',()=>{
 assert.match(api,/ativo:true,autorizado:true,consentimento_em:new Date\(\)\.toISOString\(\)/);
 assert.ok(api.includes("if(pathname==='/notificacoes/dispositivos'&&req.method==='PATCH')throw falha('Cada usuário gerencia seu consentimento no próprio aparelho.'"), 'Não há rota de aprovação administrativa');
 assert.doesNotMatch(api,/admin\(actor\);[\s\S]{0,300}autorizado:true,consentimento_em/);
});
test('login não expõe rolagem do documento',()=>{
 const css=read(new URL('../public/assets/app.css',import.meta.url),'utf8');
 assert.match(css,/body:has\(#login-screen:not\(\[hidden\]\)\)/);
 assert.match(css,/overflow:hidden!important;overscroll-behavior:none/);
});
test('preferência pré-login é consumida ao entrar, nunca herdada pela próxima conta',()=>{
 const push=read(new URL('../public/assets/push.js',import.meta.url),'utf8');
 assert.match(push,/sessionStorage\.removeItem\(PUSH_CHOICE_KEY\+':prelogin'\)/);
 assert.match(push,/if\(preferencia!=='nao'\)return/);
});
