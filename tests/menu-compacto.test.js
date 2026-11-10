import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('public/assets/app.css');
const app=read('public/assets/app.js');
const html=read('public/index.html');
test('menu oculta barras mas permite rolagem vertical quando necessária',()=>{
 assert.match(css,/\.sidebar \.nav::\-webkit\-scrollbar/);
 assert.match(css,/overflow-y:auto!important/);
 assert.match(css,/scrollbar-width:none!important/);
 assert.match(css,/touch-action:pan-y/);
 assert.match(css,/\.sidebar \.nav-item:focus-visible/);
});
test('14 ícones SVG vetoriais locais substituem símbolos do menu',()=>{
 assert.equal((app.match(/const menus=\[(.*?)\];/s)?.[1].match(/\['/g)||[]).length,14);
 assert.match(app,/function navIcon\(name\)/);
 assert.match(app,/\$\{navIcon\(icon\)\}/);
 assert.match(html,/id="sidebar-collapse" class="brand-icon brand-toggle"/);
});
test('um acesso de lançamentos com ícone SVG e menu ◈ único',()=>{
 assert.equal((html.match(/id="side-open-launch"/g)||[]).length,1);
 assert.match(html,/id="side-open-launch"[^>]+href="\/lancamentos\.html"/);
 assert.match(html,/class="side-launch-label">Ir para lançamentos/);
 assert.match(html,/class="side-logout-label">Sair da conta/);
});
