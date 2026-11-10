import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resumoQueima} from '../public/assets/queima-grafico.js';
const registro=(id,ean='7891234567890',lote='L1',validade='2026-12-30',quantidade=2)=>({id,ean,lote,validade,quantidade,excluido_em:null});
const queimado=(id,lancamento_id,estado='pendente',opts={})=>({id,lancamento_id,estado,criado_em:'2026-11-10T12:00:00Z',...opts});
test('três categorias excluem-se mutuamente e somam 100% quando há registros',()=>{
 const mapas=[registro('a'),registro('b'),registro('c'),registro('d')];
 const filas=[queimado('q1','b'),queimado('q2','c','aprovado')];
 const r=resumoQueima(mapas,filas);
 assert.deepEqual([r.naoLancados,r.pendentes,r.aprovados,r.total],[2,1,1,4]);
 assert.deepEqual(r.percentuais,{naoLancados:50,pendentes:25,aprovados:25});
});
test('relançamento histórico não conta duas vezes o mesmo produto',()=>{
 const fila=[queimado('velho','a','relancado',{criado_em:'2026-10-10T12:00:00Z'}),queimado('novo','a','pendente')];
 assert.deepEqual([resumoQueima([registro('a')],fila).naoLancados,resumoQueima([registro('a')],fila).pendentes],[0,1]);
});
test('estados simultâneos para mesmo mapa escolhem a linha ativa mais recente',()=>{
 const fila=[queimado('q1','a','pendente',{criado_em:'2026-10-10T00:00:00Z'}),queimado('q2','a','aprovado',{criado_em:'2026-11-11T00:00:00Z'})];
 const r=resumoQueima([registro('a')],fila);
 assert.equal(r.aprovados,1);assert.equal(r.pendentes,0);assert.equal(r.total,1);
});
test('identidade legada EAN, lote e validade funciona sem lancamento_id, sem reutilização',()=>{
 const a=registro('a'),b=registro('b');
 const r=resumoQueima([a,b],[{id:'q',ean:a.ean,lote:a.lote,validade:a.validade,estado:'aprovado'}]);
 assert.equal(r.aprovados,1);assert.equal(r.naoLancados,1);assert.equal(r.total,2);
});
test('entradas manuais da Queima sem mapa ativo continuam no gráfico',()=>{
 const r=resumoQueima([registro('a')],[queimado('q1','mapa-excluido','aprovado'),{id:'q2',ean:'11111111',lote:'aa',validade:'2026-12-31',estado:'pendente'}]);
 assert.deepEqual([r.naoLancados,r.pendentes,r.aprovados,r.total],[1,1,1,3]);
});
test('registros zerados/excluídos não entram no total do mapa',()=>{
 const r=resumoQueima([registro('a',undefined,undefined,undefined,0),{...registro('b'),excluido_em:'2026-11-10'},registro('c')],[]);
 assert.deepEqual([r.naoLancados,r.total],[1,1]);
});
test('sem lançamentos, gráfico usa zero e não NaN',()=>{
 const r=resumoQueima([],[]);
 assert.deepEqual([r.naoLancados,r.pendentes,r.aprovados,r.total],[0,0,0,0]);
 assert.deepEqual(Object.values(r.percentuais),[0,0,0]);
});
test('gráfico está somente no Dashboard; Visualização usa a rota restrita',()=>{
 const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
 const vis=readFileSync(new URL('../public/assets/visualizacao.js',import.meta.url),'utf8');
 assert.match(app,/const grafico=resumoQueima\(ativos,queue\)/);
 assert.match(app,/Não lançados na Queima/);
 assert.match(app,/Lançados, não aprovados/);
 assert.match(app,/grafico\.aprovados/);
 assert.match(vis,/request\('\/visualizacao\/mapas'\)/);
 assert.match(app,/#transfer-list,#view-table/);
 assert.doesNotMatch(vis,/queima-donut/);
});
