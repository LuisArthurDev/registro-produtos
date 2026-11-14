import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapaElegivelParaConferencia,filtrarMapasParaConferencia} from '../public/assets/filtro-conferencia-procfit.js';
import {conciliarMapaComEstoque} from '../public/assets/conciliacao-estoque.js';
import {montarListaProcfit} from '../public/assets/procfit.js';
import {carregarTodasPaginas} from '../public/assets/paginacao-completa.js';

const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const EAN='07898962711477';
const r=(tipo_mapa,mapa_nome,lote,validade='2026-12-15',quantidade=2)=>({
  tipo_mapa,mapa_nome,lote,validade,quantidade,
  codigoInterno:'97362',ean:EAN,mes_lancamento:'2026-11',descricao:'Produto teste'
});
const saldo=[{ean:EAN,codigo_interno:'97362',quantidade:6}];

test('mapas dos funcionários e a única aba especial Estoque são elegíveis',()=>{
  assert.equal(mapaElegivelParaConferencia(r('funcionario','Isabela','L1')),true);
  assert.equal(mapaElegivelParaConferencia(r('funcionario','Ramon','L2')),true);
  assert.equal(mapaElegivelParaConferencia(r('Estoque','Estoque','L3')),true);
  for(const especial of ['Termolabil','Psicotropicos','Antibioticos']){
    assert.equal(mapaElegivelParaConferencia(r(especial,especial,'X')),false,especial);
  }
});

test('não autoriza registros legados inconsistentes nem abas especiais com acentos',()=>{
  assert.equal(mapaElegivelParaConferencia(r('funcionario','Psicotropicos','X')),false);
  assert.equal(mapaElegivelParaConferencia(r('funcionario','Termolábil','X')),false);
  assert.equal(mapaElegivelParaConferencia(r('Antibióticos','Isabela','X')),false);
  assert.equal(mapaElegivelParaConferencia(r('Estoque','Antibioticos','X')),false);
  assert.equal(mapaElegivelParaConferencia(r('Estoque','Isabela','X')),false);
  assert.equal(mapaElegivelParaConferencia(r('', 'Estoque','X')),false);
  assert.equal(mapaElegivelParaConferencia(null),false);
});

test('não inclui abas especiais no cálculo: não consomem saldo de funcionários/Estoque',()=>{
  const mistura=[
    r('Termolabil','Termolabil','TERMO','2026-11-01',6),
    r('Psicotropicos','Psicotropicos','PSICO','2026-11-02',6),
    r('Antibioticos','Antibioticos','ANTI','2026-11-03',6),
    r('funcionario','Isabela','FUNC','2026-11-05',4),
    r('Estoque','Estoque','ESTOQUE','2026-11-10',3),
  ];
  const elegiveis=filtrarMapasParaConferencia(mistura);
  assert.deepEqual(elegiveis.map(x=>x.lote),['FUNC','ESTOQUE']);
  const comparacao=conciliarMapaComEstoque(elegiveis,saldo);
  assert.deepEqual(comparacao.itens.map(x=>x.quantidadeCorrigida),[4,2]);
  assert.deepEqual(comparacao.itens.map(x=>x.tipoMapa),['funcionario','Estoque']);
  const exportar=montarListaProcfit(filtrarMapasParaConferencia(comparacao.itens),{corrigido:true});
  assert.equal(exportar.total,2);
  assert.match(exportar.texto,/\tFUNC\t/);
  assert.match(exportar.texto,/\tESTOQUE\t/);
  for(const id of ['TERMO','PSICO','ANTI'])assert.doesNotMatch(exportar.texto,new RegExp(id));
});

test('também exclui aba especial se ela aparecer indevidamente na lista conferida',()=>{
  const itens=[
    {...r('Antibioticos','Antibioticos','X'),quantidadeCorrigida:5,tipoMapa:'Antibioticos',mapa:'Antibioticos'},
    {...r('Estoque','Estoque','Y'),quantidadeCorrigida:1,tipoMapa:'Estoque',mapa:'Estoque'},
  ];
  const texto=montarListaProcfit(filtrarMapasParaConferencia(itens),{corrigido:true}).texto;
  assert.match(texto,/\tY\t/);
  assert.doesNotMatch(texto,/\tX\t/);
});

test('100 páginas mistas: inclui todos os funcionários e Estoque, ignora todas as outras especiais',async()=>{
  const tipos=['funcionario','Estoque','Termolabil','Psicotropicos','Antibioticos'];
  const dados=Array.from({length:10000},(_,i)=>({
    ...r(tipos[i%5], tipos[i%5]==='funcionario'?'Isabela':tipos[i%5],`LOTE${i}`),
    ean:String(7891000000000+i),codigoInterno:String(i+1),quantidadeCorrigida:2,
    id:`id-${i}`,mapa:tipos[i%5]==='funcionario'?'Isabela':tipos[i%5],tipoMapa:tipos[i%5]
  }));
  let paginas=0;
  const todos=await carregarTodasPaginas(async url=>{
    paginas++;const q=new URL(url,'https://teste.local').searchParams;
    const offset=Number(q.get('offset')),size=Number(q.get('limit'));
    return {paginado:true,sucesso:true,registros:dados.slice(offset,offset+size),proximoOffset:offset+size<dados.length?offset+size:null};
  },'/mapas?loja=151',{tamanho:100});
  assert.equal(paginas,100);
  const elegiveis=filtrarMapasParaConferencia(todos);
  assert.equal(elegiveis.length,4000);
  const exportacao=montarListaProcfit(elegiveis,{corrigido:true});
  assert.equal(exportacao.total,4000);
  assert.match(exportacao.texto,/LOTE9996/);
  assert.doesNotMatch(exportacao.texto,/LOTE9999/);
});

test('interface filtra antes de conciliar, usa apenas dados elegíveis na cópia e XLS',()=>{
  assert.match(app,/const lista=filtrarMapasParaConferencia\(candidatos\)/);
  assert.match(app,/conciliarMapaComEstoque\(lista,saldos\)/);
  assert.match(app,/copiarProcfit\(filtrarMapasParaConferencia\(compareRows\)\)/);
  assert.match(app,/gerarConferenciaXls\(elegiveis\)/);
  assert.match(app,/apenas os mapas dos funcionários e a aba especial/);
  assert.match(sw,/registro-validades-v48-queima-so-novos-otimizada/);
  assert.match(sw,/filtro-conferencia-procfit\.js/);
});
