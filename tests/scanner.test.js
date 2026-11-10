import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizarEAN,mensagemErroCamera} from '../public/assets/scanner.js';

test('scanner preserva os zeros à esquerda e aceita códigos de 8 a 14 dígitos',()=>{
  assert.equal(normalizarEAN('07891234567895'),'07891234567895');
  assert.equal(normalizarEAN('78912345'),'78912345');
  assert.equal(normalizarEAN('7891234567890'),'7891234567890');
  assert.equal(normalizarEAN(7891234567890),'7891234567890');
});
test('scanner rejeita caracteres extras, códigos curtos e leitura de QR não numérico',()=>{
  for(const x of ['abc12345678','1234567','123456789012345','https://example.org','12 345678',''])assert.equal(normalizarEAN(x),'');
});
test('permissões e problemas da câmera retornam instruções úteis',()=>{
  assert.match(mensagemErroCamera({name:'NotAllowedError'}),/Autorize/);
  assert.match(mensagemErroCamera({name:'NotFoundError'}),/Nenhuma câmera/);
  assert.match(mensagemErroCamera({name:'NotReadableError'}),/outro aplicativo/);
});
test('formulário compartilhado inclui botão de scanner e leitura não envia mapa automaticamente',()=>{
  const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(app,/id=\\?"scan-ean\\?"/);
  assert.match(app,/abrirScannerEAN\(\{input:f\.elements\.ean/);
  assert.match(app,/f\.querySelector\('#lookup-product'\)\?\.click\(\)/);
  assert.match(html,/id="ean-scanner-dialog"/);
  assert.match(html,/id="ean-scanner-view"/);
});
