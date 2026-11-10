import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hashPin } from '../api/index.js';

const apiSource=fs.readFileSync(new URL('../api/index.js',import.meta.url),'utf8');
const appSource=fs.readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const mainHtml=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/007_pin_administrador_geral.sql',import.meta.url),'utf8');

test('troca própria do Geral exige PIN atual, novo PIN, confirmação e sessão',()=>{
 assert.match(apiSource,/geral\(actor\);\s*const atual=/);
 assert.match(apiSource,/validarPin\(atual,actor\.pin_hash\)/);
 assert.match(apiSource,/pinNovo/);
 assert.match(apiSource,/confirmacao/);
 assert.match(apiSource,/p_sessao_hash:sessao\.token_hash/);
 assert.match(apiSource,/pathname==='\/conta\/pin'&&req\.method==='POST'/);
 assert.doesNotMatch(apiSource,/console\.log\(.*pinNovo/);
});
test('migração de PIN é atômica, restrita ao geral e mantém sessão atual',()=>{
 assert.match(migration,/SECURITY DEFINER/i);
 assert.match(migration,/perfil IS DISTINCT FROM 'geral'/i);
 assert.match(migration,/SET pin_hash=p_pin_hash/i);
 assert.match(migration,/token_hash<>p_sessao_hash/i);
 assert.match(migration,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/i);
});
test('Painel Geral contém botão e formulário exclusivo de troca própria',()=>{
 assert.match(appSource,/id="geral-change-pin"/);
 assert.match(appSource,/function abrirMeuPin\(\)/);
 assert.match(mainHtml,/id="meu-pin-dialog"/);
 assert.match(mainHtml,/name="pinAtual"/);
 assert.match(mainHtml,/name="pinNovo"/);
 assert.match(mainHtml,/name="confirmacao"/);
 assert.match(appSource,/if\(isGeral\(\)\)/);
});
test('PIN numérico continua com scrypt',()=>{
 const h=hashPin('123456');assert.match(h,/^scrypt\$/);
});
