import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {montarListaProcfit, dataProcfit, copiarListaProcfit, CABECALHO_PROCFIT} from '../public/assets/procfit.js';
const app = readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const actions = readFileSync(new URL('../public/assets/icones-acoes.js',import.meta.url),'utf8');
const map = (overrides={})=>({codigoInterno:'97362',ean:'07898962711477',lote:'ABC123',validade:'2026-11-30',quantidade:2,...overrides});

test('Gera cabeçalho e colunas exatamente na ordem do Conector Procfit v1.0',()=>{
 const r=montarListaProcfit([map(),map({codigoInterno:'',ean:'07891234567890',lote:'LOTE02',validade:'2026-12-15',quantidade:1})]);
 assert.equal(r.texto, 'Código Interno\tEAN\tLote\tValidade\tQuantidade\r\n97362\t07898962711477\tABC123\t30/11/2026\t2\r\n\t07891234567890\tLOTE02\t15/12/2026\t1');
 assert.equal(r.total,2);
 assert.deepEqual(CABECALHO_PROCFIT,['Código Interno','EAN','Lote','Validade','Quantidade']);
});
test('Não converte EAN para número, mesmo quando começa com zero',()=>{
 const r=montarListaProcfit([map({ean:'00007898962711477',codigoInterno:''})]);
 assert.match(r.texto,/\r\n\t00007898962711477\t/);
});
test('Formata datas válidas ISO e brasileiras; rejeita datas impossíveis',()=>{
 assert.equal(dataProcfit('2028-02-29'),'29/02/2028');
 assert.equal(dataProcfit('29/2/2028'),'29/02/2028');
 assert.equal(dataProcfit('2027-02-29'),'');
 assert.equal(dataProcfit('2026-13-01'),'');
 assert.equal(dataProcfit('2026-11-30T00:00:00.000Z'),'30/11/2026');
});
test('Quantidade corrigida é preferida em conferência; não substitui saldo ausente por mapa',()=>{
 const r=montarListaProcfit([
  map({quantidadeMapa:9,quantidadeCorrigida:3,quantidade:9}),
  map({ean:'07890000000001',quantidadeCorrigida:0}),
  map({ean:'07890000000002',quantidadeCorrigida:null}),
 ],{corrigido:true});
 assert.equal(r.total,1);assert.match(r.texto,/ABC123\t30\/11\/2026\t3/);
 assert.deepEqual(r.ignorados,{zerados:1,semSaldo:1,invalidos:0,formulasEspeciais:0});
});
test('Registros com quantidade zero, inválida ou dados obrigatórios ausentes não são copiados',()=>{
 const r=montarListaProcfit([
  map({quantidade:0}),map({quantidade:-1}),map({lote:''}),map({validade:'2026-02-31'}),map({ean:'',codigoInterno:''}),map({quantidade:'1.5'}),map({quantidade:2})
 ]);
 assert.equal(r.total,1);assert.deepEqual(r.ignorados,{zerados:1,semSaldo:0,invalidos:5,formulasEspeciais:0});
});
test('Sanitiza tabulações e quebras de linha nos dados sem desalinhar o formato do Procfit',()=>{
 const r=montarListaProcfit([map({lote:'LOTE\tX\nY'})]);
 assert.equal(r.texto.split('\r\n')[1].split('\t').length,5);
 assert.match(r.texto,/LOTE X Y/);
});
test('Usa área de transferência do navegador',async()=>{
 let copiado='';
 await copiarListaProcfit('a\tb',{clipboard:{writeText: async t=>{copiado=t;}}});
 assert.equal(copiado,'a\tb');
});
test('Fallback copia via textarea e libera o elemento temporário',async()=>{
 let texto='',removed=false;
 const campo={value:'',style:{},setAttribute(){},focus(){},select(){},remove(){removed=true;}};
 const doc={createElement(){return campo;},body:{appendChild(x){assert.equal(x,campo);}},execCommand(action){assert.equal(action,'copy');texto=campo.value;return true;}};
 await copiarListaProcfit('1\t2',{clipboard:{writeText: async()=>{throw Error('Negado');}},documento:doc});
 assert.equal(texto,'1\t2');assert.ok(removed);
});
test('Interface só oferece cópia dos registros conciliados e filtrados, não do mapa normal',()=>{
 assert.doesNotMatch(app,/#map-copy-procfit/);
 assert.doesNotMatch(app,/copiarProcfit\(filtered\)/);
 assert.match(app,/prepararArquivoProcfit\(filtrarMapasParaConferencia\(compareRows\)\)/);
 assert.match(app,/prepararDadosProcfitTdb\(listaAtual,\{empresa:state\.loja/);
 assert.match(actions,/if\(has\('copiar','copy','procfit'\)\)return 'copy'/);
});
