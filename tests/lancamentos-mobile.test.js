import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const standalone=read('public/lancamentos.html'),root=read('public/index.html'),js=read('public/assets/app.js'),css=read('public/assets/app.css'),sw=read('public/sw.js');
test('lancamentos.html é uma página verdadeira e não um redirecionamento',()=>{
 assert.match(standalone,/<body class="launch-route">/);
 assert.match(standalone,/<main id="content"/);
 assert.match(standalone,/id="ean-scanner-dialog"/);
 assert.match(standalone,/src="\/assets\/app.js"/);
 assert.doesNotMatch(standalone,/http-equiv="refresh"/);
 assert.doesNotMatch(standalone,/location.replace/);
});
test('a mesma implementação de scanner, validação e envio atende ambas as páginas',()=>{
 assert.match(js,/IS_LAUNCH_PAGE/);
 assert.match(js,/case 'lancamentos':await lancamentos\(false\)/);
 assert.match(js,/abrirScannerEAN\(\{input:f.elements.ean/);
 assert.match(js,/function submitLaunch\(data, form\)/);
 assert.match(js,/if\(isGeral\(\)\)\{window.location.replace/);
 assert.equal((standalone.match(/id="form-login"/g)||[]).length,1);
 assert.equal((root.match(/id="form-login"/g)||[]).length,1);
});
test('página suporta 320 a 800 pixels, entrada por câmera e áreas de toque',()=>{
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\.launch-route #form-launch input/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(sw,/registro-validades-v28-procfit-conferencia-linhas/);
 assert.match(sw,/lancamentos\.html/);
});
