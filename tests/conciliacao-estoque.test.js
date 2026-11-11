import test from 'node:test';
import assert from 'node:assert/strict';
import { conciliarMapaComEstoque } from '../public/assets/conciliacao-estoque.js';
const m = (ean, lote, validade, quantidade, codigoInterno = '') => ({id:lote,ean,lote,validade,quantidade,codigoInterno});
const s = (ean,quantidade,codigo_interno='') => ({ean,quantidade,codigo_interno,descricao:'Exemplo'});
test('limita saldo importado e distribui entre lotes sem duplicar estoque', () => {
 const d=conciliarMapaComEstoque([m('0123456789012','b','2027-06-01',5),m('0123456789012','a','2027-04-01',4)], [s('0123456789012',6)]);
 assert.equal(d.itens[0].quantidadeCorrigida,2);
 assert.equal(d.itens[1].quantidadeCorrigida,4);
 assert.equal(d.resumo.unidadesCorrigidas,6);
});
test('preserva zeros iniciais do EAN e aplica saldo zero', () => {
 const d=conciliarMapaComEstoque([m('0001234567890','a','2027-01-01',5)], [s('0001234567890',0)]);
 assert.equal(d.itens[0].ean,'0001234567890');assert.equal(d.itens[0].quantidadeCorrigida,0);
});
test('não confunde saldo não importado com saldo zero', () => {
 const d=conciliarMapaComEstoque([m('12345678','a','2027-01-01',5)], []);
 assert.equal(d.itens[0].quantidadeCorrigida,null);assert.equal(d.resumo.naoEncontrados,1);
});
test('usa código interno quando único e compatível com o EAN', () => {
 const d=conciliarMapaComEstoque([m('12345678','a','2027-01-01',4,'00042')], [s('12345678',2,'00042')]);
 assert.equal(d.itens[0].quantidadeCorrigida,2);assert.equal(d.itens[0].codigoInterno,'00042');
});
test('não associa outro EAN por código interno repetido', () => {
 const d=conciliarMapaComEstoque([m('99999999','a','2027-01-01',4,'42')], [s('12345678',9,'42')]);
 assert.equal(d.itens[0].quantidadeCorrigida,null);
});
test('não considera ausência de estoque como motivo para reduzir automaticamente o mapa', () => {
 const d=conciliarMapaComEstoque([m('12345678','a','2027-01-01',5)], []);
 assert.equal(d.itens[0].quantidadeMapa,5);assert.equal(d.itens[0].situacao,'sem_saldo');
});
