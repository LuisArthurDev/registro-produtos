import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const api=read('api/index.js'),ui=read('public/assets/app.js'),css=read('public/assets/app.css');

test('Sugestões de Queima usam amostras com limite real, não rows 75 em 1 página',()=>{
 assert.doesNotMatch(api,/await rows\('produtos',\{grupo:[\s\S]*?\},75,1\)/);
 assert.match(api,/select:'ean',order:'ean.asc',limit:70/);
 assert.match(api,/select:'funcionario_id,ean,validade',[\s\S]*?limit:180/);
 assert.match(api,/select:'funcionario_id,ean',order:'criado_em.desc',limit:120/);
 assert.match(api,/consulta_parcial:consultaParcial/);
 assert.match(api,/amostragem/);
});

test('Falha de sugestões não bloqueia atribuição manual de funcionários ativos',()=>{
 assert.match(ui,/const ativos=await staffList\(\)\.then\(equipe=>equipe.filter/);
 assert.match(ui,/A atribuição manual continua disponível/);
 assert.match(ui,/acao:'atribuir_importacao'/);
 assert.match(ui,/data-suggest-burn/);
});

test('A Queima usa linhas compactas, sem cards, com ações no menu e detalhes completos',()=>{
 assert.match(ui,/classList\.toggle\('queima-table-compacta',isQueima\)/);
 assert.match(ui,/class="queima-actions-menu"/);
 assert.match(ui,/data-details-burn/);
 assert.match(ui,/id="queima-detalhes-dialog"/);
 assert.match(ui,/\['Registro',old\.registro_queima\]/);
 assert.match(ui,/\['Lote',old\.lote\]/);
 assert.match(ui,/\['Motivo',old\.motivo\]/);
 assert.match(css,/#gen-list\.queima-table-compacta \.table-wrap tbody tr\{display:table-row!important;height:34px!important/);
 assert.match(css,/\.queima-actions-dropdown\{position:absolute/);
 assert.match(css,/#gen-list\.queima-table-compacta \.table-wrap table\{display:table!important/);
 assert.match(css,/\.queima-cell-text\{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis/);
});

test('Exportação continua completa mesmo com menos colunas na tabela visual',()=>{
 assert.ok(ui.includes("const camposExportacao=isQueima?['Registro','Data','EAN','Descrição','Responsável','Lote','Validade','Validade da Gôndola'"));
 assert.match(ui,/'Quantidade','Motivo','Situação'\]:cols/);
 assert.match(ui,/exportCsv\(`\$\{pathname\}-\$\{nowBrISO\(\)\}\.csv`,camposExportacao/);
});

test('Menu lateral começa recolhido nas três páginas, mas pode ser aberto e persiste',()=>{
 assert.match(ui,/rv_sidebar_recolhido_v53/);
 assert.match(ui,/localStorage\.getItem\(SIDEBAR_KEY\)!=='0'/);
 assert.match(ui,/localStorage\.setItem\(SIDEBAR_KEY,collapsed\?'1':'0'\)/);
 for(const page of ['index.html','lancamentos.html','visualizacao.html']){
  const html=read('public/'+page);
  assert.match(html,/id="app-shell" class="shell sidebar-collapsed" hidden/);
  assert.match(html,/id="sidebar-collapse"[^>]*aria-expanded="false"/);
 }
});
