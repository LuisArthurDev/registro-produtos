import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const frontend=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/app.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

test('Lançamentos também abre o modal ao vir do GitHub Pages por #lancamentos',()=>{
 assert.match(frontend,/requested==='lancamentos'&&!isGeral\(\)/);
 assert.match(frontend,/queueMicrotask\(abrirNovoLancamento\)/);
 assert.match(frontend,/if\(route==='lancamentos'\)/);
});
test('scanner é fechado na navegação, logout e fechamento do formulário',()=>{
 assert.match(frontend,/async function logout\(call=true\)\{\s*void fecharScanner\(\)/);
 assert.match(frontend,/function navigate\(route\)\{\s*void fecharScanner\(\)/);
 assert.match(frontend,/'close',\(\)=>\{void fecharScanner\(\)/);
});
test('menu e pendências mantêm ações e paginação de 15, 25 ou 50',()=>{
 assert.match(page,/id="side-open-launch"/);
 assert.match(page,/id="pending-actions-dialog"/);
 assert.match(frontend,/openPendingActions\(r\)/);
 assert.match(frontend,/\<option\>15\<\/option\>\<option\>25\<\/option\>\<option\>50\<\/option\>/);
 assert.match(css,/\.pager-auto/);
});
test('Service Worker atualiza scanner.js no cache do PWA',()=>{
 assert.match(sw,/v32-destino-fixo-descida-lote/);
 assert.match(sw,/assets\/scanner\.js/);
});
