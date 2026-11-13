import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mascararValidade, validadeParaISO } from '../public/assets/validade.js';

function digitar(sequencia){
  let valor='';
  const evolucao=[];
  for(const caractere of sequencia){
    valor=mascararValidade(valor+caractere);
    evolucao.push(valor);
  }
  return {valor,evolucao};
}

test('digitar 30/11 + ano sem digitar / gera DD/MM/AAAA automaticamente',()=>{
 const r=digitar('30112026');
 assert.deepEqual(r.evolucao,['3','30','30/1','30/11','30/11/2','30/11/20','30/11/202','30/11/2026']);
 assert.equal(validadeParaISO(r.valor),'2026-11-30');
});

test('ano de dois dígitos também entra direto após DD/MM',()=>{
 const r=digitar('301126');
 assert.equal(r.valor,'30/11/26');
 assert.equal(validadeParaISO(r.valor),'2026-11-30');
});

test('digitação com barra já presente entre dia e mês também inclui barra do ano',()=>{
 assert.equal(mascararValidade('30/112'),'30/11/2');
 assert.equal(mascararValidade('30/112026'),'30/11/2026');
 assert.equal(mascararValidade('30/11/2026'),'30/11/2026');
 assert.equal(mascararValidade('30112026'),'30/11/2026');
});

test('pode apagar o ano e digitá-lo novamente sem introduzir barras',()=>{
 let valor=digitar('30112026').valor;
 for(let i=0;i<4;i++)valor=mascararValidade(valor.slice(0,-1));
 assert.equal(valor,'30/11/');
 valor=mascararValidade(valor.slice(0,-1));
 assert.equal(valor,'30/11');
 valor=mascararValidade(valor+'2');
 assert.equal(valor,'30/11/2');
});

test('continua aceitando apenas mês/ano, inclusive 4 dígitos no ano',()=>{
 assert.equal(digitar('0126').valor,'01/26');
 assert.equal(mascararValidade('12/2026'),'12/2026');
 assert.equal(mascararValidade('1/26'),'1/26');
 assert.equal(validadeParaISO('01/26'),'2026-01-31');
 assert.equal(validadeParaISO('12/2026'),'2026-12-31');
});

test('campo do lançamento mantém entrada numérica com barras automáticas',()=>{
 const src=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
 assert.match(src,/id="launch-validade"[^>]*inputmode="numeric"/);
 assert.match(src,/validade\.value=mascararValidade\(old\)/);
 assert.match(src,/validadeParaISO\(f\.elements\.validade_digitada\.value\)/);
});
