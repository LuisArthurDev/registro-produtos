import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conciliarMapaComEstoque} from '../public/assets/conciliacao-estoque.js';
import {montarListaProcfit, copiarListaProcfit} from '../public/assets/procfit.js';
const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assets/app.css',import.meta.url),'utf8');
const map=(ean,lote,quantidade,validade='2026-11-30')=>({id:lote,ean,codigoInterno:'',lote,quantidade,validade,descricao:'Produto'});
const saldos=[{ean:'07898962711477',codigo_interno:'97362',quantidade:2,descricao:'Produto'}];
test('produto não localizado exibe saldo 0 e não participa da lista copiada',()=>{
 const res=conciliarMapaComEstoque([map('07898962711477','ABC123',7),map('00000000001234','OUTRO',3)],saldos);
 assert.equal(res.itens[0].quantidadeCorrigida,2);
 assert.equal(res.itens[1].quantidadeEstoque,0);
 assert.equal(res.itens[1].quantidadeCorrigida,0);
 assert.equal(res.itens[1].situacao,'nao_localizado');
 assert.equal(res.resumo.naoEncontrados,1);
 const exportado=montarListaProcfit(res.itens,{corrigido:true});
 assert.equal(exportado.total,1);
 assert.equal(exportado.ignorados.zerados,1);
 assert.match(exportado.texto,/^Código Interno\tEAN\tLote\tValidade\tQuantidade/);
 assert.match(exportado.texto,/\r\n97362\t07898962711477\tABC123\t30\/11\/2026\t2$/);
 assert.doesNotMatch(exportado.texto,/00000000001234/);
});
test('produtos com saldo insuficiente são limitados e saldo não é multiplicado por lote',()=>{
 const rows=conciliarMapaComEstoque([map('07898962711477','L1',2,'2026-11-01'),map('07898962711477','L2',4,'2026-12-01')],saldos).itens;
 assert.deepEqual(rows.map(x=>x.quantidadeCorrigida),[2,0]);
 assert.equal(montarListaProcfit(rows,{corrigido:true}).total,1);
});
test('não existe botão de cópia no mapa normal; somente na conferência',()=>{
 assert.doesNotMatch(app,/#map-copy-procfit|copiarProcfit\(filtered\)/);
 assert.match(app,/id="compare-export-procfit"/);
 assert.match(app,/prepararArquivoProcfit\(filtrarMapasParaConferencia\(compareRows\)\)/);
 assert.match(app,/prepararDadosProcfitTdb\(listaAtual/);
 assert.match(html,/id="procfit-export-dialog"/);
 assert.match(html,/id="procfit-export-preview"/);
 assert.match(html,/id="procfit-export-download"/);
});
test('Clipboard API indisponível oferece fallback nativo testável',async()=>{
 let v='';const campo={value:'',style:{},setAttribute(){},focus(){},select(){},remove(){}};
 const documento={createElement(){return campo;},body:{appendChild(){}},execCommand(){v=campo.value;return true}};
 await copiarListaProcfit('ABC\t1',{clipboard:{writeText:async()=>{throw new Error('denied')}},documento});
 assert.equal(v,'ABC\t1');
});
test('tabelas compactas continuam linhas, não cards, e previnem scroll lateral',()=>{
 assert.match(css,/V28 — tabelas em LINHAS legíveis/);
 assert.match(css,/\.table-wrap tbody>tr\{\s*display:flex/s);
 assert.match(css,/overflow-x:visible!important/);
 assert.match(css,/border-radius:0!important;box-shadow:none!important/);
});
