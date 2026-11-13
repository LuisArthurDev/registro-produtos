import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('public/index.html',root),'utf8');
const js=readFileSync(new URL('public/assets/app.js',root),'utf8');
const css=readFileSync(new URL('public/assets/app.css',root),'utf8');
const route=readFileSync(new URL('public/lancamentos.html',root),'utf8');
const sw=readFileSync(new URL('public/sw.js',root),'utf8');
test('marca ◈ é o único botão de recolher menu, sem botão isolado',()=>{
 assert.match(html,/<div class="brand sidebar-brand"><button[^>]+id="sidebar-collapse"[^>]+class="brand-icon brand-toggle"/);
 assert.equal((html.match(/id="sidebar-collapse"/g)||[]).length,1);
 assert.doesNotMatch(html,/<button[^>]+class="sidebar-collapse"/);
});
test('há apenas um acesso Lançamentos junto de Sair; destino é página Vercel',()=>{
 assert.equal((html.match(/id="side-open-launch"/g)||[]).length,1);
 assert.match(html,/<a id="side-open-launch" class="side-launch" href="\/lancamentos\.html"/);
 assert.match(html,/id="side-open-launch"[\s\S]+id="btn-logout"/);
 assert.ok(!js.includes("$('#side-open-launch').onclick=abrirNovoLancamento"));
 assert.match(js,/garantirAcessoUnicoAoLancamento/);
 assert.match(js,/MutationObserver\(garantirAcessoUnicoAoLancamento\)/);
 assert.match(route,/<body class="launch-route">/);
 assert.match(js,/IS_LAUNCH_PAGE/);
});
test('checkbox não herda dimensões de campo de texto e SW não apaga caches de terceiros',()=>{
 assert.match(css,/input\[type="checkbox"\],input\[type="radio"\]/);
 assert.match(css,/min-height:17px!important/);
 assert.match(sw,/name\.startsWith\('registro-validades-'\)/);
 assert.match(sw,/lancamentos\.html/);
});
