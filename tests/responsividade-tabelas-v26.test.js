import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rotularTabela} from '../public/assets/tabelas-responsivas.js';
const css=readFileSync(new URL('../public/assets/app.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

function criarCelula(colspan){
 const atributos=new Map(colspan? [['colspan',String(colspan)]] : []);
 return {tagName:'TD',getAttribute:k=>atributos.get(k)??null,setAttribute:(k,v)=>atributos.set(k,v),atributos};
}
function criarTabela(colunas,linhas){
 const th=colunas.map(textContent=>({textContent}));
 const trs=linhas.map(celulas=>({children:celulas}));
 return {querySelectorAll:s=>s==='thead tr:last-child th'?th:s==='tbody tr'?trs:[]};
}
test('rótulos das tabelas usam cabeçalhos reais, mesmo com 9 colunas',()=>{
 const colunas=['Funcionário','Código interno','EAN','Descrição','Lote','Validade','Quantidade','Situação','Ações'];
 const celulas=colunas.map(()=>criarCelula());
 rotularTabela(criarTabela(colunas,[celulas]));
 assert.deepEqual(celulas.map(x=>x.getAttribute('data-label')),colunas);
});
test('colspan e células vazias não deslocam os rótulos',()=>{
 const c1=criarCelula(),c2=criarCelula(2),c3=criarCelula();
 rotularTabela(criarTabela(['A','B','C','D'],[[c1,c2,c3]]));
 assert.equal(c1.getAttribute('data-label'),'A');
 assert.equal(c2.getAttribute('data-label'),'');
 assert.equal(c3.getAttribute('data-label'),'D');
});
test('chamada repetida preserva os títulos sem duplicar conteúdo',()=>{
 const c=criarCelula(),tab=criarTabela(['Quantidade corrigida'],[[c]]);
 rotularTabela(tab);rotularTabela(tab);
 assert.equal(c.getAttribute('data-label'),'Quantidade corrigida');
 assert.equal(c.atributos.size,1);
});
test('V28: linhas compactas preservadas, sem scroll horizontal',()=>{
 assert.match(css,/V28 — tabelas em LINHAS legíveis/);
 assert.match(css,/\.table-wrap table,#compare-table table\s*\{[^}]*min-width:0!important/s);
 assert.match(css,/@media screen and \(max-width:1139px\)/);
 assert.match(css,/content:attr\(data-label\)/);
 assert.match(css,/\.table-wrap tbody>tr\s*\{[^}]*display:flex/s);
 assert.match(css,/border-radius:0!important;box-shadow:none!important/);
 assert.doesNotMatch(css,/\.table-wrap tbody>tr\s*\{\s*display:block/);
 assert.match(css,/\.org-board\{grid-template-columns:1fr/);
});

test('PWA inclui o novo módulo e usa cache atualizado',()=>{
 assert.match(sw,/tabelas-responsivas\.js/);
 assert.match(sw,/registro-validades-v48-queima-so-novos-otimizada/);
});
