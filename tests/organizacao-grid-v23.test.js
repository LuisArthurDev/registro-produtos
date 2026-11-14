import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/assets/app.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/assets/organizacao-secoes.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const rule=(name)=>css.match(new RegExp(`\\.${name}\\s*\\{([^}]+)\\}`))?.[1]||'';

test('quadro de funcionarios forma grid e nao carrossel horizontal',()=>{
 const board=rule('org-board');
 assert.match(board,/display\s*:\s*grid/);
 assert.match(board,/grid-template-columns\s*:\s*repeat\(auto-fit,minmax\(min\(100%,205px\),1fr\)\)/);
 assert.match(board,/overflow-x\s*:\s*hidden/);
 assert.doesNotMatch(board,/overflow-x\s*:\s*auto/);
 assert.doesNotMatch(board,/scroll-snap-type/);
});
test('cada card tem altura controlada e rolagem vertical propria',()=>{
 const column=rule('org-column');const cards=rule('org-column-cards');
 assert.match(column,/display\s*:\s*flex/);
 assert.match(column,/flex-direction\s*:\s*column/);
 assert.match(column,/height\s*:\s*clamp\(300px,46vh,440px\)/);
 assert.match(column,/overflow\s*:\s*hidden/);
 assert.match(cards,/flex\s*:\s*1 1 auto/);
 assert.match(cards,/min-height\s*:\s*0/);
 assert.match(cards,/overflow-y\s*:\s*auto/);
 assert.match(cards,/overflow-x\s*:\s*hidden/);
});
test('rolagem interna e acessivel por teclado e grid adapta-se ao celular',()=>{
 assert.match(ui,/role="region" tabindex="0" aria-label="Grupos de/);
 assert.match(css,/@media\(max-width:580px\)\{\s*\.org-board\{grid-template-columns:1fr/);
 assert.match(sw,/registro-validades-v55-atribuicao-por-secao/);
 assert.match(ui,/dragstart/);
 assert.match(ui,/data-org-select/);
});
